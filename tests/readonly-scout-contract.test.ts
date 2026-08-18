import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acceptTrackedScoutResult, normalizeScoutLaunch, SCOUT_REPORT_MAX_BYTES, validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";
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
		expect(launch).not.toHaveProperty("outputSchema");
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

	test("rejects a second scout launch while one is pending (R6: fail at launch, not after)", () => {
		const tracked = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked);
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect B" }, "call-2", tracked)).toThrow("already pending");
	});

	test("does not reject a relaunch that reuses the same toolCallId (R6, idempotent re-normalization)", () => {
		const tracked = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked);
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-1", tracked)).not.toThrow();
	});

	test("forces async: false on the direct form too (R7)", () => {
		const launch = normalizeScoutLaunch({ agent: "ein-scout", task: "inspect" }, "call-direct", new Map())!;
		expect(launch.async).toBe(false);
	});

	test("an orphaned pending entry (cancelled/dead scout, no result ever accepted) blocks every later launch until the tracking map is cleared at the next user turn (R6 residual risk closed)", () => {
		const tracking = new Map<string, string>();
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect A" }, "call-orphan", tracking);
		// The orphaned scout never reaches `acceptTrackedScoutResult` (cancelled, or
		// the subagent died without emitting a tool_result). Without a turn-boundary
		// reset this blocks the session until `session_shutdown`.
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect B" }, "call-next", tracking)).toThrow("already pending");
		// A fresh user turn (the mechanism wired into `pi.on("input", ...)` in
		// `ein-ai.ts`) clears the tracking map, so the orphan cannot survive the
		// turn that created it.
		tracking.clear();
		expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "inspect B" }, "call-next", tracking)).not.toThrow();
	});

	test("ein-ai.ts clears scoutTracking at the start of every user turn, not only at session_shutdown (R6 residual risk)", () => {
		const einAi = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
		const inputHook = einAi.slice(einAi.indexOf('pi.on("input"'), einAi.indexOf('pi.on("input"') + 800);
		expect(inputHook).toMatch(/scoutTracking\.clear\(\)/);
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

	// Regresión real de 0.30.0: al quitar el outputSchema, un modelo barato emite
	// `uncertainties` como strings y `references` con un `lines` "N-M" en vez de
	// startLine/endLine. El scout hacía el trabajo bien pero el reporte se
	// descartaba. Se aceptan ambas formas normalizándolas a la canónica.
	test("acepta uncertainties como strings y references con `lines` (regresión 0.30.0)", () => {
		const root = fixture();
		const validated = validateScoutReport([report({
			references: [{ id: "R1", path: "evidence.ts", lines: "1-3", supports: "lines 1 through 3" }],
			uncertainties: ["No tests were run in this read-only pass."],
		})], root);
		expect(validated.references[0]).toEqual({ id: "R1", path: "evidence.ts", startLine: 1, endLine: 3, supports: "lines 1 through 3" });
		expect(validated.uncertainties).toEqual([{ level: "material", statement: "No tests were run in this read-only pass." }]);
	});

	test("acepta `lines` de una sola línea pero no relaja la validación de citas", () => {
		const root = fixture();
		expect(validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "2", supports: "line two" }] })], root).references[0])
			.toEqual({ id: "R1", path: "evidence.ts", startLine: 2, endLine: 2, supports: "line two" });
		// El oro sigue estricto: un rango fuera del fichero o un `lines` no numérico fallan.
		expect(() => validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "1-99", supports: "x" }] })], root)).toThrow("line range");
		expect(() => validateScoutReport([report({ references: [{ id: "R1", path: "evidence.ts", lines: "abc", supports: "x" }] })], root)).toThrow("invalid reference");
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
	// El scout entrega su reporte como su SALIDA FINAL (finalOutput), igual que
	// cualquier subagente — ya no por el canal structuredOutput. El modelo lo
	// emite como texto (lo hizo 3 de 4 veces en el run real); antes se descartaba.
	function result(finalOutput: unknown = JSON.stringify(report())): unknown {
		return { mode: "single", results: [{ agent: "ein-scout", finalOutput }] };
	}

	test("valida el reporte entregado en finalOutput como texto (el bug real de hoy)", () => {
		const tracking = tracked();
		expect(acceptTrackedScoutResult(tracking, "scout-call", result(), false, fixture())).toEqual(report());
		expect(tracking.has("scout-call")).toBe(false);
	});

	test("error accionable si no hay reporte in-turn (async devuelve results vacío)", () => {
		const cases: unknown[] = [
			undefined,
			{ mode: "single", results: [] },                                        // launch async: reporte llega luego
			{ mode: "single", results: [{ agent: "ein-scout" }] },                  // sin finalOutput
			{ mode: "single", results: [{ agent: "ein-scout", finalOutput: "" }] }, // vacío
			{ mode: "single", results: [{ agent: "ein-scout", finalOutput: report() }, { agent: "ein-scout", finalOutput: report() }] }, // parallel: 2 resultados
		];
		for (const details of cases) {
			const tracking = tracked();
			expect(() => acceptTrackedScoutResult(tracking, "scout-call", details, false, fixture())).toThrow("ein-scout contract");
			expect(tracking.has("scout-call")).toBe(false);
		}
	});

	test("sigue fail-closed sobre citas/schema inválidos, malformed, y sin replay en error del runner", () => {
		const invalid = tracked();
		expect(() => acceptTrackedScoutResult(invalid, "scout-call", result(JSON.stringify(report({ summary: "" }))), false, fixture())).toThrow("invalid report schema");

		const malformed = tracked();
		expect(() => acceptTrackedScoutResult(malformed, "scout-call", result("not json at all"), false, fixture())).toThrow("malformed");

		const errorTracking = tracked();
		expect(acceptTrackedScoutResult(errorTracking, "scout-call", undefined, true, fixture())).toBeUndefined();
		expect(errorTracking.has("scout-call")).toBe(false);
	});
});
