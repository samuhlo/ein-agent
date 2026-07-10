// =============================================================================
// TESTS: skill injection gate por modo
// linear-workflow tiene tags (nuxt/github) que puntúan alto en cualquier
// proyecto Nuxt, así que se colaba en sdd-scope aunque Linear estuviera dormido
// (Solo). Solo debe inyectarse en Team.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { skillAllowedInMode } from "../ein-pi/agent/extensions/ein-skill-registry";

describe("skillAllowedInMode", () => {
	test("linear-workflow: fuera en Solo, dentro en Team", () => {
		expect(skillAllowedInMode("linear-workflow", "solo")).toBe(false);
		expect(skillAllowedInMode("linear-workflow", "team")).toBe(true);
	});

	test("skills no-Team pasan en ambos modos", () => {
		for (const key of ["nuxt", "github-workflow", "branch-pr", "drizzle"]) {
			expect(skillAllowedInMode(key, "solo")).toBe(true);
			expect(skillAllowedInMode(key, "team")).toBe(true);
		}
	});
});
