// =============================================================================
// SDD ROUTER (deterministic state)
// Calcula en qué punto está un cambio SDD leyendo SOLO el filesystem — cero IA,
// cero inferencia de texto. El orquestador enruta por esto en vez de fiarse de
// lo que el modelo crea recordar. El estado nace de artefactos verificables y
// el módulo TS lo expone como tool de Pi.
//
// Artefactos por fase (ver chains/ein-sdd.chain.md):
//   scope → scope.md · map → map.md · design → design.md
//   tasks → tasks.md · apply → apply-progress.md · verify → verify-report.md
//   close → summary.md
// El cierre usa storage interno archive/ por compatibilidad; la fase publica es close.
//
// Raíz de cambios DUAL: `openspec/changes/` es la canónica; si no existe pero
// hay `.sdd/changes/` (gramática previa / herramienta externa), se usa esa.
// Los cambios legacy usan `explore.md` (≈ scope+map fusionados) y `apply.md`
// (plan de implementación ≈ design): se aceptan como alias de presencia para
// que status/check/close funcionen sobre trabajo ya existente sin migrarlo.
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { readSpecDeltaDeclaration } from "./sdd-guardrails.ts";
import { evaluateOpenSpecState, type OpenSpecState, type SyncBaseInput } from "./openspec-spec-sync.ts";
import { DEFAULT_LANE, LANE_PHASES, laneIncludes, readChangeLane, type SddLane } from "./sdd-lane.ts";
import { OUT_OF_FLOW_PROFILE, type ReconciliationBlocker } from "./sdd-reconciliation.ts";

export type SddPhase = "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close";
export type SddNext = SddPhase | "done";
export type VerifyOutcome = "pass" | "fail" | "unknown" | "absent";
export type ApplyOutcome = "complete" | "partial" | "blocked" | "unknown" | "absent";

export type SddArtifactStatus = {
	phase: SddPhase;
	file: string;
	present: boolean;
};

export type SddTaskItem = {
	id: string;
	title: string;
	groupTitle?: string;
	done: boolean;
};

export type SddTasksStatus = {
	present: boolean;
	status: "ready" | "blocked" | null;
	blockedBy: string | null;
	items: SddTaskItem[];
	// Primera tarea sin marcar: el punto de reanudación del apply por grupos.
	// Tras reabrir Pi, el orquestador continúa desde aquí sin rehacer lo hecho.
	nextPending: SddTaskItem | null;
	counts: {
		pending: number;
		ready: number;
		blocked: number;
		done: number;
	};
	problems: string[];
};

export type SddBudgetStatus = {
	allocated: string | null;
	consumed: string | null;
	allocatedValue: number | null;
	consumedValue: number | null;
	problems: string[];
};

export type SddChangeSummary = {
	change: string;
	currentPhase: SddNext;
	nextRecommended: SddNext;
	tasks: SddTasksStatus["counts"];
	budget: SddBudgetStatus;
	blocked: string[];
};

export type SddBudgetAggregate = {
	allocated: number | null;
	consumed: number | null;
	changesWithBudget: number;
};

/**
 * Cómo se eligió el cambio sobre el que informa el estado. Existe porque la
 * elección implícita —`active[0]`, o sea el orden de `readdirSync`— hacía que
 * la incertidumbre se presentara como una respuesta segura: con dos cambios
 * abiertos, Ein trabajaba sobre uno sin decirlo.
 */
export type SddSelection =
	| { kind: "none" }
	| { kind: "only"; change: string }
	| { kind: "explicit"; change: string }
	| { kind: "ambiguous"; candidates: readonly string[] };

export type SddChangeStatus = {
	change: string | null;
	/** Procedencia de `change`: sin ella no se distingue una decisión de un azar. */
	selection: SddSelection;
	present: Record<SddPhase, boolean>;
	currentPhase: SddNext;
	artifacts: {
		present: SddArtifactStatus[];
		missing: SddArtifactStatus[];
	};
	summary: SddChangeSummary | null;
	tasks: SddTasksStatus;
	budget: SddBudgetStatus;
	apply: ApplyOutcome;
	verify: VerifyOutcome;
	// verify-report.md es anterior al último apply → una corrección posterior
	// invalidó la verificación; no se puede cerrar con evidencia obsoleta.
	verifyStale: boolean;
	specState: OpenSpecState | "legacy";
	/** Con cuántas fases se conduce este cambio. `standard` salvo declaración. */
	lane: SddLane;
	// summary.md es anterior a apply/verify → el resumen no refleja el estado real.
	summaryStale: boolean;
	nextRecommended: SddNext;
	blocked: string[];
};

export type CloseReadinessBlockerCode =
	| "apply-not-complete"
	| "verify-missing"
	| "verify-failed"
	| "verify-unclear"
	| "verify-stale"
	| "summary-missing"
	| "summary-stale"
	| "tasks-pending"
	| "spec-pending"
	| "spec-conflict"
	| "spec-unresolved";

export type CloseReadinessBlocker = { code: CloseReadinessBlockerCode; message: string };
export type CloseReadinessOptions = { reconciliationProfile?: string };
export type CloseReadiness = {
	ready: boolean;
	reasons: string[];
	blockers: CloseReadinessBlocker[];
	legacyEligibility: "declarationless-record" | null;
	reconciliationEligibility: typeof OUT_OF_FLOW_PROFILE | null;
	reconciliationBlockers: ReconciliationBlocker[];
};

export type SddNextReport = {
	change: string | null;
	exists: boolean;
	currentPhase: SddNext;
	nextRecommended: SddNext;
	reason: string;
	suggestedAction: string;
	blocked: string[];
};

