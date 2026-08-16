import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, ftruncateSync, lstatSync, openSync, readFileSync, readSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { CleanerAuditEvidence } from "./cleaner-audit-evidence.ts";
import { collectCleanerAuditEvidence } from "./cleaner-audit-evidence.ts";
import {
	admitCleanerBoundedMutation,
	applyCleanerBoundedMutation,
	assessCleanerCompletion,
	type CleanerBoundedMutationRequestV1,
	type CleanerCompletionAdaptersV1,
	type CleanerMutationAdaptersV1,
	type CleanerStateTransitionRecordV1,
	type CleanerVerificationRecordV1,
} from "./cleaner-bounded-mutations.ts";
import type { CleanerFindingV1 } from "./cleaner-read-only-audit.ts";
import { projectProjectState } from "./project-state.ts";

export type CleanerImprovePlan = Readonly<{
	auditEvidence: CleanerAuditEvidence;
	finding: CleanerFindingV1;
	request: CleanerBoundedMutationRequestV1;
}>;

const digest = (bytes: Uint8Array): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const blocked = (reason: "evidence-invalid" | "evidence-stale" | "evidence-unbound") => Object.freeze({ status: "blocked" as const, reason });

export function cleanerAuditBinding(evidence: CleanerAuditEvidence): Readonly<{ reference: string; digest: string }> {
	const hash = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
	return Object.freeze({ reference: `review-evidence-v1:${hash}`, digest: `sha256:${hash}` });
}

function freshEvidence(plan: CleanerImprovePlan): CleanerAuditEvidence | null {
	try {
		if (plan.auditEvidence.version !== "cleaner-audit-evidence/v1" || plan.auditEvidence.scope.areaId !== plan.request.declaration.areaId) return null;
		return collectCleanerAuditEvidence(plan.auditEvidence.repository.root, {
			kind: "selectors",
			selectors: plan.auditEvidence.scope.selectors,
		});
	} catch { return null; }
}

function projectSnapshot(cwd: string): ReturnType<CleanerMutationAdaptersV1["projectState"]["project"]> {
	const state = projectProjectState({ cwd });
	if (!state.git.stateRef) throw new Error("Project state unavailable");
	return {
		stateRef: state.git.stateRef,
		complete: state.git.complete,
		conflicted: state.git.changes.some((change) => change.indexStatus === "U" || change.worktreeStatus === "U"),
	};
}

type CleanerImproveTestHooks = Readonly<{ beforeDescriptorOpen?: () => void }>;

function mutationAdapters(cwd: string, finding: CleanerFindingV1, targetPath: string, expectedBytes: Uint8Array, expectedDigest: string, testHooks?: CleanerImproveTestHooks): CleanerMutationAdaptersV1 {
	const state = projectProjectState({ cwd });
	if (!state.git.root) throw new Error("Repository root unavailable");
	const root = state.git.root;
	const read = (targetPath: string) => {
		const path = join(root, targetPath);
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) return { bytes: new Uint8Array(), digest: digest(new Uint8Array()), kind: "symlink" as const };
		if (!stat.isFile()) return { bytes: new Uint8Array(), digest: digest(new Uint8Array()), kind: "directory" as const };
		const bytes = readFileSync(path);
		return { bytes, digest: digest(bytes), kind: "regular" as const };
	};
	return {
		projectState: { project: () => projectSnapshot(root) },
		finding: { resolve: (findingId) => findingId === finding.id ? finding : null },
		target: { read },
		writer: { write: (writePath, bytes) => {
			testHooks?.beforeDescriptorOpen?.();
			const fd = openSync(join(root, writePath), constants.O_RDWR | constants.O_NOFOLLOW);
			try {
				const stat = fstatSync(fd);
				if (!stat.isFile() || writePath !== targetPath || stat.size !== expectedBytes.byteLength) throw new Error("Target precondition changed");
				const current = new Uint8Array(stat.size);
				let offset = 0;
				while (offset < current.byteLength) offset += readSync(fd, current, offset, current.byteLength - offset, offset);
				if (digest(current) !== expectedDigest || !current.every((value, index) => value === expectedBytes[index])) throw new Error("Target precondition changed");
				ftruncateSync(fd, 0);
				let written = 0;
				while (written < bytes.byteLength) written += writeSync(fd, bytes, written, bytes.byteLength - written, written);
			} finally { closeSync(fd); }
		} },
	};
}

