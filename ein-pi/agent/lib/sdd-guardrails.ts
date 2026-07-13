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
import { resolveChangesDir } from "./sdd-router.ts";

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
	// El artefacto se declara `authored_by: parent-fallback`: el parent lo
	// persistio porque el executor no pudo (p.ej. sdd-map no tiene write tool).
	// En ese caso la telemetria de run (ledger/budget_consumed) NO es producible
	// honestamente por el parent, asi que su ausencia degrada a warning en vez
	// de forzar una cifra inventada. Lo setea `lintChange`.
	authoredByFallback?: boolean;
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

// BLINDAJE -> Valores FABRICADOS en campos de coste/ledger: un agente (o el
// parent, cuando se queda sin subagentes y trabaja inline) rellena la telemetria
// con `unknown` o una excusa para pasar el gate en vez de reportar el dato real
// o marcar la procedencia. Es ERROR, no warning: inventar cifras es peor que
// omitirlas — envenena el coste real por cambio y falsea la auditoria. La salida
// honesta es `authored_by: parent-fallback` + omitir el dato que el executor no
// reporto (ver `authoredByFallback` y `lintChange`).
const FABRICATION_PATTERNS: { code: string; message: string; pattern: RegExp }[] = [
	{
		code: "fabricated-cost",
		message:
			"Coste fabricado (`tokens: unknown` / `cost: unknown`): omite el campo o marca `authored_by: parent-fallback`; no inventes cifras.",
		pattern: /\b(?:tokens|cost|input|output|reads|commands)\s*[:=]\s*unknown\b/i,
	},
	{
		code: "fabricated-ledger",
		message:
			"Ledger con excusa en vez de dato (`parent-direct`, `subagent limit reached`, `authored inline`): marca `authored_by: parent-fallback` y omite la telemetria que el executor no produjo.",
		pattern: /\bparent-direct\b|subagent limit reached|authored inline/i,
	},
];

// BLINDAJE -> Cobertura de comportamiento en verify. El fallo real: verify
// firmaba `status: pass` con solo build + typecheck verdes, sin que ningun
// test/observacion ejerciera el comportamiento cambiado — y un build verde NO
// prueba no-regresion en una UI/logica sin cobertura. Aqui NO bloqueamos el
// routing (pass sigue avanzando a close), pero exigimos que verify DECLARE
// `behavior_coverage` y hacemos ruidoso (warning) cuando un PASS no confirmo el
// comportamiento observable. El enforcement fuerte vive en sdd-verify.md.
const VERIFY_PASS = /\b(?:status|result|resultado)\s*[:=]\s*(?:pass|passed|ok|pasa)\b/i;
const BEHAVIOR_COVERAGE =
	/\bbehaviou?r(?:al)?[_-]coverage\s*[:=]\s*(verified|partial|none|not[- ]applicable|n\/?-?a|na)\b/i;

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
	// GUARD -> acepta marcadas y sin marcar: un tasks.md 100% completado (todo
	// `- [x]` tras el apply) es VÁLIDO, no un artefacto roto. Exigir el literal
	// `- [ ]` hacía fallar el gate justo al terminar el trabajo.
	{ code: "checkbox", label: "checkbox `- [ ]`/`- [x]`", pattern: /^\s*-\s*\[(?: |x|X)\]/m },
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

export type SddPhase = "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close";

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

