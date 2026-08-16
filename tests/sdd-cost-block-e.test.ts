// =============================================================================
// TESTS: bloque E — bajar el coste de la fase apply
//   E0: withDefaultThinking → apply corre a thinking bajo (ejecuta, no razona).
//   E1: ensureApplyAcceptance → apply con acceptance:none (sdd-verify es el gate).
//   E4: ensureApplyTurnBudget → backstop de turnos contra thrashing.
//   E2: lint de tasks.md tolerante con un artefacto 100% cerrado.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { withDefaultThinking } from "../ein-pi/agent/lib/model-config";
import { ensureApplyAcceptance, ensureApplyTurnBudget } from "../ein-pi/agent/lib/sdd-preflight";
import { lintPhaseArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

describe("E0 — withDefaultThinking (apply ejecuta, no razona)", () => {
	test("sin thinking en config → apply recibe low", () => {
		expect(withDefaultThinking("sdd-apply", { model: "minimax/MiniMax-M3" })).toEqual({
			model: "minimax/MiniMax-M3",
			thinking: "low",
		});
		expect(withDefaultThinking("sdd-apply", undefined)).toEqual({ thinking: "low" });
	});

	test("thinking explícito (usuario/preset) gana", () => {
		expect(withDefaultThinking("sdd-apply", { model: "x", thinking: "high" })).toEqual({ model: "x", thinking: "high" });
	});

	test("las fases que razonan (design/orchestrator) no se fijan", () => {
		expect(withDefaultThinking("sdd-design", { model: "gpt-5.5" })).toEqual({ model: "gpt-5.5" });
		expect(withDefaultThinking("orchestrator", undefined)).toBeUndefined();
	});
});

describe("E1 — ensureApplyAcceptance", () => {
	test("una delegación sdd-apply sin acceptance → none", () => {
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "x" };
		expect(ensureApplyAcceptance(input)).toBe(true);
		expect(input.acceptance).toMatchObject({ level: "none" });
	});

	test("respeta un acceptance explícito (p.ej. verified)", () => {
		const input: Record<string, unknown> = { agent: "sdd-apply", acceptance: { level: "verified" } };
		expect(ensureApplyAcceptance(input)).toBe(false);
		expect(input.acceptance).toEqual({ level: "verified" });
	});

	test("no toca otros agentes ni entradas inválidas", () => {
		const design: Record<string, unknown> = { agent: "sdd-design" };
		expect(ensureApplyAcceptance(design)).toBe(false);
		expect(design.acceptance).toBeUndefined();
		expect(ensureApplyAcceptance(undefined)).toBe(false);
	});
});

describe("E4 — ensureApplyTurnBudget", () => {
	test("sdd-apply sin turnBudget → backstop inyectado", () => {
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "x" };
		expect(ensureApplyTurnBudget(input)).toBe(true);
		expect(input.turnBudget).toMatchObject({ maxTurns: expect.any(Number), graceTurns: expect.any(Number) });
	});

	test("respeta un turnBudget explícito y no toca otros agentes", () => {
		const explicit: Record<string, unknown> = { agent: "sdd-apply", turnBudget: { maxTurns: 5 } };
		expect(ensureApplyTurnBudget(explicit)).toBe(false);
		expect(explicit.turnBudget).toEqual({ maxTurns: 5 });
		const map: Record<string, unknown> = { agent: "sdd-map" };
		expect(ensureApplyTurnBudget(map)).toBe(false);
		expect(map.turnBudget).toBeUndefined();
	});

	test("TDD estricto → SIN cap de turnos (lo gobierna maxRuntimeMs)", () => {
		// Detectado por el marcador que el orquestador mete en la task.
		const strict: Record<string, unknown> = {
			agent: "sdd-apply",
			task: "Apply group 001. STRICT TDD MODE IS ACTIVE. Test runner en tasks.md.",
		};
		expect(ensureApplyTurnBudget(strict)).toBe(false);
		expect(strict.turnBudget).toBeUndefined();
	});

	test("apply normal → cap generoso (60), no el tight de 40 que abortaba trabajo real", () => {
		const input: Record<string, unknown> = { agent: "sdd-apply", task: "x" };
		expect(ensureApplyTurnBudget(input)).toBe(true);
		expect(input.turnBudget).toEqual({ maxTurns: 60, graceTurns: 3 });
	});
});

describe("E2 — lint de tasks.md tolerante con artefacto cerrado", () => {
	// Campos por-tarea que sdd-tasks fija y apply conserva (no son el problema).
	const FIELDS = "  - skills: `x`\n  - why: a\n  - learn: b\n  - architecture: c\n  - avoid: d\n  - verify: `bun test`\n";

	test("todas las casillas cerradas sin status ready|blocked → OK (fin del retry inútil)", () => {
		const r = lintPhaseArtifact("tasks", `- [x] 1 hecho\n${FIELDS}`);
		expect(r.ok).toBe(true);
	});

	// `status` bajó a warning: es una señal de planificación que ninguna
	// herramienta consume, y bloquear por ella mandaba el arreglo al ciclo de
	// fases para reescribir una línea de prosa.
	test("con casillas abiertas y sin status → warning, no bloquea", () => {
		const r = lintPhaseArtifact("tasks", `- [ ] 1 pendiente\n${FIELDS}`);
		expect(r.ok).toBe(true);
		expect(r.issues.find((i) => i.code === "missing-status-line")?.level).toBe("warning");
	});

	test("un status: complete (inválido) pero todo cerrado ya no rompe el gate", () => {
		const r = lintPhaseArtifact("tasks", `status: complete\n- [x] 1 hecho\n${FIELDS}`);
		expect(r.ok).toBe(true);
	});
});
