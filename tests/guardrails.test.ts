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
	test("detecta intención de push en la task", () => {
		expect(taskRequestsGuardedDelivery("haz commit y push, luego abre PR")).toBe(
			true,
		);
		expect(taskRequestsGuardedDelivery("sube la rama y abre el PR")).toBe(true);
		expect(taskRequestsGuardedDelivery("explora el repo y resume")).toBe(false);
	});

	test("delegación sin push no pregunta ni emite grant", async () => {
		const { ctx, calls } = ctxStub(true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-linear", task: "actualiza la issue SAM-366" },
			ctx,
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(0);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("delegación con push aprobada emite grant one-shot", async () => {
		const { ctx, calls } = ctxStub(true, true);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push de la rama y abre PR" },
			ctx,
		);
		expect(result).toBeUndefined();
		expect(calls.length).toBe(1);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("delegación con push rechazada bloquea sin grant", async () => {
		const { ctx } = ctxStub(true, false);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "git push y PR" },
			ctx,
		);
		expect(result?.block).toBe(true);
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});

	test("también inspecciona tasks[] y steps[]", async () => {
		const { ctx, calls } = ctxStub(true, true);
		await confirmDelegatedDelivery(
			{ tasks: [{ agent: "ein-github", task: "sube rama y abre PR" }] },
			ctx,
		);
		expect(calls.length).toBe(1);
		expect(consumeDelegatedDelivery(CWD)).toBe(true);
	});

	test("sin UI no decide: lo deja al guard de bash", async () => {
		const { ctx } = ctxStub(false);
		const result = await confirmDelegatedDelivery(
			{ agent: "ein-github", task: "haz push" },
			ctx,
		);
		expect(result).toBeUndefined();
		expect(existsSync(deliveryGrantPath())).toBe(false);
	});
});
