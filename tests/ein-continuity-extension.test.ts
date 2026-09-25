import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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
		listOperations: () => ({ ok: true, observed: false, operations: [] }),
		reconcileNativeSubagents: () => ({ ok: true, value: { reconciled: 0, active: 0, limit: 32 } }),
		grantActiveSlot: () => ({ ok: false, reason: "grant-not-needed", outcome: "not-published" }),
		beginOperation: () => ({ ok: true, journal: { schemaVersion: 1, revision: "fixture", operations: [] } }),
		finishOperation: (_input, outcome) => { calls.push(`mutation:${outcome === "succeeded"}`); return { ok: true, journal: { schemaVersion: 1, revision: "fixture", operations: [] } }; },
		inspectOperation: () => ({ ok: false, reason: "fixture" }), resolveOperation: () => ({ ok: false, reason: "fixture" }), recordAdmissionDenied: () => ({ ok: false, reason: "fixture", outcome: "not-published" }),
		captureInput: (text) => { calls.push(`capture:${String(text)}`); }, refresh: async (explicit) => { calls.push(`refresh:${String(explicit)}`); return "refreshed"; },
		setObjective: async () => ({ outcome: "set", revision: `sha256:${"a".repeat(64)}` }),
		mutationResult: async (success) => { calls.push(`mutation:${success}`); return success ? "refreshed" : "mutation-uncertain"; },
		status: async () => ({ operation: "complete", checkpoint: "present", freshness: "current", pi: ready(), claude: ready() }),
		prepare: async (target) => { calls.push(`prepare:${String(target)}`); return { ok: true, brief: { ok: true, version: 1, format: "continuity-resume-brief/v1", content: "PRIVATE-BRIEF-CANARY", byteLength: 20, payloadByteLength: 1, payloadSha256: `sha256:${"a".repeat(64)}`, target: target as "pi" | "claude", checkpointRevision: `sha256:${"b".repeat(64)}`, truncated: false, omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [] } }; },
		clear: async () => { calls.push("clear"); return "cleared"; }, markPreparedReplacement: () => { calls.push("prepared-replacement"); }, restoreCancelledReplacement: () => { calls.push("restore-cancelled"); }, shutdown: async () => { calls.push("shutdown"); return "refreshed"; }, ...overrides,
	};
	return { value, calls };
}
function harness(instances = [lifecycle()]) {
	const hooks = new Map<string, Hook[]>(), commands = new Map<string, Command[]>(), tools = new Map<string, any>(), notifications: string[] = []; let created = 0;
	const entries: { type: "custom"; customType: string; data: unknown }[] = [];
	const api = { appendEntry: (customType: string, data: unknown) => entries.push({ type: "custom", customType, data }), on: (name: string, handler: Hook) => hooks.set(name, [...(hooks.get(name) ?? []), handler]), registerCommand: (name: string, definition: { handler: Command }) => commands.set(name, [...(commands.get(name) ?? []), definition.handler]), registerTool: (tool: any) => tools.set(tool.name, tool) } as unknown as ExtensionAPI;
	createEinContinuityExtension({ createLifecycle: () => instances[Math.min(created++, instances.length - 1)]!.value })(api);
	const context = (patch: Record<string, unknown> = {}) => ({ cwd: "/project", hasUI: true, sessionManager: { getBranch: () => entries }, ui: { notify: (message: string) => notifications.push(message) }, getContextUsage: () => ({ tokens: 90, contextWindow: 100, percent: 90 }), waitForIdle: async () => { instances[0]!.calls.push("idle"); }, ...patch }) as unknown as ExtensionCommandContext;
	const emit = async (name: string, event: Record<string, unknown>, ctx = context()) => { let result: unknown; for (const hook of hooks.get(name) ?? []) result = await hook(event, ctx); return result; };
	return { hooks, commands, tools, notifications, context, emit, command: commands.get("ein:handoff")![0]!, continuityCommand: commands.get("ein:continuity")![0]!, instances };
}

