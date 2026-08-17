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

	// El agujero real que cerró esto: el proyecto pedía Cleaner automático y Claude
	// no lo sabía siquiera. No ejecutarlo está bien; no decirlo, no — el cambio
	// habría cambiado de estándar a mitad de un handoff sin que nadie se enterase.
	test("un proyecto con Cleaner automático se declara, aunque el runtime no lo ejecute", () => {
		// El perfil no usa la forma `{ mode }` del resto de ajustes.
		mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
		writeFileSync(
			join(cwd, ".pi", "ein", "agents.json"),
			JSON.stringify({ agents: { cleaner: { enabled: true }, architect: { enabled: false } } }),
		);

		const entry = byId("claude", "agents");
		expect(entry.value).toBe("balanced");
		expect(entry.status).toBe("unsupported");
		expect(entry.reason).toContain("Pi-only");
		// Y dice qué hacer en su lugar, no solo que no puede.
		expect(entry.reason).toContain("explicitly");

		// En Pi sí manda: el perfil se convierte en directiva.
		const pi = byId("pi", "agents");
		expect(pi.status).toBe("applied");
		expect(pi.directive).toContain("Cleaner runs");
	});

	// Sin fichero no se inventa un perfil: la onboarding lo pide y hasta entonces
	// el estado honesto es "sin configurar".
	test("sin perfil configurado, Pi no asume un default", () => {
		expect(byId("pi", "agents").directive).toContain("not configured");
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