// Señal mínima obligatoria por fase (además de "no vacío"): si falta, es error.
// El caso clave es `verify`, que DEBE emitir una línea `status: pass|fail` para
// que el router determinista pueda enrutar. apply requiere `status: complete|partial|blocked`.
// `telemetry: true` marca las señales que miden el RUN del executor (ledger,
// budget_consumed). El parent no puede producirlas honestamente en un fallback,
// asi que con `authoredByFallback` su ausencia degrada a warning (nunca a una
// cifra inventada). budget_allocated NO es telemetria: lo asigna el parent al
// construir el scope packet, asi que sigue siendo obligatorio.
const PHASE_REQUIRED: Partial<Record<SddPhase, { code: string; label: string; pattern: RegExp; telemetry?: boolean }[]>> = {
	scope: [
		{ code: "scope", label: "scope", pattern: /\bscope\b/i },
		{ code: "budget-allocated", label: "budget_allocated", pattern: /\bbudget_allocated\b/i },
	],
	map: [
		{ code: "ledger", label: "ledger", pattern: /\bledger\b/i, telemetry: true },
		{ code: "budget-consumed", label: "budget_consumed", pattern: /\bbudget_consumed\b/i, telemetry: true },
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

	// Fabricacion ANTES que "falta señal": inventar `unknown`/excusa hace que el
	// pattern de presencia SÍ matchee (el token existe), asi que sin este check
	// la telemetria falsa pasaria el gate. Siempre error, con o sin fallback.
	for (const f of FABRICATION_PATTERNS) {
		if (f.pattern.test(text)) {
			issues.push({ level: "error", code: f.code, message: f.message });
		}
	}

	for (const req of PHASE_REQUIRED[phase] ?? []) {
		if (!req.pattern.test(text)) {
			// Telemetria de run ausente + procedencia parent-fallback declarada →
			// warning, no error: forzar el campo es lo que empuja a fabricarlo.
			const level: GuardrailLevel =
				req.telemetry && opts.authoredByFallback ? "warning" : "error";
			issues.push({ level, code: `missing-${req.code}`, message: `Falta señal obligatoria de ${phase}: ${req.label}.` });
		}
	}

	// Cobertura de comportamiento: solo relevante cuando verify declara PASS.
	// Un PASS sin comportamiento confirmado es una luz verde estructural, no una
	// garantía de no-regresión — se surface como warning, nunca bloquea.
	if (phase === "verify" && VERIFY_PASS.test(text)) {
		const cov = text.match(BEHAVIOR_COVERAGE)?.[1]?.toLowerCase();
		if (!cov) {
			issues.push({
				level: "warning",
				code: "behavior-coverage-undeclared",
				message:
					"verify declara PASS pero no `behavior_coverage`: trata el comportamiento observable como NO verificado (build/typecheck verde no prueba no-regresión). Declara `behavior_coverage: verified|partial|none|n-a`.",
			});
		} else if (cov === "none") {
			issues.push({
				level: "warning",
				code: "behavior-coverage-none",
				message:
					"verify PASS con `behavior_coverage: none` — solo build/tipos; el comportamiento observable del cambio NO se confirmó. Es luz verde estructural, no prueba de no-regresión.",
			});
		} else if (cov === "partial") {
			issues.push({
				level: "warning",
				code: "behavior-coverage-partial",
				message: "verify PASS con `behavior_coverage: partial` — parte del comportamiento observable quedó sin confirmar.",
			});
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

// BLINDAJE -> Detecta huecos en el orden canónico de fases. Un artefacto
// tardío sin los previos contamina el ciclo SDD: el agente retomaría una fase
// ya cerrada (verify sin apply) o saltaría gates previstos (design sin scope).
// Solo warn si falta tasks.md tras design: aún ejecutable, pero la continuidad
// ejecutable queda incompleta.
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

// Linta todos los artefactos PRESENTES de un cambio (raíz dual: ver sdd-router).
// Los alias legacy (explore.md/apply.md) no se lintan: el lint es de la
// gramática canónica; los artefactos canónicos de un cambio legacy sí entran.
export function lintChange(cwd: string, change: string): ChangeLintReport {
	const base = join(resolveChangesDir(cwd), change);
	const phases: ChangeLintReport["phases"] = [];
	const provenanceIssues: GuardrailIssue[] = [];
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
		// Procedencia: el parent lo persistió por fallback, no el executor de
		// fase — no invalida el artefacto, pero verify/review deben saberlo, y
		// relaja la telemetria de run obligatoria (que el parent no puede
		// producir) para no incentivar cifras inventadas.
		const authoredByFallback = /^\s*authored_by\s*[:=]\s*parent-fallback\b/im.test(content);
		if (authoredByFallback) {
			provenanceIssues.push({
				level: "warning",
				code: `provenance-parent-fallback-${phase}`,
				message: `${PHASE_ARTIFACT[phase]} fue persistido por el parent (authored_by: parent-fallback), no por el executor de fase; revisar con atencion extra.`,
			});
		}
		const report = lintPhaseArtifact(phase, content, { authoredByFallback });
		errors += report.errors;
		warnings += report.warnings;
		phases.push({ phase, present: true, report });
	}
	const issues = [...sequenceIssues(phases), ...provenanceIssues];
	errors += issues.filter((issue) => issue.level === "error").length;
	warnings += issues.filter((issue) => issue.level === "warning").length;
	return { change, ok: errors === 0, errors, warnings, issues, phases };
}
