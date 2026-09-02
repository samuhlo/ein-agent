// =============================================================================
// TESTS: EIN GENERAL COMMANDS
// Keeps the human configuration and accounting surface owned outside ein-ai.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerGeneralCommands } from "../ein-pi/agent/extensions/internal/ein-general-commands.ts";

test("registers the complete general command surface", () => {
	const commands: string[] = [];
	const pi = {
		registerCommand(name: string) {
			commands.push(name);
		},
	};

	registerGeneralCommands(pi as never);

	expect(commands).toEqual([
		"ein:models",
		"ein:persona",
		"ein:lang",
		"ein:tdd",
		"ein:git",
		"ein:hypa",
		"ein:codegraph",
		"ein:onboard",
		"ein:linear",
		"ein:init",
		"ein:resume",
		"ein:accounting",
	]);
});

test("the main extension delegates the general command surface", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain("registerGeneralCommands(pi);");
	expect(source).not.toContain('pi.registerCommand("ein:models"');
});
