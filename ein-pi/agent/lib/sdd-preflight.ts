// =============================================================================
// SDD PREFLIGHT — control de la sesión SDD
// La "revisión antes de despegar": una vez al arrancar decide CÓMO se trabaja y
// deja escrito el bloque "## SDD Session Preflight" que el motor inyecta en el
// prompt. Dos mitades del mismo dominio (control de la sesión SDD):
//
//   1. PREFERENCIAS: detecta el trigger (`/sdd`, "vamos con el sdd"…), pregunta
//      lo que cambia el trabajo (modo de ejecución, TDD, memoria — 3 preguntas,
//      no 5: el chained-PR y el budget se retiraron por ceremonia/fricción), y
//      renderiza el bloque (incluye el Review Workload Guard con budget fijo 400).
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
// (interactive / memory off / 400 budget / auto) y el bloque se inyecta igual.
// =============================================================================

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type GitBaseline, readGitBaseline, renderGitBaselineLine } from "./git-baseline";
import { type TddMode, readTddMode } from "./tdd";
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
export interface SddPreflightPreferences {
	executionMode: SddExecutionMode;
	memoryMode: SddMemoryMode;
	reviewBudgetLines: number;
	tddMode: TddMode;
	engramAvailable: boolean;
	prompted: boolean;
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

// Decisión de TDD por TAREA cuando el modo global es "ask". El parent no
// recupera control entre design y apply dentro de un chain, así que el "ask"
// se resuelve de forma DETERMINISTA aquí (un ctx.ui.select real), no como
// instrucción de prompt al padre (que en un chain nunca dispara).
const tddRunOverride = new Map<string, TddMode>();

// Modo de TDD sin preguntar: override de la tarea si existe; si el global es
// "ask" pero aún no se preguntó, cae a "auto" (no bloquea ni asume estricto).
function resolveTddNoAsk(ctx: ExtensionContext): TddMode {
	const override = tddRunOverride.get(sddPreflightSessionKey(ctx));
	if (override) return override;
	const global = readTddMode(ctx.cwd);
	return global === "ask" ? "auto" : global;
}

// Fija el TDD de la tarea (override determinista) sin preguntar: lo usan tanto
// el ask interactivo como el hint del orquestador y el salto de docs. Solo avisa
// en `strict`: que TDD quede forzado ON sin preguntar SÍ importa saberlo; "off"
// es un no-evento (mecánico/docs/trivial) y anunciarlo solo es ruido.
function setTaskTddMode(ctx: ExtensionContext, mode: TddMode): void {
	const key = sddPreflightSessionKey(ctx);
	tddRunOverride.set(key, mode);
	const cached = sddPreflightBySession.get(key);
	if (cached) cached.tddMode = mode;
	if (ctx.hasUI && mode === "strict")
		ctx.ui.notify(`TDD para esta tarea: ${mode}`, "info");
}

// Pregunta el TDD de la tarea cuando el global es "ask". No-op si no hay UI o el
// modo no es "ask". Lo invoca el gate de delegación SOLO cuando el orquestador
// no clasificó el cambio (sin hint) — un cambio de comportamiento de verdad.
export async function askRunTddMode(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI || readTddMode(ctx.cwd) !== "ask") return;
	const picked = await ctx.ui.select(
		"TDD estricto para esta tarea SDD (UI/visual/trivial → off)",
		["off", "strict"],
	);
	setTaskTddMode(ctx, picked === "strict" ? "strict" : "off");
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
	for (const key of ["tasks", "steps", "chain"]) {
		const items = input[key];
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			if (!isRecord(item) || item.agent !== "sdd-apply") continue;
			const field = normalizeTddHint(item.tdd);
			if (field) return field;
			const text = typeof item.task === "string" ? tddHintFromText(item.task) : undefined;
			if (text) return text;
		}
	}
	const field = normalizeTddHint(input.tdd);
	if (field) return field;
	return typeof input.task === "string" ? tddHintFromText(input.task) : undefined;
}