// Fase → fichero que la marca como hecha.
const PHASE_ARTIFACT: Record<SddPhase, string> = {
	scope: "scope.md",
	map: "map.md",
	design: "design.md",
	tasks: "tasks.md",
	apply: "apply-progress.md",
	verify: "verify-report.md",
	close: "summary.md",
};

const SPEC_MAP_PROVENANCE_STATES = ["unresolved", "conflict"] as const;
type SpecMapProvenanceState = (typeof SPEC_MAP_PROVENANCE_STATES)[number];

function isSpecMapProvenanceState(state: OpenSpecState | "legacy"): state is SpecMapProvenanceState {
	return state === "unresolved" || state === "conflict";
}

function specMapProvenanceBlocker(state: SpecMapProvenanceState): string {
	return `estado de specs OpenSpec: ${state}; map bloqueado hasta resolver la procedencia desde scope.`;
}

function specMapProvenanceAction(state: SpecMapProvenanceState): string {
	return state === "unresolved"
		? "Mantén el cambio en scope y ejecuta el flujo OpenSpec existente de validación para resolver la procedencia unresolved antes de mapear."
		: "Mantén el cambio en scope y ejecuta el flujo OpenSpec existente de validación/sincronización para resolver la procedencia conflict antes de mapear.";
}

function findSpecMapProvenanceState(blocked: readonly string[]): SpecMapProvenanceState | null {
	return SPEC_MAP_PROVENANCE_STATES.find((state) => blocked.includes(specMapProvenanceBlocker(state))) ?? null;
}

const SDD_NEXT_COPY: Record<SddNext, { reason: string; suggestedAction: string }> = {
	scope: {
		reason: "El cambio todavia no tiene alcance SDD definido.",
		suggestedAction: "Define scope antes de mapear o disenar.",
	},
	map: {
		reason: "Ya existe scope; falta mapear riesgos, archivos probables y contexto aplicable.",
		suggestedAction: "Ejecuta la fase map para convertir el alcance en contexto aplicable.",
	},
	design: {
		reason: "La exploracion ya existe; falta decidir la forma tecnica antes de partir trabajo.",
		suggestedAction: "Ejecuta la fase de diseno y deja criterios de exito claros.",
	},
	tasks: {
		reason: "El diseno ya existe; falta convertirlo en una checklist ejecutable.",
		suggestedAction: "Ejecuta sdd-tasks para crear tareas pequenas, verificables y listas para apply.",
	},
	apply: {
		reason: "La lista de tareas existe, pero la implementacion aun no esta completa.",
		suggestedAction: "Ejecuta apply solo sobre el siguiente batch pendiente y conserva evidencia.",
	},
	verify: {
		reason: "La implementacion esta marcada como completa; falta verificar o corregir la verificacion.",
		suggestedAction: "Ejecuta verify y no cierres el cambio hasta tener resultado pass.",
	},
	close: {
		reason: "La verificacion paso; el cambio esta listo para cierre controlado.",
		suggestedAction: "Cierra el cambio verificado con el flujo canonico de cierre.",
	},
	done: {
		reason: "No hay un cambio activo que continuar.",
		suggestedAction: "Crea o nombra un cambio antes de pedir el siguiente paso.",
	},
};

// Alias legacy por fase: primer fichero existente gana; el canónico es el [0].
const PHASE_ARTIFACT_ALIASES: Partial<Record<SddPhase, string[]>> = {
	scope: ["scope.md", "explore.md"],
	map: ["map.md", "explore.md"],
	design: ["design.md", "apply.md"],
};

// Un nombre de cambio es un SEGMENTO de ruta, nunca una ruta. Sin esto, un
// `..` escapa de `openspec/changes/` y escribe donde no debe, y un nombre vacío
// apunta al directorio de cambios ENTERO. `archive` está reservado al storage.
// Compartido a propósito: sdd-close y la sincronización OpenSpec validaban por
// separado (o no validaban), y esa divergencia fue justo el agujero.
export function isSafeChangeName(change: unknown): change is string {
	return (
		typeof change === "string" &&
		change.length > 0 &&
		change !== "archive" &&
		!change.includes("/") &&
		!change.includes("\\") &&
		!change.includes("..")
	);
}

// Raíz de cambios: canónica `openspec/changes/`; fallback `.sdd/changes/`.
export function resolveChangesDir(cwd: string): string {
	const canonical = join(cwd, "openspec", "changes");
	if (existsSync(canonical)) return canonical;
	const legacy = join(cwd, ".sdd", "changes");
	if (existsSync(legacy)) return legacy;
	return canonical;
}

function changesDir(cwd: string): string {
	return resolveChangesDir(cwd);
}

// Ruta del artefacto de una fase dentro de un cambio, resolviendo alias legacy:
// devuelve el primer fichero existente, o el canónico si no existe ninguno.
function phaseArtifactPath(changePath: string, phase: SddPhase): string {
	const candidates = PHASE_ARTIFACT_ALIASES[phase] ?? [PHASE_ARTIFACT[phase]];
	for (const file of candidates) {
		const path = join(changePath, file);
		if (existsSync(path)) return path;
	}
	return join(changePath, PHASE_ARTIFACT[phase]);
}

// Cambios activos = subdirectorios de openspec/changes/ excepto `archive/`.
export function listActiveChanges(cwd: string): string[] {
	const dir = changesDir(cwd);
	if (!existsSync(dir)) return [];
	let entries: string[] = [];
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const out: string[] = [];
	for (const entry of entries) {
		if (entry === "archive") continue;
		try {
			if (statSync(join(dir, entry)).isDirectory()) out.push(entry);
		} catch {
			// ignorar entradas ilegibles
		}
	}
	return out.sort();
}

