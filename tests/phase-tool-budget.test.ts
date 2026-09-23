import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectDelegationItems } from "../ein-pi/agent/lib/delegation-shape.ts";
import { ensurePhaseContextBudget } from "../ein-pi/agent/lib/sdd-phase-context-budget.ts";

const DEFAULT_BUDGET = {
	hard: 30,
	soft: 24,
	block: ["read", "grep", "find", "ls", "bash"],
};
const ROOT = join(import.meta.dir, "..");

describe("phase tool budget", () => {
	test("gives direct map the effective runner budget and honest unit", () => {
		const input: Record<string, any> = { agent: "sdd-map", task: "map this" };
		const result = ensurePhaseContextBudget(input);
		expect(result).toMatchObject({ changed: true, allocations: [{ unit: "total_tool_calls_per_execution", toolBudget: DEFAULT_BUDGET }] });
		expect(input.toolBudget).toEqual(DEFAULT_BUDGET);
		expect(input.task).toContain('"max_tokens_guidance":15000');
		expect(input.task).toContain("counts every tool call in this execution");
		expect(input.task).not.toContain("Resuming this phase does not reset its consumption");
		expect(ensurePhaseContextBudget(input).changed).toBe(false);
	});

	test("injects equivalent budgets into static workflow children only", () => {
		const input = { workflowScript: `return runs.all([
			{key:"map",agent:"sdd-map",task:"map"},
			{key:"apply",agent:"sdd-apply",task:"apply"},
			{key:"design",agent:"sdd-design",task:"design"}
		])` };
		const result = ensurePhaseContextBudget(input);
		expect(result.allocations).toHaveLength(2);
		const items = collectDelegationItems(input);
		expect(items[0]?.toolBudget).toEqual(DEFAULT_BUDGET);
		expect(items[1]).toMatchObject({ agent: "sdd-apply", task: "apply" });
		expect(items[1]?.toolBudget).toBeUndefined();
		expect(items[2]?.toolBudget).toEqual(DEFAULT_BUDGET);
	});

	test("normalizes legacy max_reads and rejects conflicting or coerced values", () => {
		const legacy: Record<string, any> = { agent: "sdd-map", task: 'phase_budget: {"max_tokens":2000,"max_reads":5}' };
		ensurePhaseContextBudget(legacy);
		expect(legacy.toolBudget.hard).toBe(5);
		expect(legacy.task).toContain('"max_tool_calls":5');
		expect(() => ensurePhaseContextBudget({ agent: "sdd-map", task: 'phase_budget: {"max_tokens":2000,"max_reads":5,"max_tool_calls":6}' })).toThrow("must match");
		expect(() => ensurePhaseContextBudget({ agent: "sdd-map", task: 'phase_budget: {"max_tokens":"2000","max_tool_calls":5}' })).toThrow("positive integer");
	});

	test("narrows ordinary overrides and requires an explicit increase marker", () => {
		const narrow: Record<string, any> = { agent: "sdd-design", task: 'phase_budget: {"max_tokens":4000,"max_tool_calls":12}', toolBudget: { hard: 8, soft: 7, block: ["webfetch"] } };
		ensurePhaseContextBudget(narrow);
		expect(narrow.toolBudget).toEqual({ hard: 8, soft: 7, block: [...DEFAULT_BUDGET.block, "webfetch"] });
		expect(() => ensurePhaseContextBudget({ agent: "sdd-map", task: 'phase_budget: {"max_tokens":20000,"max_tool_calls":31}' })).toThrow("allowBudgetIncrease:true");
		const raised: Record<string, any> = { agent: "sdd-map", task: 'phase_budget: {"max_tokens":20000,"max_tool_calls":40}', allowBudgetIncrease: true };
		ensurePhaseContextBudget(raised);
		expect(raised.toolBudget).toMatchObject({ hard: 40, soft: 24 });
		expect(raised).not.toHaveProperty("allowBudgetIncrease");
	});

	test("retains an explicit block-all restriction and reports its persistence risk", () => {
		const input: Record<string, any> = { agent: "sdd-design", task: "design", toolBudget: { hard: 9, block: "*" } };
		const result = ensurePhaseContextBudget(input);
		expect(input.toolBudget).toEqual({ hard: 9, soft: 9, block: "*" });
		expect(result.allocations[0]?.warning).toContain("partial artifact");
	});

	test("workflow defaults remain a ceiling when phase budgets are materialized per child", () => {
		const input = {
			toolBudget: { hard: 5, soft: 3, block: "*" },
			workflowScript: `return runs.all([{key:"map",agent:"sdd-map",task:"map",toolBudget:{hard:9,soft:4,block:["webfetch"]}},{key:"design",agent:"sdd-design",task:"design"},{key:"worker",agent:"worker",task:"other"}])`,
		};
		ensurePhaseContextBudget(input);
		const items = collectDelegationItems(input);
		for (const item of items.slice(0, 2)) expect(item.toolBudget).toEqual({ hard: 5, soft: 3, block: "*" });
		expect(items[2]?.toolBudget).toBeUndefined();
		expect(input.toolBudget).toEqual({ hard: 5, soft: 3, block: "*" });
	});

	test("combines inherited and child restrictions without discarding either tool list", () => {
		const input = { toolBudget: { hard: 12, soft: 9, block: ["webfetch"] }, workflowScript: `return runs.run("map",{agent:"sdd-map",task:"map",toolBudget:{hard:6,soft:5,block:["write"]}})` };
		ensurePhaseContextBudget(input);
		expect(collectDelegationItems(input)[0]?.toolBudget).toEqual({ hard: 6, soft: 5, block: [...DEFAULT_BUDGET.block, "webfetch", "write"] });
	});

	test("does not change scouts or create a cross-invocation balance", () => {
		const scout = { agent: "ein-scout", task: "read", toolBudget: { hard: 3, block: "*" } };
		expect(ensurePhaseContextBudget(scout)).toEqual({ changed: false, allocations: [] });
		expect(scout.toolBudget).toEqual({ hard: 3, block: "*" });
		const first: Record<string, any> = { agent: "sdd-map", task: "continue from partial map.md" };
		const second: Record<string, any> = { agent: "sdd-map", task: "continue from partial map.md" };
		ensurePhaseContextBudget(first);
		ensurePhaseContextBudget(second);
		expect(second.toolBudget.hard).toBe(30);
		expect(second.task).toContain("new per-execution allocation");
	});

	test("policy names total calls, token guidance, and partial-artifact continuation honestly", () => {
		const policy = [
			"runtime/agents/sdd-map.md",
			"runtime/agents/sdd-design.md",
			"runtime/agents/sdd-scope.md",
			"runtime/assets/orchestrator.md",
		].map((path) => readFileSync(join(ROOT, path), "utf8")).join("\n");
		expect(policy).toContain("total tool calls");
		expect(policy).toContain("partial artifact");
		expect(policy).toContain("new per-execution allocation");
		expect(policy).toContain("not measured");
		expect(policy).not.toContain("Resuming this phase does not reset its consumption");
	});
});
