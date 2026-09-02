// =============================================================================
// SDD OUT-OF-FLOW RECONCILIATION — PURE POLICY
// Valida evidencia y decide bloqueos sin leer Git, disco ni configuración.
// =============================================================================

export const OUT_OF_FLOW_PROFILE = "scope-only-out-of-flow" as const;
export const OUT_OF_FLOW_FORMAT = "ein-out-of-flow-reconciliation/v1" as const;
export const OUT_OF_FLOW_EVIDENCE_PATH = "out-of-flow-reconciliation.json" as const;

export type RepositoryStateIdentity = {
	head: string;
	tree: string;
	capturedAt: string;
};

export type ScopeOnlyRecordFacts = {
	readable: boolean;
	artifacts: string[];
	localDelta: boolean;
	// `legacy` included because resolveSddStatus can produce it; consumers below
	// only compare for equality, so widening the union hides nothing.
	specState: "declarationless" | "none" | "pending" | "conflicting" | "synchronized" | "unresolved" | "legacy";
	declaration:
		| { kind: "absent" }
		| { kind: "none"; reason: string; count: number }
		| { kind: "other"; count: number };
};

export type ReconciliationSummaryFacts = {
	path: string;
	sha256: string;
	bytes: number;
	text: string;
	fresh: boolean;
};

export type RepositoryCheckEvidence = {
	id: string;
	performed: string;
	outcome: "pass";
	completedAt: string;
	evidenceRef: string;
	repositoryState: RepositoryStateIdentity;
};

export type OutOfFlowReconciliationEvidence = {
	format: typeof OUT_OF_FLOW_FORMAT;
	profile: typeof OUT_OF_FLOW_PROFILE;
	change: string;
	auditReason: string;
	createdAt: string;
	summary: { path: "summary.md"; sha256: string; bytes: number };
	repositoryState: RepositoryStateIdentity;
	repositoryChecks: RepositoryCheckEvidence[];
};

export type OutOfFlowReconciliationInput = {
	profile: string | undefined;
	change: string;
	auditReason: string | undefined;
	now: string;
	record: ScopeOnlyRecordFacts;
	summary: ReconciliationSummaryFacts;
	currentRepositoryState: RepositoryStateIdentity | null;
	evidence: unknown;
};

export type ReconciliationBlocker = { code: string; message: string };

export type ValidatedOutOfFlowReconciliation = {
	profile: typeof OUT_OF_FLOW_PROFILE;
	change: string;
	reason: string;
	evidencePath: typeof OUT_OF_FLOW_EVIDENCE_PATH;
	summary: OutOfFlowReconciliationEvidence["summary"];
	repositoryState: RepositoryStateIdentity;
	checkIds: string[];
};

export type OutOfFlowReconciliationResult =
	| { ok: true; blockers: []; reconciliation: ValidatedOutOfFlowReconciliation }
	| { ok: false; blockers: ReconciliationBlocker[] };

const INVALID_REASONS = new Set(["none", "n/a", "na", "tbd", "unknown", "-"]);
const ALLOWED_ARTIFACTS = new Set(["scope.md", "summary.md", OUT_OF_FLOW_EVIDENCE_PATH]);
const EXCLUDED_LIFECYCLE_ARTIFACTS = ["map.md", "design.md", "tasks.md", "apply-progress.md", "verify-report.md"];
const SHA256 = /^[a-f0-9]{64}$/;
const CHECK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPOSITORY_TOKEN = /^[a-f0-9]{40,64}$/;

function reason(reason: unknown): string | null {
	if (typeof reason !== "string") return null;
	const normalized = reason.trim();
	return normalized && normalized.length <= 200 && !INVALID_REASONS.has(normalized.toLowerCase()) ? normalized : null;
}

