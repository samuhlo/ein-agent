// =============================================================================
// TESTS: lib/guardrails — denegación bash + grant de entrega
// =============================================================================
// BLINDAJE -> El padre confirma el push al delegar; el guard headless del
// subagente consume el grant (usos acotados, con TTL y scope por cwd). FAIL
// CLOSED si el contexto es ambiguo — pero delegar a un agente de entrega NO es
// ambiguo: se decide por el agente, no por cómo esté redactada la task.
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
	delegationIsDelivery,
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
	// Usos ACOTADOS, no uno solo: una entrega real puede ejecutar más de un
	// comando guardado en el mismo run (push de rama + push de tags) o reintentar
	// tras un fallo transitorio. Con un único uso, el segundo comando legítimo
	// moría bloqueado y el subagente no tenía forma de recuperarse.
	test("se agota tras un número acotado de usos", () => {
		grantDelegatedDelivery(CWD);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
		expect(consumeDelegatedDelivery(CWD)).toBe(false);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	// Un grant escrito por una versión anterior (sin `remainingUses`) sigue
	// valiendo exactamente un uso: nunca se convierte en ilimitado.
	test("grant de formato anterior vale un solo uso", () => {
		writeFileSync(
			deliveryGrantPath(),
			JSON.stringify({ cwd: CWD, expiresAt: Date.now() + 60_000 }),
		);
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

	test("permite push con grant válido y acaba bloqueando al agotarlo", async () => {
		const { ctx } = ctxStub(false);
		grantDelegatedDelivery(CWD);
		// Reintento legítimo dentro del mismo encargo: sigue pasando.
		expect(await confirmCommand("git push origin main", ctx)).toBeUndefined();
		expect(await confirmCommand("git push origin main", ctx)).toBeUndefined();
		expect(await confirmCommand("git push origin main", ctx)).toBeUndefined();
		// Agotado: el grant no es una ventana abierta.
		const blocked = await confirmCommand("git push origin main", ctx);
		expect(blocked?.block).toBe(true);
	});

	test("los comandos no guardados pasan sin grant", async () => {
		const { ctx } = ctxStub(false);
		expect(await confirmCommand("git status", ctx)).toBeUndefined();
	});
});

// =============================================================================
// El agente destino MANDA sobre la prosa. Antes el gate solo miraba el texto
// de la task y fallaba-cerrado por un adjetivo: "push the branch" acuñaba el
// grant y "push current branch" no, con el mismo significado. ein-git se
// quedaba bloqueado sin salida y el padre no tenía forma de arreglarlo salvo
// adivinar otra redacción.
// =============================================================================
describe("delegationIsDelivery — determinista por agente", () => {
	// Textos REALES de una sesión que se quedó atascada (jul 2026). Los dos
	// últimos NO casaban con ningún patrón de prosa.
	const REAL_TASKS = [
		"Deliver the approved Ein quality-roadmap + macOS CI slice now: create branch `feature/macos-ci-parity` from current `main`, make exactly two commits with the file sets below, push the branch, and open one PR against `main`.",
		"Update existing PR #36 with the confirmed CI fix. On current branch `feature/macos-ci-parity`, stage ONLY `tests/project-context.test.ts`, commit, and push the branch.",
		"Update existing PR #36 with the final hosted-CI evidence. Stage ONLY two docs, commit, and push current branch `feature/macos-ci-parity`.",
		"Push the already-created local commit `932265d` from current branch `feature/macos-ci-parity` to its existing remote branch and update existing PR #36.",
	];

	test("delegar a ein-git ES entrega, se redacte como se redacte", () => {
		for (const task of REAL_TASKS) {
			expect(delegationIsDelivery({ agent: "ein-git", task }), task.slice(0, 50)).toBe(true);
		}
		// Incluso con una task que no menciona la entrega en absoluto.
		expect(delegationIsDelivery({ agent: "ein-git", task: "haz lo acordado" })).toBe(true);
	});

	test("los adjetivos ya no rompen el matcher de prosa (red secundaria)", () => {
		// Mismo significado, redacciones distintas: antes solo pasaba la primera.
		expect(taskRequestsGuardedDelivery("push the branch")).toBe(true);
		expect(taskRequestsGuardedDelivery("push current branch `feature/x`")).toBe(true);
		expect(taskRequestsGuardedDelivery("push the already-created local commit `932265d`")).toBe(true);
	});

	test("un agente que no es de entrega sigue decidiéndose por la prosa", () => {
		expect(delegationIsDelivery({ agent: "sdd-apply", task: "implementa push notifications" })).toBe(false);
		expect(delegationIsDelivery({ agent: "sdd-apply", task: "arregla el bug y haz push de la rama" })).toBe(true);
	});

	test("cubre los modos parallel (tasks[]) y chain (steps[])", () => {
		expect(delegationIsDelivery({ tasks: [{ agent: "sdd-map", task: "mapea" }, { agent: "ein-git", task: "entrega" }] })).toBe(true);
		expect(delegationIsDelivery({ steps: [{ agent: "ein-git", task: "entrega" }] })).toBe(true);
		expect(delegationIsDelivery({ steps: [{ agent: "sdd-map", task: "mapea el módulo" }] })).toBe(false);
	});

	test("input basura no revienta ni autoriza", () => {
		expect(delegationIsDelivery(undefined)).toBe(false);
		expect(delegationIsDelivery({ tasks: "no es un array" })).toBe(false);
		expect(delegationIsDelivery({ agent: 42 })).toBe(false);
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
