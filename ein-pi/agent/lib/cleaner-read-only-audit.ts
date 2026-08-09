import { createHash } from "node:crypto";
import type {
	ProjectStateQuality,
	ProjectStateReasonCode,
	ProjectStateV1,
} from "./project-state.ts";
import type {
	Area,
	AreaSelector,
	EvidenceResolution,
	LedgerEvaluation,
} from "./reviewed-area-ledger.ts";

export const CLEANER_AUDIT_REPORT_VERSION = "cleaner-audit-report/v1" as const;
export const CLEANER_FINDING_VERSION = "cleaner-finding-v1" as const;
export const CLEANER_AUDIT_RULE = "reviewed-area-assessment" as const;

export type CleanerFindingClassification =
	| "observed-fact"
	| "inferred-opportunity"
	| "unresolved-question";
export type CleanerFindingSeverity = "info" | "warning" | "error";
export type CleanerFindingConfidence = "high" | "medium" | "low";

export type CleanerReadOnlyAssessment = Readonly<{
	area: Area;
	evaluation: LedgerEvaluation;
	evidence: EvidenceResolution;
}>;

export type CleanerAuditInput = Readonly<{
	state: ProjectStateV1;
	assessments: readonly CleanerReadOnlyAssessment[];
}>;

export type CleanerStateTrace =
	| Readonly<{
			status: "current";
			stateRef: string;
			quality: ProjectStateQuality;
			reason: ProjectStateReasonCode;
		}>
	| Readonly<{
			status: "unknown" | "unavailable";
			quality: ProjectStateQuality;
			reason: ProjectStateReasonCode;
		}>;

export type CleanerGTrace = Readonly<{
	outcome: LedgerEvaluation["outcome"];
	freshness: LedgerEvaluation["freshness"];
	reason: LedgerEvaluation["reason"];
}>;

export type CleanerEvidenceTrace =
	| Readonly<{ status: "verified"; reference: string; digest: string }>
	| Readonly<{ status: EvidenceResolution["status"] }>;

export type CleanerFindingV1 = Readonly<{
	id: string;
	rule: typeof CLEANER_AUDIT_RULE;
	classification: CleanerFindingClassification;
	severity: CleanerFindingSeverity;
	confidence: CleanerFindingConfidence;
	areaId: string;
	selectors: readonly AreaSelector[];
	state: CleanerStateTrace;
	g: CleanerGTrace;
	evidence: CleanerEvidenceTrace;
	uncertainty: string;
	applied: false;
}>;

export type CleanerAuditReportV1 = Readonly<{
	version: typeof CLEANER_AUDIT_REPORT_VERSION;
	mode: "read-only";
	findings: readonly CleanerFindingV1[];
	appliedChanges: 0;
	noChangeStatement: string;
}>;

