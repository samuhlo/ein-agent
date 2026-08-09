import { createHash } from "node:crypto";
import type { CleanerFindingV1 } from "./cleaner-read-only-audit.ts";

export const CLEANER_BOUNDED_MUTATION_VERSION = "cleaner-bounded-mutation/v1" as const;
export const CLEANER_MUTATION_DECLARATION_VERSION = "cleaner-declaration-v1" as const;
export const CLEANER_STATE_TRANSITION_VERSION = "cleaner-state-transition-v1" as const;
export const CLEANER_EVIDENCE_INVALIDATION_VERSION = "cleaner-evidence-invalidation-v1" as const;
export const CLEANER_VERIFICATION_RECORD_VERSION = "cleaner-verification-record-v1" as const;
export const CLEANER_MUTATION_REASON_CODES = Object.freeze([
	"finding-not-selected", "finding-not-found", "finding-selection-ambiguous", "finding-stale", "finding-unresolved", "state-unavailable", "state-invalid", "state-stale", "evidence-unavailable", "evidence-invalid", "evidence-stale", "evidence-unbound",
	"ownership-invalid", "target-invalid", "target-out-of-area", "target-not-regular", "target-symlink", "operation-unsupported", "operation-over-budget", "operation-no-op", "replacement-not-found", "replacement-ambiguous", "digest-mismatch", "precondition-changed",
	"repository-incomplete", "repository-conflicted", "change-ambiguous", "writer-failed", "post-state-unavailable", "post-state-mismatch", "post-content-mismatch", "mutation-uncertain", "code-state-changed", "verification-required", "verification-failed", "verification-stale", "verification-unbound", "verification-state-mismatch", "verification-unavailable", "verification-passed",
] as const);
export type CleanerMutationReasonCode = typeof CLEANER_MUTATION_REASON_CODES[number];
export type CleanerStateRefV1 = string; export type CleanerContentDigestV1 = string; export type CleanerOpaqueReferenceV1 = string;
export type CleanerExactReplacementOperationV1 = Readonly<{
	kind: "exact-replacement";
	before: string;
	after: string;
}>;
export type CleanerMutationDeclarationV1 = Readonly<{
	version: typeof CLEANER_MUTATION_DECLARATION_VERSION;
	changeId: string;
	phase: "apply";
	areaId: string;
	targetPath: string;
	affectedSeam: string;
	operation: CleanerExactReplacementOperationV1;
	actorRef: CleanerOpaqueReferenceV1;
	reviewerRef: CleanerOpaqueReferenceV1;
	behaviorPreserved: true;
	expected: Readonly<{ stateRef: CleanerStateRefV1; beforeDigest: CleanerContentDigestV1; afterDigest: CleanerContentDigestV1 }>;
	verification: Readonly<{ commands: readonly [string, ...string[]] }>;
}>;
export type CleanerBoundedMutationRequestV1 = Readonly<{
	version: typeof CLEANER_BOUNDED_MUTATION_VERSION;
	findingId: string;
	declaration: CleanerMutationDeclarationV1;
}>;
export type CleanerProjectStateSnapshotV1 = Readonly<{
	stateRef: CleanerStateRefV1;
	complete: boolean;
	conflicted: boolean;
}>;
export type CleanerTargetFileSnapshotV1 = Readonly<{
	bytes: Readonly<Uint8Array>;
	digest: CleanerContentDigestV1;
	kind?: "regular" | "symlink" | "directory" | "missing";
	isSymlink?: boolean;
	isRegular?: boolean;
}>;
export type CleanerProjectStateAdapterV1 = Readonly<{ project: () => CleanerProjectStateSnapshotV1 }>;
export type CleanerFindingAdapterV1 = Readonly<{ resolve: (findingId: string) => CleanerFindingV1 | readonly CleanerFindingV1[] | null }>;
export type CleanerTargetFileAdapterV1 = Readonly<{ read: (targetPath: string) => CleanerTargetFileSnapshotV1 }>;
export type CleanerSingleWriterAdapterV1 = Readonly<{ write: (targetPath: string, bytes: Readonly<Uint8Array>) => void }>;
export type CleanerMutationAdaptersV1 = Readonly<{
	projectState: CleanerProjectStateAdapterV1;
	finding: CleanerFindingAdapterV1;
	target: CleanerTargetFileAdapterV1;
	writer: CleanerSingleWriterAdapterV1;
}>;
export type CleanerStateTransitionRecordV1 = Readonly<{
	version: typeof CLEANER_STATE_TRANSITION_VERSION;
	findingId: string;
	areaId: string;
	targetPath: string;
	observedStateRef: CleanerStateRefV1;
	resultingStateRef: CleanerStateRefV1 | null;
	beforeDigest: CleanerContentDigestV1;
	afterDigest: CleanerContentDigestV1 | null;
}>;
export type CleanerEvidenceInvalidationRecordV1 = Readonly<{
	version: typeof CLEANER_EVIDENCE_INVALIDATION_VERSION;
	observedStateRef: CleanerStateRefV1;
	resultingStateRef: CleanerStateRefV1 | null;
	findingId: string;
	audit: "stale" | "invalid";
	verification: "stale" | "invalid";
	reason: "code-state-changed";
}>;
export type CleanerVerificationRecordV1 = Readonly<{
	version: typeof CLEANER_VERIFICATION_RECORD_VERSION;
	outcome: "passed" | "failed";
	actorRef: CleanerOpaqueReferenceV1;
	commands: readonly [string, ...string[]];
	stateRef: CleanerStateRefV1;
}>;
export type CleanerRouterVerificationSnapshotV1 = Readonly<{
	outcome: "pass" | "fail" | "unknown" | "absent";
	stale: boolean;
}>;
export type CleanerRouterVerificationAdapterV1 = Readonly<{ verification: () => CleanerRouterVerificationSnapshotV1 }>;
export type CleanerCompletionAdaptersV1 = Readonly<{ projectState: CleanerProjectStateAdapterV1; router: CleanerRouterVerificationAdapterV1 }>;
export type CleanerBlockedReasonCode = Exclude<CleanerMutationReasonCode,
	"code-state-changed" | "mutation-uncertain" | "writer-failed" | "post-state-unavailable" | "post-state-mismatch" |
	"post-content-mismatch" | "verification-required" | "verification-failed" | "verification-stale" | "verification-unbound" |
	"verification-state-mismatch" | "verification-unavailable" | "verification-passed">;
