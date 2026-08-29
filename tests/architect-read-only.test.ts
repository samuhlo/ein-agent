import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ArchitectAdmissionError, bindArchitectPlan, collectArchitectEvidence, validateArchitectPlan } from "../ein-pi/agent/lib/architect-read-only.ts";

const roots: string[] = [];
const scope = { kind: "selectors", selectors: [{ kind: "tree", path: "src/core" }] } as const;
const plan = { proposedBoundaries: ["core owns policy"], affectedModules: ["src/core"], migrationSteps: ["Introduce boundary", "Move detail"], risks: ["API drift"], invariants: ["Behavior remains stable"], verification: ["Run focused tests"], unresolvedDecisions: [], propertyTests: [] };

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-architect-"));
	roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	mkdirSync(join(root, "src/core"), { recursive: true });
	writeFileSync(join(root, "src/core/policy.ts"), "export const policy = 1;\n");
	writeFileSync(join(root, "src/core/detail.ts"), "export const detail = 2;\n");
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
	return root;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Architect read-only flow", () => {
	test("collects stable bounded evidence and reports unavailable graph honestly", () => {
		const root = fixture();
		const before = readFileSync(join(root, "src/core/policy.ts"), "utf8");
		const first = collectArchitectEvidence(root, scope);
		expect(collectArchitectEvidence(root, scope)).toEqual(first);
		expect(first).toMatchObject({ mode: "read-only", repository: { files: 2 }, graph: { availability: "unavailable", provenance: "pi-runtime", edges: [], cycles: [] } });
		expect(first.modules).toEqual(["src/core"]);
		expect(first.constraints).toContain("no-source-writes");
		expect(readFileSync(join(root, "src/core/policy.ts"), "utf8")).toBe(before);
	});

	test("includes configuration and executable source needed to inspect a module boundary", () => {
		const root = fixture();
		writeFileSync(join(root, "src/core/settings.json"), "{}\n");
		writeFileSync(join(root, "src/core/deploy.sh"), "#!/bin/sh\n");
		const evidence = collectArchitectEvidence(root, scope);
		expect(evidence.files.map(({ path }) => path)).toEqual(["src/core/deploy.sh", "src/core/detail.ts", "src/core/policy.ts", "src/core/settings.json"]);
	});

	test("rejects malformed, root-wide, missing, restricted, symlinked, unsupported, and oversized scopes", () => {
		const root = fixture();
		symlinkSync(join(root, "src/core"), join(root, "linked"));
		writeFileSync(join(root, "README.bin"), "unsupported");
		for (const requested of [undefined, { kind: "selectors", selectors: [{ kind: "tree", path: "." }] }, { kind: "selectors", selectors: [{ kind: "tree", path: "missing" }] }, { kind: "selectors", selectors: [{ kind: "tree", path: ".git" }] }, { kind: "selectors", selectors: [{ kind: "tree", path: "linked" }] }, { kind: "selectors", selectors: [{ kind: "file", path: "linked/policy.ts" }] }, { kind: "selectors", selectors: [{ kind: "file", path: "README.bin" }] }]) {
			expect(() => collectArchitectEvidence(root, requested)).toThrow(ArchitectAdmissionError);
		}
		writeFileSync(join(root, "src/core/huge.ts"), "x".repeat(129 * 1024));
		expect(() => collectArchitectEvidence(root, scope)).toThrow("scope-exceeds-128-kib-source");
	});

	test("binds a shaped in-scope plan and validates it against current evidence", () => {
		const root = fixture();
		const evidence = collectArchitectEvidence(root, scope);
		const bound = bindArchitectPlan(root, evidence, { ...plan, affectedModules: ["src/core/nested"] });
		expect(bound.binding).toMatchObject({ evidenceId: evidence.evidenceId, areaId: evidence.scope.areaId });
		expect(validateArchitectPlan(root, bound)).toMatchObject({ mode: "read-only", status: "admitted" });
	});

	test("requires canonical affected module paths before selector containment", () => {
		const root = fixture();
		const evidence = collectArchitectEvidence(root, scope);
		for (const affectedModule of ["src/core/../outside", "src/core\\..\\outside", "/src/core", "C:/src/core"]) {
			expect(() => bindArchitectPlan(root, evidence, { ...plan, affectedModules: [affectedModule] })).toThrow("malformed-plan");
		}
	});

	test("does not treat dot as a top-level exact-file module", () => {
		const root = fixture();
		writeFileSync(join(root, "entry.ts"), "export const entry = true;\n");
		const exactFileScope = { kind: "selectors", selectors: [{ kind: "file", path: "entry.ts" }] } as const;
		const evidence = collectArchitectEvidence(root, exactFileScope);
		expect(evidence.modules).toEqual(["entry.ts"]);
		expect(() => bindArchitectPlan(root, evidence, { ...plan, affectedModules: ["."] })).toThrow("malformed-plan");
		expect(bindArchitectPlan(root, evidence, { ...plan, affectedModules: ["entry.ts"] }).plan.affectedModules).toEqual(["entry.ts"]);
	});

	test("rejects stale, unbound, out-of-scope, and malformed plans", () => {
		const root = fixture();
		const evidence = collectArchitectEvidence(root, scope);
		expect(() => bindArchitectPlan(root, {}, plan)).toThrow("unbound-plan");
		expect(() => bindArchitectPlan(root, evidence, { ...plan, affectedModules: ["src/other"] })).toThrow("plan-out-of-scope");
		expect(() => bindArchitectPlan(root, evidence, { ...plan, migrationSteps: [] })).toThrow("malformed-plan");
		const bound = bindArchitectPlan(root, evidence, plan);
		writeFileSync(join(root, "src/core/policy.ts"), "export const policy = 3;\n");
		expect(() => bindArchitectPlan(root, evidence, plan)).toThrow("stale-evidence");
		expect(() => validateArchitectPlan(root, bound)).toThrow("stale-plan");
		expect(() => validateArchitectPlan(root, { plan })).toThrow("unbound-or-malformed-plan");
	});

	test("agent exposes only the three Architect read-only tools", () => {
		const asset = readFileSync(join(import.meta.dir, "../runtime/agents/ein-architect.md"), "utf8");
		expect(asset.match(/^tools: (.+)$/m)?.[1]).toBe("ein_architect_evidence, ein_architect_plan_bind, ein_architect_validate");
		for (const forbidden of ["bash", "write", "edit", "ein_cleaner_improve_apply", "ein_openspec_delta_write"]) expect(asset.match(/^tools: (.+)$/m)?.[1]).not.toContain(forbidden);
	});
});
