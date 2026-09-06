// =============================================================================
// SDD PREFLIGHT — control de la sesión SDD
// La "revisión antes de despegar": una vez al arrancar decide CÓMO se trabaja y
// deja escrito el bloque "## SDD Session Preflight" que el motor inyecta en el
// prompt. Dos mitades del mismo dominio (control de la sesión SDD):
//
//   1. PREFERENCIAS DE SESIÓN (modo de ejecución, cuaderno Engram), preguntadas
//      una vez. La intención del CAMBIO sigue un único flujo propietario:
//      adopta o reabre por materialKey, presenta normal/small/bypass y solo
//      persiste resoluciones cerradas. TDD y lane se consumen desde disco o sus
//      defaults técnicos; ya no forman un cuestionario paralelo. El bloque
//      renderizado incluye el Review Workload Guard con budgets fijos.
//   2. SHAPING DE DELEGACIÓN: da forma a las delegaciones a las fases SDD — el
//      gate de TDD por tarea (resuelve el `ask` de forma determinista, que en un
//      chain el parent no puede preguntar), e inyecta `acceptance`/turn-budget en
//      fases de planificación/apply para que el runner no las rechace en falso.
//
// Piezas que NO son de este dominio viven aparte: la memoria de sesión en
// `sdd-session-memory.ts` y la instalación de assets en `sdd-assets.ts` (ambos
// re-exportados aquí por compatibilidad de imports).
//
// Fallback sin UI: sin `ctx.hasUI` (subagente/headless) se aplican defaults
// (interactive / memory off / budgets por defecto / carril standard) y el bloque se
// inyecta igual. Ahí NADIE decidió nada, así que la postura no se persiste: un
// headless no puede dejar escrito en el cambio un "off" que no eligió nadie.
// =============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SddIntentPreflightContext } from "./sdd-intent-preflight-context.ts";
import {
	collectDelegationAgentNames,
	collectDelegationItems,
	collectDelegationTaskTexts,
	delegationIncludes,
	delegationTargetsOnly,
} from "./delegation-shape.ts";
import { type GitBaseline, readGitBaseline, renderGitBaselineLine } from "./git-baseline";
import { DEFAULT_REVIEW_BUDGET_BYTES } from "./review-forecast.ts";
import { type TddMode, readTddMode } from "./tdd";
import {
	DEFAULT_LANE,
	LANE_LABEL,
	laneSkips,
	type SddLane,
} from "./sdd-lane.ts";
import {
	persistSddIntentResolution,
	readChangeStance,
	readSddIntentResolutionState,
	resolveActiveChange,
	updateSddPreflightStance,
} from "./sdd-preflight-record.ts";
import {
	createSddIntentPreflightCoordinator,
	type SddIntentPreflightInput,
	type SddIntentPreflightOutcome,
} from "./sdd-intent-resolution.ts";
import { type PreparedMemory } from "./memory-lifecycle.ts";
import { installSddAssets, sddGlobalAssetDriftCount } from "./sdd-assets.ts";
import {
	type MemoryPreparationLifecycle,
	type SddMemoryMode,
	createSddMemoryLifecycle,
	hasEngramToolCapability,
	normalizeSddMemoryMode,
	prepareSddSessionMemory,
	renderMemoryAdvisory,
} from "./sdd-session-memory.ts";

// Re-export de conveniencia: ein-ai y otros consumidores siguen importando
// memoria/assets desde sdd-preflight, pero su implementación vive en los
// módulos propios (sdd-session-memory.ts, sdd-assets.ts).
export {
	type MemoryPreparationLifecycle,
	type SddMemoryMode,
	createSddMemoryLifecycle,
	normalizeSddMemoryMode,
	prepareSddSessionMemory,
	renderMemoryAdvisory,
	installSddAssets,
	sddGlobalAssetDriftCount,
};

export type SddExecutionMode = "interactive" | "auto";

// Lo que se pregunta UNA vez por sesión: describe cómo trabaja el humano hoy,
// no el cambio. Repetirlo en cada cambio sería la fricción que § 004 prohíbe.
export interface SddSessionAnswers {
	executionMode: SddExecutionMode;
	memoryMode: SddMemoryMode;
	engramAvailable: boolean;
	prompted: boolean;
}

// Compatibility projection for the persisted/default technical stance.
export interface SddChangeStanceAnswers {
	tddMode: TddMode;
	lane: SddLane;
}

