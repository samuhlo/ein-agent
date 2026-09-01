// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { GLYPH } from "../lib/chrome.ts";
import { TOOL_LABELS, receiptFor } from "../lib/tool-receipts.ts";
import {
	createSddMemoryLifecycle,
	ensureApplyAcceptance,
	ensureApplyTurnBudget,
	ensurePhaseRuntime,
	ensureDelegationAcceptance,
	ensureParticipantForeground,
	isSddParticipantMarker,
	ensurePlanningAcceptance,
	ensureSddPreflight,
	gateTddForDelegation,
	getSddPreflightPreferences,
	getSddSessionMemory,
	installSddAssets,
	isSddPreflightTrigger,
	piSddIntentPreflightContext,
	renderMemoryAdvisory,
	renderSddPreflightPrompt,
	resolveSddIntentPreflight,
	sddGlobalAssetDriftCount,
	sddPreflightSessionKey,
	type MemoryPreparationLifecycle,
	type SddIntentPreflightInput,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";
import { collectDelegationItems, delegationShapeIsUnrecognized } from "../lib/delegation-shape.ts";
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
	offerCodegraphInit,
	shouldOfferCodegraphInit,
} from "../lib/codegraph.ts";
import { handleLinearIntegrationCommand, readLinearIntegration } from "../lib/linear-integration.ts";
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
import { handleModelsCommand } from "./internal/models-panel.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions";
import { readAccountingReport } from "../lib/session-accounting-store.ts";
import type { Coverage, Known, Slice, Stat, Total } from "../lib/session-accounting.ts";
import { lintChange, lintPhaseArtifact, type ChangeLintReport, type SddPhase } from "../lib/sdd-guardrails.ts";
import { collectSddRemedies, formatSddRemedies } from "../lib/sdd-remedies.ts";
import { LANE_LABEL, laneSkips, normalizeLane, readChangeLane, writeChangeLane } from "../lib/sdd-lane.ts";
import {
	changeStanceDirective,
	normalizeTddStance,
	readChangeStance,
	renderChangeStanceLine,
	resolveActiveChange,
	writePreflightRecord,
} from "../lib/sdd-preflight-record.ts";
import { aggregateSddBudget, changeUnavailableMessage, formatBudget, formatSddPlanPreview, isSafeChangeName, listActiveChanges, listActiveChangeSummaries, resolveChangesDir, resolveSddNext, resolveSddPlanPreview, resolveSddStatus, sddNextHandoff, sddStatusBlockers, type SddChangeStatus, type SddNextReport } from "../lib/sdd-router.ts";
import { SDD_SESSION_BINDING_EVENT_CHANNEL, type SessionBindingEventV1 } from "../lib/sdd-session-binding.ts";
import { reviewForecast, formatReviewForecast } from "../lib/review-forecast.ts";
import { closeChange, type CloseOptions } from "../lib/sdd-close.ts";
import { parseSddCloseArgs } from "../lib/sdd-close-args.ts";
import { approveCandidate, type MemoryCandidate, type MemoryReceipt } from "../lib/memory-contract.ts";
import {
	MEMORY_CANDIDATE_SCHEMA,
	appendMemoryReceipt,
	buildCloseMemoryCandidate,
	safeMemoryReceipt,
	saveAfterArtifactGate,
	type SafeMemoryReceipt,
} from "../lib/sdd-memory-save.ts";
import {
	codeConventionSkillBlock,
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
import { writeOpenSpecDelta } from "../lib/openspec-delta-write.ts";
import { synchronizeOpenSpecFilesystem } from "../lib/openspec-spec-sync-fs.ts";
import { evaluateStaging } from "../lib/git-staging.ts";
import { acceptTrackedScoutResult, normalizeScoutLaunch, type ScoutTracking } from "../lib/scout-contract.ts";
import {
	clearAgentControlSession,
	internalAgentRoutingDirective,
	readAgentControlStatus,
	routeAgentControl,
	type EinInternalAgent,
} from "../lib/agent-controls.ts";
import { collectCleanerAuditEvidence, type CleanerAuditScope } from "../lib/cleaner-audit-evidence.ts";
import {
	collectCleanerPassiveEvidence,
	cleanerEvidenceForModel,
	ingestCleanerActiveEvidence,
	planCleanerActiveEvidence,
	type CleanerActiveEvidence,
	type CleanerActivePlan,
	type CleanerPassiveEvidence,
	type CleanerPlanInput,
} from "../lib/cleaner-operational-evidence.ts";
import { admitCleanerImprove, applyCleanerImprove, completeCleanerImprove } from "../lib/cleaner-improve.ts";
import type { CleanerBoundedMutationRequestV1, CleanerStateTransitionRecordV1, CleanerVerificationRecordV1 } from "../lib/cleaner-bounded-mutations.ts";
import type { CleanerFindingV1 } from "../lib/cleaner-read-only-audit.ts";
import { bindArchitectPlan, collectArchitectEvidence, validateArchitectPlan, type ArchitectEvidence, type BoundArchitectPlan } from "../lib/architect-read-only.ts";
import { admitSddParticipantCall, clearSddParticipantSession, completeSddParticipantCall, getSddParticipantCall, participantResultIsUnrecognized, planSddParticipants, sddParticipantCallsAreTracked, type SddParticipant } from "../lib/sdd-participants.ts";

// ─── Detección de eventos de subagentes ──────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_PI_PARTICIPANT_OUTPUT_BYTES = 1024 * 1024;

type PiParticipantTerminal = Readonly<{
	status: "complete" | "blocked" | "unavailable";
	reason?: string;
}>;

function participantTerminalUnavailable(reason: string): PiParticipantTerminal {
	return { status: "unavailable", reason };
}

/**
 * Recognize only the exact terminal child delivered by the foreground Pi call.
 * This stays private to the Pi edge: sequencing, source seals, and outcome
 * transitions remain in `sdd-participants.ts`.
 */
function recognizePiParticipantTerminal(input: {
	toolName: unknown;
	isError: unknown;
	details: unknown;
	agent: string;
	task: string;
}): PiParticipantTerminal {
	if (input.toolName !== "subagent") return participantTerminalUnavailable("unsupported participant delivery");
	if (input.isError !== false) return participantTerminalUnavailable("participant transport failed");
	if (!isRecord(input.details) || (input.details.mode !== "single" && input.details.mode !== "workflow") || !Array.isArray(input.details.results) || input.details.results.length !== 1) {
		return participantTerminalUnavailable("participant terminal result is missing or ambiguous");
	}
	const child = input.details.results[0];
	if (!isRecord(child) || child.agent !== input.agent || child.task !== input.task || typeof child.finalOutput !== "string" || child.finalOutput.trim().length === 0) {
		return participantTerminalUnavailable("participant terminal child identity or output is missing");
	}
	if (Buffer.byteLength(child.finalOutput, "utf8") > MAX_PI_PARTICIPANT_OUTPUT_BYTES) {
		return participantTerminalUnavailable("participant terminal output exceeds the bounded limit");
	}
	const statusLines = child.finalOutput.split(/\r?\n/u).filter((line) => /^\s*status\s*:/u.test(line));
	if (statusLines.length !== 1) return participantTerminalUnavailable("participant terminal status is missing or ambiguous");
	const status = /^\s*status\s*:\s*(complete|blocked|unavailable)\s*$/u.exec(statusLines[0]!);
	if (!status) return participantTerminalUnavailable("participant terminal status is unsupported or ambiguous");
	if (status[1] === "blocked") {
		const reason = child.finalOutput.split(/\r?\n/u).find((line) => /^\s*reason\s*:\s*\S/u.test(line))?.replace(/^\s*reason\s*:\s*/u, "").trim();
		return { status: "blocked", ...(reason ? { reason } : {}) };
	}
	return { status: status[1] as "complete" | "unavailable" };
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

type PiIntentGate =
	| Readonly<{ kind: "pending"; input: SddIntentPreflightInput }>
	| Readonly<{ kind: "confirming"; input: SddIntentPreflightInput; answers: string }>
	| Readonly<{ kind: "resolved" }>;
const piIntentGateBySession = new Map<string, PiIntentGate>();

const READ_ONLY_INTENT = /^(?:(?:can|could|would)\s+you\s+|please\s+|(?:puedes|podrías)\s+|por\s+favor[,\s]+)?(?:explain|inspect|show|list|read|review|analy[sz]e|describe|what|why|how|where|which|explica|inspecciona|muestra|lista|lee|revisa|analiza|qué|que|por qué|por que|cómo|como|dónde|donde|cuál|cual)\b/iu;
const MODIFYING_INTENT = /\b(?:implement|add|change|update|fix|remove|delete|write|create|refactor|rename|move|install|configur|implementa|añade|agrega|cambia|actualiza|corrige|elimina|borra|escribe|crea|refactoriza|renombra|mueve|instala)\w*\b/iu;
const SMALL_TEXT_INTENT = /^(?:fix|correct|update|corrige|actualiza)\s+(?:the\s+|el\s+|la\s+)?(?:typo|spelling|wording|text|errata|ortograf[ií]a|texto)\s+(?:in|en)\s+\S+(?:\s+(?:skip questions|without questions|don't ask|do not ask|sin preguntas|no preguntes))?\s*\.?$/iu;
const SAFE_BYPASS_INTENT = /\b(?:skip questions|without questions|don't ask|do not ask|sin preguntas|no preguntes)\b/iu;

export function classifyPiIntentRequest(text: string) {
	const modifying = MODIFYING_INTENT.test(text);
	const readOnly = !modifying && READ_ONLY_INTENT.test(text.trim());
	const smallText = SMALL_TEXT_INTENT.test(text.trim());
	return {
		activation: readOnly ? "read-only" : modifying ? "modifying" : "unknown",
		declaredLane: null,
		bounded: smallText ? true : "unknown",
		mechanical: smallText ? true : "unknown",
		documentationOrTextOnly: smallText ? true : "unknown",
		introducesBehavior: smallText ? false : "unknown",
		securityRisk: smallText ? false : "unknown",
		persistentDataRisk: smallText ? false : "unknown",
		destructiveActionRisk: smallText ? false : "unknown",
		bypassRequested: SAFE_BYPASS_INTENT.test(text),
	} as const;
}

function piIntentMaterial(text: string, answers?: string) {
	return {
		objective: text,
		boundaries: {
			in: [answers?.trim() || "The explicitly requested change"],
			out: ["Behavior and files outside the explicit request"],
		},
		completionCriteria: ["The requested outcome is complete and focused checks pass"],
	};
}

function piIntentGateDirective(ctx: ExtensionContext): string {
	const gate = piIntentGateBySession.get(sddPreflightSessionKey(ctx));
	return gate && gate.kind !== "resolved"
		? "\n\n## Intent preflight gate\nFAIL CLOSED: intent is unresolved. Do not construct, edit, delegate modifying work, or invoke mutating tools. Secondary hooks cannot ask intent questions."
		: "";
}

async function adoptPiIntentGate(ctx: ExtensionContext): Promise<void> {
	const sessionKey = sddPreflightSessionKey(ctx);
	const gate = piIntentGateBySession.get(sessionKey);
	if (!gate || gate.kind === "resolved") return;
	const change = resolveActiveChange(ctx.cwd);
	if (!change) return;
	const outcome = await resolveSddIntentPreflight(piSddIntentPreflightContext(ctx), { ...gate.input, change });
	if (outcome.kind === "adopted" || outcome.kind === "resolved") {
		piIntentGateBySession.set(sessionKey, { kind: "resolved" });
	}
}

function piIntentToolBlockReason(ctx: ExtensionContext, toolName: string): string | undefined {
	const gate = piIntentGateBySession.get(sddPreflightSessionKey(ctx));
	if (!gate || gate.kind === "resolved") return undefined;
	if (["read", "grep", "find", "codegraph_explore", "codegraph_callers", "codegraph_callees"].includes(toolName)) return undefined;
	return "Intent preflight is unresolved. Only the input hook may ask; submit a clarified or confirmed request before construction.";
}

// Foto del artefacto de fase justo ANTES de delegar, por toolCallId. La lee el
// hook `tool_result` para distinguir "la fase no se hizo" de "el runner falló
// por algo ajeno al trabajo". Sin la foto no se reconcilia nada: un artefacto
// preexistente no puede rescatar un run que no escribió nada.
const phaseSnapshotByToolCall = new Map<
	string,
	{ phase: SddPhase; before: PhaseSnapshot }
>();

const scoutTracking: ScoutTracking = new Map();

// Sesiones ya avisadas del drift de forma. Un aviso por sesión: el problema es
// del runtime instalado, no de la delegación concreta, y repetirlo en cada
// llamada solo taparía el resto.
const shapeDriftWarned = new Set<string>();

// Espejo del canario de admisión, del lado de la RECOGIDA (A-3): si Ein deja de
// reconocer la forma del resultado de un participante rastreado, avisa una vez
// por sesión en vez de perder la evidencia en silencio.
const participantResultDriftWarned = new Set<string>();
function warnParticipantResultDrift(ctx: ExtensionContext): void {
	const key = sddPreflightSessionKey(ctx);
	if (participantResultDriftWarned.has(key)) return;
	participantResultDriftWarned.add(key);
	ctx.ui.notify(
		t(
			"ai.delegation.participant-result-drift",
			"Ein no reconoce la forma del resultado de este participante SDD: la evidencia no se registra. Actualiza Ein (`ein update`).",
		),
		"warning",
	);
}

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
		`// 000. sdd check — ${change}`,
		"",
		`fases: ${presentCount}/${total} presentes  |  errores: ${errors}  |  warnings: ${warnings}`,
	];

	if (report.issues.length > 0) {
		lines.push("", "▏ consistencia:");
		for (const i of report.issues) {
			lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
		}
	}

	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`▏ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const icon = ok ? "OK" : "ERRORS";
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lineas` : "";
		lines.push(`▏ ${phase} — ${icon} (presente${detail})`);
		if (pr!.issues.length > 0) {
			for (const i of pr!.issues) {
				lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
			}
		}
	}

	return lines.join("\n");
}

// ── Recibos humanos ─────────────────────────────────────────────────────────
// El `content` de la tool sigue yendo ÍNTEGRO al modelo; esto solo decide qué
// ve el humano. Las frases viven en lib/tool-receipts.ts, que es puro y se
// prueba sin arrancar Pi; aquí solo se elige color y nivel.
//
// El expandido pinta el DETALLE HUMANO, no el volcado técnico: antes la
// elección era entre no ver nada o ver JSON.
type ToolTheme = Readonly<{ fg(token: string, text: string): string; bold(text: string): string }>;

function receiptCall(label: string, theme: ToolTheme): Text {
	return new Text(
		`${theme.fg("dim", `ein ${GLYPH.sep} `)}${theme.fg("toolTitle", label)}`,
		0,
		0,
	);
}

// P2-G: fuente única en sdd-router (formatBudget), que además marca cuando lo
// consumido supera lo asignado. Alias local para no tocar los puntos de llamada.
const compactBudget = formatBudget;

function formatSddStatus(
	status: SddChangeStatus,
	active: string[],
	prefs?: SddPreflightPreferences,
): string {
	const notebook = `optional project notebook: Engram ${prefs?.memoryMode ?? "off"}${prefs?.engramAvailable ? " (configured; no retrieval or save is implied)" : " (unavailable or not configured)"}; OpenSpec is the canonical full record.`;
	const lines = ["// 000. sdd status", ""];
	if (!status.change) {
		// Ambigüedad ≠ repo limpio. Decir "no hay ninguno" habiendo varios es la
		// mentira que producía la elección implícita, solo que por el otro lado.
		if (status.selection.kind === "ambiguous") {
			lines.push(`- ${status.selection.candidates.length} cambios activos y ninguno elegido.`);
			lines.push(`- ${t("sdd-status.active", "active")}: ${status.selection.candidates.join(", ")}`);
			lines.push("- Indica cuál con su nombre antes de continuar.");
		} else {
			lines.push("- " + t("sdd-status.none", "No active SDD changes in openspec/changes/."));
		}
		lines.push(`- ${notebook}`);
		return lines.join("\n");
	}

	const present = status.artifacts.present.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
	const missing = status.artifacts.missing.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
	lines.push(`${t("sdd-status.change", "change")}: ${status.change}`);
	if (active.length > 1) lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
	lines.push(`${t("sdd-status.lane", "lane")}: ${status.lane}`);
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

	// Solo bloqueos reales, vía la fuente única sddStatusBlockers.
	const blockers = sddStatusBlockers({ blocked: status.blocked, taskProblems: status.tasks.problems, budgetProblems: status.budget.problems });
	if (blockers.length) {
		lines.push("", `▏ ${t("sdd-status.blocked", "blockers")}:`);
		for (const b of blockers) lines.push(`- ${b}`);
	}
	// El remedio sale del MISMO estado que el bloqueo. Antes vivía como prosa en
	// el prompt del orquestador, explicando lo que el router ya calculaba.
	const remedies = formatSddRemedies(collectSddRemedies(status));
	if (remedies) lines.push("", remedies);
	return lines.join("\n");
}

/** Command args arrive as a string or as argv, depending on the caller. */
function commandArgsText(args: unknown): string {
	if (typeof args === "string") return args;
	return Array.isArray(args) ? args.join(" ") : "";
}

function parseSddNextArgs(args: string | string[]): { change: string | null } {
	const raw = commandArgsText(args);
	const parts = raw.trim().split(/\s+/).filter(Boolean);
	// Los flags se descartan del candidato a nombre: un `--auto` tecleado por
	// inercia (existió como dry-run y se retiró) no debe convertirse en la
	// búsqueda de un cambio llamado "--auto".
	const change = parts.filter((part) => !part.startsWith("--"))[0] ?? null;
	return { change };
}

function formatSddNextHelp(): string {
	return [
		"// 000. sdd next",
		"",
		"Uso: /ein:sdd-next <change>",
		"",
		"- Muestra el siguiente paso recomendado para un cambio concreto.",
		"- No elige un cambio activo implicitamente.",
		"- Entrega ese paso al orquestador para que lo ejecute; la ruta la sigue decidiendo el router.",
	].join("\n");
}

function formatSddNext(report: SddNextReport): string {
	const lines = [
		"// 000. sdd next",
		"",
		`cambio: ${report.change ?? "ninguno"}`,
		`fase actual: ${report.currentPhase}`,
		`siguiente recomendado: ${report.nextRecommended}`,
		`razon: ${report.reason}`,
		`accion sugerida: ${report.suggestedAction}`,
	];

	if (report.blocked.length > 0) {
		lines.push("", "▏ revisar antes de avanzar:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}

// ─── Extensión ────────────────────────────────────────────────────────────────

export default function einAi(pi: ExtensionAPI): void {
	function publishSessionBinding(event: SessionBindingEventV1): void {
		pi.events.emit(SDD_SESSION_BINDING_EVENT_CHANNEL, event);
	}

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

	function continueAfterPiIntent(ctx: ExtensionContext, change: string | undefined): void {
		if (!change) return;
		const handoff = sddNextHandoff(resolveSddNext(ctx.cwd, change));
		if (handoff) pi.sendUserMessage(handoff);
	}

	async function runPiIntentPreflight(text: string, ctx: ExtensionContext): Promise<"read-only" | "pending" | "resolved"> {
		const sessionKey = sddPreflightSessionKey(ctx);
		const current = piIntentGateBySession.get(sessionKey);
		if (current?.kind === "pending") {
			const answers = text.trim();
			if (!answers) return "pending";
			piIntentGateBySession.set(sessionKey, { kind: "confirming", input: current.input, answers });
			if (ctx.hasUI) {
				ctx.ui.notify(
					`${current.input.summary} — ${answers}\nReply \"confirm\" to continue, or send a revised request.`,
					"info",
				);
			}
			return "pending";
		}
		if (current?.kind === "confirming") {
			if (!/^(?:confirm|confirmed|yes|sí|si)$/iu.test(text.trim())) {
				piIntentGateBySession.delete(sessionKey);
				return runPiIntentPreflight(text, ctx);
			}
			const confirmed = await resolveSddIntentPreflight(piSddIntentPreflightContext(ctx), {
				...current.input,
				summary: `${current.input.summary} — ${current.answers}`,
				material: piIntentMaterial(current.input.summary, current.answers),
				confirmed: true,
			});
			if (confirmed.kind === "pending") return "pending";
			piIntentGateBySession.set(sessionKey, { kind: "resolved" });
			return "resolved";
		}

		piIntentGateBySession.delete(sessionKey);
		const change = resolveActiveChange(ctx.cwd);
		const input: SddIntentPreflightInput = {
			change: change ?? `pi-session-${sessionKey.replace(/[^a-z0-9-]/giu, "-").slice(-48) || "pending"}`,
			evidence: classifyPiIntentRequest(text),
			summary: text.trim(),
			material: piIntentMaterial(text),
			materialEvidence: "sufficient",
		};
		const outcome = await resolveSddIntentPreflight(piSddIntentPreflightContext(ctx), input);
		if (outcome.kind === "read-only") return "read-only";
		if (outcome.kind === "pending") {
			piIntentGateBySession.set(sessionKey, { kind: "pending", input });
			if (ctx.hasUI) ctx.ui.notify(outcome.interaction.text, "info");
			return "pending";
		}
		piIntentGateBySession.set(sessionKey, { kind: "resolved" });
		return "resolved";
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
		// Higiene del proyecto: un único bloque gestionado en .gitignore.
		// Best-effort, no rompe.
		ensureEinGitignore(ctx.cwd);
		// Codegraph: en un proyecto sin índice la directiva nunca se activaba y
		// no había forma de salir de ahí. Se ofrece UNA vez por proyecto —
		// aceptes o no, no se vuelve a preguntar; `/ein:codegraph` sigue estando.
		if (ctx.hasUI && shouldOfferCodegraphInit(ctx.cwd)) {
			try {
				await offerCodegraphInit(ctx);
			} catch {
				// Una oferta que falla no puede impedir que arranque la sesión.
			}
		}
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

	pi.on("session_shutdown", (_event, ctx) => {
		scoutTracking.clear();
		const sessionKey = sddPreflightSessionKey(ctx);
		piIntentGateBySession.delete(sessionKey);
		clearAgentControlSession(sessionKey);
		clearSddParticipantSession(sessionKey);
	});

	pi.on("input", async (event, ctx) => {
		// R6 residual risk closed: a cancelled or dead scout never reaches
		// `acceptTrackedScoutResult`, so its `pending` entry would otherwise survive
		// until `session_shutdown` and permanently block every later scout launch.
		// R7 forces `async: false` on every normalized launch, so a legitimate scout
		// cannot outlive the turn that launched it — clearing here is exactly the
		// contract's own boundary ("one scout per turn"), not an approximation.
		scoutTracking.clear();
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
		if (typeof event.text !== "string") return { action: "continue" };
		const explicitSdd = isSddPreflightTrigger(event.text);
		if (explicitSdd) await runSddPreflight(ctx);
		const intent = await runPiIntentPreflight(event.text, ctx);
		if (intent === "pending") return { action: "handled" };
		if (intent === "resolved") continueAfterPiIntent(ctx, resolveActiveChange(ctx.cwd));
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		await adoptPiIntentGate(ctx);
		const isSddAgent = isSddAgentStartEvent(event);
		const isNamedAgent = isNamedAgentStartEvent(event);
		const prefs = getSddPreflightPreferences(ctx);
		const startNames = readAgentStartNames(event);
		// Memoria a granularidad de SESIÓN, no de fase: solo el parent recibe el
		// snapshot de sesión (recuperado en el preflight). Los agentes de fase leen
		// sus inputs del disco; el parent les pasa el contexto que necesiten. Antes
		// se hacía una búsqueda Engram + inyección POR FASE — coste por fase y
		// superficie de fallo para un modelo barato, sin más valor que la sesión.
		const memoryPrompt = renderMemoryAdvisory(
			!isNamedAgent && !isSddAgent ? getSddSessionMemory(ctx) : undefined,
		);
		// Convenciones de codigo (comment/logging/file-naming): SOLO donde se
		// escribe codigo — el parent (trabajo inline) y sdd-apply. Inyectarlas en
		// delivery/linear/map solo hacia que el modelo barato leyera 3 SKILL.md
		// inutiles (gasto de tokens) sin escribir codigo. Tambien gobierna si la
		// linea de Strict TDD entra en el preflight: solo donde hay RED/GREEN real.
		const isParent = !isNamedAgent && !isSddAgent;
		// `ein-scout` es un investigador de solo lectura, aislado al repo y con
		// `inheritSkills: false`: declara explícitamente que NO usa skills. Inyectarle
		// paths de SKILL.md (absolutos, fuera del repo) sólo produce "Skills not found"
		// y una ejecución degradada. Se excluye de toda inyección de skills.
		const isScout = startNames.includes("ein-scout");
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
			: `\n\n${buildEinPrompt(readPersonaMode(ctx.cwd), readChatLang(), readLinearIntegration(ctx.cwd))}\n\n${internalAgentRoutingDirective()}`;
		// Inyección determinista de skills: subagentes de fase/nombrados reciben
		// paths exactos de SKILL.md resueltos desde su task, no a criterio del
		// modelo padre (evita que el padre "invente" qué skills existen).
		let skillsPrompt = "";
		if ((isNamedAgent || isSddAgent) && !isScout) {
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
			systemPrompt: `${event.systemPrompt}${einPrompt}${sddPrompt}${memoryPrompt ? `\n\n${memoryPrompt}` : ""}${skillsPrompt}${artifactPrompt}${conventionsPrompt}${contextPrompt}${canonicalSpecContext}${codegraphPrompt}${piIntentGateDirective(ctx)}`,
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		await adoptPiIntentGate(ctx);
		const intentBlock = piIntentToolBlockReason(ctx, event.toolName);
		if (intentBlock) return { block: true, reason: intentBlock };
		// Delegaciones con push: el usuario confirma aquí (sesión con UI) y se
		// emite el grant one-shot que el guard headless del subagente consume.
		if (event.toolName === "subagent") {
			// Scout is deliberately handled before any SDD/delivery behavior.
			const scoutLaunch = normalizeScoutLaunch(event.input, event.toolCallId, scoutTracking);
			if (scoutLaunch) {
				Object.assign(event.input as Record<string, unknown>, scoutLaunch);
				return undefined;
			}
			const items = collectDelegationItems(event.input);
			for (const item of items) {
				if ((item.agent !== "ein-cleaner" && item.agent !== "ein-architect") || !item.task) continue;
				if (items.filter((candidate) => (candidate.agent === "ein-cleaner" || candidate.agent === "ein-architect") && isSddParticipantMarker(candidate.task)).length > 1) {
					return { block: true, reason: "SDD participants must run sequentially, one delegation at a time." };
				}
				try {
					const blocker = admitSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, item.agent as SddParticipant, item.task);
					if (blocker) return { block: true, reason: blocker };
				} catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
			}
			// R1: un participante lanzado en background nunca trae su resultado
			// terminal por el `tool_result` de su propia llamada (`// 002 A-1`).
			// Se fuerza foreground, sobrescribiendo un `async` explícito: un
			// participante inobservable no debe admitirse.
			ensureParticipantForeground(event.input);
			// Canario de drift: si Ein no reconoce ni un child, TODOS los gates de
			// abajo son no-ops silenciosos (es lo que pasó al mover la ejecución a
			// `workflowScript`). Se avisa una vez y se sigue: no se bloquea trabajo
			// por una forma que puede ser legítima (agente/task construidos en runtime).
			if (ctx.hasUI && delegationShapeIsUnrecognized(event.input)) {
				const driftKey = sddPreflightSessionKey(ctx);
				if (!shapeDriftWarned.has(driftKey)) {
					shapeDriftWarned.add(driftKey);
					ctx.ui.notify(
						t(
							"ai.delegation.shape-drift",
							"Ein no reconoce la forma de esta delegación: los gates de entrega y TDD no se aplican. Si el runtime de subagentes se acaba de actualizar, actualiza Ein (`ein update`).",
						),
						"warning",
					);
				}
			}
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
			// Runtime por agente desde la tabla, no desde la memoria del padre.
			// Un maxRuntimeMs explícito del orquestador siempre gana.
			ensurePhaseRuntime(event.input);
			// Backstop universal: cualquier otra delegación (ein-git, ein-scout,
			// ein-linear, sdd-verify, workflows mixtos) también sale con
			// `acceptance: none` si el orquestador no pasó uno explícito. Sin esto
			// el runner INFIERE el contrato de la redacción de la tarea y rechaza
			// trabajo terminado por no emitir un `acceptance-report` con su forma.
			ensureDelegationAcceptance(event.input);
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
		maybeWrapBashInput(event.input as { command: string }, ctx.cwd);
		return undefined;
	});

	// El artefacto manda sobre el veredicto del runner. Un ✗ puede venir de algo
	// que no dice nada del trabajo (tool ausente en la allowlist, respuesta final
	// vacía, timeout en la lectura final) con la fase YA entregada. Sin esto el
	// orquestador repetía una fase completa y pagaba dos veces.
	pi.on("tool_result", (event, ctx) => {
		// A participant result must arrive on its own foreground `subagent` call.
		// `subagent_wait` and every other delivery shape are unavailable evidence,
		// not a reason to leave the coordinator call in flight.
		if (event.toolName === "subagent_wait") {
			if (ctx.hasUI && participantResultIsUnrecognized({ toolName: event.toolName, details: event.details, hasTrackedCalls: sddParticipantCallsAreTracked() })) warnParticipantResultDrift(ctx);
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, { status: "unavailable", reason: "background participant delivery is unsupported" });
			return undefined;
		}
		if (event.toolName !== "subagent") {
			const tracked = getSddParticipantCall(event.toolCallId);
			if (tracked) completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, { status: "unavailable", reason: "unsupported participant delivery" });
			return undefined;
		}
		if (ctx.hasUI && participantResultIsUnrecognized({ toolName: event.toolName, details: event.details, hasTrackedCalls: sddParticipantCallsAreTracked() })) warnParticipantResultDrift(ctx);
		const tracked = getSddParticipantCall(event.toolCallId);
		if (tracked) {
			const terminal = recognizePiParticipantTerminal({
				toolName: event.toolName,
				isError: event.isError,
				details: event.details,
				agent: tracked.unit,
				task: tracked.task,
			});
			completeSddParticipantCall(ctx.cwd, sddPreflightSessionKey(ctx), event.toolCallId, terminal);
		}
		try {
			const report = acceptTrackedScoutResult(scoutTracking, event.toolCallId, event.details, event.isError, ctx.cwd);
			if (report) return { isError: false, content: [{ type: "text", text: JSON.stringify(report) }] };
		} catch (error) {
			return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "ein-scout contract: validation failed" }] };
		}
		// Se libera SIEMPRE, falle o no: si solo se borrase en la rama de fallo,
		// cada delegación exitosa dejaría su foto ahí para toda la sesión.
		const snapshot = phaseSnapshotByToolCall.get(event.toolCallId);
		phaseSnapshotByToolCall.delete(event.toolCallId);
		if (!snapshot) return undefined;
		if (!event.isError) return undefined;
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

	const registerAgentControl = (agent: EinInternalAgent): void => {
		pi.registerCommand(`ein:${agent}`, {
			description: `Route an explicit ${agent} request or set this session's automatic participation (on/off/status)`,
			handler: async (args, ctx) => {
				const result = routeAgentControl(ctx.cwd, sddPreflightSessionKey(ctx), agent, String(args ?? ""));
				if (result.kind === "request") {
					pi.sendUserMessage(result.prompt);
					return;
				}
				if (result.kind === "usage") {
					ctx.ui.notify(result.message, "warning");
					return;
				}
				ctx.ui.notify(
					`${agent}: ${result.status.enabled ? "on" : "off"} (${result.status.source}); automatic SDD participation only`,
					"info",
				);
			},
		});
	};
	registerAgentControl("cleaner");
	registerAgentControl("architect");

	// Toda tool de Ein se registra por aquí: así ninguna puede quedarse sin
	// recibo humano por olvido. Eran 16 de 18 volcando salida cruda al chat.
	const registerEinTool = (spec: Parameters<typeof pi.registerTool>[0]): void =>
		pi.registerTool({
			...spec,
			renderCall(_args: unknown, theme: ToolTheme): Text {
				return receiptCall(TOOL_LABELS[spec.name] ?? spec.name, theme);
			},
			renderResult(
				result: AgentToolResult<unknown>,
				{ expanded }: ToolRenderResultOptions,
				theme: ToolTheme,
			): Text {
				const receipt = receiptFor(spec.name, result.details);
				if (expanded) return new Text(theme.fg("toolOutput", receipt.detail.join("\n")), 0, 0);
				return new Text(theme.fg(receipt.bad ? "warning" : "dim", receipt.line), 0, 0);
			},
		});

	const areaSelectorSchema = {
		type: "object",
		properties: {
			kind: { type: "string", enum: ["file", "tree"] },
			path: { type: "string", minLength: 1, maxLength: 512, description: "Repository-relative path; never use '.', absolute paths, traversal, or globs." },
		},
		required: ["kind", "path"],
		additionalProperties: false,
	} as const;
	const selectorScopeSchema = {
		type: "object",
		properties: {
			kind: { type: "string", enum: ["selectors"] },
			selectors: { type: "array", minItems: 1, maxItems: 32, items: areaSelectorSchema },
		},
		required: ["kind", "selectors"],
		additionalProperties: false,
	} as const;
	const changedFilesScopeSchema = {
		type: "object",
		properties: {
			kind: { type: "string", enum: ["changed-files"] },
		},
		required: ["kind"],
		additionalProperties: false,
	} as const;
	const cleanerScopeSchema = {
		description: "Use exactly {kind:'changed-files'} or {kind:'selectors',selectors:[{kind:'file'|'tree',path:'relative/path'}]}.",
		oneOf: [changedFilesScopeSchema, selectorScopeSchema],
	} as const;

	registerEinTool({
		name: "ein_sdd_participants",
		label: "Ein SDD Participants",
		description: "Attempt a best-effort advisory Cleaner/Architect pass after apply when enabled and return the next bounded participant task. Report unavailable or blocked audits honestly, then continue to sdd-verify; a source mutation invalidates freshness and must be verified.",
		parameters: { type: "object", properties: { change: { type: "string" } }, required: ["change"] } as const,
		async execute(_id, params: { change: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			if (!isSafeChangeName(params.change)) throw new Error("Invalid SDD change name.");
			const plan = planSddParticipants(ctx.cwd, sddPreflightSessionKey(ctx), params.change);
			return { content: [{ type: "text", text: JSON.stringify(plan) }], details: plan };
		},
	});

	registerEinTool({
		name: "ein_cleaner_audit",
		label: "Ein Cleaner Audit Evidence",
		description: "Read-only deterministic evidence packet for a bounded existing-code Cleaner audit. Rejects invalid, root-wide, missing, oversized, symlinked, or empty scopes before semantic inspection.",
		parameters: {
			type: "object",
			properties: {
				scope: cleanerScopeSchema,
			},
			required: ["scope"],
			additionalProperties: false,
		} as const,
		async execute(_id, params: { scope: CleanerAuditScope }, _signal, _onUpdate, ctx: ExtensionContext) {
			const evidence = collectCleanerAuditEvidence(ctx.cwd, params.scope);
			return { content: [{ type: "text", text: JSON.stringify(evidence) }], details: evidence };
		},
	});
	const cleanerEvidence = new Map<string, { passive: CleanerPassiveEvidence; plan?: CleanerActivePlan; active?: CleanerActiveEvidence }>();
	const cleanerEvidenceKey = (stateRef: string, areaId: string): string => `${stateRef}\0${areaId}`;
	registerEinTool({
		name: "ein_cleaner_evidence", label: "Ein Cleaner Evidence",
		description: "Collect bounded source, environment, complexity, and structural-duplication evidence for one exact current Audit state. Model content includes compact measured facts plus every admitted source file.",
		parameters: { type: "object", properties: { scope: cleanerScopeSchema }, required: ["scope"], additionalProperties: false } as const,
		async execute(_id, params: { scope: CleanerAuditScope }, _signal, _onUpdate, ctx: ExtensionContext) {
			const passive = collectCleanerPassiveEvidence(ctx.cwd, params.scope); cleanerEvidence.set(cleanerEvidenceKey(passive.stateRef, passive.areaId), { passive });
			return { content: [{ type: "text", text: cleanerEvidenceForModel(passive) }], details: passive };
		},
	});
	registerEinTool({
		name: "ein_cleaner_active_evidence", label: "Ein Cleaner Active Evidence",
		description: "Plan exact test/coverage argv without execution, or ingest externally produced bound artifacts and derive CRAP. Requires passive evidence from the same session and state.",
		parameters: { type: "object", properties: { action: { type: "string", enum: ["plan", "ingest"] }, stateRef: { type: "string" }, areaId: { type: "string" }, input: { type: "object" } }, required: ["action", "stateRef", "areaId", "input"] } as const,
		async execute(_id, rawParams): Promise<{ content: { type: "text"; text: string }[]; details: CleanerActivePlan | CleanerActiveEvidence }> {
			const params = rawParams as { action: "plan" | "ingest"; stateRef: string; areaId: string; input: CleanerPlanInput | { testArtifactPath: string; coverageArtifactPath?: string; binding?: import("../lib/cleaner-test-evidence.ts").CleanerTestBinding } }; const entry = cleanerEvidence.get(cleanerEvidenceKey(params.stateRef, params.areaId)); if (!entry) throw new Error("Cleaner passive evidence is missing or stale");
			if (params.action === "plan") { const plan = planCleanerActiveEvidence(entry.passive, params.input as CleanerPlanInput); entry.plan = plan; return { content: [{ type: "text", text: JSON.stringify({ stateRef: params.stateRef, test: plan.test, coverage: plan.coverage }) }], details: plan }; }
			if (!entry.plan) throw new Error("Cleaner active evidence plan is missing"); const active = ingestCleanerActiveEvidence(entry.passive, entry.plan, params.input as { testArtifactPath: string; coverageArtifactPath?: string; binding?: import("../lib/cleaner-test-evidence.ts").CleanerTestBinding }); entry.active = active;
			return { content: [{ type: "text", text: cleanerEvidenceForModel(entry.passive, active) }], details: active };
		},
	});

	const improveParameters = {
		type: "object",
		properties: { auditEvidence: { type: "object" }, finding: { type: "object" }, request: { type: "object" } },
		required: ["auditEvidence", "finding", "request"],
	} as const;
	registerEinTool({
		name: "ein_cleaner_improve_admit", label: "Ein Cleaner Improve Admit",
		description: "Validate a bounded behavior-preserving exact-replacement plan against fresh Cleaner Audit evidence without writing.",
		parameters: improveParameters,
		async execute(_id, params: { auditEvidence: ReturnType<typeof collectCleanerAuditEvidence>; finding: CleanerFindingV1; request: CleanerBoundedMutationRequestV1 }) {
			const outcome = admitCleanerImprove(params);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});
	registerEinTool({
		name: "ein_cleaner_improve_apply", label: "Ein Cleaner Improve Apply",
		description: "Apply one previously admissible exact replacement; returns verification-required or mutation-uncertain evidence and a bounded recovery source.",
		parameters: improveParameters,
		async execute(_id, params: { auditEvidence: ReturnType<typeof collectCleanerAuditEvidence>; finding: CleanerFindingV1; request: CleanerBoundedMutationRequestV1 }) {
			const outcome = applyCleanerImprove(params);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});
	registerEinTool({
		name: "ein_cleaner_improve_complete", label: "Ein Cleaner Improve Complete",
		description: "Assess completion using the resulting source state, focused verification record, and current project/router verification evidence.",
		parameters: { type: "object", properties: { transition: { type: "object" }, verification: { type: ["object", "null"] } }, required: ["transition", "verification"] } as const,
		async execute(_id, params: { transition: CleanerStateTransitionRecordV1; verification: CleanerVerificationRecordV1 | null }, _signal, _onUpdate, ctx: ExtensionContext) {
			const outcome = completeCleanerImprove(ctx.cwd, params.transition, params.verification);
			return { content: [{ type: "text", text: JSON.stringify(outcome) }], details: outcome };
		},
	});

	registerEinTool({
		name: "ein_architect_evidence", label: "Ein Architect Evidence",
		description: "Collect immutable read-only repository evidence for a bounded explicit Architect scope; graph evidence is unavailable unless an authoritative runtime contract exists.",
		parameters: { type: "object", properties: { scope: selectorScopeSchema }, required: ["scope"], additionalProperties: false } as const,
		async execute(_id, params: { scope: unknown }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = collectArchitectEvidence(ctx.cwd, params.scope);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});
	registerEinTool({
		name: "ein_architect_plan_bind", label: "Ein Architect Plan Bind",
		description: "Validate required architecture-plan shape and bind it to fresh scope, evidence, and repository state without writing.",
		parameters: { type: "object", properties: { evidence: { type: "object" }, plan: { type: "object" } }, required: ["evidence", "plan"] } as const,
		async execute(_id, params: { evidence: object; plan: object }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = bindArchitectPlan(ctx.cwd, params.evidence as ArchitectEvidence, params.plan);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});
	registerEinTool({
		name: "ein_architect_validate", label: "Ein Architect Validate",
		description: "Re-collect current evidence and admit a fresh, bound, in-scope plan for model consistency assessment; never executes the plan.",
		parameters: { type: "object", properties: { plan: { type: "object" } }, required: ["plan"] } as const,
		async execute(_id, params: { plan: object }, _signal, _onUpdate, ctx: ExtensionContext) {
			const result = validateArchitectPlan(ctx.cwd, params.plan as BoundArchitectPlan);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});

	pi.registerCommand("ein:models", {
		description: t(
			"cmd.models.description",
			"Ver o configurar los modelos activos por agente en Ein",
		),
		handler: async (_args, ctx) => {
			await handleModelsCommand(pi, ctx);
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

	pi.registerCommand("ein:linear", {
		description: t(
			"cmd.linear.description",
			"Encender o apagar la integración opcional con Linear",
		),
		handler: async (_args, ctx) => {
			await handleLinearIntegrationCommand(ctx);
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
			const lines: string[] = [t("resume.title", "// 000. sesiones recientes"), ""];
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

	// --- ein:accounting: renderiza el AccountingReport. Sólo formatea lo que
	// el store + [CORE] ya calcularon (R12); ninguna cifra se computa aquí.

	function formatCoverage(coverage: Coverage): string {
		return `[${coverage.status}, ${coverage.attributed}/${coverage.total}]`;
	}

	function formatKnown(known: Known<string | number>): string {
		return known.status === "known" ? String(known.value) : "unknown";
	}

	function formatTotal(label: string, total: Total): string {
		if (total.status === "unknown") return `- ${label}: unknown ${formatCoverage(total.coverage)}`;
		return `- ${label}: ${total.value} ${formatCoverage(total.coverage)}`;
	}

	function formatStat(label: string, stat: Stat): string {
		if (stat.status === "unknown") return `- ${label}: unknown ${formatCoverage(stat.coverage)}`;
		return `- ${label}: mean=${stat.mean.toFixed(2)} p95=${stat.p95} max=${stat.max} n=${stat.n} ${formatCoverage(stat.coverage)}`;
	}

	function formatSlice(title: string, slice: Slice): string[] {
		return [
			`${title} (runs=${slice.runs})`,
			formatTotal("coste", slice.cost),
			formatTotal("tokens de salida", slice.outputTokens),
			formatStat("pico prompt", slice.peakPromptTokens),
			formatStat("pico secuencia", slice.peakSequenceTokens),
			formatStat("turnos por run", slice.turnsPerRun),
			`- fallos: ${slice.outcomes.failures.count} (indeterminado ${slice.outcomes.failures.undetermined}) ${formatCoverage(slice.outcomes.failures.coverage)}`,
			`- fallback de modelo: ${slice.outcomes.modelFallbacks.count} (indeterminado ${slice.outcomes.modelFallbacks.undetermined}) ${formatCoverage(slice.outcomes.modelFallbacks.coverage)}`,
			`- reruns de proceso: ${slice.outcomes.processReruns.count} (indeterminado ${slice.outcomes.processReruns.undetermined}, maxRunIndex ${formatKnown(slice.outcomes.maxRunIndex)}) ${formatCoverage(slice.outcomes.processReruns.coverage)}`,
			`- canales: transcript=${slice.channels.transcript} artifact=${slice.channels.artifact} sin-atribuir=${slice.channels.unattributed}`,
		];
	}

	function formatNamedSlices<T extends Slice>(kind: "model" | "agent", entries: readonly T[], nameOf: (entry: T) => string | null): string[] {
		return entries.flatMap((entry) => [
			"",
			...formatSlice(`-- ${kind}: ${nameOf(entry) ?? "unattributed"} --`, entry),
		]);
	}

	pi.registerCommand("ein:accounting", {
		description: t(
			"cmd.accounting.description",
			"Ver el coste medido de las sesiones de Ein (dinero, tokens, turnos y fallos)",
		),
		handler: async (_args, ctx) => {
			const report = readAccountingReport();
			if (report.store === "absent") {
				ctx.ui.notify(t("accounting.absent", "// 000. accounting\n\n- No hay directorio de sesiones todavia."), "info");
				return;
			}
			const snapshot = report.snapshot;
			const lines: string[] = [
				t("accounting.title", "// 000. accounting"),
				"",
				t("accounting.snapshot", "-- snapshot --"),
				`- generatedAt: ${snapshot.generatedAt}`,
				`- corpus: ${formatKnown(snapshot.corpusFrom)} .. ${formatKnown(snapshot.corpusTo)}`,
				`- sessions=${formatKnown(snapshot.sessions)} transcripts=${formatKnown(snapshot.transcripts)} artifacts=${formatKnown(snapshot.artifacts)}`,
				`- corruptFiles=${snapshot.corruptFiles} missingFiles=${snapshot.missingFiles}`,
				`- runsAttributed=${snapshot.runsAttributed} runsUnattributable=${snapshot.runsUnattributable}`,
				`- discovery: scanned=${snapshot.discovery.scanned} skipped=${snapshot.discovery.skipped} scanLimitExceeded=${snapshot.discovery.scanLimitExceeded}`,
				"",
				...formatSlice(t("accounting.overall", "-- overall --"), report.overall),
				"",
				...formatSlice(t("accounting.parent", "-- parent --"), report.partition.parent),
				"",
				...formatSlice(t("accounting.subagent", "-- subagent --"), report.partition.subagent),
				...formatNamedSlices("model", report.byModel, (entry) => entry.model),
				...formatNamedSlices("agent", report.byAgent, (entry) => entry.agent),
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// [DEPRECATED] ein:sdd-check queda como alias del canónico ein:sdd-audit.
	// El handler es compartido para que ambos resuelvan al mismo flujo.
	async function handleSddAudit(args: string | string[], ctx: ExtensionContext) {
		const raw = commandArgsText(args);
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
				`// 000. sdd ${phase.toUpperCase()} CHECK`,
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
	registerEinTool({
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
			const prefs = getSddPreflightPreferences(ctx);
			let text = formatSddStatus(status, active, prefs);
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
			return { content: [{ type: "text", text }], details: { status, activeChanges: active, plan } };
		},
	});

	// ── Tool determinista: forecast de tamaño de PR (Review Workload Guard) ──
	// El parent la llama ANTES de delegar un PR en vez de ejecutar git inline.
	// Dueña única del pathspec de exclusión (antes triplicado en prompts).
	registerEinTool({
		name: "ein_review_forecast",
		label: "Ein Review Forecast",
		description: [
			"Deterministic PR-size forecast for the Review Workload Guard.",
			"Uses a fixed production pathspec and returns changed production lines,",
			"non-whitespace UTF-8 bytes, touched files and per-file volume; test lines stay separate.",
			"The line count remains the gate in this measurement slice.",
			"With `base` it measures `base..HEAD`; without it, the working tree.",
			"Call this before delegating a PR. Reads git only.",
		].join(" "),
		parameters: {
			type: "object",
			properties: { base: { type: "string", description: "PR base ref (e.g. `main`, `dev`). Omit to measure the working tree (staged + unstaged)." } },
		} as const,
		async execute(_id, params: { base?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const budget = getSddPreflightPreferences(ctx)?.reviewBudgetLines ?? 400;
			const forecast = reviewForecast(ctx.cwd, params?.base);
			return {
				content: [{ type: "text", text: formatReviewForecast(forecast, budget) }],
				details: { ...forecast, budget, overBudget: forecast.ok && forecast.production > budget },
			};
		},
	});

	// ── Tool determinista: gatekeeper de artefactos de un cambio ──
	registerEinTool({
		name: "ein_sdd_lane",
		label: "Ein SDD Lane",
		description:
			"Declare or read how many phases a change is driven with. `standard` is the full seven; `micro` skips map and tasks for a genuinely small change, and skips NOTHING else — verify and close stay hard gates. Call it WITHOUT `lane` to read. The user decides the lane: there is no deterministic signal before planning, so never pick it on their behalf — ask when a change looks small. Reads and writes only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				lane: { type: "string", enum: ["micro", "standard"], description: "Omit to read the current lane without changing it." },
			},
		} as const,
		async execute(_id, params: { change?: string; lane?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change || !isSafeChangeName(change)) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "lane", params?.change) ?? "// sdd lane — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const changeDir = join(resolveChangesDir(ctx.cwd), change);
			if (!existsSync(changeDir)) {
				return { content: [{ type: "text", text: `// sdd lane — '${change}' no existe.` }], details: { ok: false, reason: "unknown change" } };
			}
			const requested = normalizeLane(params?.lane);
			if (requested) writeChangeLane(changeDir, requested);
			const lane = readChangeLane(changeDir);
			const skipped = laneSkips(lane);
			const detail = skipped.length ? ` Se salta: ${skipped.join(", ")}. Verify y close siguen siendo puertas duras.` : "";
			return {
				content: [{ type: "text", text: `// sdd lane — '${change}': ${LANE_LABEL[lane]}.${detail}` }],
				details: { ok: true, change, lane, skipped },
			};
		},
	});

	// ── Tool determinista: postura del cambio (TDD + carril) ──
	// Existe para que la decisión del preflight tenga una superficie legible desde
	// una fase, y para que `sdd-apply.md` pueda nombrar UNA herramienta que existe
	// en los dos runtimes (aquí, y `ein-cc-sdd preflight` en Claude).
	registerEinTool({
		name: "ein_sdd_preflight",
		label: "Ein SDD Preflight",
		description:
			"Read (or record) how this change is driven: strict TDD stance and lane. Call it WITHOUT arguments to read the decision the preflight already stored — it is authoritative over `openspec/config.yaml` `strict_tdd`. A stance already decided is never replaced without `force`. Reads and writes only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				tdd: { type: "string", enum: ["off", "strict"], description: "Omit to read without deciding." },
				lane: { type: "string", enum: ["micro", "standard"], description: "Omit to leave the declared lane untouched." },
				force: { type: "boolean", description: "Replace a stance that was already decided." },
			},
		} as const,
		async execute(_id, params: { change?: string; tdd?: string; lane?: string; force?: boolean }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "preflight", params?.change) ?? "// sdd preflight — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
			}
			const stance = readChangeStance(ctx.cwd, change);
			if (!stance) {
				return { content: [{ type: "text", text: `// sdd preflight — '${change}' no existe.` }], details: { ok: false, reason: "unknown change" } };
			}
			const requested = normalizeTddStance(params?.tdd);
			if (params?.tdd !== undefined && !requested) {
				return { content: [{ type: "text", text: `// sdd preflight — postura de TDD desconocida: ${JSON.stringify(params.tdd)}.` }], details: { ok: false, reason: "unknown stance" } };
			}
			if (requested) {
				if (stance.tdd && !params?.force) {
					return {
						content: [{ type: "text", text: `// sdd preflight — '${change}' ya decidido: TDD ${stance.tdd} (por ${stance.decidedBy ?? "pi"}). Usa force para reemplazarlo.` }],
						details: { ok: false, reason: "already decided", tdd: stance.tdd },
					};
				}
				writePreflightRecord(stance.changeDir, { tdd: requested, decidedBy: "pi" });
			}
			const lane = normalizeLane(params?.lane);
			if (lane) writeChangeLane(stance.changeDir, lane);
			const current = readChangeStance(ctx.cwd, change);
			const text = [`// sdd preflight — '${change}'`, renderChangeStanceLine(current), changeStanceDirective(current)]
				.filter((part) => part.length > 0)
				.join("\n");
			return {
				content: [{ type: "text", text }],
				details: { ok: true, change, tdd: current?.tdd ?? null, lane: current?.lane ?? "standard" },
			};
		},
	});

	registerEinTool({
		name: "ein_sdd_check",
		label: "Ein SDD Check",
		description:
			"Deterministic gatekeeper: lint every present SDD artifact of a change (sections, required signals like verify's status line, placeholders, size). Run it AFTER each phase before advancing. Returns a compact per-phase summary (OK/ERRORS + issues). Reads only the filesystem.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				phase: { type: "string", enum: ["scope", "map", "design", "tasks", "apply", "verify"] },
				memoryCandidate: MEMORY_CANDIDATE_SCHEMA,
			},
		} as const,
		async execute(_id, params: { change?: string; phase?: string; memoryCandidate?: unknown }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change;
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "check", params?.change) ?? "// sdd check — no active change in openspec/changes/.") }], details: { ok: false, reason: "no active change" } };
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
			const raw = commandArgsText(args);
			const change = raw.trim() || undefined;
			const s = resolveSddStatus(ctx.cwd, change);
			const active = listActiveChanges(ctx.cwd);
			ctx.ui.notify(formatSddStatus(s, active), s.blocked.length ? "warning" : "info");
		},
	});

	pi.registerCommand("ein:focus", {
		description: t("cmd.focus.description", "Focus the session TODO on a named active change"),
		handler: async (args, ctx) => {
			const parts = commandArgsText(args).trim().split(/\s+/).filter(Boolean);
			if (parts.length !== 1) {
				ctx.ui.notify(t("focus.usage", "Usage: /ein:focus <change>"), "info");
				return;
			}
			const change = parts[0]!;
			const active = listActiveChanges(ctx.cwd);
			if (!isSafeChangeName(change) || !active.includes(change)) {
				const available = active.length > 0 ? active.join(", ") : t("focus.none", "none");
				ctx.ui.notify(tf("focus.invalid", "Cannot focus '{0}'. Active changes: {1}", change, available), "warning");
				return;
			}
			publishSessionBinding({ version: 1, action: "bind", change });
			ctx.ui.notify(tf("focus.success", "TODO focused on {0}.", change), "info");
		},
	});

	pi.registerCommand("ein:sdd-next", {
		description: t("cmd.sdd-next.description", "Show the next recommended SDD step for a named change and hand it to the orchestrator"),
		handler: async (args, ctx) => {
			const parsed = parseSddNextArgs(args);
			if (!parsed.change) {
				ctx.ui.notify(formatSddNextHelp(), "info");
				return;
			}

			const report = resolveSddNext(ctx.cwd, parsed.change);
			ctx.ui.notify(formatSddNext(report), report.exists && report.blocked.length === 0 ? "info" : "warning");
			if (report.exists && report.change === parsed.change) {
				publishSessionBinding({ version: 1, action: "bind", change: parsed.change });
			}
			// El reporte lo lee el usuario; el orquestador no lo ve. Sin este
			// traspaso el comando enseñaba la ruta y no la entregaba a nadie.
			// Automatic Cleaner/Architect participation is advisory: the handoff
			// always follows the mechanical router, including when an audit is
			// unavailable, pending, or blocked.
			const handoff = sddNextHandoff(report);
			if (handoff) pi.sendUserMessage(handoff);
		},
	});

	// ── SDD close (canonical) ──────────────────────────────────────────────────
	// Lógica compartida por el comando /ein:sdd-close y el tool ein_sdd_close: el
	// move determinista (con guard de readiness) + memoria de cierre + refresco de
	// EIN.md. Un único punto para que ambas superficies se comporten igual.
	async function performSddClose(ctx: ExtensionContext, change: string, options: CloseOptions) {
		const result = closeChange(ctx.cwd, change, options);
		let memory: SafeMemoryReceipt | undefined;
		if (result.ok) {
			publishSessionBinding({ version: 1, action: "invalidate", change });
			memory = await saveArchivedCloseMemory(ctx, change, result.to);
			// FORGE -> al cerrar un cambio, refresca la zona AUTO de EIN.md (comandos/
			// estructura/docs) para que el índice no envejezca. Solo si ya existe: el
			// cierre no es momento de crearlo (eso es /ein:init o el onboarding).
			if (existsSync(einMdPath(ctx.cwd))) writeEinMd(ctx.cwd);
		}
		return { result, memory };
	}

	async function handleSddClose(args: string | string[], ctx: ExtensionContext) {
		const parsed = parseSddCloseArgs(args);
		const change = parsed.change ?? resolveSddStatus(ctx.cwd).change ?? "";
		if (!change) {
			const ambiguity = changeUnavailableMessage(ctx.cwd, "close", parsed.change);
			ctx.ui.notify(
				`${ambiguity ?? "Sin cambio que cerrar."} Uso: /ein:sdd-close <change> [--reconciliation-profile scope-only-out-of-flow --reconciliation-evidence <canonical-path>] --reason "<audit reason>". Legacy: --force --reason "<audit reason>"`,
				"warning",
			);
			return;
		}
		const { result: r, memory } = await performSddClose(ctx, change, {
			force: parsed.force,
			legacyReason: parsed.reason,
			reconciliationProfile: parsed.reconciliationProfile,
			reconciliationEvidencePath: parsed.reconciliationEvidencePath,
		});
		const memoryMessage = memory
			? memory.status === "saved" && memory.reason === "acknowledged"
				? " Memoria: guardada."
				: ` Memoria: ${memory.status}/${memory.reason}.`
			: "";
		const success = r.legacyEscape
			? `Closed through legacy escape (spec state remained unresolved): ${r.legacyEscape.reason}${memoryMessage}`
			: r.reconciliation
				? `Reconciled out-of-flow change '${change}' closed with profile ${r.reconciliation.profile}.${memoryMessage}`
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
	registerEinTool({
		name: "ein_sdd_close",
		label: "Ein SDD Close",
		description:
			"Deterministically archive a VERIFIED change. For audited scope-only delivery outside SDD, explicitly provide reconciliationProfile `scope-only-out-of-flow`, the canonical reconciliationEvidencePath, and reason. `--force --reason \"<audit reason>\"` is only for an otherwise complete, freshly verified declarationless legacy record. It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs. Moves the filesystem; never commits or pushes.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				force: { type: "boolean", description: "Use only with reason for the narrow declarationless legacy escape; eligibility remains enforced by the close library." },
				reason: { type: "string", description: "Audit reason required with force or reconciliation; validated by the shared close library." },
				reconciliationProfile: { type: "string", enum: ["scope-only-out-of-flow"], description: "Explicit audited reconciliation profile; never inferred from evidence." },
				reconciliationEvidencePath: { type: "string", description: "Canonical openspec/changes/<change>/out-of-flow-reconciliation.json path." },
			},
		} as const,
		async execute(_id, params: { change?: string; force?: boolean; reason?: string; reconciliationProfile?: string; reconciliationEvidencePath?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const change = params?.change ?? resolveSddStatus(ctx.cwd).change ?? "";
			if (!change) {
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "close", params?.change) ?? "// sdd close — no active change to close.") }], details: { ok: false, reason: "no active change" } };
			}
			const reason = params?.reason;
			const { result, memory } = await performSddClose(ctx, change, {
				force: Boolean(params?.force),
				legacyReason: reason,
				reconciliationProfile: params?.reconciliationProfile,
				reconciliationEvidencePath: params?.reconciliationEvidencePath,
			});
			const text = result.ok
				? result.legacyEscape
					? `// sdd close — Closed through legacy escape (spec state remained unresolved): ${result.legacyEscape.reason}`
					: result.reconciliation
						? `// sdd close — Reconciled '${change}' with profile ${result.reconciliation.profile}; archived to ${result.to.replace(ctx.cwd, ".")}.`
						: `// sdd close — Verified change '${change}' closed; archived to ${result.to.replace(ctx.cwd, ".")}.`
				: `// sdd close — '${change}' NOT closed: ${result.reason}`;
			return { content: [{ type: "text", text }], details: { ...result, memory } };
		},
	});

	// Sin este tool el motor de sincronización era código muerto: solo lo
	// llamaban los tests. Un cambio con deltas se quedaba en `pending` para
	// siempre porque NADA en el producto sabía generar `sync-report.md`, y el
	// cierre lo exigía. Es la salida determinista de ese estado.
	registerEinTool({
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
				return { content: [{ type: "text", text: (changeUnavailableMessage(ctx.cwd, "sync", params?.change) ?? "// openspec sync — no active change.") }], details: { ok: false, reason: "no active change" } };
			}
			try {
				const { plan, changed } = await synchronizeOpenSpecFilesystem(ctx.cwd, change);
				const domains = plan.domains.map((d) => d.domain).join(", ") || "(ninguno)";
				const head = changed
					? `// openspec sync — '${change}': ${plan.state}. dominios: ${domains}.`
					: `// openspec sync — '${change}': ya sincronizado, sin cambios. dominios: ${domains}.`;
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
					content: [{ type: "text", text: `// openspec sync — '${change}' FALLÓ: ${message}\nLos specs se restauraron a su estado previo salvo que el mensaje diga lo contrario.` }],
					details: { ok: false, reason: message },
				};
			}
		},
	});

	// P0-A. Los deltas se escribían a mano y fallaban el parser estricto una y otra
	// vez (churn de scope: el trace real gastó 3 corridas de sdd-scope solo en dar
	// con el formato). Esto los genera desde datos estructurados y los valida
	// re-parseando ANTES de escribir: nunca deja en disco un delta que el sync
	// rechazaría en close.
	registerEinTool({
		name: "ein_openspec_delta_write",
		label: "Ein OpenSpec Delta Write",
		description:
			"Write a change's OpenSpec behaviour delta (openspec/changes/<change>/specs/<domain>/spec.md) from STRUCTURED operations — never hand-write the delta markdown. Serializes deterministically and re-parses with the strict grammar before writing; refuses (writes nothing) if the operations are malformed (e.g. requirement not starting with 'The system MUST/SHOULD/MAY', empty fields, duplicate scenario IDs, no operations). Operation order is irrelevant; output is sorted by scenario ID. Reads and writes only the filesystem; never commits.",
		parameters: {
			type: "object",
			properties: {
				change: { type: "string", description: "Change name under openspec/changes/ (optional; defaults to the active one)." },
				domain: { type: "string", description: "Canonical domain, kebab-case (e.g. scout-routing)." },
				operations: {
					type: "array",
					description: "Behaviour deltas. Each: kind ADDED|MODIFIED|REMOVED. ADDED/MODIFIED need `scenario` {id,title,requirement,given,when,then}; REMOVED needs `scenarioId` and `reason`.",
					items: {
						type: "object",
						properties: {
							kind: { type: "string", enum: ["ADDED", "MODIFIED", "REMOVED"] },
							scenario: {
								type: "object",
								properties: {
									id: { type: "string" },
									title: { type: "string" },
									requirement: { type: "string", description: "MUST begin with 'The system MUST', 'The system SHOULD', or 'The system MAY'." },
									given: { type: "string" },
									when: { type: "string" },
									then: { type: "string" },
								},
							},
							scenarioId: { type: "string" },
							reason: { type: "string" },
						},
						required: ["kind"],
					},
				},
			},
			required: ["domain", "operations"],
		} as const,
		async execute(_id, params: { change?: string; domain?: string; operations?: unknown[] }, _signal, _onUpdate, ctx: ExtensionContext) {
			// Esta tool ESCRIBE: bajo ambigüedad se para antes de tocar disco, en vez
			// de dejar que el escritor falle con un cambio vacío y un motivo que no
			// nombra a los candidatos.
			const unavailable = changeUnavailableMessage(ctx.cwd, "delta", params?.change);
			if (unavailable) {
				return { content: [{ type: "text", text: unavailable }], details: { ok: false, reason: "no change selected" } };
			}
			// La lógica vive en lib/openspec-delta-write.ts: el CLI de Claude llama
			// exactamente a la misma función, así que no hay dos escritores.
			const result = writeOpenSpecDelta({
				cwd: ctx.cwd,
				change: params?.change ?? resolveSddStatus(ctx.cwd).change ?? "",
				domain: params?.domain ?? "",
				operations: Array.isArray(params?.operations) ? params.operations : [],
			});
			if (!result.ok) {
				const text = result.code === "malformed"
					? `// openspec delta — RECHAZADO, no se escribió nada: ${result.reason}. Corrige las operaciones y reintenta; el delta se valida con la MISMA gramática que el sync.`
					: `// openspec delta — ${result.reason}.`;
				return { content: [{ type: "text", text }], details: { ok: false, reason: result.reason } };
			}
			return { content: [{ type: "text", text: `// openspec delta — '${result.change}': escrito openspec/changes/${result.change}/specs/${result.domain}/spec.md (${result.operations} operación(es), validado). No escribas la declaración spec_delta: none: el delta ES la declaración.` }], details: { ...result } };
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
			lines.push("// 000. ein status");
			lines.push(`${t("status.author", "autor")}: samuhlo`);
			lines.push(`${t("status.linear", "linear")}: ${readLinearIntegration(ctx.cwd)}`);
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

			lines.push(`// 001. ${t("status.sdd", "SDD")}`);
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

			lines.push(`// 002. ${t("status.skills", "SKILLS")}`);
			lines.push(`${t("status.skills.local", "locales")}: ${localSkills}`);
			lines.push(`${t("status.skills.downloaded", "descargadas")}: ${downloadedSkills}`);
			lines.push("");

			lines.push(`// 003. ${t("status.project", "PROYECTO")}`);
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

			lines.push("// 004. MCP");
			if (mcpServers.length > 0) {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${mcpServers.join(", ")}`);
			} else {
				lines.push(`${t("status.mcp.servers", "servidores")}: ${t("status.mcp.none", "ninguno configurado")}`);
			}
			lines.push("");

			lines.push(`// 005. ${t("status.diag", "DIAGNOSTICO")}`);
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
					: t("help.short", "// ayuda ein — autor: samuhlo");
			ctx.ui.notify(text, "info");
		},
	});
}
