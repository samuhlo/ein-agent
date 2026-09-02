// =============================================================================
// PROJECT STATE CONTRACT
// Public, versioned vocabulary shared by every project-state source and
// consumer. It contains no inspection or runtime effects.
// =============================================================================

export const PROJECT_STATE_SCHEMA_VERSION = 1 as const;

export type ProjectStateQuality =
	| "current"
	| "absent"
	| "incomplete"
	| "ambiguous"
	| "legacy"
	| "stale"
	| "unbound"
	| "unavailable";

export type ProjectStateReasonCode =
	| "not-inspected"
	| "not-provided"
	| "not-found"
	| "not-a-repository"
	| "incomplete-source"
	| "ambiguous-selection"
	| "legacy-source"
	| "stale-source"
	| "invalid-source"
	| "state-mismatch"
	| "read-error"
	| "command-error"
	| "parse-error"
	| "read-success";

export type ProjectStateSource = {
	quality: ProjectStateQuality;
	reason: ProjectStateReasonCode;
	detail?: string;
};

export type ProjectStatePhase =
	| "scope"
	| "map"
	| "design"
	| "tasks"
	| "apply"
	| "verify"
	| "close";

export type ProjectStateNext = ProjectStatePhase | "done";

export type ProjectStateProvenance = "canonical" | "legacy" | "mixed" | "none";

export type ProjectStateArtifact = {
	phase: ProjectStatePhase;
	file: string;
	present: boolean;
};

export type ProjectOpenSpecState = ProjectStateSource & {
	activeChanges: readonly string[];
	selection: "none" | "selected" | "ambiguous";
	selectedChange?: string;
	phase?: ProjectStatePhase;
	next?: ProjectStateNext;
	provenance: ProjectStateProvenance;
	artifacts: readonly ProjectStateArtifact[];
	blockers: readonly string[];
	verify: ProjectVerificationOutcome;
	verifyStale: boolean;
};

export type ProjectEinBoundary = {
	present: boolean;
	complete: boolean;
};

export type ProjectEinState = ProjectStateSource & {
	path: string;
	revision?: string;
	curated: ProjectEinBoundary;
	auto: {
		present: boolean;
	};
};

export type ProjectGitChangeKind =
	| "added"
	| "copied"
	| "deleted"
	| "modified"
	| "renamed"
	| "type-changed"
	| "unmerged"
	| "unknown";

export type ProjectGitStatusCode = "." | "M" | "A" | "D" | "R" | "C" | "T" | "U" | "?";

export type ProjectGitChange = {
	path: string;
	kind: ProjectGitChangeKind;
	indexStatus: ProjectGitStatusCode;
	worktreeStatus: ProjectGitStatusCode;
	previousPath?: string;
};

export type ProjectGitState = ProjectStateSource & {
	repository: boolean | null;
	root?: string;
	head?: string;
	branch?: string;
	dirty: boolean | null;
	complete: boolean;
	changes: readonly ProjectGitChange[];
	stateRef?: string;
};

export type ProjectVerificationOutcome = "pass" | "fail" | "unknown" | "absent";

export type ProjectVerificationFreshness =
	| "current"
	| "stale"
	| "unbound"
	| "unavailable"
	| "invalid";

export type ProjectVerificationState = ProjectStateSource & {
	reportedOutcome: ProjectVerificationOutcome;
	effectiveOutcome: ProjectVerificationOutcome;
	freshness: ProjectVerificationFreshness;
	currentStateRef?: string;
	observedStateRef?: string;
};

export type ProjectRuntimeProvider = "pi" | "claude";
export type ProjectRuntimeAvailability = "available" | "unavailable" | "not-provided";

export type ProjectRuntimeError = {
	code: ProjectStateReasonCode;
	detail?: string;
};

export type ProjectRuntimeMetadata = {
	availability?: ProjectRuntimeAvailability;
	quality?: ProjectStateQuality;
	reason?: ProjectStateReasonCode;
	capabilities?: readonly string[];
	references?: readonly string[];
	errors?: readonly ProjectRuntimeError[];
};

export type ProjectRuntimeInput = Partial<
	Record<ProjectRuntimeProvider, ProjectRuntimeMetadata>
>;

export type ProjectRuntimeState = ProjectStateSource & {
	provider: ProjectRuntimeProvider;
	availability: ProjectRuntimeAvailability;
	capabilities: readonly string[];
	references: readonly string[];
	errors: readonly ProjectRuntimeError[];
};

export type ProjectIdentity = ProjectStateSource & {
	cwd: string;
	repositoryRoot?: string;
};

export type ProjectStateV1 = {
	schemaVersion: typeof PROJECT_STATE_SCHEMA_VERSION;
	identity: ProjectIdentity;
	openspec: ProjectOpenSpecState;
	ein: ProjectEinState;
	git: ProjectGitState;
	verification: ProjectVerificationState;
	runtimes: Record<ProjectRuntimeProvider, ProjectRuntimeState>;
};

export type ProjectStateRequest = {
	cwd: string;
	selectedChange?: string;
	runtime?: ProjectRuntimeInput;
};
