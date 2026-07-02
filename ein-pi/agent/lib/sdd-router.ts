// =============================================================================
// SDD ROUTER (deterministic state)
// Calcula en qué punto está un cambio SDD leyendo SOLO el filesystem — cero IA,
// cero inferencia de texto. El orquestador enruta por esto en vez de fiarse de
// lo que el modelo crea recordar. Análogo al dispatcher en Go de gentle-ai,
// pero como módulo TS puro expuesto luego como tool de Pi.
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
	} else if (verify === "pass") nextRecommended = "close";
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

export type SddRealCostAgent = {
	agent: string;
	runs: number;
	tokens: number;
	costUsd: number;
};

export type SddRealCost = {
	runs: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	durationMs: number;
	byAgent: SddRealCostAgent[];
	problems: string[];
};

// Coste REAL de inferencia de los runs de subagentes de un cambio, leído de los
// meta.json que pi-subagents escribe en `.pi-subagents/artifacts/`. El "budget"
// del ledger de fase mide tokens ESTIMADOS de lectura — otra magnitud; sin esto
// un flujo que quema 400k+ tokens reales se reporta como "consumed≈9000".
// Atribución determinista: el `task` de cada run menciona el nombre del cambio.
export function readSddRealCost(cwd: string, change: string): SddRealCost {
	const out: SddRealCost = { runs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0, byAgent: [], problems: [] };
	const dir = join(cwd, ".pi-subagents", "artifacts");
	if (!existsSync(dir)) return out;

	let files: string[] = [];
	try {
		files = readdirSync(dir).filter((file) => file.endsWith("_meta.json"));
	} catch {
		out.problems.push(".pi-subagents/artifacts no se pudo listar; coste real no disponible.");
		return out;
	}

	const byAgent = new Map<string, SddRealCostAgent>();
	for (const file of files) {
		let meta: {
			agent?: unknown;
			task?: unknown;
			usage?: { input?: unknown; output?: unknown; cost?: unknown };
			durationMs?: unknown;
		};
		try {
			meta = JSON.parse(readFileSync(join(dir, file), "utf8")) as typeof meta;
		} catch {
			out.problems.push(`${file} ilegible; excluido del coste real.`);
			continue;
		}
		if (typeof meta.agent !== "string" || typeof meta.task !== "string") continue;
		if (!meta.task.includes(change)) continue;

		const input = typeof meta.usage?.input === "number" ? meta.usage.input : 0;
		const output = typeof meta.usage?.output === "number" ? meta.usage.output : 0;
		const cost = typeof meta.usage?.cost === "number" ? meta.usage.cost : 0;
		const duration = typeof meta.durationMs === "number" ? meta.durationMs : 0;

		out.runs += 1;
		out.inputTokens += input;
		out.outputTokens += output;
		out.costUsd += cost;
		out.durationMs += duration;

		const entry = byAgent.get(meta.agent) ?? { agent: meta.agent, runs: 0, tokens: 0, costUsd: 0 };
		entry.runs += 1;
		entry.tokens += input + output;
		entry.costUsd += cost;
		byAgent.set(meta.agent, entry);
	}

	out.byAgent = [...byAgent.values()].sort((a, b) => b.tokens - a.tokens);
	return out;
}
