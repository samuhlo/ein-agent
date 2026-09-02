// =============================================================================
// EIN AI
// Extensión principal de Ein: ensambla los módulos de lib/ (persona,
// guardrails, model-config, models-panel, sdd-preflight) y registra los
// hooks de sesión y los comandos /ein:*. La lógica vive en lib/; aquí solo
// se cablea.
// =============================================================================

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
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
	type SddIntentPreflightInput,
	type SddPreflightPreferences,
} from "../lib/sdd-preflight.ts";
import { bootstrapOpenSpecConfig } from "../lib/openspec-config-bootstrap.ts";
import { collectDelegationItems, delegationShapeIsUnrecognized } from "../lib/delegation-shape.ts";
import {
	type DeliveryIntent,
	deliveryIntentActive,
	nextDeliveryIntent,
	readGitDeliveryMode,
} from "../lib/git-delivery.ts";
import { buildEinPrompt, readPersonaMode } from "../lib/persona.ts";
import {
	LANG_LABEL,
	artifactLanguageDirective,
	readArtifactLang,
	readChatLang,
} from "../lib/lang.ts";
import { t, tf } from "../lib/i18n/strings.ts";
import { maybeWrapBashInput } from "../lib/hypa.ts";
import { runOnboarding } from "../lib/onboarding.ts";
import {
	codegraphDirective,
	offerCodegraphInit,
	shouldOfferCodegraphInit,
} from "../lib/codegraph.ts";
import { readLinearIntegration } from "../lib/linear-integration.ts";
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
import { registerAdvisoryTools } from "./internal/ein-advisory-tools.ts";
import { registerGeneralCommands } from "./internal/ein-general-commands.ts";
import { registerOpenSpecWriteTools } from "./internal/ein-openspec-write-tools.ts";
import {
	memoryLifecycleForSession,
	saveArchivedCloseMemory,
	saveCheckedPhaseMemory,
	skippedMemoryReceipt,
} from "./internal/ein-sdd-memory.ts";
import { registerSddChangeSettings } from "./internal/ein-sdd-change-settings.ts";
import { registerSddReadSurface } from "./internal/ein-sdd-read-surface.ts";
import { formatChangeLint } from "./internal/ein-sdd-presentation.ts";
import { createEinToolRegistrar } from "./internal/ein-tool-registration.ts";
import { lintChange, type SddPhase } from "../lib/sdd-guardrails.ts";
import { resolveActiveChange } from "../lib/sdd-preflight-record.ts";
import { aggregateSddBudget, changeUnavailableMessage, formatBudget, listActiveChangeSummaries, resolveChangesDir, resolveSddNext, resolveSddStatus, sddNextHandoff } from "../lib/sdd-router.ts";
import { SDD_SESSION_BINDING_EVENT_CHANNEL, type SessionBindingEventV1 } from "../lib/sdd-session-binding.ts";
import { closeChange, type CloseOptions } from "../lib/sdd-close.ts";
import { parseSddCloseArgs } from "../lib/sdd-close-args.ts";
import {
	MEMORY_CANDIDATE_SCHEMA,
	appendMemoryReceipt,
	safeMemoryReceipt,
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
	readEinMd,
	writeEinMd,
} from "../lib/project-context.ts";
import { AGENT_DIR } from "./ein-paths";
import { readInstalledVersion, staleSessionNudge } from "../lib/session-version";
import { DOMAIN_ID_PATTERN, sha256 } from "../lib/openspec-spec-contract.ts";
import { evaluateStaging } from "../lib/git-staging.ts";
import { acceptTrackedScoutResult, normalizeScoutLaunch, type ScoutTracking } from "../lib/scout-contract.ts";
import {
	clearAgentControlSession,
	internalAgentRoutingDirective,
	readAgentControlStatus,
	routeAgentControl,
	type EinInternalAgent,
} from "../lib/agent-controls.ts";
import { admitSddParticipantCall, clearSddParticipantSession, completeSddParticipantCall, getSddParticipantCall, participantResultIsUnrecognized, sddParticipantCallsAreTracked, type SddParticipant } from "../lib/sdd-participants.ts";

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

	const registerEinTool = createEinToolRegistrar(pi);

	registerAdvisoryTools(registerEinTool);

	registerGeneralCommands(pi);

	registerSddReadSurface(pi, registerEinTool);

	registerSddChangeSettings(registerEinTool);

	registerOpenSpecWriteTools(registerEinTool);

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
						lines.push(`- ${summary.change}: phase=${summary.currentPhase} · next=${summary.nextRecommended} · ready=${summary.tasks.ready} · blocked=${summary.tasks.blocked} · budget=${formatBudget(summary.budget)}`);
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
