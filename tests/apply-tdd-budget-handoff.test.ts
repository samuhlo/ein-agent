import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerAgentPromptHook } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";
import { parseWorkflowScriptDelegations } from "../ein-pi/agent/lib/delegation-shape.ts";
import { parseResolvedApplyTdd } from "../ein-pi/agent/lib/apply-tdd-contract.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-tdd-handoff-"));
	roots.push(root);
	return root;
}

function writePreflight(root: string, change: string, tdd: unknown): void {
	const dir = join(root, "openspec", "changes", change);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "preflight.json"), JSON.stringify({ tdd, decidedBy: "pi", decidedAt: "2026-09-18T10:00:00.000Z" }));
}

function writeGlobal(root: string, mode: string): void {
	mkdirSync(join(root, ".pi", "ein"), { recursive: true });
	writeFileSync(join(root, ".pi", "ein", "tdd.json"), JSON.stringify({ mode }));
}

function writeConfig(root: string, source: string): void {
	mkdirSync(join(root, "openspec"), { recursive: true });
	writeFileSync(join(root, "openspec", "config.yaml"), source);
}

function gateHarness(root: string, picked: "off" | "strict" = "off") {
	const handlers = new Map<string, Function>();
	const notifications: string[] = [];
	const snapshots: unknown[] = [];
	registerToolCallGate({
		on: (name: string, fn: Function) => handlers.set(name, fn),
		appendEntry() {},
	} as never, {
		scoutTracking: new Map() as never,
		rememberPhaseRun: (reference) => snapshots.push(structuredClone(reference)),
	});
	const ctx = {
		cwd: root,
		hasUI: true,
		ui: { notify: (message: string) => notifications.push(message), select: async () => picked },
		sessionManager: { getSessionId: () => `parent-${root}` },
	};
	return {
		notifications,
		snapshots,
		gate: (input: Record<string, unknown>) => handlers.get("tool_call")!({ toolName: "subagent", toolCallId: "apply-1", input }, ctx),
	};
}

function childHarness(root: string, entries: readonly unknown[] = []) {
	const handlers = new Map<string, Function>();
	registerAgentPromptHook({ on: (name: string, fn: Function) => handlers.set(name, fn) } as never);
	const ctx = { cwd: root, hasUI: false, sessionManager: { getSessionId: () => `child-${root}`, getBranch: () => entries } };
	return {
		start: (task: string) => handlers.get("before_agent_start")!({ agentName: "sdd-apply", task, prompt: task, systemPrompt: "You are the SDD apply executor for Ein." }, ctx),
		tool: () => handlers.get("tool_call")!({ toolName: "write", input: { path: "src/a.ts", content: "x" } }, ctx),
	};
}

function revivedTask(message: string): string {
	return `You are reviving a previous subagent conversation.\n\nOriginal run: fixture-run\nOriginal agent: sdd-apply\nOriginal session file: /tmp/fixture.jsonl\n\nUse the stored session context as background. Answer the orchestrator's follow-up below. Do not assume the original child session is still running.\n\nFollow-up:\n${message}`;
}

function originalTaskEntry(task: string): unknown {
	return { type: "message", message: { role: "user", content: [{ type: "text", text: task }] } };
}

