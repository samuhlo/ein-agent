import { describe, expect, test } from "bun:test";
import {
	validateOutOfFlowReconciliation,
	type OutOfFlowReconciliationInput,
} from "../ein-pi/agent/lib/sdd-reconciliation.ts";
import {
	OUT_OF_FLOW_FORMAT as SHARED_FORMAT,
	OUT_OF_FLOW_PROFILE as SHARED_PROFILE,
	validateOutOfFlowReconciliation as validateSharedReconciliation,
} from "../shared/sdd/sdd-reconciliation.ts";

const repositoryState = {
	head: "0123456789abcdef0123456789abcdef01234567",
	tree: "abcdef0123456789abcdef0123456789abcdef01",
	capturedAt: "2026-08-09T10:00:00.000Z",
};

// Hoisted: `OutOfFlowReconciliationInput.evidence` is `unknown` by design (it is
// the untrusted payload the function validates), so tests cannot read the summary
// back through it.
const SUMMARY_TEXT = [
		"Delivery occurred outside SDD.",
		"Excluded lifecycle artifacts: map.md, design.md, tasks.md, apply-progress.md, verify-report.md.",
		"## Repository verification",
		"- check: unit-tests",
		"## Successor changes",
		"None.",
	].join("\n");

function validInput(): OutOfFlowReconciliationInput {
	return {
		profile: "scope-only-out-of-flow",
		change: "equally-eligible-change",
		auditReason: "Delivery predated the SDD lifecycle rollout.",
		now: "2026-08-09T12:00:00.000Z",
		record: {
			readable: true,
			artifacts: ["scope.md", "summary.md", "out-of-flow-reconciliation.json"],
			localDelta: false,
			specState: "declarationless",
			declaration: { kind: "absent" },
		},
		summary: {
			path: "summary.md",
			sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			bytes: new TextEncoder().encode(SUMMARY_TEXT).byteLength,
			text: SUMMARY_TEXT,
			fresh: true,
		},
		currentRepositoryState: repositoryState,
		evidence: {
			format: "ein-out-of-flow-reconciliation/v1",
			profile: "scope-only-out-of-flow",
			change: "equally-eligible-change",
			auditReason: "Delivery predated the SDD lifecycle rollout.",
			createdAt: "2026-08-09T11:00:00.000Z",
			summary: {
				path: "summary.md",
				sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				bytes: new TextEncoder().encode(SUMMARY_TEXT).byteLength,
			},
			repositoryState,
			repositoryChecks: [{
				id: "unit-tests",
				performed: "bun test tests/relevant.test.ts",
				outcome: "pass",
				completedAt: "2026-08-09T11:30:00.000Z",
				evidenceRef: "ci://run/123#unit-tests",
				repositoryState,
			}],
		},
	};
}

