// =============================================================================
// TESTS: referencias de strict-TDD support (P2-b)
// Ein no envia support files globales de strict-TDD. Los agentes NO deben
// referenciar una "global EIN strict-TDD support guidance" inexistente (era una
// referencia colgante). El contrato inline del propio prompt es la fuente.
// El override project-local opcional (.pi/ein/support/strict-tdd*.md) si vale,
// porque lo aporta el usuario, no Ein.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const apply = readFileSync(join(CORE, "agents/sdd-apply.md"), "utf8");
const verify = readFileSync(join(CORE, "agents/sdd-verify.md"), "utf8");

describe("sin referencias colgantes a support guidance global", () => {
	test("sdd-apply no referencia 'global EIN strict-TDD support guidance'", () => {
		expect(apply).not.toContain("global EIN strict-TDD support guidance");
	});

	test("sdd-verify no referencia 'global EIN strict-TDD verification support guidance'", () => {
		expect(verify).not.toContain(
			"global EIN strict-TDD verification support guidance",
		);
	});

	test("el override project-local opcional se conserva", () => {
		expect(apply).toContain(".pi/ein/support/strict-tdd.md");
		expect(verify).toContain(".pi/ein/support/strict-tdd-verify.md");
	});

	test("Ein no envia support files globales (coherente con el cambio)", () => {
		// Si algun dia se decide enviarlos (P2-a), este test cambia a su favor.
		expect(existsSync(join(AGENT, "support/strict-tdd.md"))).toBe(false);
	});
});
