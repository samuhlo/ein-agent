import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function harness() {
	const root = mkdtempSync(join(tmpdir(), "ein-delegation-gate-"));
	roots.push(root);
	const handlers = new Map<string, Function>();
	const appended: unknown[] = [];
	const snapshots: unknown[] = [];
	const scoutTracking = new Map<string, unknown>();
	registerToolCallGate({
		on(name: string, handler: Function) { handlers.set(name, handler); },
		appendEntry(_type: string, value: unknown) { appended.push(value); },
	} as never, {
		scoutTracking: scoutTracking as never,
		rememberPhaseSnapshot(_id: string, input: unknown) { snapshots.push(structuredClone(input)); },
	});
	const ctx = {
		cwd: root,
		hasUI: false,
		ui: { notify() {}, select: async () => "off" },
		sessionManager: { getSessionId: () => "delegation-gate-test", getBranch: () => [] },
	};
	const gate = (input: Record<string, unknown>, id = "call-1") => handlers.get("tool_call")!({ toolName: "subagent", toolCallId: id, input }, ctx);
	return { appended, gate, root, scoutTracking, snapshots };
}

describe("delegation admission gate", () => {
	test("blocks dynamic and mixed workflows before every downstream effect", async () => {
		for (const input of [
			{ workflowScript: `return runs.run("dynamic", { agent: chosenAgent, task: "write code" })` },
			{ workflowScript: `return runs.all([{ key:"known",agent:"sdd-apply",task:"write A" },{ key:"dynamic",agent:chosenAgent,task:"write B" }])` },
		]) {
			const h = harness();
			const result = await h.gate(input);
			expect(result).toMatchObject({ block: true });
			expect(String(result.reason)).toContain("delegation-shape-unsupported");
			expect(h.appended).toEqual([]);
			expect(h.snapshots).toEqual([]);
			expect(h.scoutTracking.size).toBe(0);
		}
	});

	test("blocks every legacy array before grants, persistence, or launch tracking", async () => {
		for (const key of ["tasks", "steps", "chain"]) {
			const h = harness();
			const result = await h.gate({ [key]: [{ agent: "ein-git", task: "push branch" }] });
			expect(result).toMatchObject({ block: true });
			expect(String(result.reason)).toContain("legacy-delegation-reissue-required");
			expect(String(result.reason)).toContain("existing authorization");
			expect(h.appended).toEqual([]);
			expect(h.snapshots).toEqual([]);
			expect(h.scoutTracking.size).toBe(0);
		}
	});

	test("allows literal status without execution policy effects", async () => {
		const h = harness();
		expect(await h.gate({ workflowScript: `return runs.status("run-1")` })).toBeUndefined();
		expect(await h.gate({ action: "get", agent: "ein-git" })).toBeUndefined();
		expect(h.appended).toEqual([]);
		expect(h.snapshots).toEqual([]);
		expect(h.scoutTracking.size).toBe(0);
	});

	test("forwards valid public output options through the full launch gate", async () => {
		const h = harness();
		const input = { agent: "worker", task: "inspect", outputMode: "inline", outputSchema: false, acceptance: false };
		expect(await h.gate(input)).toBeUndefined();
		expect(h.snapshots[0]).toMatchObject({ outputMode: "inline", outputSchema: false, acceptance: false });
	});

	test("normalizes a valid single and records one admitted snapshot", async () => {
		const h = harness();
		const input: Record<string, unknown> = { agent: "worker", task: "read the bounded file", tdd: "off" };
		expect(await h.gate(input)).toBeUndefined();
		expect(input.tdd).toBeUndefined();
		expect(input.acceptance).toMatchObject({ level: "none" });
		expect(h.snapshots).toHaveLength(1);
		expect(h.appended).toEqual([]);
	});

	test("keeps a valid three-scout fan-out and tracks its launcher once", async () => {
		const h = harness();
		const input: Record<string, unknown> = {
			workflowScript: `return runs.all([
				{key:"api",agent:"ein-scout",task:"read API"},
				{key:"tests",agent:"ein-scout",task:"read tests"},
				{key:"docs",agent:"ein-scout",task:"read docs"}
			])`,
		};
		expect(await h.gate(input, "scout-call")).toBeUndefined();
		expect(h.scoutTracking.has("scout-call")).toBe(true);
		expect(input.async).toBe(false);
		expect(input.workflowScript).toContain("runs.all");
		expect(input.workflowScript).not.toContain("turnBudget");
	});
});
