// =============================================================================
// TESTS: lib/guardrails
// Patrones denegados/guardados, y el grant one-shot de entrega delegada:
// el padre confirma el push al delegar y el guard headless del subagente
// consume el grant (una sola vez, con TTL y scope por cwd).
// Usa EIN_PI_CONFIG_HOME temporal.
// =============================================================================

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_CONFIG_HOME = join(tmpdir(), "ein-agent-tests", "guardrails");
process.env.EIN_PI_CONFIG_HOME = TEST_CONFIG_HOME;

const {
	commandRequiresConfirmation,
	confirmCommand,
	confirmDelegatedDelivery,
	consumeDelegatedDelivery,
	deliveryGrantPath,
	evaluateDeniedCommand,
	grantDelegatedDelivery,
	taskRequestsGuardedDelivery,
} = await import("../ein-pi/agent/lib/guardrails");

const CWD = "/tmp/proyecto-irrelevante";

// Stub mínimo del ExtensionContext: solo hasUI/cwd/ui.confirm se usan.
function ctxStub(hasUI: boolean, confirmAnswer = true) {
	const calls: string[] = [];
	return {
		ctx: {
			hasUI,
			cwd: CWD,
			ui: {
				confirm: async (_title: string, preview: string) => {
					calls.push(preview);
					return confirmAnswer;
				},
			},
		} as never,
		calls,
	};
}

beforeAll(() => {
	rmSync(TEST_CONFIG_HOME, { recursive: true, force: true });
	mkdirSync(TEST_CONFIG_HOME, { recursive: true });
});

afterEach(() => {
	rmSync(deliveryGrantPath(), { force: true });
});

describe("patrones bash", () => {
	test("deniega comandos destructivos", () => {
		expect(evaluateDeniedCommand("git reset --hard HEAD~1")?.block).toBe(true);
		expect(evaluateDeniedCommand("git push --force origin main")?.block).toBe(
			true,
		);
		expect(evaluateDeniedCommand("git push origin main")).toBeUndefined();
	});

	test("marca los comandos que exigen confirmación", () => {
		expect(commandRequiresConfirmation("git push origin main")).toBe(true);
		expect(commandRequiresConfirmation("git status")).toBe(false);
	});
});

