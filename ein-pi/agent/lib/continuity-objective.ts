import {
	deriveContinuityCheckpoint,
	replaceContinuityObjective,
	type ContinuityObjectiveEvidence,
} from "./continuity-checkpoint.ts";
import {
	readContinuityCheckpoint,
	writeContinuityCheckpoint,
	type ContinuityCheckpointExpectation,
	type ContinuityCheckpointLocation,
} from "./continuity-checkpoint-store.ts";
import { projectProjectState } from "./project-state.ts";
import { join } from "node:path";
import { resolveChangesDir } from "./sdd-routing-core.ts";
import { readAgreement } from "./intent-agreement.ts";

export type ContinuityObjectiveRequest = Readonly<{
	objective: string;
	evidence: Exclude<ContinuityObjectiveEvidence, Readonly<{ kind: "legacy" | "unknown" }>>;
}>;
export type ContinuityObjectiveResult = Readonly<{
	outcome: "set" | "unchanged" | "conflict" | "invalid" | "unavailable";
	revision?: string;
	reason?: string;
}>;
export type ContinuityObjectiveView =
	| Readonly<{ kind: "absent"; expectedRevision: "absent" }>
	| Readonly<{ kind: "valid"; expectedRevision: string; objective: string; objectiveEvidence: ContinuityObjectiveEvidence }>
	| Readonly<{ kind: "unavailable"; reason: string }>;

const REVISION = /^sha256:[a-f0-9]{64}$/;
const GENERIC_NEXT = "Inspect current project state and continue from a verified boundary.";

function expectationFor(value: string): ContinuityCheckpointExpectation | null {
	if (value === "absent") return { kind: "absent" };
	return REVISION.test(value) ? { kind: "revision", revision: value } : null;
}

function contextFor(cwd: string) {
	const state = projectProjectState({ cwd });
	const derived = deriveContinuityCheckpoint(state, { capturedAt: new Date().toISOString(), objective: "Continue the current project task safely.", completed: [], nextAction: GENERIC_NEXT, unresolvedDecisions: [] });
	if (!derived.ok) return null;
	const location: ContinuityCheckpointLocation = derived.checkpoint.mode === "sdd" ? { mode: "sdd", change: derived.checkpoint.change! } : { mode: "adhoc" };
	return { state, location };
}

export function showContinuityObjective(cwd: string): ContinuityObjectiveView {
	try {
		const context = contextFor(cwd);
		if (!context) return { kind: "unavailable", reason: "invalid-state" };
		const { location } = context;
		const read = readContinuityCheckpoint(cwd, location);
		if (read.status === "absent") return { kind: "absent", expectedRevision: "absent" };
		if (read.status === "failure") return { kind: "unavailable", reason: read.reason };
		return { kind: "valid", expectedRevision: read.checkpoint.revision, objective: read.checkpoint.objective,
			objectiveEvidence: read.checkpoint.version === 2 ? read.checkpoint.objectiveEvidence : { kind: "legacy" } };
	} catch {
		return { kind: "unavailable", reason: "io" };
	}
}

export function setContinuityObjective(cwd: string, request: ContinuityObjectiveRequest, expectedRevision: string): ContinuityObjectiveResult {
	try {
		const expected = expectationFor(expectedRevision);
		if (!expected || !request || typeof request.objective !== "string" || !request.evidence
			|| !["pi-observed", "claude-attested", "intent", "intent-draft"].includes(request.evidence.kind)) return { outcome: "invalid", reason: "invalid-request" };
		const context = contextFor(cwd);
		if (!context) return { outcome: "unavailable", reason: "invalid-state" };
		const { state, location } = context;
		if ((request.evidence.kind === "intent" || request.evidence.kind === "intent-draft")
			&& (state.openspec.selection === "ambiguous" || state.openspec.selection === "selected" && state.openspec.selectedChange !== request.evidence.work)) return { outcome: "invalid", reason: "objective-work-mismatch" };
		if (request.evidence.kind === "pi-observed" || request.evidence.kind === "claude-attested") {
			const agreement = location.mode === "sdd" ? readAgreement(join(resolveChangesDir(cwd), location.change)) : undefined;
			const { kind, requestId, recordedAt } = request.evidence;
			request = { ...request, evidence: { kind, requestId, recordedAt,
				...(agreement?.kind === "valid" ? { observedAgreementRevision: agreement.agreement.revision } : {}) } };
		}
		const current = readContinuityCheckpoint(cwd, location);
		if (current.status === "failure") return { outcome: "unavailable", reason: current.reason };
		if ((expected.kind === "absent") !== (current.status === "absent")
			|| expected.kind === "revision" && current.status === "valid" && expected.revision !== current.checkpoint.revision) {
			return { outcome: "conflict", revision: current.status === "valid" ? current.checkpoint.revision : undefined };
		}
		if (current.status === "valid") {
			const evidence = current.checkpoint.version === 2 ? current.checkpoint.objectiveEvidence : { kind: "legacy" as const };
			if (current.checkpoint.objective === request.objective && JSON.stringify(evidence) === JSON.stringify(request.evidence)) {
				return { outcome: "unchanged", revision: current.checkpoint.revision };
			}
			const updated = replaceContinuityObjective(current.checkpoint, request.objective, request.evidence);
			if (!updated.ok) return { outcome: "invalid", reason: updated.reason };
			const written = writeContinuityCheckpoint(cwd, location, updated.checkpoint, expected);
			return written.ok ? { outcome: "set", revision: written.revision ?? updated.checkpoint.revision }
				: { outcome: written.reason === "conflict" ? "conflict" : written.reason === "invalid" ? "invalid" : "unavailable", reason: written.reason };
		}
		const derived = deriveContinuityCheckpoint(state, {
			capturedAt: new Date().toISOString(), objective: request.objective, objectiveEvidence: request.evidence,
			completed: [], nextAction: GENERIC_NEXT, unresolvedDecisions: [],
		});
		if (!derived.ok) return { outcome: "invalid", reason: derived.reason };
		const written = writeContinuityCheckpoint(cwd, location, derived.checkpoint, expected);
		return written.ok ? { outcome: "set", revision: written.revision ?? derived.checkpoint.revision }
			: { outcome: written.reason === "conflict" ? "conflict" : written.reason === "invalid" ? "invalid" : "unavailable", reason: written.reason };
	} catch {
		return { outcome: "unavailable", reason: "io" };
	}
}
