import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectAgentRoot, normalizeAgentDiscoveryScope } from "../ein-pi/agent/lib/agent-discovery-scope.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";

test("a new sibling directory never inherits home .pi agents as project agents", () => {
	const home = mkdtempSync(join(tmpdir(), "ein-agent-home-"));
	const donor = join(home, "work/old-project"), target = join(home, "work/new-project");
	for (const path of [join(home, ".pi/agents"), join(donor, ".git"), join(donor, ".pi/agents"), target]) mkdirSync(path, { recursive: true });
	try {
		const input = { agent: "sdd-apply", cwd: target, task: "write the approved plan" };
		expect(normalizeAgentDiscoveryScope(input, donor, home)).toBe(true);
		expect(input).toMatchObject({ agentScope: "user", cwd: target, agent: "sdd-apply" });
		expect(findProjectAgentRoot(target, home)).toBeNull();
		expect(findProjectAgentRoot(home, home)).toBeNull();
		const listing = { action: "list", agentScope: "both" };
		expect(normalizeAgentDiscoveryScope(listing, target, home)).toBe(true);
		expect(listing.agentScope).toBe("user");
		expect(normalizeAgentDiscoveryScope({ action: "resume", id: "existing-run" }, target, home)).toBe(false);
		expect(findProjectAgentRoot(donor, home)).toBe(donor);
		expect(normalizeAgentDiscoveryScope({ action: "delete", agent: "sdd-apply", agentScope: "project" }, target, home)).toBe(false);
		expect(() => normalizeAgentDiscoveryScope({ agent: "sdd-apply", agentScope: "project" }, target, home)).toThrow();
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("project agents remain available in subdirectories but do not cross a Git boundary", () => {
	const home = mkdtempSync(join(tmpdir(), "ein-agent-boundary-"));
	const parent = join(home, "work"), repo = join(parent, "repo"), nested = join(repo, "src");
	for (const path of [join(parent, ".pi/agents"), nested]) mkdirSync(path, { recursive: true });
	writeFileSync(join(repo, ".git"), "gitdir: elsewhere");
	try {
		expect(findProjectAgentRoot(nested, home)).toBeNull();
		mkdirSync(join(repo, ".pi/agents"), { recursive: true });
		expect(findProjectAgentRoot(nested, home)).toBe(repo);
		const input = { agent: "sdd-apply", task: "work" };
		expect(normalizeAgentDiscoveryScope(input, nested, home)).toBe(false);
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("honors native git-root policy without letting an outer repository replace local agents", () => {
	const home = mkdtempSync(join(tmpdir(), "ein-agent-policy-"));
	const repo = join(home, "repo"), nested = join(repo, "nested");
	for (const path of [join(home, ".pi"), join(repo, ".git"), join(repo, ".pi"), join(nested, ".pi")]) mkdirSync(path, { recursive: true });
	try {
		expect(findProjectAgentRoot(nested, home)).toBe(nested);
		writeFileSync(join(repo, ".pi/settings.json"), JSON.stringify({ subagents: { projectRootResolution: "git-root" } }));
		expect(findProjectAgentRoot(nested, home)).toBe(repo);
		writeFileSync(join(nested, ".pi/settings.json"), JSON.stringify({ subagents: { projectRootResolution: "nearest" } }));
		expect(findProjectAgentRoot(nested, home)).toBe(nested);
	} finally { rmSync(home, { recursive: true, force: true }); }
});

test("the actual tool-call hook applies user scope before launching from an unconfigured directory", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "ein-agent-hook-"));
	let handler: (event: any, ctx: any) => Promise<any> = async () => { throw new Error("hook missing"); };
	registerToolCallGate({ on(_name: string, callback: typeof handler) { handler = callback; } } as never, { scoutTracking: new Map(), rememberPhaseSnapshot() {} });
	try {
		const input = { agent: "custom-reader", task: "inspect" };
		await handler({ toolName: "subagent", toolCallId: "scope-probe", input }, { cwd, hasUI: false });
		expect(input).toMatchObject({ agentScope: "user" });
		expect(input).not.toHaveProperty("model");
	} finally { rmSync(cwd, { recursive: true, force: true }); }
});
