// =============================================================================
// TESTS: installer deps — hypa opcional
// Fija el contrato: hypa aparece en checkDeps como dependencia NO obligatoria,
// para que ni el installer ni el doctor la traten como bloqueante.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { checkDeps } from "../installer/src/core/deps";
import { detectPlatform } from "../installer/src/core/platform";

describe("checkDeps — hypa", () => {
	const deps = checkDeps(detectPlatform());
	const hypa = deps.find((d) => d.id === "hypa");

	test("hypa está en la lista de deps", () => {
		expect(hypa).toBeDefined();
	});

	test("hypa es opcional (nunca bloquea install/doctor)", () => {
		expect(hypa?.required).toBe(false);
	});

	test("hint menciona compresión", () => {
		expect(hypa?.hint).toContain("compresión");
	});
});
