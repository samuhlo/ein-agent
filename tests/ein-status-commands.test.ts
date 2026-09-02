// =============================================================================
// TESTS: EIN STATUS COMMANDS
// Keeps human status/help rendering outside the composition root.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerStatusCommands } from "../ein-pi/agent/extensions/internal/ein-status-commands.ts";

test("registers status and help as one presentation surface", () => {
	const commands: string[] = [];
	const pi = {
		registerCommand(name: string) {
			commands.push(name);
		},
	};

	registerStatusCommands(pi as never);

	expect(commands).toEqual(["ein:status", "ein:help"]);
});

test("the main extension only composes status commands", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain("registerStatusCommands(pi);");
	expect(source).not.toContain('pi.registerCommand("ein:status"');
});
