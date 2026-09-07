// =============================================================================
// SDD ARTIFACT VALIDATION
// Reglas puras para validar el contenido de cada artefacto SDD. No leen disco,
// no conocen runtimes y conservan el orden de issues como parte del contrato.
// =============================================================================

import { isProductionFile } from "./sdd-routing-core.ts";
import { extractDeclaredFrontierPaths } from "./sdd-tasks-frontier.ts";
import { summaryContractErrors } from "./sdd-summary-contract.ts";

export type PhaseRules = Readonly<{
	requireProblemStatement?: boolean;
	requireAcceptanceCriteria?: boolean;
	testCommand?: string;
}>;

export type GuardrailLevel = "error" | "warning";

export type GuardrailIssue = {
	level: GuardrailLevel;
	code: string;
	message: string;
};

export type DesignLintReport = {
	ok: boolean;
	issues: GuardrailIssue[];
	errors: number;
	warnings: number;
	lineCount: number;
};

export type DesignLintOptions = {
	change?: string;
	oversizeLineThreshold?: number;
	designRules?: PhaseRules;
};

const DEFAULT_OVERSIZE = 400;

const REQUIRED_SECTIONS: {
	code: string;
	label: string;
	pattern: RegExp;
	relaxedBy: keyof PhaseRules;
}[] = [
	{ code: "proposal", label: "A. Proposal", pattern: /^#+\s*A\.\s*Proposal/im, relaxedBy: "requireProblemStatement" },
	{ code: "spec", label: "B. Spec", pattern: /^#+\s*B\.\s*Spec/im, relaxedBy: "requireAcceptanceCriteria" },
];

const PLACEHOLDER_PATTERNS: { code: string; message: string; pattern: RegExp }[] = [
	{ code: "angle-number", message: "Quedan placeholders `<number>` sin rellenar.", pattern: /<number>/ },
	{ code: "change-token", message: "Quedan tokens `{change}` sin expandir.", pattern: /\{change\}/ },
];

function finalize(issues: GuardrailIssue[], lineCount: number): DesignLintReport {
	const errors = issues.filter((issue) => issue.level === "error").length;
	const warnings = issues.filter((issue) => issue.level === "warning").length;
	return { ok: errors === 0, issues, errors, warnings, lineCount };
}

function placeholderIssues(text: string): GuardrailIssue[] {
	return PLACEHOLDER_PATTERNS.flatMap((placeholder) => placeholder.pattern.test(text)
		? [{ level: "warning" as const, code: `placeholder-${placeholder.code}`, message: placeholder.message }]
		: []);
}

export function lintDesignArtifact(
	content: string,
	opts: DesignLintOptions = {},
): DesignLintReport {
	const issues: GuardrailIssue[] = [];
	const text = content ?? "";
	const lineCount = text.length ? text.split("\n").length : 0;

	if (!text.trim()) {
		issues.push({ level: "error", code: "empty", message: "design.md esta vacio o no se pudo leer." });
		return finalize(issues, lineCount);
	}

	for (const section of REQUIRED_SECTIONS) {
		if (opts.designRules?.[section.relaxedBy] === false) continue;
		if (!section.pattern.test(text)) {
			issues.push({
				level: "warning",
				code: `missing-${section.code}`,
				message: `Falta la seccion "${section.label}".`,
			});
		}
	}

	issues.push(...placeholderIssues(text));
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

const TASKS_REQUIRED: { code: string; label: string; pattern: RegExp; level?: GuardrailLevel }[] = [
	{ code: "status-line", label: "status: ready|blocked", pattern: /\bstatus\s*[:=]\s*(ready|blocked)\b/i, level: "warning" },
	{ code: "blocked-by", label: "blocked_by", pattern: /\bblocked_by\s*[:=]\s*.+/i, level: "warning" },
	{ code: "checkbox", label: "checkbox `- [ ]`/`- [x]`", pattern: /^\s*-\s*\[(?: |x|X)\]/m },
	{ code: "verify", label: "verify", pattern: /^\s*-\s*verify\s*:/im },
];

const MAX_GROUP_SOURCE_FILES = 4;

export function oversizedGroupWarnings(text: string): GuardrailIssue[] {
	const out: GuardrailIssue[] = [];
	const parts = text.split(/^##\s+(.+)$/m);
	for (let index = 1; index < parts.length; index += 2) {
		const heading = (parts[index] ?? "").trim();
		const body = parts[index + 1] ?? "";
		// Cuenta la frontera DECLARADA (edit:/etiquetas v1), no el barrido del
		// cuerpo: `read:` y prosa (`why:`/`architecture:`/`avoid:`) no son permiso
		// de escritura y no deben inflar el aviso.
		const files = extractDeclaredFrontierPaths(body).filter(isProductionFile);
		if (files.length > MAX_GROUP_SOURCE_FILES) {
			out.push({
				level: "warning",
				code: "oversized-group",
				message: `Grupo "${heading}" toca ${files.length} ficheros de producción (> ${MAX_GROUP_SOURCE_FILES}): pártelo en unidades más pequeñas (bajo TDD estricto cada fichero son muchos ciclos RED/GREEN → el apply se va de turnos).`,
			});
		}
	}
	return out;
}

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

	const hasOpenBox = /^\s*-\s*\[ \]/m.test(text);
	const hasDoneBox = /^\s*-\s*\[[xX]\]/m.test(text);
	const allDone = hasDoneBox && !hasOpenBox;
	for (const requirement of TASKS_REQUIRED) {
		if (allDone && (requirement.code === "status-line" || requirement.code === "blocked-by")) continue;
		if (!requirement.pattern.test(text)) {
			issues.push({
				level: requirement.level ?? "error",
				code: `missing-${requirement.code}`,
				message: `Falta señal de tasks.md: ${requirement.label}.`,
			});
		}
	}

	issues.push(...placeholderIssues(text));
	const threshold = opts.oversizeLineThreshold ?? DEFAULT_OVERSIZE;
	if (lineCount > threshold) {
		issues.push({ level: "warning", code: "oversize", message: `tasks.md tiene ${lineCount} lineas (> ${threshold}).` });
	}
	issues.push(...oversizedGroupWarnings(text));
	return finalize(issues, lineCount);
}

export type SddPhase = "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close";

export const PHASE_ARTIFACT: Record<SddPhase, string> = {
	scope: "scope.md",
	map: "map.md",
	design: "design.md",
	tasks: "tasks.md",
	apply: "apply-progress.md",
	verify: "verify-report.md",
	close: "summary.md",
};

const PHASE_REQUIRED: Partial<Record<SddPhase, { code: string; label: string; pattern: RegExp }[]>> = {
	scope: [{ code: "scope", label: "scope", pattern: /\bscope\b/i }],
	map: [{ code: "scope-status", label: "scope_status", pattern: /\bscope_status\b/i }],
	apply: [{
		code: "status-line",
		label: "status: complete|partial|blocked",
		pattern: /\bstatus\s*[:=]\s*(complete|partial|blocked)\b/i,
	}],
	verify: [{
		code: "status-line",
		label: "status: pass|fail",
		pattern: /\b(?:status|result|resultado)\s*[:=]\s*(pass|fail|passed|failed|ok|pasa|falla)\b/i,
	}],
};

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

	for (const requirement of PHASE_REQUIRED[phase] ?? []) {
		if (!requirement.pattern.test(text)) {
			issues.push({
				level: "error",
				code: `missing-${requirement.code}`,
				message: `Falta señal obligatoria de ${phase}: ${requirement.label}.`,
			});
		}
	}
	if (phase === "close") {
		for (const missing of summaryContractErrors(text, opts.change)) {
			issues.push({ level: "error", code: "summary-contract-invalid", message: `summary.md: falta o no coincide ${missing}.` });
		}
	}

	issues.push(...placeholderIssues(text));
	const threshold = opts.oversizeLineThreshold ?? DEFAULT_OVERSIZE;
	if (lineCount > threshold) {
		issues.push({ level: "warning", code: "oversize", message: `${PHASE_ARTIFACT[phase]} tiene ${lineCount} lineas (> ${threshold}).` });
	}
	return finalize(issues, lineCount);
}
