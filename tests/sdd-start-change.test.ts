import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeSddChange } from "../ein-pi/agent/lib/sdd-preflight-record.ts";
import { ensurePhaseContextBudget } from "../ein-pi/agent/lib/sdd-phase-context-budget.ts";
import { registerSddChangeSettings } from "../ein-pi/agent/extensions/internal/ein-sdd-change-settings.ts";
import { runPreflightCommand } from "../ein-cc/sdd-cli/cli.ts";

test("initializes an explicitly named change with both decisions before scope", () => {
	const cwd = mkdtempSync(join(tmpdir(), "ein-start-"));
	try {
		const stance = initializeSddChange(cwd, "new-change", "strict", "standard", "pi");
		expect(stance).toMatchObject({ tdd: "strict", lane: "standard", laneDeclared: true });
		const path = join(cwd, "openspec/changes/new-change/preflight.json");
		const before = readFileSync(path, "utf8");
		expect(initializeSddChange(cwd, "new-change", "strict", "standard", "claude").tdd).toBe("strict");
		expect(readFileSync(path, "utf8")).toBe(before);
		expect(() => initializeSddChange(cwd, "new-change", "off", "micro", "pi")).toThrow();
		expect(() => initializeSddChange(cwd, "../escape", "strict", "standard", "pi")).toThrow();
		expect(existsSync(join(cwd, "openspec/changes/new-change/scope.md"))).toBe(false);
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("each phase receives its own allocation, never the map's consumed balance", () => {
	const input = { agent: "sdd-design", task: "Map ledger: budget_consumed=14999; remaining=1" };
	expect(ensurePhaseContextBudget(input)).toBe(true);
	expect(input.task).toContain('"max_tokens":15000');
	expect(input.task).toContain("not a remaining balance");
	expect(ensurePhaseContextBudget(input)).toBe(false);
	const explicit = { agent: "sdd-map", task: 'phase_budget: {"max_tokens":2000,"max_reads":5}' };
	ensurePhaseContextBudget(explicit);
	expect(explicit.task).toContain('"max_tokens":2000,"max_reads":5');
	expect(ensurePhaseContextBudget({ agent: "ein-scout", task: "read" })).toBe(false);
});

test("the Pi tool and Claude CLI initialize explicitly; reads never create", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "ein-start-tools-"));
	const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
	registerSddChangeSettings(((spec: any) => tools.set(spec.name, spec)) as never);
	try {
		const execute = (params: object) => tools.get("ein_sdd_preflight")!.execute("test", params, undefined, undefined, { cwd });
		await execute({ change: "pi-change" });
		expect(existsSync(join(cwd, "openspec"))).toBe(false);
		await expect(execute({ change: "pi-change", create: true, tdd: "strict" })).rejects.toThrow();
		expect(existsSync(join(cwd, "openspec"))).toBe(false);
		const result = await execute({ change: "pi-change", create: true, tdd: "strict", lane: "standard" });
		expect(result.details).toMatchObject({ ok: true, tdd: "strict", lane: "standard" });
		expect(runPreflightCommand(cwd, ["cc-change", "--create", "--tdd", "off", "--lane", "micro"]).exitCode).toBe(0);
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});