export interface SddPreflightPreferences {
	executionMode: SddExecutionMode;
	memoryMode: SddMemoryMode;
	reviewBudgetLines: number;
	tddMode: TddMode;
	engramAvailable: boolean;
	prompted: boolean;
	// Opcionales por compatibilidad: preferencias legacy (y tests que las
	// construyen a mano) no declaran carril ni cambio, y deben seguir
	// renderizando el bloque sin inventarse ninguno de los dos.
	lane?: SddLane;
	/** Cambio al que esta postura quedó atada. `undefined` = aún sin atar. */
	activeChange?: string;
	/** Procedencia de la postura: preguntada al humano o leída del disco. */
	stanceSource?: "asked" | "adopted";
	// Snapshot del árbol al arrancar el preflight (una vez por sesión). Opcional:
	// tests y llamadas legacy pueden omitirlo → no se inyecta la línea baseline.
	gitBaseline?: GitBaseline;
}

interface SddPreflightCallbacks {
	pi: ExtensionAPI;
	memoryLifecycle?: MemoryPreparationLifecycle;
	installAssets?: (cwd: string) =>
		| {
				agents: number;
				chains: number;
				support: number;
				skipped: number;
				installed: number;
		  }
		| Promise<{
				agents: number;
				chains: number;
				support: number;
				skipped: number;
				installed: number;
		  }>;
	applyModelConfig?: (
		cwd: string,
	) =>
		| { updated: number; skipped: number; invalidPath?: string }
		| Promise<{ updated: number; skipped: number; invalidPath?: string }>;
}

// El budget de revisión es fijo (400): el Review Workload Guard lo usa como
// umbral para avisar de un PR irrevisable. Ya no se pregunta al arrancar —
// casi nadie lo cambiaba y era la pregunta de más fricción del preflight.
const DEFAULT_REVIEW_BUDGET_LINES = 400;

const DEFAULT_SDD_PREFLIGHT: SddPreflightPreferences = {
	executionMode: "interactive",
	memoryMode: "off",
	reviewBudgetLines: DEFAULT_REVIEW_BUDGET_LINES,
	tddMode: "auto",
	engramAvailable: false,
	prompted: false,
};

const sddPreflightBySession = new Map<string, SddPreflightPreferences>();
// Las respuestas de SESIÓN sobreviven al cambio de cambio. La intención y su
// postura técnica se resuelven aparte, sin volver a preguntar estas preferencias.
const sddSessionAnswersBySession = new Map<string, SddSessionAnswers>();
const sddPreflightInFlight = new Map<string, Promise<SddPreflightPreferences>>();
const sddSessionMemoryBySession = new Map<string, PreparedMemory>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSddPreflightTrigger(text: string): boolean {
	const trimmed = text.trim();
	if (/^\/sdd(?:[-:][^\s]*)?(?:\s|$)/i.test(trimmed)) return true;
	if (/[?？]\s*$/.test(trimmed)) return false;
	if (
		/\b(?:don't|do\s+not|not\s+use|never\s+use|without\s+using|sin\s+usar|no\s+(?:quiero|queremos|vamos\s+a)?\s*usar)\s+sdd\b/i.test(
			trimmed,
		)
	) {
		return false;
	}
	return [
		/^(?:please\s+)?(?:use|run|start)\s+(?:the\s+|an?\s+)?sdd(?:\s+(?:flow|process|workflow|plan))?\b/i,
		/^(?:please\s+)?(?:do|handle|implement)\b.+\b(?:with|using)\s+(?:the\s+|an?\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:vamos|vayamos)\s+con\s+(?:el\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:usa|usá|usemos|corre|corré|arranca|arrancá|inicia|iniciá|empeza|empezá)\s+(?:el\s+)?sdd\b/i,
		/^(?:por\s+favor[\s,]+)?(?:hacelo|hazlo|hacerlo)\s+(?:con|usando)\s+(?:el\s+)?sdd\b/i,
	].some((pattern) => pattern.test(trimmed));
}

export function sddPreflightSessionKey(ctx: ExtensionContext): string {
	const manager = (ctx as unknown as { sessionManager?: unknown }).sessionManager;
	if (isRecord(manager)) {
		const getSessionFile = manager.getSessionFile;
		if (typeof getSessionFile === "function") {
			const value = getSessionFile.call(manager);
			if (typeof value === "string" && value.length > 0) return value;
		}
		const getSessionId = manager.getSessionId;
		if (typeof getSessionId === "function") {
			const value = getSessionId.call(manager);
			if (typeof value === "string" && value.length > 0) return value;
		}
	}
	return ctx.cwd;
}

/** Pi owns the adapter from its broad SDK context to the narrow shared input. */
export function piSddIntentPreflightContext(
	ctx: ExtensionContext,
): SddIntentPreflightContext {
	return {
		cwd: ctx.cwd,
		sessionKey: sddPreflightSessionKey(ctx),
		...(ctx.hasUI ? { notify: (message: string) => ctx.ui.notify(message, "info") } : {}),
	};
}

// A technical fallback is not a decision. Only the change record owns the
// answer; reads never promote defaults to a persisted human choice.
function resolveTddNoAsk(ctx: ExtensionContext): TddMode {
	const active = resolveActiveChange(ctx.cwd);
	const recorded = active ? readChangeStance(ctx.cwd, active)?.tdd : undefined;
	if (recorded) return recorded;
	const global = readTddMode(ctx.cwd);
	return global === "ask" ? "auto" : global;
}

