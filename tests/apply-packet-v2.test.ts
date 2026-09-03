import { describe, expect, test } from "bun:test";

import {
	APPLY_PACKET_V2_FORMAT,
	type ApplyPacketV2Draft,
	type ApplyPacketV2Validation,
	validateApplyPacketV2,
} from "../ein-pi/agent/lib/apply-packet";

const SOURCES = {
	"design.md": "digest-design",
	"tasks.md": "digest-tasks",
} as const;

function draft(overrides: Partial<ApplyPacketV2Draft> = {}): ApplyPacketV2Draft {
	return {
		format: APPLY_PACKET_V2_FORMAT,
		change: "make-apply-handoff-executable",
		group: "Contrato ejecutable por grupo",
		outcome: "El packet representa el grupo sin decisiones abiertas.",
		readContext: [
			"ein-pi/agent/lib/apply-packet.ts",
			"tests/apply-packet-v2.test.ts",
		],
		writeAllowlist: ["ein-pi/agent/lib/apply-packet.ts"],
		steps: [{
			taskId: "1.1",
			path: "ein-pi/agent/lib/apply-packet.ts",
			operation: "modify",
			intent: "Añadir el contrato v2 sin cambiar v1.",
		}],
		invariants: ["apply-packet/v1 conserva su comportamiento."],
		behaviorSeams: ["V2 rechaza un packet sin pasos."],
		checks: [{
			command: "bun test tests/apply-packet-v2.test.ts",
			covers: ["V2 rechaza un packet sin pasos."],
		}],
		stopConditions: ["Parar si v2 exige modificar el corpus v1."],
		sources: { ...SOURCES },
		...overrides,
	};
}

function fields(result: ApplyPacketV2Validation): string[] {
	return result.ok ? [] : result.issues.map((issue) => issue.field);
}

function codes(result: ApplyPacketV2Validation): string[] {
	return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("apply-packet/v2", () => {
	test("un grupo completo y fresco es ejecutable", () => {
		const result = validateApplyPacketV2(draft(), SOURCES);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.packet.format).toBe(APPLY_PACKET_V2_FORMAT);
		expect(result.packet.steps).toHaveLength(1);
	});

	test("sin pasos nunca es ejecutable", () => {
		const result = validateApplyPacketV2(draft({ steps: [] }), SOURCES);
		expect(result.ok).toBe(false);
		expect(fields(result)).toContain("steps");
		if (!result.ok) expect(result.level).toBe("incomplete");
	});

	test("cada ruta escribible debe estar en el contexto de lectura", () => {
		const result = validateApplyPacketV2(draft({ readContext: ["tests/apply-packet-v2.test.ts"] }), SOURCES);
		expect(result.ok).toBe(false);
		expect(fields(result)).toContain("writeAllowlist[0]");
		if (!result.ok) expect(result.level).toBe("rejected");
	});

	test("cada paso debe estar dentro de la frontera de escritura", () => {
		const result = validateApplyPacketV2(draft({ writeAllowlist: ["tests/apply-packet-v2.test.ts"] }), SOURCES);
		expect(result.ok).toBe(false);
		expect(fields(result)).toContain("steps[0].path");
	});

	test("un check puede nombrar un test no escribible sin conceder permiso", () => {
		const result = validateApplyPacketV2(draft(), SOURCES);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.packet.writeAllowlist).not.toContain("tests/apply-packet-v2.test.ts");
		expect(result.packet.checks[0]?.command).toContain("tests/apply-packet-v2.test.ts");
	});

	test("cada comportamiento debe quedar asociado a un check", () => {
		const result = validateApplyPacketV2(draft({ checks: [{ command: "bun run typecheck", covers: [] }] }), SOURCES);
		expect(result.ok).toBe(false);
		expect(fields(result)).toContain("behaviorSeams[0]");
	});

	test("design y tasks son las dos únicas fuentes declaradas", () => {
		const missing = validateApplyPacketV2(draft({ sources: { "tasks.md": SOURCES["tasks.md"] } }), SOURCES);
		expect(fields(missing)).toContain("sources.design.md");

		const extra = validateApplyPacketV2(
			draft({ sources: { ...SOURCES, "scope.md": "digest-scope" } }),
			{ ...SOURCES, "scope.md": "digest-scope" },
		);
		expect(fields(extra)).toContain("sources.scope.md");
	});

	test("una fuente obsoleta se rechaza nombrando la fuente", () => {
		const result = validateApplyPacketV2(draft(), { ...SOURCES, "tasks.md": "otro" });
		expect(codes(result)).toContain("stale-source");
		expect(fields(result)).toContain("sources.tasks.md");
	});

	test("una decisión pendiente dentro de un paso se rechaza", () => {
		const result = validateApplyPacketV2(draft({
			steps: [{
				taskId: "1.1",
				path: "ein-pi/agent/lib/apply-packet.ts",
				operation: "modify",
				intent: "Resolver [decidir cómo].",
			}],
		}), SOURCES);
		expect(codes(result)).toContain("unresolved-decision");
		expect(fields(result)).toContain("steps[0].intent");
	});

	test("rutas absolutas o con traversal nunca conceden permisos", () => {
		for (const path of ["/tmp/demo.ts", "../demo.ts", "src/../demo.ts", ".git/config"]) {
			const result = validateApplyPacketV2(draft({
				readContext: [path],
				writeAllowlist: [path],
				steps: [{ taskId: "1.1", path, operation: "modify", intent: "Cambiarlo." }],
			}), SOURCES);
			expect(codes(result)).toContain("out-of-scope");
		}
	});

	test("un valor no textual dentro de una frontera no desaparece en silencio", () => {
		const result = validateApplyPacketV2(draft({
			readContext: ["ein-pi/agent/lib/apply-packet.ts", 42 as never],
		}), SOURCES);
		expect(codes(result)).toContain("malformed");
		expect(fields(result)).toContain("readContext[1]");
	});

	test("input hostil devuelve issues y nunca lanza", () => {
		for (const value of [undefined, null, 3, [], "packet", { format: APPLY_PACKET_V2_FORMAT }]) {
			expect(() => validateApplyPacketV2(value, SOURCES)).not.toThrow();
			expect(validateApplyPacketV2(value, SOURCES).ok).toBe(false);
		}
	});
});
