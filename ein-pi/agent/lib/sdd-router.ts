// =============================================================================
// SDD ROUTER (deterministic state)
// Calcula en qué punto está un cambio SDD leyendo SOLO el filesystem — cero IA,
// cero inferencia de texto. El orquestador enruta por esto en vez de fiarse de
// lo que el modelo crea recordar. Análogo al dispatcher en Go de gentle-ai,
// pero como módulo TS puro expuesto luego como tool de Pi.
//
// Artefactos por fase (ver chains/ein-sdd.chain.md):
//   init → init.md · explore → exploration.md · design → design.md
//   tasks → tasks.md · apply → apply-progress.md · verify → verify-report.md
//   archive → summary.md
// Un cambio terminado se mueve a openspec/changes/archive/<change>/ (ver
// lib/sdd-archive.ts), así que `openspec/changes/` solo contiene cambios vivos.
// =============================================================================

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SddPhase = "init" | "explore" | "design" | "tasks" | "apply" | "verify" | "archive";
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
	nextRecommended: SddNext;
	blocked: string[];
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
	init: "init.md",
	explore: "exploration.md",
	design: "design.md",
	tasks: "tasks.md",
	apply: "apply-progress.md",
	verify: "verify-report.md",
	archive: "summary.md",
};

const PHASE_ORDER: SddPhase[] = ["init", "explore", "design", "tasks", "apply", "verify", "archive"];

const SDD_NEXT_COPY: Record<SddNext, { reason: string; suggestedAction: string }> = {
	init: {
		reason: "El cambio todavia no tiene punto de arranque SDD.",
		suggestedAction: "Inicializa el cambio antes de explorar o disenar.",
	},
	explore: {
		reason: "Ya existe el arranque; falta entender alcance, riesgos y archivos probables.",
		suggestedAction: "Ejecuta la fase de exploracion para convertir la idea en contexto aplicable.",
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
	archive: {
		reason: "La verificacion paso; el cambio esta listo para cierre controlado.",
		suggestedAction: "Cierra el cambio verificado con el flujo canonico de cierre.",
	},
	done: {
		reason: "No hay un cambio activo que continuar.",
		suggestedAction: "Crea o nombra un cambio antes de pedir el siguiente paso.",
	},
};

function changesDir(cwd: string): string {
	return join(cwd, "openspec", "changes");
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
	const problems: string[] = [];
	if (!status) problems.push("tasks.md sin status ready|blocked.");
	if (!blockedByMatch) problems.push("tasks.md sin blocked_by.");
	if (items.length === 0) problems.push("tasks.md sin checkboxes parseables.");

	return { present: true, status, blockedBy, items, counts: { pending, ready, blocked, done }, problems };
}

function readBudgetStatus(changePath: string): SddBudgetStatus {
	const out = emptyBudgetStatus();
	const initPath = join(changePath, PHASE_ARTIFACT.init);
	const explorePath = join(changePath, PHASE_ARTIFACT.explore);

	if (existsSync(initPath)) {
		const init = readText(initPath);
		if (init === null) out.problems.push("init.md no se pudo leer para budget.");
		else out.allocated = parseBudgetLine(init, ["budget_allocated", "budget"]);
	}
	if (existsSync(explorePath)) {
		const explore = readText(explorePath);
		if (explore === null) out.problems.push("exploration.md no se pudo leer para budget.");
		else out.consumed = parseBudgetLine(explore, ["budget_consumed", "budget_used", "consumed"]);
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
		init: false,
		explore: false,
		design: false,
		tasks: false,
		apply: false,
		verify: false,
		archive: false,
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
			nextRecommended: "done",
			blocked,
		};
	}

	const changePath = join(changesDir(cwd), target);
	for (const phase of Object.keys(present) as SddPhase[]) {
		present[phase] = existsSync(join(changePath, PHASE_ARTIFACT[phase]));
	}

	const apply = readApplyOutcome(changePath);
	const verify = readVerifyOutcome(changePath);
	const tasks = readTasksStatus(changePath);
	const budget = readBudgetStatus(changePath);

	// Siguiente fase: la primera no presente en orden, con la verificación como
	// gate antes de archivar. apply-progress.md con status != complete retiene apply.
	let nextRecommended: SddNext;
	if (!present.init) nextRecommended = "init";
	else if (!present.explore) nextRecommended = "explore";
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
		blocked.push("verify-report indica fallo: remediar antes de archivar.");
	} else if (verify === "pass") nextRecommended = "archive";
	else {
		// verify presente pero sin status legible → re-verificar para refrescar evidencia.
		nextRecommended = "verify";
		blocked.push("verify-report sin línea `status: pass|fail` clara.");
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
		nextRecommended,
		blocked,
	};
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
