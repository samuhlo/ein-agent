import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import type { CleanerFindingV1 } from "../ein-pi/agent/lib/cleaner-read-only-audit.ts";
import {
	admitCleanerBoundedMutation,
	applyCleanerBoundedMutation,
	assessCleanerCompletion,
	CLEANER_BOUNDED_MUTATION_VERSION,
	CLEANER_MUTATION_REASON_CODES,
	type CleanerBoundedMutationRequestV1,
	type CleanerCompletionAdaptersV1,
	type CleanerEvidenceInvalidationRecordV1,
	type CleanerMutationAdaptersV1,
	type CleanerMutationDeclarationV1,
	type CleanerMutationOutcomeV1,
	type CleanerStateTransitionRecordV1,
	type CleanerVerificationRecordV1,
} from "../ein-pi/agent/lib/cleaner-bounded-mutations.ts";

const STATE_A = `git-v1:sha256:${"a".repeat(64)}`;
const STATE_B = `git-v1:sha256:${"b".repeat(64)}`;
const DIGEST_A = `sha256:${"c".repeat(64)}`;
const DIGEST_B = `sha256:${"d".repeat(64)}`;
const FINDING_ID = `cleaner-finding-v1:sha256:${"e".repeat(64)}`;
const AREA_ID = `area-v1:sha256:${"f".repeat(64)}`;
const ACTOR_REF = `actor-v1:sha256:${"1".repeat(64)}`;
const REVIEWER_REF = `reviewer-v1:sha256:${"2".repeat(64)}`;

const finding = {
	id: FINDING_ID,
	rule: "reviewed-area-assessment",
	classification: "observed-fact",
	severity: "info",
	confidence: "high",
	areaId: AREA_ID,
	selectors: [{ kind: "file", path: "src/entry.ts" }],
	state: { status: "current", stateRef: STATE_A, quality: "current", reason: "read-success" },
	g: { outcome: "reviewed", freshness: "current", reason: "exact-git-binding" },
	evidence: {
		status: "verified",
		reference: `review-evidence-v1:${"3".repeat(32)}`,
		digest: DIGEST_A,
	},
	uncertainty: "none",
	applied: false,
} satisfies CleanerFindingV1;

const declaration = {
	version: "cleaner-declaration-v1",
	changeId: "cleaner-bounded-mutations",
	phase: "apply",
	areaId: AREA_ID,
	targetPath: "src/entry.ts",
	affectedSeam: "entry-cleanup",
	operation: { kind: "exact-replacement", before: "old", after: "new" },
	actorRef: ACTOR_REF,
	reviewerRef: REVIEWER_REF,
	behaviorPreserved: true,
	expected: {
		stateRef: STATE_A,
		beforeDigest: DIGEST_A,
		afterDigest: DIGEST_B,
	},
	verification: {
		commands: ["bun test tests/cleaner-bounded-mutations.test.ts -t contract shape"],
	},
} satisfies CleanerMutationDeclarationV1;

const request = {
	version: CLEANER_BOUNDED_MUTATION_VERSION,
	findingId: FINDING_ID,
	declaration,
} satisfies CleanerBoundedMutationRequestV1;

const transition = {
	version: "cleaner-state-transition-v1",
	findingId: FINDING_ID,
	areaId: AREA_ID,
	targetPath: "src/entry.ts",
	observedStateRef: STATE_A,
	resultingStateRef: STATE_B,
	beforeDigest: DIGEST_A,
	afterDigest: DIGEST_B,
} satisfies CleanerStateTransitionRecordV1;

const invalidation = {
	version: "cleaner-evidence-invalidation-v1",
	observedStateRef: STATE_A,
	resultingStateRef: STATE_B,
	findingId: FINDING_ID,
	audit: "stale",
	verification: "stale",
	reason: "code-state-changed",
} satisfies CleanerEvidenceInvalidationRecordV1;

const verification = {
	version: "cleaner-verification-record-v1",
	outcome: "passed",
	actorRef: ACTOR_REF,
	commands: ["bun test tests/cleaner-bounded-mutations.test.ts -t contract shape"],
	stateRef: STATE_B,
} satisfies CleanerVerificationRecordV1;

