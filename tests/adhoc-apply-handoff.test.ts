// =============================================================================
// TESTS: hand-off de apply ad-hoc (anti-regresión de prompts)
// Dos mejoras de producto:
//   1. Un apply ad-hoc (fuera del chain SDD) NO escribe report en el repo del
//      usuario — devuelve inline. Antes el parent le inventaba un `output` y el
//      runtime volcaba un *.md en la raíz, que luego otro apply tenía que borrar.
//   2. Hand-off cerrado: si el parent YA diagnosticó la edición exacta, pasa un
//      patch cerrado (archivo + before→after + tests) y el apply no re-escanea.
// Son contratos de prompt; los asertamos por substring para que no se pierdan.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const orchestrator = readFileSync(join(CORE, "assets/orchestrator.md"), "utf8");
const sddApply = readFileSync(join(CORE, "agents/sdd-apply.md"), "utf8");

describe("apply ad-hoc no escribe report en el repo", () => {
	test("el orquestador prohíbe `output`/ruta inventada en apply ad-hoc", () => {
		expect(orchestrator).toContain("ad-hoc apply");
		expect(orchestrator).toContain("never invent a report path");
		expect(orchestrator.toLowerCase()).toContain("returns its report **inline**".toLowerCase());
	});

	test("sdd-apply documenta el caso ad-hoc → inline, sin fichero en el repo", () => {
		expect(sddApply).toContain("Ad-hoc apply");
		expect(sddApply).toContain(
			"Do **NOT** write any report or progress file into the repository",
		);
		expect(sddApply).toContain("Apply Progress (chain runs only)");
	});
});

describe("hand-off cerrado para fixes ya diagnosticados", () => {
	test("el orquestador distingue investigación vs ya-diagnosticado", () => {
		expect(orchestrator).toContain("Investigation needed");
		expect(orchestrator).toContain("Already diagnosed");
		expect(orchestrator).toContain("CLOSED patch");
		expect(orchestrator).toContain("NOT to re-scan or re-diagnose");
	});

	test("el ladder remite al patch cerrado para edits ya pinpointed", () => {
		expect(orchestrator).toContain("closed patch");
	});

	test("sdd-apply: si ya le dan el edit, no re-escanea", () => {
		expect(sddApply.toLowerCase()).toContain("don't re-scan the tree");
	});
});
