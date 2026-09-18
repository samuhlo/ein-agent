import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	attachResolvedApplyTdd,
	decideApplyTurnBudget,
	extractApplyChange,
	parseResolvedApplyTdd,
	revalidateResolvedApplyTdd,
	resolveApplyTdd,
} from "../ein-pi/agent/lib/apply-tdd-contract.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-apply-tdd-"));
	roots.push(root);
	return root;
}

function preflight(root: string, change: string, tdd: unknown, extra: Record<string, unknown> = {}): void {
	const dir = join(root, "openspec", "changes", change);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "preflight.json"), JSON.stringify({ tdd, decidedBy: "pi", decidedAt: "2026-09-18T00:00:00.000Z", ...extra }));
}

function globalMode(root: string, mode: unknown): void {
	mkdirSync(join(root, ".pi", "ein"), { recursive: true });
	writeFileSync(join(root, ".pi", "ein", "tdd.json"), JSON.stringify({ mode }));
}

function config(root: string, source: string): void {
	mkdirSync(join(root, "openspec"), { recursive: true });
	writeFileSync(join(root, "openspec", "config.yaml"), source);
}

function contract(result: ReturnType<typeof resolveApplyTdd>) {
	expect(result.kind).toBe("resolved");
	if (result.kind !== "resolved") throw new Error("expected resolved TDD");
	return result.contract;
}

describe("resolved apply TDD precedence", () => {
	test("persisted strict/off wins over every structured or prose hint", () => {
		for (const persisted of ["strict", "off"] as const) {
			const root = project();
			preflight(root, "demo", persisted);
			globalMode(root, persisted === "strict" ? "off" : "strict");
			config(root, `strict_tdd: ${persisted === "strict" ? "false" : "true"}\nrules:\n  apply:\n    test_command: "bun test"\n`);
			for (const hint of [undefined, "strict", "off", "auto"]) {
				const result = contract(resolveApplyTdd({ cwd: root, task: "openspec/changes/demo/tasks.md\nSTRICT TDD MODE IS ACTIVE", structuredHint: hint }));
				expect(result).toMatchObject({ change: "demo", mode: persisted, source: "change" });
			}
		}
	});

	test("ad-hoc structured hint beats legacy prose and project setting, including auto", () => {
		const root = project();
		globalMode(root, "strict");
		config(root, "strict_tdd: false\n");
		expect(contract(resolveApplyTdd({ cwd: root, task: "STRICT TDD MODE IS ACTIVE", structuredHint: "off" }))).toMatchObject({ mode: "off", source: "delegation-field" });
		expect(contract(resolveApplyTdd({ cwd: root, task: "STRICT TDD MODE IS ACTIVE", structuredHint: "auto" }))).toMatchObject({ mode: "off", source: "project-auto" });
	});

	test("legacy text remains ad-hoc compatibility only", () => {
		const root = project();
		globalMode(root, "off");
		expect(contract(resolveApplyTdd({ cwd: root, task: "STRICT TDD MODE IS ACTIVE" }))).toMatchObject({ mode: "strict", source: "legacy-text" });
		preflight(root, "demo", "off");
		expect(contract(resolveApplyTdd({ cwd: root, task: "openspec/changes/demo/tasks.md\nSTRICT TDD MODE IS ACTIVE" }))).toMatchObject({ mode: "off", source: "change" });
	});

	test("an identified change never falls back to another active/global stance", () => {
		const root = project();
		mkdirSync(join(root, "openspec", "changes", "missing-decision"), { recursive: true });
		preflight(root, "other", "strict");
		globalMode(root, "off");
		expect(resolveApplyTdd({ cwd: root, task: "change: missing-decision" })).toMatchObject({ kind: "needs-decision", reason: "change-stance-missing" });
	});

	test("multiple changes in one task are rejected", () => {
		expect(extractApplyChange("openspec/changes/one/tasks.md\nchange: two")).toMatchObject({ kind: "invalid" });
	});
});

