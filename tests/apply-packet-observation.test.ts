import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	formatApplyPacketObservation,
	observeNextApplyPacket,
} from "../ein-pi/agent/lib/apply-packet-observation";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tasks(overrides: { behavior?: string; edit?: string } = {}): string {
	return [
		"# Tasks — demo",
		"",
		"status: ready",
		"blocked_by: none",
		"",
		"## // 001. Grupo vivo",
		"",
		"- outcome: El grupo vivo queda observable.",
		"",
		"- [ ] 1.1 Construir la observación.",
		"  - architecture: El núcleo no lee disco.",
		"  - avoid: No bloquear el apply.",
		"  - read: `src/demo.ts`",
		`  - edit: ${overrides.edit ?? "`src/demo.ts` | modify | Añadir el resultado observable."}`,
		`  - behavior: ${overrides.behavior ?? "El packet se observa una vez."}`,
		"  - stop: Parar si hay varios cambios.",
		"  - verify: `bun test tests/demo.test.ts`",
	].join("\n");
}

function project(taskText = tasks(), change = "demo"): string {
	const root = mkdtempSync(join(tmpdir(), "ein-packet-observation-"));
	roots.push(root);
	const changeDir = join(root, "openspec", "changes", change);
	mkdirSync(changeDir, { recursive: true });
	writeFileSync(join(changeDir, "design.md"), "# Design\n\nUn diseño actual.\n");
	writeFileSync(join(changeDir, "tasks.md"), taskText);
	return root;
}

function emptyProject(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-packet-observation-"));
	roots.push(root);
	mkdirSync(join(root, "openspec", "changes"), { recursive: true });
	return root;
}

async function invokeApplyHook(root: string) {
	let toolCall: ((event: any, ctx: any) => Promise<unknown>) | undefined;
	const notifications: string[] = [];
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => Promise<unknown>) {
			if (name === "tool_call") toolCall = handler;
		},
	};
	registerToolCallGate(pi as never, {
		intentGate: {
			adoptPiIntentGate: async () => undefined,
			piIntentToolBlockReason: () => null,
		} as never,
		scoutTracking: {} as never,
		rememberPhaseSnapshot: () => undefined,
	});
	if (!toolCall) throw new Error("tool_call hook no registrado");
	const input: Record<string, unknown> = {
		agent: "sdd-apply",
		task: "STRICT TDD MODE IS ACTIVE. Aplica el grupo vivo.",
	};
	const result = await toolCall({ toolName: "subagent", toolCallId: "call-1", input }, {
		cwd: root,
		hasUI: true,
		ui: {
			notify: (message: string) => notifications.push(message),
			select: async () => "strict",
		},
		sessionManager: { getSessionId: () => "packet-observation-test" },
	});
	return { input, notifications, result };
}

describe("observación viva de apply-packet/v2", () => {
	test("lee el único cambio y devuelve el próximo grupo ejecutable", () => {
		const root = project();
		const before = readdirSync(join(root, "openspec", "changes", "demo")).sort();
		const result = observeNextApplyPacket(root);
		expect(result.status).toBe("executable");
		if (result.status !== "executable") return;
		expect(result.change).toBe("demo");
		expect(result.group).toBe("Grupo vivo");
		expect(result.packet.sources["design.md"]).toMatch(/^[0-9a-f]{64}$/);
		expect(result.packet.sources["tasks.md"]).toMatch(/^[0-9a-f]{64}$/);
		expect(readdirSync(join(root, "openspec", "changes", "demo")).sort()).toEqual(before);
	});

	test("un packet incompleto conserva sus códigos", () => {
		const result = observeNextApplyPacket(project(tasks({ behavior: "" })));
		expect(result.status).toBe("incomplete");
		if (result.status !== "incomplete") return;
		expect(result.issues.map((issue) => issue.field)).toContain("behaviorSeams");
	});

	test("gramática edit ambigua se observa como rejected", () => {
		const result = observeNextApplyPacket(project(tasks({ edit: "`src/demo.ts` — cambiar algo" })));
		expect(result).toMatchObject({ status: "rejected", code: "invalid-edit-grammar" });
	});

	test("dos cambios activos se declaran unavailable sin elegir", () => {
		const root = project();
		const second = join(root, "openspec", "changes", "otro");
		mkdirSync(second, { recursive: true });
		writeFileSync(join(second, "design.md"), "# Design\n");
		writeFileSync(join(second, "tasks.md"), tasks());
		expect(observeNextApplyPacket(root)).toMatchObject({ status: "unavailable", code: "ambiguous-change" });
	});

	test("sin cambio activo se declara unavailable", () => {
		expect(observeNextApplyPacket(emptyProject())).toMatchObject({ status: "unavailable", code: "no-active-change" });
	});

	test("un artefacto que desaparece se declara unreadable sin lanzar", () => {
		const root = project();
		rmSync(join(root, "openspec", "changes", "demo", "design.md"));
		expect(observeNextApplyPacket(root)).toMatchObject({ status: "unavailable", code: "unreadable-artifact" });
	});

	test("sin grupo pendiente se declara unavailable", () => {
		const noHeading = tasks().replace("## // 001. Grupo vivo\n\n", "");
		expect(observeNextApplyPacket(project(noHeading))).toMatchObject({ status: "unavailable", code: "missing-group" });
	});

	test("el formato compacto distingue los cuatro estados sin volcar el packet", () => {
		const executable = observeNextApplyPacket(project());
		expect(formatApplyPacketObservation(executable)).toContain("packet v2: executable");
		expect(formatApplyPacketObservation(executable)).not.toContain("readContext");
		expect(formatApplyPacketObservation({ status: "incomplete", change: "c", group: "g", issues: [{ code: "missing-field", field: "steps", detail: "x" }] })).toContain("missing-field:steps");
		expect(formatApplyPacketObservation({ status: "rejected", change: "c", group: "g", code: "invalid-edit-grammar", detail: "x" })).toContain("rejected");
		expect(formatApplyPacketObservation({ status: "unavailable", code: "no-active-change", detail: "x" })).toContain("unavailable");
	});

	test("el hook notifica una vez y conserva report-only", async () => {
		const root = project();
		const { input, notifications, result } = await invokeApplyHook(root);
		expect(notifications.filter((message) => message.includes("Apply packet v2"))).toHaveLength(1);
		expect(notifications[0]).toContain("executable");
		expect(result).toBeUndefined();
		expect(input).not.toHaveProperty("applyPacket");
	});
});
