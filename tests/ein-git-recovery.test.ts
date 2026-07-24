import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../ein-pi/core");
const orchestrator = readFileSync(join(AGENT, "assets/orchestrator.md"), "utf8");
const einGit = readFileSync(join(CORE, "agents/ein-git.md"), "utf8");

describe("contrato de recuperación de ein-git", () => {
	test("separa el timeout de entrega normal del de recuperación", () => {
		expect(orchestrator).toContain("normal delivery budget");
		expect(orchestrator).toContain("120000");
		expect(orchestrator).toContain("maxRuntimeMs: 300000");
	});

	test("exige auditoría de solo lectura y una mutación cerrada", () => {
		expect(orchestrator).toContain("read-only audit first");
		expect(orchestrator).toContain("closed mutation");
		expect(orchestrator).toContain("exact current refs/dirty paths");
	});

	test("reconcilia un timeout antes de reintentar", () => {
		expect(orchestrator).toContain("reconcile read-only before the generic retry rule");
		expect(orchestrator).toContain("completed acceptance means do not retry");
		expect(orchestrator).toContain("one retry for only the exact remaining delta");
		expect(orchestrator).toContain("ambiguity or a second failure stops for the user");
	});

	test("preserva el ancla de recuperación y no consume el stash", () => {
		expect(einGit).toContain("immutable, reachable recovery anchor");
		expect(einGit).toContain("Never drop or consume the only stash");
		expect(einGit).toContain("never delete or repoint the final anchor before verification");
	});

	test("detiene contradicciones antes de mutar y prohíbe force-push", () => {
		expect(einGit).toContain("stop before mutation and return the contradiction");
		expect(einGit).toContain("Never force-push");
	});
});
