import { describe, expect, test } from "bun:test";
import { parseSddCloseArgs } from "../ein-pi/agent/lib/sdd-close-args.ts";

describe("SDD close slash argument parser", () => {
	test("translates profile, evidence, and reason without inference", () => {
		expect(parseSddCloseArgs('sample-change --reconciliation-profile scope-only-out-of-flow --reconciliation-evidence openspec/changes/sample-change/out-of-flow-reconciliation.json --reason "outside delivery"')).toEqual({
			change: "sample-change",
			force: false,
			reason: "outside delivery",
			reconciliationProfile: "scope-only-out-of-flow",
			reconciliationEvidencePath: "openspec/changes/sample-change/out-of-flow-reconciliation.json",
		});
	});

	test("preserves force/reason and leaves omitted reconciliation options absent", () => {
		expect(parseSddCloseArgs(["legacy-change", "--force", "--reason", "legacy delivery"])).toEqual({
			change: "legacy-change",
			force: true,
			reason: "legacy delivery",
			reconciliationProfile: undefined,
			reconciliationEvidencePath: undefined,
		});
	});

	test("does not turn missing option values into a change or inferred reconciliation", () => {
		expect(parseSddCloseArgs("sample-change --reconciliation-profile --reconciliation-evidence --reason")).toEqual({
			change: "sample-change",
			force: false,
			reason: undefined,
			reconciliationProfile: undefined,
			reconciliationEvidencePath: undefined,
		});
	});

	test("retains unsupported and mixed-mode values for shared close validation", () => {
		expect(parseSddCloseArgs("sample-change --force --reconciliation-profile unsupported --reconciliation-evidence elsewhere.json --reason audit")).toEqual({
			change: "sample-change",
			force: true,
			reason: "audit",
			reconciliationProfile: "unsupported",
			reconciliationEvidencePath: "elsewhere.json",
		});
	});
});
