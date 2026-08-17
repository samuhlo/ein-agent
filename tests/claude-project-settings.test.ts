import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildClaudeHooks, compileClaudeSurface } from "../cc-ein/sync.ts";
import { buildSettingsBlock } from "../cc-ein/sdd-cli/cli.ts";

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
