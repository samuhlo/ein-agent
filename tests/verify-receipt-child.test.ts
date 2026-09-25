import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import verificationReceipt from "../ein-pi/agent/extensions/internal/ein-verify-receipt-child.ts";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-verify-child-"));
	roots.push(cwd);
	execFileSync("git", ["init", "-q"], { cwd });
	mkdirSync(join(cwd, "src"));
	writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
	execFileSync("git", ["add", "src/a.ts"], { cwd });
	const changePath = join(cwd, "openspec/changes/probe");
	mkdirSync(changePath, { recursive: true });
	writeFileSync(join(changePath, "tasks.md"), "status: ready\n- [x] done\n");
	let tool: { execute: (...args: any[]) => Promise<any> } | undefined;
	verificationReceipt({ registerTool(value: typeof tool) { tool = value; } } as never);
	if (!tool) throw new Error("tool not registered");
	const execute = (params: Record<string, unknown>) => tool!.execute("id", params, undefined, undefined, { cwd });
	return { cwd, changePath, execute };
}

describe("ein_sdd_verification", () => {
	test("begin y finish reales escriben informe y recibo", async () => {
		const box = fixture();
		const begun = await box.execute({ action: "begin", change: "probe" });
		expect(begun.isError).toBe(false);
		const token = begun.details.value.token as string;
		const finished = await box.execute({ action: "finish", change: "probe", token, content: "status: pass\nbehavior_coverage: verified\n" });
		expect(finished.isError).toBe(false);
		expect(readFileSync(join(box.changePath, "verify-report.md"), "utf8")).toContain("status: pass");
		expect(JSON.parse(readFileSync(join(box.changePath, "verification-receipt.json"), "utf8")).outcome).toBe("pass");
	});

	test("rechaza argumentos, cambio ad-hoc y decisiones alteradas", async () => {
		const box = fixture();
		expect((await box.execute({ action: "begin", change: "../escape" })).details.code).toBe("invalid-arguments");
		expect((await box.execute({ action: "begin", change: "absent" })).details.code).toBe("invalid-change");
		const begun = await box.execute({ action: "begin", change: "probe" });
		writeFileSync(join(box.changePath, "tasks.md"), "changed\n");
		const finished = await box.execute({ action: "finish", change: "probe", token: begun.details.value.token, content: "status: pass\nbehavior_coverage: verified\n" });
		expect(finished.details.code).toBe("verification-stale");
	});

	test("does not start expensive checks while a spec delta is pending synchronization", async () => {
		const box = fixture();
		const delta = join(box.changePath, "specs", "academia");
		mkdirSync(delta, { recursive: true });
		writeFileSync(join(delta, "spec.md"), "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: academia\n\n## ADDED\n### Scenario: course\ntitle: Course\nrequirement: The system MUST create a course\nGiven: an admin\nWhen: creating\nThen: it exists\n");
		const begun = await box.execute({ action: "begin", change: "probe" });
		expect(begun.details).toMatchObject({ ok: false, code: "spec-not-synchronized" });
	});
});
