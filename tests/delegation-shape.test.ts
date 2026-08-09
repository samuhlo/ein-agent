// =============================================================================
// TESTS: lib/delegation-shape — forma de la delegación (workflowScript + legacy)
// =============================================================================
// REGRESIÓN -> pi-subagents 0.44 movió la ejecución a `workflowScript` y TODOS
// los inspectores de Ein quedaron ciegos a la vez: el gate de entrega dejó de
// emitir el grant (todo push delegado bloqueado, y ninguna confirmación), el
// gate de TDD dejó de preguntar, las fases de planificación perdieron su
// `acceptance: none` y el scout su contrato acotado. Estos tests fijan la forma
// nueva Y la legacy: un downgrade del runtime no debe apagar los gates.
// Usa EIN_PI_CONFIG_HOME temporal (el gate de entrega escribe el grant).
// =============================================================================

import { beforeAll, afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_HOME = join(tmpdir(), "ein-agent-tests", "delegation-shape");
process.env.EIN_PI_CONFIG_HOME = TEST_CONFIG_HOME;

const {
	collectDelegationAgentNames,
	collectDelegationItems,
	collectDelegationTaskTexts,
	delegationShapeIsUnrecognized,
	delegationTargetsOnly,
	parseWorkflowScriptDelegations,
	workflowScriptFansOut,
} = await import("../ein-pi/agent/lib/delegation-shape");

const {
	confirmCommand,
	confirmDelegatedDelivery,
	consumeDelegatedDelivery,
	delegationIsDelivery,
	deliveryGrantPath,
} = await import("../ein-pi/agent/lib/guardrails");

const {
	delegationIsPlanningOnly,
	delegationStartsScope,
	delegationTargetsApply,
	ensureApplyAcceptance,
	ensureApplyTurnBudget,
	ensurePlanningAcceptance,
	readDelegationTddHint,
} = await import("../ein-pi/agent/lib/sdd-preflight");

const { resolveDelegationPhase } = await import("../ein-pi/agent/lib/sdd-reconcile");
const { normalizeScoutLaunch } = await import("../ein-pi/agent/lib/scout-contract");

const CWD = "/tmp/proyecto-irrelevante";

function ctxStub(hasUI: boolean, confirmAnswer = true) {
	const calls: string[] = [];
	return {
		ctx: { hasUI, cwd: CWD, ui: { confirm: async (_t: string, preview: string) => { calls.push(preview); return confirmAnswer; } } } as never,
		calls,
	};
}

// La delegación exacta que la sesión de Pi mandó a ein-git y quedó bloqueada.
const DELIVERY_SCRIPT =
	`return runs.run("deliver", { agent: "ein-git", task: "EXPLICIT USER-AUTHORIZED DELIVERY: the user said exactly “haz push y abre PR”. Push branch feat/x to origin, then open the PR against main. Do not force-push." })`;

beforeAll(() => {
	rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
	mkdirSync(TEST_CONFIG_HOME, { recursive: true });
});

afterEach(() => {
	rmSync(deliveryGrantPath(), { force: true });
});

describe("parseWorkflowScriptDelegations", () => {
	test("extrae agente y task de un runs.run", () => {
		expect(parseWorkflowScriptDelegations(`return runs.run("deliver", { agent: "ein-git", task: "haz push" })`)).toEqual([
			{ agent: "ein-git", task: "haz push" },
		]);
	});

	test("no mezcla children: cada objeto literal es un item", () => {
		const script = `
			await runs.run("map", { agent: "sdd-map", task: "mapea el cambio" });
			return runs.run("apply", { agent: "sdd-apply", task: "implementa el corte", tdd: "strict" });
		`;
		expect(parseWorkflowScriptDelegations(script)).toEqual([
			{ agent: "sdd-map", task: "mapea el cambio" },
			{ agent: "sdd-apply", task: "implementa el corte", tdd: "strict" },
		]);
	});

	test("un objeto anidado no genera item propio", () => {
		const script = `runs.run("a", { agent: "sdd-apply", task: "t", turnBudget: { maxTurns: 5, graceTurns: 1 } })`;
		expect(parseWorkflowScriptDelegations(script)).toEqual([
			{ agent: "sdd-apply", task: "t" },
		]);
	});

	test("acepta template literals, claves entrecomilladas y comillas escapadas", () => {
		const script = "runs.run('x', { 'agent': 'ein-git', task: `haz push y abre PR\nsin force` })";
		expect(parseWorkflowScriptDelegations(script)).toEqual([
			{ agent: "ein-git", task: "haz push y abre PR\nsin force" },
		]);
		expect(parseWorkflowScriptDelegations(`runs.run('x', { agent: 'ein-git', task: 'abre el PR de \\'entrega\\'' })`)).toEqual([
			{ agent: "ein-git", task: "abre el PR de 'entrega'" },
		]);
	});

	test("ignora comentarios y valores no literales", () => {
		const script = `
			// runs.run("fake", { agent: "ein-git", task: "haz push" })
			/* agent: "ein-git" */
			return runs.run("apply", { agent: chosenAgent, task: "implementa" });
		`;
		expect(parseWorkflowScriptDelegations(script)).toEqual([{ task: "implementa" }]);
	});

	test("runs.all es fan-out aunque el array se construya en runtime", () => {
		expect(workflowScriptFansOut(`return runs.all(files.map((f) => ({ agent: "sdd-apply", task: f })))`)).toBe(true);
		expect(workflowScriptFansOut(DELIVERY_SCRIPT)).toBe(false);
	});
});

describe("collectDelegationItems", () => {
	test("lee la forma nueva y las legacy", () => {
		expect(collectDelegationAgentNames({ workflowScript: DELIVERY_SCRIPT })).toEqual(["ein-git"]);
		expect(collectDelegationAgentNames({ agent: "ein-git", task: "haz push" })).toEqual(["ein-git"]);
		expect(collectDelegationAgentNames({ steps: [{ agent: "sdd-map", task: "m" }, { agent: "sdd-design", task: "d" }] })).toEqual(["sdd-map", "sdd-design"]);
		expect(collectDelegationTaskTexts({ tasks: [{ agent: "sdd-apply", task: "implementa" }] })).toEqual(["implementa"]);
	});

	test("una llamada de GESTIÓN no es un lanzamiento", () => {
		// `action` presente → `agent` es el objeto gestionado, no un child.
		expect(collectDelegationItems({ action: "get", agent: "ein-git" })).toEqual([]);
		expect(delegationIsDelivery({ action: "get", agent: "ein-git" })).toBe(false);
	});

	test("delegationTargetsOnly exige que TODOS los children sean ese agente", () => {
		expect(delegationTargetsOnly({ workflowScript: `runs.run("a", { agent: "sdd-apply", task: "t" })` }, "sdd-apply")).toBe(true);
		expect(delegationTargetsOnly({ workflowScript: `runs.all([{ agent: "sdd-apply", task: "t" }, { agent: "sdd-verify", task: "v" }])` }, "sdd-apply")).toBe(false);
		expect(delegationTargetsOnly({}, "sdd-apply")).toBe(false);
	});
});

describe("canario de drift de forma", () => {
	test("avisa solo cuando una llamada de ejecución no produce ni un child", () => {
		// Lo que Ein vio durante el fallo: una forma que no sabe leer.
		expect(delegationShapeIsUnrecognized({ workflowScript: `return runs.status(id)` })).toBe(true);
		expect(delegationShapeIsUnrecognized({})).toBe(true);
		// Formas que sí se leen: nada que avisar.
		expect(delegationShapeIsUnrecognized({ workflowScript: DELIVERY_SCRIPT })).toBe(false);
		expect(delegationShapeIsUnrecognized({ agent: "sdd-map", task: "m" })).toBe(false);
		// Gestión: no ejecuta, los gates no le tocan.
		expect(delegationShapeIsUnrecognized({ action: "children.list" })).toBe(false);
	});
});

describe("gate de entrega sobre workflowScript", () => {
	test("reconoce la entrega por el agente destino dentro del script", () => {
		expect(delegationIsDelivery({ workflowScript: DELIVERY_SCRIPT })).toBe(true);
	});

	test("reconoce la entrega por la prosa aunque el agente no sea de entrega", () => {
		expect(delegationIsDelivery({ workflowScript: `runs.run("x", { agent: "worker", task: "cuando acabes, haz push y abre PR" })` })).toBe(true);
	});

	test("un script sin entrega no abre el grant", () => {
		expect(delegationIsDelivery({ workflowScript: `runs.run("x", { agent: "sdd-map", task: "mapea el cambio" })` })).toBe(false);
	});

	test("REGRESIÓN: auto + petición explícita emite grant y el push headless pasa", async () => {
		const { ctx, calls } = ctxStub(true);
		const result = await confirmDelegatedDelivery(
			{ workflowScript: DELIVERY_SCRIPT, async: false },
			ctx,
			{ mode: "auto", userRequested: true },
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(0);
		// El subagente headless canjea el grant en su `git push`.
		const child = ctxStub(false);
		expect(await confirmCommand("git push origin feat/x", child.ctx)).toBeUndefined();
	});

	test("modo ask: pregunta con la task del script como preview y emite grant al aprobar", async () => {
		const { ctx, calls } = ctxStub(true);
		expect(await confirmDelegatedDelivery({ workflowScript: DELIVERY_SCRIPT }, ctx, { mode: "ask", userRequested: false })).toBeUndefined();
		expect(calls.length).toBe(1);
		expect(calls[0]).toContain("Push branch feat/x");
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("modo ask + rechazo: bloquea la delegación y no deja grant", async () => {
		const { ctx } = ctxStub(true, false);
		const result = await confirmDelegatedDelivery({ workflowScript: DELIVERY_SCRIPT }, ctx, { mode: "ask", userRequested: false });
		expect(result?.block).toBe(true);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});
});

describe("shaping SDD sobre workflowScript", () => {
	const script = (agent: string, task = "t") => ({ workflowScript: `return runs.run("k", { agent: "${agent}", task: "${task}" })` });

	test("detecta scope y apply dentro del script", () => {
		expect(delegationStartsScope(script("sdd-scope"))).toBe(true);
		expect(delegationTargetsApply(script("sdd-apply"))).toBe(true);
		expect(delegationTargetsApply(script("sdd-map"))).toBe(false);
		expect(delegationTargetsApply({ workflowScript: `runs.all([{ agent: "sdd-map", task: "m" }, { agent: "sdd-apply", task: "a" }])` })).toBe(true);
	});

	test("planning-only inyecta acceptance: none", () => {
		expect(delegationIsPlanningOnly(script("sdd-design"))).toBe(true);
		expect(delegationIsPlanningOnly(script("sdd-apply"))).toBe(false);
		const input = script("sdd-design");
		expect(ensurePlanningAcceptance(input)).toBe(true);
		expect((input as Record<string, unknown>).acceptance).toMatchObject({ level: "none" });
	});

	test("apply solo recibe acceptance/turnBudget si es el único child", () => {
		const single = script("sdd-apply");
		expect(ensureApplyAcceptance(single)).toBe(true);
		expect(ensureApplyTurnBudget(single)).toBe(true);
		expect((single as Record<string, unknown>).turnBudget).toMatchObject({ maxTurns: 60 });
		// Mixto: el default bajaría a TODOS los children del workflow.
		const mixed = { workflowScript: `runs.all([{ agent: "sdd-apply", task: "a" }, { agent: "sdd-verify", task: "v" }])` };
		expect(ensureApplyAcceptance(mixed)).toBe(false);
		expect(ensureApplyTurnBudget(mixed)).toBe(false);
	});

	test("el hint de TDD del child de apply gana; strict no recibe cap de turnos", () => {
		const strict = { workflowScript: `runs.run("a", { agent: "sdd-apply", task: "implementa", tdd: "strict" })` };
		expect(readDelegationTddHint(strict)).toBe("strict");
		expect(ensureApplyTurnBudget(strict)).toBe(false);
	});

	test("resuelve la fase para reconciliar un ✗ con artefacto entregado", () => {
		expect(resolveDelegationPhase(script("sdd-map"))).toBe("map");
		expect(resolveDelegationPhase({ workflowScript: `runs.all([{ agent: "sdd-map", task: "m" }, { agent: "sdd-design", task: "d" }])` })).toBeNull();
	});
});

describe("contrato del scout sobre workflowScript", () => {
	test("aplica el contrato como defaults de workflow y fuerza foreground", () => {
		const tracking = new Map<string, string>();
		const launch = normalizeScoutLaunch({ workflowScript: `return runs.run("scout", { agent: "ein-scout", task: "investiga X" })` }, "call-1", tracking);
		expect(launch).toMatchObject({
			async: false,
			context: "fresh",
			maxRuntimeMs: 120_000,
			toolBudget: { hard: 30, soft: 24, block: "*" },
		});
		// `agent` a nivel raíz es el target de GESTIÓN del runtime: no se escribe.
		expect(launch && "agent" in launch).toBe(false);
		expect(tracking.get("call-1")).toBe("pending");
	});

	test("rechaza un fan-out: un reporte no puede atarse a varios children", () => {
		expect(() => normalizeScoutLaunch({ workflowScript: `return runs.all([{ agent: "ein-scout", task: "a" }, { agent: "ein-scout", task: "b" }])` }, "call-2", new Map())).toThrow(/unsupported/);
	});

	test("no toca delegaciones que no son del scout", () => {
		expect(normalizeScoutLaunch({ workflowScript: DELIVERY_SCRIPT }, "call-3", new Map())).toBeUndefined();
	});
});
