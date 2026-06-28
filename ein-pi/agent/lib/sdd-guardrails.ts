// =============================================================================
// SDD GUARDRAILS
// Chequeo determinista de higiene de los artefactos SDD — el gatekeeper que
// corre ENTRE fases para no construir sobre basura. `lintDesignArtifact` y
// `lintTasksArtifact` son checks ricos; `lintPhaseArtifact` valida cualquier fase; `lintChange`
// agrega todas las fases presentes de un cambio. Los lints de string son puros
// (testeables sin fs); solo `lintChange` toca el filesystem para leer ficheros.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type GuardrailLevel = "error" | "warning";

export type GuardrailIssue = {
	level: GuardrailLevel;
	code: string;
	message: string;
};

export type DesignLintReport = {
	ok: boolean; // sin errores (los warnings no bloquean)
	issues: GuardrailIssue[];
	errors: number;
	warnings: number;
	lineCount: number;
};

export type DesignLintOptions = {
	// Por encima de estas lineas el design probablemente esta sobre-dimensionado
	// / es irrevisable. Mismo umbral por defecto que el Review Workload Guard.
	oversizeLineThreshold?: number;
};

const DEFAULT_OVERSIZE = 400;

// Las secciones que sdd-design DEBE emitir (contrato de diseño, no plan ejecutable).
const REQUIRED_SECTIONS: { code: string; label: string; pattern: RegExp }[] = [
	{ code: "proposal", label: "A. Proposal", pattern: /^#+\s*A\.\s*Proposal/im },
	{ code: "spec", label: "B. Spec", pattern: /^#+\s*B\.\s*Spec/im },
];

// design.md tiene PROHIBIDO cargar planificacion de entrega (lo dice
// sdd-design.md). Si vuelve a colarse, la fase de planificacion se esta metiendo
// en terreno de delivery — justo lo que el Review Workload Guard determinista
// resuelve en su sitio (ein-git), no aqui.
const FORBIDDEN_PATTERNS: { code: string; message: string; pattern: RegExp }[] = [
	{
		code: "forecast",
		message:
			"design.md no debe incluir un Review Workload Forecast (es delivery, no planificacion).",
		pattern: /review workload forecast/i,
	},
	{
		code: "chained-pr",
		message:
			"design.md no debe planificar chained PRs (lo decide el Review Workload Guard en delivery).",
		pattern: /chained[- ]pr/i,
	},
];

// Restos de plantilla que un modelo barato deja sin rellenar.
const PLACEHOLDER_PATTERNS: { code: string; message: string; pattern: RegExp }[] = [
	{ code: "angle-number", message: "Quedan placeholders `<number>` sin rellenar.", pattern: /<number>/ },
	{ code: "change-token", message: "Quedan tokens `{change}` sin expandir.", pattern: /\{change\}/ },
];

export function lintDesignArtifact(
	content: string,
	opts: DesignLintOptions = {},
): DesignLintReport {
	const issues: GuardrailIssue[] = [];
	const text = content ?? "";
	const lineCount = text.length ? text.split("\n").length : 0;

	if (!text.trim()) {
		issues.push({
			level: "error",
			code: "empty",
			message: "design.md esta vacio o no se pudo leer.",
		});
		return finalize(issues, lineCount);
	}

	for (const section of REQUIRED_SECTIONS) {
		if (!section.pattern.test(text)) {
			issues.push({
				level: "error",
				code: `missing-${section.code}`,
				message: `Falta la seccion obligatoria "${section.label}".`,
			});
		}
	}

	for (const f of FORBIDDEN_PATTERNS) {
		if (f.pattern.test(text)) {
			issues.push({ level: "warning", code: `forbidden-${f.code}`, message: f.message });
		}
	}

	for (const p of PLACEHOLDER_PATTERNS) {
		if (p.pattern.test(text)) {
			issues.push({ level: "warning", code: `placeholder-${p.code}`, message: p.message });
		}
	}

	const threshold = opts.oversizeLineThreshold ?? DEFAULT_OVERSIZE;
	if (lineCount > threshold) {
		issues.push({
			level: "warning",
			code: "oversize",
			message: `El design tiene ${lineCount} lineas (> ${threshold}); posible scope demasiado amplio. Considera dividir en slices.`,
		});
	}

	return finalize(issues, lineCount);
}

const TASKS_REQUIRED: { code: string; label: string; pattern: RegExp }[] = [
	{ code: "status-line", label: "status: ready|blocked", pattern: /\bstatus\s*[:=]\s*(ready|blocked)\b/i },
	{ code: "blocked-by", label: "blocked_by", pattern: /\bblocked_by\s*[:=]\s*.+/i },
	{ code: "checkbox", label: "checkbox `- [ ]`", pattern: /^\s*-\s*\[ \]/m },
	{ code: "skills", label: "skills", pattern: /^\s*-\s*skills\s*:/im },
	{ code: "why", label: "why", pattern: /^\s*-\s*why\s*:/im },
	{ code: "learn", label: "learn", pattern: /^\s*-\s*learn\s*:/im },
	{ code: "architecture", label: "architecture", pattern: /^\s*-\s*architecture\s*:/im },
	{ code: "avoid", label: "avoid", pattern: /^\s*-\s*avoid\s*:/im },
	{ code: "verify", label: "verify", pattern: /^\s*-\s*verify\s*:/im },
];

export function lintTasksArtifact(
	content: string,
	opts: DesignLintOptions = {},
): DesignLintReport {
	const issues: GuardrailIssue[] = [];
	const text = content ?? "";
	const lineCount = text.length ? text.split("\n").length : 0;

	if (!text.trim()) {
		issues.push({ level: "error", code: "empty", message: "tasks.md esta vacio o no se pudo leer." });
		return finalize(issues, lineCount);
	}

	for (const req of TASKS_REQUIRED) {
		if (!req.pattern.test(text)) {
			issues.push({ level: "error", code: `missing-${req.code}`, message: `Falta señal obligatoria de tasks.md: ${req.label}.` });
		}
	}

	for (const p of PLACEHOLDER_PATTERNS) {
		if (p.pattern.test(text)) {
			issues.push({ level: "warning", code: `placeholder-${p.code}`, message: p.message });
		}
	}

	const threshold = opts.oversizeLineThreshold ?? DEFAULT_OVERSIZE;
	if (lineCount > threshold) {
		issues.push({ level: "warning", code: "oversize", message: `tasks.md tiene ${lineCount} lineas (> ${threshold}).` });
	}

	return finalize(issues, lineCount);
}

function finalize(issues: GuardrailIssue[], lineCount: number): DesignLintReport {
	const errors = issues.filter((i) => i.level === "error").length;
	const warnings = issues.filter((i) => i.level === "warning").length;
	return { ok: errors === 0, issues, errors, warnings, lineCount };
}

// ─── Gatekeeper por fase ──────────────────────────────────────────────────────

export type SddPhase = "init" | "explore" | "design" | "tasks" | "apply" | "verify" | "archive";

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

// Señal mínima obligatoria por fase (además de "no vacío"): si falta, es error.
// El caso clave es `verify`, que DEBE emitir una línea `status: pass|fail` para
// que el router determinista pueda enrutar. apply requiere `status: complete|partial|blocked`.
const PHASE_REQUIRED: Partial<Record<SddPhase, { code: string; label: string; pattern: RegExp }[]>> = {
	init: [
		{ code: "scope", label: "scope", pattern: /\bscope\b/i },
		{ code: "budget-allocated", label: "budget_allocated", pattern: /\bbudget_allocated\b/i },
	],
	explore: [
		{ code: "ledger", label: "ledger", pattern: /\bledger\b/i },
		{ code: "budget-consumed", label: "budget_consumed", pattern: /\bbudget_consumed\b/i },
		{ code: "scope-status", label: "scope_status", pattern: /\bscope_status\b/i },
	],
	apply: [
		{
			code: "status-line",
			label: "status: complete|partial|blocked",
			pattern: /\bstatus\s*[:=]\s*(complete|partial|blocked)\b/i,
		},
	],
	verify: [
		{
			code: "status-line",
			label: "status: pass|fail",
			pattern: /\b(?:status|result|resultado)\s*[:=]\s*(pass|fail|passed|failed|ok|pasa|falla)\b/i,
		},
	],
};

// Lint genérico de un artefacto de fase. `design` delega en el check rico.
export function lintPhaseArtifact(
	phase: SddPhase,
	content: string,
	opts: DesignLintOptions = {},
): DesignLintReport {
	if (phase === "design") return lintDesignArtifact(content, opts);
	if (phase === "tasks") return lintTasksArtifact(content, opts);

	const issues: GuardrailIssue[] = [];
	const text = content ?? "";
	const lineCount = text.length ? text.split("\n").length : 0;

	if (!text.trim()) {
		issues.push({ level: "error", code: "empty", message: `${PHASE_ARTIFACT[phase]} esta vacio o no se pudo leer.` });
		return finalize(issues, lineCount);
	}

	for (const req of PHASE_REQUIRED[phase] ?? []) {
		if (!req.pattern.test(text)) {
			issues.push({ level: "error", code: `missing-${req.code}`, message: `Falta señal obligatoria de ${phase}: ${req.label}.` });
		}
	}

	for (const p of PLACEHOLDER_PATTERNS) {
		if (p.pattern.test(text)) {
			issues.push({ level: "warning", code: `placeholder-${p.code}`, message: p.message });
		}
	}

	const threshold = opts.oversizeLineThreshold ?? DEFAULT_OVERSIZE;
	if (lineCount > threshold) {
		issues.push({ level: "warning", code: "oversize", message: `${PHASE_ARTIFACT[phase]} tiene ${lineCount} lineas (> ${threshold}).` });
	}

	return finalize(issues, lineCount);
}

export type ChangeLintReport = {
	change: string;
	ok: boolean;
	errors: number;
	warnings: number;
	issues: GuardrailIssue[];
	phases: { phase: SddPhase; present: boolean; report?: DesignLintReport }[];
};

function sequenceIssues(phases: ChangeLintReport["phases"]): GuardrailIssue[] {
	const issues: GuardrailIssue[] = [];
	const presentByPhase = new Map(phases.map((phase) => [phase.phase, phase.present]));
	for (let index = 0; index < PHASE_ORDER.length; index += 1) {
		const phase = PHASE_ORDER[index];
		if (!presentByPhase.get(phase)) continue;
		const missingBefore = PHASE_ORDER.slice(0, index).filter((candidate) => !presentByPhase.get(candidate));
		for (const missing of missingBefore) {
			issues.push({
				level: "error",
				code: `sequence-${missing}-missing-before-${phase}`,
				message: `Hueco de secuencia: ${PHASE_ARTIFACT[phase]} existe, pero falta ${PHASE_ARTIFACT[missing]}.`,
			});
		}
	}

	if (presentByPhase.get("design") && !presentByPhase.get("tasks")) {
		issues.push({
			level: "warning",
			code: "sequence-design-without-tasks",
			message: "design.md esta presente pero falta tasks.md; la continuidad ejecutable queda incompleta.",
		});
	}
	return issues;
}

// Linta todos los artefactos PRESENTES de un cambio en openspec/changes/<change>/.
export function lintChange(cwd: string, change: string): ChangeLintReport {
	const base = join(cwd, "openspec", "changes", change);
	const phases: ChangeLintReport["phases"] = [];
	let errors = 0;
	let warnings = 0;
	for (const phase of Object.keys(PHASE_ARTIFACT) as SddPhase[]) {
		const path = join(base, PHASE_ARTIFACT[phase]);
		if (!existsSync(path)) {
			phases.push({ phase, present: false });
			continue;
		}
		let content = "";
		try {
			content = readFileSync(path, "utf8");
		} catch {
			content = "";
		}
		const report = lintPhaseArtifact(phase, content);
		errors += report.errors;
		warnings += report.warnings;
		phases.push({ phase, present: true, report });
	}
	const issues = sequenceIssues(phases);
	errors += issues.filter((issue) => issue.level === "error").length;
	warnings += issues.filter((issue) => issue.level === "warning").length;
	return { change, ok: errors === 0, errors, warnings, issues, phases };
}
