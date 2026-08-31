import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { createEinContinuityExtension, HANDOFF_USAGE } from "../ein-pi/agent/extensions/ein-continuity.ts";
import type { ContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";

type Hook = (event: Record<string, unknown>, ctx: ExtensionContext) => unknown;
type Command = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
function ready() { return { status: "ready" as const, blockers: [] as const, warnings: [] as const }; }
function lifecycle(overrides: Partial<ContinuityHandoffLifecycle> = {}) {
	const calls: string[] = [];
	const value: ContinuityHandoffLifecycle = {
		captureInput: (text) => { calls.push(`capture:${String(text)}`); }, refresh: async (explicit) => { calls.push(`refresh:${String(explicit)}`); return "refreshed"; },
		mutationResult: async (success) => { calls.push(`mutation:${success}`); return success ? "refreshed" : "mutation-uncertain"; },
		status: async () => ({ operation: "complete", checkpoint: "present", freshness: "current", pi: ready(), claude: ready() }),
		prepare: async (target) => { calls.push(`prepare:${String(target)}`); return { ok: true, brief: { ok: true, version: 1, format: "continuity-resume-brief/v1", content: "PRIVATE-BRIEF-CANARY", byteLength: 20, payloadByteLength: 1, payloadSha256: `sha256:${"a".repeat(64)}`, target: target as "pi" | "claude", checkpointRevision: `sha256:${"b".repeat(64)}`, truncated: false, omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [] } }; },
		clear: async () => { calls.push("clear"); return "cleared"; }, markPreparedReplacement: () => { calls.push("prepared-replacement"); }, restoreCancelledReplacement: () => { calls.push("restore-cancelled"); }, shutdown: async () => { calls.push("shutdown"); return "refreshed"; }, ...overrides,
	};
	return { value, calls };
}
function harness(instances = [lifecycle()]) {
	const hooks = new Map<string, Hook[]>(), commands = new Map<string, Command[]>(), notifications: string[] = []; let created = 0;
	const api = { on: (name: string, handler: Hook) => hooks.set(name, [...(hooks.get(name) ?? []), handler]), registerCommand: (name: string, definition: { handler: Command }) => commands.set(name, [...(commands.get(name) ?? []), definition.handler]) } as unknown as ExtensionAPI;
	createEinContinuityExtension({ createLifecycle: () => instances[Math.min(created++, instances.length - 1)]!.value })(api);
	const context = (patch: Record<string, unknown> = {}) => ({ cwd: "/project", hasUI: true, ui: { notify: (message: string) => notifications.push(message) }, getContextUsage: () => ({ tokens: 90, contextWindow: 100, percent: 90 }), waitForIdle: async () => { instances[0]!.calls.push("idle"); }, ...patch }) as unknown as ExtensionCommandContext;
	const emit = async (name: string, event: Record<string, unknown>, ctx = context()) => { for (const hook of hooks.get(name) ?? []) await hook(event, ctx); };
	return { hooks, commands, notifications, context, emit, command: commands.get("ein:handoff")![0]!, instances };
}

describe("ein continuity extension", () => {
	test("registers one command and each lifecycle hook exactly once", () => {
		const app = harness(); expect(app.commands.get("ein:handoff")).toHaveLength(1); expect([...app.hooks.keys()].sort()).toEqual(["agent_settled", "input", "session_before_compact", "session_shutdown", "session_start", "tool_result"]); expect([...app.hooks.values()].every((items) => items.length === 1)).toBeTrue();
	});

	test("handles usage, status, refresh, and clear with closed output", async () => {
		const app = harness(); await app.emit("session_start", { type: "session_start" });
		await app.command("unknown PRIVATE-OUTPUT-CANARY", app.context()); expect(app.notifications.pop()).toBe(HANDOFF_USAGE);
		await app.command("status", app.context()); expect(app.notifications.pop()).toBe("checkpoint=present;freshness=current;pi=ready;blockers=none;warnings=none;claude=ready;blockers=none;warnings=none");
		await app.command("refresh", app.context()); await app.command("clear", app.context()); expect(app.notifications).toEqual(["handoff-refresh=refreshed", "handoff-clear=cleared"]); expect(app.notifications.join(" ")).not.toContain("CANARY");
	});

	test("accepts only exact raw command arguments and suppresses UI output when unavailable", async () => {
		const app = harness(); await app.emit("session_start", { type: "session_start" });
		for (const malformed of [" status", "status ", "to  pi", "to\tpi", "to\npi", "Status", "status extra"]) { await app.command(malformed, app.context()); expect(app.notifications.pop()).toBe(HANDOFF_USAGE); }
		await app.command("", app.context()); expect(app.notifications.pop()).toBe(HANDOFF_USAGE); await app.command("status", app.context({ hasUI: false })); expect(app.notifications).toEqual([]);
	});

	test("reports lifecycle command pressure with one closed busy code", async () => {
		const instance = lifecycle({ status: async () => ({ operation: "busy", checkpoint: "unavailable", freshness: "unknown", pi: { status: "blocked", blockers: ["audit-failed"], warnings: [] }, claude: { status: "blocked", blockers: ["audit-failed"], warnings: [] } }) }), app = harness([instance]); await app.emit("session_start", { type: "session_start" }); await app.command("status", app.context()); expect(app.notifications).toEqual(["handoff-status=busy"]);
	});

	test("ignores extension input and captures interactive/rpc input", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" });
		await app.emit("input", { type: "input", source: "extension", text: "brief-canary" }); await app.emit("input", { type: "input", source: "interactive", text: "user objective" });
		expect(instance.calls).toEqual(["capture:user objective", "refresh:false"]);
	});

	test("classifies mutating tool results by name and error without reading payload fields", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" });
		const event = { type: "tool_result", toolName: "bash", isError: false } as Record<string, unknown>; Object.defineProperty(event, "content", { get: () => { throw new Error("content read"); } }); Object.defineProperty(event, "details", { get: () => { throw new Error("details read"); } }); Object.defineProperty(event, "input", { get: () => { throw new Error("input read"); } });
		await app.emit("tool_result", event); await app.emit("tool_result", { type: "tool_result", toolName: "read", isError: false }); await app.emit("tool_result", { type: "tool_result", toolName: "ein_openspec_sync", isError: true }); expect(instance.calls).toEqual(["mutation:true", "mutation:false"]);
	});

	test("saves settled boundaries and emits the context threshold notice once", async () => {
		const app = harness(); await app.emit("session_start", { type: "session_start" }); await app.emit("agent_settled", { type: "agent_settled" }, app.context({ getContextUsage: () => ({ tokens: 84.9, contextWindow: 100, percent: 84.9 }) })); await app.emit("agent_settled", { type: "agent_settled" }, app.context({ getContextUsage: () => ({ tokens: null, contextWindow: 100, percent: null }) })); await app.emit("agent_settled", { type: "agent_settled" }, app.context({ getContextUsage: () => ({ tokens: 85, contextWindow: 100, percent: 85 }) })); await app.emit("agent_settled", { type: "agent_settled" });
		expect(app.notifications).toEqual(["handoff-boundary=saved;commands=/ein:handoff status | /ein:handoff to pi | /ein:handoff to claude"]);
	});

	test("to pi waits, suppresses old shutdown, and sends only through the fresh replacement context", async () => {
		const old = lifecycle(), replacement = lifecycle(), app = harness([old, replacement]); await app.emit("session_start", { type: "session_start" }); const sent: string[] = [], order: string[] = [];
		const ctx = app.context({ waitForIdle: async () => order.push("idle"), newSession: async ({ withSession }: { withSession: (fresh: { sendUserMessage: (text: string) => Promise<void> }) => Promise<void> }) => { order.push("newSession"); await app.emit("session_shutdown", { type: "session_shutdown" }); await app.emit("session_start", { type: "session_start" }); await withSession({ sendUserMessage: async (text) => { order.push("fresh-send"); sent.push(text); } }); return { cancelled: false }; } });
		await app.command("to pi", ctx); expect(order).toEqual(["idle", "newSession", "fresh-send"]); expect(sent).toEqual(["PRIVATE-BRIEF-CANARY"]); expect(old.calls).toEqual(["prepare:pi", "prepared-replacement", "shutdown"]); expect(app.notifications).toEqual([]);
	});

	test("to pi restores lifecycle state and reports an honestly cancelled replacement", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" });
		await app.command("to pi", app.context({ newSession: async () => ({ cancelled: true }) })); expect(instance.calls).toContain("restore-cancelled"); expect(app.notifications).toEqual(["handoff=cancelled;target=pi"]);
	});

	test("contains kickoff send failure in the fresh context and never reports through stale state", async () => {
		const old = lifecycle(), replacement = lifecycle(), app = harness([old, replacement]); await app.emit("session_start", { type: "session_start" }); const freshNotifications: string[] = [];
		const ctx = app.context({ newSession: async ({ withSession }: { withSession: (fresh: ExtensionCommandContext & { sendUserMessage: () => Promise<void> }) => Promise<void> }) => { await app.emit("session_shutdown", { type: "session_shutdown" }); await app.emit("session_start", { type: "session_start" }); await withSession(app.context({ ui: { notify: (message: string) => freshNotifications.push(message) }, sendUserMessage: async () => { throw new Error("PRIVATE-SEND-FAILURE"); } }) as ExtensionCommandContext & { sendUserMessage: () => Promise<void> }); return { cancelled: false }; } });
		await app.command("to pi", ctx); expect(freshNotifications).toEqual(["handoff=kickoff-delivery-failed;target=pi"]); expect(app.notifications).toEqual([]); expect(old.calls).toEqual(["idle", "prepare:pi", "prepared-replacement", "shutdown"]);
	});

	test("restores and reports only when newSession throws before replacement", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" }); await app.command("to pi", app.context({ newSession: async () => { throw new Error("PRIVATE-PRE-REPLACEMENT"); } }));
		expect(instance.calls).toContain("restore-cancelled"); expect(app.notifications).toEqual(["handoff=session-replacement-failed;target=pi"]); expect(app.notifications.join(" ")).not.toContain("PRIVATE");
	});

	test("to claude prepares persistence but never spawns, shuts down, or exposes the brief", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" }); let replacement = false, shutdown = false;
		await app.command("to claude", app.context({ newSession: async () => { replacement = true; return { cancelled: false }; }, shutdown: () => { shutdown = true; } }));
		expect(instance.calls).toContain("prepare:claude"); expect(replacement).toBeFalse(); expect(shutdown).toBeFalse(); expect(app.notifications).toEqual(["handoff=external-launch-required;target=claude"]); expect(app.notifications.join(" ")).not.toContain("PRIVATE-BRIEF-CANARY");
	});

	test("orders compaction and shutdown through lifecycle boundaries without duplicate background work", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" }); await app.emit("session_before_compact", { type: "session_before_compact", reason: "threshold" }); await app.emit("session_shutdown", { type: "session_shutdown" }); await app.emit("agent_settled", { type: "agent_settled" }); expect(instance.calls).toEqual(["refresh:false", "shutdown"]);
	});

	test("is included by the existing recursive template packaging and Pi directory discovery contract", () => {
		const repo = join(import.meta.dir, ".."), bundle = readFileSync(join(repo, "installer/scripts/bundle-template.ts"), "utf8"), settings = JSON.parse(readFileSync(join(repo, "ein-pi/agent/settings.json"), "utf8")) as { extensions: string[] };
		expect(bundle).toContain('const RUNTIME_DIRS = ["agents", "assets", "docs", "prompts", "skills"]'); expect(bundle).toContain('const AGENT_DIRS = ["chains", "extensions"'); expect(bundle).toContain("cpSync(src, join(staging, dir), { recursive: true });"); expect(settings.extensions.some((path) => path.endsWith("/extensions"))).toBeTrue(); expect(readFileSync(join(repo, "ein-pi/agent/extensions/ein-continuity.ts"), "utf8")).toContain("export default");
	});
});
