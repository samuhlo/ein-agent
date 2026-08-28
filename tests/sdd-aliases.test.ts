// =============================================================================
// TESTS: SDD canonical command aliases (ein-ai.ts)
// Verifica que /ein:sdd-audit y /ein:sdd-close son los comandos canonicos.
// /ein:sdd-check sigue como alias no-fase; el comando previo de cierre queda fuera del surface publico.
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

	test("ein:sdd-next is registered as canonical read-only command", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-next"/);
		expect(src).not.toMatch(/registerCommand\(\s*"ein:sdd-next-[^"]+"/);
	});

	test("ein:focus is registered as a session-only recovery command", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:focus"/);
		const block = src.match(/registerCommand\(\s*"ein:focus"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		expect(block).toContain("publishSessionBinding");
		expect(block).not.toContain("sendUserMessage");
	});

	test("old close command is not registered", () => {
		const oldCloseCommand = `ein:sdd-${"archive"}`;
		expect(src).not.toContain(`registerCommand("${oldCloseCommand}"`);
	});

	test("handler for sdd-audit and sdd-check is the same function", () => {
		// Ambos comandos registran la misma funcion handleSddAudit
		expect(src).toMatch(/handleSddAudit\(args, ctx\)/);
		// Dos registerCommand referencian handleSddAudit
		const matches = src.match(/handler:\s*async\s*\(\s*args,\s*ctx\s*\)\s*=>\s*handleSddAudit/g);
		expect(matches).toHaveLength(2);
	});

	test("handler for sdd-close is singular", () => {
		expect(src).toMatch(/handleSddClose\(args, ctx\)/);
		const matches = src.match(/handler:\s*async\s*\(\s*args,\s*ctx\s*\)\s*=>\s*handleSddClose/g);
		expect(matches).toHaveLength(1);
	});

	test("sdd-check description is marked as legacy", () => {
		const block = src.match(/registerCommand\(\s*"ein:sdd-check"[\s\S]*?(?=registerCommand|$)/)?.[0];
		expect(block).toMatch(/\[legacy\]/);
	});

	test("old close command key is absent", () => {
		expect(src).not.toContain(`cmd.sdd-${"archive"}`);
	});
});