const STATE_REF_PATTERN = /^git-v1:sha256:[0-9a-f]{64}$/;
const AREA_ID_PATTERN = /^area-v1:sha256:[0-9a-f]{64}$/;
const EVIDENCE_REFERENCE_PATTERN = /^review-evidence-v1:[0-9a-f]{32,64}$/;
const EVIDENCE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVIEWER_REFERENCE_PATTERN = /^reviewer-v1:sha256:[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_PATH_BYTES = 512;
const TEXT_ENCODER = new TextEncoder();

const STATE_QUALITIES: readonly ProjectStateQuality[] = [
	"current",
	"absent",
	"incomplete",
	"ambiguous",
	"legacy",
	"stale",
	"unbound",
	"unavailable",
];
const STATE_REASONS: readonly ProjectStateReasonCode[] = [
	"not-inspected",
	"not-provided",
	"not-found",
	"not-a-repository",
	"incomplete-source",
	"ambiguous-selection",
	"legacy-source",
	"stale-source",
	"invalid-source",
	"state-mismatch",
	"read-error",
	"command-error",
	"parse-error",
	"read-success",
];
const G_OUTCOMES: readonly LedgerEvaluation["outcome"][] = [
	"reviewed",
	"unreviewed",
	"stale",
	"invalid",
	"unavailable",
	"unknown",
];
const G_FRESHNESS: readonly LedgerEvaluation["freshness"][] = [
	"current",
	"stale",
	"unavailable",
	"invalid",
	"unknown",
];
const G_REASONS: readonly LedgerEvaluation["reason"][] = [
	"exact-git-binding",
	"no-record",
	"explicit-unreviewed",
	"malformed-ledger",
	"invalid-area",
	"invalid-evidence",
	"evidence-mismatch",
	"evidence-unavailable",
	"git-state-unavailable",
	"relevant-git-change",
	"binding-mismatch-unaffected",
	"git-transition-unverifiable",
	"unsupported-version",
	"ledger-oversized",
	"ledger-unreadable",
];
const EVIDENCE_STATUSES: readonly EvidenceResolution["status"][] = [
	"verified",
	"missing",
	"mismatch",
	"invalid",
	"unavailable",
];

function oneOf<T extends string>(values: readonly T[], value: unknown, fallback: T): T {
	return typeof value === "string" && values.includes(value as T) ? value as T : fallback;
}

function byteCompare(left: string, right: string): number {
	const leftBytes = TEXT_ENCODER.encode(left);
	const rightBytes = TEXT_ENCODER.encode(right);
	const length = Math.min(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		const difference = leftBytes[index]! - rightBytes[index]!;
		if (difference !== 0) return difference;
	}
	return leftBytes.length - rightBytes.length;
}

function validBoundedPath(value: unknown): value is string {
	if (typeof value !== "string" || value.length === 0 || TEXT_ENCODER.encode(value).byteLength > MAX_PATH_BYTES) return false;
	if (value.includes("\\") || value.includes("\0") || CONTROL.test(value) || value.startsWith("/")) return false;
	return !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..");
}

function boundedSelectors(area: Area): readonly AreaSelector[] {
	if (!Array.isArray(area.selectors)) return [];
	const selectors = Array.prototype.flatMap.call(area.selectors, (selector: AreaSelector) => {
		if (
			!selector ||
			(selector.kind !== "file" && selector.kind !== "tree") ||
			!validBoundedPath(selector.path)
		) return [];
		return [{ kind: selector.kind, path: selector.path } satisfies AreaSelector];
	}) as AreaSelector[];
	selectors.sort((left, right) => byteCompare(`${left.kind}\0${left.path}`, `${right.kind}\0${right.path}`));
	return selectors;
}

function boundedAreaId(area: Area): string {
	return typeof area.id === "string" && AREA_ID_PATTERN.test(area.id) ? area.id : "area-unavailable";
}

function stateTrace(state: ProjectStateV1): CleanerStateTrace {
	const git = state.git;
	const quality = oneOf(STATE_QUALITIES, git?.quality, "unavailable");
	const reason = oneOf(STATE_REASONS, git?.reason, "not-provided");
	const stateRef = typeof git?.stateRef === "string" && STATE_REF_PATTERN.test(git.stateRef)
		? git.stateRef
		: undefined;
	if (git?.repository === true && git.complete === true && quality === "current" && stateRef) {
		return { status: "current", stateRef, quality, reason };
	}
	const unavailable = git?.repository !== true || quality === "absent" || quality === "unavailable";
	return { status: unavailable ? "unavailable" : "unknown", quality, reason };
}

function gTrace(evaluation: LedgerEvaluation): CleanerGTrace {
	return {
		outcome: oneOf(G_OUTCOMES, evaluation?.outcome, "unknown"),
		freshness: oneOf(G_FRESHNESS, evaluation?.freshness, "unknown"),
		reason: oneOf(G_REASONS, evaluation?.reason, "git-state-unavailable"),
	};
}

function evidenceTrace(
	evidence: EvidenceResolution,
	areaId: string,
): CleanerEvidenceTrace {
	const status = oneOf(EVIDENCE_STATUSES, evidence?.status, "unavailable");
	if (status !== "verified" || evidence.status !== "verified") return { status };
	if (
		typeof evidence.reference !== "string" ||
		!EVIDENCE_REFERENCE_PATTERN.test(evidence.reference) ||
		typeof evidence.digest !== "string" ||
		!EVIDENCE_DIGEST_PATTERN.test(evidence.digest) ||
		typeof evidence.reviewerRef !== "string" ||
		!REVIEWER_REFERENCE_PATTERN.test(evidence.reviewerRef) ||
		evidence.areaId !== areaId
	) {
		return { status: "invalid" };
	}
	return { status, reference: evidence.reference, digest: evidence.digest };
}

function isCurrentReviewed(
	state: CleanerStateTrace,
	g: CleanerGTrace,
	evidence: CleanerEvidenceTrace,
	evidenceInput: EvidenceResolution,
	areaId: string,
): boolean {
	return (
		state.status === "current" &&
		g.outcome === "reviewed" &&
		g.freshness === "current" &&
		g.reason === "exact-git-binding" &&
		evidence.status === "verified" &&
		evidenceInput.status === "verified" &&
		evidenceInput.areaId === areaId &&
		evidenceInput.stateRef === state.stateRef
	);
}

function uncertainty(
	current: boolean,
	state: CleanerStateTrace,
	g: CleanerGTrace,
): string {
	if (current) return "none";
	const stateReason = state.status === "current" ? "" : `; B state ${state.reason}`;
	return `Unresolved: ${g.reason}${stateReason}.`;
}

function findingSeverity(g: CleanerGTrace): CleanerFindingSeverity {
	return g.outcome === "invalid" || g.outcome === "unavailable" || g.freshness === "invalid" || g.freshness === "unavailable"
		? "error"
		: "warning";
}

function findingId(value: Readonly<{
	areaId: string;
	selectors: readonly AreaSelector[];
	classification: CleanerFindingClassification;
	severity: CleanerFindingSeverity;
	confidence: CleanerFindingConfidence;
	state: CleanerStateTrace;
	g: CleanerGTrace;
	evidence: CleanerEvidenceTrace;
}>): string {
	const semantic = JSON.stringify({
		version: CLEANER_FINDING_VERSION,
		rule: CLEANER_AUDIT_RULE,
		areaId: value.areaId,
		selectors: value.selectors.map((selector) => ({ kind: selector.kind, path: selector.path })),
		classification: value.classification,
		severity: value.severity,
		confidence: value.confidence,
		state: value.state,
		g: value.g,
		evidence: value.evidence,
	});
	const digest = createHash("sha256").update(semantic, "utf8").digest("hex");
	return `${CLEANER_FINDING_VERSION}:sha256:${digest}`;
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return value;
}

function protectImmutable<T extends object>(value: T): T {
	return new Proxy(value, {
		set: () => true,
		defineProperty: () => true,
		deleteProperty: () => true,
	});
}

export function auditCleanerReadOnly(input: CleanerAuditInput): CleanerAuditReportV1 {
	const findings = Array.prototype.map.call(
		input.assessments,
		(assessment: CleanerReadOnlyAssessment): CleanerFindingV1 => {
			const areaId = boundedAreaId(assessment.area);
			const selectors = boundedSelectors(assessment.area);
			const state = stateTrace(input.state);
			const g = gTrace(assessment.evaluation);
			const evidence = evidenceTrace(assessment.evidence, areaId);
			const current = isCurrentReviewed(state, g, evidence, assessment.evidence, areaId);
			const classification: CleanerFindingClassification = current ? "observed-fact" : "unresolved-question";
			const severity: CleanerFindingSeverity = current ? "info" : findingSeverity(g);
			const confidence: CleanerFindingConfidence = current ? "high" : "low";
			const finding = {
				id: findingId({ areaId, selectors, classification, severity, confidence, state, g, evidence }),
				rule: CLEANER_AUDIT_RULE,
				classification,
				severity,
				confidence,
				areaId,
				selectors,
				state,
				g,
				evidence,
				uncertainty: uncertainty(current, state, g),
				applied: false as const,
			};
			return protectImmutable(deepFreeze(finding));
		},
	) as CleanerFindingV1[];

	findings.sort((left, right) => {
		const areaOrder = byteCompare(left.areaId, right.areaId);
		if (areaOrder !== 0) return areaOrder;
		const ruleOrder = byteCompare(left.rule, right.rule);
		if (ruleOrder !== 0) return ruleOrder;
		const locationOrder = byteCompare(JSON.stringify(left.selectors), JSON.stringify(right.selectors));
		if (locationOrder !== 0) return locationOrder;
		return byteCompare(left.id, right.id);
	});

	const report = {
		version: CLEANER_AUDIT_REPORT_VERSION,
		mode: "read-only",
		findings,
		appliedChanges: 0,
		noChangeStatement: "No changes were applied.",
	};
	return protectImmutable(deepFreeze(report)) as CleanerAuditReportV1;
}
