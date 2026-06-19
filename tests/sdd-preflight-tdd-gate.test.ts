// =============================================================================
// TESTS: renderSddPreflightPrompt — gate de la linea Strict TDD
// La linea de TDD solo debe entrar donde se escribe codigo (parent inline +
// sdd-apply). En init/explore/design/verify es ruido que empujaba a los
// modelos baratos a un ciclo RED/GREEN en fases read-only.
// =============================================================================

import { describe, expect, test } from "bun:test";

const { renderSddPreflightPrompt } = await import(
	"../ein-pi/agent/lib/sdd-preflight"
);

const PREFS = {
	executionMode: "auto",
	artifactStore: "openspec",
	chainedPrStrategy: "auto-forecast",
	reviewBudgetLines: 400,
	tddMode: "strict",
	engramAvailable: false,
	prompted: true,
} as const;

describe("renderSddPreflightPrompt TDD gate", () => {
	test("por defecto incluye la linea Strict TDD (compat: parent/apply)", () => {
		const out = renderSddPreflightPrompt(PREFS);
		expect(out).toContain("Strict TDD");
	});

	test("includeTdd:true incluye la linea", () => {
		expect(renderSddPreflightPrompt(PREFS, { includeTdd: true })).toContain(
			"Strict TDD",
		);
	});

	test("includeTdd:false omite TDD pero conserva el resto del preflight", () => {
		const out = renderSddPreflightPrompt(PREFS, { includeTdd: false });
		expect(out).not.toContain("Strict TDD");
		expect(out).toContain("## SDD Session Preflight");
		expect(out).toContain("Artifact store");
		expect(out).toContain("Execution mode");
	});
});
