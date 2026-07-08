// =============================================================================
// TESTS: coste real por cambio (P5) y procedencia de artefactos (P4)
//   - readSddRealCost lee los meta.json de pi-subagents (.pi-subagents/
//     artifacts/) y suma el consumo REAL de inferencia por cambio, atribuido
//     por mención del nombre del cambio en el task del run.
//   - lintChange emite WARNING cuando un artefacto declara
//     `authored_by: parent-fallback` (lo persistió el parent, no el executor).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSddRealCost } from "../ein-pi/agent/lib/sdd-router";
import { lintChange, lintPhaseArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

let DIR: string;

function meta(name: string, body: Record<string, unknown>): void {
	const dir = join(DIR, ".pi-subagents", "artifacts");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), JSON.stringify(body));
}

function runMeta(agent: string, task: string, input: number, output: number, cost: number, durationMs = 60000): Record<string, unknown> {
	return { agent, task, usage: { input, output, cost, turns: 5 }, durationMs };
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-real-cost-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("readSddRealCost (P5)", () => {
	test("sin .pi-subagents/artifacts → 0 runs, sin problems", () => {
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.runs).toBe(0);
		expect(c.problems).toEqual([]);
	});

	test("suma input/output/cost/duración de los runs del cambio", () => {
		meta("a_sdd-map_0_meta.json", runMeta("sdd-map", "Map feat-x change", 100000, 15000, 0.2));
		meta("b_sdd-apply_0_meta.json", runMeta("sdd-apply", "Apply slice 1 of feat-x", 107000, 33000, 0.33, 1137625));
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.runs).toBe(2);
		expect(c.inputTokens).toBe(207000);
		expect(c.outputTokens).toBe(48000);
		expect(c.costUsd).toBeCloseTo(0.53, 5);
		expect(c.durationMs).toBe(1197625);
	});

	test("excluye runs de OTROS cambios (atribución por task)", () => {
		meta("a_sdd-map_0_meta.json", runMeta("sdd-map", "Map feat-x change", 1000, 100, 0.01));
		meta("b_sdd-map_0_meta.json", runMeta("sdd-map", "Map another-change", 9999, 999, 0.99));
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.runs).toBe(1);
		expect(c.inputTokens).toBe(1000);
	});

	test("agrupa por agente ordenado por tokens desc", () => {
		meta("a_sdd-map_0_meta.json", runMeta("sdd-map", "feat-x", 100, 10, 0));
		meta("b_sdd-apply_0_meta.json", runMeta("sdd-apply", "feat-x", 5000, 500, 0));
		meta("c_sdd-apply_1_meta.json", runMeta("sdd-apply", "feat-x retry", 2000, 200, 0));
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.byAgent[0]).toMatchObject({ agent: "sdd-apply", runs: 2, tokens: 7700 });
		expect(c.byAgent[1]).toMatchObject({ agent: "sdd-map", runs: 1, tokens: 110 });
	});

	test("meta ilegible → problem, no explota ni contamina la suma", () => {
		meta("a_sdd-map_0_meta.json", runMeta("sdd-map", "feat-x", 1000, 100, 0.01));
		const dir = join(DIR, ".pi-subagents", "artifacts");
		writeFileSync(join(dir, "broken_meta.json"), "{not json");
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.runs).toBe(1);
		expect(c.problems.length).toBe(1);
		expect(c.problems[0]).toContain("broken_meta.json");
	});

	test("ignora ficheros que no son *_meta.json", () => {
		meta("a_sdd-map_0_meta.json", runMeta("sdd-map", "feat-x", 1000, 100, 0));
		const dir = join(DIR, ".pi-subagents", "artifacts");
		writeFileSync(join(dir, "a_sdd-map_0_output.md"), "feat-x whatever");
		const c = readSddRealCost(DIR, "feat-x");
		expect(c.runs).toBe(1);
	});
});

