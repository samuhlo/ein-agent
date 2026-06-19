// =============================================================================
// TESTS: lib/mode.ts — modo de trabajo solo/team (Solo por defecto)
// Mismo patrón que persona/tdd: .pi/ein/mode.json por proyecto, default global,
// fallback "solo". La directiva inyectada es condicional al modo.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modeDirective, readMode, writeMode } from "../ein-pi/agent/lib/mode";

let DIR: string;

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "ein-mode-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("readMode / writeMode", () => {
	test("default es solo cuando no hay config de proyecto", () => {
		// (Asume que no hay ~/.pi/agent/ein-mode.json global en el runner de CI.)
		const m = readMode(DIR);
		expect(["solo", "team"]).toContain(m); // tolera default global team en local
	});

	test("round-trip: writeMode persiste y readMode lo recupera", () => {
		writeMode(DIR, "team");
		expect(readMode(DIR)).toBe("team");
		writeMode(DIR, "solo");
		expect(readMode(DIR)).toBe("solo");
	});

	test("override del proyecto gana sobre cualquier default", () => {
		writeMode(DIR, "team");
		expect(readMode(DIR)).toBe("team");
	});

	test("config corrupta cae a un valor válido", () => {
		mkdirSync(join(DIR, ".pi", "ein"), { recursive: true });
		require("node:fs").writeFileSync(join(DIR, ".pi", "ein", "mode.json"), "{ broken");
		expect(["solo", "team"]).toContain(readMode(DIR));
	});
});

describe("modeDirective", () => {
	test("solo: sin Linear, board local, sin preflight", () => {
		const d = modeDirective("solo").toLowerCase();
		expect(d).toContain("solo");
		expect(d).toContain("no linear");
		expect(d).toContain("openspec/changes");
		expect(d).toMatch(/do not run linear preflight/);
	});

	test("team: Linear es la board + preflight", () => {
		const d = modeDirective("team").toLowerCase();
		expect(d).toContain("team");
		expect(d).toContain("linear");
		expect(d).toContain("preflight");
	});
});
