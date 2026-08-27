import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { collectCleanerAuditEvidence } from "../ein-pi/agent/lib/cleaner-audit-evidence.ts";
import {
	CLEANER_BOUNDED_MUTATION_VERSION,
	CLEANER_VERIFICATION_RECORD_VERSION,
	type CleanerCompletionAdaptersV1,
	type CleanerStateTransitionRecordV1,
} from "../ein-pi/agent/lib/cleaner-bounded-mutations.ts";
import { admitCleanerImprove, applyCleanerImprove, cleanerAuditBinding, completeCleanerImprove, type CleanerImprovePlan } from "../ein-pi/agent/lib/cleaner-improve.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const hash = (value: string): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function fixture(source = "export const value = 'old';\n", targetPath = "entry.ts"): CleanerImprovePlan {
	const root = mkdtempSync(join(tmpdir(), "ein-cleaner-improve-"));
	roots.push(root);
	Bun.spawnSync(["git", "init", "-q"], { cwd: root });
	mkdirSync(join(root, targetPath, ".."), { recursive: true });
	writeFileSync(join(root, targetPath), source);
	const auditEvidence = collectCleanerAuditEvidence(root, { kind: "selectors", selectors: [{ kind: "file", path: targetPath }] });
	const binding = cleanerAuditBinding(auditEvidence);
	const before = "'old'", after = "'new'";
	const resulting = source.replace(before, after);
	const finding = {
		id: `cleaner-finding-v1:sha256:${"a".repeat(64)}`,
		rule: "reviewed-area-assessment" as const, classification: "observed-fact" as const, severity: "info" as const, confidence: "high" as const,
		areaId: auditEvidence.scope.areaId, selectors: auditEvidence.scope.selectors,
		state: { status: "current" as const, stateRef: auditEvidence.sourceIdentity.stateRef, quality: "current" as const, reason: "read-success" as const },
		g: { outcome: "reviewed" as const, freshness: "current" as const, reason: "exact-git-binding" as const },
		evidence: { status: "verified" as const, ...binding }, uncertainty: "none", applied: false as const,
	};
	return {
		auditEvidence, finding,
		request: {
			version: CLEANER_BOUNDED_MUTATION_VERSION, findingId: finding.id,
			declaration: {
				version: "cleaner-declaration-v1", changeId: "bounded-cleanup", phase: "apply", areaId: auditEvidence.scope.areaId,
				targetPath, affectedSeam: "entry-cleanup", operation: { kind: "exact-replacement", before, after },
				actorRef: `actor-v1:sha256:${"b".repeat(64)}`, reviewerRef: `reviewer-v1:sha256:${"c".repeat(64)}`, behaviorPreserved: true,
				expected: { stateRef: auditEvidence.sourceIdentity.stateRef, beforeDigest: hash(source), afterDigest: hash(resulting) },
				verification: { commands: ["bun test tests/entry.test.ts"] },
			},
		},
	};
}