export type CleanerBlockedOutcomeV1 = Readonly<{ status: "blocked"; reason: CleanerBlockedReasonCode }>;
export type CleanerVerificationRequiredOutcomeV1 = Readonly<{ status: "verification-required"; reason: "verification-required"; transition: CleanerStateTransitionRecordV1; invalidation: CleanerEvidenceInvalidationRecordV1 }>;
export type CleanerMutationUncertainOutcomeV1 = Readonly<{ status: "mutation-uncertain"; reason: "mutation-uncertain" | "writer-failed" | "post-state-unavailable" | "post-state-mismatch" | "post-content-mismatch"; transition: CleanerStateTransitionRecordV1; invalidation: CleanerEvidenceInvalidationRecordV1 }>;
export type CleanerMutationOutcomeV1 = CleanerBlockedOutcomeV1 | CleanerVerificationRequiredOutcomeV1 | CleanerMutationUncertainOutcomeV1;
export type CleanerMutationAdmissionV1 = Readonly<{
	status: "admitted";
	findingId: string;
	areaId: string;
	targetPath: string;
	stateRef: CleanerStateRefV1;
	beforeDigest: CleanerContentDigestV1;
	afterDigest: CleanerContentDigestV1;
	beforeBytes: Readonly<Uint8Array>;
	afterBytes: Readonly<Uint8Array>;
	bytes: Readonly<Uint8Array>;
	operation: CleanerExactReplacementOperationV1;
}>;
export type CleanerMutationAdmissionOutcomeV1 = CleanerMutationAdmissionV1 | CleanerBlockedOutcomeV1;
export type CleanerCompleteOutcomeV1 = Readonly<{
	status: "complete";
	reason: "verification-passed";
	verification: CleanerVerificationRecordV1;
}>;
export type CleanerVerificationOutcomeV1 = CleanerCompleteOutcomeV1 | Readonly<{
	status: "verification-required" | "verification-failed";
	reason: "verification-required" | "verification-failed" | "verification-stale" | "verification-unbound" | "verification-state-mismatch" | "verification-unavailable";
	verification?: CleanerVerificationRecordV1;
}>;
export type CleanerMutationRequestV1 = CleanerBoundedMutationRequestV1; export type CleanerMutationRequest = CleanerBoundedMutationRequestV1; export type CleanerMutationDeclaration = CleanerMutationDeclarationV1;
export type CleanerMutationDependenciesV1 = CleanerMutationAdaptersV1; export type CleanerMutationDependencies = CleanerMutationAdaptersV1; export type CleanerMutationAdapters = CleanerMutationAdaptersV1;
export type CleanerApplicationOutcomeV1 = CleanerMutationOutcomeV1; export type CleanerApplicationOutcome = CleanerMutationOutcomeV1; export type CleanerMutationOutcome = CleanerMutationOutcomeV1;
export type CleanerCompletionOutcomeV1 = CleanerVerificationOutcomeV1; export type CleanerCompletionOutcome = CleanerVerificationOutcomeV1; export type CleanerStateTransitionV1 = CleanerStateTransitionRecordV1;
export type CleanerStateTransitionRecord = CleanerStateTransitionRecordV1; export type CleanerInvalidationRecordV1 = CleanerEvidenceInvalidationRecordV1; export type CleanerEvidenceInvalidationRecord = CleanerEvidenceInvalidationRecordV1;
export type CleanerVerificationRecord = CleanerVerificationRecordV1; export type CleanerReasonCode = CleanerMutationReasonCode; export type CleanerBlockedReason = CleanerBlockedReasonCode;
export type CleanerMutationAdmission = CleanerMutationAdmissionV1; export type CleanerMutationAdmissionOutcome = CleanerMutationAdmissionOutcomeV1;

