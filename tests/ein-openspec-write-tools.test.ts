// =============================================================================
// TESTS: EIN OPENSPEC WRITE TOOLS
// Keeps delta creation and canonical synchronization under one explicit owner.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerOpenSpecWriteTools } from "../ein-pi/agent/extensions/internal/ein-openspec-write-tools.ts";

test("registers delta and synchronization tools", () => {
	const tools: string[] = [];
	registerOpenSpecWriteTools(((spec: { name: string }) => {
		tools.push(spec.name);
	}) as never);

	expect(tools).toEqual(["ein_openspec_sync", "ein_openspec_delta_write"]);
});

test("the main extension delegates OpenSpec writes", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain("registerOpenSpecWriteTools(registerEinTool);");
	expect(source).not.toContain('name: "ein_openspec_sync"');
	expect(source).not.toContain('name: "ein_openspec_delta_write"');
});
