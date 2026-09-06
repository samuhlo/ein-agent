// =============================================================================
// SDD CHANGE VALIDATION
// Coordina filesystem y reglas neutrales para validar un cambio completo. La
// persistencia lane entrega las fases esperadas mediante una dependencia.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readConfigRules } from "./openspec-config-rules.ts";
import { parseOpenSpec, parseOpenSpecDelta } from "./openspec-spec-parser.ts";
import { evaluateOpenSpecState, type SyncBaseInput } from "./openspec-spec-sync.ts";
import {
	PHASE_ARTIFACT,
	lintPhaseArtifact,
	type DesignLintReport,
	type GuardrailIssue,
	type SddPhase,
} from "./sdd-artifact-validation.ts";
import { resolveChangesDir, type SddSpecState } from "./sdd-routing-core.ts";

export type SpecDeltaDeclaration = {
	mode: "none" | "delta" | "invalid";
	deltas: { path: string; bytes: Uint8Array }[];
};

export type ChangeLintReport = {
	change: string;
	ok: boolean;
	errors: number;
	warnings: number;
	issues: GuardrailIssue[];
	phases: { phase: SddPhase; present: boolean; report?: DesignLintReport }[];
};

export type ExpectedPhasesReader = (changePath: string) => readonly SddPhase[];

function sequenceIssues(
	phases: ChangeLintReport["phases"],
	expected: readonly SddPhase[],
): GuardrailIssue[] {
	const issues: GuardrailIssue[] = [];
	const presentByPhase = new Map(phases.map((phase) => [phase.phase, phase.present]));
	for (let index = 0; index < expected.length; index += 1) {
		const phase = expected[index]!;
		if (!presentByPhase.get(phase)) continue;
		const missingBefore = expected.slice(0, index)
			.filter((candidate) => !presentByPhase.get(candidate));
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
	try { scope = readFileSync(join(base, "scope.md"), "utf8").replaceAll("\r\n", "\n"); } catch { /* unresolved */ }
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
		try { bases.push({ domain, bytes: readFileSync(path) }); } catch { return "unresolved"; }
	}
	let report: string | null = null;
	try {
		report = readFileSync(join(cwd, "openspec", "changes", change, "sync-report.md"), "utf8");
	} catch {
		// An absent or unreadable report remains pending or unresolved.
	}
	return evaluateOpenSpecState({
		declaration: declaration.mode,
		change,
		deltas: declaration.deltas,
		bases,
		report,
	});
}

export function lintCanonicalBases(cwd: string, change: string): GuardrailIssue[] {
	const root = resolveChangesDir(cwd);
	if (root !== join(cwd, "openspec", "changes")) return [];
	const specsDir = join(root, change, "specs");
	let domains: string[];
	try { domains = readdirSync(specsDir); } catch { return []; }
	const issues: GuardrailIssue[] = [];
	for (const domain of domains.sort()) {
		if (!existsSync(join(specsDir, domain, "spec.md"))) continue;
		const basePath = join(cwd, "openspec", "specs", domain, "spec.md");
		if (!existsSync(basePath)) continue;
		let content: string;
		try { content = readFileSync(basePath, "utf8"); } catch {
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

export function createLintChange(readExpectedPhases: ExpectedPhasesReader) {
	return function lintChange(cwd: string, change: string): ChangeLintReport {
		const base = join(resolveChangesDir(cwd), change);
		const phases: ChangeLintReport["phases"] = [];
		const provenanceIssues: GuardrailIssue[] = [];
		const designRules = readConfigRules(cwd).design;
		let errors = 0;
		let warnings = 0;
		for (const phase of Object.keys(PHASE_ARTIFACT) as SddPhase[]) {
			const path = join(base, PHASE_ARTIFACT[phase]);
			if (!existsSync(path)) {
				phases.push({ phase, present: false });
				continue;
			}
			let content = "";
			try { content = readFileSync(path, "utf8"); } catch { content = ""; }
			if (/^\s*authored_by\s*[:=]\s*parent-fallback\b/im.test(content)) {
				provenanceIssues.push({
					level: "warning",
					code: `provenance-parent-fallback-${phase}`,
					message: `${PHASE_ARTIFACT[phase]} fue persistido por el parent (authored_by: parent-fallback), no por el executor de fase; revisar con atencion extra.`,
				});
			}
			const report = lintPhaseArtifact(phase, content, { change, ...(phase === "design" ? { designRules } : {}) });
			errors += report.errors;
			warnings += report.warnings;
			phases.push({ phase, present: true, report });
		}
		const declaration = readSpecDeltaDeclaration(cwd, change);
		if (declaration.mode === "invalid") {
			provenanceIssues.push({ level: "error", code: "spec-delta-unresolved", message: "El cambio OpenSpec requiere exactamente un delta válido o una declaración spec_delta: none válida." });
		}
		provenanceIssues.push(...lintCanonicalBases(cwd, change));
		const issues = [...sequenceIssues(phases, readExpectedPhases(base)), ...provenanceIssues];
		errors += issues.filter((issue) => issue.level === "error").length;
		warnings += issues.filter((issue) => issue.level === "warning").length;
		return { change, ok: errors === 0, errors, warnings, issues, phases };
	};
}
