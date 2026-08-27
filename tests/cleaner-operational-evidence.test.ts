import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { cleanerEvidenceForModel, collectCleanerPassiveEvidence, compactCleanerEvidence, ingestCleanerActiveEvidence, planCleanerActiveEvidence } from "../ein-pi/agent/lib/cleaner-operational-evidence.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(extension = "ts"): string {
	const root = mkdtempSync(join(tmpdir(), "ein-cleaner-operational-")); roots.push(root); execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: root }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root }); mkdirSync(join(root, "src")); mkdirSync(join(root, "tests"));
	const repeated = "if (value) value++;\n".repeat(45); const source = extension === "ts" ? `export function zeta(value: number) { if (value) return 1; if (value > 2) return 2; return 0; }\nexport function alpha(value: number) { ${repeated} return value; }\nexport function beta(value: number) { ${repeated} return value; }\n` : ".x { color: red; }\n";
	writeFileSync(join(root, `src/sample.${extension}`), source); writeFileSync(join(root, "tests/sample.test.ts"), "export {};\n"); writeFileSync(join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.3.0", scripts: { test: "bun test" } })); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root }); return root;
}

function manyFunctions(root: string): void {
	writeFileSync(join(root, "src/sample.ts"), Array.from({ length: 12 }, (_, index) => `export function f${String(index).padStart(2, "0")}(value: number) { ${"if (value) value--; ".repeat(index + 1)} return value; }`).join("\n")); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "many functions"], { cwd: root });
}

