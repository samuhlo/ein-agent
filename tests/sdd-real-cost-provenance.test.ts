// =============================================================================
// TESTS: coste real por cambio (P5) y procedencia de artefactos (P4)
//   - readSddRealCost lee los meta.json de pi-subagents (.pi-subagents/
//     artifacts/) y suma el consumo REAL de inferencia por cambio, atribuido
//     por mención del nombre del cambio en el task del run.
//   - lintChange emite WARNING cuando un artefacto declara
//     `authored_by: parent-fallback` (lo persistió el parent, no el executor).
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	beginDelegationObservation,
	changedCandidates,
	createReceipt,
	getOrCreateFlow,
	mintRunIdentity,
	normalizeMetrics,
	observeDelegationResult,
	persistReceipt,
	readSddCostLedger,
	readStableSource,
	snapshotMetadataCandidates,
} from "../ein-pi/agent/lib/sdd-cost-provenance";
import { lintChange, lintPhaseArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

let DIR: string;

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-real-cost-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

function phase(change: string, name = "map"): string {
	const directory = join(DIR, "openspec", "changes", change);
	mkdirSync(directory, { recursive: true });
	const path = join(directory, `${name}.md`);
	writeFileSync(path, `${name}: canonical\n`);
	return path;
}

function receipt(change = "foo") {
	const phasePath = phase(change);
	const flow = getOrCreateFlow(DIR, change, join(DIR, "openspec", "changes", change), new Date("2026-01-01T00:00:00.000Z"));
	const producerPath = join(DIR, "producer_meta.json");
	writeFileSync(producerPath, JSON.stringify({ usage: { input: 0, output: 2, cost: 0.25 }, durationMs: 4 }));
	const producer = readStableSource(DIR, producerPath)!;
	const phaseArtifact = readStableSource(DIR, phasePath)!;
	return createReceipt({
		identity: mintRunIdentity(DIR, flow, "map"),
		timestamps: { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z", observedAt: "2026-01-01T00:00:02.000Z" },
		producerArtifact: { ...producer, agent: "sdd-map" },
		phaseArtifact,
		metrics: normalizeMetrics(JSON.parse(readFileSync(producerPath, "utf8")), producer.sha256),
		problems: [],
	});
}

describe("local SDD cost provenance", () => {
	test("candidate snapshots bind changed bytes, never exact-name collisions or later prose", () => {
		phase("foo");
		phase("foo-bar");
		const artifacts = join(DIR, ".pi-subagents", "artifacts");
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(artifacts, "one_meta.json"), JSON.stringify({ task: "foo" }));
		const before = snapshotMetadataCandidates(DIR);
		writeFileSync(join(artifacts, "one_meta.json"), JSON.stringify({ task: "foo-bar mentions foo later" }));
		const candidates = changedCandidates(before, snapshotMetadataCandidates(DIR));
		expect(candidates).toHaveLength(1);
		expect(candidates[0]?.relativePath).toContain("one_meta.json");
		expect(getOrCreateFlow(DIR, "foo", join(DIR, "openspec", "changes", "foo"))).not.toEqual(
			getOrCreateFlow(DIR, "foo-bar", join(DIR, "openspec", "changes", "foo-bar")),
		);
	});

	test("persists immutable receipt bytes with flow/run/attempt and timestamps", () => {
		const first = receipt();
		persistReceipt(DIR, first);
		expect(mintRunIdentity(DIR, getOrCreateFlow(DIR, "foo", join(DIR, "openspec", "changes", "foo")), "map")).toMatchObject({ attempt: 2, retryOrdinal: 1 });
		expect(() => persistReceipt(DIR, { ...first, problems: ["mutated"] })).toThrow("immutable receipt collision");
	});

	test("normalizes each metric independently and preserves explicit zero", () => {
		const metrics = normalizeMetrics({ usage: { input: 0, output: -1, cost: 0.25 }, durationMs: Number.NaN }, "digest");
		expect(metrics.inputTokens).toEqual({ value: 0, provenance: "reported", source: { artifactSha256: "digest", jsonPointer: "/usage/input" } });
		expect(metrics.outputTokens.provenance).toBe("unavailable");
		expect(metrics.cacheReadTokens.provenance).toBe("unavailable");
		expect(metrics.cacheWriteTokens.provenance).toBe("unavailable");
		expect(metrics.providerCostUsd.provenance).toBe("unavailable");
		expect(metrics.estimatedCostUsd.provenance).toBe("unavailable");
		expect(metrics.durationMs.provenance).toBe("unavailable");
	});

	test("unqualified usage.cost is neither provider billing nor an estimate", () => {
		const metrics = normalizeMetrics({ usage: { cost: 0.25 } }, "digest");
		expect(metrics.providerCostUsd.value).toBeNull();
		expect(metrics.estimatedCostUsd.value).toBeNull();
	});

	test("fails closed with bounded evidence when either direct-delegation candidate is ambiguous", () => {
		phase("foo", "map");
		const observation = beginDelegationObservation(DIR, "map");
		writeFileSync(join(DIR, "openspec", "changes", "foo", "map.md"), "map: rewritten\n");
		phase("bar", "map");
		const artifacts = join(DIR, ".pi-subagents", "artifacts");
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(artifacts, "one_meta.json"), "{}");
		writeFileSync(join(artifacts, "two_meta.json"), "{}");
		const result = observeDelegationResult(DIR, observation);
		expect(result.receipt).toBeNull();
		expect(result.problem).toBe("change-ambiguous");
		expect(JSON.parse(readFileSync(join(DIR, ".pi/ein/sdd-cost-ledger/v1/problems.json"), "utf8"))).toEqual(["change-ambiguous"]);
	});

	test("reads validated sidecars once with exact sorted aggregate membership and unavailable incomplete totals", () => {
		const first = receipt();
		persistReceipt(DIR, first);
		const second = createReceipt({
			...receipt(),
			identity: { ...mintRunIdentity(DIR, getOrCreateFlow(DIR, "foo", join(DIR, "openspec", "changes", "foo")), "map"), runId: "aaa" },
			metrics: { ...first.metrics, cacheReadTokens: { value: 3, provenance: "reported", source: { artifactSha256: "digest", jsonPointer: "/cache" } } },
		});
		persistReceipt(DIR, second);
		const runs = join(DIR, ".pi", "ein", "sdd-cost-ledger", "v1", "runs", first.identity.flowId);
		writeFileSync(join(runs, "duplicate.json"), JSON.stringify(first));
		const artifacts = join(DIR, ".pi-subagents", "artifacts");
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(artifacts, "legacy_meta.json"), JSON.stringify({ task: "foo mentions foo-bar", usage: { cost: 9 } }));

		const ledger = readSddCostLedger(DIR, "foo");
		expect(ledger.runs).toBe(2);
		expect(ledger.memberRunIds).toEqual(["aaa", first.identity.runId].sort());
		expect(ledger.changeAggregate?.memberRunIds).toEqual(ledger.memberRunIds);
		expect(ledger.byPhase[0]?.memberRunIds).toEqual(ledger.memberRunIds);
		expect(ledger.byAttempt.map((entry) => entry.memberRunIds)).toEqual([[first.identity.runId], ["aaa"]]);
		expect(ledger.changeAggregate?.metrics.cacheReadTokens).toMatchObject({ value: null, provenance: "unavailable" });
		expect(ledger.changeAggregate?.metrics.providerCostUsd).toMatchObject({ value: null, provenance: "unavailable" });
		expect(ledger.costUsd).toBeNull();
		expect(ledger.problems.some((problem) => problem.code === "legacy-metadata-excluded")).toBe(true);
	});

	test("binds one exact changed pair immutably and assigns retries distinct attempts", () => {
		const artifacts = join(DIR, ".pi-subagents", "artifacts");
		mkdirSync(artifacts, { recursive: true });
		let ordinal = 0;
		const run = () => {
			const observation = beginDelegationObservation(DIR, "map");
			ordinal += 1;
			const path = phase("foo", "map");
			writeFileSync(path, `map: canonical ${ordinal}\n`);
			writeFileSync(join(artifacts, "one_meta.json"), JSON.stringify({ usage: { input: ordinal }, durationMs: ordinal + 1 }));
			return observeDelegationResult(DIR, observation).receipt!;
		};
		const first = run();
		const second = run();
		expect(first.identity).toMatchObject({ changeId: "foo", phase: "map", attempt: 1, retryOrdinal: 0 });
		expect(second.identity).toMatchObject({ changeId: "foo", phase: "map", attempt: 2, retryOrdinal: 1 });
		expect(first.identity.runId).not.toBe(second.identity.runId);
		expect(first.phaseArtifact.sha256).not.toBe(second.phaseArtifact.sha256);
	});
});

