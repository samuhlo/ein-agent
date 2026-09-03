import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	formatApplyPacketObservation,
	observeNextApplyPacket,
} from "../ein-pi/agent/lib/apply-packet-observation";
import {
	APPLY_PACKET_OBSERVATION_CUSTOM_TYPE,
	APPLY_PACKET_OBSERVATION_RECORD_FORMAT,
	createApplyPacketObservationRecord,
	parseApplyPacketObservationRecord,
	summarizeApplyPacketObservations,
} from "../ein-pi/agent/lib/apply-packet-observation-record";
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

async function invokeApplyHook(root: string, options: { hasUI?: boolean; appendFails?: boolean } = {}) {
	let toolCall: ((event: any, ctx: any) => Promise<unknown>) | undefined;
	const notifications: string[] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => Promise<unknown>) {
			if (name === "tool_call") toolCall = handler;
		},
		appendEntry(customType: string, data: unknown) {
			if (options.appendFails) throw new Error("session unavailable");
			appended.push({ customType, data });
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
		hasUI: options.hasUI ?? true,
		ui: {
			notify: (message: string) => notifications.push(message),
			select: async () => "strict",
		},
		sessionManager: { getSessionId: () => "packet-observation-test" },
	});
	return { input, notifications, appended, result };
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
		const { input, notifications, appended, result } = await invokeApplyHook(root);
		expect(notifications.filter((message) => message.includes("Apply packet v2"))).toHaveLength(1);
		expect(notifications[0]).toContain("executable");
		expect(appended).toHaveLength(1);
		expect(appended[0]?.customType).toBe(APPLY_PACKET_OBSERVATION_CUSTOM_TYPE);
		expect(appended[0]?.data).toMatchObject({
			format: APPLY_PACKET_OBSERVATION_RECORD_FORMAT,
			status: "executable",
			toolCallId: "call-1",
			change: "demo",
			group: "Grupo vivo",
		});
		expect(JSON.stringify(appended[0]?.data)).not.toContain("readContext");
		expect(JSON.stringify(appended[0]?.data)).not.toContain("Aplica el grupo vivo");
		expect(result).toBeUndefined();
		expect(input).not.toHaveProperty("applyPacket");
	});

	test("persiste también sin UI y un fallo de sesión no bloquea apply", async () => {
		const headless = await invokeApplyHook(project(), { hasUI: false });
		expect(headless.appended).toHaveLength(1);
		expect(headless.notifications).toEqual([]);
		expect(headless.result).toBeUndefined();

		const failed = await invokeApplyHook(project(), { appendFails: true });
		expect(failed.appended).toEqual([]);
		expect(failed.notifications).toContain("Apply packet v2: observation not persisted · session unavailable");
		expect(failed.result).toBeUndefined();
	});

	for (const [expected, taskText] of [
		["incomplete", tasks({ behavior: "" })],
		["rejected", tasks({ edit: "`src/demo.ts` — cambiar algo" })],
		["unavailable", tasks().replace("## // 001. Grupo vivo\n\n", "")],
	] as const) {
			test(`el hook informa ${expected}, lo persiste y conserva la delegación`, async () => {
				const { input, notifications, appended, result } = await invokeApplyHook(project(taskText));
				expect(notifications.filter((message) => message.includes("Apply packet v2"))).toHaveLength(1);
				expect(notifications[0]).toContain(expected);
				expect(appended).toHaveLength(1);
				expect(appended[0]?.data).toMatchObject({ status: expected, toolCallId: "call-1" });
				expect(result).toBeUndefined();
				expect(input).not.toHaveProperty("applyPacket");
			});
		}
});

describe("recibo durable de apply-packet/v2", () => {
	test("el mismo packet produce un digest estable y no copia contenido libre", () => {
		const observation = observeNextApplyPacket(project());
		expect(observation.status).toBe("executable");
		const first = createApplyPacketObservationRecord(observation, {
			observedAt: "2026-09-03T10:00:00.000Z",
			toolCallId: "call-stable",
		});
		const second = createApplyPacketObservationRecord(observation, {
			observedAt: "2026-09-03T10:00:00.000Z",
			toolCallId: "call-stable",
		});
		expect(first).toEqual(second);
		expect(first.status).toBe("executable");
		if (first.status !== "executable") return;
		expect(first.packetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(parseApplyPacketObservationRecord(first)).toEqual(first);
		const raw = JSON.stringify(first);
		expect(raw).not.toContain("El grupo vivo queda observable");
		expect(raw).not.toContain("src/demo.ts");
	});

	test("el resumen separa estados, paquetes distintos, malformed y ausencia", () => {
		const executable = createApplyPacketObservationRecord(observeNextApplyPacket(project()), {
			observedAt: "2026-09-03T10:00:00.000Z",
			toolCallId: "call-1",
		});
		const incomplete = createApplyPacketObservationRecord(observeNextApplyPacket(project(tasks({ behavior: "" }), "otro")), {
			observedAt: "2026-09-03T10:01:00.000Z",
			toolCallId: "call-2",
		});
		const report = summarizeApplyPacketObservations([executable, executable, incomplete], 2);
		expect(report).toEqual({
			observed: 3,
			malformed: 2,
			byStatus: { executable: 2, incomplete: 1, rejected: 0, unavailable: 0 },
			distinctExecutablePackets: 1,
			distinctChanges: 2,
			currentExecutableStreak: 0,
			currentStreakDistinctChanges: 0,
			executableRate: { status: "known", value: 2 / 3 },
			latestObservedAt: { status: "known", value: "2026-09-03T10:01:00.000Z" },
		});
		expect(summarizeApplyPacketObservations([], 0).executableRate).toEqual({ status: "unknown" });
		expect(parseApplyPacketObservationRecord({ ...executable, task: "contenido no permitido" })).toBeNull();
	});

	test("las referencias largas se acotan con identidad hash y siguen siendo parseables", () => {
		const observation = observeNextApplyPacket(project());
		expect(observation.status).toBe("executable");
		if (observation.status !== "executable") return;
		const record = createApplyPacketObservationRecord({ ...observation, group: "á".repeat(2_000) }, {
			observedAt: "2026-09-03T10:02:00.000Z",
			toolCallId: "call-long",
		});
		expect(record.status).toBe("executable");
		if (record.status !== "executable") return;
		expect(Buffer.byteLength(record.group, "utf8")).toBeLessThanOrEqual(512);
		expect(record.group).toContain("sha256:");
		expect(parseApplyPacketObservationRecord(record)).toEqual(record);
	});

	test("la baseline previa queda congelada sin rutas locales ni éxito inventado", () => {
		const baseline = JSON.parse(readFileSync(join(import.meta.dir, "../evals/cheap-apply-accounting-baseline.json"), "utf8"));
		expect(baseline).toMatchObject({
			format: "cheap-apply-accounting-baseline/v1",
			corpus: { runs: 1003, runsAttributed: 999 },
			applyPackets: { observed: 0, malformed: 0, executableRate: "unknown" },
		});
		expect(JSON.stringify(baseline)).not.toContain("/Users/");
	});
});
