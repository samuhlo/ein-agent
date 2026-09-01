// =============================================================================
// SDD GUARDRAILS
// Chequeo determinista de higiene de los artefactos SDD — el gatekeeper que
// corre ENTRE fases para no construir sobre basura. `lintDesignArtifact` y
// `lintTasksArtifact` son checks ricos; `lintPhaseArtifact` valida cualquier fase; `lintChange`
// agrega todas las fases presentes de un cambio. Los lints de string son puros
// (testeables sin fs); solo `lintChange` toca el filesystem para leer ficheros.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readConfigRules, type PhaseRules } from "./openspec-config-rules.ts";
import { evaluateOpenSpecState, type SyncBaseInput } from "./openspec-spec-sync.ts";
import { DEFAULT_LANE, LANE_PHASES, readChangeLane, type SddLane } from "./sdd-lane.ts";
import { join } from "node:path";
import {
	extractProductionFiles,
	resolveChangesDir,
	type SddSpecState,
} from "./sdd-routing-core.ts";
import { parseOpenSpec, parseOpenSpecDelta } from "./openspec-spec-parser.ts";

export type SpecDeltaDeclaration = { mode: "none" | "delta" | "invalid"; deltas: { path: string; bytes: Uint8Array }[] };

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
	/** `rules.design` del proyecto. Solo puede relajar avisos, nunca anadirlos. */
	designRules?: PhaseRules;
};

const DEFAULT_OVERSIZE = 400;

