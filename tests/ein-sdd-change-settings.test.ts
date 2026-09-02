// =============================================================================
// TESTS: EIN SDD CHANGE SETTINGS
// Keeps lane and TDD stance under one filesystem-backed tool owner.
// =============================================================================

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerSddChangeSettings } from "../ein-pi/agent/extensions/internal/ein-sdd-change-settings.ts";

test("registers lane and preflight tools", () => {
	const tools: string[] = [];
	registerSddChangeSettings(((spec: { name: string }) => {
		tools.push(spec.name);
	}) as never);

	expect(tools).toEqual(["ein_sdd_lane", "ein_sdd_preflight"]);
});

test("the main extension delegates change settings", () => {
	const source = readFileSync(
		join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"),
		"utf8",
	);

	expect(source).toContain("registerSddChangeSettings(registerEinTool);");
	expect(source).not.toContain('name: "ein_sdd_lane"');
	expect(source).not.toContain('name: "ein_sdd_preflight"');
});