describe("ein continuity extension", () => {
	test("recording failure lets local edits continue without fabricating a result; external effects still stop", async () => {
		const instance = lifecycle({ beginOperation: () => ({ ok: false, reason: "journal-unavailable", outcome: "not-published" }) });
		const app = harness([instance]);
		const ctx = app.context({ sessionManager: { getBranch: () => [], getSessionId: () => "fixture-session" } });
		await app.emit("session_start", {}, ctx);
		for (const [toolName, toolCallId] of [["write", "write-1"], ["edit", "edit-1"]] as const) {
			expect(await app.emit("tool_call", { toolName, toolCallId, input: { path: "src/a.ts" } }, ctx)).toBeUndefined();
			await app.emit("tool_result", { toolName, toolCallId, input: { path: "src/a.ts" }, isError: false }, ctx);
		}
		expect(instance.calls).toEqual([]);
		expect(app.notifications).toEqual(["Continuidad no disponible; revisa el estado antes de cambiar de runtime."]);
		await app.command("status", ctx);
		expect(app.notifications.at(-1)).toContain("recording=unavailable");
		await app.command("to claude", ctx);
		expect(app.notifications.at(-1)).toBe("handoff=blocked;reason=continuity-recording-unavailable");
		expect(await app.emit("tool_call", { toolName: "bash", toolCallId: "bash-1", input: { command: "git push" } }, ctx)).toMatchObject({ block: true });
	});

	test("missing native identity does not turn a local edit into a continuity denial", async () => {
		const app = harness();
		await app.emit("session_start", {});
		expect(await app.emit("tool_call", { toolName: "write", toolCallId: "write-2", input: { path: "src/a.ts" } })).toBeUndefined();
		await app.emit("tool_result", { toolName: "write", toolCallId: "write-2", input: { path: "src/a.ts" }, isError: false });
		expect(app.notifications).toEqual(["Continuidad no disponible; revisa el estado antes de cambiar de runtime."]);
	});

	test("registers one command and each lifecycle hook exactly once", () => {
		const app = harness(); expect(app.commands.get("ein:handoff")).toHaveLength(1); expect(app.commands.get("ein:continuity")).toHaveLength(1); expect(app.tools.has("ein_continuity_objective")).toBeTrue(); expect(app.tools.has("ein_continuity_recover")).toBeTrue(); expect([...app.hooks.keys()].sort()).toEqual(["agent_settled", "input", "session_before_compact", "session_shutdown", "session_start", "tool_call", "tool_result"]); expect([...app.hooks.values()].every((items) => items.length === 1)).toBeTrue();
	});

	test("an explicit continue command reconciles first and grants only when still full", async () => {
		let grants = 0;
		const instance = lifecycle({ reconcileNativeSubagents: () => ({ ok: true, value: { reconciled: 30, active: 2, limit: 32 } }), grantActiveSlot: () => { grants++; throw new Error("not needed"); } });
		const app = harness([instance]); await app.emit("session_start", {});
		await app.continuityCommand("continue", app.context());
		expect(grants).toBe(0); expect(app.notifications.at(-1)).toBe("continuity-continue=ready;reconciled=30;active=2;limit=32");
		const full = lifecycle({ reconcileNativeSubagents: () => ({ ok: true, value: { reconciled: 0, active: 32, limit: 32 } }), grantActiveSlot: () => ({ ok: true, journal: { schemaVersion: 1, revision: "fixture", operations: [], extraActiveSlots: 1 } }) });
		const second = harness([full]); await second.emit("session_start", {}); await second.continuityCommand("continue", second.context());
		expect(second.notifications.at(-1)).toBe("continuity-continue=ready;reconciled=0;active=32;limit=33;human-grant=1");
	});

	test("the model can reconcile native results but cannot grant an extra slot through the tool", async () => {
		let grants = 0;
		const instance = lifecycle({ reconcileNativeSubagents: () => ({ ok: true, value: { reconciled: 30, active: 2, limit: 32 } }), grantActiveSlot: () => { grants++; throw new Error("not exposed"); } });
		const app = harness([instance]); await app.emit("session_start", {});
		const tool = app.tools.get("ein_continuity_recover");
		expect(tool.parameters.properties.action.enum).toContain("reconcile-native");
		expect((await tool.execute("call", { action: "reconcile-native" })).details).toEqual({ ok: true, value: { reconciled: 30, active: 2, limit: 32 } });
		expect((await tool.execute("call", { action: "grant" })).isError).toBeTrue();
		expect(grants).toBe(0);
	});

	test("sets an objective from the last real human request without accepting a model-supplied request id", async () => {
		let observed: any;
		const instance = lifecycle({ setObjective: async (request, revision) => { observed = { request, revision }; return { outcome: "set", revision: `sha256:${"c".repeat(64)}` }; } });
		const app = harness([instance]); await app.emit("session_start", { type: "session_start" });
		const tool = app.tools.get("ein_continuity_objective");
		expect(tool.parameters.properties).not.toHaveProperty("requestId");
		expect((await tool.execute("call", { objective: "Objetivo nuevo", expectedRevision: "absent" })).isError).toBeTrue();
		await app.emit("input", { type: "input", source: "interactive", text: "Cambia el objetivo" });
		const result = await tool.execute("call", { objective: "Sí", expectedRevision: "absent", requestId: "invented" });
		expect(result.isError).toBeFalse(); expect(observed.revision).toBe("absent");
		expect(observed.request).toMatchObject({ objective: "Sí", evidence: { kind: "pi-observed" } });
		expect(observed.request.evidence.requestId).not.toBe("invented");
		const observedId = observed.request.evidence.requestId;
		await app.emit("session_shutdown", {}); await app.emit("session_start", {});
		await tool.execute("resumed", { objective: "Objetivo recuperado", expectedRevision: "absent" });
		expect(observed.request.evidence.requestId).toBe(observedId);
	});

	test("shows the CAS revision without a human request or writing project state", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-objective-view-"));
		try {
			const app = harness(); const ctx = app.context({ cwd }); await app.emit("session_start", {}, ctx);
			const result = await app.tools.get("ein_continuity_objective").execute("show", { action: "show" }, undefined, undefined, ctx);
			expect(result.isError).toBeFalse(); expect(result.details).toEqual({ kind: "absent", expectedRevision: "absent" });
			expect(existsSync(join(cwd, ".ein"))).toBeFalse();
		} finally { rmSync(cwd, { recursive: true, force: true }); }
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

	test("unreadable or unbound mutation results remain uncertain instead of asserting success", async () => {
		const instance = lifecycle(), app = harness([instance]); await app.emit("session_start", { type: "session_start" });
		const event = { type: "tool_result", toolName: "bash", isError: false } as Record<string, unknown>; Object.defineProperty(event, "content", { get: () => { throw new Error("content read"); } }); Object.defineProperty(event, "details", { get: () => { throw new Error("details read"); } }); Object.defineProperty(event, "input", { get: () => { throw new Error("input read"); } });
		await app.emit("tool_result", event); await app.emit("tool_result", { type: "tool_result", toolName: "read", isError: false }); await app.emit("tool_result", { type: "tool_result", toolName: "ein_openspec_sync", isError: true }); expect(instance.calls).toEqual(["mutation:false", "mutation:false"]);
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
