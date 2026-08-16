import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	CONTINUITY_CHECKPOINT_LIMITS,
	deriveContinuityCheckpoint,
	parseContinuityCheckpoint,
	withSddParticipants,
	type ContinuityCheckpointV1,
	type ContinuityCheckpointFacts,
} from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import type { ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";

const REF = `git-v1:sha256:${"a".repeat(64)}`;
const OLD_REF = `git-v1:sha256:${"b".repeat(64)}`;
const FACTS = {
	capturedAt: "2026-08-14T10:30:00Z",
	objective: "Implement the bounded continuity contract.",
	completed: ["Defined canonical checkpoint fields."],
	nextAction: "Add the atomic checkpoint store.",
	unresolvedDecisions: ["Confirm the resume brief byte limit."],
} as const;

function state(overrides: Partial<ProjectStateV1> = {}): ProjectStateV1 {
	const base: ProjectStateV1 = {
		schemaVersion: 1,
		identity: { quality: "current", reason: "read-success", cwd: "/private/repository", repositoryRoot: "/private/repository" },
		openspec: { quality: "current", reason: "read-success", activeChanges: ["continuity"], selection: "selected", selectedChange: "continuity", phase: "apply", next: "apply", provenance: "canonical", artifacts: [], blockers: [], verify: "pass", verifyStale: false },
		ein: { quality: "absent", reason: "not-found", path: "/private/repository/EIN.md", curated: { present: false, complete: false }, auto: { present: false } },
		git: { quality: "current", reason: "read-success", repository: true, root: "/private/repository", dirty: true, complete: true, stateRef: REF, changes: [
			{ path: "src/z.ts", previousPath: "src/a.ts", kind: "renamed", indexStatus: "R", worktreeStatus: "." },
			{ path: "src/z.ts", kind: "modified", indexStatus: ".", worktreeStatus: "M" },
			{ path: "new.ts", kind: "added", indexStatus: "?", worktreeStatus: "?" },
		] },
		verification: { quality: "current", reason: "read-success", reportedOutcome: "pass", effectiveOutcome: "pass", freshness: "current", currentStateRef: REF, observedStateRef: REF },
		runtimes: {
			pi: { provider: "pi", availability: "available", quality: "current", reason: "read-success", capabilities: [], references: [], errors: [] },
			claude: { provider: "claude", availability: "unavailable", quality: "unavailable", reason: "command-error", capabilities: [], references: [], errors: [] },
		},
	};
	return { ...base, ...overrides };
}

function derive(projectState = state(), facts: ContinuityCheckpointFacts = FACTS) {
	return deriveContinuityCheckpoint(projectState, facts);
}

function resign(checkpoint: ContinuityCheckpointV1): ContinuityCheckpointV1 {
	const { revision: previous, ...content } = checkpoint;
	void previous;
	return { ...checkpoint, revision: `sha256:${createHash("sha256").update(JSON.stringify(content)).digest("hex")}` };
}

describe("continuity checkpoint derivation", () => {
	test("derives canonical SDD facts without private project or provider data", () => {
		const first = derive();
		const second = derive();
		expect(first).toEqual(second);
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.checkpoint).toMatchObject({ version: 1, mode: "sdd", change: "continuity", stateRef: REF, verification: { status: "fresh", observedStateRef: REF } });
		expect(first.checkpoint.changedPaths).toEqual(["new.ts", "src/a.ts", "src/z.ts"]);
		expect(first.checkpoint.warnings).toEqual(["git-dirty", "git-staged", "git-untracked", "provider-runtime-unavailable"]);
		expect(first.checkpoint.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
		expect(JSON.stringify(first.checkpoint)).not.toContain("/private/repository");
		expect(parseContinuityCheckpoint(JSON.stringify(first.checkpoint))).toEqual(first);
	});

	test("uses ad hoc mode for ambiguous or invalid OpenSpec selection", () => {
		const ambiguous = state({ openspec: { ...state().openspec, quality: "ambiguous", reason: "ambiguous-selection", activeChanges: ["a", "b"], selection: "ambiguous", selectedChange: undefined } });
		const result = derive(ambiguous);
		expect(result.ok && result.checkpoint.mode).toBe("adhoc");
		expect(result.ok && result.checkpoint.change).toBeNull();
		expect(result.ok && result.checkpoint.warnings).toContain("openspec-ambiguous");
	});

	test.each([
		["stale", { freshness: "stale", observedStateRef: OLD_REF }, "stale"],
		["mismatch", { freshness: "current", observedStateRef: OLD_REF }, "stale"],
		["failed", { reportedOutcome: "fail", effectiveOutcome: "fail", freshness: "invalid" }, "failed"],
		["absent", { reportedOutcome: "absent", effectiveOutcome: "absent", freshness: "unavailable" }, "not-run"],
		["unbound pass", { freshness: "unbound", observedStateRef: undefined }, "stale"],
	] as const)("maps %s verification conservatively", (_name, patch, expected) => {
		const projectState = state();
		const result = derive({ ...projectState, verification: { ...projectState.verification, ...patch } });
		expect(result.ok && result.checkpoint.verification.status).toBe(expected);
	});

	test.each([
		["incomplete", { complete: false }],
		["unavailable", { quality: "unavailable" as const }],
		["non-repository", { repository: false }],
	])("never derives fresh from %s Git", (_name, gitPatch) => {
		const projectState = state();
		const result = derive({ ...projectState, git: { ...projectState.git, ...gitPatch } });
		expect(result.ok && result.checkpoint.verification.status).toBe("stale");
	});

	test("rejects unsafe changed paths instead of leaking or normalizing them", () => {
		for (const path of ["/Users/person/secret", "C:/Users/person/secret", "../secret", "a\\b", "a/./b", ".", "bad\u0000path"]) {
			const projectState = state();
			projectState.git.changes = [{ path, kind: "modified", indexStatus: ".", worktreeStatus: "M" }];
			expect(derive(projectState)).toEqual({ ok: false, reason: "invalid-path" });
		}
		const renamed = state();
		renamed.git.changes = [{ path: "safe.ts", previousPath: "../secret", kind: "renamed", indexStatus: "R", worktreeStatus: "." }];
		expect(derive(renamed)).toEqual({ ok: false, reason: "invalid-path" });
	});

	test("rejects bounded and forbidden human content with generic reasons", () => {
		expect(derive(state(), { ...FACTS, objective: "😀".repeat(CONTINUITY_CHECKPOINT_LIMITS.maxObjectiveBytes / 4 + 1) })).toEqual({ ok: false, reason: "limit-exceeded" });
		expect(derive(state(), { ...FACTS, completed: ["é".repeat(CONTINUITY_CHECKPOINT_LIMITS.maxItemBytes / 2 + 1)] })).toEqual({ ok: false, reason: "limit-exceeded" });
		const projectState = state();
		projectState.git.changes = [{ path: "界".repeat(CONTINUITY_CHECKPOINT_LIMITS.maxPathBytes / 3 + 1), kind: "modified", indexStatus: ".", worktreeStatus: "M" }];
		expect(derive(projectState)).toEqual({ ok: false, reason: "invalid-path" });
		for (const objective of ["Authorization: Bearer abcdefghijklmnop", "transcript: private content", "Read /Users/person/.config/tool", "session_id=abc123"]) {
			expect(derive(state(), { ...FACTS, objective })).toEqual({ ok: false, reason: "unsafe-content" });
		}
		expect(derive(state(), { ...FACTS, objective: "Keep the token budget and session scope bounded." }).ok).toBe(true);
	});
});

	describe("continuity checkpoint parser", () => {
	test("rejects malformed, extended, unsafe, and tampered input without throwing", () => {
		const result = derive();
		if (!result.ok) throw new Error("fixture derivation failed");
		const checkpoint = result.checkpoint;
		const cases: readonly unknown[] = ["{", null, { ...checkpoint, extra: true }, { ...checkpoint, revision: `sha256:${"0".repeat(64)}` }, { ...checkpoint, changedPaths: ["../secret"] }, { ...checkpoint, objective: "password=hunter2" }];
		for (const value of cases) expect(() => parseContinuityCheckpoint(value)).not.toThrow();
		expect(parseContinuityCheckpoint(cases[2])).toEqual({ ok: false, reason: "invalid-checkpoint" });
		expect(parseContinuityCheckpoint(cases[3])).toEqual({ ok: false, reason: "revision-mismatch" });
		expect(parseContinuityCheckpoint(cases[4])).toEqual({ ok: false, reason: "invalid-path" });
		expect(parseContinuityCheckpoint(cases[5])).toEqual({ ok: false, reason: "unsafe-content" });
	});

	test("rejects recomputed semantic contradictions", () => {
		const result = derive();
		if (!result.ok) throw new Error("fixture derivation failed");
		const base = result.checkpoint;
		const cases = [
			resign({ ...base, stateRef: null }),
			resign({ ...base, verification: { status: "fresh", observedStateRef: OLD_REF } }),
			resign({ ...base, verification: { ...base.verification, status: "stale" } }),
			resign({ ...base, warnings: ["verification-stale"] }),
			resign({ ...base, verification: { ...base.verification, status: "stale" }, warnings: ["verification-stale", "verification-failed"] }),
		];
		for (const checkpoint of cases) expect(parseContinuityCheckpoint(checkpoint)).toEqual({ ok: false, reason: "invalid-checkpoint" });
	});

	test("reads v1 unchanged and strictly canonicalizes bounded participant v2 evidence", () => {
		const result = derive(); if (!result.ok) throw new Error("fixture derivation failed");
		expect(parseContinuityCheckpoint(result.checkpoint)).toEqual(result);
		expect(parseContinuityCheckpoint(resign({ ...result.checkpoint, version: 2, sddParticipants: null })).ok).toBeTrue();
		const participants = { change: "continuity", applyId: "c".repeat(64), scopeId: "d".repeat(64), beforeStateRef: REF, order: ["ein-cleaner", "ein-architect"] as const, cleaner: { status: "complete" as const, observedStateRef: REF, afterStateRef: OLD_REF }, architect: { status: "blocked" as const, observedStateRef: OLD_REF } };
		const upgraded = withSddParticipants(result.checkpoint, participants); expect(upgraded.ok).toBeTrue(); if (!upgraded.ok) return;
		expect(upgraded.checkpoint).toMatchObject({ version: 2, sddParticipants: participants });
		expect(parseContinuityCheckpoint(JSON.stringify(upgraded.checkpoint))).toEqual(upgraded);
		for (const invalid of [
			{ ...participants, applyId: "session_id=private" },
			{ ...participants, order: ["ein-architect", "ein-cleaner"] },
			{ ...participants, architect: { ...participants.architect, observedStateRef: REF } },
		]) expect(withSddParticipants(result.checkpoint, invalid as typeof participants).ok).toBeFalse();
	});
});
