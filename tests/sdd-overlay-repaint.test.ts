// =============================================================================
// TESTS: session-local SDD overlay focus and repaint cache
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import createAiExtension from "../ein-pi/agent/extensions/ein-ai.ts";
import createOverlayExtension from "../ein-pi/agent/extensions/ein-sdd-overlay.ts";
import {
	EIN_SDD_SESSION_BINDING_ENV_KEY,
	SDD_SESSION_BINDING_CUSTOM_TYPE,
	SDD_SESSION_BINDING_EVENT_CHANNEL,
	serializeSessionBindingLaunchMetadataV1,
} from "../ein-pi/agent/lib/sdd-session-binding.ts";

type Handler = (event: unknown, ctx: unknown) => void;
type CommandHandler = (args: string | string[], ctx: unknown) => void | Promise<void>;
type WidgetPaint = {
	key: string;
	lines: string[];
	options: { placement?: string } | undefined;
};
type AppendedEntry = { customType: string; data: unknown };
type FakeSession = { getEntries: () => readonly unknown[] };

/** Minimal extension API double: captures lifecycle handlers, bus listeners, and custom entries. */
function fakePi(trace: string[] = []): {
	pi: unknown;
	appended: AppendedEntry[];
	sentUserMessages: string[];
	fire: (event: string, ctx: unknown, payload?: unknown) => void;
	emit: (payload: unknown) => void;
	runCommand: (name: string, args: string | string[], ctx: unknown) => Promise<void>;
	listenerCount: () => number;
} {
	const handlers = new Map<string, Handler[]>();
	const commands = new Map<string, CommandHandler>();
	const busHandlers = new Set<(payload: unknown) => void>();
	const appended: AppendedEntry[] = [];
	const sentUserMessages: string[] = [];
	const pi = {
		on(event: string, handler: Handler) {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		events: {
			on(channel: string, handler: (payload: unknown) => void) {
				if (channel === SDD_SESSION_BINDING_EVENT_CHANNEL) busHandlers.add(handler);
				return () => busHandlers.delete(handler);
			},
			emit(channel: string, payload: unknown) {
				if (channel === SDD_SESSION_BINDING_EVENT_CHANNEL) {
					for (const handler of [...busHandlers]) handler(payload);
				}
			},
		},
		appendEntry(customType: string, data: unknown) {
			trace.push("append");
			appended.push({ customType, data });
		},
		registerCommand(name: string, command: { handler: CommandHandler }) {
			commands.set(name, command.handler);
		},
		registerTool() {},
		registerShortcut() {},
		sendUserMessage(message: string) { sentUserMessages.push(message); },
	};
	return {
		pi,
		appended,
		sentUserMessages,
		fire: (event, ctx, payload = {}) => {
			for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
		},
		emit: (payload) => {
			for (const handler of [...busHandlers]) handler(payload);
			trace.push("returned");
		},
		runCommand: async (name, args, ctx) => {
			const handler = commands.get(name);
			if (!handler) throw new Error(`Missing command: ${name}`);
			await handler(args, ctx);
			trace.push("command-returned");
		},
		listenerCount: () => busHandlers.size,
	};
}

function addChange(cwd: string, name: string): void {
	const change = join(cwd, "openspec", "changes", name);
	mkdirSync(change, { recursive: true });
	writeFileSync(join(change, "scope.md"), "# Scope\n");
	writeFileSync(join(change, "design.md"), "# Design\n");
	writeFileSync(join(change, "tasks.md"), "## Grupo 001\n- [ ] 001 una tarea\n");
}

function markChangeReadyToClose(cwd: string, name: string): void {
	const change = join(cwd, "openspec", "changes", name);
	const files = {
		"scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture\n",
		"map.md": "# Map\n",
		"design.md": "# Design\n",
		"tasks.md": "status: ready\n- [x] done\n",
		"apply-progress.md": "status: complete\n",
		"verify-report.md": "status: pass\n",
		"summary.md": [
			"status: complete",
			`change: ${name}`,
			"work_groups: 1",
			"verification_status: pass",
			"",
			"## // 000. RESUMEN",
			"Cierre de fixture.",
			"## // 001. QUÉ CAMBIÓ",
			"- Fixture.",
			"## // 002. CÓMO FUNCIONA POR DENTRO",
			"El cierre consume los artefactos.",
			"## // 003. DECISIONES",
			"- Ninguna.",
			"## // 004. VERIFICACIÓN",
			"- verify: `bun test tests/sdd-overlay-repaint.test.ts`",
			"## // 005. PENDIENTE / RIESGOS",
			"Ninguno.",
			"",
		].join("\n"),
	};
	for (const [file, contents] of Object.entries(files)) writeFileSync(join(change, file), contents);
}

function sandbox(names: readonly string[] = ["un-cambio"]): { cwd: string; cleanup: () => void } {
	const cwd = mkdtempSync(join(tmpdir(), "ein-overlay-repaint-"));
	for (const name of names) addChange(cwd, name);
	return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
}

function bindingEntry(data: unknown): unknown {
	return { type: "custom", customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data };
}

function fakeCtx(
	cwd: string,
	painted: WidgetPaint[],
	entries: readonly unknown[] = [],
	hasUI = true,
	trace: string[] = [],
): unknown {
	return {
		cwd,
		hasUI,
		sessionManager: { getEntries: () => entries } satisfies FakeSession,
		ui: {
			notify() {},
			async select() {
				return "Ahora no";
			},
			setWidget(key: string, lines: readonly string[] | undefined, options?: { placement?: string }) {
				trace.push("paint");
				painted.push({ key, lines: lines ? [...lines] : [], options });
			},
		},
	};
}

function lastLines(painted: readonly WidgetPaint[]): string[] {
	return painted.at(-1)?.lines ?? [];
}

describe("session-local overlay focus", () => {
	test("session fresh shows the only active change without requiring a binding", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, appended } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", fakeCtx(box.cwd, painted), { reason: "new" });

			expect(lastLines(painted).join("\n")).toContain("un-cambio");
			expect(appended).toEqual([]);
		} finally {
			box.cleanup();
		}
	});

	test("session fresh declares ambiguity when several changes are active", () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, appended } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", fakeCtx(box.cwd, painted), { reason: "new" });

			const output = lastLines(painted).join("\n");
			expect(output).toContain("2 cambios sin elegir");
			expect(output).toContain("alpha, beta");
			expect(appended).toEqual([]);
		} finally {
			box.cleanup();
		}
	});

	test("session fresh stays empty when the project has no active changes", () => {
		const box = sandbox([]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", fakeCtx(box.cwd, painted), { reason: "new" });

			expect(lastLines(painted)).toEqual([]);
		} finally {
			box.cleanup();
		}
	});

	test("session resume restores only the newest valid entry from its own manager", () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);
			const alpha = [bindingEntry({ version: 1, state: "bound", change: "alpha" })];
			const beta = [bindingEntry({ version: 1, state: "bound", change: "beta" })];

			fire("session_start", fakeCtx(box.cwd, painted, alpha), { reason: "resume" });
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(lastLines(painted).join("\n")).not.toContain("beta");

			fire("session_start", fakeCtx(box.cwd, painted, beta), { reason: "resume" });
			expect(lastLines(painted).join("\n")).toContain("beta");
			expect(lastLines(painted).join("\n")).not.toContain("alpha");
		} finally {
			box.cleanup();
		}
	});

	test("session malformed newest entry clears once and falls back to project state", () => {
		const box = sandbox(["alpha"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, appended } = fakePi();
			createOverlayExtension(pi as never);
			const entries = [
				bindingEntry({ version: 1, state: "bound", change: "alpha" }),
				bindingEntry({ version: 1, state: "bound", change: "alpha", extra: true }),
			];

			fire("session_start", fakeCtx(box.cwd, painted, entries), { reason: "resume" });
			fire("tool_execution_end", fakeCtx(box.cwd, painted, entries));

			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "unbound" } },
			]);
		} finally {
			box.cleanup();
		}
	});

	test("session clear, missing, archived, and unsafe bindings fall back without inventing focus", () => {
		const cases: Array<{
			name: string;
			prepare?: (cwd: string) => string;
			data: unknown;
			expectsClear: boolean;
			expectsText: string;
		}> = [
			{ name: "clear", data: { version: 1, state: "unbound" }, expectsClear: false, expectsText: "alpha, beta" },
			{ name: "missing", data: { version: 1, state: "bound", change: "missing" }, expectsClear: true, expectsText: "alpha, beta" },
			{ name: "unsafe", data: { version: 1, state: "bound", change: "../alpha" }, expectsClear: true, expectsText: "alpha, beta" },
			{
				name: "archived",
				data: { version: 1, state: "bound", change: "alpha" },
				prepare: (cwd) => {
					mkdirSync(join(cwd, "openspec", "changes", "archive"), { recursive: true });
					renameSync(
						join(cwd, "openspec", "changes", "alpha"),
						join(cwd, "openspec", "changes", "archive", "alpha"),
					);
					return cwd;
				},
				expectsClear: true,
				expectsText: "beta",
			},
		];

		for (const scenario of cases) {
			const box = sandbox(["alpha", "beta"]);
			try {
				const cwd = scenario.prepare?.(box.cwd) ?? box.cwd;
				const painted: WidgetPaint[] = [];
				const { pi, fire, appended } = fakePi();
				createOverlayExtension(pi as never);
				fire("session_start", fakeCtx(cwd, painted, [bindingEntry(scenario.data)]), { reason: "resume" });
				const output = lastLines(painted).join("\n");
				expect(output, scenario.name).toContain(scenario.expectsText);
				expect(appended.length, scenario.name).toBe(scenario.expectsClear ? 1 : 0);
			} finally {
				box.cleanup();
			}
		}

		const box = sandbox(["alpha"]);
		const moved = `${box.cwd}-moved`;
		try {
			renameSync(box.cwd, moved);
			writeFileSync(box.cwd, "not a project directory");
			const painted: WidgetPaint[] = [];
			const { pi, fire, appended } = fakePi();
			createOverlayExtension(pi as never);
			fire(
				"session_start",
				fakeCtx(box.cwd, painted, [bindingEntry({ version: 1, state: "bound", change: "alpha" })]),
				{ reason: "resume" },
			);
			expect(lastLines(painted)).toEqual([]);
			expect(appended).toHaveLength(1);
		} finally {
			rmSync(box.cwd, { force: true });
			rmSync(moved, { recursive: true, force: true });
		}
	});

	test("session launch intent is consumed on resume, deleted, persisted, and never reused", () => {
		const box = sandbox(["alpha"]);
		const previous = process.env[EIN_SDD_SESSION_BINDING_ENV_KEY];
		try {
			process.env[EIN_SDD_SESSION_BINDING_ENV_KEY] = serializeSessionBindingLaunchMetadataV1({
				version: 1,
				change: "alpha",
				projectCwd: box.cwd,
			});
			const painted: WidgetPaint[] = [];
			const { pi, fire, appended } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", fakeCtx(box.cwd, painted), { reason: "resume" });
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(process.env[EIN_SDD_SESSION_BINDING_ENV_KEY]).toBeUndefined();
			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "alpha" } },
			]);

			fire("session_start", fakeCtx(box.cwd, painted), { reason: "new" });
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(appended).toHaveLength(1);
		} finally {
			if (previous === undefined) delete process.env[EIN_SDD_SESSION_BINDING_ENV_KEY];
			else process.env[EIN_SDD_SESSION_BINDING_ENV_KEY] = previous;
			box.cleanup();
		}
	});
});

