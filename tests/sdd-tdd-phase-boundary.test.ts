// =============================================================================
// TESTS: TDD phase boundary
// Regresion: el padre volcaba "STRICT TDD MODE IS ACTIVE" en el task compartido
// del chain ein-sdd, que se reenvia a las fases -> scope/map/design corrian
// tests y escribian apply/verify. Fix: orchestrator no lo mete en la tarea de
// chain (solo en apply directo), y las fases read-only lo ignoran (defensa).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../ein-pi/core");
// Runtime Pi (assets/, lib/, extensions/) vive en agent/; el contenido
// portable (agents/, AGENTS.md, skills/) vive en core/.
const read = (p: string) =>
	readFileSync(join(p.startsWith("agents/") || p === "AGENTS.md" ? CORE : AGENT, p), "utf8");

describe("orchestrator: TDD forwarding distingue chain vs directo", () => {
	const orch = read("assets/orchestrator.md");

	test("instruye a NO meter TDD en la tarea compartida del chain", () => {
		expect(orch).toContain("ein-sdd` chain");
		expect(orch.toLowerCase()).toContain("phase-neutral");
	});

	test("conserva la linea TDD para invocacion directa de sdd-apply", () => {
		expect(orch).toContain("STRICT TDD MODE IS ACTIVE");
	});
});

describe("fases read-only: phase boundary que ignora TDD/tests", () => {
	for (const phase of ["sdd-scope", "sdd-map", "sdd-design"]) {
		test(`${phase} tiene phase boundary`, () => {
			const md = read(`agents/${phase}.md`);
			expect(md).toContain("Phase boundary");
		});
	}
});
