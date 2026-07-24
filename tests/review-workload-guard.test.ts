// =============================================================================
// TESTS: Review Workload Guard — gate determinista en delivery
// =============================================================================
// BLINDAJE -> ein-git mide líneas reales con `git diff --shortstat` (no
// estima), para y reporta si el budget se pasa. La preflight inyecta la
// regla, el orchestrator reenvía el budget y gatea con ask_user_question,
// y los tres sitios comparten el mismo pathspec de exclusión (anti-drift).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../ein-pi/core");
const einGit = readFileSync(join(CORE, "agents/ein-git.md"), "utf8");
const orchestrator = readFileSync(join(AGENT, "assets/orchestrator.md"), "utf8");

const { renderSddPreflightPrompt } = await import(
	"../ein-pi/agent/lib/sdd-preflight"
);

const PREFS = {
	executionMode: "auto",
	memoryMode: "off",
	chainedPrStrategy: "auto-forecast",
	reviewBudgetLines: 400,
	tddMode: "off",
	engramAvailable: false,
	prompted: true,
} as const;

describe("ein-git Review Workload Gate", () => {
	test("ein-git.md documenta el gate", () => {
		expect(einGit).toContain("Review Workload Gate");
	});

	test("mide lineas reales con git diff --shortstat (no estima)", () => {
		expect(einGit).toContain("git diff --shortstat");
		expect(einGit.toLowerCase()).toContain("measured, not estimated");
	});

	test("para y reporta cuando supera el budget (es headless)", () => {
		expect(einGit).toContain("STOP");
		expect(einGit).toContain("single-pr-default");
	});

	test("auto no salta el gate", () => {
		expect(einGit.toLowerCase()).toContain(
			"`auto` execution mode does **not** bypass this gate",
		);
	});
});

describe("preflight inyecta la regla determinista, no el forecast muerto", () => {
	test("no menciona el viejo 'task/workload forecasts conflict'", () => {
		const out = renderSddPreflightPrompt(PREFS);
		expect(out).not.toContain("task/workload forecasts conflict");
	});

	test("inyecta el Review Workload Guard con git diff --shortstat y el budget", () => {
		const out = renderSddPreflightPrompt(PREFS);
		expect(out).toContain("Review Workload Guard");
		expect(out).toContain("git diff --shortstat");
		expect(out).toContain("400-line review budget");
	});
});

describe("orchestrator coordina el guard", () => {
	test("tiene seccion Review Workload Guard", () => {
		expect(orchestrator).toContain("Review Workload Guard");
	});

	test("el parent mide el diff, pregunta antes de delegar, y ein-git es backstop", () => {
		expect(orchestrator).toContain("ask_user_question");
		// El parent es el check primario: mide git diff --shortstat él mismo…
		expect(orchestrator).toContain("git diff --shortstat");
		// …y ein-git pasa a ser el backstop, no el check principal.
		expect(orchestrator.toLowerCase()).toContain("backstop");
	});
});

describe("presupuesto solo-produccion (excluye tests/generados)", () => {
	// Token canonico del pathspec de exclusion: si los tres sitios no lo
	// comparten, el presupuesto se desincroniza en silencio. Anti-drift.
	const EXCLUDE_TOKEN = ":(exclude)*.test.*";

	test("el token de exclusion esta en los tres sitios (anti-drift)", () => {
		expect(orchestrator).toContain(EXCLUDE_TOKEN);
		expect(einGit).toContain(EXCLUDE_TOKEN);
		expect(renderSddPreflightPrompt(PREFS)).toContain(EXCLUDE_TOKEN);
	});

	test("los tres usan --shortstat, no el viejo --stat por-archivo", () => {
		expect(orchestrator).toContain("git diff --shortstat");
		expect(einGit).toContain("git diff --shortstat");
		expect(renderSddPreflightPrompt(PREFS)).toContain("git diff --shortstat");
	});

	test("documentan que tests/generados se reportan pero no gatean", () => {
		expect(einGit.toLowerCase()).toContain("production");
		expect(orchestrator.toLowerCase()).toContain("production lines");
		expect(renderSddPreflightPrompt(PREFS).toLowerCase()).toContain(
			"production changed lines",
		);
	});
});