describe("provenance parent-fallback (P4)", () => {
	function changeDir(name: string): string {
		const p = join(DIR, "openspec", "changes", name);
		mkdirSync(p, { recursive: true });
		return p;
	}

	test("artefacto con authored_by: parent-fallback → WARNING de procedencia", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\nbudget_allocated:\n  max_tokens: 15000\n");
		writeFileSync(join(c, "map.md"), "authored_by: parent-fallback\nstatus: completed\nfindings\n");
		const report = lintChange(DIR, "feat-x");
		const issue = report.issues.find((i) => i.code === "provenance-parent-fallback-map");
		expect(issue).toBeDefined();
		expect(issue?.level).toBe("warning");
		expect(report.warnings).toBeGreaterThanOrEqual(1);
	});

	test("artefacto normal → sin warning de procedencia", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\n");
		writeFileSync(join(c, "map.md"), "status: completed\nfindings\n");
		const report = lintChange(DIR, "feat-x");
		expect(report.issues.some((i) => i.code.startsWith("provenance-"))).toBe(false);
	});

	test("la procedencia es warning, no error: no rompe el gate", () => {
		const c = changeDir("feat-x");
		writeFileSync(join(c, "scope.md"), "scope: x\n");
		writeFileSync(join(c, "map.md"), "authored_by: parent-fallback\nok\n");
		const report = lintChange(DIR, "feat-x");
		const provenanceErrors = report.issues.filter((i) => i.code.startsWith("provenance-") && i.level === "error");
		expect(provenanceErrors).toEqual([]);
	});
});

