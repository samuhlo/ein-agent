import { describe, expect, test } from "bun:test";
import {
	collectDriftPageInputs,
	formatDriftReport,
	driftExitCode,
	type DriftReport,
} from "../ein-pi/agent/lib/docs-site-drift-detector.ts";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

describe("collectDriftPageInputs", () => {
	test("recoge las 21 páginas reales con path, verifiedRev y sources", () => {
		const inputs = collectDriftPageInputs(REPO_ROOT);
		expect(inputs.length).toBe(21);
		for (const input of inputs) {
			expect(input.path.endsWith(".md")).toBe(true);
			expect(typeof input.verifiedRev).toBe("string");
			expect(Array.isArray(input.sources)).toBe(true);
		}
	});
});

describe("formatDriftReport", () => {
	test("marca rev-not-found de forma visible, distinta de clean", () => {
		const report: DriftReport = {
			pages: [
				{
					path: "x.md",
					status: "unknown",
					verifiedRev: "deadbee",
					reason: "rev-not-found",
					detail: "Rev deadbee no encontrado en el árbol.",
					sourcesChanged: [],
				},
			],
			counts: { clean: 0, drifted: 0, unknown: 1 },
		};
		const output = formatDriftReport(report);
		expect(output).toContain("rev-not-found");
		expect(output).toContain("x.md");
		expect(output.toLowerCase()).not.toContain("clean: 1");
	});

	test("lista páginas drifted con sus fuentes cambiadas", () => {
		const report: DriftReport = {
			pages: [
				{
					path: "y.md",
					status: "drifted",
					verifiedRev: "0ae709d",
					sourcesChanged: [{ path: "README.md", status: "modified", linesAdded: 5, linesRemoved: 2 }],
				},
			],
			counts: { clean: 0, drifted: 1, unknown: 0 },
		};
		const output = formatDriftReport(report);
		expect(output).toContain("y.md");
		expect(output).toContain("README.md");
	});
});

describe("driftExitCode", () => {
	test("0 cuando todo clean", () => {
		const report: DriftReport = { pages: [], counts: { clean: 3, drifted: 0, unknown: 0 } };
		expect(driftExitCode(report)).toBe(0);
	});

	test("2 cuando hay drift o rev-not-found (informativo, no error de ejecución)", () => {
		const drifted: DriftReport = { pages: [], counts: { clean: 1, drifted: 1, unknown: 0 } };
		expect(driftExitCode(drifted)).toBe(2);
	});

	test("1 cuando hay error de ejecución real (not-a-repo/git-error)", () => {
		const report: DriftReport = {
			pages: [
				{ path: "a.md", status: "unknown", verifiedRev: "x", reason: "not-a-repo", sourcesChanged: [] },
			],
			counts: { clean: 0, drifted: 0, unknown: 1 },
		};
		expect(driftExitCode(report)).toBe(1);
	});
});
