// =============================================================================
// TESTS: EIN RUNTIME COMMANDS
// Keeps Pi runtime controls owned outside the composition root.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerRuntimeCommands } from "../ein-pi/agent/extensions/internal/ein-runtime-commands.ts";

test("registers the complete Pi runtime command surface", () => {
	const commands: string[] = [];
	const pi = {
		registerCommand(name: string) {
			commands.push(name);
		},
	};

	registerRuntimeCommands(pi as never, async () => undefined);

	expect(commands).toEqual([
		"ein:ai:install-sdd",
		"ein:ai:sdd-preflight",
		"ein:cleaner",
		"ein:architect",
	]);
});

test("the main extension only delegates the runtime command surface", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain(
		"registerRuntimeCommands(pi, sessionLifecycle.runSddPreflight);",
	);
	expect(source).not.toContain('pi.registerCommand("ein:ai:install-sdd"');
});
