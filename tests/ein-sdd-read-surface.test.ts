// =============================================================================
// TESTS: EIN SDD READ SURFACE
// Keeps read-only SDD tools and navigation commands under one explicit owner.
// =============================================================================

import { expect, test } from "bun:test";
import { registerSddReadSurface } from "../ein-pi/agent/extensions/internal/ein-sdd-read-surface.ts";

test("registers the complete SDD read and navigation surface", () => {
	const commands: string[] = [];
	const tools: string[] = [];
	const pi = {
		registerCommand(name: string) {
			commands.push(name);
		},
		events: { emit() {} },
		sendUserMessage() {},
	};
	const registerTool = (spec: { name: string }) => {
		tools.push(spec.name);
	};

	registerSddReadSurface(pi as never, registerTool as never);

	expect(commands).toEqual([
		"ein:sdd-audit",
		"ein:sdd-check",
		"ein:sdd-status",
		"ein:focus",
		"ein:sdd-next",
	]);
	expect(tools).toEqual(["ein_sdd_status", "ein_review_forecast"]);
});
