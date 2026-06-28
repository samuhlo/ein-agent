// =============================================================================
// TESTS: SDD canonical command aliases (ein-ai.ts)
// Verifica que /ein:sdd-audit y /ein:sdd-close son los comandos canonicos,
// y que /ein:sdd-check y /ein:sdd-archive siguen registrados como aliases legacy.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EIN_AI_PATH = join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts");

describe("SDD canonical command aliases", () => {
	const src = readFileSync(EIN_AI_PATH, "utf8");

	test("ein:sdd-audit is registered as canonical command", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-audit"/);
	});

	test("ein:sdd-check is registered as legacy alias", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-check"/);
	});

	test("ein:sdd-close is registered as canonical command", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-close"/);
	});

	test("ein:sdd-archive is registered as legacy alias", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-archive"/);
	});

	test("handler for sdd-audit and sdd-check is the same function", () => {
		// Ambos comandos registran la misma funcion handleSddAudit
		expect(src).toMatch(/handleSddAudit\(args, ctx\)/);
		// Dos registerCommand referencian handleSddAudit
		const matches = src.match(/handler:\s*async\s*\(\s*args,\s*ctx\s*\)\s*=>\s*handleSddAudit/g);
		expect(matches).toHaveLength(2);
	});

	test("handler for sdd-close and sdd-archive is the same function", () => {
		// Ambos comandos registran la misma funcion handleSddClose
		expect(src).toMatch(/handleSddClose\(args, ctx\)/);
		// Dos registerCommand referencian handleSddClose
		const matches = src.match(/handler:\s*async\s*\(\s*args,\s*ctx\s*\)\s*=>\s*handleSddClose/g);
		expect(matches).toHaveLength(2);
	});

	test("sdd-check description is marked as legacy", () => {
		const block = src.match(/registerCommand\(\s*"ein:sdd-check"[\s\S]*?(?=registerCommand|$)/)?.[0];
		expect(block).toMatch(/\[legacy\]/);
	});

	test("sdd-archive description is marked as legacy", () => {
		const block = src.match(/registerCommand\(\s*"ein:sdd-archive"[\s\S]*?(?=registerCommand|$)/)?.[0];
		expect(block).toMatch(/\[legacy\]/);
	});
});