// Señal de que la delegación toca CÓDIGO (extensión de fuente o verbo de
// implementación): si aparece, no es docs-only por mucho que mencione un .md.
const CODE_SIGNAL =
	/\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|php|sql|css|scss|less|json|ya?ml|toml)\b|\b(?:implementa?r?|implement|refactor\w*|funci[oó]n|function|endpoint|component\w*|composable|store|migrat\w*|tests?)\b/i;
// Señal de documentación: extensión de doc, fichero de doc conocido, o verbo de
// documentar.
const DOCS_SIGNAL =
	/\.(?:md|mdx|markdown|rst|txt)\b|\b(?:docs?|readme|changelog|license)\b|\bdocument\w*|\bdocumenta\w*/i;

function collectDelegationTaskTexts(input: unknown): string[] {
	if (!isRecord(input)) return [];
	const texts: string[] = [];
	if (typeof input.task === "string") texts.push(input.task);
	for (const key of ["tasks", "steps", "chain"]) {
		const items = input[key];
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			if (isRecord(item) && typeof item.task === "string") texts.push(item.task);
		}
	}
	return texts;
}

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
	// CORTE -> ya decidido en este run del SDD: no re-preguntar en applies
	// sucesivos (slices). Una decisión por SDD completo, no por delegación.
	if (tddRunOverride.has(sddPreflightSessionKey(ctx))) return;
	// Se pregunta al ARRANCAR el SDD (fase scope) o, si el apply va suelto (tarea
	// mediana sin scope), justo antes de él. En un chain ambos viven en la misma
	// delegación → una sola pregunta al inicio.
	if (!delegationStartsScope(input) && !delegationTargetsApply(input)) return;
	if (delegationIsDocsOnly(input)) {
		setTaskTddMode(ctx, "off");
		return;
	}
	const hint = readDelegationTddHint(input);
	if (hint) {
		setTaskTddMode(ctx, hint);
		return;
	}
	await askRunTddMode(ctx);
}

// ¿La delegación ARRANCA un SDD completo? = contiene la primera fase sdd-scope
// (single, parallel o chain). Permite preguntar el TDD al inicio del SDD, no a
// mitad, en flujos fase-a-fase donde scope y apply son delegaciones distintas.
export function delegationStartsScope(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.agent === "sdd-scope") return true;
	for (const key of ["tasks", "steps", "chain"]) {
		const items = input[key];
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			if (isRecord(item) && item.agent === "sdd-scope") return true;
		}
	}
	return false;
}

// Detecta si una llamada al tool `subagent` acabará escribiendo código vía
// sdd-apply: modo single (`agent`), parallel (`tasks[]`) o chain (`chain[]` /
// `steps[]`). Lo usa el gate de TDD en tool_call para preguntar antes de que
// arranque el apply en CUALQUIER cambio de código, no solo en el trigger SDD
// explícito.
export function delegationTargetsApply(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.agent === "sdd-apply") return true;
	for (const key of ["tasks", "steps", "chain"]) {
		const items = input[key];
		if (!Array.isArray(items)) continue;
		for (const item of items) {
			if (isRecord(item) && item.agent === "sdd-apply") return true;
		}
	}
	return false;
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

// ¿La delegación va SOLO a fases de planificación? = agente único de
// planificación, o todos los items de tasks/steps/chain lo son. Un apply/verify
// mezclado → false (ese sí lleva su acceptance real).
export function delegationIsPlanningOnly(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (typeof input.agent === "string") return PLANNING_AGENTS.has(input.agent);
	for (const key of ["tasks", "steps", "chain"]) {
		const items = input[key];
		if (!Array.isArray(items) || items.length === 0) continue;
		return items.every(
			(item) =>
				isRecord(item) &&
				typeof item.agent === "string" &&
				PLANNING_AGENTS.has(item.agent),
		);
	}
	return false;
}