// Antifabricación: el parent que se queda sin subagentes NO debe rellenar la
// telemetría con `unknown` / excusas para pasar el gate. Reproduce el incidente
// real: `budget_consumed: tokens: unknown` y `ledger: parent-direct; subagent
// limit reached` pasaban porque el token existía; ahora son error duro.
describe("antifabricación de coste/ledger (P4)", () => {
	test("`tokens: unknown` en budget_consumed → error fabricated-cost", () => {
		const report = lintPhaseArtifact(
			"map",
			"scope_status: bounded\nledger: real\nbudget_consumed: reads: 2, tokens: unknown\n",
		);
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "fabricated-cost")).toBe(true);
	});

	test("ledger con excusa (`parent-direct`, `subagent limit reached`) → error fabricated-ledger", () => {
		const report = lintPhaseArtifact(
			"map",
			"scope_status: bounded\nledger: parent-direct; subagent limit reached, map authored inline\nbudget_consumed: 1\n",
		);
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "fabricated-ledger")).toBe(true);
	});

	test("parent-fallback + telemetría OMITIDA → warnings, no error (salida honesta)", () => {
		const report = lintPhaseArtifact("map", "scope_status: bounded\nfindings\n", {
			authoredByFallback: true,
		});
		expect(report.ok).toBe(true);
		// ledger + budget_consumed ausentes, pero degradados a warning por fallback.
		expect(report.issues.some((i) => i.code === "missing-ledger" && i.level === "warning")).toBe(true);
		expect(report.issues.some((i) => i.code === "missing-budget-consumed" && i.level === "warning")).toBe(true);
		expect(report.issues.every((i) => i.level !== "error")).toBe(true);
	});

	test("sin fallback, telemetría ausente sigue siendo error (no se relaja gratis)", () => {
		const report = lintPhaseArtifact("map", "scope_status: bounded\nfindings\n");
		expect(report.ok).toBe(false);
		expect(report.issues.some((i) => i.code === "missing-ledger" && i.level === "error")).toBe(true);
	});

	test("fabricación NO se salva por declarar parent-fallback: inventar cifras es error incluso en fallback", () => {
		const c = join(DIR, "openspec", "changes", "feat-y");
		mkdirSync(c, { recursive: true });
		writeFileSync(join(c, "scope.md"), "scope: x\nbudget_allocated:\n  max_tokens: 15000\n");
		writeFileSync(
			join(c, "map.md"),
			"authored_by: parent-fallback\nscope_status: bounded\nledger: real\nbudget_consumed: tokens: unknown\n",
		);
		const report = lintChange(DIR, "feat-y");
		expect(report.ok).toBe(false);
		// La incidencia de fabricación vive en el report de la fase (map), no en
		// el `issues` top-level (que solo agrega secuencia + procedencia); aun así
		// suma a `errors` y tumba `ok`, y `formatChangeLint` la renderiza por fase.
		const mapReport = report.phases.find((p) => p.phase === "map")?.report;
		expect(mapReport?.issues.some((i) => i.code === "fabricated-cost")).toBe(true);
	});
});
