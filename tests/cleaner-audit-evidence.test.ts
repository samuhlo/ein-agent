import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { CLEANER_AUDIT_LIMITS, CleanerAuditScopeError, collectCleanerAuditEvidence } from "../ein-pi/agent/lib/cleaner-audit-evidence.ts";

const roots: string[] = [];

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-cleaner-audit-"));
	roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src", "alpha.ts"), "export function alpha(): number {\n\treturn 1;\n}\n");
	writeFileSync(join(root, "src", "beta.ts"), "export const beta = 2;\n");
	writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "bun test", coverage: "bun test --coverage" } }));
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
	return root;
}

function snapshot(root: string): string[] {
	const visit = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		if (relative(root, path).startsWith(".git")) return [];
		return statSync(path).isDirectory() ? visit(path) : [`${relative(root, path)}:${readFileSync(path).toString("hex")}`];
	});
	return visit(root).sort();
}

function addSourceFiles(root: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => {
		const path = `src/file-${String(index).padStart(2, "0")}.ts`;
		writeFileSync(join(root, path), "");
		return path;
	});
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Cleaner deterministic audit evidence", () => {
	test("rejects invalid and unbounded scopes before source traversal", () => {
		const root = fixture();
		expect(() => collectCleanerAuditEvidence(root, { kind: "changed-files", extra: true } as never)).toThrow("malformed-scope");
		for (const selectors of [[], [{ kind: "tree" as const, path: "." }], [{ kind: "tree" as const, path: "missing" }]]) {
			expect(() => collectCleanerAuditEvidence(root, { kind: "selectors", selectors })).toThrow(CleanerAuditScopeError);
		}
	});

	test("publishes immutable limits shared by Cleaner consumers", () => {
		expect(CLEANER_AUDIT_LIMITS).toEqual({ maxFiles: 32, maxSourceBytes: 128 * 1024 });
		expect(Object.isFrozen(CLEANER_AUDIT_LIMITS)).toBe(true);

		const root = fixture();
		const selectors = addSourceFiles(root, CLEANER_AUDIT_LIMITS.maxFiles + 1).map((path) => ({ kind: "file" as const, path }));
		expect(() => collectCleanerAuditEvidence(root, { kind: "selectors", selectors })).toThrow("scope-exceeds-32-source-files");

		const oversized = fixture();
		const path = "src/oversized.ts";
		writeFileSync(join(oversized, path), Buffer.alloc(CLEANER_AUDIT_LIMITS.maxSourceBytes + 1, 0x61));
		expect(() => collectCleanerAuditEvidence(oversized, { kind: "selectors", selectors: [{ kind: "file", path }] })).toThrow("scope-exceeds-128-kib-source");
	});

	test("enforces the source-file cap for the changed-file set", () => {
		const root = fixture();
		addSourceFiles(root, CLEANER_AUDIT_LIMITS.maxFiles + 1);
		expect(() => collectCleanerAuditEvidence(root, { kind: "changed-files" })).toThrow("scope-exceeds-32-source-files");
	});

	test("accepts exactly the authoritative per-call file and byte limits", () => {
		const root = fixture();
		const paths = addSourceFiles(root, CLEANER_AUDIT_LIMITS.maxFiles - 2);
		const accepted = collectCleanerAuditEvidence(root, { kind: "selectors", selectors: paths.map((path) => ({ kind: "file" as const, path })) });
		expect(accepted.repository.scopedFiles).toBe(CLEANER_AUDIT_LIMITS.maxFiles - 2);
		expect(accepted.files.map(({ path }) => path)).toEqual(paths);
	});

	test("produces a stable compact packet with facts, source identity, and honest missing evidence", () => {
		const root = fixture();
		const scope = { kind: "selectors" as const, selectors: [{ kind: "tree" as const, path: "src" }] };
		const first = collectCleanerAuditEvidence(root, scope);
		const second = collectCleanerAuditEvidence(root, scope);
		expect(first).toEqual(second);
		expect(JSON.stringify(first).length).toBeLessThan(130 * 1024);
		expect(first.sourceIdentity).toMatchObject({ kind: "git-state", freshness: "current" });
		expect(first.repository).toMatchObject({ scopedFiles: 2 });
		expect(first.measuredEvidence.tooling).toEqual(["package-script:coverage", "package-script:test"]);
		expect(first.missingEvidence.map(({ kind }) => kind)).toEqual(["test-results", "coverage", "crap"]);
		expect(first.missingEvidence.find(({ kind }) => kind === "crap")?.reason).toBe("No fresh bound test and coverage evidence has been ingested for CRAP.");
		expect(JSON.stringify(first.missingEvidence)).not.toContain("No deterministic CRAP collector available");
		expect(first.constraints).toContain("do-not-recompute-measured-facts");
	});

	test("is source-read-only and supports the deterministic changed-file set", () => {
		const root = fixture();
		writeFileSync(join(root, "src", "alpha.ts"), "export function alpha(): number { return 3; }\n");
		const before = snapshot(root);
		const evidence = collectCleanerAuditEvidence(root, { kind: "changed-files" });
		expect(evidence.files.map(({ path }) => path)).toEqual(["src/alpha.ts"]);
		expect(evidence.measuredEvidence.changedFilesInScope).toEqual(["src/alpha.ts"]);
		expect(snapshot(root)).toEqual(before);
	});
});
