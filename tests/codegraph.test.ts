// =============================================================================
// TESTS: lib/codegraph
// Ruta CLI-over-bash del grafo de código. Contrato clave: la directiva solo
// existe con binario + índice + modo ≠ off — sin codegraph, cero líneas de
// prompt. Más round-trip de config y detección de índice.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
	readCodegraphMode,
	writeCodegraphMode,
	codegraphConfigPath,
	projectIndexed,
	resolveCodegraphEnabled,
	codegraphDirective,
} = await import("../ein-pi/agent/lib/codegraph");

describe("config round-trip", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-cg-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("default 'auto' sin fichero", () => {
		expect(readCodegraphMode(cwd)).toBe("auto");
	});

	test("round-trip auto/off + inválido → auto", () => {
		writeCodegraphMode(cwd, "off");
		expect(readCodegraphMode(cwd)).toBe("off");
		writeCodegraphMode(cwd, "auto");
		expect(readCodegraphMode(cwd)).toBe("auto");
		writeFileSync(codegraphConfigPath(cwd), '{"mode":"maybe"}\n');
		expect(readCodegraphMode(cwd)).toBe("auto");
	});
});

describe("resolveCodegraphEnabled / directiva (FAIL CLOSED)", () => {
	let cwd: string;
	let fakeBin: string;
	const prevEnv = process.env.CODEGRAPH_BIN;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-cg-en-"));
		fakeBin = join(cwd, "codegraph-bin");
		writeFileSync(fakeBin, "#!/bin/sh\n");
		process.env.CODEGRAPH_BIN = fakeBin;
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
		if (prevEnv === undefined) delete process.env.CODEGRAPH_BIN;
		else process.env.CODEGRAPH_BIN = prevEnv;
	});

	test("sin índice → inactivo y directiva vacía (aunque haya binario)", () => {
		expect(projectIndexed(cwd)).toBe(false);
		expect(resolveCodegraphEnabled(cwd)).toBe(false);
		expect(codegraphDirective(cwd)).toBe("");
	});

	test("binario + índice + auto → activo, directiva con la doctrina", () => {
		mkdirSync(join(cwd, ".codegraph"));
		expect(resolveCodegraphEnabled(cwd)).toBe(true);
		const d = codegraphDirective(cwd);
		expect(d).toContain("codegraph explore");
		expect(d).toContain("BEFORE any grep/read");
		expect(d).toContain("staleness banner");
	});

	test("off gana a todo → directiva vacía", () => {
		mkdirSync(join(cwd, ".codegraph"));
		writeCodegraphMode(cwd, "off");
		expect(resolveCodegraphEnabled(cwd)).toBe(false);
		expect(codegraphDirective(cwd)).toBe("");
	});
});
