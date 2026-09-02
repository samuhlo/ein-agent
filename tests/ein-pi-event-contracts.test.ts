// =============================================================================
// TESTS: EIN PI EVENT CONTRACTS
// Keeps runtime envelope interpretation outside hook registration.
// =============================================================================

import { expect, test } from "bun:test";
import { readAgentStartNames } from "../ein-pi/agent/extensions/internal/ein-pi-event-contracts.ts";

test("reads only explicit agent identity fields", () => {
	expect(readAgentStartNames({ agentName: " sdd-scope " })).toEqual(["sdd-scope"]);
	expect(readAgentStartNames({ agent: { name: "ein-cleaner" } })).toEqual(["ein-cleaner"]);
	expect(readAgentStartNames({ task: "run sdd-design" })).toEqual([]);
});

test("deduplicates no evidence and preserves event order", () => {
	expect(readAgentStartNames({
		agentName: "sdd-map",
		agent: "sdd-map",
		subagent: { name: "ein-scout" },
	})).toEqual(["sdd-map", "sdd-map", "ein-scout"]);
});
