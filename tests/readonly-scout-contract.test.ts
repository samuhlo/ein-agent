import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acceptTrackedScoutResult, normalizeScoutLaunch, SCOUT_REPORT_MAX_BYTES, SCOUT_REPORT_SCHEMA, validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";
import { scoutStaticContract } from "../ein-pi/agent/extensions/ein-doctor.ts";
const SCOUT_FRONTMATTER = join(import.meta.dir, "../ein-pi/core/agents/ein-scout.md");
const SCOUT_SPEC = join(import.meta.dir, "../openspec/specs/scout-routing/spec.md");

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
		expect(scout).toMatch(/^extensions:\s*$/m);

		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect", extensions: ["leak"] }, "call-extensions", new Map())!;
		expect(launch).not.toHaveProperty("extensions");
	});

	test("keeps the defined blank extensions declaration canonical and doctor-readable", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-scout-doctor-"));
		try {
			const agentsDir = join(root, "agents");
			const source = readFileSync(SCOUT_FRONTMATTER, "utf8");
			const launcherSource = 'input.extensions !== undefined\nargs.push("--no-extensions")\n';
			mkdirSync(agentsDir);
			writeFileSync(join(agentsDir, "ein-scout.md"), source);

			expect(readFileSync(SCOUT_SPEC, "utf8")).toContain("defined but blank `extensions:`");
			expect(scoutStaticContract(agentsDir, launcherSource).extensions).toBe(true);

			writeFileSync(join(agentsDir, "ein-scout.md"), source.replace(/^extensions:\s*$/m, "extensions: []"));
			expect(scoutStaticContract(agentsDir, launcherSource).extensions).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("el scout queda excluido de la inyección de skills (aislado, inheritSkills:false)", () => {
		// Inyectar paths de SKILL.md (absolutos, fuera del repo) a un scout aislado
		// produce "Skills not found" y una ejecución degradada. El gate de inyección
		// de skills en ein-ai.ts debe excluir explícitamente al scout.
		const einAi = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
		expect(einAi).toMatch(/const isScout\s*=\s*startNames\.includes\("ein-scout"\)/);
		expect(einAi).toMatch(/\(isNamedAgent \|\| isSddAgent\) && !isScout/);
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

describe("readonly scout result handoff", () => {
	function tracked(): Map<string, string> {
		return new Map([["scout-call", "pending"]]);
	}

	function directResult(structuredOutput: unknown = report()): unknown {
		return { mode: "single", results: [{ structuredOutput }] };
	}

	test("passes the direct structured result through local validation", () => {
		const tracking = tracked();
		expect(acceptTrackedScoutResult(tracking, "scout-call", directResult(), false, fixture())).toEqual(report());
		expect(tracking.has("scout-call")).toBe(false);
	});

	test("fails closed for malformed successful result details", () => {
		const cases = [
			undefined,
			{ mode: "parallel", results: [{ structuredOutput: report() }] },
			{ mode: "single", results: [] },
			{ mode: "single", results: [{ structuredOutput: report() }, { structuredOutput: report() }] },
			{ mode: "single", results: [{ structuredOutput: report(), structuredOutputFailed: true }] },
			{ mode: "single", results: [{}] },
		];

		for (const details of cases) {
			const tracking = tracked();
			expect(() => acceptTrackedScoutResult(tracking, "scout-call", details, false, fixture())).toThrow("ein-scout contract");
			expect(tracking.has("scout-call")).toBe(false);
		}
	});

	test("consumes invalid and runner-error results without a replay", () => {
		const invalidTracking = tracked();
		expect(() => acceptTrackedScoutResult(invalidTracking, "scout-call", directResult(report({ summary: "" })), false, fixture())).toThrow("invalid report schema");
		expect(acceptTrackedScoutResult(invalidTracking, "scout-call", directResult(), false, fixture())).toBeUndefined();

		const errorTracking = tracked();
		expect(acceptTrackedScoutResult(errorTracking, "scout-call", undefined, true, fixture())).toBeUndefined();
		expect(errorTracking.has("scout-call")).toBe(false);
	});
});
