import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

// =============================================================================
// PRESUPUESTO DE PROMPT
// El prompt del orquestador es la mayor factura fija del sistema: se paga en
// CADA turno de CADA sesión. El manifiesto (§ 004) permite que crezca solo si
// algo sale a cambio, y sin un techo esa regla no tiene forma de aplicarse.
//
// Estos números son la línea base medida, no una aspiración. Bajan cuando una
// retirada real los deja por debajo; el 2026-08-17 el orquestador pasó de 45.321
// a 43.096 al llevar `maxRuntimeMs` a una tabla y retirar la prosa que lo pedía
// a mano, el reenvío de TDD que el preflight ya inyecta, y el contrato del
// envelope que los siete agentes ya llevan.
// Subirlos es un acto deliberado y revisable: se hace en este fichero, con el
// motivo en el mensaje del commit. Bajarlos no requiere permiso de nadie.
//
// SUBIDA 2026-08-17: +318 bytes por el carril del cambio. Es lo que la regla
// permite —crece porque algo entra a cambio—: un párrafo que compra saltarse
// `map` y `tasks`, las dos fases que leen código, en cada cambio pequeño. El
// techo cumplió su función: obligó a apretar el texto de 415 a 318 bytes y a
// justificar el resto en vez de dejarlo pasar.
//
// El presupuesto de agentes existe para que el orquestador no adelgace
// empujando su prosa a los ejecutores: el total es lo que importa.
// =============================================================================

const ORCHESTRATOR_BUDGET_BYTES = 43_011;
const CORE_AGENTS_BUDGET_BYTES = 83_042;

function bytesOf(path: string): number {
	return Buffer.byteLength(readFileSync(join(ROOT, path), "utf8"));
}

function overBudgetMessage(name: string, actual: number, budget: number): string {
	return [
		`${name} pesa ${actual} bytes y su presupuesto es ${budget} (+${actual - budget}).`,
		"Retira una cantidad equivalente de prosa, o sube el presupuesto en tests/prompt-budget.test.ts",
		"explicando en el commit qué compra ese crecimiento.",
	].join(" ");
}

describe("presupuesto de prompt", () => {
	test("el prompt del orquestador no crece sin que algo salga a cambio", () => {
		const actual = bytesOf("ein-pi/agent/assets/orchestrator.md");
		if (actual > ORCHESTRATOR_BUDGET_BYTES) {
			throw new Error(overBudgetMessage("orchestrator.md", actual, ORCHESTRATOR_BUDGET_BYTES));
		}
		expect(actual).toBeLessThanOrEqual(ORCHESTRATOR_BUDGET_BYTES);
	});

	// Anti-trampa: adelgazar el orquestador engordando los agentes no es poda,
	// es mudanza. Los ejecutores también se pagan, una vez por delegación.
	test("los agentes no absorben lo que el orquestador suelta", () => {
		const dir = join(ROOT, "ein-pi/core/agents");
		const actual = readdirSync(dir)
			.filter((file) => file.endsWith(".md"))
			.reduce((sum, file) => sum + Buffer.byteLength(readFileSync(join(dir, file), "utf8")), 0);

		if (actual > CORE_AGENTS_BUDGET_BYTES) {
			throw new Error(overBudgetMessage("core/agents/*.md", actual, CORE_AGENTS_BUDGET_BYTES));
		}
		expect(actual).toBeLessThanOrEqual(CORE_AGENTS_BUDGET_BYTES);
	});

	// El presupuesto solo sirve si alguien lo ve moverse. Este test falla cuando
	// la línea base y los presupuestos se separan tanto que el techo dejó de
	// medir nada — señal de que hay que rebajarlo a lo que de verdad se ocupa.
	test("un presupuesto muy holgado deja de ser un techo", () => {
		const orchestrator = bytesOf("ein-pi/agent/assets/orchestrator.md");
		const slack = ORCHESTRATOR_BUDGET_BYTES - orchestrator;
		expect(slack).toBeLessThanOrEqual(Math.round(ORCHESTRATOR_BUDGET_BYTES * 0.15));
	});
});