describe("session binding event listener", () => {
	test("event bind appends V1 and repaints before emit returns", () => {
		const box = sandbox(["alpha"]);
		try {
			const trace: string[] = [];
			const painted: WidgetPaint[] = [];
			const { pi, fire, emit, appended } = fakePi(trace);
			createOverlayExtension(pi as never);
			fire("session_start", fakeCtx(box.cwd, painted, [], true, trace), { reason: "startup" });
			trace.length = 0;

			emit({ version: 1, action: "bind", change: "alpha" });

			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "alpha" } },
			]);
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(trace).toEqual(["append", "paint", "returned"]);
		} finally {
			box.cleanup();
		}
	});

	test("event payloads fail closed, deduplicate, and invalidate only the current focus", () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, emit, appended } = fakePi();
			createOverlayExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);
			fire("session_start", ctx, { reason: "startup" });

			emit({ version: 1, action: "bind", change: "alpha", extra: true });
			emit({ version: 1, action: "bind", change: "missing" });
			emit({ version: 1, action: "bind", change: "alpha" });
			emit({ version: 1, action: "bind", change: "alpha" });
			const afterBind = painted.length;
			emit({ version: 1, action: "invalidate", change: "beta" });
			fire("tool_execution_end", ctx);
			fire("tool_execution_end", ctx);

			expect(painted).toHaveLength(afterBind);
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "alpha" } },
			]);

			emit({ version: 1, action: "invalidate", change: "alpha" });
			expect(lastLines(painted).join("\n")).toContain("2 cambios sin elegir");
			expect(appended.at(-1)).toEqual({
				customType: SDD_SESSION_BINDING_CUSTOM_TYPE,
				data: { version: 1, state: "unbound" },
			});

			emit({ version: 1, action: "bind", change: "beta" });
			emit({ version: 1, action: "clear" });
			expect(lastLines(painted).join("\n")).toContain("2 cambios sin elegir");
			expect(appended.slice(-2)).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "beta" } },
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "unbound" } },
			]);
		} finally {
			box.cleanup();
		}
	});

	test("event listener tears down and rebinds without repainting a retired context", () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const oldPainted: WidgetPaint[] = [];
			const currentPainted: WidgetPaint[] = [];
			const { pi, fire, emit, listenerCount } = fakePi();
			createOverlayExtension(pi as never);
			fire("session_start", fakeCtx(box.cwd, oldPainted), { reason: "startup" });
			expect(listenerCount()).toBe(1);

			fire("session_start", fakeCtx(box.cwd, currentPainted), { reason: "resume" });
			expect(listenerCount()).toBe(1);
			const oldCount = oldPainted.length;
			emit({ version: 1, action: "bind", change: "beta" });
			expect(oldPainted).toHaveLength(oldCount);
			expect(lastLines(currentPainted).join("\n")).toContain("beta");

			fire("session_shutdown", fakeCtx(box.cwd, currentPainted));
			expect(listenerCount()).toBe(0);
			const currentCount = currentPainted.length;
			emit({ version: 1, action: "clear" });
			expect(currentPainted).toHaveLength(currentCount);
		} finally {
			box.cleanup();
		}
	});
});