describe("fail-closed configuration", () => {
	test("absent global setting is off; invalid JSON/mode is invalid", () => {
		const root = project();
		expect(contract(resolveApplyTdd({ cwd: root, task: "implement" }))).toMatchObject({ mode: "off", source: "project-setting" });
		mkdirSync(join(root, ".pi", "ein"), { recursive: true });
		writeFileSync(join(root, ".pi", "ein", "tdd.json"), "{");
		expect(resolveApplyTdd({ cwd: root, task: "implement" })).toMatchObject({ kind: "invalid" });
		globalMode(root, "surprise");
		expect(resolveApplyTdd({ cwd: root, task: "implement" })).toMatchObject({ kind: "invalid" });
	});

	test("auto accepts only a root boolean and resolves true/false/absent", () => {
		const root = project();
		globalMode(root, "auto");
		expect(contract(resolveApplyTdd({ cwd: root, task: "implement" }))).toMatchObject({ mode: "off", source: "project-auto", configEvidence: { state: "absent" } });
		config(root, "strict_tdd: false # explicit\r\n");
		expect(contract(resolveApplyTdd({ cwd: root, task: "implement" }))).toMatchObject({ mode: "off", configEvidence: { state: "present" } });
		config(root, "strict_tdd: true\nrules:\n  apply:\n    test_command: \"bun test tests/unit.test.ts\"\n");
		expect(contract(resolveApplyTdd({ cwd: root, task: "implement" }))).toMatchObject({ mode: "strict", testCommand: "bun test tests/unit.test.ts" });
	});

	test("strict auto without test command needs a decision without downgrading", () => {
		const root = project();
		config(root, "strict_tdd: true\n");
		const result = resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "auto" });
		expect(result).toMatchObject({ kind: "needs-decision", reason: "missing-test-command", candidate: { mode: "strict", source: "project-auto" } });
	});

	test("duplicates, aliases, scalars and unsupported key forms are invalid", () => {
		for (const source of [
			"strict_tdd: true\nstrict_tdd: false\n",
			"strict_tdd: &strict true\n",
			"strict_tdd: yes\n",
			"\"strict_tdd\": true\n",
		]) {
			const root = project();
			config(root, source);
			expect(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "auto" })).toMatchObject({ kind: "invalid" });
		}
	});

	test("indented, commented and multiline strict_tdd text is not a root declaration", () => {
		const root = project();
		config(root, "# strict_tdd: true\ncontext: |\n  strict_tdd: true\nrules:\n");
		expect(contract(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "auto" }))).toMatchObject({ mode: "off" });
	});

	test("persisted auto/ask is invalid rather than an auto fallback", () => {
		for (const value of ["auto", "ask", "other"]) {
			const root = project();
			preflight(root, "demo", value);
			config(root, "strict_tdd: false\n");
			expect(resolveApplyTdd({ cwd: root, task: "change: demo" })).toMatchObject({ kind: "invalid" });
		}
	});
});

describe("transport, freshness and budget capability", () => {
	test("gateway replaces supplied contracts with one generated line", () => {
		const root = project();
		const effective = contract(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "off" }));
		const task = attachResolvedApplyTdd("implement\nein_effective_tdd: {}\nein_effective_tdd: {}", effective);
		expect(task.match(/^ein_effective_tdd:/gm)).toHaveLength(1);
		expect(parseResolvedApplyTdd(task)).toEqual({ kind: "resolved", contract: effective });
	});

	test("change and auto fingerprints block changed evidence but survive rereads", () => {
		const root = project();
		preflight(root, "demo", "strict");
		const persisted = contract(resolveApplyTdd({ cwd: root, task: "change: demo" }));
		expect(revalidateResolvedApplyTdd(root, persisted)).toEqual({ current: true });
		preflight(root, "demo", "off");
		expect(revalidateResolvedApplyTdd(root, persisted)).toMatchObject({ current: false });

		config(root, "strict_tdd: false\n");
		const automatic = contract(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "auto" }));
		config(root, "strict_tdd: true\nrules:\n  apply:\n    test_command: \"bun test\"\n");
		expect(revalidateResolvedApplyTdd(root, automatic)).toMatchObject({ current: false });
	});

	test("strict skips only the automatic cap; explicit restrictions remain visible and unsupported caps are honest", () => {
		const root = project();
		const strict = contract(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "strict" }));
		const off = contract(resolveApplyTdd({ cwd: root, task: "implement", structuredHint: "off" }));
		expect(decideApplyTurnBudget(strict, undefined)).toEqual({ status: "not-applicable" });
		expect(decideApplyTurnBudget(off, undefined)).toMatchObject({ status: "unavailable" });
		expect(decideApplyTurnBudget(strict, { maxTurns: 5 })).toMatchObject({ status: "unavailable", turnBudget: { maxTurns: 5 } });
		expect(decideApplyTurnBudget(off, undefined, true)).toMatchObject({ status: "automatic", turnBudget: { maxTurns: 60, graceTurns: 3 } });
	});
});