function validated(plan: CleanerImprovePlan): { adapters: CleanerMutationAdaptersV1 } | { outcome: ReturnType<typeof blocked> } {
	if (!plan || typeof plan !== "object" || !plan.auditEvidence || !plan.finding || !plan.request) return { outcome: blocked("evidence-invalid") };
	if (/(?:^|[-_./])architect(?:$|[-_./])/i.test(plan.request.declaration.targetPath)) return { outcome: blocked("evidence-invalid") };
	const current = freshEvidence(plan);
	if (!current) return { outcome: blocked("evidence-invalid") };
	if (JSON.stringify(current) !== JSON.stringify(plan.auditEvidence)) return { outcome: blocked("evidence-stale") };
	const binding = cleanerAuditBinding(current);
	if (plan.finding.areaId !== current.scope.areaId || plan.finding.state.status !== "current" || plan.finding.state.stateRef !== current.sourceIdentity.stateRef ||
		JSON.stringify(plan.finding.selectors) !== JSON.stringify(current.scope.selectors) || !("reference" in plan.finding.evidence) ||
		plan.finding.evidence.reference !== binding.reference || plan.finding.evidence.digest !== binding.digest) return { outcome: blocked("evidence-unbound") };
	const target = current.files.find((file) => file.path === plan.request.declaration.targetPath);
	try { return { adapters: mutationAdapters(current.repository.root, plan.finding, plan.request.declaration.targetPath, new TextEncoder().encode(target?.source ?? ""), plan.request.declaration.expected.beforeDigest) }; } catch { return { outcome: blocked("evidence-invalid") }; }
}

export function admitCleanerImprove(plan: CleanerImprovePlan): unknown {
	const checked = validated(plan);
	if ("outcome" in checked) return checked.outcome;
	const outcome = admitCleanerBoundedMutation(plan.request, checked.adapters);
	if (outcome.status !== "admitted") return outcome;
	return Object.freeze({ status: outcome.status, findingId: outcome.findingId, areaId: outcome.areaId, targetPath: outcome.targetPath, stateRef: outcome.stateRef, beforeDigest: outcome.beforeDigest, afterDigest: outcome.afterDigest });
}

export function applyCleanerImprove(plan: CleanerImprovePlan, adapterOverride?: CleanerMutationAdaptersV1, testHooks?: CleanerImproveTestHooks): unknown {
	const checked = validated(plan);
	if ("outcome" in checked) return checked.outcome;
	const target = plan.auditEvidence.files.find((file) => file.path === plan.request.declaration.targetPath);
	const adapters = adapterOverride ?? (target ? mutationAdapters(plan.auditEvidence.repository.root, plan.finding, target.path, new TextEncoder().encode(target.source), plan.request.declaration.expected.beforeDigest, testHooks) : checked.adapters);
	const before = adapters.target.read(plan.request.declaration.targetPath);
	const outcome = applyCleanerBoundedMutation(plan.request, adapters);
	return Object.freeze({ ...outcome, recovery: Object.freeze({ targetPath: plan.request.declaration.targetPath, beforeDigest: before.digest, beforeSource: new TextDecoder().decode(before.bytes) }) });
}

export function completeCleanerImprove(cwd: string, transition: CleanerStateTransitionRecordV1, verification: CleanerVerificationRecordV1 | null, adapters?: CleanerCompletionAdaptersV1): unknown {
	const state = projectProjectState({ cwd });
	const completionAdapters = adapters ?? {
		projectState: { project: () => projectSnapshot(cwd) },
		router: { verification: () => ({ outcome: state.verification.effectiveOutcome, stale: state.verification.freshness === "stale" }) },
	};
	return assessCleanerCompletion(transition, verification, completionAdapters);
}