function timestamp(value: unknown): number | null {
	if (typeof value !== "string" || !value.trim()) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function object(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repositoryState(value: unknown): value is RepositoryStateIdentity {
	if (!object(value)) return false;
	return REPOSITORY_TOKEN.test(String(value.head ?? ""))
		&& REPOSITORY_TOKEN.test(String(value.tree ?? ""))
		&& timestamp(value.capturedAt) !== null;
}

function sameRepositoryState(left: RepositoryStateIdentity, right: RepositoryStateIdentity): boolean {
	return left.head === right.head && left.tree === right.tree && left.capturedAt === right.capturedAt;
}

function add(blockers: ReconciliationBlocker[], code: string, message: string): void {
	if (!blockers.some((blocker) => blocker.code === code)) blockers.push({ code, message });
}

function recordEligible(record: ScopeOnlyRecordFacts): { shape: boolean; declarationReason: boolean } {
	const artifacts = new Set(record.artifacts);
	const exactArtifacts = record.artifacts.length === artifacts.size
		&& artifacts.has("scope.md")
		&& [...artifacts].every((artifact) => ALLOWED_ARTIFACTS.has(artifact));
	const declarationless = record.specState === "declarationless" && record.declaration.kind === "absent";
	const declaredNone = record.specState === "none"
		&& record.declaration.kind === "none"
		&& record.declaration.count === 1;
	return {
		shape: record.readable && exactArtifacts && !record.localDelta && (declarationless || declaredNone),
		declarationReason: !declaredNone || reason(record.declaration.kind === "none" ? record.declaration.reason : undefined) !== null,
	};
}

function markdownSection(text: string, heading: string): string {
	const marker = `## ${heading}`;
	const start = text.indexOf(marker);
	if (start < 0) return "";
	const bodyStart = start + marker.length;
	const next = text.indexOf("\n## ", bodyStart);
	return text.slice(bodyStart, next < 0 ? text.length : next).trim();
}

function summaryValid(summary: ReconciliationSummaryFacts, checkIds: string[]): boolean {
	if (summary.path !== "summary.md" || !summary.fresh || !SHA256.test(summary.sha256)
		|| summary.bytes !== new TextEncoder().encode(summary.text).byteLength) return false;
	if (!summary.text.includes("Delivery occurred outside SDD.")) return false;
	if (!EXCLUDED_LIFECYCLE_ARTIFACTS.every((artifact) => summary.text.includes(artifact))) return false;
	const verification = markdownSection(summary.text, "Repository verification");
	if (!checkIds.every((id) => verification.includes(id))) return false;
	const successors = markdownSection(summary.text, "Successor changes");
	return successors === "None." || /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/.test(successors);
}

export function validateOutOfFlowReconciliation(input: OutOfFlowReconciliationInput): OutOfFlowReconciliationResult {
	const blockers: ReconciliationBlocker[] = [];
	if (input.profile !== OUT_OF_FLOW_PROFILE) {
		add(blockers, "reconciliation-profile-unsupported", "The exact scope-only-out-of-flow profile is required.");
	}
	const auditReason = reason(input.auditReason);
	if (auditReason === null) add(blockers, "reconciliation-audit-reason-invalid", "A concrete audit reason is required.");

	const eligibility = recordEligible(input.record);
	if (!eligibility.shape) add(blockers, "reconciliation-record-ineligible", "The record is not an eligible scope-only shape and spec state.");
	if (!eligibility.declarationReason) add(blockers, "reconciliation-declaration-reason-invalid", "A spec_delta:none declaration needs its own concrete reason.");

	if (!object(input.evidence)) {
		add(blockers, "reconciliation-evidence-malformed", "Reconciliation evidence must be a valid object.");
		return { ok: false, blockers };
	}
	const evidence = input.evidence;
	const checks = Array.isArray(evidence.repositoryChecks) ? evidence.repositoryChecks : [];
	const evidenceShapeValid = evidence.format === OUT_OF_FLOW_FORMAT
		&& evidence.profile === OUT_OF_FLOW_PROFILE
		&& typeof evidence.change === "string"
		&& typeof evidence.auditReason === "string"
		&& timestamp(evidence.createdAt) !== null
		&& object(evidence.summary)
		&& repositoryState(evidence.repositoryState)
		&& checks.length > 0;
	if (!evidenceShapeValid) add(blockers, "reconciliation-evidence-malformed", "Reconciliation evidence has missing fields or an unknown contract version.");

	if (evidence.change !== input.change) add(blockers, "reconciliation-change-mismatch", "Evidence belongs to a different change.");
	const evidenceReason = reason(evidence.auditReason);
	if (auditReason !== null && evidenceReason !== auditReason) {
		add(blockers, "reconciliation-audit-reason-mismatch", "Evidence auditReason does not match the selected reason.");
	}
	const now = timestamp(input.now);
	const createdAt = timestamp(evidence.createdAt);
	if (now === null || createdAt === null || createdAt > now) {
		add(blockers, "reconciliation-evidence-stale", "Evidence creation time is invalid or in the future.");
	}

	const checkIds: string[] = [];
	let checksConcrete = checks.length > 0;
	let checksPassing = checks.length > 0;
	let checksCurrent = checks.length > 0;
	const evidenceState = repositoryState(evidence.repositoryState) ? evidence.repositoryState : null;
	for (const candidate of checks) {
		if (!object(candidate)) {
			checksConcrete = false;
			continue;
		}
		const id = typeof candidate.id === "string" ? candidate.id : "";
		if (!CHECK_ID.test(id) || checkIds.includes(id)) checksConcrete = false;
		else checkIds.push(id);
		const completedAt = timestamp(candidate.completedAt);
		if (typeof candidate.performed !== "string" || !candidate.performed.trim()
			|| typeof candidate.evidenceRef !== "string" || !candidate.evidenceRef.trim()
			|| INVALID_REASONS.has(candidate.evidenceRef.trim().toLowerCase())
			|| completedAt === null || now === null || completedAt > now) checksConcrete = false;
		if (candidate.outcome !== "pass") checksPassing = false;
		if (!repositoryState(candidate.repositoryState) || evidenceState === null
			|| !sameRepositoryState(candidate.repositoryState, evidenceState)
			|| completedAt === null || completedAt < Date.parse(evidenceState.capturedAt)) checksCurrent = false;
	}
	if (!checksConcrete) add(blockers, "reconciliation-checks-non-concrete", "Repository checks must be concrete, attributable, and uniquely identified.");
	if (!checksPassing) add(blockers, "reconciliation-checks-non-passing", "Every repository check must pass.");
	if (!checksCurrent) add(blockers, "reconciliation-repository-state-mismatch", "Checks do not share the represented repository state.");
	if (evidenceState === null || input.currentRepositoryState === null
		|| !sameRepositoryState(evidenceState, input.currentRepositoryState)) {
		add(blockers, "reconciliation-repository-state-mismatch", "Evidence does not match the current repository state.");
	}

	const evidenceSummary = object(evidence.summary) ? evidence.summary : {};
	const summaryIdentityMatches = evidenceSummary.path === "summary.md"
		&& evidenceSummary.sha256 === input.summary.sha256
		&& evidenceSummary.bytes === input.summary.bytes;
	if (!summaryIdentityMatches || !summaryValid(input.summary, checkIds)) {
		add(blockers, "reconciliation-summary-invalid", "Summary is stale, incomplete, unsafe, or does not match its evidence identity.");
	}

	if (blockers.length > 0 || auditReason === null || evidenceState === null || !object(evidenceSummary)) return { ok: false, blockers };
	return {
		ok: true,
		blockers: [],
		reconciliation: {
			profile: OUT_OF_FLOW_PROFILE,
			change: input.change,
			reason: auditReason,
			evidencePath: OUT_OF_FLOW_EVIDENCE_PATH,
			summary: evidenceSummary as OutOfFlowReconciliationEvidence["summary"],
			repositoryState: evidenceState,
			checkIds,
		},
	};
}