describe("provenance parent-fallback (P4)", () => {
	function changeDir(name: string): string {
		const p = join(DIR, "openspec", "changes", name);
		mkdirSync(p, { recursive: true });
		return p;
	}

	test("artefacto con authored_by: parent-fallback → WARNING de procedencia", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\nbudget_allocated:\n  max_tokens: 15000\n");
		writeFileSync(join(c, "map.md"), "authored_by: parent-fallback\nstatus: completed\nfindings\n");
		const report = lintChange(DIR, "feat-x");
		const issue = report.issues.find((i) => i.code === "provenance-parent-fallback-map");
		expect(issue).toBeDefined();
		expect(issue?.level).toBe("warning");
		expect(report.warnings).toBeGreaterThanOrEqual(1);
	});

	test("artefacto normal → sin warning de procedencia", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\n");
		writeFileSync(join(c, "map.md"), "status: completed\nfindings\n");
		const report = lintChange(DIR, "feat-x");
		expect(report.issues.some((i) => i.code.startsWith("provenance-"))).toBe(false);
	});

	test("la procedencia es warning, no error: no rompe el gate", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\n");
		writeFileSync(join(c, "map.md"), "authored_by: parent-fallback\nok\n");
		const report = lintChange(DIR, "feat-x");
		const provenanceErrors = report.issues.filter((i) => i.code.startsWith("provenance-") && i.level === "error");
		expect(provenanceErrors).toEqual([]);
	});
});

// Antifabricación: el parent que se queda sin subagentes NO debe rellenar la
// telemetría con `unknown` / excusas para pasar el gate. Reproduce el incidente
// real: `budget_consumed: tokens: unknown` y `ledger: parent-direct; subagent
// limit reached` pasaban porque el token existía; ahora son error duro.
describe("antifabricación de coste/ledger (P4)", () => {
	test("`tokens: unknown` en budget_consumed → error fabricated-cost", () => {
		const report = lintPhaseArtifact(
			"map",
			"scope_status: bounded\nledger: real\nbudget_consumed: reads: 2, tokens: unknown\n",
		);
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "fabricated-cost")).toBe(true);
	});

	test("ledger con excusa (`parent-direct`, `subagent limit reached`) → error fabricated-ledger", () => {
		const report = lintPhaseArtifact(
			"map",
			"scope_status: bounded\nledger: parent-direct; subagent limit reached, map authored inline\nbudget_consumed: 1\n",
		);
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "fabricated-ledger")).toBe(true);
	});

	test("parent-fallback + telemetría OMITIDA → warnings, no error (salida honesta)", () => {
		const report = lintPhaseArtifact("map", "scope_status: bounded\nfindings\n", {
			authoredByFallback: true,
		});
		expect(report.ok).toBe(true);
		// ledger + budget_consumed ausentes, pero degradados a warning por fallback.
		expect(report.issues.some((i) => i.code === "missing-ledger" && i.level === "warning")).toBe(true);
		expect(report.issues.some((i) => i.code === "missing-budget-consumed" && i.level === "warning")).toBe(true);
		expect(report.issues.every((i) => i.level !== "error")).toBe(true);
	});

	test("sin fallback, telemetría ausente sigue siendo error (no se relaja gratis)", () => {
		const report = lintPhaseArtifact("map", "scope_status: bounded\nfindings\n");
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "missing-ledger" && i.level === "error")).toBe(true);
	});

	test("fabricación NO se salva por declarar parent-fallback: inventar cifras es error incluso en fallback", () => {
		const c = join(DIR, "openspec", "changes", "feat-y");
		mkdirSync(c, { recursive: true });
		writeFileSync(join(c, "scope.md"), "scope: x\nbudget_allocated:\n  max_tokens: 15000\n");
		writeFileSync(
			join(c, "map.md"),
			"authored_by: parent-fallback\nscope_status: bounded\nledger: real\nbudget_consumed: tokens: unknown\n",
		);
		const report = lintChange(DIR, "feat-y");
		expect(report.ok).toBe(false);
		// La incidencia de fabricación vive en el report de la fase (map), no en
		// el `issues` top-level (que solo agrega secuencia + procedencia); aun así
		// suma a `errors` y tumba `ok`, y `formatChangeLint` la renderiza por fase.
		const mapReport = report.phases.find((p) => p.phase === "map")?.report;
		expect(mapReport?.issues.some((i) => i.code === "fabricated-cost")).toBe(true);
	});
});
