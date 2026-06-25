// =============================================================================
// TESTS: Review Workload Guard (P1, opcion C — determinista en delivery)
// Protege al revisor de PRs irrevisables. El gate vive en ein-git: mide lineas
// reales (`git diff --stat`) contra el budget, en vez de un forecast estimado.
//   - ein-git.md documenta el gate (mide, no estima; STOP+report; auto no salta).
//   - la preflight inyecta la regla determinista, no el viejo "forecast" muerto.
//   - el orchestrator reenvia budget a ein-git y gatea con ask_user_question.
//   - no queda el straggler de marca "Gentle AI".
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const einGit = readFileSync(join(AGENT, "agents/ein-git.md"), "utf8");
const orchestrator = readFileSync(join(AGENT, "assets/orchestrator.md"), "utf8");
const preflightSrc = readFileSync(join(AGENT, "lib/sdd-preflight.ts"), "utf8");

const { renderSddPreflightPrompt } = await import(
	"../ein-pi/agent/lib/sdd-preflight"
);

const PREFS = {
	executionMode: "auto",
	artifactStore: "openspec",
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

describe("sin stragglers de marca", () => {
	test("la preflight ya no dice 'Gentle AI'", () => {
		expect(preflightSrc).not.toContain("Gentle AI");
	});
});
