// =============================================================================
// TESTS: guardarraíles ad-hoc del orquestador
//   - Exploration hygiene: excluir node_modules/dist/etc. de find/grep/glob
//     (el `find` que volcó todo node_modules al contexto).
//   - Assessment & valuation: una valoración es read-only ligera, no dispara
//     `bun run build`/test pesados ni delega en sdd-verify.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orchestrator = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md"),
	"utf8",
);

describe("Exploration hygiene", () => {
	test("tiene la sección", () => {
		expect(orchestrator).toContain("## Exploration hygiene");
	});

	test("excluye dirs generados/dependencias", () => {
		expect(orchestrator).toContain("node_modules");
		expect(orchestrator.toLowerCase()).toContain("exclude generated/dependency dirs");
	});

	test("avisa contra el find sin prune", () => {
		expect(orchestrator).toContain("-prune");
	});
});

describe("Assessment & valuation read-only", () => {
	test("tiene la sección", () => {
		expect(orchestrator).toContain("## Assessment & valuation");
	});

	test("prohíbe build/test pesados por defecto", () => {
		expect(orchestrator).toContain("bun run build");
		expect(orchestrator.toLowerCase()).toContain("do not run");
	});

	test("no delega una valoración a sdd-verify", () => {
		expect(orchestrator.toLowerCase()).toContain("do not delegate it to `sdd-verify`");
	});
});