// Las secciones que sdd-design DEBE emitir (contrato de diseño, no plan ejecutable).
const REQUIRED_SECTIONS: {
	code: string;
	label: string;
	pattern: RegExp;
	/** Clave de `rules.design` que apaga este aviso cuando vale `false`. */
	relaxedBy: keyof PhaseRules;
}[] = [
	{ code: "proposal", label: "A. Proposal", pattern: /^#+\s*A\.\s*Proposal/im, relaxedBy: "requireProblemStatement" },
	{ code: "spec", label: "B. Spec", pattern: /^#+\s*B\.\s*Spec/im, relaxedBy: "requireAcceptanceCriteria" },
];

// Restos de plantilla que un modelo barato deja sin rellenar.
const PLACEHOLDER_PATTERNS: { code: string; message: string; pattern: RegExp }[] = [
	{ code: "angle-number", message: "Quedan placeholders `<number>` sin rellenar.", pattern: /<number>/ },
	{ code: "change-token", message: "Quedan tokens `{change}` sin expandir.", pattern: /\{change\}/ },
];

// RETIRADO: los patterns de FABRICACION (`tokens: unknown`, `parent-direct`…)
// vigilaban la telemetria del ledger de coste, que se borro entero en `3a2ec6b`.
// Quedaron policiando un campo que ya no existe: coste puro de proceso.
//
// RETIRADO: el check de `behavior_coverage`. Exigia que verify DECLARASE una
// palabra en su informe; no comprobaba nada del codigo. Lo que si protege
// calidad — que verify EJECUTE la suite — sigue en sdd-verify y en el requisito
// `status: pass|fail` de mas abajo, que es lo que lee el router determinista.

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

	// Warning, no error: la ausencia de una seccion es informacion util, pero
	// bloquear la fase por la FORMA de un documento manda el arreglo al ciclo de
	// fases (tasks -> apply -> verify) para reescribir prosa. El coste de eso
	// medido: 28% del tiempo de apply/tasks/verify.
	for (const section of REQUIRED_SECTIONS) {
		// `rules.design.*` en config.yaml solo puede RELAJAR: un proyecto que
		// declara `false` no quiere esa seccion y no debe verse avisado por ella.
		// Sin declaracion explicita se aplica el default estricto.
		if (opts.designRules?.[section.relaxedBy] === false) continue;
		if (!section.pattern.test(text)) {
			issues.push({
				level: "warning",
				code: `missing-${section.code}`,
				message: `Falta la seccion "${section.label}".`,
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
		issues.push({
			level: "warning",
			code: "oversize",
			message: `El design tiene ${lineCount} lineas (> ${threshold}); posible scope demasiado amplio. Considera dividir en slices.`,
		});
	}

	return finalize(issues, lineCount);
}

// Solo lo que tiene CONSECUENCIA MECANICA aguas abajo:
//   - checkbox: `sdd-apply` lee las casillas para saber que grupo ejecutar.
//   - verify:   es el comando que se corre; sin el, la fase de verify no sabe
//               que ejecutar.
// RETIRADAS como obligatorias: `skills`, `why`, `learn`, `architecture`,
// `avoid`. Eran secciones de prosa que nadie lee aguas abajo y cuya ausencia
// bloqueaba la fase. `status`/`blocked_by` bajan a warning: son señales de
// planificacion, no entradas de ninguna herramienta.
const TASKS_REQUIRED: { code: string; label: string; pattern: RegExp; level?: GuardrailLevel }[] = [
	{ code: "status-line", label: "status: ready|blocked", pattern: /\bstatus\s*[:=]\s*(ready|blocked)\b/i, level: "warning" },
	{ code: "blocked-by", label: "blocked_by", pattern: /\bblocked_by\s*[:=]\s*.+/i, level: "warning" },
	// GUARD -> acepta marcadas y sin marcar: un tasks.md 100% completado (todo
	// `- [x]` tras el apply) es VÁLIDO, no un artefacto roto. Exigir el literal
	// `- [ ]` hacía fallar el gate justo al terminar el trabajo.
	{ code: "checkbox", label: "checkbox `- [ ]`/`- [x]`", pattern: /^\s*-\s*\[(?: |x|X)\]/m },
	{ code: "verify", label: "verify", pattern: /^\s*-\s*verify\s*:/im },
];

// F: un grupo que toca demasiados ficheros de PRODUCCIÓN no es una unidad de
// apply acotada — bajo TDD estricto cada fichero son muchos ciclos RED/GREEN y el
// apply se va de turnos (fue el bloqueo real de un grupo fundacional). Proxy de
// tamaño: cuenta ficheros de fuente (no tests) por sección de grupo (## ...).
const MAX_GROUP_SOURCE_FILES = 4;

export function oversizedGroupWarnings(text: string): GuardrailIssue[] {
	const out: GuardrailIssue[] = [];
	// [preámbulo, heading1, body1, heading2, body2, ...]
	const parts = text.split(/^##\s+(.+)$/m);
	for (let i = 1; i < parts.length; i += 2) {
		const heading = (parts[i] ?? "").trim();
		const body = parts[i + 1] ?? "";
		// Mismo predicado de producción que el preview (sdd-router): dos regex
		// que derivaban por separado eran justo la clase de mentira que P1-C cierra.
		const files = extractProductionFiles(body);
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

	// Un tasks.md 100% cerrado (todas las casillas `- [x]`, ninguna `- [ ]`) es
	// un artefacto TERMINADO válido: `status`/`blocked_by` son señales de
	// planificación que sdd-tasks fija y dejan de aplicar una vez el apply cierra
	// todo. Exigirlas entonces hacía fallar el gate justo al acabar (apply solía
	// dejar `status: complete`, valor no válido para tasks.md) → retry inútil.
	const hasOpenBox = /^\s*-\s*\[ \]/m.test(text);
	const hasDoneBox = /^\s*-\s*\[[xX]\]/m.test(text);
	const allDone = hasDoneBox && !hasOpenBox;

	for (const req of TASKS_REQUIRED) {
		if (allDone && (req.code === "status-line" || req.code === "blocked-by")) continue;
		if (!req.pattern.test(text)) {
			issues.push({ level: req.level ?? "error", code: `missing-${req.code}`, message: `Falta señal de tasks.md: ${req.label}.` });
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

	// F: grupos sobredimensionados (demasiados ficheros de producción por grupo).
	issues.push(...oversizedGroupWarnings(text));

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
const PHASE_REQUIRED: Partial<Record<SddPhase, { code: string; label: string; pattern: RegExp }[]>> = {
	// RETIRADOS `budget_allocated` (scope) y `ledger`/`budget_consumed` (map):
	// eran la telemetria del ledger de coste borrado en `3a2ec6b`. Bloqueaban la
	// fase por no declarar cifras que ya no consume nadie.
	scope: [{ code: "scope", label: "scope", pattern: /\bscope\b/i }],
	map: [{ code: "scope-status", label: "scope_status", pattern: /\bscope_status\b/i }],
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

// BLINDAJE -> Detecta huecos en el orden canónico de fases. Un artefacto
// tardío sin los previos contamina el ciclo SDD: el agente retomaría una fase
// ya cerrada (verify sin apply) o saltaría gates previstos (design sin scope).
// Solo warn si falta tasks.md tras design: aún ejecutable, pero la continuidad
// ejecutable queda incompleta.
function sequenceIssues(phases: ChangeLintReport["phases"], lane: SddLane = DEFAULT_LANE): GuardrailIssue[] {
	const issues: GuardrailIssue[] = [];
	const presentByPhase = new Map(phases.map((phase) => [phase.phase, phase.present]));
	// La secuencia se valida contra las fases que ESTE carril ejecuta. En `micro`,
	// map y tasks no faltan: no se piden. Validar contra las siete convertiría
	// cada cambio corto en un muro de errores por fases que nadie pidió.
	const expected = LANE_PHASES[lane];
	for (let index = 0; index < expected.length; index += 1) {
		const phase = expected[index];
		if (!presentByPhase.get(phase)) continue;
		const missingBefore = expected.slice(0, index).filter((candidate) => !presentByPhase.get(candidate));
		for (const missing of missingBefore) {
			issues.push({
				level: "error",
				code: `sequence-${missing}-missing-before-${phase}`,
				message: `Hueco de secuencia: ${PHASE_ARTIFACT[phase]} existe, pero falta ${PHASE_ARTIFACT[missing]}.`,
			});
		}
	}

	if (expected.includes("tasks") && presentByPhase.get("design") && !presentByPhase.get("tasks")) {
		issues.push({
			level: "warning",
			code: "sequence-design-without-tasks",
			message: "design.md esta presente pero falta tasks.md; la continuidad ejecutable queda incompleta.",
		});
	}
	return issues;
}

export function readSpecDeltaDeclaration(cwd: string, change: string): SpecDeltaDeclaration {
	const root = resolveChangesDir(cwd);
	if (root !== join(cwd, "openspec", "changes")) return { mode: "none", deltas: [] };
	const base = join(root, change);
	const deltas: { path: string; bytes: Uint8Array }[] = [];
	const specs = join(base, "specs");
	if (existsSync(specs)) {
		let domains: string[];
		try { domains = readdirSync(specs); } catch { return { mode: "invalid", deltas: [] }; }
		for (const domain of domains.sort()) {
			const path = join(specs, domain, "spec.md");
			if (!existsSync(path)) continue;
			try {
				const bytes = readFileSync(path);
				const parsed = parseOpenSpecDelta(bytes.toString("utf8"));
				if (!parsed.ok || parsed.value.domain !== domain) return { mode: "invalid", deltas: [] };
				deltas.push({ path: `specs/${domain}/spec.md`, bytes });
			} catch { return { mode: "invalid", deltas: [] }; }
		}
	}
	let scope = "";
	try { scope = readFileSync(join(base, "scope.md"), "utf8").replaceAll("\r\n", "\n"); } catch { /* missing scope leaves declaration unresolved */ }
	const blocks = [...scope.matchAll(/^## Spec delta declaration\nspec_delta: none\nspec_delta_reason: ([^\n]*)$/gm)];
	const reason = blocks[0]?.[1]?.trim() ?? "";
	const invalidReason = reason.length < 1 || reason.length > 200 || /^(none|n\/a|na|tbd|unknown|-)$/i.test(reason);
	const hasNoneTokens = /^## Spec delta declaration\n(?:spec_delta:|spec_delta_reason:)/m.test(scope);
	if (deltas.length > 0) return blocks.length === 0 && !hasNoneTokens ? { mode: "delta", deltas } : { mode: "invalid", deltas: [] };
	return blocks.length === 1 && !invalidReason ? { mode: "none", deltas: [] } : { mode: "invalid", deltas: [] };
}

export function readOpenSpecState(cwd: string, change: string): SddSpecState {
	if (resolveChangesDir(cwd) !== join(cwd, "openspec", "changes")) return "legacy";
	const declaration = readSpecDeltaDeclaration(cwd, change);
	const bases: SyncBaseInput[] = [];
	for (const delta of declaration.deltas) {
		const domain = delta.path.split("/")[1]!;
		const path = join(cwd, "openspec", "specs", domain, "spec.md");
		if (!existsSync(path)) continue;
		try {
			bases.push({ domain, bytes: readFileSync(path) });
		} catch {
			return "unresolved";
		}
	}
	let report: string | null = null;
	try {
		report = readFileSync(join(cwd, "openspec", "changes", change, "sync-report.md"), "utf8");
	} catch {
		// An absent or unreadable report remains pending/unresolved in the evaluator.
	}
	return evaluateOpenSpecState({
		declaration: declaration.mode,
		change,
		deltas: declaration.deltas,
		bases,
		report,
	});
}

// P0-B: el sync de close mergea cada delta DENTRO de su spec canónico base y
// llama parseOpenSpec sobre ese base; un base heredado sin cabeceras reventaba
// con `invalid-format` en la ÚLTIMA fase, tras todo el trabajo ya hecho. Este
// guard adelanta esa precondición: valida los bases que el cambio va a tocar
// desde lintChange, de modo que ein_sdd_check lo saca ya en scope. Solo mira
// dominios con delta real; un dominio nuevo sin base se ignora (el sync lo
// crea desde cero, no hay base que mergear). Puro y testeable.
export function lintCanonicalBases(cwd: string, change: string): GuardrailIssue[] {
	const root = resolveChangesDir(cwd);
	// Los cambios .sdd legacy no tienen specs OpenSpec: nada que validar.
	if (root !== join(cwd, "openspec", "changes")) return [];
	const specsDir = join(root, change, "specs");
	let domains: string[];
	try { domains = readdirSync(specsDir); } catch { return []; }
	const issues: GuardrailIssue[] = [];
	for (const domain of domains.sort()) {
		if (!existsSync(join(specsDir, domain, "spec.md"))) continue;
		const basePath = join(cwd, "openspec", "specs", domain, "spec.md");
		if (!existsSync(basePath)) continue; // dominio nuevo: sync lo crea, no hay base
		let content: string;
		try {
			content = readFileSync(basePath, "utf8");
		} catch {
			issues.push({ level: "error", code: "canonical-base-unreadable", message: `El spec canónico openspec/specs/${domain}/spec.md no se pudo leer; el sync de cierre fallará. Revísalo antes de continuar.` });
			continue;
		}
		const parsed = parseOpenSpec(content);
		if (!parsed.ok) {
			const first = parsed.errors[0];
			const detail = first ? `${first.code} en línea ${first.line}: ${first.message}` : "formato inválido";
			issues.push({ level: "error", code: "canonical-base-invalid", message: `El spec canónico openspec/specs/${domain}/spec.md no parsea (${detail}); el sync de cierre fallará con invalid-format. Normalízalo ahora, no en close.` });
		}
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
	// `rules:` de openspec/config.yaml. Se escribia desde el bootstrap y no la
	// leia nadie; ahora relaja los avisos de forma que el proyecto declare.
	const designRules = readConfigRules(cwd).design;
	const lane = readChangeLane(base);
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
		// fase — no invalida el artefacto, pero verify/review deben saberlo.
		if (/^\s*authored_by\s*[:=]\s*parent-fallback\b/im.test(content)) {
			provenanceIssues.push({
				level: "warning",
				code: `provenance-parent-fallback-${phase}`,
				message: `${PHASE_ARTIFACT[phase]} fue persistido por el parent (authored_by: parent-fallback), no por el executor de fase; revisar con atencion extra.`,
			});
		}
		const report = lintPhaseArtifact(phase, content, phase === "design" ? { designRules } : {});
		errors += report.errors;
		warnings += report.warnings;
		phases.push({ phase, present: true, report });
	}
	const declaration = readSpecDeltaDeclaration(cwd, change);
	if (declaration.mode === "invalid") {
		provenanceIssues.push({ level: "error", code: "spec-delta-unresolved", message: "El cambio OpenSpec requiere exactamente un delta válido o una declaración spec_delta: none válida." });
	}
	provenanceIssues.push(...lintCanonicalBases(cwd, change));
	const issues = [...sequenceIssues(phases, lane), ...provenanceIssues];
	errors += issues.filter((issue) => issue.level === "error").length;
	warnings += issues.filter((issue) => issue.level === "warning").length;
	return { change, ok: errors === 0, errors, warnings, issues, phases };
}