function setTaskTddMode(ctx: ExtensionContext, mode: TddMode): void {
	const key = sddPreflightSessionKey(ctx);
	const cached = sddPreflightBySession.get(key);
	if (cached) cached.tddMode = mode;
}

function persistTaskTddMode(ctx: ExtensionContext, change: string, mode: "off" | "strict"): void {
	const result = updateSddPreflightStance(ctx.cwd, change, { tdd: mode, author: "pi" });
	setTaskTddMode(ctx, result.record?.tdd ?? mode);
}

// Pregunta el TDD de la tarea cuando el global es "ask". No-op si no hay UI o el
// modo no es "ask". Lo invoca el gate de delegación SOLO cuando el orquestador
// no clasificó el cambio (sin hint) — un cambio de comportamiento de verdad.
export async function askRunTddMode(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI || readTddMode(ctx.cwd) !== "ask") return;
	const change = resolveActiveChange(ctx.cwd);
	if (!change || readChangeStance(ctx.cwd, change)?.tdd) return;
	const picked = await ctx.ui.select(
		"TDD estricto para esta tarea SDD (UI/visual/trivial → off)",
		["off", "strict"],
	);
	if (picked !== "strict" && picked !== "off") throw new Error("TDD pendiente: no se registró una decisión; la delegación no ha comenzado.");
	persistTaskTddMode(ctx, change, picked);
}

// Normaliza un hint de TDD que el orquestador puede pasar en la delegación.
// `false`/"off"/"skip"/"none"/"no" → off (cambio mecánico, sin RED/GREEN).
// `true`/"strict"/"on"/"yes" → strict. "ask"/desconocido → undefined (cae al
// ask interactivo). Cualquier otra cosa no decide nada.
function normalizeTddHint(value: unknown): TddMode | undefined {
	if (value === false) return "off";
	if (value === true) return "strict";
	if (typeof value !== "string") return undefined;
	const s = value.trim().toLowerCase();
	if (s === "off" || s === "skip" || s === "none" || s === "no") return "off";
	if (s === "strict" || s === "on" || s === "yes") return "strict";
	return undefined;
}

// Marcadores en el TEXTO de la task del apply: canal de respaldo garantizado
// (la task siempre llega al hook; un campo `tdd` extra podría no sobrevivir al
// schema del tool). El parent ya escribe "STRICT TDD MODE IS ACTIVE" en applies
// directos → strict. "NO TDD"/"SIN TDD"/"TDD: off|skip" → off.
function tddHintFromText(text: string): TddMode | undefined {
	if (/\bstrict\s+tdd\s+mode\s+is\s+active\b/i.test(text)) return "strict";
	if (/\bno[-\s]?tdd\b|\bsin\s+tdd\b|\btdd\s*[:=]?\s*(?:off|skip)\b/i.test(text))
		return "off";
	return undefined;
}

// Lee la decisión de TDD que el orquestador adjuntó a la delegación que escribe
// código. Prioriza el hint más específico (el del paso `sdd-apply` dentro de un
// chain/parallel) sobre el de nivel superior; campo estructurado `tdd` antes que
// el marcador de texto. undefined → el orquestador no clasificó → preguntar.
export function readDelegationTddHint(input: unknown): TddMode | undefined {
	if (!isRecord(input)) return undefined;
	// El hint del child de apply manda: es el que va a escribir código.
	for (const item of collectDelegationItems(input)) {
		if (item.agent !== "sdd-apply") continue;
		const field = normalizeTddHint(item.tdd);
		if (field) return field;
		const text = item.task ? tddHintFromText(item.task) : undefined;
		if (text) return text;
	}
	// Hint a nivel de workflow (fuera del script) y, como último recurso, la
	// prosa de una delegación de UN solo child: con varios no se sabe a cuál
	// pertenece el hint, y adivinarlo fijaría el modo TDD del run entero.
	const field = normalizeTddHint(input.tdd);
	if (field) return field;
	const texts = collectDelegationTaskTexts(input);
	return texts.length === 1 ? tddHintFromText(texts[0] as string) : undefined;
}

// Señal de que la delegación toca CÓDIGO (extensión de fuente o verbo de
// implementación): si aparece, no es docs-only por mucho que mencione un .md.
const CODE_SIGNAL =
	/\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|sql|css|scss|less|json|ya?ml|toml)\b|\b(?:implementa?r?|implement|refactor\w*|funci[oó]n|function|endpoint|component\w*|composable|store|migrat\w*|tests?)\b/i;
// Señal de documentación: extensión de doc, fichero de doc conocido, o verbo de
// documentar.
const DOCS_SIGNAL =
	/\.(?:md|mdx|markdown|rst|txt)\b|\b(?:docs?|readme|changelog|license)\b|\bdocument\w*|\bdocumenta\w*/i;