describe("sdd-next session binding", () => {
	test("sdd-next binds one explicitly named active change and repaints before the command returns", async () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const trace: string[] = [];
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi(trace);
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted, [], true, trace);
			fire("session_start", ctx, { reason: "startup" });
			trace.length = 0;

			await runCommand("ein:sdd-next", "alpha", ctx);

			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "alpha" } },
			]);
			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(trace).toEqual(["append", "paint", "command-returned"]);
		} finally {
			box.cleanup();
		}
	});

	test("sdd-next does not bind unnamed, unsafe, or inactive changes", async () => {
		const box = sandbox(["alpha"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi();
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);
			fire("session_start", ctx, { reason: "startup" });
			const paintsAfterStart = painted.length;

			await runCommand("ein:sdd-next", "", ctx);
			await runCommand("ein:sdd-next", "../alpha", ctx);
			await runCommand("ein:sdd-next", "missing", ctx);

			expect(appended).toEqual([]);
			expect(painted).toHaveLength(paintsAfterStart);
			expect(lastLines(painted).join("\n")).toContain("alpha");
		} finally {
			box.cleanup();
		}
	});
});

describe("manual session focus", () => {
	test("ein:focus binds and repaints without dispatching SDD work", async () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended, sentUserMessages } = fakePi();
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);
			fire("session_start", ctx, { reason: "new" });

			await runCommand("ein:focus", "beta", ctx);

			expect(lastLines(painted).join("\n")).toContain("beta");
			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "bound", change: "beta" } },
			]);
			expect(sentUserMessages).toEqual([]);
		} finally {
			box.cleanup();
		}
	});

	test("ein:focus rejects absent and unsafe changes without replacing ambiguity", async () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi();
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const ctx = fakeCtx(box.cwd, painted);
			fire("session_start", ctx, { reason: "new" });

			await runCommand("ein:focus", "missing", ctx);
			await runCommand("ein:focus", "../alpha", ctx);

			expect(lastLines(painted).join("\n")).toContain("2 cambios sin elegir");
			expect(appended).toEqual([]);
		} finally {
			box.cleanup();
		}
	});
});

