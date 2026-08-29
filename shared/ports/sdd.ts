// Public boundary for the deterministic SDD engine consumed by Claude. This is
// deliberately explicit: adding a capability requires changing this contract.
export {
	resolveSddStatus,
	resolveSddPlanPreview,
	formatSddPlanPreview,
	sddStatusBlockers,
	formatBudget,
	listActiveChanges,
	isSafeChangeName,
	resolveActiveSelection,
	type SddChangeStatus,
} from "../../ein-pi/agent/lib/sdd-router.ts";
export { lintChange, type ChangeLintReport } from "../../ein-pi/agent/lib/sdd-guardrails.ts";
export { collectSddRemedies, formatSddRemedies } from "../../ein-pi/agent/lib/sdd-remedies.ts";
export { closeChange } from "../../ein-pi/agent/lib/sdd-close.ts";
export { LANE_LABEL, laneSkips, normalizeLane, readChangeLane, writeChangeLane } from "../../ein-pi/agent/lib/sdd-lane.ts";
export {
	changeStanceDirective,
	normalizeTddStance,
	readActiveChangeStance,
	readChangeStance,
	readPreflightRecord,
	renderChangeStanceLine,
} from "../../ein-pi/agent/lib/sdd-preflight-record.ts";
export {
	resolveSddIntentPreflight,
	updateSddPreflightStance,
	type SddIntentPreflightInput,
	type SddIntentPreflightOutcome,
} from "../../ein-pi/agent/lib/sdd-preflight.ts";
export { writeOpenSpecDelta } from "../../ein-pi/agent/lib/openspec-delta-write.ts";
export { writeSddSummary } from "../../ein-pi/agent/lib/sdd-summary-write.ts";
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