describe("parent and child share one resolved apply TDD contract", () => {
	test("persisted strict needs no marker and receives no automatic turn cap", async () => {
		const root = project();
		writePreflight(root, "demo", "strict");
		const h = gateHarness(root);
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nImplement the bounded slice." };
		expect(await h.gate(input)).toBeUndefined();
		expect(input.turnBudget).toBeUndefined();
		expect(input.maxRuntimeMs).toBe(1_800_000);
		const transported = parseResolvedApplyTdd(String(input.task));
		expect(transported).toMatchObject({ kind: "resolved", contract: { mode: "strict", source: "change" } });
		const rendered = await childHarness(root).start(String(input.task));
		expect(rendered.systemPrompt).toContain("Strict TDD: ON (forced)");
		expect(rendered.systemPrompt).toContain("Runner turn limits are unavailable");
	});

	test("persisted off beats strict prose and does not claim a 60+3 cap", async () => {
		const root = project();
		writePreflight(root, "demo", "off");
		const h = gateHarness(root);
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nSTRICT TDD MODE IS ACTIVE" };
		expect(await h.gate(input)).toBeUndefined();
		expect(input.turnBudget).toBeUndefined();
		expect(parseResolvedApplyTdd(String(input.task))).toMatchObject({ kind: "resolved", contract: { mode: "off", source: "change" } });
		expect(h.notifications).toContain("Apply: límite de turnos no disponible en el runner; maxRuntimeMs sigue activo.");
	});

	test("a preflight decision made in this gate controls the same launch", async () => {
		const root = project();
		mkdirSync(join(root, "openspec", "changes", "demo"), { recursive: true });
		writeGlobal(root, "ask");
		const h = gateHarness(root, "strict");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nImplement." };
		expect(await h.gate(input)).toBeUndefined();
		expect(parseResolvedApplyTdd(String(input.task))).toMatchObject({ kind: "resolved", contract: { mode: "strict", source: "change" } });
	});

	test("a new child session reuses the persisted decision without marker or question", async () => {
		const root = project();
		writePreflight(root, "demo", "strict");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nResume." };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		expect((await childHarness(root).start(String(input.task))).systemPrompt).toContain("Strict TDD: ON (forced)");
		expect((await childHarness(root).start(String(input.task))).systemPrompt).toContain("Strict TDD: ON (forced)");
	});

	test("changing persisted stance after preparation blocks tools before writing", async () => {
		const root = project();
		writePreflight(root, "demo", "strict");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nImplement." };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		writePreflight(root, "demo", "off");
		const child = childHarness(root);
		const rendered = await child.start(String(input.task));
		expect(rendered.systemPrompt).toContain("Execution blocked");
		expect(rendered.systemPrompt).toContain("changed after delegation preparation");
		expect(await child.tool()).toMatchObject({ block: true });
	});

	test("changing auto config after preparation blocks before writing", async () => {
		const root = project();
		writeConfig(root, "strict_tdd: false\n");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "Implement.", tdd: "auto" };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		writeConfig(root, "strict_tdd: true\nrules:\n  apply:\n    test_command: \"bun test\"\n");
		const child = childHarness(root);
		expect((await child.start(String(input.task))).systemPrompt).toContain("Execution blocked");
		expect(await child.tool()).toMatchObject({ block: true });
	});

	test("mixed workflow resolves each apply independently", async () => {
		const root = project();
		writePreflight(root, "one", "strict");
		writePreflight(root, "two", "off");
		const input: Record<string, unknown> = { workflowScript: `return runs.all([
			{key:"one",agent:"sdd-apply",task:"change: one\\nImplement one."},
			{key:"two",agent:"sdd-apply",task:"change: two\\nImplement two."}
		])` };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		const modes = parseWorkflowScriptDelegations(String(input.workflowScript)).map((item) => {
			const parsed = parseResolvedApplyTdd(item.task);
			return parsed.kind === "resolved" ? parsed.contract.mode : "missing";
		});
		expect(modes).toEqual(["strict", "off"]);
		expect(String(input.workflowScript)).not.toContain("turnBudget");
	});

	test("resolves persisted stance in the child's declared cwd for direct and workflow launches", async () => {
		const parent = project();
		const target = join(parent, "target");
		writePreflight(parent, "demo", "off");
		writePreflight(target, "demo", "strict");
		for (const input of [
			{ agent: "sdd-apply", cwd: "target", task: "change: demo\nImplement." },
			{ cwd: "target", workflowScript: `return runs.run("apply",{agent:"sdd-apply",task:"change: demo\\nImplement."})` },
			{ workflowScript: `return runs.run("apply",{agent:"sdd-apply",cwd:"target",task:"change: demo\\nImplement."})` },
		] as Record<string, unknown>[]) {
			expect(await gateHarness(parent).gate(input)).toBeUndefined();
			const task = input.workflowScript ? parseWorkflowScriptDelegations(String(input.workflowScript))[0]!.task : String(input.task);
			expect(parseResolvedApplyTdd(task)).toMatchObject({ kind: "resolved", contract: { mode: "strict", source: "change" } });
			expect((await childHarness(target).start(task)).systemPrompt).not.toContain("Execution blocked");
		}
	});

	test("unsupported explicit turn restrictions block instead of being dropped", async () => {
		const root = project();
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "Implement.", tdd: "strict", turnBudget: { maxTurns: 5 } };
		const result = await gateHarness(root).gate(input);
		expect(result).toMatchObject({ block: true });
		expect(String(result.reason)).toContain("cannot be guaranteed");
		expect(input.turnBudget).toEqual({ maxTurns: 5 });

		const workflow: Record<string, unknown> = {
			workflowScript: `return runs.run("apply", {agent:"sdd-apply",task:"Implement.",tdd:"off"})`,
			turnBudget: { maxTurns: 4 },
		};
		expect(await gateHarness(root).gate(workflow)).toMatchObject({ block: true });
		expect(workflow.turnBudget).toEqual({ maxTurns: 4 });
	});
});

