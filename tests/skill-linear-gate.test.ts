// =============================================================================
// TESTS: puerta de inyección de skills según la integración con Linear
// linear-workflow tiene tags (nuxt/github) que puntúan alto en cualquier
// proyecto Nuxt, así que se colaba en sdd-scope aunque Linear estuviera
// dormido. Solo debe inyectarse con la integración encendida.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { skillAllowedWithLinear } from "../ein-pi/agent/extensions/ein-skill-registry";

describe("skillAllowedWithLinear", () => {
	test("linear-workflow: fuera con Linear apagado, dentro con Linear encendido", () => {
		expect(skillAllowedWithLinear("linear-workflow", "off")).toBe(false);
		expect(skillAllowedWithLinear("linear-workflow", "on")).toBe(true);
	});

	test("las skills que no son de Linear pasan en los dos estados", () => {
		for (const key of ["nuxt", "github-workflow", "branch-pr", "drizzle"]) {
			expect(skillAllowedWithLinear(key, "off")).toBe(true);
			expect(skillAllowedWithLinear(key, "on")).toBe(true);
		}
	});
});
