// Public boundary for the deterministic SDD engine consumed by Claude. This is
// deliberately explicit: adding a capability requires changing this contract.
import {
	persistSddIntentResolution,
	readSddIntentResolutionState,
} from "../../ein-pi/agent/lib/sdd-preflight-record.ts";
import { readRepositoryStateIdentity } from "../../ein-pi/agent/lib/git-baseline.ts";
import { LANE_PHASES, readChangeLane } from "../../ein-pi/agent/lib/sdd-lane.ts";
import { createAssessCloseReadiness } from "../sdd/sdd-close-readiness.ts";
import { createCloseChange } from "../sdd/sdd-close-engine.ts";
import { createSddIntentPreflightCoordinator } from "../sdd/sdd-intent-resolution.ts";
import { createSddRoutingCore } from "../sdd/sdd-routing-core.ts";
import { createLintChange, readOpenSpecState } from "../sdd/sdd-change-validation.ts";

export {
	resolveSddPlanPreview,
	formatSddPlanPreview,
	sddStatusBlockers,
	formatBudget,
	listActiveChanges,
	isSafeChangeName,
	resolveActiveSelection,
	type SddChangeStatus,
} from "../sdd/sdd-routing-core.ts";
export type { ChangeLintReport } from "../sdd/sdd-change-validation.ts";
export { collectSddRemedies, formatSddRemedies } from "../sdd/sdd-remedies.ts";
export { LANE_LABEL, laneSkips, normalizeLane, readChangeLane, writeChangeLane } from "../../ein-pi/agent/lib/sdd-lane.ts";
export {
	changeStanceDirective,
	normalizeTddStance,
	readActiveChangeStance,
	readChangeStance,
	readPreflightRecord,
	renderChangeStanceLine,
	updateSddPreflightStance,
} from "../../ein-pi/agent/lib/sdd-preflight-record.ts";

const intentCoordinator = createSddIntentPreflightCoordinator({
	readState: readSddIntentResolutionState,
	persistResolution: persistSddIntentResolution,
	now: () => new Date().toISOString(),
});

const routingCore = createSddRoutingCore({
	readLane: readChangeLane,
	readSpecState: readOpenSpecState,
});
const closeReadiness = createAssessCloseReadiness({
	resolveSddStatus: routingCore.resolveSddStatus,
});

export const lintChange = createLintChange(
	(changePath) => LANE_PHASES[readChangeLane(changePath)],
);
export const closeChange = createCloseChange({
	assessCloseReadiness: closeReadiness,
	resolveSddStatus: routingCore.resolveSddStatus,
	readRepositoryStateIdentity,
});

export const resolveSddIntentPreflight = intentCoordinator.resolve;
export const resolveSddStatus = routingCore.resolveSddStatus;
export type {
	SddIntentPreflightInput,
	SddIntentPreflightOutcome,
} from "../sdd/sdd-intent-resolution.ts";
export { writeOpenSpecDelta } from "../sdd/openspec-delta-write.ts";
export { writeSddSummary } from "../sdd/sdd-summary-write.ts";
export { synchronizeOpenSpecFilesystem } from "../sdd/openspec-spec-sync-fs.ts";
export {
	evaluateDeniedCommand,
	commandRequiresConfirmation,
	commandIsExplicitlyAllowed,
} from "../../ein-pi/agent/lib/guardrails.ts";
export { readGitBaseline, renderWorkingTreeLine } from "../../ein-pi/agent/lib/git-baseline.ts";
export {
	renderProjectDirectives,
	resolveProjectDirectives,
	summarizeProjectDirectives,
} from "../../ein-pi/agent/lib/project-directives.ts";