describe("ad-hoc compatibility", () => {
	test("native async resume reuses the first apply contract; a changed choice uses a bounded new launch", async () => {
		const root = project();
		writeGlobal(root, "ask");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "Fix the migrator error.code handling.", tdd: "off" };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		const child = childHarness(root, [originalTaskEntry(String(input.task))]);
		const resumed = await child.start(revivedTask("Continue the missing error.code fix."));
		expect(resumed.systemPrompt).toContain("Strict TDD: OFF");
		expect(resumed.systemPrompt).not.toContain("Execution blocked");
		expect(await child.tool()).toBeUndefined();
		const continuation: Record<string, unknown> = { agent: "sdd-apply", task: "Continue the existing migrator diff: reproduce error.code, fix it, then verify.", tdd: "strict" };
		expect(await gateHarness(root).gate(continuation)).toBeUndefined();
		const changed = await child.start(String(continuation.task));
		expect(changed.systemPrompt).toContain("Strict TDD: ON (forced)");
		expect(changed.systemPrompt).not.toContain("Execution blocked");
		expect(await child.tool()).toBeUndefined();
	});

	test("resume checks the persisted change stance again before allowing writes", async () => {
		const root = project();
		writePreflight(root, "demo", "strict");
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "change: demo\nFix the remaining assertion." };
		expect(await gateHarness(root).gate(input)).toBeUndefined();
		const child = childHarness(root, [originalTaskEntry(String(input.task))]);
		expect((await child.start(revivedTask("Continue the fix."))).systemPrompt).toContain("Strict TDD: ON (forced)");
		writePreflight(root, "demo", "off");
		const rejected = await child.start(revivedTask("Continue the fix."));
		expect(rejected.systemPrompt).toContain("Execution blocked");
		expect(await child.tool()).toMatchObject({ block: true });
	});

	test("structured and legacy hints resolve without creating SDD state", async () => {
		for (const input of [
			{ agent: "sdd-apply", task: "Implement.", tdd: "strict" },
			{ agent: "sdd-apply", task: "STRICT TDD MODE IS ACTIVE. Implement." },
		]) {
			const root = project();
			const before = readdirSync(root);
			expect(await gateHarness(root).gate(input)).toBeUndefined();
			expect(parseResolvedApplyTdd(String(input.task))).toMatchObject({ kind: "resolved", contract: { mode: "strict" } });
			expect(readdirSync(root)).toEqual(before);
		}
	});

	test("legacy direct child launch is explicit about missing budget coordination", async () => {
		const root = project();
		const rendered = await childHarness(root).start("STRICT TDD MODE IS ACTIVE. Implement.");
		expect(rendered.systemPrompt).toContain("Legacy direct launch");
	});

	test("invalid global config and strict auto without a test command block", async () => {
		const invalid = project();
		mkdirSync(join(invalid, ".pi", "ein"), { recursive: true });
		writeFileSync(join(invalid, ".pi", "ein", "tdd.json"), "{");
		expect(await gateHarness(invalid).gate({ agent: "sdd-apply", task: "Implement." })).toMatchObject({ block: true });

		const noCommand = project();
		writeConfig(noCommand, "strict_tdd: true\n");
		expect(await gateHarness(noCommand).gate({ agent: "sdd-apply", task: "Implement.", tdd: "auto" })).toMatchObject({ block: true });
	});
});
