// =============================================================================
// TESTS: lib/onboarding
// El disparador es agnóstico a la edad del proyecto: "pendiente" = fichero de
// config ausente. Un proyecto sin configurar reporta los 5 esenciales; aplicar
// los defaults los deja configurados (no vuelven a estar pendientes).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { pendingEssentials, applyDefault } = await import(
	"../ein-pi/agent/lib/onboarding"
);

describe("pendingEssentials", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-onboard-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("proyecto sin configurar → los 5 esenciales pendientes", () => {
		expect(pendingEssentials(cwd).sort()).toEqual(
			["einmd", "hypa", "lang", "persona", "tdd"].sort(),
		);
	});

	test("aplicar un default lo saca de pendientes", () => {
		applyDefault(cwd, "hypa");
		expect(pendingEssentials(cwd)).not.toContain("hypa");
		expect(pendingEssentials(cwd)).toContain("persona");
	});

	test("aplicar todos → nada pendiente + EIN.md en la raíz", () => {
		for (const item of ["persona", "lang", "tdd", "hypa", "einmd"] as const) {
			applyDefault(cwd, item);
		}
		expect(pendingEssentials(cwd)).toEqual([]);
		expect(existsSync(join(cwd, "EIN.md"))).toBe(true);
	});
});
