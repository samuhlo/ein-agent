// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	createSddMemoryLifecycle,
	ensureApplyAcceptance,
	ensureApplyTurnBudget,
	ensurePlanningAcceptance,
	ensureSddPreflight,
	gateTddForDelegation,
	getSddPreflightPreferences,
	getSddSessionMemory,
	installSddAssets,
	isSddPreflightTrigger,
	prepareSddPhaseMemory,
	renderMemoryAdvisory,
	renderSddPreflightPrompt,
	sddGlobalAssetDriftCount,
	sddPreflightSessionKey,
	type MemoryPreparationLifecycle,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";
import {
	type DeliveryIntent,
	deliveryIntentActive,
	handleGitCommand,
	nextDeliveryIntent,
	readGitDeliveryMode,
} from "../lib/git-delivery.ts";
import {
	buildEinPrompt,
	handlePersonaCommand,
	readPersonaMode,
} from "../lib/persona.ts";
import {
	LANG_LABEL,
	artifactLanguageDirective,
	handleLangCommand,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { handleTddCommand } from "../lib/tdd.ts";
import { handleHypaCommand, maybeWrapBashInput } from "../lib/hypa.ts";
import { handleOnboardCommand, runOnboarding } from "../lib/onboarding.ts";
import {
	codegraphDirective,
	handleCodegraphCommand,
} from "../lib/codegraph.ts";
import { handleModeCommand, readMode } from "../lib/mode.ts";
import {
	confirmCommand,
	confirmDelegatedDelivery,
} from "../lib/guardrails.ts";
import {
	formatReconciliation,
	reconcilePhaseFailure,
	resolveDelegationPhase,
	snapshotPhaseArtifacts,
	type PhaseSnapshot,
} from "../lib/sdd-reconcile.ts";
import {
	SDD_AGENT_NAMES,
	SDD_AGENT_NAME_SET,
	applySavedModelConfig,
	modelConfigPath,
} from "../lib/model-config.ts";
import { handleModelsCommand } from "../lib/models-panel.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions";
import { lintChange, lintPhaseArtifact, type ChangeLintReport, type SddPhase } from "../lib/sdd-guardrails.ts";
import { aggregateSddBudget, formatSddPlanPreview, listActiveChanges, listActiveChangeSummaries, readSddRealCost, resolveChangesDir, resolveSddNext, resolveSddPlanPreview, resolveSddStatus, type SddChangeStatus, type SddNextReport, type SddRealCost } from "../lib/sdd-router.ts";
import { closeChange } from "../lib/sdd-close.ts";
import { approveCandidate, type MemoryCandidate, type MemoryReceipt } from "../lib/memory-contract.ts";
import {
	appendMemoryReceipt,
	buildCloseMemoryCandidate,
	hasSuccessfulMemoryReceipt,
	safeMemoryReceipt,
	saveAfterArtifactGate,
	type SafeMemoryReceipt,
} from "../lib/sdd-memory-save.ts";
import {
	codeConventionSkillBlock,
	migrateLegacyAtl,
	resolveSkillInjection,
} from "./ein-skill-registry.ts";
import { ensureEinGitignore } from "../lib/gitignore.ts";
import {
	einContextDirective,
	einMdCommitsBehind,
	einMdPath,
	handleInitCommand,
	readEinMd,
	writeEinMd,
} from "../lib/project-context.ts";
import { AGENT_DIR } from "./ein-paths";
import { readInstalledVersion, staleSessionNudge } from "../lib/session-version";
import { DOMAIN_ID_PATTERN, sha256 } from "../lib/openspec-spec-contract.ts";
import { synchronizeOpenSpecFilesystem } from "../lib/openspec-spec-sync-fs.ts";
import { evaluateStaging } from "../lib/git-staging.ts";
import { evaluateDeliveryGate, evaluatePostCommit, deliveryBoundaryFor, type DeliveryAttemptState } from "../lib/delivery-gate.ts";
import { evaluateCandidateReceiptRetirement, type CandidateReceiptRetirementIdentity, type NormalizedMergedPullRequestObservation } from "../lib/delivery-receipt.ts";
import { clearVerifiedDeliveryAttempt, emitCandidateReceipt, persistVerifiedDeliveryAttempt, readActiveCandidateReceiptEvidence, readVerifiedDeliveryAttempt, reportRetirementCleanup, resolveWorktreeIdentity, retireCandidateReceipt, suggestIntendedPaths } from "../lib/candidate-receipt.ts";
import { observeMergedPullRequest, resolveExplicitPushRemoteRepository } from "../lib/candidate-receipt-retirement-remote.ts";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Intención de entrega del usuario, por sesión. La fija el hook `input` y la
// lee el gate de entrega en `tool_call`.
// BLINDAJE -> en modo git `auto`, si el usuario pidió commit/push/PR, no se le
// vuelve a preguntar. Es PEGAJOSA con TTL: sobrevive a los mensajes neutros del
// mismo encargo (pegar un log de CI, "sigue") y solo cae con una negación
// explícita o al expirar. Antes se recalculaba en cada mensaje y se pisaba, así
// que un log pegado a mitad del trabajo revocaba en silencio el "haz push" de
// dos turnos antes y bloqueaba la delegación siguiente.
const deliveryIntentBySession = new Map<string, DeliveryIntent>();

// Foto del artefacto de fase justo ANTES de delegar, por toolCallId. La lee el
// hook `tool_result` para distinguir "la fase no se hizo" de "el runner falló
// por algo ajeno al trabajo". Sin la foto no se reconcilia nada: un artefacto
// preexistente no puede rescatar un run que no escribió nada.
const phaseSnapshotByToolCall = new Map<
	string,
	{ phase: SddPhase; before: PhaseSnapshot }
>();

// Intento de entrega verificada en curso, por sesión: el fingerprint del recibo
// que validó el pre-commit y, tras el post-commit, el head de entrega validado.
// Las cuatro fronteras del slice 04 son UNA secuencia — sin este estado, el
// pre-push no puede saber si la rama se movió desde que se validó el commit.
const deliveryAttemptBySession = new Map<string, DeliveryAttemptState>();
// Commits gateados a la espera de su comprobación post-commit (por toolCallId).
const pendingPostCommit = new Map<string, string>();

type RetirementToolParams = {
	change: string;
	receiptFingerprint: string;
	remote: string;
	baseRef: string;
	headRef: string;
	prNumber: number;
};

function rememberPhaseSnapshot(
	toolCallId: string,
	input: unknown,
	cwd: string,
): void {
	const phase = resolveDelegationPhase(input);
	if (!phase) return;
	phaseSnapshotByToolCall.set(toolCallId, {
		phase,
		before: snapshotPhaseArtifacts(cwd, phase),
	});
}
// Versión instalada al arrancar cada sesión + sesiones ya avisadas: si `ein
// update` corre a mitad de sesión, esta sigue con la plantilla vieja → nudge de
// reinicio (una vez).
const sessionStartVersion = new Map<string, string | null>();
const staleSessionNudged = new Set<string>();
type MemorySaveLifecycle = {
	save(candidate: MemoryCandidate): Promise<{ receipt: MemoryReceipt }>;
};
const memoryLifecycleBySession = new Map<string, MemoryPreparationLifecycle & MemorySaveLifecycle>();

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
}

