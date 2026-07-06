// =============================================================================
// TESTS: delegationTargetsApply — gate TDD en tool_call
// =============================================================================
// BLINDAJE -> El gate solo se dispara cuando la delegación acabará en
// sdd-apply (single `agent`, parallel `tasks[]` o chain `chain[]`/`steps[]`).
// Map/design/linear/git no escriben código → no preguntan TDD.
// =============================================================================

import { describe, expect, test } from "bun:test";

const { delegationTargetsApply, readDelegationTddHint, delegationIsDocsOnly } =
	await import("../ein-pi/agent/lib/sdd-preflight");

describe("delegationTargetsApply", () => {
	test("single mode: agent sdd-apply → true", () => {
		expect(delegationTargetsApply({ agent: "sdd-apply", task: "x" })).toBe(
			true,
		);
	});

	test("single mode: otro agente → false", () => {
		expect(delegationTargetsApply({ agent: "ein-git", task: "commit" })).toBe(
			false,
		);
		expect(delegationTargetsApply({ agent: "sdd-map", task: "map" })).toBe(
			false,
		);
	});

	test("chain con sdd-apply en un paso → true", () => {
		const input = {
			task: "feature X",
			chain: [
				{ agent: "sdd-scope", task: "{task}" },
				{ agent: "sdd-map", task: "{task}" },
				{ agent: "sdd-design", task: "{task}" },
				{ agent: "sdd-apply", task: "{task}" },
				{ agent: "sdd-verify", task: "{task}" },
			],
		};
		expect(delegationTargetsApply(input)).toBe(true);
	});

	test("chain solo de fases read-only → false", () => {
		const input = {
			task: "entender X",
			chain: [
				{ agent: "sdd-scope", task: "{task}" },
				{ agent: "sdd-map", task: "{task}" },
				{ agent: "sdd-design", task: "{task}" },
			],
		};
		expect(delegationTargetsApply(input)).toBe(false);
	});

	test("steps[] (nombre alternativo de chain) con sdd-apply → true", () => {
		expect(
			delegationTargetsApply({ steps: [{ agent: "sdd-apply", task: "y" }] }),
		).toBe(true);
	});

	test("tasks[] paralelo con sdd-apply → true", () => {
		expect(
			delegationTargetsApply({
				tasks: [{ agent: "sdd-map" }, { agent: "sdd-apply" }],
			}),
		).toBe(true);
	});

	test("entradas inválidas → false (no lanza)", () => {
		expect(delegationTargetsApply(undefined)).toBe(false);
		expect(delegationTargetsApply(null)).toBe(false);
		expect(delegationTargetsApply("sdd-apply")).toBe(false);
		expect(delegationTargetsApply({ chain: "sdd-apply" })).toBe(false);
		expect(delegationTargetsApply({})).toBe(false);
	});
});

describe("readDelegationTddHint", () => {
	test("single con tdd:'off' → off (mecánico, no pregunta)", () => {
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "rename", tdd: "off" }),
		).toBe("off");
	});

	test("single con tdd:false → off", () => {
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "mv", tdd: false }),
		).toBe("off");
	});

	test("single con tdd:'strict'/true → strict", () => {
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "x", tdd: "strict" }),
		).toBe("strict");
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "x", tdd: true }),
		).toBe("strict");
	});

	test("sin hint → undefined (cae al ask interactivo)", () => {
		expect(readDelegationTddHint({ agent: "sdd-apply", task: "x" })).toBeUndefined();
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "x", tdd: "ask" }),
		).toBeUndefined();
	});

	test("hint del paso sdd-apply dentro de chain gana", () => {
		const input = {
			task: "feature",
			chain: [
				{ agent: "sdd-design", task: "{task}" },
				{ agent: "sdd-apply", task: "{task}", tdd: "off" },
			],
		};
		expect(readDelegationTddHint(input)).toBe("off");
	});

	test("marcador de texto: 'STRICT TDD MODE IS ACTIVE' → strict", () => {
		expect(
			readDelegationTddHint({
				agent: "sdd-apply",
				task: "Implementa el motor. STRICT TDD MODE IS ACTIVE. Test runner: bun test.",
			}),
		).toBe("strict");
	});

	test("marcador de texto: 'SIN TDD' / 'TDD: off' → off", () => {
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "Renombra Foo. SIN TDD." }),
		).toBe("off");
		expect(
			readDelegationTddHint({ agent: "sdd-apply", task: "bump config (tdd: off)" }),
		).toBe("off");
	});

	test("entradas inválidas → undefined (no lanza)", () => {
		expect(readDelegationTddHint(undefined)).toBeUndefined();
		expect(readDelegationTddHint(null)).toBeUndefined();
		expect(readDelegationTddHint("sdd-apply")).toBeUndefined();
		expect(readDelegationTddHint({})).toBeUndefined();
	});
});

describe("delegationIsDocsOnly — documentación pura nunca pregunta TDD", () => {
	test("docs puros → true", () => {
		expect(
			delegationIsDocsOnly({
				agent: "sdd-apply",
				task: "Documenta el estado actual del proyecto en docs/estado-actual.md y añade la futura feature de recomendador IA",
			}),
		).toBe(true);
		expect(
			delegationIsDocsOnly({ agent: "sdd-apply", task: "actualiza el README con la sección de deploy" }),
		).toBe(true);
		expect(
			delegationIsDocsOnly({ agent: "sdd-apply", task: "redacta el CHANGELOG de la release" }),
		).toBe(true);
	});

	test("cualquier señal de código → false (conservador)", () => {
		// menciona un .ts → no es docs-only aunque hable de documentar
		expect(
			delegationIsDocsOnly({ agent: "sdd-apply", task: "documenta el comportamiento de calculatePlanning.ts" }),
		).toBe(false);
		// verbo de implementación
		expect(
			delegationIsDocsOnly({ agent: "sdd-apply", task: "implementa el endpoint y actualiza el README" }),
		).toBe(false);
		expect(
			delegationIsDocsOnly({ agent: "sdd-apply", task: "refactor del store del wizard" }),
		).toBe(false);
	});

	test("sin señal de docs ni inválido → false (cae al comportamiento normal)", () => {
		expect(delegationIsDocsOnly({ agent: "sdd-apply", task: "arregla el bug del login" })).toBe(false);
		expect(delegationIsDocsOnly(undefined)).toBe(false);
		expect(delegationIsDocsOnly({})).toBe(false);
	});

	test("docs en un paso de chain también cuenta", () => {
		expect(
			delegationIsDocsOnly({
				task: "documentación",
				chain: [{ agent: "sdd-apply", task: "escribe docs/guia.md" }],
			}),
		).toBe(true);
	});
});