describe("Cleaner Improve runtime boundary", () => {
	test("admits and applies one audit-bound exact replacement, then requires verification", () => {
		const plan = fixture();
		expect(admitCleanerImprove(plan)).toMatchObject({ status: "admitted", targetPath: "entry.ts" });
		const outcome = applyCleanerImprove(plan) as { status: string; transition: { resultingStateRef: string }; recovery: { beforeSource: string } };
		expect(outcome).toMatchObject({ status: "verification-required", recovery: { beforeSource: "export const value = 'old';\n" } });
		expect(readFileSync(join(plan.auditEvidence.repository.root, "entry.ts"), "utf8")).toBe("export const value = 'new';\n");
		expect(outcome.transition.resultingStateRef).not.toBe(plan.auditEvidence.sourceIdentity.stateRef);
	});

	test("rejects stale audit evidence, out-of-scope and restricted targets, and ambiguous replacement", () => {
		const stale = fixture();
		writeFileSync(join(stale.auditEvidence.repository.root, "entry.ts"), "export const value = 'changed';\n");
		expect(admitCleanerImprove(stale)).toMatchObject({ status: "blocked", reason: "evidence-stale" });
		const scoped = fixture();
		expect(admitCleanerImprove({ ...scoped, request: { ...scoped.request, declaration: { ...scoped.request.declaration, targetPath: "other.ts" } } })).toMatchObject({ status: "blocked", reason: "target-out-of-area" });
		expect(admitCleanerImprove({ ...scoped, request: { ...scoped.request, declaration: { ...scoped.request.declaration, targetPath: "runtime/entry.ts" } } })).toMatchObject({ status: "blocked", reason: "ownership-invalid" });
		const ambiguous = fixture("'old' + 'old'\n");
		expect(admitCleanerImprove(ambiguous)).toMatchObject({ status: "blocked", reason: "replacement-ambiguous" });
	});

	test("reports uncertain writes and gates completion on fresh bound focused and router verification", () => {
		const plan = fixture();
		const bytes = new TextEncoder().encode("export const value = 'old';\n");
		const uncertain = applyCleanerImprove(plan, {
			projectState: { project: () => ({ stateRef: plan.auditEvidence.sourceIdentity.stateRef, complete: true, conflicted: false }) },
			finding: { resolve: () => plan.finding }, target: { read: () => ({ bytes, digest: hash(new TextDecoder().decode(bytes)) }) },
			writer: { write: () => { throw new Error("disk failure"); } },
		});
		expect(uncertain).toMatchObject({ status: "mutation-uncertain", reason: "writer-failed", invalidation: { audit: "invalid", verification: "invalid" } });
		const applied = applyCleanerImprove(plan) as { transition: CleanerStateTransitionRecordV1 };
		const stateRef = applied.transition.resultingStateRef!;
		const verification = { version: CLEANER_VERIFICATION_RECORD_VERSION, outcome: "passed" as const, actorRef: "verifier", commands: ["bun test tests/entry.test.ts"] as [string], stateRef };
		const adapters = (outcome: "pass" | "fail", stale = false): CleanerCompletionAdaptersV1 => ({ projectState: { project: () => ({ stateRef, complete: true, conflicted: false }) }, router: { verification: () => ({ outcome, stale }) } });
		expect(completeCleanerImprove(plan.auditEvidence.repository.root, applied.transition, verification, adapters("pass"))).toMatchObject({ status: "complete" });
		expect(completeCleanerImprove(plan.auditEvidence.repository.root, applied.transition, null, adapters("pass"))).toMatchObject({ reason: "verification-required" });
		expect(completeCleanerImprove(plan.auditEvidence.repository.root, applied.transition, { ...verification, stateRef: plan.auditEvidence.sourceIdentity.stateRef }, adapters("pass"))).toMatchObject({ reason: "verification-state-mismatch" });
		expect(completeCleanerImprove(plan.auditEvidence.repository.root, applied.transition, verification, adapters("fail"))).toMatchObject({ status: "verification-failed" });
		expect(completeCleanerImprove(plan.auditEvidence.repository.root, applied.transition, verification, adapters("pass", true))).toMatchObject({ reason: "verification-stale" });
	});

	test("preserves newer bytes when content changes after admission but before descriptor mutation", () => {
		const plan = fixture();
		const path = join(plan.auditEvidence.repository.root, "entry.ts");
		const newer = "export const value = 'newer concurrent content';\n";
		const outcome = applyCleanerImprove(plan, undefined, { beforeDescriptorOpen: () => writeFileSync(path, newer) });
		expect(outcome).toMatchObject({ status: "mutation-uncertain", reason: "writer-failed" });
		expect(readFileSync(path, "utf8")).toBe(newer);
	});

	test("never writes through an ancestor replaced by a symlink", () => {
		const plan = fixture("export const value = 'old';\n", "src/entry.ts");
		const root = plan.auditEvidence.repository.root;
		const outside = mkdtempSync(join(tmpdir(), "ein-cleaner-improve-outside-"));
		roots.push(outside);
		const outsideTarget = join(outside, "entry.ts");
		writeFileSync(outsideTarget, "export const value = 'old';\n");
		const outcome = applyCleanerImprove(plan, undefined, { beforeDescriptorOpen: () => {
			rmSync(join(root, "src"), { recursive: true });
			symlinkSync(outside, join(root, "src"));
		} });
		expect(outcome).toMatchObject({ status: "mutation-uncertain", reason: "writer-failed" });
		expect(readFileSync(outsideTarget, "utf8")).toBe("export const value = 'old';\n");
	});
});
