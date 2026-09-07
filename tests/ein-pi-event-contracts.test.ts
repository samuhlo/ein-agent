// =============================================================================
// TESTS: EIN PI EVENT CONTRACTS
// Keeps runtime envelope interpretation outside hook registration.
// =============================================================================

import { expect, test } from "bun:test";
import { readAgentStartNames, recognizePiParticipantTerminal } from "../ein-pi/agent/extensions/internal/ein-pi-event-contracts.ts";

test("preserves the failed Cleaner launch diagnostic as unavailable evidence", () => {
	const reason = "Agent 'ein-cleaner' ran as a foreground child, which never loads the parent's ambient extensions, and these child tools were unavailable: ein_cleaner_evidence.";
	expect(recognizePiParticipantTerminal({
		toolName: "subagent", isError: true, details: {}, agent: "ein-cleaner", task: "audit",
		content: [{ type: "text", text: reason }],
	})).toEqual({ status: "unavailable", reason });
});

test("bounds transport diagnostics and never promotes error content to successful evidence", () => {
	const input = { toolName: "subagent", isError: true, details: {}, agent: "ein-cleaner", task: "audit" };
	expect(recognizePiParticipantTerminal({ ...input, content: [{ type: "text", text: "status: complete" }] })).toEqual({ status: "unavailable", reason: "status: complete" });
	expect(recognizePiParticipantTerminal({ ...input, content: [{ type: "text", text: "x".repeat(3000) }] }).reason).toHaveLength(2048);
	for (const content of [undefined, {}, [], [{ type: "text", text: " " }], [{ type: "image", text: "ignored" }]]) {
		expect(recognizePiParticipantTerminal({ ...input, content })).toEqual({ status: "unavailable", reason: "participant transport failed" });
	}
});

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
