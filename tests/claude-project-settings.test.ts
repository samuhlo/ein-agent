import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readFileSync } from "node:fs";
import { buildClaudeHooks, compileClaudeSurface, listClaudeCommands } from "../cc-ein/sync.ts";
import { buildSettingsBlock, buildStatusOutput } from "../cc-ein/sdd-cli/cli.ts";

describe("Claude reads the project settings", () => {
	// El agujero que cerró este cambio: Claude arrancaba con sus defaults de
	// fábrica y un handoff desde Pi cambiaba de estándar sin avisar.
	test("SessionStart injects the settings through the deterministic CLI", () => {
		const hooks = buildClaudeHooks("/bin/cc-ein-sdd", "/bin/continuity");
		const sessionStart = hooks.SessionStart;

		expect(sessionStart).toHaveLength(1);
		expect(sessionStart[0].matcher).toContain("startup");
		expect(sessionStart[0].matcher).toContain("resume");
		expect(sessionStart[0].hooks[0].command).toBe('"/bin/cc-ein-sdd" settings --hook');
	});

	test("the guard and continuity wiring survives alongside it", () => {
		const hooks = buildClaudeHooks("/bin/cc-ein-sdd", "/bin/continuity");
		expect(hooks.PreToolUse[0].hooks[0].command).toBe('"/bin/cc-ein-sdd" guard');
		expect(hooks.UserPromptSubmit[0].hooks[0].command).toBe('"/bin/continuity" hook');
		expect(Object.keys(hooks).sort()).toEqual([
			"PreCompact",
			"PostToolUse",
			"PostToolUseFailure",
			"PreToolUse",
			"SessionEnd",
			"SessionStart",
			"Stop",
			"UserPromptSubmit",
		].sort());
	});

	test("the block carries the project's real value, not a baked default", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-cc-settings-"));
		try {
			mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "ein", "tdd.json"), '{"mode":"strict"}\n');
			writeFileSync(join(cwd, ".pi", "ein", "mode.json"), '{"mode":"team"}\n');

			const block = buildSettingsBlock(cwd);
			expect(block).toContain("STRICT");
			expect(block).toContain("TEAM");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	// La traducción convertía una ruta local del proyecto en una ruta de la
	// instalación que nadie creaba ni leía. El proyecto es compartido: no se
	// traduce.
	test("project-local configuration paths are not rewritten by the compiler", () => {
		const surface = compileClaudeSurface();

		expect(surface.coordinator).toContain(".pi/ein/git.json");
		expect(surface.coordinator).not.toContain("cc-ein/git.json");
		expect(surface.agents["sdd-apply.md"]).toContain(".pi/ein/support/strict-tdd.md");
		expect(surface.agents["sdd-verify.md"]).toContain(".pi/ein/support/strict-tdd-verify.md");
	});

	test("the adapter explains that the path is shared, not Pi-only", () => {
		const surface = compileClaudeSurface();
		expect(surface.agents["sdd-apply.md"]).toContain("## Project settings");
	});
});

describe("Claude session commands", () => {
	// Llegar a un proyecto sin saber si exige TDD es llegar a ciegas: el status
	// contesta "dónde estoy" entero o no lo contesta.
	test("status answers where the work is AND which rules govern it", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-cc-status-"));
		try {
			mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
			writeFileSync(join(cwd, ".pi", "ein", "tdd.json"), '{"mode":"strict"}\n');

			const output = buildStatusOutput(cwd);
			expect(output).toContain("Ajustes del proyecto:");
			expect(output).toContain("tdd=strict");
			// Lo que este runtime no honra se marca; un status que lo calla miente.
			expect(output).toContain("no aplica aquí");
		} finally {
			rmSync(cwd, { recursive: true, force: true });
		}
	});

	test("every published command is a valid, self-executing skill file", () => {
		const commands = listClaudeCommands();
		expect(commands).toContain("status.md");
		expect(commands).toContain("settings.md");
		expect(commands).toContain("handoff.md");

		for (const file of commands) {
			const body = readFileSync(join(import.meta.dir, "..", "cc-ein", "commands", "ein", file), "utf8");
			expect(body.startsWith("---\n")).toBe(true);
			expect(body).toContain("description:");
		}
	});

	// Un comando que ejecuta un binario sin declararlo en `allowed-tools` pide
	// permiso cada vez y deja de ser un atajo.
	test("a command that shells out pre-approves exactly what it runs", () => {
		for (const file of ["status.md", "settings.md"]) {
			const body = readFileSync(join(import.meta.dir, "..", "cc-ein", "commands", "ein", file), "utf8");
			const invoked = body.match(/!`(cc-ein-sdd [a-z]+)/);
			expect(invoked).not.toBeNull();
			expect(body).toContain(`allowed-tools: Bash(${invoked?.[1]}:*)`);
		}
	});
});
