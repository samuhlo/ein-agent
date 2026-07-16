// =============================================================================
// TESTS: lib/tdd
// Modo de TDD persistente por proyecto en .pi/ein/tdd.json: default, round-trip
// y normalización de valores inválidos.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_AGENT_HOME = join(tmpdir(), "ein-agent-tests", "agent");
process.env.EIN_PI_AGENT_HOME = TEST_AGENT_HOME;

const { readTddMode, writeTddMode, tddConfigPath, TDD_OPTIONS } = await import(
	"../ein-pi/agent/lib/tdd"
);

describe("readTddMode / writeTddMode", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-tdd-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("default 'off' sin fichero (bloque B: TDD off por defecto)", () => {
		expect(readTddMode(cwd)).toBe("off");
	});

	test("round-trip de cada modo", () => {
		for (const mode of TDD_OPTIONS) {
			writeTddMode(cwd, mode);
			expect(readTddMode(cwd)).toBe(mode);
		}
	});

	test("escribe en .pi/ein/tdd.json", () => {
		writeTddMode(cwd, "off");
		expect(tddConfigPath(cwd)).toBe(join(cwd, ".pi", "ein", "tdd.json"));
	});

	test("valor inválido o JSON roto → default 'off'", () => {
		const path = tddConfigPath(cwd);
		mkdirSync(join(cwd, ".pi", "ein"), { recursive: true });
		writeFileSync(path, JSON.stringify({ mode: "turbo" }));
		expect(readTddMode(cwd)).toBe("off");
		writeFileSync(path, "{roto");
		expect(readTddMode(cwd)).toBe("off");
	});
});
