// =============================================================================
// SDD GUARDRAILS — PI COMPOSITION
// Conserva el entrypoint histórico y traduce el lane persistido a la lista de
// fases que consume el coordinador neutral.
// =============================================================================

import { createLintChange } from "./sdd-change-validation.ts";
import { LANE_PHASES, readChangeLane } from "./sdd-lane.ts";

export * from "./sdd-artifact-validation.ts";
export {
	lintCanonicalBases,
	readOpenSpecState,
	readSpecDeltaDeclaration,
} from "./sdd-change-validation.ts";
export type {
	ChangeLintReport,
	SpecDeltaDeclaration,
} from "./sdd-change-validation.ts";

export const lintChange = createLintChange(
	(changePath) => LANE_PHASES[readChangeLane(changePath)],
);
