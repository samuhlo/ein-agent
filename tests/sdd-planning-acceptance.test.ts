// =============================================================================
// TESTS: acceptance determinista de fases de planificación + TDD en preflight
// -----------------------------------------------------------------------------
// A) delegationIsPlanningOnly / ensurePlanningAcceptance: inyectan
//    `acceptance: none` en delegaciones documentales (scope/map/design/tasks/
//    close) para que el runner no rechace en falso — sin depender de que el
//    orquestador recuerde pasarlo.
// B) collectSddPreflightPreferences: conserva las preferencias de sesión, pero
//    no abre un selector TDD/lane por cambio. La postura técnica procede del
//    valor persistido o del default y el gate la consume sin volver a preguntar.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	collectSddPreflightPreferences,
	delegationIsPlanningOnly,
	ensurePlanningAcceptance,
	gateTddForDelegation,
} from "../ein-pi/agent/lib/sdd-preflight";
import { writeTddMode } from "../ein-pi/agent/lib/tdd";

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
// prompt. Registra los títulos para demostrar que la superficie técnica retirada
// no reaparece. cwd único por test evita compartir preferencias de sesión.
let cwdSeq = 0;
function ctxStub(
	answers: { execution: string; memory?: string; budget?: string },
	cwd = `/tmp/does-not-exist-planning-acceptance-${cwdSeq++}`,
) {
	const notes: string[] = [];
	const selectTitles: string[] = [];
	return {
		ctx: {
			hasUI: true,
			cwd,
			ui: {
				select: async (title: string, opts: string[]) => {
					selectTitles.push(title);
					if (/execution mode/i.test(title)) return answers.execution;
					if (/notebook/i.test(title)) return answers.memory ?? "off";
					return opts[0];
				},
				input: async () => answers.budget ?? "400",
				notify: (msg: string) => notes.push(msg),
			},
		} as never,
		notes,
		selectTitles,
	};
}

describe("collectSddPreflightPreferences — postura técnica sin selector por cambio", () => {
	test("consume strict persistido y respeta la ejecución sin preguntar TDD", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-tdd-persisted-"));
		try {
			writeTddMode(cwd, "strict");
			const { ctx, selectTitles } = ctxStub({ execution: "auto" }, cwd);
			const prefs = await collectSddPreflightPreferences(ctx, false);
			expect(prefs.tddMode).toBe("strict");
			expect(prefs.executionMode).toBe("auto");
			expect(prefs.prompted).toBe(true);
			expect(selectTitles.some((title) => /strict tdd|tdd estricto|lane/i.test(title))).toBe(false);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("usa off por defecto y respeta la ejecución interactiva", async () => {
		const { ctx, selectTitles } = ctxStub({ execution: "interactive" });
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.tddMode).toBe("off");
		expect(prefs.executionMode).toBe("interactive");
		expect(selectTitles.some((title) => /strict tdd|tdd estricto|lane/i.test(title))).toBe(false);
	});

	test("las demás preferencias de sesión no alteran el default técnico", async () => {
		const { ctx, selectTitles } = ctxStub({ execution: "interactive", memory: "off", budget: "250" });
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.tddMode).toBe("off");
		expect(selectTitles.some((title) => /strict tdd|tdd estricto|lane/i.test(title))).toBe(false);
	});

	test("sin UI → defaults sin preguntar", async () => {
		const ctx = { hasUI: false, cwd: "/tmp/does-not-exist-planning-acceptance" } as never;
		const prefs = await collectSddPreflightPreferences(ctx, false);
		expect(prefs.prompted).toBe(false);
		expect(prefs.executionMode).toBe("interactive");
	});

	// El modo técnico legacy `ask` se proyecta como `auto` sin restaurar el
	// selector retirado; los gates posteriores consumen esa resolución.
	test("el preflight y el gate no preguntan TDD aunque el modo persistido sea `ask`", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-tdd-double-"));
		try {
			writeTddMode(cwd, "ask");
			let tddAsks = 0;
			const ctx = {
				hasUI: true,
				cwd,
				ui: {
					select: async (title: string, opts: string[]) => {
						if (/strict tdd|tdd estricto/i.test(title)) { tddAsks += 1; return "off"; }
						if (/execution mode/i.test(title)) return "interactive";
						if (/notebook/i.test(title)) return "off";
						return opts[0];
					},
					input: async () => "400",
					notify: () => {},
				},
			} as never;
			const prefs = await collectSddPreflightPreferences(ctx, false);
			expect(prefs.tddMode).toBe("auto");
			expect(tddAsks).toBe(0);
			await gateTddForDelegation({ agent: "sdd-scope", task: "x" }, ctx);
			await gateTddForDelegation({ agent: "sdd-apply", task: "y" }, ctx);
			expect(tddAsks).toBe(0);
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});
});