function emptyTasksStatus(present = false, problem?: string): SddTasksStatus {
	return {
		present,
		status: null,
		blockedBy: null,
		items: [],
		nextPending: null,
		counts: { pending: 0, ready: 0, blocked: 0, done: 0 },
		problems: problem ? [problem] : [],
	};
}

function emptyBudgetStatus(problem?: string): SddBudgetStatus {
	return {
		allocated: null,
		consumed: null,
		allocatedValue: null,
		consumedValue: null,
		problems: problem ? [problem] : [],
	};
}

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function parseNumber(value: string | null): number | null {
	if (!value) return null;
	const match = value.match(/-?\d+(?:\.\d+)?/);
	return match ? Number(match[0]) : null;
}

function parseBudgetLine(content: string, keys: string[]): string | null {
	for (const key of keys) {
		const match = content.match(new RegExp(`^\\s*${key}\\s*[:=]\\s*(.+)$`, "im"));
		if (match?.[1]?.trim()) return match[1].trim();
	}
	return null;
}

function readTasksStatus(changePath: string): SddTasksStatus {
	const path = join(changePath, PHASE_ARTIFACT.tasks);
	if (!existsSync(path)) return emptyTasksStatus(false, "tasks.md ausente.");
	const content = readText(path);
	if (content === null) return emptyTasksStatus(true, "tasks.md no se pudo leer.");

	const statusMatch = content.match(/^\s*status\s*[:=]\s*(ready|blocked)\b/im);
	const blockedByMatch = content.match(/^\s*blocked_by\s*[:=]\s*(.+)$/im);
	const status = statusMatch ? (statusMatch[1].toLowerCase() as "ready" | "blocked") : null;
	const rawBlockedBy = blockedByMatch?.[1]?.trim() ?? null;
	const blockedBy = rawBlockedBy && !/^none$/i.test(rawBlockedBy) ? rawBlockedBy : null;
	const items: SddTaskItem[] = [];
	let groupTitle: string | undefined;

	for (const line of content.split("\n")) {
		const headingMatch = line.match(/^##\s+(.+)$/);
		if (headingMatch) {
			groupTitle = headingMatch[1].trim().replace(/^\/\/\s*\d+\.\s*/, "").trim() || undefined;
			continue;
		}
		const match = line.match(/^\s*-\s*\[( |x|X)\]\s+(.+)$/);
		if (!match) continue;
		const title = match[2].trim();
		const idMatch = title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
		items.push({
			id: idMatch?.[1] ?? String(items.length + 1),
			title: idMatch?.[2]?.trim() ?? title,
			...(groupTitle ? { groupTitle } : {}),
			done: match[1].toLowerCase() === "x",
		});
	}

	const done = items.filter((item) => item.done).length;
	const pending = items.length - done;
	const blocked = status === "blocked" ? pending : 0;
	const ready = status === "ready" ? pending : 0;
	const nextPending = items.find((item) => !item.done) ?? null;
	const problems: string[] = [];
	if (!status) problems.push("tasks.md sin status ready|blocked.");
	if (!blockedByMatch) problems.push("tasks.md sin blocked_by.");
	if (items.length === 0) problems.push("tasks.md sin checkboxes parseables.");

	return { present: true, status, blockedBy, items, nextPending, counts: { pending, ready, blocked, done }, problems };
}

function readBudgetStatus(changePath: string): SddBudgetStatus {
	const out = emptyBudgetStatus();
	const scopePath = phaseArtifactPath(changePath, "scope");
	const mapPath = phaseArtifactPath(changePath, "map");

	if (existsSync(scopePath)) {
		const scope = readText(scopePath);
		if (scope === null) out.problems.push("scope.md no se pudo leer para budget.");
		else out.allocated = parseBudgetLine(scope, ["budget_allocated", "budget"]);
	}
	if (existsSync(mapPath)) {
		const map = readText(mapPath);
		if (map === null) out.problems.push("map.md no se pudo leer para budget.");
		else out.consumed = parseBudgetLine(map, ["budget_consumed", "budget_used", "consumed"]);
	}

	out.allocatedValue = parseNumber(out.allocated);
	out.consumedValue = parseNumber(out.consumed);
	return out;
}

function artifactLists(present: Record<SddPhase, boolean>, lane: SddLane): SddChangeStatus["artifacts"] {
	// En `micro`, map y tasks no "faltan": no se esperan. Listarlas como
	// ausentes convertiría una fase no pedida en una deuda aparente.
	const artifacts = LANE_PHASES[lane].map((phase) => ({ phase, file: PHASE_ARTIFACT[phase], present: present[phase] }));
	return {
		present: artifacts.filter((artifact) => artifact.present),
		missing: artifacts.filter((artifact) => !artifact.present),
	};
}

function readVerifyOutcome(changePath: string): VerifyOutcome {
	const path = join(changePath, PHASE_ARTIFACT.verify);
	if (!existsSync(path)) return "absent";
	let content = "";
	try {
		content = readFileSync(path, "utf8").toLowerCase();
	} catch {
		return "unknown";
	}
	// Busca una línea explícita `status: pass|fail` (o "result: ...").
	const match = content.match(/\b(?:status|result|resultado)\s*[:=]\s*(pass|fail|passed|failed|ok|pasa|falla)\b/);
	if (match) {
		return /pass|passed|ok|pasa/.test(match[1]) ? "pass" : "fail";
	}
	// Heurística suave: marcas claras de fallo sin línea de status.
	if (/\bfail\b|\bfailed\b|\bcritical\b|\bblocker\b/.test(content)) return "fail";
	return "unknown";
}

function fileMtimeMs(path: string): number | null {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return null;
	}
}

