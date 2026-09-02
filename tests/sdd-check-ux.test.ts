// =============================================================================
// TESTS: /ein:sdd-check UX mejorada (ein-ai.ts)
// форматChangeLint: salida humanizada desde ChangeLintReport.
// changeDirExists: deteccion de nombre de change vs path.
// El contrato de la tool ein_sdd_check sigue siendo JSON (no se testa aqui).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChangeLintReport, GuardrailIssue } from "../ein-pi/agent/lib/sdd-guardrails";
import { changeDirExists, formatChangeLint } from "../ein-pi/agent/extensions/internal/ein-sdd-presentation";

// ---------------------------------------------------------------------------
// changeDirExists
// ---------------------------------------------------------------------------

describe("changeDirExists", () => {
	test("devuelve true para un change existente", () => {
		const cwd = join(tmpdir(), `sdd-check-ux-test-${Date.now()}`);
		mkdirSync(cwd, { recursive: true });
		mkdirSync(join(cwd, "openspec", "changes", "mi-cambio"), { recursive: true });

		expect(changeDirExists(cwd, "mi-cambio")).toBe(true);
	});

	test("devuelve false para un change que no existe", () => {
		const cwd = tmpdir();
		expect(changeDirExists(cwd, "change-inexistente-xyz")).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// formatChangeLint
// ---------------------------------------------------------------------------

function makeReport(
	change: string,
	phases: ChangeLintReport["phases"],
	errors = 0,
	warnings = 0,
): ChangeLintReport {
	return { change, ok: errors === 0, errors, warnings, issues: [], phases };
}

function makePhase(
	phase: "scope" | "map" | "design" | "tasks" | "apply" | "verify" | "close",
	present: boolean,
	issues: GuardrailIssue[] = [],
	_errors = 0,
	_warnings = 0,
) {
	const reportErrors = issues.filter((i) => i.level === "error").length;
	const reportWarnings = issues.filter((i) => i.level === "warning").length;
	return {
		phase,
		present,
		report: present
			? { ok: reportErrors === 0, issues, errors: reportErrors, warnings: reportWarnings, lineCount: 10 }
			: undefined,
	};
}

describe("formatChangeLint", () => {
	test("design OK sin issues", () => {
		const report = makeReport("feat-x", [
			makePhase("scope", true, [], 0, 0),
			makePhase("map", true, [], 0, 0),
			makePhase("design", true, [], 0, 0),
			makePhase("tasks", false),
			makePhase("apply", false),
			makePhase("verify", false),
			makePhase("close", false),
		]);

		const out = formatChangeLint(report);
		expect(out).toContain("// 000. sdd check — feat-x");
		expect(out).toContain("fases: 3/7 presentes  |  errores: 0  |  warnings: 0");
		expect(out).toContain("▏ design — OK (presente, 10 lineas)");
		expect(out).toContain("▏ apply — MISSING");
	});

	test("design con errors y warnings", () => {
		const report = makeReport("feat-y", [
			makePhase("scope", true, [], 0, 0),
			makePhase("map", false),
			makePhase("design", true, [
				{ level: "error", code: "missing-proposal", message: 'Falta la seccion obligatoria "A. Proposal".' },
				{ level: "warning", code: "placeholder-angle-number", message: "Quedan placeholders `<number>` sin rellenar." },
			]),
			makePhase("tasks", false),
			makePhase("apply", false),
			makePhase("verify", false),
			makePhase("close", false),
		], 1, 1);

		const out = formatChangeLint(report);
		expect(out).toContain("errores: 1  |  warnings: 1");
		expect(out).toContain("▏ design — ERRORS (presente, 10 lineas)");
		expect(out).toContain("  - ERROR [missing-proposal]: Falta la seccion obligatoria \"A. Proposal\".");
		expect(out).toContain("  - WARNING [placeholder-angle-number]: Quedan placeholders `<number>` sin rellenar.");
	});

	test("todas las fases presentes y limpias", () => {
		const allPresent = (["scope", "map", "design", "tasks", "apply", "verify", "close"] as const).map((phase) =>
			makePhase(phase, true, []),
		);
		const report = makeReport("clean-change", allPresent, 0, 0);

		const out = formatChangeLint(report);
		expect(out).toContain("fases: 7/7 presentes  |  errores: 0  |  warnings: 0");
		expect(out).not.toContain("MISSING");
		expect(out).not.toContain("ERRORS");
	});

	test("muestra issues globales de consistencia", () => {
		const report: ChangeLintReport = {
			change: "gap-change",
			ok: false,
			errors: 1,
			warnings: 0,
			issues: [{ level: "error", code: "sequence-tasks-missing-before-apply", message: "Hueco de secuencia." }],
			phases: [makePhase("scope", true), makePhase("apply", true)],
		};
		const out = formatChangeLint(report);
		expect(out).toContain("▏ consistencia:");
		expect(out).toContain("ERROR [sequence-tasks-missing-before-apply]");
	});
});

// ---------------------------------------------------------------------------
// Contract: ein_sdd_check tool devuelve texto formateado (no muro de JSON)
// El JSON crudo del report viaja en `details` para quien lo necesite.
// ---------------------------------------------------------------------------

describe("contract: ein_sdd_check tool devuelve texto formateado", () => {
	test("las superficies SDD registran ein_sdd_check como tool (no como command)", () => {
		const ai = [
			"../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts",
			"../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts",
		].map((path) => require("fs").readFileSync(join(import.meta.dir, path), "utf8")).join("\n");
		// La tool usa registerTool y devuelve formatChangeLint, no JSON.stringify
		expect(ai).toMatch(/name:\s*"ein_sdd_check"/);
		expect(ai).not.toMatch(/JSON\.stringify\(lintChange/);
		// El report crudo se conserva en details para uso programatico
		expect(ai).toMatch(/details:\s*report/);
		// El comando usa registerCommand
		expect(ai).toMatch(/registerCommand\(\s*"ein:sdd-check"/);
	});

	test("el comando /ein:sdd-check usa formatChangeLint (no JSON.stringify)", () => {
		const ai = require("fs").readFileSync(
			join(import.meta.dir, "../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts"),
			"utf8",
		);
		// El handler del comando llama a formatChangeLint
		expect(ai).toMatch(/formatChangeLint\(report\)/);
		// No hay JSON.stringify en el handler del comando
		const commandBlock = ai.match(/registerCommand\(\s*"ein:sdd-check"[\s\S]*?(?=registerCommand|register(?:Ein)?Tool|$)/)?.[0];
		expect(commandBlock).not.toMatch(/JSON\.stringify/);
	});
});