const adapters = {
	projectState: { project: () => ({ stateRef: STATE_A, complete: true, conflicted: false }) },
	finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
	target: { read: (_path: string) => ({ bytes: new Uint8Array([111, 108, 100]), digest: DIGEST_A }) },
	writer: { write: (_path: string, _bytes: Uint8Array) => undefined },
} satisfies CleanerMutationAdaptersV1;

const outcomes: readonly CleanerMutationOutcomeV1[] = [
	{ status: "blocked", reason: "precondition-changed" },
	{ status: "verification-required", reason: "verification-required", transition, invalidation },
	{ status: "mutation-uncertain", reason: "writer-failed", transition, invalidation },
];

describe("cleaner bounded mutation contract shape", () => {
	test("defines one immutable request, declaration, operation, and writer boundary", () => {
		expect(CLEANER_BOUNDED_MUTATION_VERSION).toBe("cleaner-bounded-mutation/v1");
		expect(request.findingId).toBe(FINDING_ID);
		expect(request.declaration.targetPath).toBe("src/entry.ts");
		expect(request.declaration.operation.kind).toBe("exact-replacement");
		// `satisfies` exercises the readonly public types at compile time; runtime
		// freezing belongs to the later application implementation, not this shape slice.
		expect(Object.keys(request)).not.toContain("findings");
		expect(Object.keys(request)).not.toContain("targets");
		expect(Object.keys(adapters)).not.toContain("writers");
	});

	test("exposes stable reason codes and discriminated outcomes", () => {
		expect(CLEANER_MUTATION_REASON_CODES).toEqual(expect.arrayContaining([
			"precondition-changed",
			"writer-failed",
			"verification-required",
			"code-state-changed",
		]));
		expect(new Set(CLEANER_MUTATION_REASON_CODES).size).toBe(CLEANER_MUTATION_REASON_CODES.length);
		expect(outcomes.map((outcome) => outcome.status)).toEqual([
			"blocked",
			"verification-required",
			"mutation-uncertain",
		]);
	});

	test("records the state transition, conservative invalidation, and attributable verification", () => {
		expect(transition).toMatchObject({
			observedStateRef: STATE_A,
			resultingStateRef: STATE_B,
			findingId: FINDING_ID,
		});
		expect(invalidation).toMatchObject({
			observedStateRef: STATE_A,
			resultingStateRef: STATE_B,
			audit: "stale",
			verification: "stale",
		});
		expect(verification).toMatchObject({ outcome: "passed", stateRef: STATE_B, actorRef: ACTOR_REF });
		expect(verification.commands).toHaveLength(1);
	});
});

