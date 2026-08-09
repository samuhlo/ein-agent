import { describe, expect, test } from "bun:test";
import type {
	ProjectRuntimeState,
	ProjectStateQuality,
	ProjectStateReasonCode,
	ProjectStateV1,
} from "../ein-pi/agent/lib/project-state.ts";
import {
	canonicalArea,
	type Area,
	type EvidenceResolution,
	type LedgerEvaluation,
} from "../ein-pi/agent/lib/reviewed-area-ledger.ts";
import { auditCleanerReadOnly } from "../ein-pi/agent/lib/cleaner-read-only-audit.ts";

const STATE_REF = `git-v1:sha256:${"a".repeat(64)}`;
const OTHER_STATE_REF = `git-v1:sha256:${"b".repeat(64)}`;
const EVIDENCE_REFERENCE = `review-evidence-v1:${"1".repeat(32)}`;
const EVIDENCE_DIGEST = `sha256:${"2".repeat(64)}`;
const REVIEWER_REFERENCE = `reviewer-v1:sha256:${"3".repeat(64)}`;
const AUDIT_RULE = "reviewed-area-assessment";
const CLASSIFICATIONS = new Set(["observed-fact", "inferred-opportunity", "unresolved-question"]);
const SEVERITIES = new Set(["info", "warning", "error"]);
const CONFIDENCES = new Set(["high", "medium", "low"]);

type GOwnedAssessment = Readonly<{
	area: Area;
	evaluation: LedgerEvaluation;
	evidence: EvidenceResolution;
}>;

type AuditInput = Readonly<{
	state: ProjectStateV1;
	assessments: readonly GOwnedAssessment[];
}>;

function runtime(provider: "pi" | "claude"): ProjectRuntimeState {
	return {
		provider,
		availability: "not-provided",
		quality: "unavailable",
		reason: "not-provided",
		capabilities: [],
		references: [],
		errors: [],
	};
}

function projectState(options: Readonly<{
	gitQuality?: ProjectStateQuality;
	gitReason?: ProjectStateReasonCode;
	gitComplete?: boolean;
	repository?: boolean | null;
	stateRef?: string | null;
}> = {}): ProjectStateV1 {
	const stateRef = options.stateRef === undefined ? STATE_REF : options.stateRef;
	return {
		schemaVersion: 1,
		identity: {
			quality: options.gitQuality ?? "current",
			reason: options.gitReason ?? "read-success",
			cwd: "fixture-cwd",
		},
		openspec: {
			quality: "current",
			reason: "read-success",
			activeChanges: [],
			selection: "none",
			provenance: "none",
			artifacts: [],
			blockers: [],
			verify: "absent",
			verifyStale: false,
		},
		ein: {
			quality: "current",
			reason: "read-success",
			path: "fixture-ein",
			curated: { present: false, complete: false },
			auto: { present: false },
		},
		git: {
			quality: options.gitQuality ?? "current",
			reason: options.gitReason ?? "read-success",
			repository: options.repository ?? true,
			dirty: false,
			complete: options.gitComplete ?? true,
			changes: [],
			...(stateRef === null ? {} : { stateRef }),
		},
		verification: {
			quality: "absent",
			reason: "not-found",
			reportedOutcome: "absent",
			effectiveOutcome: "absent",
			freshness: "unavailable",
		},
		runtimes: {
			pi: runtime("pi"),
			claude: runtime("claude"),
		},
	};
}

function area(...selectors: Array<{ kind: "file" | "tree"; path: string }>): Area {
	return canonicalArea(selectors);
}

function evaluation(overrides: Partial<LedgerEvaluation> = {}): LedgerEvaluation {
	return {
		outcome: "reviewed",
		freshness: "current",
		reason: "exact-git-binding",
		...overrides,
	};
}

function verifiedEvidence(areaId: string, stateRef = STATE_REF): EvidenceResolution {
	return {
		status: "verified",
		reference: EVIDENCE_REFERENCE,
		digest: EVIDENCE_DIGEST,
		reviewerRef: REVIEWER_REFERENCE,
		areaId,
		stateRef,
	};
}

function assessment(
	areaValue: Area,
	evaluationValue: LedgerEvaluation,
	evidence: EvidenceResolution,
): GOwnedAssessment {
	return { area: areaValue, evaluation: evaluationValue, evidence };
}

function currentInput(): AuditInput {
	const source = area(
		{ kind: "tree", path: "src" },
		{ kind: "file", path: "README.md" },
	);
	const docs = area({ kind: "tree", path: "docs" });
	return {
		state: projectState(),
		assessments: [
			assessment(source, evaluation(), verifiedEvidence(source.id)),
			assessment(
				docs,
				evaluation({ outcome: "unreviewed", freshness: "unknown", reason: "no-record" }),
				{ status: "missing" },
			),
		],
	};
}

