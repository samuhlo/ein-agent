import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { closeDeliveryViolation } from "../ein-pi/agent/lib/guardrails.ts";
import closeSummary from "../ein-pi/agent/extensions/internal/ein-close-summary-child.ts";
import { resolveGuardDecision } from "../ein-cc/sdd-cli/cli.ts";

const hook = (command: string, agentType = "sdd-close") => JSON.stringify({ agent_type: agentType, tool_input: { command } });

test("close blocks Git delivery commands, including a shell wrapper, but leaves summary work alone", () => {
	for (const command of [
		"git add openspec/changes/x/summary.md",
		"git commit -m 'docs: cierre'",
		"git -C /tmp/repo commit -m cierre",
		"bash -lc 'git add summary.md && git commit -m cierre'",
		"git push origin HEAD",
		"GH_PROMPT_DISABLED=1 gh pr create --base dev",
	]) expect(closeDeliveryViolation(command), command).toContain("ein-git");
	for (const command of [
		"git status --short",
		"git diff --check",
		"ein-cc-sdd summary cambio < summary.json",
		"printf '%s' 'git commit -m example'",
	]) expect(closeDeliveryViolation(command), command).toBeNull();
});

test("Claude denies the same commit only while sdd-close is active", () => {
	const command = "git commit -m cierre";
	const close = resolveGuardDecision(hook(command), "/tmp");
	expect(close).toMatchObject({ decision: "deny" });
	expect(close?.reason).toContain("ein-git");
	expect(resolveGuardDecision(hook(command, "ein-git"), "/tmp")?.decision).toBe("allow");
	expect(resolveGuardDecision(JSON.stringify({ tool_input: { command } }), "/tmp")?.decision).toBe("allow");
	expect(resolveGuardDecision(hook("ein-cc-sdd summary cambio < summary.json"), "/tmp")).toBeNull();
	expect(resolveGuardDecision(hook("git push --force origin main"), "/tmp")?.reason).toContain("Ein safety policy blocked");
	const cli = spawnSync(process.execPath, [resolve(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "guard"], { input: hook(command), encoding: "utf8" });
	expect(cli.status).toBe(0);
	expect(JSON.parse(cli.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: "deny", permissionDecisionReason: expect.stringContaining("ein-git") });
});

test("Pi close child denies commit before Bash executes", async () => {
	let handler: ((event: unknown) => Promise<unknown>) | undefined;
	closeSummary({ on: (_event: string, callback: typeof handler) => { handler = callback; }, registerTool() {} } as never);
	expect(handler).toBeDefined();
	expect(await handler!({ toolName: "bash", input: { command: "git commit -m cierre" } })).toMatchObject({ block: true, reason: expect.stringContaining("ein-git") });
	expect(await handler!({ toolName: "bash", input: { command: "git status --short" } })).toBeUndefined();
	expect(await handler!({ toolName: "bash", input: { command: "git push --force origin main" } })).toBeUndefined();
});