// ¿La delegación es documentación pura (sin código)? Conservador a propósito:
// requiere señal de docs Y ausencia de señal de código; ante la duda devuelve
// false (→ se comporta como antes: pregunta). Evita arrastrar un cambio de docs
// al gate de TDD —no hay tests que escribir— sin depender de que el parent
// recuerde el hint.
export function delegationIsDocsOnly(input: unknown): boolean {
	const texts = collectDelegationTaskTexts(input);
	if (texts.length === 0) return false;
	const blob = texts.join("\n");
	if (CODE_SIGNAL.test(blob)) return false;
	return DOCS_SIGNAL.test(blob);
}

// Gate de TDD ante una delegación. En modo global "ask": documentación pura se
// salta el gate (off silencioso, no hay tests); si la delegación escribe código
// y el orquestador la clasificó (hint off/strict), se fija sin molestar; si NO
// la clasificó, se pregunta. Fuera de "ask" o sin UI, no-op.
export async function gateTddForDelegation(
	input: unknown,
	ctx: ExtensionContext,
): Promise<void> {
	if (!ctx.hasUI || readTddMode(ctx.cwd) !== "ask") return;
	// Do not ask before scope creates an owner for the answer. Disk remains
	// authoritative across slices, new sessions and the other runtime.
	const change = resolveActiveChange(ctx.cwd);
	if (!change || readChangeStance(ctx.cwd, change)?.tdd) return;
	// Se pregunta al ARRANCAR el SDD (fase scope) o, si el apply va suelto (tarea
	// mediana sin scope), justo antes de él. En un chain ambos viven en la misma
	// delegación → una sola pregunta al inicio.
	if (!delegationStartsScope(input) && !delegationTargetsApply(input)) return;
	if (delegationIsDocsOnly(input)) {
		persistTaskTddMode(ctx, change, "off");
		return;
	}
	const hint = readDelegationTddHint(input);
	if (hint === "off" || hint === "strict") {
		persistTaskTddMode(ctx, change, hint);
		return;
	}
	await askRunTddMode(ctx);
}

// ¿La delegación ARRANCA un SDD completo? = lanza la primera fase sdd-scope.
// Permite preguntar el TDD al inicio del SDD, no a mitad, en flujos fase-a-fase
// donde scope y apply son delegaciones distintas.
export function delegationStartsScope(input: unknown): boolean {
	return delegationIncludes(input, "sdd-scope");
}

// ¿Esta llamada al tool `subagent` acabará escribiendo código vía sdd-apply? Lo
// usa el gate de TDD en tool_call para preguntar antes de que arranque el apply
// en CUALQUIER cambio de código, no solo en el trigger SDD explícito.
export function delegationTargetsApply(input: unknown): boolean {
	return delegationIncludes(input, "sdd-apply");
}

// Fases documentales/de planificación: su artefacto es un .md que `ein_sdd_check`
// valida de forma determinista. NO producen evidencia con forma de código.
const PLANNING_AGENTS = new Set([
	"sdd-scope",
	"sdd-map",
	"sdd-design",
	"sdd-tasks",
	"sdd-close",
]);

// ¿La delegación va SOLO a fases de planificación? Todos sus children deben
// serlo: un apply/verify mezclado → false (ese sí lleva su acceptance real), y
// el `acceptance` inyectado baja a TODOS los children del workflow.
export function delegationIsPlanningOnly(input: unknown): boolean {
	const agents = collectDelegationAgentNames(input);
	return agents.length > 0 && agents.every((agent) => PLANNING_AGENTS.has(agent));
}

// Inyecta `acceptance: { level: "none" }` determinista en una delegación a
// fases de planificación que no lo trae. Muta el input EN SITIO (igual que el
// wrap de Hypa en tool_call): sin esto, el runner infiere un nivel con forma de
// código y RECHAZA en falso un artefacto documental que `ein_sdd_check` ya
// valida — un ✗ que dependía de que el orquestador recordara pasar el acceptance.
// Devuelve true si mutó. No pisa un acceptance explícito ni toca applies.
// R1/A-1: un participante lanzado en background nunca trae su resultado
// terminal por el `tool_result` de su propia llamada (`asyncByDefault: true`
// por defecto en `pi-subagents`). Forzar foreground es lo único que lo trae al
// mismo canal que Ein ya observa por `toolCallId`. `foregroundOnly: true` es
// el seguro contra `forceTopLevelAsync` (`pi-subagents`
// `runs/background/top-level-async.ts:12`); el mismo par que
// `delegation-adapters.ts:138-139` usa para su propia ruta garantizada.
//
// A diferencia de los otros inyectores, un `async` explícito SE SOBRESCRIBE:
// un participante inobservable no debe admitirse (fail-closed, `// 002`).
const SLICE_PARTICIPANT_MARKER = /^\[ein-sdd-participant\/v1 passage=[^\]\s]+ unit=(?:ein-cleaner|ein-architect) slice=[^\]\s]+ range=\d+-\d+ state=[^\]\s]+\]/;