function readAgentStartNames(event: unknown): string[] {
	return [
		readStringPath(event, ["agentName"]),
		readStringPath(event, ["agent"]),
		readStringPath(event, ["name"]),
		readStringPath(event, ["agent", "name"]),
		readStringPath(event, ["subagent", "name"]),
	]
		.filter((value): value is string => value !== undefined)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

function isSddAgentStartEvent(event: unknown): boolean {
	const candidates = readAgentStartNames(event);
	if (candidates.some((value) => SDD_AGENT_NAME_SET.has(value))) return true;

	const systemPrompt = readStringPath(event, ["systemPrompt"]) ?? "";
	return SDD_AGENT_NAMES.some((name) => {
		const phase = name.replace(/^sdd-/, "");
		return new RegExp(`\\bSDD ${phase} executor\\b`, "i").test(systemPrompt);
	});
}

function isNamedAgentStartEvent(event: unknown): boolean {
	return readAgentStartNames(event).length > 0;
}

function readMemoryLifecycle(ctx: ExtensionContext): MemoryPreparationLifecycle | undefined {
	const candidate = (ctx as unknown as { memoryLifecycle?: unknown }).memoryLifecycle;
	return typeof candidate === "object" && candidate !== null && "prepare" in candidate &&
		typeof (candidate as { prepare?: unknown }).prepare === "function"
		? candidate as MemoryPreparationLifecycle
		: undefined;
}

function memoryLifecycleForSession(ctx: ExtensionContext): MemoryPreparationLifecycle {
	const injected = readMemoryLifecycle(ctx);
	if (injected) return injected;
	const key = sddPreflightSessionKey(ctx);
	const existing = memoryLifecycleBySession.get(key);
	if (existing) return existing;
	const created = createSddMemoryLifecycle(ctx.cwd) as MemoryPreparationLifecycle & MemorySaveLifecycle;
	memoryLifecycleBySession.set(key, created);
	return created;
}

function readMemorySaveLifecycle(ctx: ExtensionContext): MemorySaveLifecycle | undefined {
	const candidate = (ctx as unknown as { memoryLifecycle?: unknown }).memoryLifecycle;
	return typeof candidate === "object" && candidate !== null && "save" in candidate &&
		typeof (candidate as { save?: unknown }).save === "function"
		? candidate as MemorySaveLifecycle
		: undefined;
}

function memorySaveLifecycleForSession(ctx: ExtensionContext): MemorySaveLifecycle {
	const injected = readMemorySaveLifecycle(ctx);
	if (injected) return injected;
	return memoryLifecycleForSession(ctx) as MemoryPreparationLifecycle & MemorySaveLifecycle;
}

function memorySaveEnabled(ctx: ExtensionContext): boolean {
	const prefs = getSddPreflightPreferences(ctx);
	return Boolean(prefs && prefs.engramAvailable && prefs.memoryMode === "engram");
}

function skippedMemoryReceipt(reason: MemoryReceipt["reason"]): MemoryReceipt {
	return {
		operation: "save",
		status: "skipped",
		reason,
		durationMs: 0,
		timestamp: new Date().toISOString(),
	};
}

function readExplicitSddChange(event: unknown): string | undefined {
	const direct = [
		readStringPath(event, ["change"]),
		readStringPath(event, ["input", "change"]),
	].find((value) => value !== undefined);
	if (direct && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(direct)) return direct;
	const task = readAgentTask(event);
	const match = /(?:openspec\/changes\/|\bchange\s*[:=]\s*)([a-z0-9]+(?:-[a-z0-9]+)*)\b/i.exec(task);
	return match?.[1];
}

function readAgentTask(event: unknown): string {
	const candidates = [
		readStringPath(event, ["task"]),
		readStringPath(event, ["prompt"]),
		readStringPath(event, ["userPrompt"]),
		readStringPath(event, ["input", "task"]),
		readStringPath(event, ["input", "prompt"]),
		readStringPath(event, ["message"]),
	].filter(
		(value): value is string =>
			typeof value === "string" && value.trim().length > 0,
	);
	if (candidates.length > 0) return candidates.join("\n");
	return readStringPath(event, ["systemPrompt"]) ?? "";
}

const CANONICAL_SPEC_MAX_FILES = 3;
const CANONICAL_SPEC_MAX_BYTES = 32 * 1024;

type CanonicalSpecReference = {
	path: string;
	sha256: string;
	bytes: number;
};

type CanonicalSpecContext = {
	status: "ok" | "blocked";
	references: CanonicalSpecReference[];
	message?: string;
};

function domainHints(text: string): string[] {
	const hints = [...text.matchAll(/(?:canonical_spec_domains|domain hints?)\s*:\s*([^\n]+)/gi)]
		.flatMap((match) => match[1].split(","))
		.map((value) => value.trim())
		.filter((value) => DOMAIN_ID_PATTERN.test(value));
	return [...new Set(hints)].sort((left, right) => left.localeCompare(right, "en"));
}

function scopeSpecReferences(scope: string): CanonicalSpecReference[] {
	const references = [...scope.matchAll(/- path: (openspec\/specs\/([a-z0-9]+(?:-[a-z0-9]+)*)\/spec\.md); sha256: ([a-f0-9]{64}); bytes: (\d+)/g)]
		.map((match) => ({ path: match[1], domain: match[2], sha256: match[3], bytes: Number(match[4]) }))
		.filter((reference) => DOMAIN_ID_PATTERN.test(reference.domain) && Number.isSafeInteger(reference.bytes) && reference.bytes >= 0)
		.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
	return [...new Map(references.map((reference) => [reference.path, reference])).values()]
		.sort((left, right) => left.path.localeCompare(right.path, "en"));
}

export function resolveCanonicalSpecContext(cwd: string, hints: readonly string[]): CanonicalSpecContext {
	const domains = [...new Set(hints.filter((hint) => DOMAIN_ID_PATTERN.test(hint)))].sort((left, right) => left.localeCompare(right, "en"));
	if (domains.length > CANONICAL_SPEC_MAX_FILES) {
		return { status: "blocked", references: [], message: "Canonical spec context exceeds 3 files; request a narrower canonical spec selection." };
	}

	const references: CanonicalSpecReference[] = [];
	let totalBytes = 0;
	for (const domain of domains) {
		const path = `openspec/specs/${domain}/spec.md`;
		const absolutePath = join(cwd, path);
		if (!existsSync(absolutePath)) continue;
		const bytes = readFileSync(absolutePath);
		totalBytes += bytes.length;
		if (totalBytes > CANONICAL_SPEC_MAX_BYTES) {
			return { status: "blocked", references: [], message: "Canonical spec context exceeds 32 KiB; request a narrower canonical spec selection." };
		}
		references.push({ path, sha256: sha256(bytes), bytes: bytes.length });
	}
	return { status: "ok", references };
}

function canonicalSpecPrompt(cwd: string, agent: "sdd-scope" | "sdd-design", task: string, change?: string): string {
	const changeDir = change ? join(resolveChangesDir(cwd), change) : undefined;
	const scope = agent === "sdd-design" && changeDir && existsSync(join(changeDir, "scope.md"))
		? readFileSync(join(changeDir, "scope.md"), "utf8")
		: "";
	const reused = scopeSpecReferences(scope);
	const mappedHints = agent === "sdd-design" && changeDir && existsSync(join(changeDir, "map.md"))
		? domainHints(readFileSync(join(changeDir, "map.md"), "utf8"))
		: [];
	const hints = agent === "sdd-design"
		? [...reused.map((reference) => reference.path.split("/")[2]), ...mappedHints]
		: domainHints(task);
	const context = resolveCanonicalSpecContext(cwd, hints);
	if (context.status === "blocked") {
		return `\n\n## Canonical OpenSpec context\nBLOCKED: ${context.message} Do not truncate or glob specs; request explicit narrower domain hints.`;
	}
	const referenceLines = context.references.map((reference) => `- path: ${reference.path}; sha256: ${reference.sha256}; bytes: ${reference.bytes}`);
	return `\n\n## Canonical OpenSpec context\nDomain hints: ${hints.join(", ") || "none"}\nRead only these exact canonical paths when needed; never glob domains or read .sdd specs. Record these references in ${agent === "sdd-scope" ? "scope.md" : "design.md"}:\n${referenceLines.join("\n") || "- none"}\nShared hard limit: ${CANONICAL_SPEC_MAX_FILES} files and ${CANONICAL_SPEC_MAX_BYTES} UTF-8 bytes per phase. If a requested selection exceeds it, block and request narrower explicit domain hints; never truncate.`;
}

// Devuelve true si `name` es un directorio existente en la raíz de cambios
// (openspec/changes/ o .sdd/changes/; ver resolveChangesDir en sdd-router).
function changeDirExists(cwd: string, name: string): boolean {
	const base = join(resolveChangesDir(cwd), name);
	try {
		return statSync(base).isDirectory();
	} catch {
		return false;
	}
}

const PHASE_BY_FILE: Record<string, SddPhase> = {
	"scope.md": "scope",
	"map.md": "map",
	"design.md": "design",
	"tasks.md": "tasks",
	"apply-progress.md": "apply",
	"verify-report.md": "verify",
	"summary.md": "close",
};

// Formatea un ChangeLintReport como salida legible para el comando /ein:sdd-check.
// La herramienta ein_sdd_check sigue devolviendo JSON (contrato del orquestador).
function formatChangeLint(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((p) => p.present);
	const total = phases.length;
	const presentCount = present.length;

	const lines: string[] = [
		`/// 000. SDD CHECK — ${change}`,
		"",
		`fases: ${presentCount}/${total} presentes  |  errores: ${errors}  |  warnings: ${warnings}`,
	];

	if (report.issues.length > 0) {
		lines.push("", "■ consistencia:");
		for (const i of report.issues) {
			lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
		}
	}

	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`■ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const icon = ok ? "OK" : "ERRORS";
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lineas` : "";
		lines.push(`■ ${phase} — ${icon} (presente${detail})`);
		if (pr!.issues.length > 0) {
			for (const i of pr!.issues) {
				lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
			}
		}
	}

	return lines.join("\n");
}

function compactBudget(budget: SddChangeStatus["budget"]): string {
	if (!budget.allocated && !budget.consumed) return "absent";
	return `allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`;
}

