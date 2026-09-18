import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import phaseContext from "../ein-pi/agent/extensions/internal/ein-phase-context-child.ts";
import { registerDelegationResultHook } from "../ein-pi/agent/extensions/internal/ein-delegation-results.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";
import { beginPhaseRun } from "../ein-pi/agent/lib/sdd-phase-runtime.ts";
import { compileClaudeSurface } from "../ein-cc/sync.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function project() {
	const cwd = mkdtempSync(join(tmpdir(), "ein-phase-hook-")); roots.push(cwd);
	const changes = join(cwd, "openspec/changes"); mkdirSync(changes, { recursive: true });
	const change = (name: string) => { const dir = join(changes, name); mkdirSync(dir, { recursive: true }); return dir; };
	return { cwd, change };
}

async function finishFromChild(cwd: string, reference: Record<string, unknown>, status: "complete" | "partial", reason?: string) {
	const handlers = new Map<string, Function[]>();
	let tool: any;
	phaseContext({
		on(name: string, handler: Function) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
		registerTool(value: unknown) { tool = value; },
	} as never);
	await handlers.get("before_agent_start")![0]!({ task: `Do the phase\nein_phase_run: ${JSON.stringify(reference)}`, systemPrompt: "You are the SDD map executor" }, { cwd, hasUI: false });
	return tool.execute("child-call", { status, reason }, undefined, undefined, { cwd });
}

function resultHarness(cwd: string) {
	const handlers = new Map<string, Function>();
	const api = registerDelegationResultHook({ on(name: string, handler: Function) { handlers.set(name, handler); } } as never, new Map());
	const ctx = { cwd, hasUI: false, sessionManager: { getSessionId: () => cwd } };
	const deliver = (id: string, details: Record<string, unknown> = {}) => handlers.get("tool_result")!({ toolName: "subagent", toolCallId: id, isError: true, details: { mode: "single", ...details }, content: [{ type: "text", text: "transport disconnected" }] }, ctx);
	return { api, deliver };
}

describe("phase completion hook", () => {
	test("Claude omite la tool exclusiva de Pi sin anunciar un alias", () => {
		const surface = compileClaudeSurface();
		for (const [name, prompt] of Object.entries(surface.agents).filter(([name]) => name.startsWith("sdd-"))) {
			expect(prompt, name).not.toContain("ein_sdd_phase_complete");
			expect(prompt, name).not.toContain("ein-cc-sdd phase-complete");
		}
	});

	test("write/edit ordinarios no pueden fabricar sidecars de fase", async () => {
		const f = project();
		const handlers: Function[] = [];
		phaseContext({ on(name: string, handler: Function) { if (name === "tool_call") handlers.push(handler); }, registerTool() {} } as never);
		const result = await handlers[0]!({ toolName: "write", input: { path: "openspec/changes/change-a/.phase-runs/fake/completion.json", content: "{}" } }, { cwd: f.cwd });
		expect(result).toMatchObject({ block: true });
	});

	test("el gate añade manifest solo a un destino explícito e inequívoco", async () => {
		const f = project();
		writeFileSync(join(f.change("change-a"), "scope.md"), "scope: bounded\n");
		writeFileSync(join(f.change("change-b"), "scope.md"), "scope: bounded\n");
		let handler: Function = () => undefined;
		const references: unknown[] = [];
		registerToolCallGate({ on(name: string, callback: Function) { if (name === "tool_call") handler = callback; }, appendEntry() {} } as never, {
			scoutTracking: new Map(), rememberPhaseRun(reference) { references.push(reference); },
		});
		const ctx = { cwd: f.cwd, hasUI: false, ui: { notify() {}, select: async () => "off" }, sessionManager: { getSessionId: () => f.cwd } };
		const input = { agent: "sdd-map", task: "change: change-a\nMap the bounded change" };
		expect(await handler({ toolName: "subagent", toolCallId: "gate-a", input }, ctx)).toBeUndefined();
		expect(input.task).toContain("ein_phase_run:");
		expect(references).toHaveLength(1);

		const adHoc = { agent: "sdd-map", task: "Map the supplied context without an SDD change" };
		expect(await handler({ toolName: "subagent", toolCallId: "gate-adhoc", input: adHoc }, ctx)).toBeUndefined();
		expect(adHoc.task).not.toContain("ein_phase_run:");

		const conflicting = { agent: "sdd-map", task: "change: change-a\nRead openspec/changes/change-b/scope.md" };
		expect(await handler({ toolName: "subagent", toolCallId: "gate-conflict", input: conflicting }, ctx)).toMatchObject({ block: true });
	});

	test("el child produce el recibo y el hook real rescata una caída posterior", async () => {
		const f = project(); const dir = f.change("change-a");
		const begun = beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "map", toolCallId: "call-a" });
		if (!begun.ok) throw new Error(begun.reason);
		const reference = { version: 1 as const, toolCallId: begun.value.toolCallId, change: begun.value.change, phase: begun.value.phase, nonce: begun.value.nonce };
		const hook = resultHarness(f.cwd); hook.api.rememberPhaseRun(reference);
		writeFileSync(join(dir, "map.md"), "# Map\nscope_status: valid\n");
		const child = await finishFromChild(f.cwd, reference, "complete");
		expect(child.isError).toBe(false);
		const result = hook.deliver("call-a");
		expect(result.isError).toBe(false);
		expect(result.content[0].text).toContain("finalizado y recuperado");
		expect(result.content[0].text).toContain("transport disconnected");
		expect(result.details.phaseRecovery.state).toBe("complete");
		expect(hook.deliver("call-a")).toBeUndefined();
		const restored = resultHarness(f.cwd).deliver("call-a", { einPhaseRun: reference });
		expect(restored.isError).toBe(false);
		expect(restored.details.phaseRecovery.state).toBe("complete");
	});

	test("un artefacto de B no rescata A y el borrador de A queda parcial", () => {
		const f = project(); const a = f.change("change-a"); const b = f.change("change-b");
		const begun = beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "map", toolCallId: "call-a" });
		if (!begun.ok) throw new Error(begun.reason);
		const reference = { version: 1 as const, toolCallId: begun.value.toolCallId, change: begun.value.change, phase: begun.value.phase, nonce: begun.value.nonce };
		const hook = resultHarness(f.cwd); hook.api.rememberPhaseRun(reference);
		writeFileSync(join(a, "map.md"), "draft\n");
		writeFileSync(join(b, "map.md"), "# Map\nscope_status: valid\n");
		const result = hook.deliver("call-a");
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("Artefacto parcial disponible");
		expect(result.details.phaseRecovery.state).toBe("unconfirmed");
	});

	test("partial conserva motivo sin convertir el fallo en éxito", async () => {
		const f = project(); const dir = f.change("change-a");
		const begun = beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "call-partial" });
		if (!begun.ok) throw new Error(begun.reason);
		const reference = { version: 1 as const, toolCallId: begun.value.toolCallId, change: begun.value.change, phase: begun.value.phase, nonce: begun.value.nonce };
		writeFileSync(join(dir, "design.md"), "partial design\n");
		const hook = resultHarness(f.cwd); hook.api.rememberPhaseRun(reference);
		expect((await finishFromChild(f.cwd, reference, "partial", "missing architecture decision")).isError).toBe(false);
		const result = hook.deliver("call-partial");
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("missing architecture decision");
		expect(result.details.phaseRecovery.state).toBe("partial");
	});
});
