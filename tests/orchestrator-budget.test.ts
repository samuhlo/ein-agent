// =============================================================================
// TESTS: presupuesto de tamaño del orchestrator (anti-engorde)
// El orchestrator es el prompt del padre, cargado en CADA turno. Tras el trim
// de v1 (625 → ~185) este test evita que vuelva a crecer sin control. Si un
// cambio futuro lo necesita más grande, sube el tope conscientemente.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orch = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md"),
	"utf8",
);

describe("orchestrator size budget", () => {
	test("≤ 420 líneas (margen sobre el objetivo ~185)", () => {
		const lines = orch.split("\n").length;
		expect(lines).toBeLessThanOrEqual(420);
	});
});

// Cortafuegos de spawns: cuando el runtime devuelve el muro de subagentes, el
// parent NO debe seguir inline (escribir código, autoría de artefactos, marcar
// su propio check). La regla debe estar explícita en el prompt del padre.
describe("spawn-exhaustion firewall", () => {
	test("orchestrator.md manda PARAR ante el muro de subagentes, no caer a inline", () => {
		expect(orch).toMatch(/spawn.{0,40}exhaust|budget exhausted/i);
		expect(orch).toMatch(/NEVER fall to inline|do NOT continue inline/i);
	});

	test("nombra el motivo: bypass de la re-ejecución de acceptance y autocertificación del gate", () => {
		expect(orch).toMatch(/acceptance/i);
		expect(orch).toMatch(/self-certif|fabricate/i);
	});
});
