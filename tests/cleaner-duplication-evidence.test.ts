import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { collectCleanerDuplicationEvidence } from "../ein-pi/agent/lib/cleaner-duplication-evidence.ts";
import { collectCleanerEnvironmentEvidence } from "../ein-pi/agent/lib/cleaner-environment-evidence.ts";

const roots: string[] = [];
function fixture(files: Record<string, string>) { const root = mkdtempSync(join(tmpdir(), "ein-duplication-")); roots.push(root); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root }); writeFileSync(join(root, "package.json"), "{}"); for (const [path, source] of Object.entries(files)) { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), source); } execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root }); return { root, environment: collectCleanerEnvironmentEvidence(root) }; }
function snapshot(root: string): string[] { const visit = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const full = join(dir, name); if (relative(root, full).startsWith(".git")) return []; return statSync(full).isDirectory() ? visit(full) : [`${relative(root, full)}:${readFileSync(full).toString("hex")}`]; }); return visit(root).sort(); }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const clone = `function calculateTotal(items: number[]) {
	let total = 0;
	for (const item of items) {
		if (item > 0) total += item * 2;
	}
	return total;
}`;

describe("Cleaner exact structural duplication evidence", () => {
	test("reports stable maximal cross-file exact clones without source text", () => { const context = fixture({ "src/a.ts": `${clone}\n`, "src/b.ts": `${clone}\n` }); const first = collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 20 }), second = collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 20 }); expect(first).toEqual(second); expect(first.aggregate).toEqual({ groups: 1, pairs: 1, occurrences: 2, clonedTokens: first.groups[0]!.tokenCount * 2 }); expect(first.groups[0]!.occurrences.map((item) => item.path)).toEqual(["src/a.ts", "src/b.ts"]); expect(first.groups[0]!.occurrences[0]!.span).toEqual({ startOffset: 0, endOffset: clone.length, startLine: 1, startColumn: 1, endLine: 7, endColumn: 2 }); expect(JSON.stringify(first)).not.toContain("calculateTotal"); expect(Object.isFrozen(first.groups[0]!.occurrences)).toBe(true); });

	test("retains identifier and literal spelling and excludes short boilerplate", () => { const renamed = clone.replaceAll("total", "sum").replace("* 2", "* 3"); const context = fixture({ "src/a.ts": clone, "src/b.ts": renamed, "src/c.ts": "export const ready = true", "src/d.ts": "export const ready = true" }); const evidence = collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 20 }); expect(evidence.groups).toEqual([]); expect(evidence.definition.identifiers).toBe("exact-spelling-retained"); expect(evidence.definition.literals).toBe("exact-spelling-retained"); expect(evidence.definition.semanticDuplication).toBe("not-measured"); });

	test("detects same-file non-overlapping clones and suppresses contained windows", () => { const context = fixture({ "src/a.js": `${clone}\nconst divider = true;\n${clone}\n` }); const evidence = collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 10 }); expect(evidence.groups).toHaveLength(1); expect(evidence.groups[0]!.pairs).toHaveLength(1); expect(evidence.groups[0]!.occurrences.map((item) => item.span.startLine)).toEqual([1, 9]); });

	test("supports JSX, TSX, Vue, and Astro admitted regions with original offsets", () => { const jsx = "export function View() { const title = 'x'; return <section>{title}</section> }"; const context = fixture({ "src/a.jsx": jsx, "src/b.tsx": jsx, "src/App.vue": `<template><p /></template>\n<script setup lang="ts">\n${clone}\n</script>`, "src/Page.astro": `---\n${clone}\n---\n<div />` }); const evidence = collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 20 }); expect(evidence.groups.some((group) => group.occurrences.map((item) => item.path).join(",") === "src/App.vue,src/Page.astro")).toBe(true); const component = evidence.groups.flatMap((group) => group.occurrences).find((item) => item.path === "src/App.vue"); expect(component?.span.startLine).toBe(3); expect(evidence.groups.some((group) => group.occurrences.map((item) => item.path).join(",") === "src/a.jsx,src/b.tsx")).toBe(true); });

	test("rejects malformed, unsafe, stale, forged, and bounded sources and stays read-only", () => { for (const [path, source] of [["src/bad.ts", "export function broken( {"], ["src/App.vue", "<script src='x.ts'></script>"], ["src/Page.astro", "<script type='text/babel'></script>"]] as const) { const context = fixture({ [path]: source }); expect(() => collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 2 })).toThrow(); } const context = fixture({ "src/a.ts": clone, "src/b.ts": clone }); const before = snapshot(context.root); expect(() => collectCleanerDuplicationEvidence(context.environment, undefined, { maxBytes: 1 })).toThrow("byte budget"); expect(() => collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 2, maxWindows: 1 })).toThrow("window budget"); expect(() => collectCleanerDuplicationEvidence(context.environment, undefined, { minTokens: 2, maxCandidatePairs: 1 })).toThrow("candidate-pair budget"); const forged = { ...context.environment, scope: { ...context.environment.scope, files: context.environment.scope.files.map((file) => file.path === "src/a.ts" ? { ...file, sha256: "0".repeat(64) } : file) } }; expect(() => collectCleanerDuplicationEvidence(forged)).toThrow("digest is stale"); expect(snapshot(context.root)).toEqual(before); writeFileSync(join(context.root, "src/a.ts"), "changed"); expect(() => collectCleanerDuplicationEvidence(context.environment)).toThrow("state is stale"); });
});
