import {
	deriveContinuityCheckpoint,
	parseContinuityCheckpoint,
	type ContinuityCheckpointV1,
	type ContinuityCheckpointFacts,
	type ContinuityWarning,
} from "./continuity-checkpoint.ts";
import type { ContinuityCheckpointRead } from "./continuity-checkpoint-store.ts";
import type { ProjectRuntimeProvider, ProjectStateV1 } from "./project-state.ts";
import { types as utilTypes } from "node:util";

export const CONTINUITY_READINESS_BLOCKER_ORDER = [
	"invalid-input", "invalid-live-state", "checkpoint-absent", "checkpoint-unreadable",
	"checkpoint-invalid", "checkpoint-oversized", "checkpoint-revision-mismatch",
	"checkpoint-mode-mismatch", "checkpoint-change-mismatch", "checkpoint-state-ref-mismatch",
	"checkpoint-stale", "git-not-repository", "git-incomplete", "git-dirty-unknown", "git-inconsistent",
	"git-state-ref-invalid", "git-unmerged", "git-change-unknown", "openspec-ambiguous",
	"openspec-mixed", "openspec-invalid", "mutation-uncertain", "target-runtime-unavailable",
	"target-runtime-untrusted", "audit-failed",
] as const;
export type ContinuityReadinessBlocker = typeof CONTINUITY_READINESS_BLOCKER_ORDER[number];
export const CONTINUITY_READINESS_WARNING_ORDER = [
	"git-dirty", "git-staged", "git-untracked", "verification-stale", "verification-failed",
	"verification-not-run", "verification-unknown", "provider-runtime-unavailable",
	"process-active", "process-unknown",
] as const;
export type ContinuityReadinessWarning = typeof CONTINUITY_READINESS_WARNING_ORDER[number];
export type ContinuityReadinessInput = Readonly<{
	state: ProjectStateV1;
	checkpoint: ContinuityCheckpointRead;
	target: ProjectRuntimeProvider;
	mutation: "settled" | "uncertain";
	process: "none" | "active" | "unknown";
}>;
export type ContinuityReadinessResult =
	| Readonly<{ status: "ready"; blockers: readonly []; warnings: readonly [] }>
	| Readonly<{ status: "ready-with-warnings"; blockers: readonly []; warnings: readonly ContinuityReadinessWarning[] }>
	| Readonly<{ status: "blocked"; blockers: readonly ContinuityReadinessBlocker[]; warnings: readonly ContinuityReadinessWarning[] }>;
