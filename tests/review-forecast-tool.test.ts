import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { registerSddReadSurface } from "../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts";
import { registerAgentPromptHook } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { reviewForecast } from "../ein-pi/agent/lib/review-forecast.ts";
import { receiptFor } from "../ein-pi/agent/lib/tool-receipts.ts";

test("the actual Pi tool and Claude CLI measure identical requests without project writes", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "review-tool-"));
	try {
		execFileSync("git", ["init", "-q"], { cwd });
		execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.test", "commit", "--allow-empty", "-qm", "base"], { cwd });
		writeFileSync(join(cwd, "new.ts"), "new\n");
		let tool: any;
		registerSddReadSurface({ registerCommand() {}, events: { on() {}, emit() {} } } as never,
			((definition: any) => { if (definition.name === "ein_review_forecast") tool = definition; }) as never);
		const request = { mode: "working-tree", base: "HEAD" } as const;
		const before = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
		const result = await tool.execute("test", request, undefined, undefined, { cwd, hasUI: false });
		const expected = reviewForecast(cwd, request);
		expect(result.details).toMatchObject(expected); expect(result.details.decision).toBe("within");
		const cli = spawnSync(process.execPath, [resolve(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "review-forecast"], { cwd, encoding: "utf8", input: JSON.stringify(request) });
		expect(cli.status).toBe(0); expect(JSON.parse(cli.stdout)).toMatchObject(expected);
		expect(execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" })).toBe(before);
		expect(readFileSync(join(cwd, "new.ts"), "utf8")).toBe("new\n");
		const unknown = await tool.execute("bad", { mode: "committed", base: "missing" }, undefined, undefined, { cwd, hasUI: false });
		expect(unknown.details).toMatchObject({ decision: "unknown", overBudget: null });
		expect(receiptFor("ein_review_forecast", unknown.details).line).not.toContain("dentro");
		const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
		writeFileSync(join(cwd, "new.ts"), "new\n".repeat(600)); execFileSync("git", ["add", "new.ts"], { cwd });
		execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.test", "commit", "-qm", "large"], { cwd });
		const committed = { mode: "committed", base };
		const measured = await tool.execute("large", committed, undefined, undefined, { cwd, hasUI: false });
		expect(measured.details).toMatchObject({ decision: "over", lineBudget: 400, byteBudget: 20_000 });
		const largeCli = spawnSync(process.execPath, [resolve(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "review-forecast"], { cwd, encoding: "utf8", input: JSON.stringify(committed) });
		expect(largeCli.status).toBe(0); expect(JSON.parse(largeCli.stdout)).toMatchObject({ decision: "over", lineBudget: 400, byteBudget: 20_000 });
		const { baseOid, headOid, snapshotRef } = measured.details;
		const check = spawnSync(process.execPath, [resolve(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "review-publication-check"], { cwd, encoding: "utf8", input: JSON.stringify({ baseOid, headOid, snapshotRef }) });
		expect(check.status).toBe(1);
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("the git agent uses a stable installed checker without parent handoff fields", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "review-prompt-"));
	try {
		const handlers = new Map<string, any>();
		registerAgentPromptHook({ on(name: string, fn: any) { handlers.set(name, fn); } } as never);
		const result = await handlers.get("before_agent_start")({ agentName: "ein-git", systemPrompt: "Git task", prompt: "Prepare delivery" }, { cwd, hasUI: false });
		expect(result.systemPrompt).not.toContain("Publication-check argv:");
		const agent = readFileSync(resolve(import.meta.dir, "../runtime/agents/ein-git.md"), "utf8");
		expect(agent).toContain("$EIN_PI_AGENT_HOME/lib/review-publication-check.ts");
		const installed = join(cwd, "isolated Pi with spaces", "lib"); mkdirSync(installed, { recursive: true });
		for (const name of ["review-publication-check.ts", "review-exception.ts", "review-forecast.ts", "review-snapshot.ts"]) copyFileSync(resolve(import.meta.dir, "../ein-pi/agent/lib", name), join(installed, name));
		const run = spawnSync(process.execPath, [join(installed, "review-publication-check.ts")], { cwd, encoding: "utf8", input: "{}" });
		expect(run.status).toBe(1); expect(JSON.parse(run.stdout).reason).toBe("invalid publication measurement");
		execFileSync("git", ["init", "-q"], { cwd });
		const commit = (message: string, empty = false) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=t@example.test", "commit", ...(empty ? ["--allow-empty"] : []), "-qm", message], { cwd });
		commit("base", true); const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
		writeFileSync(join(cwd, "feature.ts"), "feature\n"); execFileSync("git", ["add", "feature.ts"], { cwd }); commit("feature");
		const check = () => spawnSync("sh", ["-c", 'bun "$EIN_PI_AGENT_HOME/lib/review-publication-check.ts" review-current "$1"', "check", base], { cwd, encoding: "utf8", env: { ...process.env, EIN_PI_AGENT_HOME: join(cwd, "isolated Pi with spaces") } });
		const measured = check();
		expect(measured.status, measured.stderr).toBe(0);
		expect(measured.stdout.trim()).toBe(execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim());
		commit("moved head", true);
		expect(check().status).toBe(0);
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});
