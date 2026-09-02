import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as pi from "../ein-pi/agent/lib/sdd-guardrails.ts";
import { LANE_PHASES, readChangeLane } from "../ein-pi/agent/lib/sdd-lane.ts";
import * as shared from "../shared/sdd/sdd-change-validation.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("paridad del coordinador de validación SDD", () => {
	test("Pi reexporta los lectores neutrales", () => {
		expect(pi.readSpecDeltaDeclaration).toBe(shared.readSpecDeltaDeclaration);
		expect(pi.readOpenSpecState).toBe(shared.readOpenSpecState);
		expect(pi.lintCanonicalBases).toBe(shared.lintCanonicalBases);
	});
	test("filesystem, OpenSpec y secuencia producen el mismo informe", () => {
		const cwd = mkdtempSync(join(tmpdir(), "ein-shared-validation-"));
		roots.push(cwd);
		const change = join(cwd, "openspec", "changes", "probe");
		mkdirSync(change, { recursive: true });
		writeFileSync(join(change, "scope.md"), "# Scope\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: no behavior changes\n");
		writeFileSync(join(change, "design.md"), "# Design\n\n## A. Proposal\n\nX\n\n## B. Spec\n\nY\n");

		const lintShared = shared.createLintChange((path) => LANE_PHASES[readChangeLane(path)]);
		expect(lintShared(cwd, "probe")).toEqual(pi.lintChange(cwd, "probe"));
		expect(shared.readSpecDeltaDeclaration(cwd, "probe")).toEqual(pi.readSpecDeltaDeclaration(cwd, "probe"));
		expect(shared.readOpenSpecState(cwd, "probe")).toBe(pi.readOpenSpecState(cwd, "probe"));
		expect(shared.lintCanonicalBases(cwd, "probe")).toEqual(pi.lintCanonicalBases(cwd, "probe"));
	});
});
