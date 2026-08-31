import { describe, expect, test } from "bun:test";
import { ensurePhaseRuntime } from "../ein-pi/agent/lib/sdd-preflight.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const orchestrator = readFileSync(join(CORE, "assets/orchestrator.md"), "utf8");
const einGit = readFileSync(join(CORE, "agents/ein-git.md"), "utf8");

describe("contrato de recuperación de ein-git", () => {
	// Los dos carriles llevaban el MISMO valor (300000), así que la prosa que los
	// "separaba" no separaba ningún número. Lo que de verdad distingue la
	// recuperación es el procedimiento: auditoría primero, mutación cerrada
	// después. El techo lo fija la tabla, igual para ambos.
	test("ambos carriles comparten techo y lo fija la tabla, no el prompt", () => {
		const input: Record<string, unknown> = { agent: "ein-git", task: "reflog y reconstrucción de rama" };
		expect(ensurePhaseRuntime(input)).toBe(true);
		expect(input.maxRuntimeMs).toBe(300_000);
		expect(orchestrator).not.toContain("maxRuntimeMs: 300000");
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
