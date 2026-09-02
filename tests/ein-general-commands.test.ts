// =============================================================================
// TESTS: EIN GENERAL COMMANDS
// Keeps the human configuration and accounting surface owned outside ein-ai.
// =============================================================================

import { expect, test } from "bun:test";
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