describe("grant de entrega delegada", () => {
	test("se consume una sola vez", () => {
		grantDelegatedDelivery(CWD);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
		expect(consumeDelegatedDelivery(CWD)).toBe(false);
	});

	test("no vale para otro cwd y se consume igualmente", () => {
		grantDelegatedDelivery("/otro/proyecto");
		expect(consumeDelegatedDelivery(CWD)).toBe(false);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("caducado no vale", () => {
		writeFileSync(
			deliveryGrantPath(),
			JSON.stringify({ cwd: CWD, expiresAt: Date.now() - 1000 }),
		);
		expect(consumeDelegatedDelivery(CWD)).toBe(false);
	});

	test("corrupto no vale y desaparece", () => {
		writeFileSync(deliveryGrantPath(), "esto no es json");
		expect(consumeDelegatedDelivery(CWD)).toBe(false);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});
});

describe("confirmCommand headless", () => {
	test("bloquea push sin grant", async () => {
		const { ctx } = ctxStub(false);
		const result = await confirmCommand("git push origin main", ctx);
		expect(result?.block).toBe(true);
	});

	test("permite push con grant válido, una sola vez", async () => {
		const { ctx } = ctxStub(false);
		grantDelegatedDelivery(CWD);
		expect(await confirmCommand("git push origin main", ctx)).toBeUndefined();
		const second = await confirmCommand("git push origin main", ctx);
		expect(second?.block).toBe(true);
	});

	test("los comandos no guardados pasan sin grant", async () => {
		const { ctx } = ctxStub(false);
		expect(await confirmCommand("git status", ctx)).toBeUndefined();
	});
});

describe("confirmDelegatedDelivery (tool subagent)", () => {
	test("detecta intención de entrega delegada en español e inglés", () => {
		const positives = [
			"haz commit y push",
			"commit and push",
			"abre PR",
			"abre un PR",
			"open a pull request",
			"open PR",
			"sube la rama y abre PR",
		];

		for (const phrase of positives) {
			expect(taskRequestsGuardedDelivery(phrase), phrase).toBe(true);
		}
	});

	test("no emite entrega para commit local, negaciones o tareas sin delivery", () => {
		const negatives = [
			"haz commit pero sin push",
			"solo commit, no push",
			"commit only, do not push",
			"no abras PR",
			"do not open a pull request",
			"haz commit",
			"commit only",
			"explora el repo y resume",
		];

		for (const phrase of negatives) {
			expect(taskRequestsGuardedDelivery(phrase), phrase).toBe(false);
		}
	});

	test("detecta negación: 'sin push' cancela la intención de push", () => {
		// Negaciones explícitas: el usuario dice "haz X pero SIN push" → no pedir confirmación.
		expect(taskRequestsGuardedDelivery("haz commit pero sin push")).toBe(false);
		expect(taskRequestsGuardedDelivery("sin push")).toBe(false);
		expect(taskRequestsGuardedDelivery("do not push")).toBe(false);
		expect(taskRequestsGuardedDelivery("don't push, solo commit")).toBe(false);
		expect(taskRequestsGuardedDelivery("sin hacer push")).toBe(false);
		// Caso positivo: no hay negación, sí debería pedir confirmación.
		expect(taskRequestsGuardedDelivery("haz commit y push")).toBe(true);
	});

	test("negación POR VERBO: negar merge no cancela el PR/push afirmado", () => {
		// Antes cualquier negación cancelaba TODO el texto → el push/PR legítimo
		// quedaba sin grant y el guard headless lo bloqueaba (retry-loop).
		expect(taskRequestsGuardedDelivery("abre PR pero no hagas merge")).toBe(true);
		expect(taskRequestsGuardedDelivery("push la rama pero sin merge")).toBe(true);
		expect(taskRequestsGuardedDelivery("open a pull request, do not merge")).toBe(true);
		// El negador de OTRA cosa (en otra cláusula o lejos) no cancela el push.
		expect(taskRequestsGuardedDelivery("no toques los tests y haz push de la rama")).toBe(true);
		// Negado el único verbo de entrega → sigue siendo false.
		expect(taskRequestsGuardedDelivery("no abras PR todavía")).toBe(false);
	});

	test("'push' sin contexto de entrega no emite grant", () => {
		// Falsos positivos clásicos: features/APIs que contienen la palabra push.
		expect(taskRequestsGuardedDelivery("implementa push notifications")).toBe(false);
		expect(taskRequestsGuardedDelivery("arregla el push notification badge")).toBe(false);
		expect(taskRequestsGuardedDelivery("usa history.pushState en el router")).toBe(false);
		// Con contexto de entrega sí.
		expect(taskRequestsGuardedDelivery("push the branch to origin")).toBe(true);
		expect(taskRequestsGuardedDelivery("haz push de la rama")).toBe(true);
		expect(taskRequestsGuardedDelivery("pushea los cambios")).toBe(true);
		expect(taskRequestsGuardedDelivery("push")).toBe(true); // orden completa
	});

	// Modo por defecto en las pruebas clásicas: `ask` (siempre confirma).
	const ASK = { mode: "ask", userRequested: false } as const;

	test("delegación sin push no pregunta ni emite grant", async () => {
		const { ctx, calls } = ctxStub(true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-linear", task: "actualiza la issue SAM-366" },
			ctx,
			ASK,
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(0);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("modo ask: delegación con push aprobada emite grant one-shot", async () => {
		const { ctx, calls } = ctxStub(true, true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push de la rama y abre PR" },
			ctx,
			ASK,
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(1);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("modo ask: delegación para abrir PR aprobada emite grant one-shot", async () => {
		const { ctx, calls } = ctxStub(true, true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-git", task: "open a pull request for this branch" },
			ctx,
			ASK,
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(1);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("modo ask: delegación con push rechazada bloquea sin grant", async () => {
		const { ctx } = ctxStub(true, false);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "git push y PR" },
			ctx,
			ASK,
		);
		expect(result?.block).toBe(true);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("también inspecciona tasks[] y steps[]", async () => {
		const { ctx, calls } = ctxStub(true, true);
		await confirmDelegatedDelivery(
			{ tasks: [{ agent: "ein-github", task: "sube rama y abre PR" }] },
			ctx,
			ASK,
		);
		expect(calls.length).toBe(1);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("sin UI no decide: lo deja al guard de bash", async () => {
		const { ctx } = ctxStub(false);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push" },
			ctx,
			ASK,
		);
		expect(result).toBeUndefined();
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("modo auto + el usuario lo pidió: no pregunta, emite grant", async () => {
		const { ctx, calls } = ctxStub(true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push y abre PR" },
			ctx,
			{ mode: "auto", userRequested: true },
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(0); // sin confirmación
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("modo auto + iniciativa del agente (no lo pidió): confirma", async () => {
		const { ctx, calls } = ctxStub(true, true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push y abre PR" },
			ctx,
			{ mode: "auto", userRequested: false },
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(1); // sí pregunta
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("modo off: nunca pregunta, emite grant aunque no lo pidiera", async () => {
		const { ctx, calls } = ctxStub(true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "git push origin main" },
			ctx,
			{ mode: "off", userRequested: false },
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(0);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});
});