const statePattern = /^git-v1:sha256:[0-9a-f]{64}$/;
const areaPattern = /^area-v1:sha256:[0-9a-f]{64}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const evidencePattern = /^review-evidence-v1:[0-9a-f]{32,64}$/;
const control = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const restricted = new Set([".git", ".pi", "build", "coverage", "dist", "generated", "node_modules", "private", "runtime"]);
const requestKeys = ["version", "findingId", "declaration"] as const;
const adapterKeys = ["projectState", "finding", "target", "writer"] as const;
const maxPathBytes = 512;
const maxChangedLines = 400;
type Rec = Record<string, unknown>;
type ProjectRead = { ok: true; value: CleanerProjectStateSnapshotV1 } | { ok: false; reason: CleanerBlockedReasonCode };
type TargetRead = { ok: true; value: CleanerTargetFileSnapshotV1 } | { ok: false; reason: CleanerBlockedReasonCode };

const rec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const exact = (v: Rec, keys: readonly string[]) => {
	const actual = Object.keys(v).sort();
	const expected = [...keys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const text = (v: unknown, empty = false): v is string => {
	if (typeof v !== "string" || (!empty && !v.length) || v.trim() !== v || control.test(v)) return false;
	try { return decoder.decode(encoder.encode(v)) === v; } catch { return false; }
};
const replacement = (v: unknown, empty = false): v is string => {
	if (typeof v !== "string" || (!empty && !v.length) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) return false;
	try { return decoder.decode(encoder.encode(v)) === v; } catch { return false; }
};
const opaque = (v: unknown): v is string => text(v) && !/[\s,]/.test(v);
const validDigest = (v: unknown): v is string => typeof v === "string" && digestPattern.test(v);
const validState = (v: unknown): v is string => typeof v === "string" && statePattern.test(v);
const validArea = (v: unknown): v is string => typeof v === "string" && areaPattern.test(v);
const validPath = (v: unknown): v is string => {
	if (typeof v !== "string" || !v.length || v === "." || v.trim() !== v || control.test(v) || v.includes("\\") ||
		v.startsWith("/") || /^[A-Za-z]:/.test(v) || encoder.encode(v).byteLength > maxPathBytes) return false;
	const parts = v.split("/");
	return !parts.some((part) => !part.length || part === "." || part === "..") && parts.join("/") === v;
};
const restrictedPath = (path: string) => path.split("/").some((segment) => restricted.has(segment.toLowerCase()) || /^(?:generated|private|runtime)(?:[._-]|$)/i.test(segment));
const architect = (value: string) => /(?:^|[-_:.\/])(?:architect|architectural|architecture|structural)(?:$|[-_:.\/])/i.test(value);
const blocked = (reason: CleanerBlockedReasonCode): CleanerBlockedOutcomeV1 => Object.freeze({ status: "blocked" as const, reason });
const hash = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const same = (left: Uint8Array, right: Uint8Array) => left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
const occurrences = (haystack: Uint8Array, needle: Uint8Array) => {
	let count = 0, index = -1;
	if (!needle.byteLength) return { count, index };
	for (let start = 0; start <= haystack.byteLength - needle.byteLength; start += 1) {
		let match = true;
		for (let offset = 0; offset < needle.byteLength; offset += 1) if (haystack[start + offset] !== needle[offset]) { match = false; break; }
		if (match) { if (index < 0) index = start; count += 1; }
	}
	return { count, index };
};
const lineCount = (textValue: string) => textValue.length ? textValue.split(/\r\n|\r|\n/).length : 0;

function readProject(adapter: CleanerProjectStateAdapterV1): ProjectRead {
	try {
		const snapshot = adapter.project();
		if (!rec(snapshot) || !validState(snapshot.stateRef) || typeof snapshot.complete !== "boolean" || typeof snapshot.conflicted !== "boolean") return { ok: false, reason: "state-invalid" };
		if (!snapshot.complete) return { ok: false, reason: "repository-incomplete" };
		if (snapshot.conflicted) return { ok: false, reason: "repository-conflicted" };
		return { ok: true, value: snapshot as CleanerProjectStateSnapshotV1 };
	} catch { return { ok: false, reason: "state-unavailable" }; }
}
function readTarget(adapter: CleanerTargetFileAdapterV1, targetPath: string): TargetRead {
	try {
		const snapshot = adapter.read(targetPath);
		if (!rec(snapshot)) return { ok: false, reason: "target-invalid" };
		if (snapshot.isSymlink === true || snapshot.kind === "symlink") return { ok: false, reason: "target-symlink" };
		if (snapshot.kind !== undefined && snapshot.kind !== "regular") return { ok: false, reason: "target-not-regular" };
		if (snapshot.isRegular === false || !(snapshot.bytes instanceof Uint8Array) || !validDigest(snapshot.digest)) return { ok: false, reason: "target-invalid" };
		return { ok: true, value: snapshot as CleanerTargetFileSnapshotV1 };
	} catch { return { ok: false, reason: "target-invalid" }; }
}
function pathOwned(selectors: unknown, targetPath: string) {
	if (!Array.isArray(selectors) || !selectors.length) return false;
	const seen = new Set<string>();
	for (const value of selectors) {
		if (!rec(value) || !exact(value, ["kind", "path"]) || (value.kind !== "file" && value.kind !== "tree") || !validPath(value.path)) return false;
		const path = value.path;
		if (restrictedPath(path)) return false;
		const identity = `${value.kind}:${path}`;
		if (seen.has(identity)) return false;
		seen.add(identity);
		if (value.kind === "file" && path === targetPath || value.kind === "tree" && (path === targetPath || targetPath.startsWith(`${path}/`))) return true;
	}
	return false;
}
function adaptersReason(adapters: unknown): CleanerBlockedReasonCode | null {
	return rec(adapters) && exact(adapters, adapterKeys) ? null : "operation-unsupported";
}
function declarationReason(value: unknown): CleanerBlockedReasonCode | null {
	if (!rec(value)) return "finding-not-selected";
	if (!exact(value, requestKeys)) return "operation-unsupported";
	if (value.version !== CLEANER_BOUNDED_MUTATION_VERSION || !opaque(value.findingId)) return "finding-not-selected";
	const declaration = value.declaration;
	if (!rec(declaration) || declaration.version !== CLEANER_MUTATION_DECLARATION_VERSION || declaration.phase !== "apply") return "operation-unsupported";
	if (!opaque(declaration.changeId) || /,/.test(declaration.changeId)) return "change-ambiguous";
	if (!validArea(declaration.areaId) || !opaque(declaration.affectedSeam) || architect(declaration.affectedSeam) || declaration.behaviorPreserved !== true) return "ownership-invalid";
	if (!opaque(declaration.actorRef) || !opaque(declaration.reviewerRef)) return "evidence-invalid";
	if (!validPath(declaration.targetPath)) return "target-invalid";
	if (restrictedPath(declaration.targetPath)) return "ownership-invalid";
	const expected = declaration.expected;
	if (!rec(expected) || !validState(expected.stateRef) || !validDigest(expected.beforeDigest) || !validDigest(expected.afterDigest)) return "digest-mismatch";
	const verification = declaration.verification;
	if (!rec(verification) || !Array.isArray(verification.commands) || !verification.commands.length || verification.commands.some((command) => !text(command))) return "evidence-invalid";
	const operation = declaration.operation;
	if (!rec(operation) || !exact(operation, ["kind", "before", "after"]) || operation.kind !== "exact-replacement" || !replacement(operation.before) || !replacement(operation.after, true)) return "operation-unsupported";
	if (!operation.before.length) return "operation-unsupported";
	try { if (same(encoder.encode(operation.before), encoder.encode(operation.after))) return "operation-no-op"; } catch { return "operation-unsupported"; }
	return lineCount(operation.before) + lineCount(operation.after) > maxChangedLines ? "operation-over-budget" : null;
}
function findingReason(value: unknown, request: CleanerBoundedMutationRequestV1, project: CleanerProjectStateSnapshotV1): CleanerBlockedReasonCode | null {
	if (!rec(value) || value.id !== request.findingId) return "finding-not-found";
	if (value.rule !== "reviewed-area-assessment" || value.classification !== "observed-fact" || value.confidence !== "high" || value.uncertainty !== "none" || value.applied !== false) return "finding-unresolved";
	if (!validArea(value.areaId) || value.areaId !== request.declaration.areaId) return "ownership-invalid";
	const state = value.state;
	if (!rec(state) || state.status !== "current" || !validState(state.stateRef)) return "finding-stale";
	if (state.stateRef !== project.stateRef || state.stateRef !== request.declaration.expected.stateRef) return "state-stale";
	const g = value.g;
	if (!rec(g) || g.outcome !== "reviewed") return "evidence-invalid";
	if (g.freshness !== "current") return "evidence-stale";
	const evidence = value.evidence;
	if (!rec(evidence)) return "evidence-invalid";
	if (evidence.status !== "verified") return evidence.status === "unavailable" ? "evidence-unavailable" : "evidence-invalid";
	if (!text(evidence.reference) || !evidencePattern.test(evidence.reference) || !validDigest(evidence.digest)) return "evidence-invalid";
	return pathOwned(value.selectors, request.declaration.targetPath) ? null : "target-out-of-area";
}
const isFindingList = (value: CleanerFindingV1 | readonly CleanerFindingV1[]): value is readonly CleanerFindingV1[] => Array.isArray(value);
function resolveFinding(adapter: CleanerFindingAdapterV1, findingId: string): { ok: true; finding: CleanerFindingV1 } | { ok: false; reason: CleanerBlockedReasonCode } {
	try {
		const resolved = adapter.resolve(findingId);
		if (resolved == null) return { ok: false, reason: "finding-not-found" };
		if (isFindingList(resolved)) {
			if (!resolved.length) return { ok: false, reason: "finding-not-found" };
			if (resolved.length !== 1) return { ok: false, reason: "finding-selection-ambiguous" };
			return { ok: true, finding: resolved[0]! };
		}
		return { ok: true, finding: resolved };
	} catch { return { ok: false, reason: "evidence-unavailable" }; }
}
export function admitCleanerBoundedMutation(request: CleanerBoundedMutationRequestV1, adapters: CleanerMutationAdaptersV1): CleanerMutationAdmissionOutcomeV1 {
	const adapterError = adaptersReason(adapters);
	if (adapterError) return blocked(adapterError);
	const declarationError = declarationReason(request);
	if (declarationError) return blocked(declarationError);
	const declaration = request.declaration;
	const initialProject = readProject(adapters.projectState);
	if (initialProject.ok === false) return blocked(initialProject.reason);
	if (initialProject.value.stateRef !== declaration.expected.stateRef) return blocked("state-stale");
	const resolved = resolveFinding(adapters.finding, request.findingId);
	if (resolved.ok === false) return blocked(resolved.reason);
	const findingError = findingReason(resolved.finding, request, initialProject.value);
	if (findingError) return blocked(findingError);
	const targetRead = readTarget(adapters.target, declaration.targetPath);
	if (targetRead.ok === false) return blocked(targetRead.reason);
	const before = new Uint8Array(targetRead.value.bytes);
	try { decoder.decode(before); } catch { return blocked("target-invalid"); }
	const beforeDigest = hash(before);
	if (targetRead.value.digest !== beforeDigest || declaration.expected.beforeDigest !== beforeDigest) return blocked("digest-mismatch");
	const operation = declaration.operation;
	const beforeBytes = encoder.encode(operation.before);
	const afterBytes = encoder.encode(operation.after);
	const occurrence = occurrences(before, beforeBytes);
	if (!occurrence.count) return blocked("replacement-not-found");
	if (occurrence.count !== 1) return blocked("replacement-ambiguous");
	const after = new Uint8Array(before.byteLength - beforeBytes.byteLength + afterBytes.byteLength);
	after.set(before.slice(0, occurrence.index));
	after.set(afterBytes, occurrence.index);
	after.set(before.slice(occurrence.index + beforeBytes.byteLength), occurrence.index + afterBytes.byteLength);
	const afterDigest = hash(after);
	if (declaration.expected.afterDigest !== afterDigest) return blocked("digest-mismatch");
	const finalTarget = readTarget(adapters.target, declaration.targetPath);
	if (!finalTarget.ok) return blocked("precondition-changed");
	const finalBytes = new Uint8Array(finalTarget.value.bytes);
	if (!same(finalBytes, before) || finalTarget.value.digest !== beforeDigest || hash(finalBytes) !== beforeDigest) return blocked("precondition-changed");
	const finalProject = readProject(adapters.projectState);
	if (finalProject.ok === false) return blocked(finalProject.reason);
	if (finalProject.value.stateRef !== initialProject.value.stateRef || finalProject.value.complete !== initialProject.value.complete || finalProject.value.conflicted !== initialProject.value.conflicted) return blocked("precondition-changed");
	return Object.freeze({ status: "admitted" as const, findingId: request.findingId, areaId: declaration.areaId, targetPath: declaration.targetPath, stateRef: initialProject.value.stateRef, beforeDigest, afterDigest, beforeBytes: before, afterBytes: after, bytes: after, operation: Object.freeze({ kind: "exact-replacement" as const, before: operation.before, after: operation.after }) });
}

type PostTarget = { status: "available" | "mismatch"; bytes: Uint8Array; digest: string } | null;
function postProject(adapter: CleanerProjectStateAdapterV1): CleanerProjectStateSnapshotV1 | null {
	try {
		const snapshot = adapter.project();
		return rec(snapshot) && validState(snapshot.stateRef) && typeof snapshot.complete === "boolean" && typeof snapshot.conflicted === "boolean" ? snapshot as CleanerProjectStateSnapshotV1 : null;
	} catch { return null; }
}
function postTarget(adapter: CleanerTargetFileAdapterV1, targetPath: string): PostTarget {
	try {
		const read = readTarget(adapter, targetPath);
		if (!read.ok) return null;
		const bytes = new Uint8Array(read.value.bytes), digest = hash(bytes);
		return { status: read.value.digest === digest ? "available" : "mismatch", bytes, digest };
	} catch { return null; }
}
function transition(admission: CleanerMutationAdmissionV1, stateRef: string | null, afterDigest: string | null): CleanerStateTransitionRecordV1 {
	return Object.freeze({ version: CLEANER_STATE_TRANSITION_VERSION, findingId: admission.findingId, areaId: admission.areaId, targetPath: admission.targetPath, observedStateRef: admission.stateRef, resultingStateRef: stateRef, beforeDigest: admission.beforeDigest, afterDigest });
}
function invalidation(admission: CleanerMutationAdmissionV1, stateRef: string | null, uncertainMutation: boolean): CleanerEvidenceInvalidationRecordV1 {
	return Object.freeze({ version: CLEANER_EVIDENCE_INVALIDATION_VERSION, observedStateRef: admission.stateRef, resultingStateRef: stateRef, findingId: admission.findingId, audit: uncertainMutation ? "invalid" : "stale", verification: uncertainMutation ? "invalid" : "stale", reason: "code-state-changed" as const });
}
function uncertain(admission: CleanerMutationAdmissionV1, reason: CleanerMutationUncertainOutcomeV1["reason"], stateRef: string | null, afterDigest: string | null): CleanerMutationUncertainOutcomeV1 {
	return Object.freeze({ status: "mutation-uncertain" as const, reason, transition: transition(admission, stateRef, afterDigest), invalidation: invalidation(admission, stateRef, true) });
}

export function applyCleanerBoundedMutation(request: CleanerBoundedMutationRequestV1, adapters: CleanerMutationAdaptersV1): CleanerMutationOutcomeV1 {
	const admission = admitCleanerBoundedMutation(request, adapters);
	if (admission.status !== "admitted") return admission;
	let writerFailed = false;
	try {
		const writerResult: unknown = adapters.writer.write(admission.targetPath, new Uint8Array(admission.afterBytes));
		if (rec(writerResult) && typeof writerResult.then === "function") writerFailed = true;
	} catch { writerFailed = true; }
	const project = postProject(adapters.projectState);
	const target = postTarget(adapters.target, admission.targetPath);
	const stateRef = project?.stateRef ?? null;
	const afterDigest = target?.digest ?? null;
	if (writerFailed) return uncertain(admission, "writer-failed", stateRef, afterDigest);
	if (!project || !target) return uncertain(admission, "post-state-unavailable", stateRef, afterDigest);
	if (target.status === "mismatch" || target.digest !== admission.afterDigest) return uncertain(admission, "post-content-mismatch", stateRef, target.digest);
	if (!project.complete || project.conflicted || project.stateRef === admission.stateRef) return uncertain(admission, "post-state-mismatch", stateRef, target.digest);
	return Object.freeze({ status: "verification-required" as const, reason: "verification-required" as const, transition: transition(admission, project.stateRef, target.digest), invalidation: invalidation(admission, project.stateRef, false) });
}

function verificationRecord(value: unknown): { ok: true; value: CleanerVerificationRecordV1 } | { ok: false; reason: "verification-required" | "verification-unbound" } {
	if (value == null) return { ok: false, reason: "verification-required" };
	if (!rec(value) || value.version !== CLEANER_VERIFICATION_RECORD_VERSION || (value.outcome !== "passed" && value.outcome !== "failed") || !opaque(value.actorRef) || !Array.isArray(value.commands) || !value.commands.length || value.commands.some((command) => !text(command)) || !validState(value.stateRef)) return { ok: false, reason: "verification-unbound" };
	const commands = Object.freeze([...value.commands]) as readonly [string, ...string[]];
	return { ok: true, value: Object.freeze({ version: CLEANER_VERIFICATION_RECORD_VERSION, outcome: value.outcome, actorRef: value.actorRef, commands, stateRef: value.stateRef }) };
}
function completionProject(adapter: CleanerProjectStateAdapterV1): { ok: true; value: CleanerProjectStateSnapshotV1 } | { ok: false } {
	try {
		const snapshot = adapter.project();
		return rec(snapshot) && validState(snapshot.stateRef) && typeof snapshot.complete === "boolean" && typeof snapshot.conflicted === "boolean" ? { ok: true, value: snapshot as CleanerProjectStateSnapshotV1 } : { ok: false };
	} catch { return { ok: false }; }
}
function completionRouter(adapter: CleanerRouterVerificationAdapterV1): { ok: true; value: CleanerRouterVerificationSnapshotV1 } | { ok: false } {
	try {
		const snapshot = adapter.verification();
		return rec(snapshot) && ["pass", "fail", "unknown", "absent"].includes(snapshot.outcome as string) && typeof snapshot.stale === "boolean" ? { ok: true, value: snapshot as CleanerRouterVerificationSnapshotV1 } : { ok: false };
	} catch { return { ok: false }; }
}
type IncompleteReason = Exclude<CleanerVerificationOutcomeV1["reason"], "verification-failed" | "verification-passed">;
function required(reason: IncompleteReason, verification?: CleanerVerificationRecordV1): CleanerVerificationOutcomeV1 {
	return Object.freeze({ status: "verification-required" as const, reason, ...(verification ? { verification } : {}) });
}

export function assessCleanerCompletion(transitionValue: CleanerStateTransitionRecordV1, verification: CleanerVerificationRecordV1 | null | undefined, adapters: CleanerCompletionAdaptersV1): CleanerVerificationOutcomeV1 {
	if (!rec(transitionValue) || !validState(transitionValue.observedStateRef) || !validState(transitionValue.resultingStateRef) || transitionValue.resultingStateRef === transitionValue.observedStateRef) return required("verification-state-mismatch");
	const project = completionProject(adapters.projectState);
	if (!project.ok) return required("verification-unavailable");
	if (!project.value.complete || project.value.conflicted) return required("verification-unavailable");
	if (project.value.stateRef !== transitionValue.resultingStateRef) return required("verification-state-mismatch");
	const router = completionRouter(adapters.router);
	if (!router.ok) return required("verification-unavailable");
	if (router.value.stale) return required("verification-stale");
	if (router.value.outcome !== "pass") return router.value.outcome === "fail" ? Object.freeze({ status: "verification-failed" as const, reason: "verification-failed" as const }) : required("verification-unavailable");
	const checked = verificationRecord(verification);
	if (checked.ok === false) return required(checked.reason);
	if (checked.value.stateRef !== transitionValue.resultingStateRef) return required("verification-state-mismatch", checked.value);
	if (checked.value.outcome !== "passed") return Object.freeze({ status: "verification-failed" as const, reason: "verification-failed" as const, verification: checked.value });
	return Object.freeze({ status: "complete" as const, reason: "verification-passed" as const, verification: checked.value });
}