describe("sdd-close session binding invalidation", () => {
	test("close clears the focused change immediately and only once across later refreshes", async () => {
		const box = sandbox(["alpha"]);
		try {
			markChangeReadyToClose(box.cwd, "alpha");
			const trace: string[] = [];
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi(trace);
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const entries = [bindingEntry({ version: 1, state: "bound", change: "alpha" })];
			const ctx = fakeCtx(box.cwd, painted, entries, true, trace);
			fire("session_start", ctx, { reason: "resume" });
			trace.length = 0;

			await runCommand("ein:sdd-close", "alpha", ctx);
			fire("tool_execution_end", ctx);
			fire("tool_execution_end", ctx);

			expect(lastLines(painted)).toEqual([]);
			expect(appended).toEqual([
				{ customType: SDD_SESSION_BINDING_CUSTOM_TYPE, data: { version: 1, state: "unbound" } },
			]);
			expect(trace.slice(0, 3)).toEqual(["append", "paint", "command-returned"]);
		} finally {
			box.cleanup();
		}
	});

	test("close leaves a different focused change untouched", async () => {
		const box = sandbox(["alpha", "beta"]);
		try {
			markChangeReadyToClose(box.cwd, "alpha");
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi();
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const entries = [bindingEntry({ version: 1, state: "bound", change: "beta" })];
			const ctx = fakeCtx(box.cwd, painted, entries);
			fire("session_start", ctx, { reason: "resume" });
			const paintsAfterStart = painted.length;

			await runCommand("ein:sdd-close", "alpha", ctx);
			fire("tool_execution_end", ctx);
			fire("tool_execution_end", ctx);

			expect(lastLines(painted).join("\n")).toContain("beta");
			expect(painted).toHaveLength(paintsAfterStart);
			expect(appended).toEqual([]);
		} finally {
			box.cleanup();
		}
	});

	test("failed close does not clear the focused change", async () => {
		const box = sandbox(["alpha"]);
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire, runCommand, appended } = fakePi();
			createOverlayExtension(pi as never);
			createAiExtension(pi as never);
			const entries = [bindingEntry({ version: 1, state: "bound", change: "alpha" })];
			const ctx = fakeCtx(box.cwd, painted, entries);
			fire("session_start", ctx, { reason: "resume" });
			const paintsAfterStart = painted.length;

			await runCommand("ein:sdd-close", "alpha", ctx);

			expect(lastLines(painted).join("\n")).toContain("alpha");
			expect(painted).toHaveLength(paintsAfterStart);
			expect(appended).toEqual([]);
		} finally {
			box.cleanup();
		}
	});
});