export function isSddParticipantMarker(value: unknown): value is string {
	return typeof value === "string" && SLICE_PARTICIPANT_MARKER.test(value);
}

export function ensureParticipantForeground(input: unknown): boolean {
	if (!isRecord(input)) return false;
	const isParticipant = collectDelegationItems(input).some((item) => isSddParticipantMarker(item.task));
	if (!isParticipant) return false;
	input.async = false;
	input.foregroundOnly = true;
	return true;
}

export function ensurePlanningAcceptance(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.acceptance != null) return false;
	if (!delegationIsPlanningOnly(input)) return false;
	input.acceptance = {
		level: "none",
		reason: "ein_sdd_check gates this phase artifact deterministically",
	};
	return true;
}

// Apply EJECUTA; no debe pelear con la capa de aceptación. `acceptance: verified`
// obliga a un `acceptance-report` que los modelos baratos rompen y a evidencia
// `tests-added` que un grupo de verificación no puede dar → rechazos que queman
// runs caros. Por defecto lo dejamos en `none`: sdd-verify (fase dedicada)
// re-ejecuta la suite como gate real, y el guard de cierre impide cerrar sin un
// verify fresco. El orquestador puede seguir pidiendo `verified` explícito.
// Solo aplica a una delegación de un único `sdd-apply` (la ruta fase-a-fase).
export function ensureApplyAcceptance(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.acceptance != null) return false;
	if (!delegationTargetsOnly(input, "sdd-apply")) return false;
	input.acceptance = {
		level: "none",
		reason: "apply executes; sdd-verify re-runs the suite as the runtime gate",
	};
	return true;
}

// Ningún contrato de aceptación INFERIDO. El runner deduce un nivel a partir de
// la REDACCIÓN de la tarea ("read-only task wording" salía 63 veces en la ventana
// medida) y luego rechaza al agente por no emitir el `acceptance-report` con esa
// forma. Medido sobre 230 runs: de 48 checks fallidos, 46 eran papeleo (19 "no
// encontré el informe estructurado", 24 "el agente dijo `not applicable`") y 2
// decían algo del trabajo. El caso absurdo: a `ein-git` con la tarea "commit,
// PUSH and OPEN PR" se le infirió "read-only" y se le exigieron `review-findings`
// → 27 de 63 entregas bloqueadas o devueltas.
//
// Regla nueva: contrato EXPLÍCITO del orquestador, o ninguno. Esto NO baja el
// listón real — las puertas que sí miran el trabajo siguen enteras: `sdd-verify`
// re-ejecuta la suite, `ein_sdd_check` valida el artefacto y el guard de cierre
// impide cerrar sin un verify fresco.
export function ensureDelegationAcceptance(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.acceptance != null) return false;
	// Forma no reconocida → no tocar: mutar a ciegas una delegación que Ein no
	// entiende es peor que dejar que el runner decida.
	if (collectDelegationAgentNames(input).length === 0) return false;
	input.acceptance = {
		level: "none",
		reason: "explicit acceptance only; sdd-verify and ein_sdd_check are the real gates",
	};
	return true;
}

// Backstop de turnos para apply, SOLO contra runaways de verdad. El cap de 40
// abortaba trabajo LEGÍTIMO: un apply de TDD estricto corre muchos ciclos
// RED/GREEN y necesita bastantes turnos (lo gobierna `maxRuntimeMs`, 30 min). Por
// eso: (1) NUNCA se inyecta en applies de TDD estricto, y (2) el cap normal sube
// a 60. Un grupo que lo toque devuelve `partial` y el orquestador continúa.
const APPLY_TURN_BUDGET = { maxTurns: 60, graceTurns: 3 } as const;

export function ensureApplyTurnBudget(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (!delegationTargetsOnly(input, "sdd-apply")) return false;
	if (input.turnBudget != null) return false;
	// TDD estricto → sin cap de turnos (lo limita maxRuntimeMs); un cap tight
	// mataba applies reales a mitad de los ciclos RED/GREEN.
	if (readDelegationTddHint(input) === "strict") return false;
	input.turnBudget = { ...APPLY_TURN_BUDGET };
	return true;
}