function digest(bytes: Uint8Array): string {
	return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

type AdmissionProject = CleanerMutationAdaptersV1["projectState"]["project"];
type AdmissionResolverResult = CleanerFindingV1 | readonly CleanerFindingV1[] | null;

type AdmissionOverrides = Readonly<{
	finding?: AdmissionResolverResult;
	declaration?: Partial<Omit<CleanerMutationDeclarationV1, "expected" | "operation">> & Readonly<{
		expected?: Partial<CleanerMutationDeclarationV1["expected"]>;
		operation?: unknown;
	}>;
	targetPath?: string;
	target?: Readonly<{ bytes?: Uint8Array; digest?: string; kind?: string }>;
	targetReader?: CleanerMutationAdaptersV1["target"]["read"];
	project?: AdmissionProject;
	request?: unknown;
}>;

function admissionFixture(overrides: AdmissionOverrides = {}) {
	const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
	const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
	const operation = {
		kind: "exact-replacement" as const,
		before: "old",
		after: "new",
	};
	const expected = {
		stateRef: STATE_A,
		beforeDigest: digest(beforeBytes),
		afterDigest: digest(afterBytes),
		...overrides.declaration?.expected,
	};
	const baseDeclaration = {
		...declaration,
		targetPath: overrides.targetPath ?? declaration.targetPath,
		operation,
		expected,
	};
	const declared = overrides.declaration ? { ...baseDeclaration, ...overrides.declaration, expected } : baseDeclaration;
	const baseRequest = { ...request, declaration: declared };
	const requestValue = (overrides.request ?? baseRequest) as CleanerBoundedMutationRequestV1;
	const target = {
		bytes: beforeBytes,
		digest: digest(beforeBytes),
		kind: "regular",
		...overrides.target,
	};
	let writerCalls = 0;
	const adapters = {
		projectState: { project: overrides.project ?? (() => ({ stateRef: STATE_A, complete: true, conflicted: false })) },
		finding: { resolve: (_findingId: string) => overrides.finding === undefined ? finding : overrides.finding },
		target: { read: overrides.targetReader ?? ((_targetPath: string) => target) },
		writer: { write: (_targetPath: string, _bytes: Uint8Array) => { writerCalls += 1; } },
	} as CleanerMutationAdaptersV1;
	return { request: requestValue, adapters, get writerCalls() { return writerCalls; }, beforeBytes, afterBytes };
}

describe("cleaner bounded mutation admission", () => {
	test("admits one fresh exact replacement without invoking the writer", () => {
		const fixture = admissionFixture();
		const result = admitCleanerBoundedMutation(fixture.request, fixture.adapters);
		expect(result.status).toBe("admitted");
		if (result.status !== "admitted") return;
		expect(result.targetPath).toBe("src/entry.ts");
		expect(result.beforeDigest).toBe(digest(fixture.beforeBytes));
		expect(result.afterDigest).toBe(digest(fixture.afterBytes));
		expect(new TextDecoder("utf-8", { fatal: true }).decode(result.bytes)).toBe("prefix new suffix\\n");
		expect(fixture.writerCalls).toBe(0);
	});

	test("denies unknown, duplicate, stale, unresolved, and non-current authority evidence", () => {
		const cases: readonly [string, AdmissionOverrides, string][] = [
			["unknown finding", { finding: null }, "finding-not-found"],
			["duplicate finding", { finding: [finding, finding] }, "finding-selection-ambiguous"],
			["stale finding", { finding: { ...finding, state: { ...finding.state, stateRef: STATE_B } } }, "state-stale"],
			["unresolved finding", { finding: { ...finding, classification: "unresolved-question", confidence: "low" } as CleanerFindingV1 }, "finding-unresolved"],
			["stale G evidence", { finding: { ...finding, g: { ...finding.g, freshness: "stale" } } as CleanerFindingV1 }, "evidence-stale"],
			["unverified evidence", { finding: { ...finding, evidence: { status: "unavailable" } } as CleanerFindingV1 }, "evidence-unavailable"],
		];
		for (const [label, overrides, reason] of cases) {
			const fixture = admissionFixture(overrides);
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("denies unavailable, invalid, incomplete, conflicted, and changed B state", () => {
		const cases: readonly [string, AdmissionProject, string][] = [
			["unavailable state", () => { throw new Error("state unavailable"); }, "state-unavailable"],
			["invalid state", () => ({ stateRef: "invalid", complete: true, conflicted: false }), "state-invalid"],
			["incomplete repository", () => ({ stateRef: STATE_A, complete: false, conflicted: false }), "repository-incomplete"],
			["conflicted repository", () => ({ stateRef: STATE_A, complete: true, conflicted: true }), "repository-conflicted"],
			["stale B state", () => ({ stateRef: STATE_B, complete: true, conflicted: false }), "state-stale"],
		];
		for (const [label, project, reason] of cases) {
			const fixture = admissionFixture({ project });
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("denies missing attribution, ambiguous changes, unpreserved behavior, and unavailable verification declarations", () => {
		const cases: readonly [string, AdmissionOverrides, string][] = [
			["missing actor", { declaration: { actorRef: "" } }, "evidence-invalid"],
			["missing reviewer", { declaration: { reviewerRef: "" } }, "evidence-invalid"],
			["ambiguous change", { declaration: { changeId: "change-a,change-b" } }, "change-ambiguous"],
			["behavior not attested", { declaration: { behaviorPreserved: false as never } }, "ownership-invalid"],
			["no verification commands", { declaration: { verification: { commands: [] } as never } }, "evidence-invalid"],
		];
		for (const [label, overrides, reason] of cases) {
			const fixture = admissionFixture(overrides);
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("denies non-canonical, out-of-area, private/runtime, symlink, and non-regular targets", () => {
		const cases: readonly [string, AdmissionOverrides, string][] = [
			["traversal", { targetPath: "src/../entry.ts" }, "target-invalid"],
			["absolute", { targetPath: "/src/entry.ts" }, "target-invalid"],
			["out of area", { targetPath: "other/entry.ts" }, "target-out-of-area"],
			["runtime", { targetPath: "src/runtime/entry.ts", finding: { ...finding, selectors: [{ kind: "tree", path: "src" }] } as CleanerFindingV1 }, "ownership-invalid"],
			["symlink", { target: { kind: "symlink" } }, "target-symlink"],
			["directory", { target: { kind: "directory" } }, "target-not-regular"],
		];
		for (const [label, overrides, reason] of cases) {
			const fixture = admissionFixture(overrides);
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("denies invalid UTF-8, digest drift, no-op, missing, and ambiguous replacements", () => {
		const invalidUtf8 = new Uint8Array([0xc3, 0x28]);
		const cases: readonly [string, AdmissionOverrides, string][] = [
			["invalid UTF-8", { target: { bytes: invalidUtf8, digest: digest(invalidUtf8) } }, "target-invalid"],
			["digest drift", { target: { digest: DIGEST_A } }, "digest-mismatch"],
			["no-op", { declaration: { operation: { kind: "exact-replacement", before: "old", after: "old" } } }, "operation-no-op"],
			["missing replacement", { declaration: { operation: { kind: "exact-replacement", before: "missing", after: "new" } } }, "replacement-not-found"],
			["ambiguous replacement", { target: { bytes: new TextEncoder().encode("old old"), digest: digest(new TextEncoder().encode("old old")) }, declaration: { expected: { beforeDigest: digest(new TextEncoder().encode("old old")) } } }, "replacement-ambiguous"],
		];
		for (const [label, overrides, reason] of cases) {
			const fixture = admissionFixture(overrides);
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("denies unsupported operation shapes and over-budget replacements", () => {
		const operation = { kind: "generic-patch", patch: "@@" };
		const overBudgetBefore = "x\n".repeat(401);
		const overBudgetAfter = "y\n".repeat(401);
		const overBudgetTarget = new TextEncoder().encode(overBudgetBefore);
		const overBudgetResult = new TextEncoder().encode(overBudgetAfter);
		const cases: readonly [string, AdmissionOverrides, string][] = [
			["unsupported operation", { declaration: { operation } }, "operation-unsupported"],
			["over budget", { target: { bytes: overBudgetTarget, digest: digest(overBudgetTarget) }, declaration: { operation: { kind: "exact-replacement", before: overBudgetBefore, after: overBudgetAfter }, expected: { beforeDigest: digest(overBudgetTarget), afterDigest: digest(overBudgetResult) } } }, "operation-over-budget"],
		];
		for (const [label, overrides, reason] of cases) {
			const fixture = admissionFixture(overrides);
			expect(admitCleanerBoundedMutation(fixture.request, fixture.adapters), label).toMatchObject({ status: "blocked", reason });
			expect(fixture.writerCalls, label).toBe(0);
		}
	});

	test("rejects a final target-content precondition race before any writer can run", () => {
		let targetCalls = 0;
		const initialBytes = new TextEncoder().encode("prefix old suffix\\n");
		const changedBytes = new TextEncoder().encode("prefix changed suffix\\n");
		const fixture = admissionFixture({ targetReader: () => {
			targetCalls += 1;
			return targetCalls === 1
				? { bytes: initialBytes, digest: digest(initialBytes), kind: "regular" }
				: { bytes: changedBytes, digest: digest(changedBytes), kind: "regular" };
		} });
		const result = admitCleanerBoundedMutation(fixture.request, fixture.adapters);
		expect(result).toMatchObject({ status: "blocked", reason: "precondition-changed" });
		expect(fixture.writerCalls).toBe(0);
		expect(targetCalls).toBe(2);
	});

	test("rejects a final B precondition race before any writer can run", () => {
		let projectCalls = 0;
		const fixture = admissionFixture({ project: () => {
			projectCalls += 1;
			return { stateRef: projectCalls === 1 ? STATE_A : STATE_B, complete: true, conflicted: false };
		} });
		const result = admitCleanerBoundedMutation(fixture.request, fixture.adapters);
		expect(result).toMatchObject({ status: "blocked", reason: "precondition-changed" });
		expect(fixture.writerCalls).toBe(0);
		expect(projectCalls).toBe(2);
	});

	test("rejects architect-labelled seams at runtime before any writer can run", () => {
		const fixture = admissionFixture({ declaration: { affectedSeam: "architect-refactor" } });
		const result = applyCleanerBoundedMutation(fixture.request, fixture.adapters);
		expect(result).toMatchObject({ status: "blocked", reason: "ownership-invalid" });
		expect(fixture.writerCalls).toBe(0);
	});

	test("rejects extra fields: collection-shaped findings and writers at runtime", () => {
		const fixture = admissionFixture();
		const requestWithFindings = {
			...fixture.request,
			findings: [finding],
		} as unknown as CleanerBoundedMutationRequestV1;
		const requestResult = applyCleanerBoundedMutation(requestWithFindings, fixture.adapters);
		expect(requestResult).toMatchObject({ status: "blocked", reason: "operation-unsupported" });
		expect(fixture.writerCalls).toBe(0);

		const adaptersWithWriters = {
			...fixture.adapters,
			writers: [fixture.adapters.writer],
		} as unknown as CleanerMutationAdaptersV1;
		const adaptersResult = applyCleanerBoundedMutation(fixture.request, adaptersWithWriters);
		expect(adaptersResult).toMatchObject({ status: "blocked", reason: "operation-unsupported" });
		expect(fixture.writerCalls).toBe(0);
	});
});

describe("cleaner bounded mutation transition", () => {
	test("single write records before/after state and invalidation", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let currentState = STATE_A;
		let writerCalls = 0;
		let writtenPath = "";
		let writtenBytes = new Uint8Array();
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: {
					stateRef: STATE_A,
					beforeDigest: digest(beforeBytes),
					afterDigest: digest(afterBytes),
				},
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => ({ stateRef: currentState, complete: true, conflicted: false }) },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const }) },
			writer: { write: (targetPath: string, bytes: Readonly<Uint8Array>) => {
				writerCalls += 1;
				writtenPath = targetPath;
				writtenBytes = new Uint8Array(bytes);
				currentBytes = new Uint8Array(bytes);
				currentState = STATE_B;
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result.status).toBe("verification-required");
		if (result.status !== "verification-required") return;
		expect(writerCalls).toBe(1);
		expect(writtenPath).toBe("src/entry.ts");
		expect(writtenBytes).toEqual(afterBytes);
		expect(result.transition).toMatchObject({
			observedStateRef: STATE_A,
			resultingStateRef: STATE_B,
			beforeDigest: digest(beforeBytes),
			afterDigest: digest(afterBytes),
		});
		expect(result.invalidation).toMatchObject({
			observedStateRef: STATE_A,
			resultingStateRef: STATE_B,
			audit: "stale",
			verification: "stale",
			reason: "code-state-changed",
		});
	});

	test("writer failure returns mutation-uncertain after one invocation", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let writerCalls = 0;
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: {
					stateRef: STATE_A,
					beforeDigest: digest(beforeBytes),
					afterDigest: digest(new TextEncoder().encode("prefix new suffix\\n")),
				},
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => ({ stateRef: STATE_A, complete: true, conflicted: false }) },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const }) },
			writer: { write: () => {
				writerCalls += 1;
				throw new Error("writer failed");
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result.status).toBe("mutation-uncertain");
		if (result.status !== "mutation-uncertain") return;
		expect(result.reason).toBe("writer-failed");
		expect(writerCalls).toBe(1);
		expect(result.transition.observedStateRef).toBe(STATE_A);
		expect(result.transition.resultingStateRef).toBe(STATE_A);
		expect(result.invalidation.audit).toBe("invalid");
		expect(result.invalidation.verification).toBe("invalid");
		expect(currentBytes).toEqual(beforeBytes);
	});

	test("uncertain writer outcome never retries or rolls back", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let writerCalls = 0;
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: {
					stateRef: STATE_A,
					beforeDigest: digest(beforeBytes),
					afterDigest: digest(afterBytes),
				},
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => ({ stateRef: STATE_A, complete: true, conflicted: false }) },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const }) },
			writer: { write: (_targetPath: string, bytes: Readonly<Uint8Array>) => {
				writerCalls += 1;
				currentBytes = new Uint8Array(bytes);
				throw new Error("indeterminate write");
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result.status).toBe("mutation-uncertain");
		expect(writerCalls).toBe(1);
		expect(currentBytes).toEqual(afterBytes);
	});

	test("uncertain post-state failure is reported without a second write", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let projectCalls = 0;
		let writerCalls = 0;
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: { stateRef: STATE_A, beforeDigest: digest(beforeBytes), afterDigest: digest(afterBytes) },
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => {
				projectCalls += 1;
				if (projectCalls > 2) throw new Error("post-state unavailable");
				return { stateRef: STATE_A, complete: true, conflicted: false };
			} },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const }) },
			writer: { write: (_targetPath: string, bytes: Readonly<Uint8Array>) => {
				writerCalls += 1;
				currentBytes = new Uint8Array(bytes);
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result).toMatchObject({ status: "mutation-uncertain", reason: "post-state-unavailable" });
		expect(writerCalls).toBe(1);
	});

	test("writer digest anomaly is mutation-uncertain with no retry", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let currentState = STATE_A;
		let projectCalls = 0;
		let targetCalls = 0;
		let writerCalls = 0;
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: { stateRef: STATE_A, beforeDigest: digest(beforeBytes), afterDigest: digest(afterBytes) },
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => {
				projectCalls += 1;
				return { stateRef: projectCalls > 2 ? STATE_B : currentState, complete: true, conflicted: false };
			} },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => {
				targetCalls += 1;
				return targetCalls > 2
					? { bytes: new Uint8Array(currentBytes), digest: DIGEST_A, kind: "regular" as const }
					: { bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const };
			} },
			writer: { write: (_targetPath: string, bytes: Readonly<Uint8Array>) => {
				writerCalls += 1;
				currentBytes = new Uint8Array(bytes);
				currentState = STATE_B;
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result).toMatchObject({ status: "mutation-uncertain", reason: "post-content-mismatch" });
		expect(writerCalls).toBe(1);
	});

	test("uncertain unchanged state after changed bytes is never retried or rolled back", () => {
		const beforeBytes = new TextEncoder().encode("prefix old suffix\\n");
		const afterBytes = new TextEncoder().encode("prefix new suffix\\n");
		let currentBytes = new Uint8Array(beforeBytes);
		let writerCalls = 0;
		const mutationRequest = {
			...request,
			declaration: {
				...declaration,
				expected: { stateRef: STATE_A, beforeDigest: digest(beforeBytes), afterDigest: digest(afterBytes) },
			},
		} satisfies CleanerBoundedMutationRequestV1;
		const mutationAdapters = {
			projectState: { project: () => ({ stateRef: STATE_A, complete: true, conflicted: false }) },
			finding: { resolve: (findingId: string) => findingId === FINDING_ID ? finding : null },
			target: { read: () => ({ bytes: new Uint8Array(currentBytes), digest: digest(currentBytes), kind: "regular" as const }) },
			writer: { write: (_targetPath: string, bytes: Readonly<Uint8Array>) => {
				writerCalls += 1;
				currentBytes = new Uint8Array(bytes);
			} },
		} satisfies CleanerMutationAdaptersV1;

		const result = applyCleanerBoundedMutation(mutationRequest, mutationAdapters);

		expect(result).toMatchObject({ status: "mutation-uncertain", reason: "post-state-mismatch" });
		expect(writerCalls).toBe(1);
		expect(currentBytes).toEqual(afterBytes);
	});
});

