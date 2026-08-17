import { describe, expect, test } from "bun:test";
import { ensurePhaseRuntime } from "../ein-pi/agent/lib/sdd-preflight.ts";

function delegation(agent: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { agent, task: "do the thing", ...extra };
}

describe("runtime por agente", () => {
	// La razón de existir: era prosa que le pedía al padre recordar qué número
	// pasar a cada fase, pagada en cada turno de cada sesión. Un valor que
	// depende del agente y de nada más es una tabla, no una decisión.
	test("cada fase recibe su runtime sin que el padre lo pase", () => {
		const cases: ReadonlyArray<readonly [string, number]> = [
			["sdd-apply", 1_800_000],
			["sdd-verify", 1_800_000],
			["sdd-map", 600_000],
			["sdd-design", 600_000],
			["sdd-tasks", 600_000],
			["sdd-scope", 300_000],
			["sdd-close", 300_000],
			["ein-git", 300_000],
		];
		for (const [agent, expected] of cases) {
			const input = delegation(agent);
			expect(ensurePhaseRuntime(input)).toBe(true);
			expect(input.maxRuntimeMs).toBe(expected);
		}
	});

	// La tabla es el default, no una política: el orquestador conserva la última
	// palabra cuando tiene un motivo concreto.
	test("un valor explícito del orquestador siempre gana", () => {
		const input = delegation("sdd-apply", { maxRuntimeMs: 2_700_000 });
		expect(ensurePhaseRuntime(input)).toBe(false);
		expect(input.maxRuntimeMs).toBe(2_700_000);
	});

	// En pi-subagents el campo baja a TODOS los children, así que fijarlo por uno
	// se lo aplicaría a los demás. Se deja intacta a propósito.
	test("una delegación mixta se deja intacta", () => {
		const input = { items: [{ agent: "sdd-apply", task: "a" }, { agent: "ein-git", task: "b" }] };
		expect(ensurePhaseRuntime(input)).toBe(false);
		expect(input).not.toHaveProperty("maxRuntimeMs");
	});

	test("un agente sin entrada en la tabla no recibe runtime inventado", () => {
		// ein-scout tiene su propio normalizador de lanzamiento, más estricto.
		for (const agent of ["ein-scout", "ein-linear", "ein-cleaner", "agente-inexistente"]) {
			const input = delegation(agent);
			expect(ensurePhaseRuntime(input)).toBe(false);
			expect(input).not.toHaveProperty("maxRuntimeMs");
		}
	});

	test("una entrada que no es una delegación no revienta", () => {
		for (const input of [null, undefined, "texto", 42, {}]) {
			expect(() => ensurePhaseRuntime(input)).not.toThrow();
			expect(ensurePhaseRuntime(input)).toBe(false);
		}
	});
});