// mtime más nuevo entre los ficheros ENTREGADOS (producción + tests) que
// tasks.md declara. `null` si no se pueden enumerar (sin tasks.md, o rutas
// ilustrativas sin fichero real): el llamador cae al proxy conservador.
function newestDeliveredMtime(cwd: string, changePath: string): number | null {
	const tasks = readText(phaseArtifactPath(changePath, "tasks"));
	if (tasks === null) return null;
	let newest: number | null = null;
	for (const rel of extractDeliveredFiles(tasks)) {
		const m = fileMtimeMs(join(cwd, rel));
		if (m !== null && (newest === null || m > newest)) newest = m;
	}
	return newest;
}

// Obsolescencia determinista por mtime. P2-F: la evidencia de verify se invalida
// por cambios en la SUPERFICIE ENTREGADA (producción + tests), no por que el
// apply reescribiera apply-progress.md. Una normalización post-verify (cabecera
// de un spec canónico bajo openspec/, docs) bombea apply-progress.md pero no toca
// código ni tests → no debe forzar un re-verify caro. Fuente fina: el mtime de
// los ficheros que tasks.md declara. Si no se pueden enumerar, se cae al proxy
// conservador por apply-progress.md (comportamiento previo). Comparación estricta
// (`>`): ante empate, fresco.
function computeStaleness(
	cwd: string,
	changePath: string,
	present: Record<SddPhase, boolean>,
): { verifyStale: boolean; summaryStale: boolean } {
	const applyM = present.apply ? fileMtimeMs(phaseArtifactPath(changePath, "apply")) : null;
	const verifyM = present.verify ? fileMtimeMs(phaseArtifactPath(changePath, "verify")) : null;
	const summaryM = present.close ? fileMtimeMs(phaseArtifactPath(changePath, "close")) : null;
	const deliveredM = newestDeliveredMtime(cwd, changePath);
	const newerThan = (ref: number): boolean =>
		deliveredM !== null ? deliveredM > ref : applyM !== null && applyM > ref;
	const verifyStale = verifyM !== null && newerThan(verifyM);
	const summaryStale =
		summaryM !== null && (newerThan(summaryM) || (verifyM !== null && verifyM > summaryM));
	return { verifyStale, summaryStale };
}

function readOpenSpecState(cwd: string, change: string): OpenSpecState | "legacy" {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes")) return "legacy";
	const declaration = readSpecDeltaDeclaration(cwd, change);
	const bases: SyncBaseInput[] = [];
	for (const delta of declaration.deltas) {
		const domain = delta.path.split("/")[1]!;
		const path = join(cwd, "openspec", "specs", domain, "spec.md");
		if (!existsSync(path)) continue;
		try { bases.push({ domain, bytes: readFileSync(path) }); } catch { return "unresolved"; }
	}
	const reportPath = join(cwd, "openspec", "changes", change, "sync-report.md");
	const report = readText(reportPath);
	return evaluateOpenSpecState({ declaration: declaration.mode, change, deltas: declaration.deltas, bases, report });
}

function readApplyOutcome(changePath: string): ApplyOutcome {
	const path = join(changePath, PHASE_ARTIFACT.apply);
	if (!existsSync(path)) return "absent";
	let content = "";
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return "unknown";
	}
	// BLINDAJE -> Solo `status: complete` permite avanzar a verify.
	// partial y blocked satisfacen el formato pero no son complete.
	const match = content.match(/\bstatus\s*[:=]\s*(complete|partial|blocked)\b/i);
	if (match) {
		const v = match[1].toLowerCase();
		if (v === "complete") return "complete";
		if (v === "partial") return "partial";
		if (v === "blocked") return "blocked";
	}
	// Si existe pero no tiene status legible → treated as partial (backward-compat).
	return "partial";
}

// Estado determinista de UN cambio. Si no se pasa `change`, usa el único activo
// (o el primero alfabético si hay varios; el caller decide si desambiguar).
/**
 * La única implementación de "cuál es el cambio activo". Ante varios candidatos
 * y sin petición explícita no elige: representa la ambigüedad y deja que el
 * consumidor pida uno. Fail-closed aplicado a una pregunta de estado.
 */
export function resolveActiveSelection(cwd: string, change?: string): SddSelection {
	if (change) return { kind: "explicit", change };
	const active = listActiveChanges(cwd);
	if (active.length === 0) return { kind: "none" };
	if (active.length === 1) return { kind: "only", change: active[0]! };
	// Orden estable: `readdirSync` varía entre máquinas y el mensaje no debe.
	return { kind: "ambiguous", candidates: [...active].sort() };
}

/** El cambio elegido, o `null` si no hay ninguno o hay más de uno sin elegir. */
export function selectedChange(selection: SddSelection): string | null {
	return selection.kind === "only" || selection.kind === "explicit" ? selection.change : null;
}

export function ambiguousChangeBlocker(candidates: readonly string[]): string {
	return `hay ${candidates.length} cambios activos y ninguno elegido: indica cuál con su nombre (${candidates.join(", ")}).`;
}

/**
 * El mensaje para una superficie que necesitaba un cambio y no lo tiene, o
 * `null` si sí lo tiene. Distingue "no hay ninguno" de "hay varios": decir lo
 * primero habiendo dos es la mentira que la elección implícita producía.
 */
