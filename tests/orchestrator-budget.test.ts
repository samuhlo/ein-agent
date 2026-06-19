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