function deepFrozen(value: unknown): boolean {
	if (!value || typeof value !== "object") return true;
	if (!Object.isFrozen(value)) return false;
	return Object.values(value as Record<string, unknown>).every(deepFrozen);
}

describe("cleaner read-only audit contract", () => {
	test("returns a versioned read-only report with traceable opaque findings", () => {
		const input = currentInput();
		const report = auditCleanerReadOnly(input);

		expect(report).toMatchObject({
			version: "cleaner-audit-report/v1",
			mode: "read-only",
			appliedChanges: 0,
			noChangeStatement: expect.stringMatching(/no changes? (were )?applied/i),
		});
		expect(Array.isArray(report.findings)).toBe(true);
		expect(report.findings).toHaveLength(input.assessments.length);
		expect(report.findings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
			expect.stringMatching(/^cleaner-finding-v1:sha256:[0-9a-f]{64}$/),
		]));
		expect(new Set(report.findings.map((finding) => finding.id)).size).toBe(report.findings.length);

		for (const finding of report.findings) {
			const source = input.assessments.find((candidate) => candidate.area.id === finding.areaId);
			expect(source).toBeDefined();
			if (!source) continue;

			expect(finding).toMatchObject({
				rule: AUDIT_RULE,
				classification: expect.any(String),
				severity: expect.any(String),
				areaId: source.area.id,
				selectors: source.area.selectors,
				g: {
					outcome: source.evaluation.outcome,
					freshness: source.evaluation.freshness,
					reason: source.evaluation.reason,
				},
				evidence: { status: source.evidence.status },
				confidence: expect.any(String),
				uncertainty: expect.any(String),
				applied: false,
			});
			expect(CLASSIFICATIONS.has(finding.classification)).toBe(true);
			expect(SEVERITIES.has(finding.severity)).toBe(true);
			expect(CONFIDENCES.has(finding.confidence)).toBe(true);
			expect(finding.id).toMatch(/^cleaner-finding-v1:sha256:[0-9a-f]{64}$/);
			expect(JSON.stringify(finding)).not.toContain(REVIEWER_REFERENCE);
			expect(JSON.stringify(finding)).not.toMatch(/prompt|transcript|secret|fixture-cwd/i);
	}
	});

	test("preserves the exact B state identity and G evidence reference without exposing reviewer data", () => {
		const input = currentInput();
		const report = auditCleanerReadOnly(input);
		const current = report.findings.find((finding) => finding.areaId === input.assessments[0]!.area.id);
		const missing = report.findings.find((finding) => finding.areaId === input.assessments[1]!.area.id);

		expect(current).toMatchObject({
			state: { status: "current", stateRef: STATE_REF },
			evidence: { status: "verified", reference: EVIDENCE_REFERENCE, digest: EVIDENCE_DIGEST },
		});
		expect(current?.evidence).not.toHaveProperty("reviewerRef");
		expect(missing).toMatchObject({
			state: { status: "current", stateRef: STATE_REF },
			evidence: { status: "missing" },
		});
		expect(missing?.evidence).not.toHaveProperty("reference");
		expect(missing?.evidence).not.toHaveProperty("digest");
	});

	test("keeps stale, invalid, unavailable, unknown, and missing state/evidence unresolved", () => {
		const source = area({ kind: "file", path: "src/entry.ts" });
		const cases: readonly Readonly<{
			name: string;
			input: AuditInput;
			reason: LedgerEvaluation["reason"];
		}>[] = [
			{
				name: "stale review",
				input: {
					state: projectState(),
					assessments: [assessment(source, evaluation({ outcome: "stale", freshness: "stale", reason: "relevant-git-change", observedStateRef: OTHER_STATE_REF }), verifiedEvidence(source.id))],
				},
				reason: "relevant-git-change",
			},
			{
				name: "invalid evidence",
				input: {
					state: projectState(),
					assessments: [assessment(source, evaluation({ outcome: "invalid", freshness: "invalid", reason: "invalid-evidence" }), { status: "invalid" })],
				},
				reason: "invalid-evidence",
			},
			{
				name: "unavailable evidence",
				input: {
					state: projectState(),
					assessments: [assessment(source, evaluation({ outcome: "unavailable", freshness: "unavailable", reason: "evidence-unavailable" }), { status: "unavailable" })],
				},
				reason: "evidence-unavailable",
			},
			{
				name: "unknown evidence",
				input: {
					state: projectState(),
					assessments: [assessment(source, evaluation({ outcome: "unknown", freshness: "unknown", reason: "evidence-mismatch", observedStateRef: OTHER_STATE_REF }), { status: "mismatch" })],
				},
				reason: "evidence-mismatch",
			},
			{
				name: "missing state identity",
				input: {
					state: projectState({ stateRef: null, gitComplete: false, gitQuality: "incomplete", gitReason: "incomplete-source" }),
					assessments: [assessment(source, evaluation(), { status: "missing" })],
				},
				reason: "exact-git-binding",
			},
			{
				name: "unavailable state",
				input: {
					state: projectState({ stateRef: null, gitComplete: false, gitQuality: "unavailable", gitReason: "read-error", repository: null }),
					assessments: [assessment(source, evaluation(), { status: "unavailable" })],
				},
				reason: "exact-git-binding",
			},
		];

		for (const candidate of cases) {
			const report = auditCleanerReadOnly(candidate.input);
			expect(report.findings).toHaveLength(1);
			const finding = report.findings[0]!;
			expect(finding.classification).toBe("unresolved-question");
			expect(finding.applied).toBe(false);
			expect(finding.g.reason).toBe(candidate.reason);
			expect(finding.uncertainty).toContain(candidate.reason);
			if (candidate.name.includes("state")) {
				expect(finding.state.status).not.toBe("current");
				expect(finding.state).not.toHaveProperty("stateRef");
			}
		}
	});

	test("is deterministic for reordered assessments and canonical selector input", () => {
		const source = area(
			{ kind: "tree", path: "src" },
			{ kind: "file", path: "README.md" },
		);
		const equivalentSource = area(
			{ kind: "file", path: "README.md" },
			{ kind: "tree", path: "src" },
		);
		const docs = area({ kind: "tree", path: "docs" });
		const first: AuditInput = {
			state: projectState(),
			assessments: [
				assessment(source, evaluation(), verifiedEvidence(source.id)),
				assessment(docs, evaluation({ outcome: "unreviewed", freshness: "unknown", reason: "no-record" }), { status: "missing" }),
			],
		};
		const reordered: AuditInput = {
			state: projectState(),
			assessments: [
				assessment(docs, evaluation({ outcome: "unreviewed", freshness: "unknown", reason: "no-record" }), { status: "missing" }),
				assessment(equivalentSource, evaluation(), verifiedEvidence(equivalentSource.id)),
			],
		};

		const firstReport = auditCleanerReadOnly(first);
		const reorderedReport = auditCleanerReadOnly(reordered);
		expect(reorderedReport).toEqual(firstReport);
		expect(reorderedReport.findings.map((finding) => finding.id)).toEqual(firstReport.findings.map((finding) => finding.id));
	});

	test("deeply freezes the report and exposes no apply capability", () => {
		const report = auditCleanerReadOnly(currentInput());
		expect(deepFrozen(report)).toBe(true);
		expect(report).not.toHaveProperty("apply");
		expect(report).not.toHaveProperty("write");
		expect(report).not.toHaveProperty("mutate");
	});

	test("rejects or makes untyped mutation intent unreachable", () => {
		let callbackCalls = 0;
		const candidate = {
			...currentInput(),
			apply: () => {
				callbackCalls += 1;
			},
			writer: { write: () => { callbackCalls += 1; } },
		};
		try {
			const report = auditCleanerReadOnly(candidate as never);
			expect(callbackCalls).toBe(0);
			expect(report).toMatchObject({ mode: "read-only", appliedChanges: 0 });
			expect(report).not.toHaveProperty("apply");
			expect(report).not.toHaveProperty("writer");
		} catch {
			// Rejecting an untyped capability-bearing value is also fail-closed.
			expect(callbackCalls).toBe(0);
		}
	});

	test("keeps B/G and repository/external observer snapshots unchanged while mutation intent stays unreachable", () => {
		const input = currentInput();
		const observers = {
			repository: {
				files: { "src/entry.ts": "source bytes" },
				ledger: '{"schemaVersion":1,"records":[]}\\n',
				sdd: { "tasks.md": "- [x] audit", "verify-report.md": "pass" },
				git: { head: STATE_REF, index: "unchanged" },
			},
			external: { writes: 0, requests: 0 },
		};
		const before = structuredClone({ input, observers });
		const mutation = () => {
			observers.external.writes += 1;
			observers.external.requests += 1;
		};
		const assessments = Object.assign([...input.assessments], {
			map: () => {
				mutation();
				return [];
			},
		});
		const candidate = {
			state: input.state,
			assessments,
			apply: mutation,
			writer: { write: mutation },
		};

		const report = auditCleanerReadOnly(candidate as never);

		expect(report).toMatchObject({ mode: "read-only", appliedChanges: 0 });
		expect(report.findings).toHaveLength(input.assessments.length);
		expect(report).not.toHaveProperty("apply");
		expect(report).not.toHaveProperty("writer");
		expect(input).toEqual(before.input);
		expect(observers).toEqual(before.observers);
	});
});
