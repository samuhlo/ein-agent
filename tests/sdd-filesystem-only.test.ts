import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectSddSessionAnswers } from "../ein-pi/agent/lib/sdd-preflight.ts";
import { registerSddLifecycleTools } from "../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts";

test("session setup only asks how to execute the work", async () => {
	const questions: string[] = [];
	const result = await collectSddSessionAnswers({
		hasUI: true,
		ui: { select: async (title: string) => { questions.push(title); return "auto"; } },
	} as never);
	expect(questions).toEqual(["SDD execution mode"]);
	expect(result).toEqual({ executionMode: "auto", prompted: true });
});

test("artifact checking reports errors without writing notebook receipts", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "ein-check-readonly-"));
	const change = "read-only-check";
	const dir = join(cwd, "openspec", "changes", change);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "scope.md"), "# Scope\nUnfinished scope.\n");
	const legacyReceipt = join(dir, "memory-receipts.jsonl");
	writeFileSync(legacyReceipt, '{"status":"saved","historical":true}\n');
	const snapshot = () => Object.fromEntries(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), "utf8")]));
	const before = snapshot();
	const tools: Record<string, any> = {};
	registerSddLifecycleTools({ registerCommand() {} } as never, ((tool: any) => { tools[tool.name] = tool; }) as never);
	try {
		const check = tools.ein_sdd_check;
		expect(Object.keys(check.parameters.properties)).toEqual(["change", "phase"]);
		const result = await check.execute("check", { change }, undefined, undefined, { cwd });
		expect(result.details.errors).toBeGreaterThan(0);
		expect(result.details).not.toHaveProperty("memory");
		expect(snapshot()).toEqual(before);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});
