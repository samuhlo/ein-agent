// Public boundary for the deterministic SDD engine consumed by Claude. This is
// deliberately explicit: adding a capability requires changing this contract.
import {
	persistSddIntentResolution,
	readSddIntentResolutionState,
} from "../../ein-pi/agent/lib/sdd-preflight-record.ts";
import { readOpenSpecState } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
import { readChangeLane } from "../../ein-pi/agent/lib/sdd-lane.ts";
import { createSddIntentPreflightCoordinator } from "../sdd/sdd-intent-resolution.ts";
import { createSddRoutingCore } from "../sdd/sdd-routing-core.ts";

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
export { lintChange, type ChangeLintReport } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
export { collectSddRemedies, formatSddRemedies } from "../sdd/sdd-remedies.ts";
export { closeChange } from "../../ein-pi/agent/lib/sdd-close.ts";
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

export const resolveSddIntentPreflight = intentCoordinator.resolve;
export const resolveSddStatus = routingCore.resolveSddStatus;
export type {
	SddIntentPreflightInput,
	SddIntentPreflightOutcome,
} from "../sdd/sdd-intent-resolution.ts";
export { writeOpenSpecDelta } from "../../ein-pi/agent/lib/openspec-delta-write.ts";
export { writeSddSummary } from "../sdd/sdd-summary-write.ts";
export { synchronizeOpenSpecFilesystem } from "../../ein-pi/agent/lib/openspec-spec-sync-fs.ts";
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
