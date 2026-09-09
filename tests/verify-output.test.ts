import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import register, { isSimpleCheck } from "../ein-pi/agent/extensions/internal/ein-verify-output-child.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
	const root = mkdtempSync(join(tmpdir(), "ein-verify-output-")); roots.push(root);
	let handle: any;
	register({ on(name: string, handler: any) { expect(name).toBe("tool_result"); handle = handler; } } as any);
	const text = ["runner started", ...Array.from({ length: 500 }, (_, i) => `(pass) behavior ${i} exercised correctly`), "500 pass", "0 fail"].join("\n");
	const event = { toolName: "bash", toolCallId: "../call", input: { command: "bun test tests/behavior.test.ts" }, isError: false, content: [{ type: "text", text }], details: undefined as any };
	const ctx = { sessionManager: { getSessionFile: () => join(root, "session.jsonl") } };
	return { root, handle, event, ctx };
}

describe("verify-only native check output", () => {
	test("saves the exact full log, preserves metadata and labels the reduced result without a verdict", () => {
		const { handle, event, ctx } = fixture();
		event.details = { arbitrary: "preserved" };
		const result = handle(event, ctx);
		const text = result.content[0].text;
		const path = text.match(/Full log: (.*)\]/)[1];
		expect(readFileSync(path, "utf8")).toBe(event.content[0].text);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(text.length).toBeLessThan(event.content[0].text.length / 3);
		expect(text).toContain("omitted lines are not evidence of passing");
		expect(text).toContain("500 pass");
		expect(result.details).toBe(event.details);
		expect(result.isError).toBeUndefined();
	});

	test("retains middle warnings, skip/no-tests and coverage signals even on exit zero", () => {
		const { handle, event, ctx } = fixture();
		event.content[0].text = event.content[0].text.replace("(pass) behavior 250 exercised correctly", "\u001b[31mWARNING: partial coverage\u001b[0m\n3 skipped tests\nNo tests found\n0 tests executed\nFAIL: soft failure\n  diagnostic continuation");
		const text = handle(event, ctx).content[0].text;
		for (const signal of ["WARNING: partial coverage", "3 skipped tests", "No tests found", "0 tests executed", "FAIL: soft failure"]) expect(text).toContain(signal);
		expect(text).toContain("diagnostic continuation");
	});

	test("all failed commands and arbitrary/composed shell output are untouched", () => {
		const { handle, event, ctx } = fixture();
		expect(handle({ ...event, isError: true }, ctx)).toBeUndefined();
		expect(handle({ ...event, isError: undefined }, ctx)).toBeUndefined();
		for (const command of ["cat source.ts", "git diff", "bun test && bun run build", "bun test; true", "bun test | tail", "bun test\necho ok", "bun test $(cat file)", "echo 'bun test'"]) {
			expect(isSimpleCheck(command)).toBe(false);
			expect(handle({ ...event, input: { command } }, ctx)).toBeUndefined();
		}
	});
	test("does not apply a second preview to a verified Headroom result", () => {
		const { handle, event, ctx } = fixture();
		event.content[0].text = "[Ein Headroom: all rows verified]\n" + event.content[0].text;
		expect(handle(event, ctx)).toBeUndefined();
	});

	test("reuses the native full log instead of saving its truncated tail as complete", () => {
		const { root, handle, event, ctx } = fixture();
		const fullOutputPath = join(root, "native.log"); writeFileSync(fullOutputPath, "real original full log");
		event.details = { truncation: { truncated: true }, fullOutputPath };
		expect(handle(event, ctx).content[0].text).toContain(`Full log: ${fullOutputPath}`);
		expect(readFileSync(fullOutputPath, "utf8")).toBe("real original full log");
		for (const details of [{ truncation: {} }, { fullOutputPath: "/missing/log" }, { fullOutputPath: root }, { fullOutputPath: "relative.log" }]) {
			expect(handle({ ...event, details }, ctx)).toBeUndefined();
		}
	});

	test("storage failure, short output, many diagnostics and mixed media fall back unchanged", () => {
		const { root, handle, event, ctx } = fixture();
		const file = join(root, "file"); writeFileSync(file, "not a directory");
		for (const path of [undefined, "relative", join(file, "session.jsonl")]) {
			expect(handle(event, { sessionManager: { getSessionFile: () => path } })).toBeUndefined();
		}
		for (const text of ["1 pass\n0 fail", "WARNING: important diagnostic\n".repeat(500)]) {
			expect(handle({ ...event, content: [{ type: "text", text }] }, ctx)).toBeUndefined();
		}
		expect(handle({ ...event, content: [...event.content, { type: "image", data: "" }] }, ctx)).toBeUndefined();
	});
});
