// =============================================================================
// TESTS: delegationTargetsApply — detección de delegaciones que escriben código
// El gate de TDD en tool_call solo debe dispararse cuando la delegación al tool
// `subagent` acabará en sdd-apply: modo single (`agent`), parallel (`tasks[]`)
// o chain (`chain[]` / `steps[]`). En explore/design/linear/git no escribe
// código → no debe preguntar TDD.
// =============================================================================

import { describe, expect, test } from "bun:test";

const { delegationTargetsApply } = await import(
	"../ein-pi/agent/lib/sdd-preflight"
);

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
		expect(delegationTargetsApply({ agent: "sdd-explore", task: "map" })).toBe(
			false,
		);
	});

	test("chain con sdd-apply en un paso → true", () => {
		const input = {
			task: "feature X",
			chain: [
				{ agent: "sdd-init", task: "{task}" },
				{ agent: "sdd-explore", task: "{task}" },
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
				{ agent: "sdd-init", task: "{task}" },
				{ agent: "sdd-explore", task: "{task}" },
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
				tasks: [{ agent: "sdd-explore" }, { agent: "sdd-apply" }],
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
