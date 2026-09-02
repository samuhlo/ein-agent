// =============================================================================
// TESTS: EIN SDD LIFECYCLE TOOLS
// Keeps artifact gates and deterministic close under one explicit owner.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerSddLifecycleTools } from "../ein-pi/agent/extensions/internal/ein-sdd-lifecycle-tools.ts";

test("registers check, close command, and close tool", () => {
	const commands: string[] = [];
	const tools: string[] = [];
	const pi = {
		registerCommand(name: string) {
			commands.push(name);
		},
		events: { emit() {} },
	};
	registerSddLifecycleTools(pi as never, ((spec: { name: string }) => {
		tools.push(spec.name);
	}) as never);

	expect(commands).toEqual(["ein:sdd-close"]);
	expect(tools).toEqual(["ein_sdd_check", "ein_sdd_close"]);
});

test("the main extension delegates SDD lifecycle tools", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain("registerSddLifecycleTools(pi, registerEinTool);");
	expect(source).not.toContain('name: "ein_sdd_check"');
	expect(source).not.toContain('name: "ein_sdd_close"');
	expect(source).not.toContain('pi.registerCommand("ein:sdd-close"');
});
