import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	renderProjectDirectives,
	resolveProjectDirectives,
	type DirectiveRuntime,
} from "../ein-pi/agent/lib/project-directives.ts";
import { SETTING_DEFINITIONS } from "../ein-pi/agent/lib/project-settings.ts";

const RUNTIMES: readonly DirectiveRuntime[] = ["pi", "claude"];

let cwd: string;

function writeSetting(id: string, mode: string): void {
	const dir = join(cwd, ".pi", "ein");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${id}.json`), `${JSON.stringify({ mode })}\n`);
}

function byId(runtime: DirectiveRuntime, id: string) {
	const entry = resolveProjectDirectives(cwd, runtime).find((item) => item.id === id);
	if (!entry) throw new Error(`no directive entry for ${id}`);
	return entry;
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-directives-"));
});

afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("project directives", () => {
	// El guardián de la recaída: un ajuste nuevo en el catálogo sin traducción
	// sale `unhandled`, y este test cae antes de que un runtime lo ignore en
	// silencio.
	test("every catalogued setting is translated for every runtime", () => {
		for (const runtime of RUNTIMES) {
			const resolved = resolveProjectDirectives(cwd, runtime);
			expect(resolved.map((entry) => entry.id)).toEqual(
				SETTING_DEFINITIONS.map((definition) => definition.id),
			);
			const unhandled = resolved.filter((entry) => entry.status === "unhandled");
			expect(unhandled.map((entry) => entry.id)).toEqual([]);
		}
	});

	test("the project's work mode reaches the directive, not the default", () => {
		expect(byId("claude", "mode").directive).toContain("SOLO");

		writeSetting("mode", "team");
		const team = byId("claude", "mode");
		expect(team.status).toBe("applied");
		expect(team.value).toBe("team");
		expect(team.directive).toContain("TEAM");
	});

	// El caso que motivó el cambio: TDD estricto en Pi tiene que llegar a Claude.
	test("a strict TDD project does not reach a runtime as standard mode", () => {
		writeSetting("tdd", "strict");
		for (const runtime of RUNTIMES) {
			const entry = byId(runtime, "tdd");
			expect(entry.status).toBe("applied");
			expect(entry.value).toBe("strict");
			expect(entry.directive).toContain("STRICT");
		}
	});

	test("a Pi-only setting is reported as unsupported, never silently dropped", () => {
		const claude = byId("claude", "hypa");
		expect(claude.status).toBe("unsupported");
		expect(claude.reason).toContain("Pi");
		expect(claude.directive).toBe("");

		expect(byId("pi", "hypa").status).not.toBe("unsupported");
	});

	test("a value that injects nothing is inactive, not applied", () => {
		writeSetting("persona", "neutral");
		const entry = byId("claude", "persona");
		expect(entry.status).toBe("inactive");
		expect(entry.directive).toBe("");
	});

	test("the rendered block carries the active directives and names what it skips", () => {
		writeSetting("tdd", "strict");
		writeSetting("mode", "team");
		const block = renderProjectDirectives(resolveProjectDirectives(cwd, "claude"));

		expect(block).toContain("## Project settings");
		expect(block).toContain("STRICT");
		expect(block).toContain("TEAM");
		expect(block).toContain("Not applied:");
		expect(block).toContain("`hypa`");
	});

	test("a corrupt settings file never becomes a confident default", () => {
		const dir = join(cwd, ".pi", "ein");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "tdd.json"), "{ not json");

		// El lector degrada a su default documentado; lo que este módulo garantiza
		// es que jamás inventa un valor por su cuenta ni lanza.
		const entry = byId("claude", "tdd");
		expect(["applied", "unreadable"]).toContain(entry.status);
		expect(() => resolveProjectDirectives(cwd, "claude")).not.toThrow();
	});
});
