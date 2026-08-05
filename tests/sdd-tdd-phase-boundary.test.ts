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
const APPLY = read("agents/sdd-apply.md");
const VERIFY = read("agents/sdd-verify.md");

describe("optimized verify plan: phase-boundary contract", () => {
	test("apply evidence names observable behavior seams", () => {
		expect(APPLY).toContain("behavior seam");
		expect(APPLY).toContain("one final focused command per behavior seam");
	});

	test("verify keeps exactly one final focused command for every seam", () => {
		expect(VERIFY).toContain("exactly one final focused command per behavior seam");
		expect(VERIFY).toContain("each seam has exactly one focused association");
	});

	test("command identity trims only surrounding whitespace", () => {
		expect(VERIFY).toContain("surrounding whitespace");
		expect(VERIFY).toContain("preserve all internal characters and ordering");
		expect(VERIFY).toContain("exact matches");
	});

	test("duplicate commands merge many seams and roles into one execution", () => {
		expect(VERIFY).toContain("first-seen order");
		expect(VERIFY).toContain("unioning seam, source, and role metadata");
		expect(VERIFY).toContain("execute each unique command once");
	});

	test("verify executes a fresh plan instead of reusing prior evidence", () => {
		expect(VERIFY).toContain("new command plan for every verify run");
		expect(VERIFY).toContain("MUST NOT use apply results");
		expect(VERIFY).toContain("timestamps, file hashes, or workflow-level cached outcomes");
	});

	test("global checks stay in verify and run once", () => {
		expect(VERIFY).toContain("global-check candidates");
		expect(VERIFY).toContain("each relevant global check once");
		expect(APPLY).toContain("Apply MUST NOT absorb global checks");
	});

	test("strict TDD and the apply no-production-build boundary remain explicit", () => {
		expect(APPLY).toContain("RED → GREEN → TRIANGULATE → REFACTOR");
		expect(APPLY).toContain("NEVER run a full production build");
	});
});

describe("strict-TDD audit and close-gate invariants", () => {
	test("missing or ambiguous seam evidence blocks an unqualified pass", () => {
		expect(VERIFY).toContain("Missing, multiple, or ambiguous associations are evidence gaps");
		expect(VERIFY.toLowerCase()).toContain("missing seam evidence");
		expect(VERIFY).toContain("prevents an unqualified passing report");
	});

	test("failed or unscheduled required checks block an unqualified pass", () => {
		expect(VERIFY).toContain("every explicit required check is scheduled");
		expect(VERIFY).toContain("failed, omitted, or otherwise unavailable required command");
		expect(VERIFY).toContain("prevents an unqualified passing report");
	});

	test("stale evidence and incomplete TDD cycles remain blocking", () => {
		expect(VERIFY).toContain("stale or substituted evidence");
		expect(VERIFY.toLowerCase()).toContain("audit red, green, triangulate, and refactor evidence");
		expect(VERIFY).toContain("Incomplete RED, GREEN, TRIANGULATE, or REFACTOR evidence");
	});

	test("close still requires the current passing verify report", () => {
		expect(VERIFY).toContain("close still requires the current lifecycle's passing verify report");
		expect(VERIFY).toContain("command-plan metadata cannot bypass them");
	});

	test("apply records complete strict-TDD evidence for every seam", () => {
		expect(APPLY).toContain("complete RED, GREEN, TRIANGULATE, and REFACTOR evidence");
		expect(APPLY).toContain("every behavior seam");
	});
});

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