export function changeUnavailableMessage(cwd: string, command: string, requested?: string): string | null {
	const selection = resolveActiveSelection(cwd, requested);
	if (selection.kind === "ambiguous") {
		return `// sdd ${command} — hay ${selection.candidates.length} cambios activos y ninguno elegido: ${selection.candidates.join(", ")}. Indica cuál.`;
	}
	if (selection.kind === "none") return `// sdd ${command} — no active change in openspec/changes/.`;
	return null;
}

export function resolveSddStatus(cwd: string, change?: string): SddChangeStatus {
	const selection = resolveActiveSelection(cwd, change);
	const target = selectedChange(selection);

	const present: Record<SddPhase, boolean> = {
		scope: false,
		map: false,
		design: false,
		tasks: false,
		apply: false,
		verify: false,
		close: false,
	};
	const blocked: string[] = [];

	if (!target) {
		const tasks = emptyTasksStatus(false);
		const budget = emptyBudgetStatus();
		// La ambigüedad no es "no hay trabajo": se dice, y se nombra a los
		// candidatos, para que la pantalla no la confunda con un repo limpio.
		if (selection.kind === "ambiguous") blocked.push(ambiguousChangeBlocker(selection.candidates));
		return {
			change: null,
			selection,
			present,
			currentPhase: "done",
			artifacts: artifactLists(present, DEFAULT_LANE),
			lane: DEFAULT_LANE,
			summary: null,
			tasks,
			budget,
			apply: "absent",
			verify: "absent",
			verifyStale: false,
			specState: "legacy",
			summaryStale: false,
			nextRecommended: "done",
			blocked,
		};
	}

	const changePath = join(changesDir(cwd), target);
	for (const phase of Object.keys(present) as SddPhase[]) {
		present[phase] = existsSync(phaseArtifactPath(changePath, phase));
	}

	const apply = readApplyOutcome(changePath);
	const verify = readVerifyOutcome(changePath);
	const tasks = readTasksStatus(changePath);
	const budget = readBudgetStatus(changePath);
	const { verifyStale, summaryStale } = computeStaleness(cwd, changePath, present);
	const specState = readOpenSpecState(cwd, target);

	const lane = readChangeLane(join(resolveChangesDir(cwd), target));

	// Fuga de artefacto de fase: una fase presente cuyo predecesor FALTA significa
	// que una fase-agente (p.ej. sdd-map) se usó como explorador para un cambio que
	// aún no se había scopeado, dejando un artefacto/dir stray. Determinista: lo
	// surface en el status en vez de dejarlo pasar. (El flujo normal escribe en
	// orden, así que sin fuga no hay huecos y no hay falso positivo.)
	//
	// EL HUECO SE MIDE CONTRA EL CARRIL, no contra las siete fases: en `micro`,
	// map y tasks no se piden, así que su ausencia no es fuga. Medirlo contra
	// las siete fases bloqueaba todo cambio `micro` en cuanto tenía design.md,
	// exigiendo justo las dos fases que el carril existe para saltarse.
	const lanePhases = LANE_PHASES[lane];
	const orderPresent = lanePhases.map((phase) => present[phase]);
	const lastPresentIdx = orderPresent.lastIndexOf(true);
	const gaps = lanePhases.slice(0, Math.max(0, lastPresentIdx))
		.filter((_, index) => !orderPresent[index])
		.map((phase) => PHASE_ARTIFACT[phase]);
	if (gaps.length > 0) {
		blocked.push(
			`artefacto(s) fuera de orden: hay ${PHASE_ARTIFACT[lanePhases[lastPresentIdx]]} sin ${gaps.join(", ")} — ¿una fase se usó como explorador pre-SDD? limpia el change dir o arranca por scope.`,
		);
	}

	// Siguiente fase: la primera no presente en orden, con la verificación como
	// gate antes de cerrar. apply-progress.md con status != complete retiene apply.
	// El carril decide contra QUÉ lista se mira, no cómo se mira: sigue siendo
	// "la primera fase esperada que no tiene su artefacto en disco".
	const pending = lanePhases.find(
		(phase) => phase !== "close" && phase !== "verify" && phase !== "apply" && !present[phase],
	);

	let nextRecommended: SddNext;
	if (pending) nextRecommended = pending;
	else if (!present.apply) nextRecommended = "apply";
	else if (apply !== "complete") {
		// FAIL CLOSED -> apply existe pero sin status:complete → no avanza a verify.
		nextRecommended = "apply";
		if (apply === "blocked") blocked.push("apply-progress.md indica bloqueo.");
		else if (apply !== "absent") blocked.push("apply-progress.md sin `status: complete`: aplicar más trabajo o marcar `status: blocked` si hay impediment.");
	} else if (!present.verify) nextRecommended = "verify";
	else if (verify === "fail") {
		nextRecommended = "verify";
		blocked.push("verify-report indica fallo: remediar antes de cerrar.");
	} else if (verify === "pass" && verifyStale) {
		// Corrección posterior a verify: la evidencia es obsoleta, re-verificar.
		nextRecommended = "verify";
		blocked.push("verify-report es anterior al último apply: re-verifica antes de cerrar (evidencia obsoleta).");
	} else if (verify === "pass") nextRecommended = "close";
	else {
		// verify presente pero sin status legible → re-verificar para refrescar evidencia.
		nextRecommended = "verify";
		blocked.push("verify-report sin línea `status: pass|fail` clara.");
	}

	const canonicalChanges = resolveChangesDir(cwd) === join(cwd, "openspec", "changes");
	if (canonicalChanges && nextRecommended === "map" && laneIncludes(lane, "map") && isSpecMapProvenanceState(specState)) {
		blocked.push(specMapProvenanceBlocker(specState));
		nextRecommended = "scope";
	}

	if (["scope", "map", "design"].includes(nextRecommended) && !tasks.present) {
		tasks.problems = tasks.problems.filter((problem) => problem !== "tasks.md ausente.");
	}
	if (tasks.status === "blocked" && tasks.blockedBy) blocked.push(`tasks.md bloqueado por: ${tasks.blockedBy}`);

	const currentPhase = nextRecommended;
	const summary: SddChangeSummary = {
		change: target,
		currentPhase,
		nextRecommended,
		tasks: tasks.counts,
		budget,
		blocked,
	};

	return {
		change: target,
		selection,
		present,
		currentPhase,
		artifacts: artifactLists(present, lane),
		summary,
		tasks,
		budget,
		apply,
		verify,
		verifyStale,
		specState,
		lane,
		summaryStale,
		nextRecommended,
		blocked,
	};
}