// Runtime por agente. Vivía como ocho menciones de prosa en el prompt del
// orquestador —pagadas en cada turno— pidiéndole que recordara qué número
// pasar a cada fase. Un número que depende del agente y de nada más no es una
// decisión: es una tabla. Espejo de APPLY_TURN_BUDGET.
//
// Los valores salen de la medición que ya estaba escrita en esa prosa: un apply
// de TDD estricto corre muchos ciclos RED/GREEN y es lento; las fases que LEEN
// CÓDIGO para producir su artefacto morían a 300s a mitad de lectura; la entrega
// mató 7 de 63 ejecuciones con el cap viejo de 2 minutos.
const PHASE_RUNTIME_MS: Readonly<Record<string, number>> = Object.freeze({
	"sdd-apply": 1_800_000, // 30 min: ciclos RED/GREEN de un slice multi-grupo
	"sdd-verify": 1_800_000, // reejecuta la suite real, que es lo más lento del flujo
	"sdd-map": 600_000, // 10 min: lee código para producir su artefacto
	"sdd-design": 600_000,
	"sdd-tasks": 600_000,
	"sdd-scope": 300_000, // fases de documento, sin lectura profunda
	"sdd-close": 300_000,
	"ein-git": 300_000, // entrega y cirugía de historia comparten este techo
});

/**
 * Fija `maxRuntimeMs` según el agente delegado cuando el orquestador no pasó
 * uno explícito. Un valor explícito siempre gana: la tabla es el default, no
 * una política.
 *
 * Solo actúa sobre delegaciones de un único agente conocido. Una delegación
 * mixta se deja intacta a propósito: en pi-subagents el campo baja a TODOS los
 * children, así que fijarlo por uno se lo aplicaría a los demás.
 */
export function ensurePhaseRuntime(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.maxRuntimeMs != null) return false;
	const agents = collectDelegationAgentNames(input);
	if (agents.length === 0) return false;
	const [first] = agents;
	if (!first || !agents.every((name) => name === first)) return false;
	const runtime = PHASE_RUNTIME_MS[first];
	if (runtime === undefined) return false;
	input.maxRuntimeMs = runtime;
	return true;
}

export {
	patchSddIntentMaterial,
	type SddIntentMaterialPatch,
	type SddIntentPreflightInput,
	type SddIntentPreflightOutcome,
} from "./sdd-intent-resolution.ts";
export {
	persistSddIntentResolution,
	updateSddPreflightStance,
	type SddIntentPersistenceResult,
	type SddPreflightStanceUpdate,
	type SddPreflightStanceUpdateResult,
} from "./sdd-preflight-record.ts";

const sddIntentCoordinator = createSddIntentPreflightCoordinator({
	readState: readSddIntentResolutionState,
	persistResolution: persistSddIntentResolution,
	now: () => new Date().toISOString(),
});

/** Compatibility surface for Pi consumers; behavior lives in the shared coordinator. */
export function resolveSddIntentPreflight(
	ctx: SddIntentPreflightContext,
	input: SddIntentPreflightInput,
): Promise<SddIntentPreflightOutcome> {
	return sddIntentCoordinator.resolve(ctx, input);
}

// Preguntas de SESIÓN. Se hacen una vez y sobreviven a los cambios que vengan
// después: describen cómo trabaja el humano hoy, no qué es este cambio.
export async function collectSddSessionAnswers(
	ctx: ExtensionContext,
	engramAvailable: boolean,
): Promise<SddSessionAnswers> {
	if (!ctx.hasUI) {
		return {
			executionMode: DEFAULT_SDD_PREFLIGHT.executionMode,
			memoryMode: DEFAULT_SDD_PREFLIGHT.memoryMode,
			engramAvailable,
			prompted: false,
		};
	}
	const executionMode = await ctx.ui.select("SDD execution mode", [
		"interactive",
		"auto",
	]);
	const memoryOptions = engramAvailable ? ["off", "engram"] : ["off"];
	const memoryMode = await ctx.ui.select("Optional Engram project notebook", memoryOptions);
	return {
		executionMode:
			executionMode === "auto" ? "auto" : DEFAULT_SDD_PREFLIGHT.executionMode,
		memoryMode: normalizeSddMemoryMode({ memoryMode }),
		engramAvailable,
		prompted: true,
	};
}

// Compatibility seam for consumers that still request a stance object. It no
// longer asks per-change TDD/lane questions: persisted values are supplied by
// the owner flow and absent values use technical defaults without persistence.
export async function collectSddChangeStance(
	ctx: ExtensionContext,
): Promise<SddChangeStanceAnswers> {
	return { tddMode: resolveTddNoAsk(ctx), lane: DEFAULT_LANE };
}

/**
 * Preferencias completas del preflight. `opts.session` reutiliza respuestas de
 * sesión ya dadas; `opts.stance` adopta una postura que ya está en disco (la
 * escribió este runtime antes, o el otro) en vez de volver a preguntarla.
 */
