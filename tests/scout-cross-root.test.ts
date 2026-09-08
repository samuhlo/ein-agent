import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptTrackedScoutResult, normalizeScoutLaunch, type ScoutTracking } from "../ein-pi/agent/lib/scout-contract.ts";
import scoutChild from "../ein-pi/agent/extensions/internal/ein-scout-child.ts";

describe("scout migration audit", () => {
	test("validates source and parent document from the delegated cwd without trusting result cwd", () => {
		const workspace = mkdtempSync(join(tmpdir(), "ein-migration-audit-"));
		const source = join(workspace, "nuxt"), target = join(workspace, "astro"), outside = join(workspace, "outside");
		try {
			for (const root of [source, target, outside]) mkdirSync(root);
			writeFileSync(join(source, "app.vue"), "source\n");
			writeFileSync(join(target, "migration-plan.md"), "plan\n");
			writeFileSync(join(outside, "secret.txt"), "outside\n");
			symlinkSync(outside, join(source, "escape"));
			const makeReport = (path: string) => JSON.stringify({
				version: "ein-scout-report/v1", summary: "Source and plan", summaryReferenceIds: ["R1", "R2"],
				findings: [{ claim: "source", referenceIds: ["R1"] }, { claim: "plan", referenceIds: ["R2"] }],
				references: [{ id: "R1", path, lines: "1", supports: "source" }, { id: "R2", path: "../astro/migration-plan.md", lines: "1", supports: "plan" }], uncertainties: [],
			});
			for (const cwd of [source, "../nuxt"]) {
				const tracking: ScoutTracking = new Map();
				const launch = normalizeScoutLaunch({ workflowScript: 'runs.all([{agent:"ein-scout",task:"source"}])', cwd }, "audit", tracking, target);
				expect(launch?.cwd).toBe(source);
				const result: any = acceptTrackedScoutResult(tracking, "audit", { results: [1, 2, 3].map(() => ({ finalOutput: makeReport("app.vue"), cwd: outside })) }, false, target);
				expect(result.branches).toHaveLength(3);
				for (const branch of result.branches) expect(branch.report.references.map((ref: any) => ref.path)).toEqual([join(source, "app.vue"), join(target, "migration-plan.md")]);
				expect(tracking.size).toBe(0);
			}
			for (const path of ["../outside/secret.txt", join(outside, "secret.txt"), "escape/secret.txt", "missing.vue"]) {
				const tracking: ScoutTracking = new Map();
				normalizeScoutLaunch({ agent: "ein-scout", cwd: source }, "audit", tracking, target);
				const result: any = acceptTrackedScoutResult(tracking, "audit", { results: [{ finalOutput: makeReport(path) }] }, false, target);
				expect(result.findings).toEqual([{ claim: "plan", referenceIds: ["R2"] }]);
				expect(result.summary).not.toBe("Source and plan");
				expect(result.uncertainties.length).toBeGreaterThan(0);
			}
		} finally { rmSync(workspace, { recursive: true, force: true }); }
	});

	test("child restricts active tools and blocks mutation calls", () => {
		const handlers = new Map<string, Function>();
		let active: string[] = [];
		scoutChild({ on: (name: string, fn: Function) => handlers.set(name, fn), setActiveTools: (names: string[]) => { active = names; } } as any);
		handlers.get("session_start")!();
		expect(active).toEqual(["read", "grep", "find"]);
		for (const toolName of active) expect(handlers.get("tool_call")!({ toolName })).toBeUndefined();
		for (const toolName of ["write", "edit", "bash", "subagent", "ein_sdd_close"]) expect(handlers.get("tool_call")!({ toolName }).block).toBe(true);
	});
});
