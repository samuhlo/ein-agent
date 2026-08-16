import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { collectCleanerEnvironmentEvidence } from "../ein-pi/agent/lib/cleaner-environment-evidence.ts";

const roots: string[] = [];
function fixture(files: Record<string, string>, pkg: unknown = {}): string {
	const root = mkdtempSync(join(tmpdir(), "ein-cleaner-environment-")); roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	writeFileSync(join(root, "package.json"), typeof pkg === "string" ? pkg : JSON.stringify(pkg));
	for (const [path, source] of Object.entries(files)) { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), source); }
	execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root }); return root;
}
function snapshot(root: string): string[] {
	const visit = (directory: string): string[] => readdirSync(directory).flatMap((name) => { const path = join(directory, name); if (relative(root, path).startsWith(".git")) return []; return statSync(path).isDirectory() ? visit(path) : [`${relative(root, path)}:${readFileSync(path).toString("hex")}`]; });
	return visit(root).sort();
}
function status(root: string, kind: string): string { return collectCleanerEnvironmentEvidence(root).capabilities.find((item) => item.kind === kind)?.status ?? "missing"; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Cleaner environment evidence", () => {
	test("detects plain JS/TS and Bun from narrow signals", () => {
		const root = fixture({ "src/a.ts": "export {}", "src/b.mjs": "export {}", "bun.lock": "" }, { packageManager: "bun@1.2.0", scripts: { test: "bun test", coverage: "bun test --coverage" } });
		const evidence = collectCleanerEnvironmentEvidence(root);
		expect(evidence.languages).toEqual([".mjs", ".ts"]); expect(evidence.tools.packageManager.name).toBe("bun"); expect(status(root, "bun-junit")).toBe("available"); expect(status(root, "bun-lcov")).toBe("available");
	});

	test("detects Vitest dependency, config, scripts, and potential formats", () => {
		const root = fixture({ "src/a.ts": "", "vitest.config.ts": "export default {}" }, { devDependencies: { vitest: "^3" }, scripts: { test: "vitest run" } });
		const evidence = collectCleanerEnvironmentEvidence(root); expect(evidence.tools.vitest.provenance).toEqual(["package.json#dependencies.vitest", "vitest.config.*", "package.json#scripts"]); expect(status(root, "vitest-json")).toBe("available"); expect(status(root, "vitest-junit")).toBe("available"); expect(status(root, "vitest-lcov")).toBe("available");
	});

	test("detects Vue source and complexity eligibility", () => {
		const root = fixture({ "src/App.vue": "<script setup lang=\"ts\"></script>" }, { dependencies: { vue: "^3" } }); const evidence = collectCleanerEnvironmentEvidence(root);
		expect(evidence.frameworks.vue).toEqual(["*.vue", "package.json#dependencies.vue"]); expect(status(root, "complexity-vue")).toBe("available");
	});

	test("detects Astro source and complexity eligibility", () => {
		const root = fixture({ "src/Page.astro": "---\nconst x = 1\n---" }, { dependencies: { astro: "^5" } }); const evidence = collectCleanerEnvironmentEvidence(root);
		expect(evidence.frameworks.astro).toEqual(["*.astro", "package.json#dependencies.astro"]); expect(status(root, "complexity-astro")).toBe("available");
	});

	test("detects a mixed fixture through the same core", () => {
		const root = fixture({ "src/App.vue": "<script setup lang=\"ts\"></script>", "src/Page.astro": "---\nconst x = 1\n---", "src/core.ts": "" }, { dependencies: { vue: "^3", astro: "^5", vitest: "^3" } });
		const evidence = collectCleanerEnvironmentEvidence(root); expect(evidence.frameworks.vue).toEqual(["*.vue", "package.json#dependencies.vue"]); expect(evidence.frameworks.astro).toEqual(["*.astro", "package.json#dependencies.astro"]); expect(status(root, "complexity-js-ts")).toBe("available"); expect(status(root, "complexity-vue")).toBe("available"); expect(status(root, "complexity-astro")).toBe("available"); expect(status(root, "duplication")).toBe("available");
	});

	test("fails malformed package metadata closed and rejects deceptive scripts", () => {
		const malformed = fixture({ "src/a.ts": "" }, "{ nope"); const deceptive = fixture({ "src/a.ts": "" }, { scripts: { test: "echo vitest", chained: "echo ok && vitest" } });
		expect(collectCleanerEnvironmentEvidence(malformed).tools.vitest.status).toBe("invalid"); expect(collectCleanerEnvironmentEvidence(malformed).scripts).toEqual([]); expect(collectCleanerEnvironmentEvidence(deceptive).tools.vitest.status).toBe("unavailable"); expect(collectCleanerEnvironmentEvidence(deceptive).scripts.find(({ name }) => name === "chained")?.reason).toBe("unsafe-command");
	});

	test("reports absent tooling and excludes generated and dependency trees", () => {
		const root = fixture({ "src/a.ts": "", "node_modules/fake.vue": "", "dist/fake.astro": "", ".atl/secret.ts": "" }); const evidence = collectCleanerEnvironmentEvidence(root);
		expect(evidence.scope.files.map(({ path }) => path)).toEqual(["src/a.ts"]); expect(evidence.tools.vitest.status).toBe("unavailable"); expect(evidence.frameworks).toEqual({ vue: [], astro: [] });
	});

	test("bounds and honestly truncates the deterministic scan", () => {
		const root = fixture(Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`src/${index}.ts`, ""]))); const evidence = collectCleanerEnvironmentEvidence(root, { maxFiles: 3 });
		expect(evidence.scope.truncated).toBe(true); expect(evidence.budget.observedFiles).toBe(4); expect(evidence.scope.files.length).toBeLessThanOrEqual(2);
	});

	test("includes safe exact evidence beyond truncated discovery and rejects unsafe paths", () => {
		const files = Object.fromEntries(Array.from({ length: 260 }, (_, index) => [`a/${String(index).padStart(3, "0")}.ts`, "export {}"])); files["z/target.ts"] = "export const target = true"; const root = fixture(files); const evidence = collectCleanerEnvironmentEvidence(root, {}, ["z/target.ts"]);
		expect(evidence.scope.truncated).toBe(true); expect(evidence.budget).toMatchObject({ maxFiles: 256, maxExactFiles: 32, maxExactBytes: 128 * 1024, observedExactFiles: 1, observedExactBytes: 26 }); expect(evidence.scope.files.some(({ path }) => path === "z/target.ts")).toBe(true); expect(evidence.scope.files.length).toBeLessThanOrEqual(288); expect(() => collectCleanerEnvironmentEvidence(root, {}, ["../target.ts"])).toThrow("unsafe"); expect(() => collectCleanerEnvironmentEvidence(root, {}, ["node_modules/target.ts"])).toThrow("unsafe"); expect(() => collectCleanerEnvironmentEvidence(root, {}, ["z/missing.ts"])).toThrow("unavailable");
	});

	test("binds stable identity to current Git state, freezes output, and stays read-only", () => {
		const root = fixture({ "src/a.ts": "export const a = 1" }); const before = snapshot(root); const first = collectCleanerEnvironmentEvidence(root); const second = collectCleanerEnvironmentEvidence(root);
		expect(first).toEqual(second); expect(Object.isFrozen(first.capabilities)).toBe(true); expect(snapshot(root)).toEqual(before); writeFileSync(join(root, "src/a.ts"), "export const a = 2"); const changed = collectCleanerEnvironmentEvidence(root); expect(changed.sourceState.stateRef).not.toBe(first.sourceState.stateRef); expect(changed.outputIdentity.digest).not.toBe(first.outputIdentity.digest);
	});
});
