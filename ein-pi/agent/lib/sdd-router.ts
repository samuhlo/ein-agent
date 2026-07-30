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
import { join } from "node:path";
import { readSpecDeltaDeclaration } from "./sdd-guardrails.ts";
import { evaluateOpenSpecState, type OpenSpecState, type SyncBaseInput } from "./openspec-spec-sync.ts";
import { readSddCostLedger, type SddCostLedgerV1 } from "./sdd-cost-provenance.ts";

export type SddPhase = "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close";
export type SddNext = SddPhase | "done";
export type VerifyOutcome = "pass" | "fail" | "unknown" | "absent";
export type ApplyOutcome = "complete" | "partial" | "blocked" | "unknown" | "absent";
export type SddNextMode = "interactive" | "auto";

export type SddArtifactStatus = {
	phase: SddPhase;
	file: string;
	present: boolean;
};

export type SddTaskItem = {
	id: string;
	title: string;
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

export type SddChangeStatus = {
	change: string | null;
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
export type CloseReadiness = {
	ready: boolean;
	reasons: string[];
	blockers: CloseReadinessBlocker[];
	legacyEligibility: "declarationless-record" | null;
};

export type SddNextReport = {
	change: string | null;
	exists: boolean;
	currentPhase: SddNext;
	nextRecommended: SddNext;
	reason: string;
	suggestedAction: string;
	mode: SddNextMode;
	autoEnabled: false;
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

const PHASE_ORDER: SddPhase[] = ["scope", "map", "design", "tasks", "apply", "verify", "close"];

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

	for (const line of content.split("\n")) {
		const match = line.match(/^\s*-\s*\[( |x|X)\]\s+(.+)$/);
		if (!match) continue;
		const title = match[2].trim();
		const idMatch = title.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
		items.push({
			id: idMatch?.[1] ?? String(items.length + 1),
			title: idMatch?.[2]?.trim() ?? title,
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

function artifactLists(present: Record<SddPhase, boolean>): SddChangeStatus["artifacts"] {
	const artifacts = PHASE_ORDER.map((phase) => ({ phase, file: PHASE_ARTIFACT[phase], present: present[phase] }));
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

// Obsolescencia determinista por mtime: una corrección post-verify pasa por
// apply (que reescribe apply-progress.md), dejando el apply MÁS NUEVO que el
// verify-report → la evidencia anterior ya no describe el árbol actual. Comparación
// estricta (`>`): escrituras en el mismo ms (o apply anterior a verify, el orden
// normal) NO son obsoletas. Fuente de verdad conservadora: ante empate, fresco.
function computeStaleness(
	changePath: string,
	present: Record<SddPhase, boolean>,
): { verifyStale: boolean; summaryStale: boolean } {
	const applyM = present.apply ? fileMtimeMs(phaseArtifactPath(changePath, "apply")) : null;
	const verifyM = present.verify ? fileMtimeMs(phaseArtifactPath(changePath, "verify")) : null;
	const summaryM = present.close ? fileMtimeMs(phaseArtifactPath(changePath, "close")) : null;
	const verifyStale = verifyM !== null && applyM !== null && applyM > verifyM;
	const summaryStale =
		summaryM !== null &&
		((applyM !== null && applyM > summaryM) || (verifyM !== null && verifyM > summaryM));
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
export function resolveSddStatus(cwd: string, change?: string): SddChangeStatus {
	const active = listActiveChanges(cwd);
	const target = change ?? active[0] ?? null;

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
		return {
			change: null,
			present,
			currentPhase: "done",
			artifacts: artifactLists(present),
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
	const { verifyStale, summaryStale } = computeStaleness(changePath, present);
	const specState = readOpenSpecState(cwd, target);

	// Fuga de artefacto de fase: una fase presente cuyo predecesor FALTA significa
	// que una fase-agente (p.ej. sdd-map) se usó como explorador para un cambio que
	// aún no se había scopeado, dejando un artefacto/dir stray. Determinista: lo
	// surface en el status en vez de dejarlo pasar. (El flujo normal escribe en
	// orden, así que sin fuga no hay huecos y no hay falso positivo.)
	const orderPresent = PHASE_ORDER.map((phase) => present[phase]);
	const lastPresentIdx = orderPresent.lastIndexOf(true);
	const gaps = PHASE_ORDER.slice(0, Math.max(0, lastPresentIdx))
		.filter((_, index) => !orderPresent[index])
		.map((phase) => PHASE_ARTIFACT[phase]);
	if (gaps.length > 0) {
		blocked.push(
			`artefacto(s) fuera de orden: hay ${PHASE_ARTIFACT[PHASE_ORDER[lastPresentIdx]]} sin ${gaps.join(", ")} — ¿una fase se usó como explorador pre-SDD? limpia el change dir o arranca por scope.`,
		);
	}

	// Siguiente fase: la primera no presente en orden, con la verificación como
	// gate antes de cerrar. apply-progress.md con status != complete retiene apply.
	let nextRecommended: SddNext;
	if (!present.scope) nextRecommended = "scope";
	else if (!present.map) nextRecommended = "map";
	else if (!present.design) nextRecommended = "design";
	else if (!present.tasks) nextRecommended = "tasks";
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
		present,
		currentPhase,
		artifacts: artifactLists(present),
		summary,
		tasks,
		budget,
		apply,
		verify,
		verifyStale,
		specState,
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

export function assessCloseReadiness(cwd: string, change: string): CloseReadiness {
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

	return {
		ready: blockers.length === 0,
		reasons: blockers.map((blocker) => blocker.message),
		blockers,
		legacyEligibility: declarationlessLegacyEligible(cwd, change, status) ? "declarationless-record" : null,
	};
}

// Preview DETERMINISTA del plan de apply, leído de tasks.md: por grupo, sus
// ficheros de PRODUCCIÓN y un comando de verify representativo. Lo consume el
// brief docente pre-apply para que "qué se toca" sean hechos, no la paráfrasis
// del modelo. Puro y testeable.
export type SddPlanGroup = { title: string; files: string[]; verify: string | null };
export type SddPlanPreview = { change: string; groups: SddPlanGroup[] };

const PLAN_SOURCE_FILE_RE = /[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|c|cc|cpp|cs|php|sql|css|scss|less)\b/g;
const PLAN_VERIFY_RE = /\bbunx?\s+(?:vitest\s+run|vitest|test)\b[^`\n]*/i;

function planIsTestPath(path: string): boolean {
	return /\.(?:test|spec)\.|(?:^|\/)(?:tests?|__tests__|e2e)\//.test(path);
}

export function resolveSddPlanPreview(cwd: string, change?: string): SddPlanPreview {
	const target = change ?? listActiveChanges(cwd)[0] ?? null;
	if (!target) return { change: "", groups: [] };
	const content = readText(join(changesDir(cwd), target, PHASE_ARTIFACT.tasks));
	if (content === null) return { change: target, groups: [] };
	const groups: SddPlanGroup[] = [];
	// [preámbulo, heading1, body1, heading2, body2, ...]
	const parts = content.split(/^##\s+(.+)$/m);
	for (let i = 1; i < parts.length; i += 2) {
		const title = (parts[i] ?? "").trim();
		const body = parts[i + 1] ?? "";
		const files = [
			...new Set(
				[...body.matchAll(PLAN_SOURCE_FILE_RE)].map((m) => m[0]).filter((p) => !planIsTestPath(p)),
			),
		];
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

export function resolveSddNext(cwd: string, change?: string, options: { auto?: boolean } = {}): SddNextReport {
	const active = listActiveChanges(cwd);
	const exists = typeof change === "string" && active.includes(change);
	const mode: SddNextMode = options.auto ? "auto" : "interactive";

	if (change && !exists) {
		return {
			change,
			exists: false,
			currentPhase: "done",
			nextRecommended: "done",
			reason: `No encontre el cambio '${change}' entre los cambios activos.`,
			suggestedAction: "Revisa el nombre del cambio o crea uno nuevo antes de continuar.",
			mode,
			autoEnabled: false,
			blocked: [],
		};
	}

	const status = resolveSddStatus(cwd, change);
	const copy = SDD_NEXT_COPY[status.nextRecommended];
	const blockers = [...status.blocked, ...status.tasks.problems, ...status.budget.problems];
	return {
		change: status.change,
		exists: status.change !== null,
		currentPhase: status.currentPhase,
		nextRecommended: status.nextRecommended,
		reason: blockers.length > 0 ? `${copy.reason} Hay bloqueos o datos incompletos que revisar.` : copy.reason,
		suggestedAction: copy.suggestedAction,
		mode,
		autoEnabled: false,
		blocked: blockers,
	};
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

/** @deprecated Compatibility facade. Read the versioned local provenance ledger instead. */
export type SddRealCost = SddCostLedgerV1;

/** @deprecated Compatibility facade. Never reads producer metadata directly. */
export function readSddRealCost(cwd: string, change: string): SddRealCost {
	return readSddCostLedger(cwd, change);
}

export { readSddCostLedger, type SddCostLedgerV1 } from "./sdd-cost-provenance.ts";
