import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { budgetParentOutput, PARENT_OUTPUT_LIMIT_BYTES, registerParentOutputBudget } from "../ein-pi/agent/lib/parent-output-budget.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root(): string { const path = mkdtempSync(join(tmpdir(), "ein-parent-output-")); roots.push(path); return path; }

describe("parent output budget", () => {
	test("keeps a large read recoverable and gives the parent a bounded, honest receipt", () => {
		const sessionDir = root();
		const original = "line of source\n".repeat(1_200);
		const result = budgetParentOutput({ toolName: "read", content: [{ type: "text", text: original }], sessionDir });
		expect(result).toBeDefined();
		expect(result!.deliveredBytes).toBeLessThan(PARENT_OUTPUT_LIMIT_BYTES);
		expect(result!.originalBytes).toBe(Buffer.byteLength(original));
		const path = result!.content[0]!.text.match(/Full output: ([^\n]+)/)?.[1];
		expect(path).toBeDefined();
		expect(readFileSync(path!, "utf8")).toBe(original);
		expect(result!.content[0]!.text).toContain("not verified");
		const unicode = budgetParentOutput({ toolName: "read", content: [{ type: "text", text: "🟢".repeat(3_000) }], sessionDir });
		expect(unicode!.deliveredBytes).toBeLessThan(PARENT_OUTPUT_LIMIT_BYTES);
	});

	test("small, error, unrelated, and non-text results retain their original semantics", () => {
		const sessionDir = root();
		for (const toolName of ["read", "ctx_execute_file", "bash"]) {
			expect(budgetParentOutput({ toolName, content: [{ type: "text", text: "small error" }], sessionDir })).toBeUndefined();
		}
		expect(budgetParentOutput({ toolName: "ein_sdd_verification", content: [{ type: "text", text: "x".repeat(12_000) }], sessionDir })).toBeUndefined();
		expect(budgetParentOutput({ toolName: "read", content: [{ type: "image" }], sessionDir })).toBeUndefined();
	});

	test("large bash output is recoverable without changing its error status", () => {
		const original = "error detail\n".repeat(1_000);
		const result = budgetParentOutput({ toolName: "bash", content: [{ type: "text", text: original }], sessionDir: root() });
		expect(result).toBeDefined();
		expect(result!.deliveredBytes).toBeLessThan(PARENT_OUTPUT_LIMIT_BYTES);
		expect(result!.content[0]!.text).toContain("Preview (end only):");
	});

	test("runtime hook applies only to the interactive parent and preserves isError", () => {
		let hook: ((event: any, ctx: any) => any) | undefined;
		registerParentOutputBudget({ on: (_name: string, handler: any) => { hook = handler; } } as never);
		const content = [{ type: "text", text: "failure\n".repeat(1_000) }];
		const ctx = { hasUI: false, sessionManager: { getSessionDir: root, getSessionId: () => "session" } };
		const result = hook!({ toolName: "ctx_execute_file", toolCallId: "t1", isError: true, content }, ctx);
		expect(result.content[0].text).toContain("Full output:");
		expect(result.isError).toBeUndefined(); // Pi retains the original error flag.
		const previous = process.env.PI_SUBAGENT_CHILD;
		process.env.PI_SUBAGENT_CHILD = "1";
		try { expect(hook!({ toolName: "read", toolCallId: "t2", isError: false, content }, ctx)).toBeUndefined(); }
		finally {
			if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD;
			else process.env.PI_SUBAGENT_CHILD = previous;
		}
	});
});
