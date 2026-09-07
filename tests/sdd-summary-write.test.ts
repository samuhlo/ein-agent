import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as piSummaryWriter from "../ein-pi/agent/lib/sdd-summary-write.ts";
import * as sharedSummaryWriter from "../shared/sdd/sdd-summary-write.ts";
import { runSummaryCommand } from "../ein-cc/sdd-cli/cli.ts";
import { collectSddRemedies } from "../ein-pi/agent/lib/sdd-remedies.ts";
import { summaryContractErrors } from "../shared/sdd/sdd-summary-contract.ts";

const { writeSddSummary } = sharedSummaryWriter;

test("builds mechanical summary fields and rejects unsupported or stale verification", () => {
	const dir = join(cwd, "openspec/changes/probe");
	writeFileSync(join(dir, "tasks.md"), "status: ready\n## One\n- [x] first\n## Two\n- [x] second\n");
	writeFileSync(join(dir, "apply-progress.md"), "status: complete\n");
	writeFileSync(join(dir, "verify-report.md"), "status: pass\nExecuted: bun test\n");
	const request = { cwd, change: "probe", content: "## Resultado\nFecha validada.\n", commands: ["bun test"] };
	const result = sharedSummaryWriter.writeVerifiedSddSummary(request);
	expect(result.ok).toBe(true);
	const text = readFileSync(join(dir, "summary.md"), "utf8");
	expect(summaryContractErrors(text, "probe")).toEqual([]);
	expect(text).toContain("work_groups: 2");
	expect(text).toContain("- verify: bun test");
	expect(sharedSummaryWriter.writeVerifiedSddSummary({ ...request, commands: ["bun run build"] }).ok).toBe(false);
	expect(sharedSummaryWriter.writeVerifiedSddSummary({ ...request, commands: ["bun"] }).ok).toBe(false);
	const cli = runSummaryCommand(cwd, ["probe"], JSON.stringify({ content: request.content, commands: request.commands }));
	expect(cli.exitCode).toBe(0);
	writeFileSync(join(dir, "verify-report.md"), "status: fail\nbun test\n");
	expect(sharedSummaryWriter.writeVerifiedSddSummary(request).ok).toBe(false);
	writeFileSync(join(dir, "verify-report.md"), "status: pass\nbun test\n");
	utimesSync(join(dir, "verify-report.md"), new Date(1000), new Date(1000));
	expect(sharedSummaryWriter.writeVerifiedSddSummary(request).ok).toBe(false);
	expect(readFileSync(join(dir, "summary.md"), "utf8")).toBe(text);
});

test("normalizes an unbulleted verify marker without another authoring pass", () => {
	const content = "status: complete\nchange: probe\nwork_groups: 1\nverification_status: pass\n\n## Checks\nverify: bun test\n";
	expect(writeSddSummary({ cwd, change: "probe", content }).ok).toBe(true);
	expect(summaryContractErrors(readFileSync(join(cwd, "openspec/changes/probe/summary.md"), "utf8"), "probe")).toEqual([]);
});

let cwd: string;

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-summary-"));
	mkdirSync(join(cwd, "openspec", "changes", "probe"), { recursive: true });
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("writeSddSummary — deterministic persistence channel for sdd-close", () => {
	test("Pi and the shared owner expose the same implementation", () => {
		expect(piSummaryWriter.writeSddSummary).toBe(sharedSummaryWriter.writeSddSummary);
	});

	test("writes summary.md at the computed path when the change exists and content is non-empty", () => {
		const result = writeSddSummary({ cwd, change: "probe", content: "## // 000. RESUMEN\nOk.\n" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.path).toBe(join(cwd, "openspec", "changes", "probe", "summary.md"));
		expect(readFileSync(result.path, "utf8")).toBe("## // 000. RESUMEN\nOk.\n");
	});

	test("rejects a change that does not exist on disk", () => {
		const result = writeSddSummary({ cwd, change: "ghost", content: "content" });
		expect(result).toMatchObject({ ok: false, code: "no-change" });
	});

	test("rejects an unsafe change name (path traversal), not by accident of path joining", () => {
		const result = writeSddSummary({ cwd, change: "../escape", content: "content" });
		expect(result).toMatchObject({ ok: false, code: "invalid-change" });
	});

	test("rejects empty content", () => {
		const result = writeSddSummary({ cwd, change: "probe", content: "   \n" });
		expect(result).toMatchObject({ ok: false, code: "empty-content" });
	});
});

describe("runSummaryCommand — ein-cc-sdd summary <change> from stdin", () => {
	test("writes the file and returns exitCode 0 on the good path", () => {
		const result = runSummaryCommand(cwd, ["probe"], "## // 000. RESUMEN\nOk.\n");
		expect(result.exitCode).toBe(0);
		expect(readFileSync(join(cwd, "openspec", "changes", "probe", "summary.md"), "utf8")).toContain("RESUMEN");
	});

	test("returns exitCode 1 with actionable text on empty stdin", () => {
		const result = runSummaryCommand(cwd, ["probe"], "   ");
		expect(result.exitCode).toBe(1);
		expect(result.text.length).toBeGreaterThan(0);
	});
});

describe("collectSddRemedies — names the summary command for Claude when close is next", () => {
	test("mentions ein-cc-sdd summary when runtime is claude and the next phase is close", () => {
		const remedies = collectSddRemedies(
			{ specState: "synchronized", verifyStale: false, summaryStale: false, nextPhase: "close" },
			"claude",
		);
		expect(remedies.some((remedy) => remedy.fix.includes("ein-cc-sdd summary"))).toBe(true);
	});

	test("stays silent for the pi runtime, which already writes with `write`", () => {
		const remedies = collectSddRemedies(
			{ specState: "synchronized", verifyStale: false, summaryStale: false, nextPhase: "close" },
			"pi",
		);
		expect(remedies.some((remedy) => remedy.fix.includes("ein-cc-sdd summary"))).toBe(false);
	});
});
