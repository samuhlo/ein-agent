// =============================================================================
// TESTS: EIN GENERAL COMMANDS
// Keeps the human configuration and accounting surface owned outside ein-ai.
// =============================================================================

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

test("accounting renders no packet samples as unknown", async () => {
	const handlers = new Map<string, (args: string, ctx: any) => Promise<void>>();
	const pi = {
		registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) {
			handlers.set(name, command.handler);
		},
	};
	registerGeneralCommands(pi as never);
	const root = mkdtempSync(join(tmpdir(), "ein-accounting-command-"));
	const previous = process.env.EIN_PI_AGENT_HOME;
	process.env.EIN_PI_AGENT_HOME = root;
	mkdirSync(join(root, "sessions"), { recursive: true });
	const messages: string[] = [];
	try {
		await handlers.get("ein:accounting")?.("", { ui: { notify: (message: string) => messages.push(message) } });
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain("-- apply packet readiness --");
		expect(messages[0]).toContain("observed=0 malformed=0");
		expect(messages[0]).toContain("executableRate=unknown");
		expect(messages[0]).toContain("currentExecutableStreak=0 acrossChanges=0");
	} finally {
		if (previous === undefined) delete process.env.EIN_PI_AGENT_HOME;
		else process.env.EIN_PI_AGENT_HOME = previous;
		rmSync(root, { recursive: true, force: true });
	}
});