describe("la cache de pintura del overlay", () => {
	test("repaints changes written by an async child without a parent tool event", async () => {
		const box = sandbox();
		const painted: WidgetPaint[] = [];
		const { pi, fire } = fakePi();
		createOverlayExtension(pi as never);
		const ctx = fakeCtx(box.cwd, painted, []);
		try {
			fire("session_start", ctx);
			const before = lastLines(painted).join("\n");
			writeFileSync(join(box.cwd, "openspec/changes/un-cambio/tasks.md"), "status: ready\n- [x] Live child completion\n");
			const deadline = Date.now() + 2000;
			while (lastLines(painted).join("\n") === before && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
			expect(lastLines(painted).join("\n")).not.toBe(before);
			await new Promise((resolve) => setTimeout(resolve, 80));
			const completed = lastLines(painted).join("\n");
			writeFileSync(join(box.cwd, "openspec/changes/un-cambio/tasks.md"), "status: ready\n- [ ] Next live task\n");
			const nextDeadline = Date.now() + 2000;
			while (lastLines(painted).join("\n") === completed && Date.now() < nextDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
			expect(lastLines(painted).join("\n")).not.toBe(completed);
			fire("session_shutdown", ctx);
			const count = painted.length;
			writeFileSync(join(box.cwd, "openspec/changes/un-cambio/tasks.md"), "status: ready\n- [ ] After shutdown\n");
			await new Promise((resolve) => setTimeout(resolve, 80));
			expect(painted.length).toBe(count);
		} finally { fire("session_shutdown", ctx); box.cleanup(); }
	});
	test("pinta TODO sobre el editor con una identidad estable y deduplica dentro de la sesion", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);
			const entries = [bindingEntry({ version: 1, state: "bound", change: "un-cambio" })];
			const ctx = fakeCtx(box.cwd, painted, entries);

			fire("session_start", ctx, { reason: "resume" });
			const afterStart = painted.length;
			fire("tool_execution_end", ctx);
			fire("tool_execution_end", ctx);

			expect(painted.length).toBe(afterStart);
			expect(afterStart).toBeGreaterThan(0);
			expect(painted.every(({ key }) => key === "ein-sdd")).toBe(true);
			expect(painted.every(({ options }) => options?.placement === "aboveEditor")).toBe(true);
		} finally {
			box.cleanup();
		}
	});

	test("un arranque nuevo repinta aunque el contenido sea el mismo", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);
			const entries = [bindingEntry({ version: 1, state: "bound", change: "un-cambio" })];
			const ctx = fakeCtx(box.cwd, painted, entries);

			fire("session_start", ctx, { reason: "resume" });
			const afterFirst = painted.length;
			fire("session_start", ctx, { reason: "resume" });

			expect(painted.length).toBeGreaterThan(afterFirst);
		} finally {
			box.cleanup();
		}
	});

	test("sin UI no se pinta nada", () => {
		const box = sandbox();
		try {
			const painted: WidgetPaint[] = [];
			const { pi, fire } = fakePi();
			createOverlayExtension(pi as never);

			fire("session_start", fakeCtx(box.cwd, painted, [], false), { reason: "startup" });

			expect(painted).toEqual([]);
		} finally {
			box.cleanup();
		}
	});
});