type CompletionOverrides = Readonly<{
	project?: CleanerCompletionAdaptersV1["projectState"]["project"];
	router?: CleanerCompletionAdaptersV1["router"]["verification"];
	verification?: CleanerVerificationRecordV1 | null;
}>;

function completionFixture(overrides: CompletionOverrides = {}) {
	const adapters: CleanerCompletionAdaptersV1 = {
		projectState: {
			project: overrides.project ?? (() => ({ stateRef: STATE_B, complete: true, conflicted: false })),
		},
		router: {
			verification: overrides.router ?? (() => ({ outcome: "pass", stale: false })),
		},
	};
	return {
		adapters,
		verification: overrides.verification === undefined ? verification : overrides.verification,
	};
}

describe("cleaner bounded mutation completion", () => {
	test("completes only with exact resulting B state, fresh router pass, and attributable evidence", () => {
		const fixture = completionFixture();
		const result = assessCleanerCompletion(transition, fixture.verification, fixture.adapters);

		expect(result).toMatchObject({ status: "complete", reason: "verification-passed" });
		if (result.status !== "complete") return;
		expect(result.verification).toMatchObject({
			outcome: "passed",
			actorRef: ACTOR_REF,
			commands: declaration.verification.commands,
			stateRef: STATE_B,
		});
	});

	test("requires verification when evidence is missing or the router is unavailable", () => {
		const missing = completionFixture({ verification: null });
		expect(assessCleanerCompletion(transition, missing.verification, missing.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-required",
		});

		const unavailable = completionFixture({ router: () => { throw new Error("router unavailable"); } });
		expect(assessCleanerCompletion(transition, unavailable.verification, unavailable.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-unavailable",
		});
	});

	test("rejects stale router verification even when the report says pass", () => {
		const fixture = completionFixture({ router: () => ({ outcome: "pass", stale: true }) });
		expect(assessCleanerCompletion(transition, fixture.verification, fixture.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-stale",
		});
	});

	test("rejects unbound, failed, and invalid attributable command evidence", () => {
		const unbound = completionFixture({
			verification: { ...verification, actorRef: "" },
		});
		expect(assessCleanerCompletion(transition, unbound.verification, unbound.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-unbound",
		});

		const failed = completionFixture({ verification: { ...verification, outcome: "failed" } });
		expect(assessCleanerCompletion(transition, failed.verification, failed.adapters)).toMatchObject({
			status: "verification-failed",
			reason: "verification-failed",
		});

		const noCommands = completionFixture({ verification: { ...verification, commands: [] as never } });
		expect(assessCleanerCompletion(transition, noCommands.verification, noCommands.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-unbound",
		});
	});

	test("rejects verification bound to the wrong state after resume", () => {
		const resumed = completionFixture({ verification: { ...verification, stateRef: STATE_A } });
		expect(assessCleanerCompletion(transition, resumed.verification, resumed.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-state-mismatch",
		});
	});

	test("does not let a runtime/provider change refresh missing or prior verification", () => {
		const runtimeChanged = completionFixture({ verification: null });
		expect(assessCleanerCompletion(transition, runtimeChanged.verification, runtimeChanged.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-required",
		});
	});

	test("requires the current B projection to equal the exact resulting state", () => {
		const changed = completionFixture({ project: () => ({ stateRef: STATE_A, complete: true, conflicted: false }) });
		expect(assessCleanerCompletion(transition, changed.verification, changed.adapters)).toMatchObject({
			status: "verification-required",
			reason: "verification-state-mismatch",
		});
	});
});
