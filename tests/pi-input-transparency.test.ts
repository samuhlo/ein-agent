import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerSessionLifecycle } from "../ein-pi/agent/extensions/internal/ein-session-lifecycle.ts";
import { buildIntentKickoff } from "../ein-pi/agent/lib/intent-channel.ts";

type Hook = (event: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>;

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(changes: readonly string[]): string {
	const root = mkdtempSync(join(tmpdir(), "ein-pi-input-transparency-"));
	roots.push(root);
	for (const change of changes) mkdirSync(join(root, "openspec", "changes", change), { recursive: true });
	return root;
}

function harness(cwd: string) {
	const hooks = new Map<string, Hook>();
	const notifications: string[] = [];
	const sent: string[] = [];
	const deliveryInputs: string[] = [];
	const pi = {
		on(name: string, handler: Hook) { hooks.set(name, handler); },
		sendUserMessage(text: string) { sent.push(text); },
	};
	registerSessionLifecycle(pi as never, {
		scoutTracking: new Map(),
		recordDeliveryIntent: (_ctx: unknown, text: string) => deliveryInputs.push(text),
	} as never);
	const input = hooks.get("input");
	if (!input) throw new Error("input hook no registrado");
	const ctx = {
		cwd,
		hasUI: true,
		ui: { notify: (message: string) => notifications.push(message) },
		sessionManager: { getSessionId: () => `session-${roots.length}` },
	};
	return { input, ctx, notifications, sent, deliveryInputs };
}

describe("Pi entrega toda entrada ordinaria al orquestador", () => {
	for (const changes of [[], ["uno"], ["uno", "dos"]] as const) {
		test(`con ${changes.length} cambios activos conserva conversación, lectura y modificación`, async () => {
			const app = harness(project(changes));
			const events = [
				{ type: "input", source: "interactive", text: "hola" },
				{ type: "input", source: "rpc", text: "Tenía este proyecto parado. Haz una auditoría y dime por dónde tirar." },
				{ type: "input", source: "interactive", text: "Arregla esto" },
			] as const;

			for (const event of events) {
				const before = { ...event };
				expect(await app.input(event, app.ctx)).toEqual({ action: "continue" });
				expect(event).toEqual(before);
			}
			expect(app.notifications).toEqual([]);
			expect(app.sent).toEqual([]);
			expect(app.deliveryInputs).toEqual(events.map((event) => event.text));
		});
	}

	test("un kickoff explícito de intent y un brief de extensión atraviesan intactos", async () => {
		const app = harness(project(["uno", "dos"]));
		const texts = [
			buildIntentKickoff("decidir cómo recuperar el proyecto").text,
			"continuity-resume-brief/v1\nobjetivo conservado",
		];
		for (const text of texts) {
			const event = { type: "input", source: "extension", text };
			expect(await app.input(event, app.ctx)).toEqual({ action: "continue" });
			expect(event.text).toBe(text);
		}
		expect(app.notifications).toEqual([]);
		expect(app.sent).toEqual([]);
	});
});

describe("el orquestador es el único dueño semántico en Pi", () => {
	test("ningún hook conserva el gate léxico y la política mantiene intent consentido", () => {
		const root = join(import.meta.dir, "..");
		const sources = [
			"ein-pi/agent/extensions/ein-ai.ts",
			"ein-pi/agent/extensions/internal/ein-session-lifecycle.ts",
			"ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts",
			"ein-pi/agent/extensions/internal/ein-tool-call-gate.ts",
		].map((path) => readFileSync(join(root, path), "utf8")).join("\n");
		const orchestrator = readFileSync(join(root, "runtime/assets/orchestrator.md"), "utf8");
		const policy = readFileSync(join(root, "runtime/AGENTS.md"), "utf8");

		expect(sources).not.toContain("PiIntentGate");
		expect(sources).not.toContain("runPiIntentPreflight");
		expect(sources).not.toContain('action: "handled"');
		expect(orchestrator).toContain("Every ordinary input reaches you unchanged");
		expect(orchestrator).toContain("offer `/ein:intent`");
		expect(policy).toContain("Every ordinary input reaches the parent orchestrator unchanged");
		expect(policy).toContain("never activates `/ein:intent` without user consent");
	});
});