export async function collectSddPreflightPreferences(
	ctx: ExtensionContext,
	engramAvailable: boolean,
	opts: { session?: SddSessionAnswers; stance?: SddChangeStanceAnswers } = {},
): Promise<SddPreflightPreferences> {
	const session = opts.session ?? (await collectSddSessionAnswers(ctx, engramAvailable));
	const stance = opts.stance ?? (await collectSddChangeStance(ctx));
	setTaskTddMode(ctx, stance.tddMode);
	// Technical defaults are consumed, never promoted to a human change stance.
	const stanceSource: "adopted" = "adopted";
	return {
		executionMode: session.executionMode,
		memoryMode: session.memoryMode,
		reviewBudgetLines: DEFAULT_REVIEW_BUDGET_LINES,
		tddMode: stance.tddMode,
		lane: stance.lane,
		engramAvailable: session.engramAvailable,
		prompted: session.prompted,
		stanceSource,
	};
}

/**
 * ¿Sirven estas preferencias para el cambio activo? Ata la postura al primer
 * cambio que aparece (el preflight corre ANTES de que `sdd-scope` cree el
 * directorio) y la declara caducada en cuanto el cambio activo es otro.
 */
function reusePreflightForChange(
	prefs: SddPreflightPreferences,
	active: string | undefined,
): boolean {
	if (!active) return true;
	if (prefs.activeChange === active) return true;
	if (prefs.activeChange === undefined) {
		prefs.activeChange = active;
		return true;
	}
	return false;
}

function tddPreflightLine(mode: TddMode): string {
	switch (mode) {
		case "off":
			return "- Strict TDD: OFF for this work — do NOT run the RED/GREEN/TRIANGULATE/REFACTOR cycle. Implement directly with minimal, focused changes. This OVERRIDES `openspec/config.yaml` `strict_tdd`. (Chosen for trivial/visual/low-risk work; don't waste tokens on a TDD loop.)";
		case "strict":
			return "- Strict TDD: ON (forced) — follow RED → GREEN → TRIANGULATE → REFACTOR with evidence in `apply-progress.md`, regardless of project config.";
		case "ask":
			// No debería llegar: el modo "ask" se resuelve a off/strict por tarea
			// (askRunTddMode) antes de renderizar. Fallback seguro = config.
			return "- Strict TDD: AUTO — follow `openspec/config.yaml` `strict_tdd` (default behavior).";
		default:
			return "- Strict TDD: AUTO — follow `openspec/config.yaml` `strict_tdd` (default behavior).";
	}
}

// includeTdd: the Strict TDD line only matters where code is actually written
// (the parent's inline work and sdd-apply). Injecting it into scope/map/
// design/verify is noise that pushes cheap models toward a RED/GREEN loop in
// read-only phases. Default true keeps the parent/apply behavior unchanged.
// includeBaseline: la reconciliación del árbol Git es asunto del PARENT, UNA vez.
// Inyectar la directiva de baseline en los ejecutores SDD (sdd-apply, etc.) les
// hacía re-auditar el repo y pedir permiso al supervisor (detach). El parent la
// resuelve; el ejecutor recibe una tarea cerrada y confía en ella.
export function renderSddPreflightPrompt(
	prefs: SddPreflightPreferences,
	opts: { includeTdd?: boolean; includeBaseline?: boolean } = {},
): string {
	const includeTdd = opts.includeTdd ?? true;
	const includeBaseline = opts.includeBaseline ?? true;
	const sourceLine = prefs.prompted
		? "The user already chose these SDD preferences for this Pi session. Reuse them unless the user explicitly changes them."
		: "No interactive UI was available for SDD preflight, so these default preferences were applied for this Pi session. Ask the user before making delivery decisions that depend on them.";
	const lines = [
		"## SDD Session Preflight",
		sourceLine,
		`- Execution mode: ${prefs.executionMode}`,
		"- OpenSpec: canonical full SDD record (always present).",
		`- Optional project notebook: Engram ${prefs.memoryMode}${prefs.engramAvailable ? " (configured; no retrieval or save is implied)" : " (unavailable in this session)"}.`,
		`- Review budget: ${prefs.reviewBudgetLines} changed lines / ${DEFAULT_REVIEW_BUDGET_BYTES.toLocaleString("en-US")} changed non-whitespace bytes`,
	];
	if (includeTdd) lines.push(tddPreflightLine(prefs.tddMode));
	// El carril solo se nombra cuando SALTA fases. `standard` es la forma normal
	// del flujo: anunciarlo sería una línea pagada en cada turno que no cambia
	// nada de lo que el destinatario va a hacer.
	if (prefs.lane && prefs.lane !== DEFAULT_LANE) {
		lines.push(
			`- SDD lane: ${LANE_LABEL[prefs.lane]} — this change skips ${laneSkips(prefs.lane).join(", ")}. \`verify\` and \`close\` stay hard gates.`,
		);
	}
	if (includeBaseline && prefs.gitBaseline) {
		const baselineLine = renderGitBaselineLine(prefs.gitBaseline);
		if (baselineLine) lines.push(baselineLine);
	}
	lines.push(
		`- Review Workload Guard: before delegating a PR, call \`ein_review_forecast\` with the PR base. It owns the pathspec and evaluates production against the ${prefs.reviewBudgetLines}-line and ${DEFAULT_REVIEW_BUDGET_BYTES.toLocaleString("en-US")}-byte review budgets; tests, file count and density notices never gate. If its combined result is over budget, pause and ask the user (single PR vs chained PRs). Forward \`Production lines\`, \`Production bytes\`, both \`Review budgets\` and the \`Over budget\` result so ein-git trusts the same decision without re-measuring. \`auto\` does NOT bypass this gate.`,
	);
	return lines.join("\n");
}

