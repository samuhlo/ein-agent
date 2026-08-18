// =============================================================================
// TESTS: lib/gitignore
// Bloque gestionado e idempotente en .gitignore: alta, preservación de lo
// previo, idempotencia y migración del bloque legacy (# Local Pi runtime state).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { ensureEinGitignore, gitignoreBlock, upsertBlock } = await import(
	"../ein-pi/agent/lib/gitignore"
);

describe("upsertBlock", () => {
	test("desde vacío añade el bloque completo", () => {
		const out = upsertBlock("");
		expect(out).not.toBeNull();
		expect(out).toContain(".pi/ein/");
		expect(out).toContain(".piagents/");
		expect(out).toContain(".pi-subagents/");
		expect(out).toContain(".codegraph/");
		expect(out).toContain(gitignoreBlock());
	});

	test("gitignoreBlock() ignora el checkpoint de continuidad SDD", () => {
		expect(gitignoreBlock()).toContain("openspec/changes/**/continuity.json");
	});

	test("gitignoreBlock() ignora el checkpoint de continuidad del carril adhoc", () => {
		expect(gitignoreBlock()).toContain(".ein/continuity.json");
	});

	test("upsertBlock() no duplica una regla /.ein/ preexistente fuera del bloque gestionado", () => {
		const existing = "node_modules\n/.ein/\n";
		const out = upsertBlock(existing) as string;
		const einLines = out.split("\n").filter((l) => l.trim() === "/.ein/");
		expect(einLines.length).toBe(1);
		expect(out).toContain(".ein/continuity.json");
	});

	test("preserva contenido previo y anexa el bloque", () => {
		const out = upsertBlock("node_modules\ndist\n");
		expect(out).toContain("node_modules");
		expect(out).toContain("dist");
		expect(out).toContain(".piagents/");
	});

	test("idempotente: segunda pasada no cambia nada", () => {
		const first = upsertBlock("node_modules\n");
		expect(first).not.toBeNull();
		const second = upsertBlock(first as string);
		expect(second).toBeNull();
	});

	test("migra el bloque legacy (# Local Pi runtime state + .atl/)", () => {
		const legacy = "node_modules\n# Local Pi runtime state\n.atl/\n";
		const out = upsertBlock(legacy);
		expect(out).not.toBeNull();
		expect(out).not.toContain("# Local Pi runtime state");
		expect(out).not.toContain(".atl/");
		expect(out).toContain(".pi/ein/");
		expect(out).toContain("node_modules");
	});
});

describe("ensureEinGitignore", () => {
	let cwd: string;
	beforeEach(() => {
		cwd = mkdtempSync(join(tmpdir(), "ein-gi-"));
	});
	afterEach(() => {
		rmSync(cwd, { recursive: true, force: true });
	});

	test("crea .gitignore con el bloque si no existe", () => {
		ensureEinGitignore(cwd);
		const gi = join(cwd, ".gitignore");
		expect(existsSync(gi)).toBe(true);
		expect(readFileSync(gi, "utf8")).toContain(".pi/ein/");
	});

	test("no reescribe si ya está al día", () => {
		ensureEinGitignore(cwd);
		const gi = join(cwd, ".gitignore");
		const mtime1 = readFileSync(gi, "utf8");
		ensureEinGitignore(cwd);
		expect(readFileSync(gi, "utf8")).toBe(mtime1);
	});

	test("conserva entradas del usuario al actualizar", () => {
		const gi = join(cwd, ".gitignore");
		writeFileSync(gi, "*.log\n.env\n");
		ensureEinGitignore(cwd);
		const content = readFileSync(gi, "utf8");
		expect(content).toContain("*.log");
		expect(content).toContain(".env");
		expect(content).toContain(".piagents/");
	});
});
