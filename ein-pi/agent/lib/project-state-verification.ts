import { join } from "node:path";

import type { ProjectGitState, ProjectOpenSpecState, ProjectStateQuality, ProjectStateReasonCode, ProjectVerificationState } from "./project-state-contract.ts";
import { readVerificationFreshness } from "./sdd-verification-runtime.ts";

export function readProjectVerificationState(
	cwd: string,
	openspec: ProjectOpenSpecState,
	_git: ProjectGitState,
): ProjectVerificationState {
	const reportedOutcome = openspec.verify;
	if (!openspec.selectedChange) {
		return {
			quality: openspec.selection === "ambiguous" ? "ambiguous" : "absent",
			reason: openspec.selection === "ambiguous" ? "ambiguous-selection" : "not-found",
			reportedOutcome,
			effectiveOutcome: reportedOutcome === "absent" ? "absent" : "unknown",
			freshness: "unavailable",
		};
	}
	const root = openspec.provenance === "legacy" ? ".sdd" : "openspec";
	const changePath = join(cwd, root, "changes", openspec.selectedChange);
	const freshness = readVerificationFreshness({ cwd, changePath });
	const references = {
		...(freshness.observedSurfaceRef ? { observedVerificationSurfaceRef: freshness.observedSurfaceRef } : {}),
		...(freshness.currentSurfaceRef ? { currentVerificationSurfaceRef: freshness.currentSurfaceRef } : {}),
	};
	const qualityByFreshness: Record<typeof freshness.state, ProjectStateQuality> = {
		current: "current", stale: "stale", unbound: "unbound", unavailable: "unavailable", invalid: "incomplete",
	};
	const reasonByFreshness: Record<typeof freshness.state, ProjectStateReasonCode> = {
		current: "read-success", stale: "stale-source", unbound: "legacy-source", unavailable: "read-error", invalid: "invalid-source",
	};
	return {
		quality: qualityByFreshness[freshness.state],
		reason: reasonByFreshness[freshness.state],
		detail: freshness.reason,
		reportedOutcome,
		effectiveOutcome: reportedOutcome === "fail" ? "fail" : reportedOutcome === "pass" && freshness.state === "current" ? "pass" : "unknown",
		freshness: freshness.state,
		...references,
	};
}
