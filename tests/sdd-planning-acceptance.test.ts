// =============================================================================
// TESTS: acceptance determinista de fases de planificación + TDD en preflight
// -----------------------------------------------------------------------------
// A) delegationIsPlanningOnly / ensurePlanningAcceptance: inyectan
//    `acceptance: none` en delegaciones documentales (scope/map/design/tasks/
//    close) para que el runner no rechace en falso — sin depender de que el
//    orquestador recuerde pasarlo.
// B) collectSddPreflightPreferences: el TDD se elige AL INICIO (off/strict/auto)
//    junto al modo de ejecución, en vez de leerse en silencio del config.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	collectSddPreflightPreferences,
	delegationIsPlanningOnly,
	ensurePlanningAcceptance,
} from "../ein-pi/agent/lib/sdd-preflight";

describe("delegationIsPlanningOnly", () => {
	test("agente único de planificación → true", () => {
		for (const agent of ["sdd-scope", "sdd-map", "sdd-design", "sdd-tasks", "sdd-close"]) {
			expect(delegationIsPlanningOnly({ agent, task: "x" })).toBe(true);
		}
	});

	test("apply/verify/otros → false", () => {
		expect(delegationIsPlanningOnly({ agent: "sdd-apply", task: "x" })).toBe(false);
		expect(delegationIsPlanningOnly({ agent: "sdd-verify", task: "x" })).toBe(false);
		expect(delegationIsPlanningOnly({ agent: "ein-git", task: "commit" })).toBe(false);
	});

	test("chain/tasks solo de planificación → true; con un apply → false", () => {
		expect(
			delegationIsPlanningOnly({ chain: [{ agent: "sdd-scope" }, { agent: "sdd-map" }] }),
		).toBe(true);
		expect(
			delegationIsPlanningOnly({ tasks: [{ agent: "sdd-map" }, { agent: "sdd-apply" }] }),
		).toBe(false);
	});

	test("entradas inválidas → false (no lanza)", () => {
		expect(delegationIsPlanningOnly(undefined)).toBe(false);
		expect(delegationIsPlanningOnly(null)).toBe(false);
		expect(delegationIsPlanningOnly("sdd-scope")).toBe(false);
		expect(delegationIsPlanningOnly({})).toBe(false);
		expect(delegationIsPlanningOnly({ chain: [] })).toBe(false);
	});
});

describe("ensurePlanningAcceptance", () => {
	test("inyecta acceptance:none en una fase de planificación sin acceptance", () => {
		const input: Record<string, unknown> = { agent: "sdd-scope", task: "x" };
		expect(ensurePlanningAcceptance(input)).toBe(true);
		expect(input.acceptance).toEqual({
			level: "none",
			reason: "ein_sdd_check gates this phase artifact deterministically",
		});
	});

	test("no pisa un acceptance explícito", () => {
		const input: Record<string, unknown> = {
			agent: "sdd-map",
			acceptance: { level: "verified" },
		};
		expect(ensurePlanningAcceptance(input)).toBe(false);
		expect(input.acceptance).toEqual({ level: "verified" });
	});

	test("no toca una delegación que escribe código", () => {
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "x" };
		expect(ensurePlanningAcceptance(input)).toBe(false);
		expect(input.acceptance).toBeUndefined();
	});
});

// Stub de ExtensionContext con ui.select/ui.input scripted por el texto del
// prompt (robusto al orden de las preguntas). cwd único por test: el override
// de TDD se guarda en un map keyed por cwd → reusar cwd contamina el siguiente.
let cwdSeq = 0;
function ctxStub(answers: { execution: string; tdd: string; memory?: string; chaining?: string; budget?: string }) {
	const notes: string[] = [];
	return {
		ctx: {
			hasUI: true,
			cwd: `/tmp/does-not-exist-planning-acceptance-${cwdSeq++}`,
			ui: {
				select: async (title: string, _opts: string[]) => {
					if (/execution mode/i.test(title)) return answers.execution;
					if (/strict tdd/i.test(title)) return answers.tdd;
					if (/notebook/i.test(title)) return answers.memory ?? "off";
					if (/chaining/i.test(title)) return answers.chaining ?? "auto-forecast";
					return _opts[0];
				},
				input: async () => answers.budget ?? "400",
				notify: (msg: string) => notes.push(msg),
			},
		} as never,
		notes,
	};
}

describe("collectSddPreflightPreferences — TDD elegido al inicio", () => {
	test("strict elegido → tddMode strict y ejecución respetada", async () => {
		const { ctx } = ctxStub({ execution: "auto", tdd: "strict" });
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.tddMode).toBe("strict");
		expect(prefs.executionMode).toBe("auto");
		expect(prefs.prompted).toBe(true);
	});

	test("off elegido → tddMode off", async () => {
		const { ctx } = ctxStub({ execution: "interactive", tdd: "off" });
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.tddMode).toBe("off");
		expect(prefs.executionMode).toBe("interactive");
	});

	test("auto elegido → sigue el config (sin config → auto)", async () => {
		const { ctx } = ctxStub({ execution: "interactive", tdd: "auto" });
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.tddMode).toBe("auto");
	});

	test("sin UI → defaults sin preguntar", async () => {
		const ctx = { hasUI: false, cwd: "/tmp/does-not-exist-planning-acceptance" } as never;
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.prompted).toBe(false);
		expect(prefs.executionMode).toBe("interactive");
	});
});
