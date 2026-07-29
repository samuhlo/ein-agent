import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeScoutLaunch, SCOUT_REPORT_MAX_BYTES, SCOUT_REPORT_SCHEMA, validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";
const SCOUT_FRONTMATTER = join(import.meta.dir, "../ein-pi/core/agents/ein-scout.md");

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "ein-scout-"));
	writeFileSync(join(root, "evidence.ts"), "one\ntwo\nthree\n");
	return root;
}
function report(overrides: Record<string, unknown> = {}) {
	return { version: "ein-scout-report/v1", summary: "Evidence found", summaryReferenceIds: ["R1"], findings: [{ claim: "The file has three lines", referenceIds: ["R1"] }], references: [{ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "lines 1 through 3" }], uncertainties: [{ level: "none", statement: "No uncertainty for this narrow observation." }], ...overrides };
}

describe("readonly scout launch contract", () => {
	test("overwrites caller controls with the exact direct foreground contract", () => {
		const tracked = new Map<string, string>();
		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", context: "fork", extensions: ["leak"], maxRuntimeMs: 1, turnBudget: { maxTurns: 99 }, toolBudget: { hard: 99 }, acceptance: { level: "verified" } }, "call-1", tracked)!;
		expect(launch.context).toBe("fresh");
		expect(launch).not.toHaveProperty("extensions");
		expect(launch.maxRuntimeMs).toBe(120000);
		expect(launch.turnBudget).toEqual({ maxTurns: 12, graceTurns: 2 });
		expect(launch.toolBudget).toEqual({ hard: 30, soft: 24, block: "*" });
		expect(launch.outputSchema).toEqual(SCOUT_REPORT_SCHEMA);
		expect(launch.acceptance).toEqual({ level: "none", reason: "Ein validates the scout report through its deterministic local adapter" });
		expect(tracked.has("call-1")).toBe(true);
	});

	test("blocks alternate invocation forms before tracking", () => {
		for (const input of [{ agent: "ein-scout", chain: [] }, { agent: "ein-scout", tasks: [] }, { agent: "ein-scout", background: true }, { agent: "ein-scout", resume: "x" }, { agent: "ein-scout", parallel: true }]) {
			expect(() => normalizeScoutLaunch(input, "call", new Map())).toThrow("unsupported");
		}
		expect(normalizeScoutLaunch({ agent: "other" }, "call", new Map())).toBeUndefined();
	});

	test("uses canonical empty frontmatter and rejects caller extension overrides", () => {
		const scout = readFileSync(SCOUT_FRONTMATTER, "utf8");
		expect(scout).toMatch(/^extensions:\s*\[\]\s*$/m);

		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", extensions: ["leak"] }, "call-extensions", new Map())!;
		expect(launch).not.toHaveProperty("extensions");
	});
});

describe("readonly scout report validation", () => {
	test("accepts exactly one cited structured report", () => {
		expect(validateScoutReport([report()], fixture())).toEqual(report());
	});

	test("fails closed for missing, multiple, malformed, oversized, and uncertain reports", () => {
		const root = fixture();
		expect(() => validateScoutReport([], root)).toThrow("missing");
		expect(() => validateScoutReport([report(), report()], root)).toThrow("multiple");
		expect(() => validateScoutReport(["{"], root)).toThrow("malformed");
		expect(() => validateScoutReport(["x".repeat(SCOUT_REPORT_MAX_BYTES + 1)], root)).toThrow("exceeds");
		expect(() => validateScoutReport([report({ uncertainties: [] })], root)).toThrow("invalid report schema");
	});

	test("rejects unreferenced and invalid evidence", () => {
		const root = fixture();
		expect(() => validateScoutReport([report({ findings: [{ claim: "uncited", referenceIds: [] }] })], root)).toThrow();
		expect(() => validateScoutReport([report({ references: [...report().references, { id: "R2", path: "evidence.ts", startLine: 1, endLine: 1, supports: "unused" }] })], root)).toThrow("unreferenced");
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], path: "../escape" }] })], root)).toThrow("invalid reference");
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], endLine: 99 }] })], root)).toThrow("line range");
	});

	test("rejects symlink escapes", () => {
		const root = fixture();
		const outside = mkdtempSync(join(tmpdir(), "ein-scout-outside-"));
		writeFileSync(join(outside, "secret.txt"), "secret\n");
		symlinkSync(join(outside, "secret.txt"), join(root, "escape.txt"));
		expect(() => validateScoutReport([report({ references: [{ ...report().references[0], path: "escape.txt" }] })], root)).toThrow();
	});
});
