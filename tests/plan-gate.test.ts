// =============================================================================
// TESTS: Plan Gate (#2) — el orquestador planifica antes de ejecutar
// Una peticion ambigua/bulk que muta estado (Linear/git/files) debe pasar por
// resolve → show → confirm → execute antes de delegar. Y ein-linear no debe
// escanear el board cuando el hand-off ya trae los IDs.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const orchestrator = readFileSync(join(AGENT, "assets/orchestrator.md"), "utf8");
const einLinear = readFileSync(join(AGENT, "agents/ein-linear.md"), "utf8");

describe("orchestrator Plan Gate", () => {
	test("tiene la seccion Plan Gate", () => {
		expect(orchestrator).toContain("## Plan Gate");
	});

	test("define el ciclo resolve → show → confirm → execute", () => {
		expect(orchestrator).toContain("resolve → show → confirm → execute");
	});

	test("exige confirmacion con ask_user_question antes de ejecutar", () => {
		expect(orchestrator).toContain("ask_user_question");
		expect(orchestrator.toLowerCase()).toContain(
			"never delegate a state-mutating action straight from a loose instruction",
		);
	});

	test("auto no salta el gate", () => {
		expect(orchestrator.toLowerCase()).toContain("`auto` mode does not bypass it");
	});

	test("no sobre-pregunta: salta el gate para objetivos concretos y de bajo riesgo", () => {
		expect(orchestrator.toLowerCase()).toContain("skip the gate");
	});
});

describe("ein-linear no escanea el board cuando trae IDs", () => {
	test("tiene budget de scope que prohibe el escaneo total", () => {
		expect(einLinear).toContain("Scope & token budget");
		expect(einLinear.toLowerCase()).toContain("never scan the whole board");
	});

	test("si el hand-off trae IDs, actua directo", () => {
		expect(einLinear.toLowerCase()).toContain("act on those directly");
	});
});