describe("Cleaner operational evidence", () => {
	test("combines passive packets into capped source-free deterministic facts", () => {
		const root = fixture(); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "tree", path: "src" }] }); const summary = compactCleanerEvidence(passive); const parsed = JSON.parse(summary);
		expect(Buffer.byteLength(summary)).toBeLessThan(16 * 1024); expect(summary).not.toContain("return value"); expect(summary).not.toContain("if (value)"); expect(parsed.stateRef).toBe(passive.stateRef); expect(parsed.source.files).toBe(1); expect(parsed.stack.packageManager).toBe("bun"); expect(parsed.complexity.status).toBe("available"); expect(parsed.complexity.top[0].name).toBe("alpha"); expect(parsed.complexity.top.length).toBeLessThanOrEqual(10); expect(parsed.duplication.status).toBe("available"); expect(parsed.duplication.locations.length).toBeLessThanOrEqual(10); expect(passive.audit.files[0]!.source).toContain("return value");
	});

	test("delivers every admitted source file to the model without hiding it in tool details", () => {
		const root = fixture();
		writeFileSync(join(root, "src/settings.json"), "{\"enabled\":true}\n");
		const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "tree", path: "src" }] });
		const packet = JSON.parse(cleanerEvidenceForModel(passive));
		expect(packet.summary.source.files).toBe(2);
		expect(packet.admittedSource.map(({ path }: { path: string }) => path)).toEqual(["src/sample.ts", "src/settings.json"]);
		expect(packet.admittedSource[0].source).toContain("return value");
		expect(packet.admittedSource[1].source).toContain("enabled");
	});

	test("reports unsupported passive metrics and rejects stale combination", () => {
		const root = fixture("css"); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.css" }] }); const parsed = JSON.parse(compactCleanerEvidence(passive)); expect(parsed.complexity.status).toBe("unsupported"); expect(parsed.duplication.status).toBe("unsupported"); expect(parsed.unsupported).toHaveLength(2); writeFileSync(join(root, "src/sample.css"), ".x { color: blue; }\n"); expect(() => compactCleanerEvidence(passive)).toThrow("state mismatch");
	});

	test("orders and truncates top complexity deterministically", () => {
		const root = fixture(); manyFunctions(root); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); const top = JSON.parse(compactCleanerEvidence(passive)).complexity.top; expect(top).toHaveLength(10); expect(top.map((item: { name: string }) => item.name)).toEqual(["f11", "f10", "f09", "f08", "f07", "f06", "f05", "f04", "f03", "f02"]);
	});

	test("binds an audited file beyond truncated environment discovery", () => {
		const root = fixture(); mkdirSync(join(root, "a")); for (let index = 0; index < 260; index++) writeFileSync(join(root, "a", `${String(index).padStart(3, "0")}.ts`), "export {};\n"); mkdirSync(join(root, "z")); writeFileSync(join(root, "z/target.ts"), "export function target(value: number) { if (value) return 1; return 0; }\n"); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "large fixture"], { cwd: root }); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "z/target.ts" }] });
		expect(passive.environment.scope.truncated).toBe(true); expect(passive.environment.budget.maxFiles).toBe(256); expect(passive.environment.scope.files.some(({ path }) => path === "z/target.ts")).toBe(true); expect(passive.complexity?.aggregate.count).toBe(1); expect(Buffer.byteLength(compactCleanerEvidence(passive))).toBeLessThanOrEqual(16 * 1024);
	});

	test("plans exact argv without execution and ingests current test/LCOV artifacts with CRAP", () => {
		const root = fixture(); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); const evidenceDir = mkdtempSync(join(tmpdir(), "ein-cleaner-artifacts-")); roots.push(evidenceDir); const testPath = join(evidenceDir, "results.xml"); const plan = planCleanerActiveEvidence(passive, { runner: "bun", format: "junit", scope: { files: ["tests/sample.test.ts"] }, outputPath: testPath, coverage: { outputDirectory: evidenceDir } });
		expect(plan.test.status).toBe("available"); expect(plan.coverage?.status).toBe("available"); expect(plan.coverage?.argv).toContain("--coverage"); expect(existsSync(testPath)).toBe(false); expect(existsSync(join(evidenceDir, "lcov.info"))).toBe(false);
		writeFileSync(testPath, readFileSync(join(import.meta.dir, "fixtures/bun-1.3.14-junit.xml"))); const lcovPath = plan.coverage!.artifactPath!; const digest = passive.audit.files[0]!.sha256; expect(digest).toHaveLength(64); const lines = Array.from({ length: 92 }, (_, index) => `DA:${index + 1},${index % 3 ? 1 : 0}`); writeFileSync(lcovPath, `SF:src/sample.ts\n${lines.join("\n")}\nLF:92\nLH:61\nend_of_record\n`); const binding = { preStateRef: passive.stateRef, postStateRef: passive.stateRef, exitCode: 0 }; const active = ingestCleanerActiveEvidence(passive, plan, { testArtifactPath: testPath, coverageArtifactPath: lcovPath, binding }); const parsed = JSON.parse(compactCleanerEvidence(passive, active));
		expect(parsed.active.test.totals).toMatchObject({ tests: 1, failed: 0 }); expect(parsed.active.coverage.totals.lines).toMatchObject({ found: 92, hit: 61 }); expect(parsed.active.crap.status).toBe("available"); expect(parsed.active.crap.aggregate.count).toBeGreaterThan(0);
	});

	test("executes the exact Bun plan and ingests declared JUnit plus LCOV into CRAP", () => {
		const root = fixture(); writeFileSync(join(root, "src/sample.ts"), "export function classify(value: number) {\n  if (value > 0) return 1;\n  return 0;\n}\n"); writeFileSync(join(root, "tests/sample.test.ts"), 'import { expect, test } from "bun:test";\nimport { classify } from "../src/sample.ts";\ntest("classifies positive values", () => expect(classify(1)).toBe(1));\n'); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "runtime fixture"], { cwd: root });
		const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); const evidenceDir = mkdtempSync(join(tmpdir(), "ein-cleaner-real-bun-")); roots.push(evidenceDir); const testPath = join(evidenceDir, "results.xml"); const plan = planCleanerActiveEvidence(passive, { runner: "bun", format: "junit", scope: { files: ["tests/sample.test.ts"] }, outputPath: testPath, coverage: { outputDirectory: evidenceDir } });
		expect(plan.coverage?.status).toBe("available"); const run = Bun.spawnSync([...plan.coverage!.argv!], { cwd: root, stdout: "pipe", stderr: "pipe" }); expect(run.exitCode).toBe(0); expect(readFileSync(testPath, "utf8").startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
		const binding = { preStateRef: passive.stateRef, postStateRef: passive.stateRef, exitCode: run.exitCode }; const active = ingestCleanerActiveEvidence(passive, plan, { testArtifactPath: testPath, coverageArtifactPath: plan.coverage!.artifactPath!, binding }); expect(active.coverage).toMatchObject({ status: "available", freshness: "current", reason: "collected" }); expect(active.crap?.aggregate.count).toBeGreaterThan(0);
	});

	test("keeps CRAP unavailable when active evidence is absent", () => {
		const passive = collectCleanerPassiveEvidence(fixture(), { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); expect(JSON.parse(compactCleanerEvidence(passive)).active.crap).toEqual({ status: "unavailable", reason: "active-evidence-not-ingested" });
	});

	test("blocks active ingestion after source state changes", () => {
		const root = fixture(); const passive = collectCleanerPassiveEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: "src/sample.ts" }] }); const evidenceDir = mkdtempSync(join(tmpdir(), "ein-cleaner-stale-")); roots.push(evidenceDir); const plan = planCleanerActiveEvidence(passive, { runner: "bun", format: "junit", scope: { files: ["tests/sample.test.ts"] }, outputPath: join(evidenceDir, "results.xml") }); writeFileSync(join(root, "src/sample.ts"), "export const stale = true;\n"); expect(() => ingestCleanerActiveEvidence(passive, plan, { testArtifactPath: join(evidenceDir, "results.xml") })).toThrow("state mismatch");
	});
});
