import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { readProjectEinState } from "./project-state-ein.ts";
import { readProjectGitState } from "./project-state-git.ts";
import { readProjectOpenSpecState } from "./project-state-openspec.ts";
import { projectRuntimeState } from "./project-state-runtime.ts";
import { readProjectVerificationState } from "./project-state-verification.ts";
import {
	PROJECT_STATE_SCHEMA_VERSION,
	type ProjectStateQuality,
	type ProjectStateRequest,
	type ProjectStateV1,
} from "./project-state-contract.ts";

export * from "./project-state-contract.ts";

/**
 * [DATA] PROJECT GIT PROJECTION
 * ---------------------------------------------------------
 * B owns repository meaning; G receives only the bounded current authority.
 * Current changes are deliberately excluded because they are not a historical transition.
 */
export function projectGitStateForReviewedArea(state: ProjectStateV1): Readonly<{
	repository: boolean | null;
	complete: boolean;
	quality: ProjectStateQuality;
	stateRef?: string;
	dirty: boolean | null;
}> {
	return Object.freeze({
		repository: state.git.repository,
		complete: state.git.complete,
		quality: state.git.quality,
		...(state.git.stateRef ? { stateRef: state.git.stateRef } : {}),
		dirty: state.git.dirty,
	});
}

export const reviewedAreaGitInput = projectGitStateForReviewedArea;

export function projectProjectState({ cwd, selectedChange, runtime }: ProjectStateRequest): ProjectStateV1 {
	let physicalCwd: string;
	try {
		physicalCwd = realpathSync(cwd);
	} catch {
		physicalCwd = resolve(cwd);
	}
	const git = readProjectGitState(physicalCwd);
	const openspec = readProjectOpenSpecState(physicalCwd, selectedChange);
	return {
		schemaVersion: PROJECT_STATE_SCHEMA_VERSION,
		identity: {
			cwd: physicalCwd,
			quality: git.quality,
			reason: git.reason,
			...(git.root ? { repositoryRoot: git.root } : {}),
		},
		openspec,
		ein: readProjectEinState(physicalCwd),
		git,
		verification: readProjectVerificationState(physicalCwd, openspec, git),
		runtimes: {
			pi: projectRuntimeState("pi", runtime?.pi),
			claude: projectRuntimeState("claude", runtime?.claude),
		},
	};
}
