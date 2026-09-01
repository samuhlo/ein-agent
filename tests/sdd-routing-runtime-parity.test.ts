import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveSddStatus as resolvePiStatus } from "../ein-pi/agent/lib/sdd-routing-runtime.ts";
import { resolveSddStatus as resolveClaudeStatus } from "../shared/ports/sdd.ts";

let cwd: string;

function seedChange(name: string, files: Readonly<Record<string, string>>): void {
	const root = join(cwd, "openspec", "changes", name);
	mkdirSync(root, { recursive: true });
	for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
}

beforeEach(() => {
	cwd = mkdtempSync(join(tmpdir(), "ein-routing-parity-"));
	mkdirSync(join(cwd, "openspec", "changes", "archive"), { recursive: true });
});
afterEach(() => {
	rmSync(cwd, { recursive: true, force: true });
});

describe("SDD routing composition parity", () => {
	test("Pi and Claude preserve none and ambiguity", () => {
		expect(resolveClaudeStatus(cwd)).toEqual(resolvePiStatus(cwd));
		seedChange("zeta", {});
		seedChange("alpha", {});
		expect(resolveClaudeStatus(cwd)).toEqual(resolvePiStatus(cwd));
		expect(resolveClaudeStatus(cwd).selection).toEqual({
			kind: "ambiguous",
			candidates: ["alpha", "zeta"],
		});
	});

	test("Pi and Claude preserve explicit routed state and lane", () => {
		seedChange("probe", {
			"scope.md": "# Scope\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: Internal ownership refactor with unchanged lifecycle behavior.\n",
			"design.md": "# Design\n",
			"lane.json": `${JSON.stringify({ lane: "micro" }, null, 2)}\n`,
		});
		const pi = resolvePiStatus(cwd, "probe");
		const claude = resolveClaudeStatus(cwd, "probe");
		expect(claude).toEqual(pi);
		expect(claude).toMatchObject({ lane: "micro", nextRecommended: "apply", specState: "synchronized" });
	});
});
