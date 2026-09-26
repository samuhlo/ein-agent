import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContextReadGuard, registerContextReadGuard } from "../ein-pi/agent/lib/context-read-guard.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-read-guard-"));
	roots.push(cwd);
	const skill = join(cwd, "skills/example/SKILL.md");
	const policy = join(cwd, "assets/orchestrator.md");
	const document = join(cwd, "docs/brief.md");
	for (const path of [skill, policy, document]) {
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, "one\ntwo\nthree\nfour\nfive\nsix\n");
	}
	const ctx = (session: string) => ({ cwd, sessionManager: { getSessionFile: () => session } }) as never;
	const call = (path: string, offset?: number, limit?: number) => ({ toolName: "read", toolCallId: "call", input: { path, offset, limit } }) as never;
	const result = (path: string, offset?: number, limit?: number, details?: unknown, isError = false) => ({
		toolName: "read", toolCallId: "call", input: { path, offset, limit }, details, isError,
		content: [{ type: "text", text: "delivered" }],
	}) as never;
	return { cwd, skill, policy, document, ctx, call, result };
}

describe("context read guard", () => {
	test("the registered Pi hooks clear ordinary reads on input and policy reads on compaction", () => {
		const f = fixture(), hooks = new Map<string, (event: any, ctx: any) => any>();
		registerContextReadGuard({ on(name: string, handler: (event: any, ctx: any) => any) { hooks.set(name, handler); } } as never);
		const ctx = f.ctx("one");
		hooks.get("tool_result")!(f.result(f.document), ctx);
		hooks.get("tool_result")!(f.result(f.policy, 1, 2), ctx);
		expect(hooks.get("tool_call")!(f.call(f.document), ctx)).toMatchObject({ block: true });
		hooks.get("input")!({ type: "input", text: "continue", source: "interactive" }, ctx);
		expect(hooks.get("tool_call")!(f.call(f.document), ctx)).toBeUndefined();
		expect(hooks.get("tool_call")!(f.call(f.policy, 1, 2), ctx)).toMatchObject({ block: true });
		hooks.get("session_compact")!({ type: "session_compact" }, ctx);
		expect(hooks.get("tool_call")!(f.call(f.policy, 1, 2), ctx)).toBeUndefined();
	});

	test("reuses a delivered policy span across turns, but allows new lines and compaction", () => {
		const f = fixture(), guard = createContextReadGuard(), ctx = f.ctx("one");
		expect(guard.before(f.call(f.policy, 2, 3), ctx)).toBeUndefined();
		guard.after(f.result(f.policy, 2, 3), ctx);
		expect(guard.before(f.call(f.policy, 3, 2), ctx)).toMatchObject({ block: true });
		expect(guard.before(f.call(f.policy, 5, 2), ctx)).toBeUndefined();
		guard.newTurn(ctx);
		expect(guard.before(f.call(f.policy, 2, 3), ctx)).toMatchObject({ block: true });
		guard.compact(ctx);
		expect(guard.before(f.call(f.policy, 2, 3), ctx)).toBeUndefined();
	});

	test("reads a skill once per context and isolates new sessions", () => {
		const f = fixture(), guard = createContextReadGuard(), first = f.ctx("one"), second = f.ctx("two");
		guard.after(f.result(f.skill), first);
		expect(guard.before(f.call(f.skill, 2, 1), first)).toMatchObject({ block: true });
		guard.newTurn(first);
		expect(guard.before(f.call(f.skill), first)).toMatchObject({ block: true });
		expect(guard.before(f.call(f.skill), second)).toBeUndefined();
	});

	test("an explicit user reread request takes precedence over the cached skill", () => {
		const f = fixture(), guard = createContextReadGuard(), ctx = f.ctx("one");
		guard.after(f.result(f.skill), ctx);
		guard.after(f.result(f.policy), ctx);
		guard.newTurn(ctx, "Relee docs/brief.md");
		expect(guard.before(f.call(f.skill), ctx)).toMatchObject({ block: true });
		expect(guard.before(f.call(f.policy), ctx)).toMatchObject({ block: true });
		guard.newTurn(ctx, "Relee el archivo SKILL.md para revisar el cambio");
		expect(guard.before(f.call(f.skill), ctx)).toBeUndefined();
		expect(guard.before(f.call(f.policy), ctx)).toMatchObject({ block: true });
	});

	test("ordinary documents can be reread on a later user turn", () => {
		const f = fixture(), guard = createContextReadGuard(), ctx = f.ctx("one");
		guard.after(f.result(f.document), ctx);
		expect(guard.before(f.call(f.document), ctx)).toMatchObject({ block: true });
		guard.newTurn(ctx);
		expect(guard.before(f.call(f.document), ctx)).toBeUndefined();
	});

	test("file changes and failed or truncated reads never suppress unseen content", () => {
		const f = fixture(), guard = createContextReadGuard(), ctx = f.ctx("one");
		guard.after(f.result(f.skill, 1, 5, undefined, true), ctx);
		expect(guard.before(f.call(f.skill, 1, 5), ctx)).toBeUndefined();
		guard.after(f.result(f.skill, 1, 5, { truncation: { truncated: true, outputLines: 2 } }), ctx);
		expect(guard.before(f.call(f.skill, 1, 2), ctx)).toMatchObject({ block: true });
		expect(guard.before(f.call(f.skill, 1, 5), ctx)).toBeUndefined();
		writeFileSync(f.skill, "changed content with a different size\n");
		expect(guard.before(f.call(f.skill, 1, 2), ctx)).toBeUndefined();
	});

	test("adjacent delivered spans cover a combined request", () => {
		const f = fixture(), guard = createContextReadGuard(), ctx = f.ctx("one");
		guard.after(f.result(f.policy, 1, 2), ctx);
		guard.after(f.result(f.policy, 3, 2), ctx);
		expect(guard.before(f.call(f.policy, 1, 4), ctx)).toMatchObject({ block: true });
		expect(guard.before(f.call(f.policy, 1, 5), ctx)).toBeUndefined();
	});
});

test("the subagent gate preserves the provider's required capability check", async () => {
	let handler: (event: any, ctx: any) => Promise<any> = async () => { throw new Error("hook missing"); };
	registerToolCallGate({ on(name: string, callback: typeof handler) { if (name === "tool_call") handler = callback; } } as never, { scoutTracking: new Map(), rememberPhaseRun() {} });
	const ctx = { cwd: process.cwd(), hasUI: false };
	await expect(handler({ toolName: "subagent", toolCallId: "list", input: { action: "list", capabilities: true } }, ctx)).resolves.toBeUndefined();
	await expect(handler({ toolName: "subagent", toolCallId: "status", input: { action: "status", id: "run-1" } }, ctx)).resolves.toBeUndefined();
});