export async function ensureSddPreflight(
	ctx: ExtensionContext,
	callbacks: SddPreflightCallbacks,
): Promise<SddPreflightPreferences> {
	const sessionKey = sddPreflightSessionKey(ctx);
	const active = resolveActiveChange(ctx.cwd);
	const existing = sddPreflightBySession.get(sessionKey);
	if (existing) {
		if (reusePreflightForChange(existing, active)) return existing;
		// Session preferences survive; the next change reads its own stance.
		sddPreflightBySession.delete(sessionKey);
	}
	const inFlight = sddPreflightInFlight.get(sessionKey);
	if (inFlight) return inFlight;
	const promise = (async () => {
		const engramAvailable = hasEngramToolCapability(callbacks.pi);
		// Una postura ya escrita se ADOPTA, no se re-pregunta: puede haberla
		// dejado Claude, o esta misma sesión antes de un compact.
		const recorded = active ? readChangeStance(ctx.cwd, active) : undefined;
		const prefs = await collectSddPreflightPreferences(ctx, engramAvailable, {
			session: sddSessionAnswersBySession.get(sessionKey),
			...(recorded?.tdd ? { stance: { tddMode: recorded.tdd, lane: recorded.lane } } : {}),
		});
		sddSessionAnswersBySession.set(sessionKey, {
			executionMode: prefs.executionMode,
			memoryMode: prefs.memoryMode,
			engramAvailable: prefs.engramAvailable,
			prompted: prefs.prompted,
		});
		prefs.activeChange = active;
		// Snapshot del árbol antes de que el flujo mute nada: detecta un `reset`
		// reciente / stashes que pudieran significar trabajo huérfano.
		prefs.gitBaseline = readGitBaseline(ctx.cwd);
		const result =
			(await callbacks.installAssets?.(ctx.cwd)) ??
			installSddAssets(ctx.cwd, false);
		const modelResult = (await callbacks.applyModelConfig?.(ctx.cwd)) ?? {
			updated: 0,
			skipped: 0,
		};
		if (ctx.hasUI) {
			const modelRoutingLine = modelResult.invalidPath
				? `Model routing skipped: ${modelResult.invalidPath} is invalid JSON or not an object.`
				: `Model-routed agents updated: ${modelResult.updated}`;
			ctx.ui.notify(
				[
					"Ein SDD preflight complete.",
					`Mode: ${prefs.executionMode}`,
					"OpenSpec: canonical full SDD record (always present)",
					`Optional project notebook: Engram ${prefs.memoryMode}${prefs.engramAvailable ? " (configured; no retrieval or save is implied)" : " (unavailable)"}`,
					`Review budget: ${prefs.reviewBudgetLines} changed lines`,
					`Strict TDD: ${prefs.tddMode}${prefs.stanceSource === "adopted" ? " (leído del cambio, no preguntado)" : ""}`,
					`Carril: ${LANE_LABEL[prefs.lane ?? DEFAULT_LANE]}`,
					`Preference source: ${prefs.prompted ? "user prompt" : "defaults (no interactive UI available)"}`,
					`Global SDD assets ready: ${result.agents} agent(s), ${result.chains} chain(s), ${result.support} support file(s) available (${result.skipped} already present).`,
					modelRoutingLine,
				].join("\n"),
				modelResult.invalidPath ? "warning" : "info",
			);
		}
		sddPreflightBySession.set(sessionKey, prefs);
		// Retrieval is advisory: it never delays or gates the canonical preflight.
		void prepareSddSessionMemory(prefs, callbacks.memoryLifecycle, sessionKey).then((memory) => {
			if (memory) sddSessionMemoryBySession.set(sessionKey, memory);
		});
		return prefs;
	})();
	sddPreflightInFlight.set(sessionKey, promise);
	try {
		return await promise;
	} finally {
		sddPreflightInFlight.delete(sessionKey);
	}
}

export function getSddPreflightPreferences(
	ctx: ExtensionContext,
): SddPreflightPreferences | undefined {
	return sddPreflightBySession.get(sddPreflightSessionKey(ctx));
}

export function getSddSessionMemory(ctx: ExtensionContext): PreparedMemory | undefined {
	return sddSessionMemoryBySession.get(sddPreflightSessionKey(ctx));
}
