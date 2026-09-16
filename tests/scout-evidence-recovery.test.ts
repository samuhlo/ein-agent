import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acceptTrackedScoutResult, normalizeScoutLaunch, scoutEvidenceStatus, validateScoutReport } from "../ein-pi/agent/lib/scout-contract.ts";
import { disjointScoutReport, malformedFindingScoutReport } from "./fixtures/scout-recovery-fixtures.ts";

const roots: string[] = [];
function fixture(lines = 130) {
	const root = mkdtempSync(join(tmpdir(), "ein-scout-recovery-"));
	roots.push(root);
	writeFileSync(join(root, "source.ts"), Array.from({ length: lines }, (_, i) => `line ${i + 1}\n`).join(""));
	return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("reported R6 preserves eleven findings and both exact disjoint spans", () => {
	const report = validateScoutReport([disjointScoutReport()], fixture());
	expect(report.findings).toHaveLength(11);
	expect(report.references).toHaveLength(13);
	const finding = report.findings.find(({ claim }) => claim.endsWith("R6"))!;
	expect(finding.referenceIds).toEqual(["R6", "R13"]);
	expect(report.references.filter(({ id }) => finding.referenceIds.includes(id)).map(({ startLine, endLine }) => [startLine, endLine])).toEqual([[49, 83], [91, 117]]);
	expect(scoutEvidenceStatus(report)).toBe("complete");
});

test("an uninterpretable R6 loses only its claim, replaces the summary and records provenance", () => {
	const source = disjointScoutReport();
	source.references[5]!.lines = "49-83,not-a-range";
	const report = validateScoutReport([source], fixture());
	expect(report.findings).toHaveLength(10);
	expect(report.references).toHaveLength(11);
	expect(report.findings.some(({ referenceIds }) => referenceIds.includes("R6"))).toBe(false);
	expect(report.summary).not.toBe(source.summary);
	expect(report.recovery?.droppedReferences.join(" ")).toContain("R6");
	expect(report.recovery?.droppedFindings).toBe(1);
	expect(scoutEvidenceStatus(report)).toBe("partial");
});

test("a damaged finding cannot leave a summary conclusion alive through another citation", () => {
	const report = validateScoutReport([malformedFindingScoutReport()], fixture());
	expect(report.findings).toHaveLength(10);
	expect(report.summary).not.toBe("Plan and export entrypoints inspected");
	expect(report.references.some(({ id }) => ["R7", "R8"].includes(id))).toBe(false);
	expect(report.recovery?.droppedFindings).toBe(1);
});

test("a claim requiring two spans is dropped if one starts beyond EOF", () => {
	const report = validateScoutReport([disjointScoutReport()], fixture(85));
	expect(report.findings).toHaveLength(10);
	expect(report.references.some(({ id }) => ["R6", "R13"].includes(id))).toBe(false);
	expect(report.recovery?.droppedReferences.join(" ")).toContain("past the last line");
});

test("every citation remains necessary to a claim with several supports", () => {
	const source = disjointScoutReport();
	source.references[7]!.lines = "abc";
	const report = validateScoutReport([source], fixture());
	expect(report.findings.some(({ referenceIds }) => referenceIds.includes("R7") || referenceIds.includes("R8"))).toBe(false);
});

test("local conflicting range keys and missing paths do not erase other evidence", () => {
	for (const patch of [{ lines: "-1" }, { lines: "1,0" }, { lines: "5-2" }, { startLine: 1, endLine: 3 }, { path: "absent.ts" }, { path: "../outside.ts" }]) {
		const source = disjointScoutReport();
		Object.assign(source.references[5]!, patch);
		const report = validateScoutReport([source], fixture());
		expect(report.findings).toHaveLength(10);
		expect(scoutEvidenceStatus(report)).toBe("partial");
	}
});

test("canonical expansion stays bounded and never collides with an existing identifier", () => {
	const source = disjointScoutReport();
	source.references[11]!.id = "R13";
	source.findings.at(-1)!.referenceIds = ["R13"];
	const report = validateScoutReport([source], fixture());
	expect(report.references.find(({ id }) => id === "R13")?.startLine).toBe(1);
	expect(report.findings.find(({ claim }) => claim.endsWith("R6"))?.referenceIds).toEqual(["R6", "R12"]);
	source.references[5]!.lines = Array(24).fill("1").join(",");
	const bounded = validateScoutReport([source], fixture());
	expect(bounded.references.length).toBeLessThanOrEqual(24);
	expect(bounded.recovery?.droppedReferences.join(" ")).toContain("budget");
});

test("global ambiguity and absence of evidence still block acceptance", () => {
	const duplicate = disjointScoutReport(); duplicate.references[5]!.id = "R1";
	expect(() => validateScoutReport([duplicate], fixture())).toThrow("duplicate reference id");
	const unknown = disjointScoutReport(); unknown.findings[0]!.referenceIds = ["R99"];
	expect(() => validateScoutReport([unknown], fixture())).toThrow("unknown reference id");
	const empty = disjointScoutReport(); empty.references.forEach((ref) => { ref.lines = "invalid"; });
	expect(() => validateScoutReport([empty], fixture())).toThrow("no valid evidence");
});

test("partial accepted reports never consume the wholesale-failure retry budget", () => {
	const root = fixture(); const tracking = new Map();
	const source = disjointScoutReport(); source.references[5]!.lines = "bad";
	for (const id of ["first", "second", "third"]) {
		normalizeScoutLaunch({ agent: "ein-scout", task: "inspect" }, id, tracking, root);
		const report = acceptTrackedScoutResult(tracking, id, { results: [{ finalOutput: JSON.stringify(source) }] }, false, root)!;
		expect(scoutEvidenceStatus(report)).toBe("partial");
		expect(tracking.has(id)).toBe(false);
	}
});
