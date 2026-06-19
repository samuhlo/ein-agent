// =============================================================================
// SDD GUARDRAILS
// Chequeo determinista de higiene del artefacto design.md, pensado para correr
// ENTRE design y apply. Portado en espiritu desde openspec-guardrails de
// gentle-pi (que validaba deltas de spec); Ein colapso las specs dentro de
// design.md, asi que el guardrail valida ESE artefacto. Analisis de string puro
// (sin fs ni paquetes) para que sea trivial de testear y seguro de llamar desde
// cualquier sitio. El descubrimiento del fichero vive en quien lo invoca.
// =============================================================================

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

// Las tres secciones que sdd-design DEBE emitir (propuesta, spec, tareas).
const REQUIRED_SECTIONS: { code: string; label: string; pattern: RegExp }[] = [
	{ code: "proposal", label: "A. Proposal", pattern: /^#+\s*A\.\s*Proposal/im },
	{ code: "spec", label: "B. Spec", pattern: /^#+\s*B\.\s*Spec/im },
	{ code: "tasks", label: "C. Tasks", pattern: /^#+\s*C\.\s*Tasks/im },
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

	if (!/^\s*-\s*\[ \]/m.test(text)) {
		issues.push({
			level: "error",
			code: "no-tasks",
			message: "No hay checklist de tareas accionables (`- [ ]`).",
		});
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

function finalize(issues: GuardrailIssue[], lineCount: number): DesignLintReport {
	const errors = issues.filter((i) => i.level === "error").length;
	const warnings = issues.filter((i) => i.level === "warning").length;
	return { ok: errors === 0, issues, errors, warnings, lineCount };
}
