// =============================================================================
// TESTS: /ein:sdd-check UX mejorada (ein-ai.ts)
// форматChangeLint: salida humanizada desde ChangeLintReport.
// changeDirExists: deteccion de nombre de change vs path.
// El contrato de la tool ein_sdd_check sigue siendo JSON (no se testa aqui).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ChangeLintReport, GuardrailIssue } from "../ein-pi/agent/lib/sdd-guardrails";

// Pure helpers from ein-ai.ts that are testable without the full Pi extension.
// We replicate just the logic tree here so tests are self-contained.

function changeDirExists(cwd: string, name: string): boolean {
	try {
		const { statSync } = require("node:fs") as typeof import("node:fs");
		const base = join(cwd, "openspec", "changes", name);
		return statSync(base).isDirectory();
	} catch {
		return false;
	}
}

function formatChangeLint(report: ChangeLintReport): string {
	const { change, errors, warnings, phases } = report;
	const present = phases.filter((p) => p.present);
	const total = phases.length;
	const presentCount = present.length;

	const lines: string[] = [
		`/// 000. SDD CHECK — ${change}`,
		"",
		`fases: ${presentCount}/${total} presentes  |  errores: ${errors}  |  warnings: ${warnings}`,
	];

	for (const { phase, present: isPresent, report: pr } of phases) {
		if (!isPresent) {
			lines.push(`■ ${phase} — MISSING`);
			continue;
		}
		const ok = pr!.errors === 0;
		const icon = ok ? "OK" : "ERRORS";
		const detail = pr!.lineCount > 0 ? `, ${pr!.lineCount} lineas` : "";
		lines.push(`■ ${phase} — ${icon} (presente${detail})`);
		if (pr!.issues.length > 0) {
			for (const i of pr!.issues) {
				lines.push(`  - ${i.level.toUpperCase()} [${i.code}]: ${i.message}`);
			}
		}
	}

	return lines.join("\n");
}

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
	return { change, ok: errors === 0, errors, warnings, phases };
}

function makePhase(
	phase: "init" | "explore" | "design" | "tasks" | "apply" | "verify" | "archive",
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
			makePhase("init", true, [], 0, 0),
			makePhase("explore", true, [], 0, 0),
			makePhase("design", true, [], 0, 0),
			makePhase("tasks", false),
			makePhase("apply", false),
			makePhase("verify", false),
			makePhase("archive", false),
		]);

		const out = formatChangeLint(report);
		expect(out).toContain("/// 000. SDD CHECK — feat-x");
		expect(out).toContain("fases: 3/7 presentes  |  errores: 0  |  warnings: 0");
		expect(out).toContain("■ design — OK (presente, 10 lineas)");
		expect(out).toContain("■ apply — MISSING");
	});

	test("design con errors y warnings", () => {
		const report = makeReport("feat-y", [
			makePhase("init", true, [], 0, 0),
			makePhase("explore", false),
			makePhase("design", true, [
				{ level: "error", code: "missing-proposal", message: 'Falta la seccion obligatoria "A. Proposal".' },
				{ level: "warning", code: "placeholder-angle-number", message: "Quedan placeholders `<number>` sin rellenar." },
			]),
			makePhase("tasks", false),
			makePhase("apply", false),
			makePhase("verify", false),
			makePhase("archive", false),
		], 1, 1);

		const out = formatChangeLint(report);
		expect(out).toContain("errores: 1  |  warnings: 1");
		expect(out).toContain("■ design — ERRORS (presente, 10 lineas)");
		expect(out).toContain("  - ERROR [missing-proposal]: Falta la seccion obligatoria \"A. Proposal\".");
		expect(out).toContain("  - WARNING [placeholder-angle-number]: Quedan placeholders `<number>` sin rellenar.");
	});

	test("todas las fases presentes y limpias", () => {
		const allPresent = (["init", "explore", "design", "tasks", "apply", "verify", "archive"] as const).map((phase) =>
			makePhase(phase, true, []),
		);
		const report = makeReport("clean-change", allPresent, 0, 0);

		const out = formatChangeLint(report);
		expect(out).toContain("fases: 7/7 presentes  |  errores: 0  |  warnings: 0");
		expect(out).not.toContain("MISSING");
		expect(out).not.toContain("ERRORS");
	});
});

// ---------------------------------------------------------------------------
// Contract: ein_sdd_check tool sigue devolviendo JSON
// Verificado via inspeccion del source en sdd-flow-contract.test.ts
// ---------------------------------------------------------------------------

describe("contract: ein_sdd_check tool es JSON-oriented", () => {
	test("ein-ai.ts registra ein_sdd_check como tool (no como command)", () => {
		const ai = require("fs").readFileSync(
			join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
			"utf8",
		);
		// La tool usa registerTool y devuelve JSON.stringify
		expect(ai).toMatch(/name:\s*"ein_sdd_check"/);
		expect(ai).toMatch(/JSON\.stringify\(lintChange/);
		// El comando usa registerCommand
		expect(ai).toMatch(/registerCommand\(\s*"ein:sdd-check"/);
	});

	test("el comando /ein:sdd-check usa formatChangeLint (no JSON.stringify)", () => {
		const ai = require("fs").readFileSync(
			join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
			"utf8",
		);
		// El handler del comando llama a formatChangeLint
		expect(ai).toMatch(/formatChangeLint\(report\)/);
		// No hay JSON.stringify en el handler del comando
		const commandBlock = ai.match(/registerCommand\(\s*"ein:sdd-check"[\s\S]*?(?=registerCommand|registerTool|$)/)?.[0];
		expect(commandBlock).not.toMatch(/JSON\.stringify/);
	});
});