// Readiness DETERMINISTA para cerrar un cambio. El cierre mueve el cambio a
// archive/ y no debe hacerse sobre evidencia incompleta u obsoleta: apply debe
// estar completo, verify debe ser pass y fresco (no anterior al apply), summary
// debe existir y ser fresco, y no pueden quedar tareas pendientes.
function declarationlessLegacyEligible(cwd: string, change: string, status: SddChangeStatus): boolean {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes") || status.specState !== "unresolved") return false;
	const changePath = join(cwd, "openspec", "changes", change);
	const scope = readText(join(changePath, "scope.md"));
	if (scope === null || /## Spec delta declaration|spec_delta:|spec_delta_reason:/.test(scope)) return false;
	if (existsSync(join(changePath, "sync-report.md"))) return false;

	const specs = join(changePath, "specs");
	if (existsSync(specs)) {
		let domains: string[];
		try { domains = readdirSync(specs); } catch { return false; }
		if (domains.some((domain) => existsSync(join(specs, domain, "spec.md")))) return false;
	}

	return status.apply === "complete" &&
		status.present.verify && status.verify === "pass" && !status.verifyStale &&
		status.present.close && !status.summaryStale &&
		status.tasks.counts.pending === 0;
}

function scopeOnlyOutOfFlowEligible(cwd: string, change: string, status: SddChangeStatus): boolean {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes")) return false;
	const changePath = join(cwd, "openspec", "changes", change);
	const scope = readText(join(changePath, "scope.md"));
	if (scope === null) return false;

	// Annotated rather than inferred: ReturnType picks readdirSync's Buffer
	// overload, which makes every entry.name a Buffer instead of a string.
	let entries: Dirent[];
	try { entries = readdirSync(changePath, { withFileTypes: true }); } catch { return false; }
	const allowed = new Set(["scope.md", "summary.md", "out-of-flow-reconciliation.json"]);
	if (!entries.some((entry) => entry.isFile() && entry.name === "scope.md")
		|| entries.some((entry) => !entry.isFile() || !allowed.has(entry.name))) return false;

	const declaration = readSpecDeltaDeclaration(cwd, change);
	const normalizedScope = scope.replaceAll("\r\n", "\n");
	const declarationBlocks = [...normalizedScope.matchAll(/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm)];
	const declarationTokens = /## Spec delta declaration|spec_delta:|spec_delta_reason:/;
	const hasDeclarationTokens = declarationTokens.test(normalizedScope);
	const contentOutsideDeclaration = declarationBlocks.length === 1
		? normalizedScope.replace(declarationBlocks[0]![0], "")
		: normalizedScope;
	const declarationless = !hasDeclarationTokens && declaration.mode === "invalid" && status.specState === "unresolved";
	const declaredNone = declarationBlocks.length === 1
		&& !declarationTokens.test(contentOutsideDeclaration)
		&& declaration.mode === "none"
		&& status.specState === "synchronized";
	return declarationless || declaredNone;
}

function assessReconciliationReadiness(
	cwd: string,
	change: string,
	status: SddChangeStatus,
	profile: string | undefined,
): Pick<CloseReadiness, "reconciliationEligibility" | "reconciliationBlockers"> {
	if (profile === undefined) return { reconciliationEligibility: null, reconciliationBlockers: [] };
	if (profile !== OUT_OF_FLOW_PROFILE) {
		return {
			reconciliationEligibility: null,
			reconciliationBlockers: [{ code: "reconciliation-profile-unsupported", message: "The exact scope-only-out-of-flow profile is required." }],
		};
	}
	if (!scopeOnlyOutOfFlowEligible(cwd, change, status)) {
		return {
			reconciliationEligibility: null,
			reconciliationBlockers: [{ code: "reconciliation-record-ineligible", message: "The record is not an eligible scope-only shape and spec state." }],
		};
	}
	return { reconciliationEligibility: OUT_OF_FLOW_PROFILE, reconciliationBlockers: [] };
}

export function assessCloseReadiness(cwd: string, change: string, options: CloseReadinessOptions = {}): CloseReadiness {
	const status = resolveSddStatus(cwd, change);
	const blockers: CloseReadinessBlocker[] = [];
	const add = (code: CloseReadinessBlockerCode, message: string) => blockers.push({ code, message });
	if (status.apply !== "complete") add("apply-not-complete", "apply no está `status: complete`.");
	if (!status.present.verify) add("verify-missing", "falta verify-report.md.");
	else if (status.verify === "fail") add("verify-failed", "verify-report indica fallo.");
	else if (status.verify !== "pass") add("verify-unclear", "verify-report sin `status: pass` claro.");
	if (status.verifyStale) add("verify-stale", "verify-report es anterior al último apply (evidencia obsoleta): re-verifica.");
	if (!status.present.close) add("summary-missing", "falta summary.md.");
	else if (status.summaryStale) add("summary-stale", "summary.md es anterior a apply/verify: regenera el resumen.");
	if (status.tasks.counts.pending > 0) add("tasks-pending", `quedan ${status.tasks.counts.pending} tarea(s) sin completar.`);
	if (status.specState === "pending") add("spec-pending", "estado de specs OpenSpec: pending.");
	else if (status.specState === "conflict") add("spec-conflict", "estado de specs OpenSpec: conflict.");
	else if (status.specState === "unresolved") add("spec-unresolved", "estado de specs OpenSpec: unresolved.");

	const reconciliation = assessReconciliationReadiness(cwd, change, status, options.reconciliationProfile);
	return {
		ready: blockers.length === 0,
		reasons: blockers.map((blocker) => blocker.message),
		blockers,
		legacyEligibility: declarationlessLegacyEligible(cwd, change, status) ? "declarationless-record" : null,
		...reconciliation,
	};
}

// Preview DETERMINISTA del plan de apply, leído de tasks.md: por grupo, sus
// ficheros de PRODUCCIÓN y un comando de verify representativo. Lo consume el
// brief docente pre-apply para que "qué se toca" sean hechos, no la paráfrasis
// del modelo. Puro y testeable.
export type SddPlanGroup = { title: string; files: string[]; verify: string | null };
export type SddPlanPreview = { change: string; groups: SddPlanGroup[] };

// Ficheros que el apply EDITA y que cuestan ciclos: código y CONTRATOS markdown
// (prompts de agentes en runtime/agents, orchestrator, docs). Antes `.md`
// quedaba fuera del patrón y el preview mentía con "sin ficheros de producción"
// en cambios que SOLO tocaban contratos (el caso real del slice 05). Pero no
// todo `.md` es producción: los artefactos de proceso SDD y el árbol openspec/
// (specs y deltas los gestiona el sync / la tool de deltas, no el apply a mano)
// contarían como ruido en el sentido opuesto — se excluyen explícitamente.
const SOURCE_FILE_RE = /[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|c|cc|cpp|cs|php|sql|css|scss|less|md)\b/g;
const PLAN_VERIFY_RE = /\bbunx?\s+(?:vitest\s+run|vitest|test)\b[^`\n]*/i;
const SDD_ARTIFACT_BASENAMES = new Set(["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md", "verify-report.md", "summary.md", "sync-report.md"]);

export function isTestPath(path: string): boolean {
	return /\.(?:test|spec)\.|(?:^|\/)(?:tests?|__tests__|e2e)\//.test(path);
}

// Proceso SDD y árbol openspec/.sdd (spec-sync / tool de deltas): ni código ni
// tests entregados. El apply no los edita a mano.
function isProcessOrSpecPath(path: string): boolean {
	if (/(?:^|\/)(?:openspec|\.sdd)\//.test(path)) return true;
	return SDD_ARTIFACT_BASENAMES.has(path.split("/").pop() ?? path);
}

export function isProductionFile(path: string): boolean {
	return !isTestPath(path) && !isProcessOrSpecPath(path);
}

export function extractProductionFiles(body: string): string[] {
	return [...new Set([...body.matchAll(SOURCE_FILE_RE)].map((match) => match[0]).filter(isProductionFile))];
}

// Superficie ENTREGADA: producción + tests (lo que verify cubre). A diferencia
// de extractProductionFiles, conserva los tests; excluye proceso SDD y openspec/.
export function extractDeliveredFiles(body: string): string[] {
	return [...new Set([...body.matchAll(SOURCE_FILE_RE)].map((match) => match[0]).filter((path) => !isProcessOrSpecPath(path)))];
}

// Línea de budget para el status. P2-G: el "asignado" era decoración muda —
// consumir el doble no producía señal alguna (el trace mostró allocated=15000
// junto a consumed=30690 sin más). Cuando lo consumido supera lo asignado, se
// dice, y el número pasa a significar algo. Es ADVISORY: no bloquea (no alimenta
// sddStatusBlockers), solo hace honesto el dato. Fuente única para el render real
// y el test (mata la deriva de la réplica del formatter).
export function formatBudget(budget: SddBudgetStatus): string {
	if (!budget.allocated && !budget.consumed) return "absent";
	const base = `allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`;
	const { allocatedValue: allocated, consumedValue: consumed } = budget;
	if (allocated !== null && consumed !== null && consumed > allocated) {
		const pct = allocated > 0 ? ` (${Math.round((consumed / allocated) * 100)}%)` : "";
		return `${base} · ⚠ sobre lo asignado${pct}`;
	}
	return base;
}

// Los problemas de PROCEDENCIA del ledger (attribution de recibos:
// change-unresolved, legacy-metadata-excluded, ...) NO son bloqueos del cambio:
// nunca impidieron nada y ya se muestran en la línea `ledger provenance:`.
// Mezclarlos con los bloqueos reales (verify en fallo, apply incompleto)
// ahogaba la señal. Esta función es la fuente ÚNICA de la sección de bloqueos,
// para el render real y para el test — la procedencia del ledger ni siquiera es
// un parámetro, así que no puede colarse.
export function sddStatusBlockers(input: {
	blocked: readonly string[];
	taskProblems: readonly string[];
	budgetProblems: readonly string[];
}): string[] {
	return [...input.blocked, ...input.taskProblems, ...input.budgetProblems];
}

export function resolveSddPlanPreview(cwd: string, change?: string): SddPlanPreview {
	const target = selectedChange(resolveActiveSelection(cwd, change));
	if (!target) return { change: "", groups: [] };
	const content = readText(join(changesDir(cwd), target, PHASE_ARTIFACT.tasks));
	if (content === null) return { change: target, groups: [] };
	const groups: SddPlanGroup[] = [];
	// [preámbulo, heading1, body1, heading2, body2, ...]
	const parts = content.split(/^##\s+(.+)$/m);
	for (let i = 1; i < parts.length; i += 2) {
		const title = (parts[i] ?? "").trim();
		const body = parts[i + 1] ?? "";
		const files = extractProductionFiles(body);
		const verifyMatch = body.match(PLAN_VERIFY_RE);
		groups.push({ title, files, verify: verifyMatch ? verifyMatch[0].trim() : null });
	}
	return { change: target, groups };
}

// Bloque compacto para el orquestador: alimenta el "QUÉ SE TOCA" del brief.
export function formatSddPlanPreview(preview: SddPlanPreview): string {
	if (preview.groups.length === 0) return "";
	const lines = [`plan de apply: ${preview.groups.length} grupo(s)`];
	for (const group of preview.groups) {
		lines.push(`- ${group.title}`);
		lines.push(`    toca: ${group.files.length ? group.files.join(", ") : "(sin ficheros de producción)"}`);
		if (group.verify) lines.push(`    verify: ${group.verify}`);
	}
	return lines.join("\n");
}

export function resolveSddNext(cwd: string, change?: string): SddNextReport {
	const active = listActiveChanges(cwd);
	const exists = typeof change === "string" && active.includes(change);

	if (change && !exists) {
		return {
			change,
			exists: false,
			currentPhase: "done",
			nextRecommended: "done",
			reason: `No encontre el cambio '${change}' entre los cambios activos.`,
			suggestedAction: "Revisa el nombre del cambio o crea uno nuevo antes de continuar.",
			blocked: [],
		};
	}

	const status = resolveSddStatus(cwd, change);
	const copy = SDD_NEXT_COPY[status.nextRecommended];
	const blockers = [...status.blocked, ...status.tasks.problems, ...status.budget.problems];
	const provenanceState = findSpecMapProvenanceState(status.blocked);
	const reason = provenanceState
		? specMapProvenanceBlocker(provenanceState)
		: blockers.length > 0
			? `${copy.reason} Hay bloqueos o datos incompletos que revisar.`
			: copy.reason;
	const suggestedAction = provenanceState ? specMapProvenanceAction(provenanceState) : copy.suggestedAction;
	return {
		change: status.change,
		exists: status.change !== null,
		currentPhase: status.currentPhase,
		nextRecommended: status.nextRecommended,
		reason,
		suggestedAction,
		blocked: blockers,
	};
}

// El comando `/ein:sdd-next` imprime su reporte al USUARIO: nada de eso llega al
// orquestador, que es quien ejecuta fases. Sin esta traducción el comando es un
// callejón sin salida — dice "Ejecuta verify" y no se lo dice a nadie.
//
// `sddNextHandoff` convierte la ruta que el router determinista YA calculó en la
// instrucción que la superficie entrega al modelo. El reparto de autoridad no
// cambia: la ruta la decide la herramienta, el modelo solo la recorre. Por eso
// la instrucción prohíbe explícitamente re-derivarla.
//
// Devuelve `null` cuando no hay nada que continuar (cambio inexistente o flujo
// terminado): no se inventa trabajo para tener algo que decir.
export function sddNextHandoff(report: SddNextReport): string | null {
	if (!report.exists || report.change === null || report.nextRecommended === "done") return null;
	const phase = report.nextRecommended;
	// `close` son dos pasos: el agente condensa `summary.md` y después el move
	// determinista archiva. Nombrar solo uno deja el cambio a medio cerrar.
	const run = phase === "close"
		? 'Run `subagent({ agent: "sdd-close", task: "…" })` to condense `summary.md`, then archive with the `ein_sdd_close` tool.'
		: `Run \`subagent({ agent: "sdd-${phase}", task: "…" })\` with the bounded task for this change.`;
	const lines = [
		`Continue the SDD change '${report.change}'.`,
		`Deterministic route, already computed — do NOT re-derive it and do NOT skip phases: current phase \`${report.currentPhase}\`, next phase to run \`${phase}\`.`,
		run,
		"Honor the change's recorded lane and TDD stance, and keep every normal scope, write, and safety requirement.",
	];
	if (report.blocked.length > 0) {
		lines.push("Resolve these router-reported blockers first; never advance past one silently:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}

export function listActiveChangeSummaries(cwd: string): SddChangeSummary[] {
	return listActiveChanges(cwd)
		.map((change) => resolveSddStatus(cwd, change).summary)
		.filter((summary): summary is SddChangeSummary => summary !== null);
}

export function aggregateSddBudget(summaries: SddChangeSummary[]): SddBudgetAggregate {
	let allocated: number | null = null;
	let consumed: number | null = null;
	let changesWithBudget = 0;
	for (const summary of summaries) {
		const hasBudget = summary.budget.allocatedValue !== null || summary.budget.consumedValue !== null;
		if (hasBudget) changesWithBudget += 1;
		if (summary.budget.allocatedValue !== null) allocated = (allocated ?? 0) + summary.budget.allocatedValue;
		if (summary.budget.consumedValue !== null) consumed = (consumed ?? 0) + summary.budget.consumedValue;
	}
	return { allocated, consumed, changesWithBudget };
}