function compactTokens(n: number): string {
	return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

// El budget del ledger son tokens ESTIMADOS de lectura; esto es consumo real
// de inferencia leído de los meta.json de pi-subagents. Se muestran ambos para
// que "consumed≈9000" no esconda un flujo de 400k tokens reales.
function compactRealCost(realCost: SddRealCost): string[] {
	if (realCost.runs === 0) {
		return [`${t("sdd-status.real-cost", "real cost")}: ${t("sdd-status.real-cost-none", "no run metadata (.pi-subagents/artifacts)")}`];
	}
	const minutes = Math.round(realCost.durationMs / 60000);
	const lines = [
		`${t("sdd-status.real-cost", "real cost")}: ${realCost.runs} runs · in ${compactTokens(realCost.inputTokens)} · out ${compactTokens(realCost.outputTokens)} · $${realCost.costUsd.toFixed(2)} · ${minutes}min`,
	];
	if (realCost.byAgent.length > 0) {
		lines.push(`${t("sdd-status.real-cost-by-agent", "by agent")}: ${realCost.byAgent.map((entry) => `${entry.agent} ${compactTokens(entry.tokens)}`).join(" · ")}`);
	}
	return lines;
}

function formatSddStatus(
	status: SddChangeStatus,
	active: string[],
	realCost?: SddRealCost,
	prefs?: SddPreflightPreferences,
): string {
	const notebook = `optional project notebook: Engram ${prefs?.memoryMode ?? "off"}${prefs?.engramAvailable ? " (configured; no retrieval or save is implied)" : " (unavailable or not configured)"}; OpenSpec is the canonical full record.`;
	const lines = ["/// 000. SDD STATUS", ""];
	if (!status.change) {
		lines.push("- " + t("sdd-status.none", "No active SDD changes in openspec/changes/."));
		lines.push(`- ${notebook}`);
		return lines.join("\n");
	}

	const present = status.artifacts.present.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
	const missing = status.artifacts.missing.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
	lines.push(`${t("sdd-status.change", "change")}: ${status.change}`);
	if (active.length > 1) lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
	lines.push(`${t("sdd-status.current", "current phase")}: ${status.currentPhase}`);
	lines.push(`${t("sdd-status.next", "next")}: ${status.nextRecommended}`);
	lines.push(`${t("sdd-status.artifacts.present", "artifacts present")}: ${present}`);
	lines.push(`${t("sdd-status.artifacts.missing", "artifacts missing")}: ${missing}`);
	lines.push(`${t("sdd-status.apply", "apply")}: ${status.apply}`);
	lines.push(`${t("sdd-status.verify", "verify")}: ${status.verify}`);
	lines.push(`${t("sdd-status.tasks", "tasks")}: status=${status.tasks.status ?? "absent"} · ready=${status.tasks.counts.ready} · blocked=${status.tasks.counts.blocked} · pending=${status.tasks.counts.pending} · done=${status.tasks.counts.done}`);
	// Punto de reanudación del apply por grupos: sobrevive a reabrir Pi.
	if (status.tasks.nextPending) lines.push(`${t("sdd-status.next-pending", "next pending")}: ${status.tasks.nextPending.id} ${status.tasks.nextPending.title}`);
	if (status.tasks.blockedBy) lines.push(`${t("sdd-status.blocked-by", "blocked_by")}: ${status.tasks.blockedBy}`);
	lines.push(`${t("sdd-status.budget", "budget")}: ${compactBudget(status.budget)}`);
	lines.push(notebook);
	if (realCost) lines.push(...compactRealCost(realCost));

	const problems = [...status.tasks.problems, ...status.budget.problems, ...(realCost?.problems ?? [])];
	if (status.blocked.length || problems.length) {
		lines.push("", `■ ${t("sdd-status.blocked", "blockers")}:`);
		for (const b of status.blocked) lines.push(`- ${b}`);
		for (const p of problems) lines.push(`- ${p}`);
	}
	return lines.join("\n");
}

function parseSddNextArgs(args: string | string[]): { change: string | null; auto: boolean } {
	const raw = typeof args === "string" ? args : Array.isArray(args) ? args.join(" ") : "";
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	const auto = parts.includes("--auto");
	const change = parts.filter((part) => part !== "--auto")[0] ?? null;
	return { change, auto };
}

function formatSddNextHelp(): string {
	return [
		"/// 000. SDD NEXT",
		"",
		"Uso: /ein:sdd-next <change> [--auto]",
		"",
		"- Muestra el siguiente paso recomendado para un cambio concreto.",
		"- No elige un cambio activo implicitamente.",
		"- --auto es dry-run en esta version: no ejecuta fases.",
	].join("\n");
}

function formatSddNext(report: SddNextReport): string {
	const lines = [
		"/// 000. SDD NEXT",
		"",
		`cambio: ${report.change ?? "ninguno"}`,
		`modo: ${report.mode}`,
		`fase actual: ${report.currentPhase}`,
		`siguiente recomendado: ${report.nextRecommended}`,
		`razon: ${report.reason}`,
		`accion sugerida: ${report.suggestedAction}`,
	];

	if (report.mode === "auto") {
		lines.push("", "■ dry-run: --auto fue reconocido, pero autoEnabled=false; no ejecute fases ni delegaciones.");
	}
	if (report.blocked.length > 0) {
		lines.push("", "■ revisar antes de avanzar:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	async function runSddPreflight(ctx: ExtensionContext): Promise<SddPreflightPreferences> {
		const preferences = await ensureSddPreflight(ctx, {
			pi,
			memoryLifecycle: memoryLifecycleForSession(ctx),
			installAssets: (cwd) => installSddAssets(cwd, false),
			applyModelConfig: async () => applySavedModelConfig(ctx),
		});
		bootstrapOpenSpecConfig(ctx.cwd);
		return preferences;
	}

	async function saveCheckedPhaseMemory(
		ctx: ExtensionContext,
		change: string,
		phase: unknown,
		candidateInput: unknown,
	): Promise<SafeMemoryReceipt> {
		return saveAfterArtifactGate({
			artifactClean: true,
			change,
			phase,
			candidate: candidateInput,
			enabled: memorySaveEnabled(ctx),
			save: (candidate) => memorySaveLifecycleForSession(ctx).save(candidate),
		});
	}

	async function saveArchivedCloseMemory(
		ctx: ExtensionContext,
		change: string,
		archiveDir: string,
	): Promise<SafeMemoryReceipt> {
		let summary = "";
		try {
			summary = readFileSync(join(archiveDir, "summary.md"), "utf8");
		} catch {
			return safeMemoryReceipt(skippedMemoryReceipt("artifact_gate_failed"), `sdd:${change}:close`);
		}
		if (lintPhaseArtifact("close", summary).errors > 0) {
			return safeMemoryReceipt(skippedMemoryReceipt("artifact_gate_failed"), `sdd:${change}:close`);
		}
		const candidate = buildCloseMemoryCandidate(change);
		const approved = approveCandidate(candidate).approved;
		if (!approved) return safeMemoryReceipt(skippedMemoryReceipt("invalid_candidate"), `sdd:${change}:close`);
		if (hasSuccessfulMemoryReceipt(archiveDir, approved.topic, approved.digest)) {
			return safeMemoryReceipt({
				...skippedMemoryReceipt("duplicate"),
				topic: approved.topic,
				digest: approved.digest,
			}, `sdd:${change}:close`);
		}
		if (!memorySaveEnabled(ctx)) return safeMemoryReceipt(skippedMemoryReceipt("memory_disabled"), `sdd:${change}:close`);
		try {
			return safeMemoryReceipt((await memorySaveLifecycleForSession(ctx).save(candidate)).receipt, `sdd:${change}:close`);
		} catch {
			return safeMemoryReceipt({
				...skippedMemoryReceipt("spawn_error"),
				status: "failed",
			}, `sdd:${change}:close`);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		// Higiene del proyecto: un único bloque gestionado en .gitignore y
		// limpieza del antiguo .atl/ (ahora .pi/ein/atl/). Best-effort, no rompe.
		ensureEinGitignore(ctx.cwd);
		migrateLegacyAtl(ctx.cwd);
		try {
			const installResult = installSddAssets(ctx.cwd, false);
			const modelResult = await applySavedModelConfig(ctx);
			if (ctx.hasUI && modelResult.invalidPath) {
				ctx.ui.notify(
					tf(
						"ai.models.invalid",
						`Ein omitio la config de modelos: ${modelResult.invalidPath} no es JSON valido. Corrigelo o eliminalo y vuelve a ejecutar /ein:models.`,
						modelResult.invalidPath,
					),
					"warning",
				);
				return;
			}
			if (ctx.hasUI && modelResult.updated > 0) {
				ctx.ui.notify(
					tf(
						"ai.models.applied",
						`Config de modelos aplicada a ${modelResult.updated} agente(s). Assets SDD listos: ${installResult.agents} agente(s), ${installResult.chains} chain(s), ${installResult.support} soporte.`,
						modelResult.updated,
						installResult.agents,
						installResult.chains,
						installResult.support,
					),
					"info",
				);
			}
		} catch (error) {
			if (ctx.hasUI) {
				const message =
					error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					tf("ai.models.error", `Error al aplicar config de modelos: ${message}`, message),
					"warning",
				);
			}
		}
		// Onboarding first-run: si faltan esenciales (persona/lang/tdd/hypa/EIN.md)
		// el wizard los resuelve. No-op sin UI o si ya está todo configurado.
		await runOnboarding(ctx);
	});

	pi.on("input", async (event, ctx) => {
		// Intención de entrega: ¿este mensaje pide commit/push/PR? La lee el gate de
		// entrega en `tool_call` (modo git `auto`). Se evalúa SIEMPRE, también en
		// mensajes sin SDD; un mensaje neutro la conserva en vez de pisarla.
		if (typeof event.text === "string") {
			const key = sddPreflightSessionKey(ctx);
			deliveryIntentBySession.set(
				key,
				nextDeliveryIntent(deliveryIntentBySession.get(key), event.text),
			);
		}
		if (typeof event.text !== "string" || !isSddPreflightTrigger(event.text)) {
			return { action: "continue" };
		}
		await runSddPreflight(ctx);
		// El gate de TDD ya no vive aquí: se dispara en tool_call ante CUALQUIER
		// delegación que escriba código (sdd-apply directo o dentro de un chain),
		// no solo en el trigger SDD explícito. Así un cambio de código ad-hoc
		// también pregunta, y el flujo SDD explícito no pregunta dos veces.
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		if (isSddAgent) await runSddPreflight(ctx);
		const prefs = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		const mappedAgent = startNames.find((name) =>
			name === "sdd-map" || name === "sdd-design" || name === "sdd-apply" || name === "sdd-verify",
		);
		const memory = await prepareSddPhaseMemory({
			cwd: ctx.cwd,
			agentName: mappedAgent,
			explicitChange: readExplicitSddChange(event),
			memory: memoryLifecycleForSession(ctx),
			sessionKey: sddPreflightSessionKey(ctx),
			enabled: Boolean(prefs && prefs.engramAvailable && prefs.memoryMode === "engram"),
		});
		const memoryPrompt = renderMemoryAdvisory(
			memory ?? (!isNamedAgent && !isSddAgent ? getSddSessionMemory(ctx) : undefined),
		);
		// Convenciones de codigo (comment/logging/file-naming): SOLO donde se
		// escribe codigo — el parent (trabajo inline) y sdd-apply. Inyectarlas en
		// delivery/linear/map solo hacia que el modelo barato leyera 3 SKILL.md
		// inutiles (gasto de tokens) sin escribir codigo. Tambien gobierna si la
		// linea de Strict TDD entra en el preflight: solo donde hay RED/GREEN real.
		const isParent = !isNamedAgent && !isSddAgent;
		// Nudge de sesión obsoleta: solo la sesión padre interactiva. Registra la
		// versión al primer turno; si cambia después (un `ein update` a mitad de
		// sesión), avisa una vez de reiniciar — esta sesión no cargará la plantilla
		// nueva hasta un Pi fresco.
		if (isParent && ctx.hasUI) {
			const sessKey = sddPreflightSessionKey(ctx);
			const current = readInstalledVersion(join(AGENT_DIR, ".ein-install.json"));
			if (!sessionStartVersion.has(sessKey)) {
				sessionStartVersion.set(sessKey, current);
			} else {
				const decision = staleSessionNudge({
					startVersion: sessionStartVersion.get(sessKey) ?? null,
					currentVersion: current,
					alreadyNudged: staleSessionNudged.has(sessKey),
				});
				if (decision.nudge) {
					staleSessionNudged.add(sessKey);
					ctx.ui.notify(
						`Ein se actualizó a v${decision.version} durante esta sesión — sigue con la plantilla anterior. Reinicia Pi (o abre una sesión nueva) para cargar los cambios.`,
						"warning",
					);
				}
			}
		}
		const writesCode = isParent || startNames.includes("sdd-apply");
		const sddPrompt =
			prefs && (!isNamedAgent || isSddAgent)
				? `\n\n${renderSddPreflightPrompt(prefs, { includeTdd: writesCode, includeBaseline: isParent })}`
				: "";
		const einPrompt = isNamedAgent || isSddAgent
			? ""
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd), readChatLang(), readMode(ctx.cwd))}`;
		// Inyección determinista de skills: subagentes de fase/nombrados reciben
		// paths exactos de SKILL.md resueltos desde su task, no a criterio del
		// modelo padre (evita que el padre "invente" qué skills existen).
		let skillsPrompt = "";
		if (isNamedAgent || isSddAgent) {
			const block = resolveSkillInjection(ctx.cwd, readAgentTask(event));
			if (block) skillsPrompt = `\n\n${block}`;
		}
		// Idioma de artefactos: los agentes de delivery (PR/commits/Linear) reciben
		// la directiva autoritativa segun .pi/ein/lang.json (o el idioma de chat).
		let artifactPrompt = "";
		if (isNamedAgent && startNames.some((n) => n === "ein-git" || n === "ein-linear")) {
			artifactPrompt = `\n\n${artifactLanguageDirective(readArtifactLang(ctx.cwd))}`;
		}
		const conventions = writesCode ? codeConventionSkillBlock(ctx.cwd) : "";
		const conventionsPrompt = conventions ? `\n\n${conventions}` : "";
		// Contexto de proyecto (EIN.md): verdad de base para el parent y las fases
		// SDD; los agentes de delivery (PR/Linear) no lo necesitan.
		const wantsContext = !isNamedAgent || isSddAgent;
		const context = wantsContext ? einContextDirective(ctx.cwd) : "";
		const contextPrompt = context ? `\n\n${context}` : "";
		const canonicalAgent = startNames.includes("sdd-scope")
			? "sdd-scope"
			: startNames.includes("sdd-design")
				? "sdd-design"
				: undefined;
		const canonicalSpecContext = canonicalAgent
			? canonicalSpecPrompt(ctx.cwd, canonicalAgent, readAgentTask(event), readExplicitSddChange(event))
			: "";
		// Codegraph: mismo público que EIN.md (parent + fases SDD). La directiva
		// es "" salvo binario + índice presentes — sin codegraph, cero tokens.
		const codegraph = wantsContext ? codegraphDirective(ctx.cwd) : "";
		const codegraphPrompt = codegraph ? `\n\n${codegraph}` : "";
		return {
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${memoryPrompt ? `\n\n${memoryPrompt}` : ""}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}${canonicalSpecContext}${codegraphPrompt}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		// Delegaciones con push: el usuario confirma aquí (sesión con UI) y se
		// emite el grant one-shot que el guard headless del subagente consume.
		if (event.toolName === "subagent") {
			// Fases de planificación (scope/map/design/tasks/close): inyecta
			// `acceptance: none` determinista si el orquestador no lo pasó. Sin esto
			// el runner infiere un nivel con forma de código y rechaza en falso un
			// artefacto documental que `ein_sdd_check` ya valida.
			ensurePlanningAcceptance(event.input);
			// Apply ejecuta: por defecto `acceptance: none` (sdd-verify es el gate) y
			// un `turnBudget` backstop contra thrashing. El orquestador puede pasar
			// `acceptance`/`turnBudget` explícitos y se respetan.
			ensureApplyAcceptance(event.input);
			ensureApplyTurnBudget(event.input);
			// Gate de TDD ante una delegación que escribe código (sdd-apply directo
			// o dentro de un chain). En modo global "ask": si el orquestador clasificó
			// el cambio (hint tdd off/strict) se fija sin preguntar; si no, pregunta.
			// Así un mover/renombrar/config marcado off no interrumpe el flujo.
			await gateTddForDelegation(event.input, ctx);
			// Foto del artefacto de fase ANTES de delegar. Si el run acaba en ✗, el
			// hook `tool_result` compara y decide si la fase se hizo igualmente.
			rememberPhaseSnapshot(event.toolCallId, event.input, ctx.cwd);
			return confirmDelegatedDelivery(event.input, ctx, {
				mode: readGitDeliveryMode(ctx.cwd),
				userRequested: deliveryIntentActive(
					deliveryIntentBySession.get(sddPreflightSessionKey(ctx)),
				),
			});
		}
		if (event.toolName !== "bash") return undefined;
		if (!isRecord(event.input) || typeof event.input.command !== "string")
			return undefined;
		// GUARD primero sobre el comando ORIGINAL; solo si pasa se envuelve con
		// Hypa. Mutar después preserva la política de seguridad sin evaluarla
		// sobre un comando ya reescrito.
		const guard = await confirmCommand(event.input.command, ctx);
		if (guard) return guard;
		// Pathspec cerrado: un commit contiene lo que se decidió entregar, no lo
		// que hubiera en el árbol. Bloquea el staging a granel y el arrastre de
		// untracked ajenos. Determinista y sin confirmación: la salida es nombrar
		// las rutas, que es exactamente lo que debería hacerse.
		const staging = evaluateStaging(ctx.cwd, event.input.command);
		if (staging.kind === "blocked") return { block: true, reason: staging.reason };
		// Puerta de entrega (slice 04): si hay un recibo y este comando toca sus
		// ficheros, lo entregado debe ser EXACTAMENTE lo verificado. Determinista
		// aquí, no una frase en el prompt de ein-git que se pueda olvidar.
		const sessionKey = sddPreflightSessionKey(ctx);
		const gate = evaluateDeliveryGate(ctx.cwd, event.input.command, deliveryAttemptBySession.get(sessionKey));
		deliveryAttemptBySession.set(sessionKey, gate.attempt);
		if (gate.verdict.kind === "blocked") return { block: true, reason: gate.verdict.reason };
		// Un commit que pasó el pre-commit debe revalidarse DESPUÉS: los hooks de
		// git pueden reescribir el árbol entre la validación y el objeto final.
		if (deliveryBoundaryFor(event.input.command) === "pre-commit" && gate.attempt?.receiptFingerprint) {
			pendingPostCommit.set(event.toolCallId, sessionKey);
		}
		maybeWrapBashInput(event.input as { command: string }, ctx.cwd);
		return undefined;
	});

	// El artefacto manda sobre el veredicto del runner. Un ✗ puede venir de algo
	// que no dice nada del trabajo (tool ausente en la allowlist, respuesta final
	// vacía, timeout en la lectura final) con la fase YA entregada. Sin esto el
	// orquestador repetía una fase completa y pagaba dos veces.
	pi.on("tool_result", (event, ctx) => {
		// Frontera POST-COMMIT: el commit ya corrió y sus hooks también.
		const postCommitSession = pendingPostCommit.get(event.toolCallId);
		if (postCommitSession) {
			pendingPostCommit.delete(event.toolCallId);
			// Un commit que FALLÓ no produjo árbol que comprobar. Validar aquí
			// sustituiría el error real de git por uno de identidad —tapando la
			// causa— y actualizaría el intento a partir de algo que no ocurrió.
			if (event.isError) {
				deliveryAttemptBySession.set(postCommitSession, undefined);
				return undefined;
			}
			const outcome = evaluatePostCommit(ctx.cwd, deliveryAttemptBySession.get(postCommitSession));
			deliveryAttemptBySession.set(postCommitSession, outcome.attempt);
			if (outcome.attempt?.validatedDeliveryHead) {
				const persisted = persistVerifiedDeliveryAttempt(ctx.cwd, outcome.attempt);
				if (!persisted.ok) {
					deliveryAttemptBySession.delete(postCommitSession);
					return { isError: true, content: [{ type: "text", text: persisted.reason }] };
				}
			}
			if (outcome.verdict.kind === "blocked") {
				return { isError: true, content: [{ type: "text", text: outcome.verdict.reason }] };
			}
		}
		if (event.toolName !== "subagent") return undefined;
		// Se libera SIEMPRE, falle o no: si solo se borrase en la rama de fallo,
		// cada delegación exitosa dejaría su foto ahí para toda la sesión.
		const snapshot = phaseSnapshotByToolCall.get(event.toolCallId);
		phaseSnapshotByToolCall.delete(event.toolCallId);
		if (!snapshot || !event.isError) return undefined;
		const result = reconcilePhaseFailure(ctx.cwd, snapshot.phase, snapshot.before);
		if (!result.reconciled) return undefined;
		const originalError = event.content
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("\n");
		return {
			isError: false,
			content: [
				{ type: "text", text: formatReconciliation(result, originalError) },
			],
		};
	});

	pi.registerCommand("ein:ai:install-sdd", {
		description: t(
			"cmd.install-sdd.description",
			"Reinstalar o refrescar los agentes y chains SDD globales de Ein",
		),
		handler: async (args, ctx) => {
			const force = args.includes("--force");
			const result = installSddAssets(ctx.cwd, force);
			ctx.ui.notify(
				tf(
					"ai.sdd.installed",
					`Assets SDD: ${result.agents} agente(s), ${result.chains} chain(s), ${result.support} soporte disponibles (${result.installed} instalados, ${result.skipped} ya presentes).`,
					result.agents,
					result.chains,
					result.support,
					result.installed,
					result.skipped,
				),
				"info",
			);
		},
	});

	pi.registerCommand("ein:ai:sdd-preflight", {
		description: t(
			"cmd.sdd-preflight.description",
			"Ejecutar o reutilizar el preflight SDD para esta sesion de Pi",
		),
		handler: async (_args, ctx) => {
			await runSddPreflight(ctx);
		},
	});

	pi.registerCommand("ein:models", {
		description: t(
			"cmd.models.description",
			"Ver o configurar los modelos activos por agente en Ein",
		),
		handler: async (_args, ctx) => {
			await handleModelsCommand(ctx);
		},
	});


	pi.registerCommand("ein:persona", {
		description: t(
			"cmd.persona.description",
			"Cambiar la persona de Ein entre samuhlo y neutral",
		),
		handler: async (_args, ctx) => {
			await handlePersonaCommand(ctx);
		},
	});

	pi.registerCommand("ein:lang", {
		description: t(
			"cmd.lang.description",
			"Ver o cambiar el idioma de Ein (conversación/UI y artefactos PR/commit/Linear)",
		),
		handler: async (_args, ctx) => {
			await handleLangCommand(ctx);
		},
	});

	pi.registerCommand("ein:tdd", {
		description: t(
			"cmd.tdd.description",
			"Ver o cambiar el modo de TDD estricto (auto/strict/off/ask)",
		),
		handler: async (_args, ctx) => {
			await handleTddCommand(ctx);
		},
	});

	pi.registerCommand("ein:git", {
		description: t(
			"cmd.git.description",
			"Ver o cambiar la confirmación de entrega git (auto/ask/off)",
		),
		handler: async (_args, ctx) => {
			await handleGitCommand(ctx);
		},
	});

	pi.registerCommand("ein:hypa", {
		description: t(
			"cmd.hypa.description",
			"Ver o cambiar la compresión de salida de comandos con Hypa (auto/on/off)",
		),
		handler: async (_args, ctx) => {
			await handleHypaCommand(ctx);
		},
	});

	pi.registerCommand("ein:codegraph", {
		description: t(
			"cmd.codegraph.description",
			"Ver o cambiar el grafo de código (codegraph) del proyecto (auto/off)",
		),
		handler: async (_args, ctx) => {
			await handleCodegraphCommand(ctx);
		},
	});

	pi.registerCommand("ein:onboard", {
		description: t(
			"cmd.onboard.description",
			"Reconfigurar los esenciales del proyecto (persona, idioma, TDD, Hypa, EIN.md)",
		),
		handler: async (_args, ctx) => {
			await handleOnboardCommand(ctx);
		},
	});

	pi.registerCommand("ein:mode", {
		description: t(
			"cmd.mode.description",
			"Ver o cambiar el modo de trabajo (solo/team): Linear opcional",
		),
		handler: async (_args, ctx) => {
			await handleModeCommand(ctx);
		},
	});

	pi.registerCommand("ein:init", {
		description: t(
			"cmd.init.description",
			"Generar o refrescar EIN.md (contexto de proyecto: comandos, arquitectura, convenciones)",
		),
		handler: async (_args, ctx) => {
			await handleInitCommand(ctx);
		},
	});

	pi.registerCommand("ein:resume", {
		description: t(
			"cmd.resume.description",
			"Listar sesiones recientes con el comando para recuperarlas",
		),
		handler: async (_args, ctx) => {
			const sessions = listRecentSessions(8);
			const lines: string[] = [t("resume.title", "/// 000. SESIONES RECIENTES"), ""];
			if (!sessions.length) {
				lines.push(t("resume.none", "- No hay sesiones guardadas todavia."));
			} else {
				lines.push(
					t(
						"resume.shortcuts",
						"- Atajos: `pi -c` (continuar ultima) · `pi -r` (elegir sesion)",
					),
				);
				lines.push("");
				for (const s of sessions) {
					lines.push(`- ${s.project} (${humanizeAge(s.ageMs)})`);
					lines.push(`  pi --session ${s.id}`);
				}
			}
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// [DEPRECATED] ein:sdd-check queda como alias del canónico ein:sdd-audit.
	// El handler es compartido para que ambos resuelvan al mismo flujo.
	async function handleSddAudit(args: string | string[], ctx: ExtensionContext) {
		const raw = typeof args === "string" ? args : Array.isArray(args) ? args.join(" ") : "";
		const arg = raw.trim();

		if (!arg) {
			const status = resolveSddStatus(ctx.cwd);
			if (!status.change) {
				ctx.ui.notify(
					"No hay cambio activo. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>",
					"warning",
				);
				return;
			}
			const report = lintChange(ctx.cwd, status.change);
			ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
			return;
		}

		const candidatePath = arg.startsWith("/") ? arg : join(ctx.cwd, arg);
		if (existsSync(candidatePath)) {
			const fileName = candidatePath.split("/").pop() ?? "design.md";
			const phase = PHASE_BY_FILE[fileName] ?? "design";
			const report = lintPhaseArtifact(phase, readFileSync(candidatePath, "utf8"));
			const rel = candidatePath.startsWith(ctx.cwd)
				? candidatePath.slice(ctx.cwd.length + 1)
				: candidatePath;
			const status = report.errors
				? "FAIL"
				: report.warnings
					? "OK_WITH_WARNINGS"
					: "OK";
			const out: string[] = [
				`/// 000. SDD ${phase.toUpperCase()} CHECK`,
				"",
				`${phase}: ${rel}`,
				`resultado: ${status}  |  errores: ${report.errors}  |  warnings: ${report.warnings}  |  lineas: ${report.lineCount}`,
			];
			if (report.issues.length) {
				out.push("");
				for (const i of report.issues) {
					out.push(`- ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
				}
			} else {
				out.push("", `- ${phase} limpio: señales obligatorias presentes, sin placeholders criticos.`);
			}
			ctx.ui.notify(out.join("\n"), report.errors ? "warning" : "info");
			return;
		}

		if (changeDirExists(ctx.cwd, arg)) {
			const report = lintChange(ctx.cwd, arg);
			ctx.ui.notify(formatChangeLint(report), report.errors ? "warning" : "info");
			return;
		}

		ctx.ui.notify(
			`No encontre '${arg}' como path ni como cambio en openspec/changes/. Uso: /ein:sdd-audit <change>  |  /ein:sdd-audit <path-to-design.md>`,
			"warning",
		);
	}

	pi.registerCommand("ein:sdd-audit", {
		description: t("cmd.sdd-audit.description", "Validate a change (all phases) or lint a design.md path"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	pi.registerCommand("ein:sdd-check", {
		description: t("cmd.sdd-check.description", "[legacy] Use /ein:sdd-audit"),
		handler: async (args, ctx) => handleSddAudit(args, ctx),
	});

	// ── Tool determinista: estado SDD (lo llama el ORQUESTADOR para enrutar) ──
	pi.registerTool({
		name: "ein_sdd_status",
		label: "Ein SDD Status",
		description:
			"Deterministic SDD state for the active change (or a named one): which phase artifacts exist, verify outcome, and the nextRecommended phase. Returns a compact human-readable summary — route the SDD flow by the `next:` line, never by guessing. Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: { change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." } },
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const status = resolveSddStatus(ctx.cwd, params?.change);
			const active = listActiveChanges(ctx.cwd);
			const realCost = status.change ? readSddRealCost(ctx.cwd, status.change) : undefined;
			const prefs = getSddPreflightPreferences(ctx);
			let text = formatSddStatus(status, active, realCost, prefs);
			// En la ventana de apply, adjunta el preview determinista del plan
			// (grupos + ficheros de producción + verify) para el brief docente
			// pre-apply — "qué se toca" con hechos, no la paráfrasis del modelo.
			const plan = status.nextRecommended === "apply" && status.change
				? resolveSddPlanPreview(ctx.cwd, status.change)
				: undefined;
			if (plan) {
				const block = formatSddPlanPreview(plan);
				if (block) text += `\n\n${block}`;
			}
			return { content: [{ type: "text", text }], details: { status, activeChanges: active, realCost, plan } };
		},
	});

	// ── Tool determinista: gatekeeper de artefactos de un cambio ──
	pi.registerTool({
		name: "ein_sdd_check",
		label: "Ein SDD Check",
		description:
			"Deterministic gatekeeper: lint every present SDD artifact of a change (sections, required signals like verify's status line, placeholders, size). Run it AFTER each phase before advancing. Returns a compact per-phase summary (OK/ERRORS + issues). Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				phase: { type: "string", enum: ["scope", "map", "design", "tasks", "apply", "verify"] },
				memoryCandidate: { type: "object", description: "Optional concise structured notebook candidate after a clean artifact gate." },
			},
		} as const,
		async execute(_id, params: { change?: string; phase?: string; memoryCandidate?: unknown }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: "/// SDD CHECK — no active change in openspec/changes/." }], details: { ok: false, reason: "no active change" } };
			}
			const report = lintChange(ctx.cwd, change);
			const phaseReport = params?.phase
				? report.phases.find((entry) => entry.phase === params.phase)
				: undefined;
			const candidateHasCleanArtifact = Boolean(phaseReport?.present && phaseReport.report?.errors === 0);
			if (report.errors > 0 || (params?.memoryCandidate !== undefined && !candidateHasCleanArtifact)) {
				const memory = safeMemoryReceipt(skippedMemoryReceipt("artifact_gate_failed"), `sdd:${change}:gate`);
				appendMemoryReceipt(join(resolveChangesDir(ctx.cwd), change), memory);
				Object.assign(report, { memory });
				return { content: [{ type: "text", text: formatChangeLint(report) }], details: report };
			}
			const memory = await saveCheckedPhaseMemory(ctx, change, params?.phase, params?.memoryCandidate);
			appendMemoryReceipt(join(resolveChangesDir(ctx.cwd), change), memory);
			Object.assign(report, { memory });
			return { content: [{ type: "text", text: formatChangeLint(report) }], details: report };
		},
	});

	pi.registerCommand("ein:sdd-status", {
		description: t("cmd.sdd-status.description", "Estado SDD determinista del cambio activo o nombrado (fase, tareas, budget)"),
		handler: async (args, ctx) => {
			const raw = typeof args === "string" ? args : Array.isArray(args) ? args.join(" ") : "";
			const change = raw.trim() || undefined;
			const s = resolveSddStatus(ctx.cwd, change);
			const active = listActiveChanges(ctx.cwd);
			const realCost = s.change ? readSddRealCost(ctx.cwd, s.change) : undefined;
			ctx.ui.notify(formatSddStatus(s, active, realCost), s.blocked.length ? "warning" : "info");
		},
	});

	pi.registerCommand("ein:sdd-next", {
		description: t("cmd.sdd-next.description", "Show the next recommended SDD step for a named change without executing it"),
		handler: async (args, ctx) => {
			const parsed = parseSddNextArgs(args);
			if (!parsed.change) {
				ctx.ui.notify(formatSddNextHelp(), "info");
				return;
			}

			const report = resolveSddNext(ctx.cwd, parsed.change, { auto: parsed.auto });
			ctx.ui.notify(formatSddNext(report), report.exists && report.blocked.length === 0 ? "info" : "warning");
		},
	});

	// ── SDD close (canonical) ──────────────────────────────────────────────────
	// Lógica compartida por el comando /ein:sdd-close y el tool ein_sdd_close: el
	// move determinista (con guard de readiness) + memoria de cierre + refresco de
	// EIN.md. Un único punto para que ambas superficies se comporten igual.
	async function performSddClose(ctx: ExtensionContext, change: string, force: boolean, reason?: string) {
		const result = closeChange(ctx.cwd, change, { force, legacyReason: reason });
		let memory: SafeMemoryReceipt | undefined;
		if (result.ok) {
			memory = await saveArchivedCloseMemory(ctx, change, result.to);
			appendMemoryReceipt(result.to, memory);
			// FORGE -> al cerrar un cambio, refresca la zona AUTO de EIN.md (comandos/
			// estructura/docs) para que el índice no envejezca. Solo si ya existe: el
			// cierre no es momento de crearlo (eso es /ein:init o el onboarding).
			if (existsSync(einMdPath(ctx.cwd))) writeEinMd(ctx.cwd);
		}
		return { result, memory };
	}

	async function handleSddClose(args: string | string[], ctx: ExtensionContext) {
		const raw = typeof args === "string" ? args : Array.isArray(args) ? args.join(" ") : "";
		const force = /(?:^|\s)--force(?:\s|$)/.test(raw);
		const reason = /(?:^|\s)--reason\s+(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(raw)?.slice(1).find((value) => value !== undefined);
		const change = raw
			.replace(/(?:^|\s)--force(?=\s|$)/g, " ")
			.replace(/(?:^|\s)--reason(?:\s+(?:"[^"]*"|'[^']*'|\S+))?/g, " ")
			.trim() || resolveSddStatus(ctx.cwd).change || "";
		if (!change) {
			ctx.ui.notify('Sin cambio que cerrar. Uso: /ein:sdd-close <change> [--force --reason "<audit reason>"]', "warning");
			return;
		}
		const { result: r, memory } = await performSddClose(ctx, change, force, reason);
		const memoryMessage = memory
			? memory.status === "saved" && memory.reason === "acknowledged"
				? " Memoria: guardada."
				: ` Memoria: ${memory.status}/${memory.reason}.`
			: "";
		const success = r.legacyEscape
			? `Closed through legacy escape (spec state remained unresolved): ${r.legacyEscape.reason}${memoryMessage}`
			: `Verified change '${change}' closed. openspec/changes/ is clean.${memoryMessage}`;
		ctx.ui.notify(
			r.ok ? success : `No se cerró '${change}': ${r.reason}`,
			r.ok ? "info" : "warning",
		);
	}

	pi.registerCommand("ein:sdd-close", {
		description: t("cmd.sdd-close.description", "Close a verified change"),
		handler: async (args, ctx) => handleSddClose(args, ctx),
	});

	// Tool determinista de cierre: gemelo model-callable del comando. Antes el
	// orquestador solo tenía el slash command (que no puede invocar), así que
	// cerraba con hacks (`bun -e` importando la lib) o delegaba en el usuario.
	pi.registerTool({
		name: "ein_sdd_close",
		label: "Ein SDD Close",
		description:
			"Deterministically archive a VERIFIED change: move openspec/changes/<change>/ to archive/ so only live changes remain. `--force --reason \"<audit reason>\"` is only for an otherwise complete, freshly verified declarationless legacy record. It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs. Moves the filesystem; never commits or pushes. This is the close step; do not shell out to the library.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				force: { type: "boolean", description: "Use only with reason for the narrow declarationless legacy escape; eligibility remains enforced by the close library." },
				reason: { type: "string", description: "Audit reason required with force for an otherwise complete, freshly verified declarationless legacy record." },
			},
		} as const,
		async execute(_id, params: { change?: string; force?: boolean; reason?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: "/// SDD CLOSE — no active change to close." }], details: { ok: false, reason: "no active change" } };
			}
			const { result, memory } = await performSddClose(ctx, change, Boolean(params?.force), params?.reason);
			const text = result.ok
				? result.legacyEscape
					? `/// SDD CLOSE — Closed through legacy escape (spec state remained unresolved): ${result.legacyEscape.reason}`
					: `/// SDD CLOSE — Verified change '${change}' closed; archived to ${result.to.replace(ctx.cwd, ".")}.`
				: `/// SDD CLOSE — '${change}' NOT closed: ${result.reason}`;
			return { content: [{ type: "text", text }], details: { ...result, memory } };
		},
	});

	// Sin este tool el motor de sincronización era código muerto: solo lo
	// llamaban los tests. Un cambio con deltas se quedaba en `pending` para
	// siempre porque NADA en el producto sabía generar `sync-report.md`, y el
	// cierre lo exigía. Es la salida determinista de ese estado.
	pi.registerTool({
		name: "ein_openspec_sync",
		label: "Ein OpenSpec Sync",
		description:
			"Deterministically synchronize a change's OpenSpec deltas (openspec/changes/<change>/specs/<domain>/spec.md) into the canonical specs (openspec/specs/<domain>/spec.md) and publish sync-report.md. Idempotent: re-running with unchanged bytes reports 'already synchronized'. This is how a change leaves the `pending` spec state before close. Reads and writes only the filesystem; never commits.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
			},
		} as const,
		async execute(_id, params: { change?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: "/// OPENSPEC SYNC — no active change." }], details: { ok: false, reason: "no active change" } };
			}
			try {
				const { plan, changed } = await synchronizeOpenSpecFilesystem(ctx.cwd, change);
				const domains = plan.domains.map((d) => d.domain).join(", ") || "(ninguno)";
				const head = changed
					? `/// OPENSPEC SYNC — '${change}': ${plan.state}. dominios: ${domains}.`
					: `/// OPENSPEC SYNC — '${change}': ya sincronizado, sin cambios. dominios: ${domains}.`;
				const tail = plan.state === "conflict"
					? "\nCONFLICTO: los deltas se contradicen. Resuélvelo a mano; el cierre NO lo salta ni con force."
					: "\nsync-report.md publicado. `ein_sdd_status` ya puede dar el cambio por sincronizado.";
				// `ok` describe el RESULTADO, no que el tool corriera. Un conflicto no
				// es una sincronización que salió bien: el cierre lo seguirá
				// bloqueando, y un consumidor automático que solo mire `ok` no debe
				// concluir lo contrario.
				return { content: [{ type: "text", text: `${head}${tail}` }], details: { ok: plan.state !== "conflict", state: plan.state, changed, domains: plan.domains.map((d) => d.domain) } };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `/// OPENSPEC SYNC — '${change}' FALLÓ: ${message}\nLos specs se restauraron a su estado previo salvo que el mensaje diga lo contrario.` }],
					details: { ok: false, reason: message },
				};
			}
		},
	});

	// Slice 03. Un verify que pasa no dice QUÉ bytes pasaron; esto los fija en un
	// árbol git content-addressed y lo liga a repo/worktree/cambio/HEAD/rutas/
	// informe/comandos. NO gatea nada todavía: eso es el slice 04.
	pi.registerTool({
		name: "ein_candidate_receipt",
		label: "Ein Candidate Receipt",
		description:
			"Record which exact bytes a PASSING sdd-verify covered. REFUSES unless verify is `pass`, not stale, and apply is complete. Builds a synthetic candidate tree with a temporary git index (the real index and worktree are never touched) and publishes a local receipt under the worktree git admin dir, binding repository, worktree, change, HEAD, the declared paths, the verify report and the verification commands. `paths` is an EXPLICIT manifest of exact files — no directories, no git magic pathspecs; call without it to get the current tracked/untracked lists to choose from. Does NOT gate delivery.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				commands: { type: "array", items: { type: "string" }, description: "Verification commands actually run, verbatim." },
				paths: { type: "array", items: { type: "string" }, description: "EXPLICIT manifest: exact file paths that make up this delivery. Directories and magic pathspecs are rejected. Anything not named is excluded — it may be someone else's work in progress." },
			},
		} as const,
		async execute(_id, params: { change?: string; commands?: string[]; paths?: string[] }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: "/// CANDIDATE RECEIPT — no active change." }], details: { ok: false, reason: "no active change" } };
			}
			// Sin manifiesto no se emite. Pero tampoco es un callejón: se devuelve
			// la foto del árbol para que el llamante ENUMERE lo que entra.
			if (!params?.paths || params.paths.length === 0) {
				const { tracked, untracked } = suggestIntendedPaths(ctx.cwd);
				const text = [
					`/// CANDIDATE RECEIPT — '${change}' NO emitido: falta el manifiesto \`paths\`.`,
					"El candidato se DECLARA, no se infiere: 'todo lo modificado' puede incluir trabajo en curso de otro.",
					"",
					`modificados y trackeados (${tracked.length}): ${tracked.join(", ") || "(ninguno)"}`,
					`sin trackear (${untracked.length}): ${untracked.join(", ") || "(ninguno)"}`,
					"",
					"Vuelve a llamar con `paths` enumerando SOLO los ficheros de esta entrega.",
				].join("\n");
				return { content: [{ type: "text", text }], details: { ok: false, reason: "missing paths manifest", tracked, untracked } };
			}
			// FAIL CLOSED -> La memoria no puede sobrevivir a un recibo que se reemplaza.
			deliveryAttemptBySession.delete(sddPreflightSessionKey(ctx));
			const result = emitCandidateReceipt(ctx.cwd, {
				change,
				paths: params.paths,
				commands: params?.commands ?? [],
			});
			if (!result.ok) {
				return { content: [{ type: "text", text: `/// CANDIDATE RECEIPT — '${change}' NO emitido: ${result.reason}` }], details: result };
			}
			const { receipt } = result;
			const text = [
				`/// CANDIDATE RECEIPT — '${change}'`,
				`tree: ${receipt.treeSha}`,
				`head: ${receipt.head} (${receipt.branch})`,
				`rutas previstas (${receipt.paths.length}): ${receipt.paths.slice(0, 12).join(", ")}${receipt.paths.length > 12 ? " …" : ""}`,
				"El recibo identifica los bytes verificados. Si el árbol cambia después, deja de coincidir.",
			].join("\n");
			return { content: [{ type: "text", text }], details: { ok: true, ...receipt } };
		},
	});

	pi.registerTool({
		name: "ein_candidate_receipt_retire",
		label: "Ein Candidate Receipt Retire",
		description:
			"Explicitly retire one active candidate receipt after two fresh GitHub observations prove the named same-repository PR merged the exact validated delivery HEAD. Requires change, receiptFingerprint, remote, baseRef, headRef, and prNumber. Refuses auth/network failures, malformed or fork PRs, identity mismatches, and changed revalidation. If durable attempt cleanup fails after terminal unlink, reports cleanupPending and retries cleanup through already-retired; it never claims a clean rollback. Never infers a PR, changes grants, or claims verification.",
		parameters: {
			type: "object",
			additionalProperties: false,
			required: ["change", "receiptFingerprint", "remote", "baseRef", "headRef", "prNumber"],
			properties: {
				change: { type: "string", description: "Explicit SDD change bound to the active receipt." },
				receiptFingerprint: { type: "string", description: "SHA-256 fingerprint of the exact active receipt bytes." },
				remote: { type: "string", description: "Explicit local Git remote name; it must resolve to GitHub." },
				baseRef: { type: "string", description: "Explicit PR base ref." },
				headRef: { type: "string", description: "Explicit PR head ref." },
				prNumber: { type: "integer", minimum: 1, description: "Explicit GitHub pull request number." },
			},
		} as const,
		async execute(_id, params: RetirementToolParams, signal, _onUpdate, ctx: ExtensionContext) {
			const remoteRepository = await resolveExplicitPushRemoteRepository(ctx.cwd, params.remote);
			const identity: CandidateReceiptRetirementIdentity = {
				remoteRepository: remoteRepository ?? "",
				baseRef: params.baseRef,
				headRef: params.headRef,
				prNumber: params.prNumber,
			};
			const active = readActiveCandidateReceiptEvidence(ctx.cwd);
			if (!active) {
				let result = await retireCandidateReceipt(ctx.cwd, { change: params.change, receiptFingerprint: params.receiptFingerprint, identity });
				if (result.ok && result.result === "already-retired") {
					deliveryAttemptBySession.delete(sddPreflightSessionKey(ctx));
					result = reportRetirementCleanup(result, clearVerifiedDeliveryAttempt(ctx.cwd, params.receiptFingerprint));
				}
				const text = result.ok
					? `/// CANDIDATE RECEIPT RETIRE — '${params.change}' already retired; local archive evidence matches.${result.cleanupPending ? ` WARNING: ${result.warning}` : ""}`
					: `/// CANDIDATE RECEIPT RETIRE — '${params.change}' NOT retired: ${result.reason}`;
				return { content: [{ type: "text", text }], details: result };
			}
			const local = resolveWorktreeIdentity(ctx.cwd);
			const sessionKey = sddPreflightSessionKey(ctx);
			const attempt = readVerifiedDeliveryAttempt(ctx.cwd, active.fingerprint);
			const decide = (observation: NormalizedMergedPullRequestObservation | null) => !local
				? { ok: false as const, reason: "no se pudo resolver la identidad local del repositorio" }
				: evaluateCandidateReceiptRetirement({
					activeReceiptFingerprint: active.fingerprint,
					receipt: active.receipt,
					attempt,
					repositoryId: local.repositoryId,
					worktreeId: local.worktreeId,
					identity,
					observation: observation ?? undefined,
				});
			const first = decide(await observeMergedPullRequest(ctx.cwd, identity.remoteRepository, params.prNumber, signal));
			if (!first.ok) {
				return { content: [{ type: "text", text: `/// CANDIDATE RECEIPT RETIRE — '${params.change}' NOT retired: ${first.reason}` }], details: first };
			}
			let result = await retireCandidateReceipt(ctx.cwd, {
				change: params.change,
				receiptFingerprint: params.receiptFingerprint,
				attempt,
				identity,
				decision: first,
				revalidate: async () => decide(await observeMergedPullRequest(ctx.cwd, identity.remoteRepository, params.prNumber, signal)),
			});
			if (result.ok && (result.result === "retired" || result.result === "already-retired")) {
				if (deliveryAttemptBySession.get(sessionKey)?.receiptFingerprint === params.receiptFingerprint) deliveryAttemptBySession.delete(sessionKey);
				result = reportRetirementCleanup(result, clearVerifiedDeliveryAttempt(ctx.cwd, params.receiptFingerprint));
			}
			const text = result.ok
				? `/// CANDIDATE RECEIPT RETIRE — '${params.change}' ${result.result}.${result.cleanupPending ? ` WARNING: ${result.warning}` : ""}`
				: `/// CANDIDATE RECEIPT RETIRE — '${params.change}' NOT retired: ${result.reason}`;
			return { content: [{ type: "text", text }], details: result };
		},
	});

	pi.registerCommand("ein:status", {
		description: t(
			"cmd.status.description",
			"Ver estado del sistema Ein (agentes, chains, skills, proyecto)",
		),
		handler: async (_args, ctx) => {
			const agentsDir = join(AGENT_DIR, "agents");
			const chainsDir = join(AGENT_DIR, "chains");
			const skillsLocalDir = join(AGENT_DIR, "skills", "local");
			const skillsDownloadedDir = join(AGENT_DIR, "skills", "downloaded");
			const mcpFile = join(AGENT_DIR, "mcp.json");

			const agents = existsSync(agentsDir)
				? readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort()
				: [];
			const chains = existsSync(chainsDir)
				? readdirSync(chainsDir).filter((f) => f.endsWith(".chain.md")).sort()
				: [];

			function countDirs(dir: string): number {
				if (!existsSync(dir)) return 0;
				try {
					return readdirSync(dir).length;
				} catch {
					return 0;
				}
			}

			const localSkills = countDirs(skillsLocalDir);
			const downloadedSkills = countDirs(skillsDownloadedDir);
			const openspecConfigured = existsSync(join(ctx.cwd, "openspec", "config.yaml"));
			const staleDrift = sddGlobalAssetDriftCount();

			let mcpServers: string[] = [];
			if (existsSync(mcpFile)) {
				try {
					const cfg = JSON.parse(readFileSync(mcpFile, "utf8")) as {
						mcpServers?: Record<string, unknown>;
					};
					mcpServers = Object.keys(cfg.mcpServers ?? {});
				} catch {
					mcpServers = [];
				}
			}

			const lines: string[] = [];
			const chatLang = readChatLang();
			const artifactLang = readArtifactLang(ctx.cwd);
			lines.push("/// 000. EIN STATUS");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.mode", "modo")}: ${readMode(ctx.cwd)}`);
			lines.push(`${t("status.persona", "persona")}: ${readPersonaMode(ctx.cwd)}`);
			lines.push(
				`${t("status.git", "entrega git")}: ${readGitDeliveryMode(ctx.cwd)}`,
			);
			lines.push(
				`${t("status.lang", "idioma")}: ${t("status.lang.chat", "conversación")}=${LANG_LABEL[chatLang]} · ${t("status.lang.artifacts", "artefactos")}=${LANG_LABEL[artifactLang]}`,
			);
			lines.push(
				`${t("status.state", "estado")}: ${staleDrift > 0 ? t("status.state.drift", "drift detectado") : t("status.state.ok", "operativo")}`,
			);
			lines.push("");

			lines.push(`■ 001. ${t("status.sdd", "SDD")}`);
			lines.push(`${t("status.agents", "agentes")}: ${agents.length}`);
			for (const a of agents) lines.push(`- ${a}`);
			lines.push(`${t("status.chains", "chains")}: ${chains.length}`);
			for (const c of chains) lines.push(`- ${c}`);
			{
				const summaries = listActiveChangeSummaries(ctx.cwd);
				const budget = aggregateSddBudget(summaries);
				if (summaries.length === 0) {
					lines.push(`${t("status.sdd.active", "active change")}: ${t("status.sdd.none", "none")}`);
				} else {
					lines.push(tf("status.sdd.multi", "{0} active", summaries.length));
					for (const summary of summaries.slice(0, 8)) {
						lines.push(`- ${summary.change}: phase=${summary.currentPhase} · next=${summary.nextRecommended} · ready=${summary.tasks.ready} · blocked=${summary.tasks.blocked} · budget=${compactBudget(summary.budget)}`);
					}
					if (summaries.length > 8) lines.push(`- … ${summaries.length - 8} more`);
					if (budget.changesWithBudget > 0) {
						lines.push(`${t("status.sdd.budget-total", "budget total")}: allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`);
					}
				}
			}
			if (staleDrift > 0)
				lines.push(
					`drift: ${staleDrift} ${t("status.drift.files", "archivo(s) desincronizado(s)")} — /ein:ai:install-sdd --force ${t("status.drift.refresh", "para refrescar")}`,
				);
			lines.push("");

			lines.push(`■ 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`■ 003. ${t("status.project", "PROYECTO")}`);
			const einMd = readEinMd(ctx.cwd);
			if (!einMd.exists) {
				lines.push(`EIN.md: ${t("status.einmd.absent", "ausente — /ein:init para generarlo")}`);
			} else {
				const behind = einMdCommitsBehind(ctx.cwd);
				const fresh =
					behind === undefined
						? t("status.einmd.present", "presente")
						: behind === 0
							? t("status.einmd.fresh", "al día")
							: tf("status.einmd.stale", `{0} commits atrás — /ein:init para refrescar`, behind);
				lines.push(`EIN.md: ${fresh}`);
			}
			lines.push(`openspec: ${openspecConfigured ? t("status.openspec.configured", "configurado") : t("status.openspec.unconfigured", "no configurado — ejecuta el preflight SDD para arrancar")}`);
			lines.push(`${t("status.model", "modelo")}: ${existsSync(modelConfigPath(ctx.cwd)) ? t("status.model.present", "config presente") : t("status.model.absent", "sin config local")}`);
			lines.push("");

			lines.push("■ 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`■ 005. ${t("status.diag", "DIAGNOSTICO")}`);
			lines.push(`- ${"/ein:doctor-output"} ${t("status.diag.output", "para smoke checks tecnicos")}`);
			lines.push(`- ${"/ein:doctor"} ${t("status.diag.doctor", "para diagnostico explicativo")}`);

			const level = staleDrift > 0 ? "warning" : "info";
			ctx.ui.notify(lines.join("\n"), level);
		},
	});

	pi.registerCommand("ein:help", {
		description: t(
			"cmd.help.description",
			"Ayuda del sistema Ein — usa 'full' para detalle completo",
		),
		handler: async (args, ctx) => {
			const mode = (Array.isArray(args) ? args.join(" ") : String(args ?? ""))
				.trim()
				.toLowerCase();
			const text =
				mode === "full"
					? t("help.full", "Ein listo. Autor: samuhlo. (i18n no disponible)")
					: t("help.short", "/// AYUDA EIN — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
