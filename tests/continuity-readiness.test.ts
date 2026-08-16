import { describe, expect, test } from "bun:test";
import { deriveContinuityCheckpoint, type ContinuityCheckpointFacts, type ContinuityCheckpointV1 } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { auditContinuityReadiness, type ContinuityReadinessInput } from "../ein-pi/agent/lib/continuity-readiness.ts";
import type { ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";
const REF = `git-v1:sha256:${"a".repeat(64)}`;
const NEXT_REF = `git-v1:sha256:${"b".repeat(64)}`;
const FACTS = { capturedAt: "2026-08-14T12:00:00Z", objective: "Continue safely.", completed: [], nextAction: "Open the target runtime.", unresolvedDecisions: [] } as const;
function state(): ProjectStateV1 {
	return {
		schemaVersion: 1,
		identity: { quality: "current", reason: "read-success", cwd: "/private/project", repositoryRoot: "/private/project" },
		openspec: { quality: "absent", reason: "not-found", activeChanges: [], selection: "none", provenance: "none", artifacts: [], blockers: [], verify: "absent", verifyStale: false },
		ein: { quality: "absent", reason: "not-found", path: "/private/project/EIN.md", curated: { present: false, complete: false }, auto: { present: false } },
		git: { quality: "current", reason: "read-success", repository: true, dirty: false, complete: true, stateRef: REF, changes: [] },
		verification: { quality: "current", reason: "read-success", reportedOutcome: "pass", effectiveOutcome: "pass", freshness: "current", currentStateRef: REF, observedStateRef: REF },
		runtimes: {
			pi: { provider: "pi", availability: "available", quality: "current", reason: "read-success", capabilities: [], references: [], errors: [] },
			claude: { provider: "claude", availability: "available", quality: "current", reason: "read-success", capabilities: [], references: [], errors: [] },
		},
	};
}
function checkpoint(project = state(), facts: ContinuityCheckpointFacts = FACTS): ContinuityCheckpointV1 {
	const result = deriveContinuityCheckpoint(project, facts); if (!result.ok) throw new Error("fixture derivation failed"); return result.checkpoint;
}
function input(project = state(), overrides: Partial<ContinuityReadinessInput> = {}): ContinuityReadinessInput {
	return { state: project, checkpoint: { status: "valid", checkpoint: checkpoint(project) }, target: "claude", mutation: "settled", process: "none", ...overrides };
}
function audit(value: unknown) { return auditContinuityReadiness(value as ContinuityReadinessInput); }
describe("continuity readiness", () => {
	test("classifies an exact clean and fresh handoff as ready", () => {
		expect(audit(input())).toEqual({ status: "ready", blockers: [], warnings: [] });
	});
	test.each([
		["dirty", [{ path: "work.ts", kind: "modified", indexStatus: ".", worktreeStatus: "M" }], ["git-dirty"]],
		["staged", [{ path: "work.ts", kind: "modified", indexStatus: "M", worktreeStatus: "." }], ["git-dirty", "git-staged"]],
		["untracked", [{ path: "new.ts", kind: "added", indexStatus: "?", worktreeStatus: "?" }], ["git-dirty", "git-untracked"]],
	] as const)("allows precise %s Git state with warnings", (_name, changes, warnings) => {
		const project = state(); project.git = { ...project.git, dirty: true, changes };
		expect(audit(input(project))).toEqual({ status: "ready-with-warnings", blockers: [], warnings });
	});
	test.each([
		[false, [{ path: "work.ts", kind: "modified", indexStatus: ".", worktreeStatus: "M" }]],
		[true, []],
	] as const)("blocks contradictory dirty=%s Git snapshots", (dirty, changes) => {
		const project = state(); project.git = { ...project.git, dirty, changes };
		expect(audit(input(project)).blockers).toContain("git-inconsistent");
	});
	test.each([
		["stale", { freshness: "stale" as const }, "verification-stale"],
		["failed", { reportedOutcome: "fail" as const, effectiveOutcome: "fail" as const, freshness: "invalid" as const }, "verification-failed"],
		["not-run", { reportedOutcome: "absent" as const, effectiveOutcome: "absent" as const, freshness: "unavailable" as const, observedStateRef: undefined, currentStateRef: undefined }, "verification-not-run"],
		["unknown", { reportedOutcome: "unknown" as const, effectiveOutcome: "unknown" as const, freshness: "unavailable" as const, observedStateRef: undefined, currentStateRef: undefined }, "verification-unknown"],
	])("allows %s verification with a warning", (_name, patch, warning) => {
		const project = state(); project.verification = { ...project.verification, ...patch };
		expect(audit(input(project))).toMatchObject({ status: "ready-with-warnings", blockers: [], warnings: [warning] });
	});
	test.each([["active", "process-active"], ["unknown", "process-unknown"]] as const)("does not transfer or block %s processes", (process, warning) => {
		expect(audit(input(state(), { process }))).toMatchObject({ status: "ready-with-warnings", warnings: [warning] });
	});

	test.each([
		[{ status: "absent" }, "checkpoint-absent"],
		[{ status: "failure", reason: "read-failure" }, "checkpoint-unreadable"],
		[{ status: "failure", reason: "unsafe-request" }, "checkpoint-unreadable"],
		[{ status: "failure", reason: "invalid-content" }, "checkpoint-invalid"],
		[{ status: "valid", checkpoint: null }, "checkpoint-invalid"],
	])("blocks unavailable or invalid checkpoint read %#", (read, blocker) => {
		expect(audit(input(state(), { checkpoint: read as ContinuityReadinessInput["checkpoint"] }))).toMatchObject({ status: "blocked", blockers: [blocker] });
	});

	test("blocks mode, change, stateRef, path, and revision drift", () => {
		const base = state(), baseCheckpoint = checkpoint(base);
		const sdd = state(); sdd.openspec = { ...sdd.openspec, quality: "current", reason: "read-success", activeChanges: ["a"], selection: "selected", selectedChange: "a", provenance: "canonical" };
		const otherChange = { ...sdd, openspec: { ...sdd.openspec, activeChanges: ["b"], selectedChange: "b" } };
		const nextRef = state(); nextRef.git = { ...nextRef.git, stateRef: NEXT_REF }; nextRef.verification = { ...nextRef.verification, currentStateRef: NEXT_REF, observedStateRef: NEXT_REF };
		const nextPath = state(); nextPath.git = { ...nextPath.git, dirty: true, changes: [{ path: "new.ts", kind: "modified", indexStatus: ".", worktreeStatus: "M" }] };
		const cases = [
			[input(base, { checkpoint: { status: "valid", checkpoint: checkpoint(sdd) } }), "checkpoint-mode-mismatch"],
			[input(otherChange, { checkpoint: { status: "valid", checkpoint: checkpoint(sdd) } }), "checkpoint-change-mismatch"],
			[input(nextRef, { checkpoint: { status: "valid", checkpoint: baseCheckpoint } }), "checkpoint-state-ref-mismatch"],
			[input(nextPath, { checkpoint: { status: "valid", checkpoint: baseCheckpoint } }), "checkpoint-stale"],
			[input(base, { checkpoint: { status: "valid", checkpoint: { ...baseCheckpoint, revision: `sha256:${"0".repeat(64)}` } } }), "checkpoint-revision-mismatch"],
		] as const;
		for (const [request, blocker] of cases) expect(audit(request).blockers).toContain(blocker);
	});
	test.each([
		["ambiguous OpenSpec", (project: ProjectStateV1) => { project.openspec = { ...project.openspec, quality: "ambiguous", reason: "ambiguous-selection", selection: "ambiguous", activeChanges: ["a", "b"] }; }, "openspec-ambiguous"],
		["mixed OpenSpec", (project: ProjectStateV1) => { project.openspec = { ...project.openspec, provenance: "mixed" }; }, "openspec-mixed"],
		["non-repository Git", (project: ProjectStateV1) => { project.git = { ...project.git, repository: false }; }, "git-not-repository"],
		["incomplete Git", (project: ProjectStateV1) => { project.git = { ...project.git, complete: false }; }, "git-incomplete"],
		["unknown dirty state", (project: ProjectStateV1) => { project.git = { ...project.git, dirty: null }; }, "git-dirty-unknown"],
		["unmerged Git", (project: ProjectStateV1) => { project.git = { ...project.git, dirty: true, changes: [{ path: "x", kind: "unmerged", indexStatus: "U", worktreeStatus: "U" }] }; }, "git-unmerged"],
		["unknown Git change", (project: ProjectStateV1) => { project.git = { ...project.git, dirty: true, changes: [{ path: "x", kind: "unknown", indexStatus: "M", worktreeStatus: "M" }] }; }, "git-change-unknown"],
	] as const)("blocks %s", (_name, mutate, blocker) => {
		const project = state(); mutate(project); expect(audit(input(project)).blockers).toContain(blocker);
	});
	test("blocks mutation uncertainty and target runtime trust failures without substituting the source", () => {
		expect(audit(input(state(), { mutation: "uncertain" })).blockers).toContain("mutation-uncertain");
		for (const availability of ["unavailable", "not-provided"] as const) {
			const project = state(); project.runtimes.claude = { ...project.runtimes.claude, availability, quality: availability === "unavailable" ? "unavailable" : "absent", reason: availability === "unavailable" ? "command-error" : "not-provided" };
			expect(audit(input(project)).blockers).toContain("target-runtime-unavailable");
		}
		const untrusted = state(); untrusted.runtimes.claude = { ...untrusted.runtimes.claude, quality: "stale", reason: "stale-source" };
		expect(audit(input(untrusted)).blockers).toContain("target-runtime-untrusted");
	});
	test("accepts canonical SDD and normalized target metadata, and warns for source-only unavailability", () => {
		const project = state();
		project.openspec = { ...project.openspec, quality: "current", reason: "read-success", activeChanges: ["continuity"], selection: "selected", selectedChange: "continuity", provenance: "canonical" };
		project.runtimes.claude = { ...project.runtimes.claude, capabilities: ["launch"], references: ["claude-public:opaque"] };
		expect(audit(input(project))).toEqual({ status: "ready", blockers: [], warnings: [] });
		project.runtimes.pi = { ...project.runtimes.pi, availability: "unavailable", quality: "unavailable", reason: "command-error" };
		expect(audit(input(project))).toEqual({ status: "ready-with-warnings", blockers: [], warnings: ["provider-runtime-unavailable"] });
	});

	test("orders and deduplicates findings without private detail", () => {
		const project = state(); project.git = { ...project.git, repository: false, complete: false, dirty: true, changes: [{ path: "private.ts", kind: "unmerged", indexStatus: "U", worktreeStatus: "U" }] };
		project.runtimes.claude = { ...project.runtimes.claude, availability: "unavailable", quality: "unavailable", reason: "command-error", errors: [{ code: "command-error", detail: "secret /Users/person/session_id=abc" }] };
		const result = audit(input(project, { mutation: "uncertain", process: "active" }));
		expect(result).toEqual(audit(input(project, { mutation: "uncertain", process: "active" })));
		expect(result.blockers).toEqual([...new Set(result.blockers)]);
		expect(JSON.stringify(result)).not.toMatch(/Users|session_id|private\.ts|secret/);
	});

	test("rejects top-level and nested proxies without invoking traps", () => {
		let trapCalls = 0;
		const proxy = new Proxy({}, { ownKeys() { trapCalls += 1; throw new Error("trap"); }, getOwnPropertyDescriptor() { trapCalls += 1; throw new Error("trap"); }, getPrototypeOf() { trapCalls += 1; throw new Error("trap"); } });
		const base = input(), cases = [proxy, { ...base, checkpoint: proxy }, { ...base, state: { ...base.state, identity: proxy } }, { ...base, state: { ...base.state, runtimes: { ...base.state.runtimes, claude: proxy } } }];
		for (const value of cases) expect(audit(value)).toMatchObject({ status: "blocked" });
		expect(trapCalls).toBe(0);
	});
	test("never invokes malformed accessors", () => {
		let getterCalls = 0;
		const getter = Object.defineProperty({}, "state", { enumerable: true, get() { getterCalls += 1; throw new Error("side effect"); } });
		for (const value of [null, [], {}, getter]) expect(() => audit(value)).not.toThrow();
		expect(getterCalls).toBe(0);
	});
});