// Inyecta `acceptance: { level: "none" }` determinista en una delegación a
// fases de planificación que no lo trae. Muta el input EN SITIO (igual que el
// wrap de Hypa en tool_call): sin esto, el runner infiere un nivel con forma de
// código y RECHAZA en falso un artefacto documental que `ein_sdd_check` ya
// valida — un ✗ que dependía de que el orquestador recordara pasar el acceptance.
// Devuelve true si mutó. No pisa un acceptance explícito ni toca applies.
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
	if (input.agent !== "sdd-apply") return false;
	input.acceptance = {
		level: "none",
		reason: "apply executes; sdd-verify re-runs the suite as the runtime gate",
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
	if (input.agent !== "sdd-apply") return false;
	if (input.turnBudget != null) return false;
	// TDD estricto → sin cap de turnos (lo limita maxRuntimeMs); un cap tight
	// mataba applies reales a mitad de los ciclos RED/GREEN.
	if (readDelegationTddHint(input) === "strict") return false;
	input.turnBudget = { ...APPLY_TURN_BUDGET };
	return true;
}

export async function collectSddPreflightPreferences(
	ctx: ExtensionContext,
	engramAvailable: boolean,
): Promise<SddPreflightPreferences> {
	if (!ctx.hasUI) return { ...DEFAULT_SDD_PREFLIGHT, tddMode: resolveTddNoAsk(ctx), engramAvailable };
	const executionMode = await ctx.ui.select("SDD execution mode", [
		"interactive",
		"auto",
	]);
	// TDD decidido AL INICIO, una sola decisión por sesión SDD: off (default) o
	// strict. **Siempre** fija el override determinista → el gate de delegación
	// (askRunTddMode) ya NO vuelve a preguntar (fin del doble-ask que salía cuando
	// el modo global era `ask`). Default off: la mayoría del trabajo (frontend/
	// simple) no necesita RED/GREEN y no debe quemar tokens; strict es opt-in.
	// Respeta un `strict` persistente (`/ein:tdd strict`) poniéndolo primero.
	const tddDefaultStrict = readTddMode(ctx.cwd) === "strict";
	const tddChoice = await ctx.ui.select(
		"Strict TDD for this SDD change? (default off — UI/visual/simple; strict → logic-heavy, forces RED/GREEN)",
		tddDefaultStrict ? ["strict", "off"] : ["off", "strict"],
	);
	const tddMode: TddMode = tddChoice === "strict" ? "strict" : "off";
	setTaskTddMode(ctx, tddMode);
	const memoryOptions = engramAvailable ? ["off", "engram"] : ["off"];
	const memoryMode = await ctx.ui.select("Optional Engram project notebook", memoryOptions);
	return {
		executionMode:
			executionMode === "auto" ? "auto" : DEFAULT_SDD_PREFLIGHT.executionMode,
		memoryMode: normalizeSddMemoryMode({ memoryMode }),
		reviewBudgetLines: DEFAULT_REVIEW_BUDGET_LINES,
		tddMode,
		engramAvailable,
		prompted: true,
	};
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
		`- Review budget: ${prefs.reviewBudgetLines} changed lines`,
	];
	if (includeTdd) lines.push(tddPreflightLine(prefs.tddMode));
	if (includeBaseline && prefs.gitBaseline) {
		const baselineLine = renderGitBaselineLine(prefs.gitBaseline);
		if (baselineLine) lines.push(baselineLine);
	}
	lines.push(
		`- Review Workload Guard: before delegating a PR, the parent calls \`ein_review_forecast\` (a deterministic tool — pass \`base\` = the PR base) to get PRODUCTION changed lines vs the ${prefs.reviewBudgetLines}-line review budget. Test/generated lines are reported, never counted. If production exceeds the budget, pause and ask the user (single PR vs split into smaller PRs); forward \`Production lines: N\` so ein-git gates without re-measuring. \`auto\` execution mode does NOT bypass this gate.`,
	);
	return lines.join("\n");
}

export async function ensureSddPreflight(
	ctx: ExtensionContext,
	callbacks: SddPreflightCallbacks,
): Promise<SddPreflightPreferences> {
	const sessionKey = sddPreflightSessionKey(ctx);
	const existing = sddPreflightBySession.get(sessionKey);
	if (existing) return existing;
	const inFlight = sddPreflightInFlight.get(sessionKey);
	if (inFlight) return inFlight;
	const promise = (async () => {
		const engramAvailable = hasEngramToolCapability(callbacks.pi);
		const prefs = await collectSddPreflightPreferences(ctx, engramAvailable);
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
					`Strict TDD: ${prefs.tddMode}`,
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