describe("scope-only out-of-flow reconciliation", () => {
	test("the neutral owner preserves Pi reconciliation decisions", () => {
		expect(SHARED_FORMAT).toBe("ein-out-of-flow-reconciliation/v1");
		expect(SHARED_PROFILE).toBe("scope-only-out-of-flow");
		expect(validateOutOfFlowReconciliation).toBe(validateSharedReconciliation);
		expect(validateSharedReconciliation(validInput())).toEqual(validateOutOfFlowReconciliation(validInput()));
		const invalid = validInput();
		invalid.currentRepositoryState = null;
		expect(validateSharedReconciliation(invalid)).toEqual(validateOutOfFlowReconciliation(invalid));
	});

	test("accepts valid evidence for any structurally eligible change", () => {
		const result = validateOutOfFlowReconciliation(validInput());
		expect(result).toEqual({
			ok: true,
			blockers: [],
			reconciliation: {
				profile: "scope-only-out-of-flow",
				change: "equally-eligible-change",
				reason: "Delivery predated the SDD lifecycle rollout.",
				evidencePath: "out-of-flow-reconciliation.json",
				summary: {
					path: "summary.md",
					sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					bytes: new TextEncoder().encode(SUMMARY_TEXT).byteLength,
				},
				repositoryState,
				checkIds: ["unit-tests"],
			},
		});
	});

	test("rejects unsupported profiles and mismatched reasons", () => {
		const input = validInput();
		input.profile = "other";
		(input.evidence as Record<string, unknown>).auditReason = "Different reason";
		const result = validateOutOfFlowReconciliation(input);
		expect(result.ok).toBe(false);
		expect(result.blockers.map((blocker) => blocker.code)).toEqual([
			"reconciliation-profile-unsupported",
			"reconciliation-audit-reason-mismatch",
		]);
	});

	test("accepts declarationless and valid spec_delta:none records without consulting the change name", () => {
		for (const change of ["docs-site-shell", "unrelated-safe-name"]) {
			const input = validInput();
			input.change = change;
			(input.evidence as any).change = change;
			input.record.specState = "none";
			input.record.declaration = { kind: "none", count: 1, reason: "No canonical specification changes were required." };
			expect(validateOutOfFlowReconciliation(input).ok).toBe(true);
		}
	});

	test("denies every ineligible record-shape and spec-state family", () => {
		const mutations: Array<(input: OutOfFlowReconciliationInput) => void> = [
			(input) => { input.record.readable = false; },
			(input) => { input.record.artifacts.push("design.md"); },
			(input) => { input.record.artifacts.push("scope.md"); },
			(input) => { input.record.localDelta = true; },
			(input) => { input.record.specState = "pending"; },
			(input) => { input.record.specState = "conflicting"; },
			(input) => { input.record.declaration = { kind: "other", count: 1 }; },
		];
		for (const mutate of mutations) {
			const input = validInput();
			mutate(input);
			expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-record-ineligible");
		}
	});

	test("keeps declaration and reconciliation audit reasons independent and concrete", () => {
		for (const invalid of ["", " unknown ", "x".repeat(201)]) {
			const input = validInput();
			input.record.specState = "none";
			input.record.declaration = { kind: "none", count: 1, reason: invalid };
			expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-declaration-reason-invalid");
		}
		const invalidAudit = validInput();
		invalidAudit.auditReason = "tbd";
		expect(validateOutOfFlowReconciliation(invalidAudit).blockers.map((b) => b.code)).toContain("reconciliation-audit-reason-invalid");
	});

	test("rejects malformed, unknown-version, wrong-change, and future evidence", () => {
		const malformed = validInput();
		malformed.evidence = null;
		expect(validateOutOfFlowReconciliation(malformed).blockers.map((b) => b.code)).toContain("reconciliation-evidence-malformed");

		const unknown = validInput();
		(unknown.evidence as any).format = "ein-out-of-flow-reconciliation/v2";
		expect(validateOutOfFlowReconciliation(unknown).blockers.map((b) => b.code)).toContain("reconciliation-evidence-malformed");

		const wrongChange = validInput();
		(wrongChange.evidence as any).change = "copied-from-elsewhere";
		expect(validateOutOfFlowReconciliation(wrongChange).blockers.map((b) => b.code)).toContain("reconciliation-change-mismatch");

		const future = validInput();
		(future.evidence as any).createdAt = "2026-08-10T00:00:00.000Z";
		expect(validateOutOfFlowReconciliation(future).blockers.map((b) => b.code)).toContain("reconciliation-evidence-stale");
	});

	test("rejects stale, unsafe, incomplete, or identity-mismatched summaries", () => {
		const mutations: Array<(input: OutOfFlowReconciliationInput) => void> = [
			(input) => { input.summary.fresh = false; },
			(input) => { (input.evidence as any).summary.path = "../summary.md"; },
			(input) => { (input.evidence as any).summary.sha256 = "b".repeat(64); },
			(input) => { input.summary.bytes += 1; },
			(input) => { input.summary.text = input.summary.text.replace("Delivery occurred outside SDD.", "Delivery complete."); },
			(input) => { input.summary.text = input.summary.text.replace("verify-report.md", "verification"); },
			(input) => { input.summary.text = input.summary.text.replace("unit-tests", "other-check"); },
			(input) => { input.summary.text = input.summary.text.replace("None.", "Unspecified."); },
		];
		for (const mutate of mutations) {
			const input = validInput();
			mutate(input);
			expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-summary-invalid");
		}
	});

	test("rejects duplicate, non-concrete, non-passing, stale, and mixed-state checks", () => {
		const duplicate = validInput();
		(duplicate.evidence as any).repositoryChecks.push({ ...(duplicate.evidence as any).repositoryChecks[0] });
		expect(validateOutOfFlowReconciliation(duplicate).blockers.map((b) => b.code)).toContain("reconciliation-checks-non-concrete");

		for (const mutate of [
			(input: OutOfFlowReconciliationInput) => { (input.evidence as any).repositoryChecks[0].performed = ""; },
			(input: OutOfFlowReconciliationInput) => { (input.evidence as any).repositoryChecks[0].evidenceRef = "n/a"; },
		]) {
			const input = validInput();
			mutate(input);
			expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-checks-non-concrete");
		}

		const failed = validInput();
		(failed.evidence as any).repositoryChecks[0].outcome = "fail";
		expect(validateOutOfFlowReconciliation(failed).blockers.map((b) => b.code)).toContain("reconciliation-checks-non-passing");

		const stale = validInput();
		(stale.evidence as any).repositoryChecks[0].completedAt = "2026-08-09T09:00:00.000Z";
		expect(validateOutOfFlowReconciliation(stale).blockers.map((b) => b.code)).toContain("reconciliation-repository-state-mismatch");

		const mixed = validInput();
		(mixed.evidence as any).repositoryChecks[0].repositoryState = { ...repositoryState, tree: "b".repeat(40) };
		expect(validateOutOfFlowReconciliation(mixed).blockers.map((b) => b.code)).toContain("reconciliation-repository-state-mismatch");

		const changed = validInput();
		changed.currentRepositoryState = { ...repositoryState, head: "c".repeat(40) };
		expect(validateOutOfFlowReconciliation(changed).blockers.map((b) => b.code)).toContain("reconciliation-repository-state-mismatch");
	});

	test("binds summary byte metadata to the supplied UTF-8 text", () => {
		const input = validInput();
		input.summary.text = input.summary.text.replace("## Repository verification", "Audited: ✓\n## Repository verification");
		expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-summary-invalid");
	});

	test("rejects checks completed in the future", () => {
		const input = validInput();
		(input.evidence as any).repositoryChecks[0].completedAt = "2026-08-10T00:00:00.000Z";
		expect(validateOutOfFlowReconciliation(input).blockers.map((b) => b.code)).toContain("reconciliation-checks-non-concrete");
	});

	test("treats evidence commands as inert data", () => {
		const input = validInput();
		(input.evidence as any).repositoryChecks[0].performed = "rm -rf /; git push --force";
		const result = validateOutOfFlowReconciliation(input);
		expect(result.ok).toBe(true);
	});
});