const INVALID = Symbol("invalid-data");
const STATE_REF = /^git-v1:sha256:[a-f0-9]{64}$/;
const QUALITY = new Set(["current", "absent", "incomplete", "ambiguous", "legacy", "stale", "unbound", "unavailable"]);
const REASON = new Set(["not-inspected", "not-provided", "not-found", "not-a-repository", "incomplete-source", "ambiguous-selection", "legacy-source", "stale-source", "invalid-source", "state-mismatch", "read-error", "command-error", "parse-error", "read-success"]);
const STATUS = new Set([".", "M", "A", "D", "R", "C", "T", "U", "?"]);
const KIND = new Set(["added", "copied", "deleted", "modified", "renamed", "type-changed", "unmerged", "unknown"]);
function copyOwnData(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown | typeof INVALID {
	if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "undefined") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : INVALID;
	if (typeof value !== "object" || depth > 12 || seen.has(value)) return INVALID;
	if (utilTypes.isProxy(value)) return INVALID;
	seen.add(value);
	const descriptors = Object.getOwnPropertyDescriptors(value);
	if (Object.getOwnPropertySymbols(value).length !== 0) return INVALID;
	if (Array.isArray(value)) {
		const length = descriptors.length?.value;
		if (!Number.isSafeInteger(length) || length < 0) return INVALID;
		const output: unknown[] = [];
		for (let index = 0; index < length; index += 1) {
			const descriptor = descriptors[String(index)];
			if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return INVALID;
			const item = copyOwnData(descriptor.value, seen, depth + 1); if (item === INVALID) return INVALID;
			output.push(item);
		}
		if (Object.keys(descriptors).some((key) => key !== "length" && !/^\d+$/.test(key))) return INVALID;
		return output;
	}
	if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return INVALID;
	const output: Record<string, unknown> = {};
	for (const [key, descriptor] of Object.entries(descriptors)) {
		if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return INVALID;
		const item = copyOwnData(descriptor.value, seen, depth + 1); if (item === INVALID) return INVALID;
		output[key] = item;
	}
	return output;
}
function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function shape(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
	const allowed = new Set([...required, ...optional]);
	return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function strings(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function source(value: Record<string, unknown>): boolean {
	return QUALITY.has(value.quality as string) && REASON.has(value.reason as string)
		&& (value.detail === undefined || typeof value.detail === "string");
}
function validState(value: unknown): value is ProjectStateV1 {
	if (!record(value) || !shape(value, ["schemaVersion", "identity", "openspec", "ein", "git", "verification", "runtimes"]) || value.schemaVersion !== 1) return false;
	const identity = value.identity, openspec = value.openspec, ein = value.ein, git = value.git, verification = value.verification, runtimes = value.runtimes;
	if (!record(identity) || !record(openspec) || !record(ein) || !record(git) || !record(verification) || !record(runtimes)) return false;
	if (!source(identity) || typeof identity.cwd !== "string" || (identity.repositoryRoot !== undefined && typeof identity.repositoryRoot !== "string")) return false;
	if (!source(ein) || typeof ein.path !== "string" || !record(ein.curated) || typeof ein.curated.present !== "boolean" || typeof ein.curated.complete !== "boolean" || !record(ein.auto) || typeof ein.auto.present !== "boolean") return false;
	if (!source(openspec) || !strings(openspec.activeChanges) || !["none", "selected", "ambiguous"].includes(openspec.selection as string)
		|| !["canonical", "legacy", "mixed", "none"].includes(openspec.provenance as string) || !Array.isArray(openspec.artifacts)
		|| !strings(openspec.blockers) || !["pass", "fail", "unknown", "absent"].includes(openspec.verify as string)
		|| typeof openspec.verifyStale !== "boolean" || (openspec.selectedChange !== undefined && typeof openspec.selectedChange !== "string")) return false;
	if (openspec.artifacts.some((artifact) => !record(artifact) || typeof artifact.phase !== "string" || typeof artifact.file !== "string" || typeof artifact.present !== "boolean")) return false;
	if (!source(git) || ![true, false, null].includes(git.repository as boolean | null) || ![true, false, null].includes(git.dirty as boolean | null)
		|| typeof git.complete !== "boolean" || !Array.isArray(git.changes)) return false;
	for (const change of git.changes) {
			if (!record(change) || typeof change.path !== "string" || !KIND.has(change.kind as string) || !STATUS.has(change.indexStatus as string)
				|| !STATUS.has(change.worktreeStatus as string) || (change.previousPath !== undefined && typeof change.previousPath !== "string")) return false;
	}
	if (!source(verification) || !["pass", "fail", "unknown", "absent"].includes(verification.reportedOutcome as string)
		|| !["pass", "fail", "unknown", "absent"].includes(verification.effectiveOutcome as string)
		|| !["current", "stale", "unbound", "unavailable", "invalid"].includes(verification.freshness as string)
		|| (verification.currentStateRef !== undefined && typeof verification.currentStateRef !== "string") || (verification.observedStateRef !== undefined && typeof verification.observedStateRef !== "string")) return false;
	for (const provider of ["pi", "claude"] as const) {
		const runtime = runtimes[provider];
		if (!record(runtime) || !source(runtime) || runtime.provider !== provider || !["available", "unavailable", "not-provided"].includes(runtime.availability as string)
			|| !strings(runtime.capabilities) || !strings(runtime.references) || !Array.isArray(runtime.errors)) return false;
		if (runtime.errors.some((error) => !record(error) || !REASON.has(error.code as string) || (error.detail !== undefined && typeof error.detail !== "string"))) return false;
	}
	return true;
}
function same(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}
function finish(blockers: Set<ContinuityReadinessBlocker>, warnings: Set<ContinuityReadinessWarning>): ContinuityReadinessResult {
	const orderedBlockers = CONTINUITY_READINESS_BLOCKER_ORDER.filter((code) => blockers.has(code));
	const orderedWarnings = CONTINUITY_READINESS_WARNING_ORDER.filter((code) => warnings.has(code));
	if (orderedBlockers.length) return { status: "blocked", blockers: orderedBlockers, warnings: orderedWarnings };
	if (orderedWarnings.length) return { status: "ready-with-warnings", blockers: [], warnings: orderedWarnings };
	return { status: "ready", blockers: [], warnings: [] };
}
export function auditContinuityReadiness(input: ContinuityReadinessInput): ContinuityReadinessResult {
	try {
		const copied = copyOwnData(input);
		if (!record(copied) || !shape(copied, ["state", "checkpoint", "target", "mutation", "process"])) return finish(new Set(["invalid-input"]), new Set());
		if ((copied.target !== "pi" && copied.target !== "claude") || (copied.mutation !== "settled" && copied.mutation !== "uncertain") || !["none", "active", "unknown"].includes(copied.process as string)) return finish(new Set(["invalid-input"]), new Set());
		if (!validState(copied.state)) return finish(new Set(["invalid-live-state"]), new Set());
		const state = copied.state, blockers = new Set<ContinuityReadinessBlocker>(), warnings = new Set<ContinuityReadinessWarning>();
		if (copied.mutation === "uncertain") blockers.add("mutation-uncertain");
		if (copied.process === "active") warnings.add("process-active"); else if (copied.process === "unknown") warnings.add("process-unknown");
		const checkpointRead = copied.checkpoint;
		let checkpoint: ContinuityCheckpointV1 | undefined;
		if (!record(checkpointRead) || typeof checkpointRead.status !== "string") blockers.add("invalid-input");
		else if (checkpointRead.status === "absent") blockers.add(shape(checkpointRead, ["status"]) ? "checkpoint-absent" : "invalid-input");
		else if (checkpointRead.status === "failure") blockers.add(!shape(checkpointRead, ["status", "reason"]) || !["invalid-content", "read-failure", "unsafe-request"].includes(checkpointRead.reason as string) ? "invalid-input" : checkpointRead.reason === "invalid-content" ? "checkpoint-invalid" : "checkpoint-unreadable");
		else if (checkpointRead.status !== "valid") blockers.add("invalid-input");
		else if (!shape(checkpointRead, ["status", "checkpoint"])) blockers.add("invalid-input");
		else {
			const parsed = parseContinuityCheckpoint(checkpointRead.checkpoint);
			if (!parsed.ok) blockers.add(parsed.reason === "limit-exceeded" ? "checkpoint-oversized" : parsed.reason === "revision-mismatch" ? "checkpoint-revision-mismatch" : "checkpoint-invalid");
			else checkpoint = parsed.checkpoint;
		}
		if (state.git.repository !== true) blockers.add("git-not-repository");
		if (!state.git.complete || state.git.quality !== "current") blockers.add("git-incomplete");
			if (state.git.dirty === null) blockers.add("git-dirty-unknown");
			if (state.git.dirty !== (state.git.changes.length > 0) || state.git.changes.some((change) => change.indexStatus === "." && change.worktreeStatus === "."
				|| (change.indexStatus === "?" || change.worktreeStatus === "?") && (change.indexStatus !== "?" || change.worktreeStatus !== "?")
				|| (change.previousPath !== undefined) !== (change.kind === "renamed" || change.kind === "copied"))) blockers.add("git-inconsistent");
		if (typeof state.git.stateRef !== "string" || !STATE_REF.test(state.git.stateRef)) blockers.add("git-state-ref-invalid");
		if (state.git.changes.some((change) => change.kind === "unmerged" || change.indexStatus === "U" || change.worktreeStatus === "U")) blockers.add("git-unmerged");
		if (state.git.changes.some((change) => change.kind === "unknown")) blockers.add("git-change-unknown");
		if (state.openspec.selection === "ambiguous" || state.openspec.quality === "ambiguous") blockers.add("openspec-ambiguous");
		else if (state.openspec.provenance === "mixed") blockers.add("openspec-mixed");
		else {
			const selected = state.openspec.selection === "selected" && state.openspec.provenance === "canonical" && (state.openspec.quality === "current" || state.openspec.quality === "incomplete")
				&& state.openspec.activeChanges.length === 1 && state.openspec.activeChanges[0] === state.openspec.selectedChange;
			const adhoc = state.openspec.selection === "none" && state.openspec.provenance === "none" && state.openspec.activeChanges.length === 0 && state.openspec.selectedChange === undefined;
			if (!selected && !adhoc) blockers.add("openspec-invalid");
		}
		const runtime = state.runtimes[copied.target];
		if (runtime.availability !== "available") blockers.add("target-runtime-unavailable");
		else if (runtime.quality !== "current" || runtime.reason !== "read-success") blockers.add("target-runtime-untrusted");
		if (state.git.dirty === true) warnings.add("git-dirty");
		if (state.git.changes.some((change) => change.indexStatus !== "." && change.indexStatus !== "?" && change.indexStatus !== "U")) warnings.add("git-staged");
		if (state.git.changes.some((change) => change.indexStatus === "?" || change.worktreeStatus === "?")) warnings.add("git-untracked");
		if (checkpoint) {
			const facts: ContinuityCheckpointFacts = { capturedAt: checkpoint.capturedAt, objective: checkpoint.objective, completed: checkpoint.completed, nextAction: checkpoint.nextAction, unresolvedDecisions: checkpoint.unresolvedDecisions };
			const derived = deriveContinuityCheckpoint(state, facts);
			if (!derived.ok) blockers.add("invalid-live-state");
			else {
				if (checkpoint.mode !== derived.checkpoint.mode) blockers.add("checkpoint-mode-mismatch");
				if (checkpoint.change !== derived.checkpoint.change) blockers.add("checkpoint-change-mismatch");
				if (checkpoint.stateRef !== derived.checkpoint.stateRef) blockers.add("checkpoint-state-ref-mismatch");
				if (!same(checkpoint.changedPaths, derived.checkpoint.changedPaths) || !same(checkpoint.verification, derived.checkpoint.verification) || !same(checkpoint.warnings, derived.checkpoint.warnings)) blockers.add("checkpoint-stale");
				const safeWarnings: Partial<Record<ContinuityWarning, ContinuityReadinessWarning>> = { "git-dirty": "git-dirty", "git-staged": "git-staged", "git-untracked": "git-untracked", "verification-stale": "verification-stale", "verification-failed": "verification-failed", "verification-unknown": "verification-unknown", "provider-runtime-unavailable": "provider-runtime-unavailable" };
				for (const warning of derived.checkpoint.warnings) { const safe = safeWarnings[warning]; if (safe) warnings.add(safe); }
				if (derived.checkpoint.verification.status === "not-run") warnings.add("verification-not-run");
			}
		}
		return finish(blockers, warnings);
	} catch {
		return finish(new Set(["audit-failed"]), new Set());
	}
}
