import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, normalize, sep } from "node:path";
import type {
	ProjectRuntimeMetadata,
	ProjectStateReasonCode,
	ProjectStateV1,
} from "./project-state.ts";
import { MAX_PROJECT_SESSIONS, scanProjectSessions } from "./sessions.ts";
import { scanClaudeProjectSessions } from "./claude-sessions.ts";
import { resolveEngramDataDir } from "./memory-contract.ts";
import {
	EIN_SDD_SESSION_BINDING_ENV_KEY,
	parseSessionBindingLaunchMetadataV1,
	serializeSessionBindingLaunchMetadataV1,
} from "./sdd-session-binding.ts";
import { isSafeChangeName } from "./sdd-routing-core.ts";

/** The runtimes exposed by the common adapter boundary. */
export type RuntimeProvider = "pi" | "claude";

/** The operations share a surface, but capability remains provider-specific. */
export type RuntimeOperation = "list" | "create" | "resume" | "launch";

/** The closed set of normalized operation outcomes. */
export type AdapterOutcome =
	| "success"
	| "unsupported"
	| "unavailable"
	| "error"
	| "cancelled";

/** Safe, adapter-owned diagnostics; runtime output never crosses this boundary. */
export type AdapterErrorCode =
	| "invalid-request"
	| "unsupported-state-version"
	| "project-identity-unavailable"
	| "project-mismatch"
	| "state-ref-unavailable"
	| "provider-mismatch"
	| "operation-not-supported"
	| "runtime-unavailable"
	| "reference-invalid"
	| "reference-not-found"
	| "reference-ambiguous"
	| "session-source-unavailable"
	| "scan-limit-exceeded"
	| "executable-unavailable"
	| "spawn-failed"
	| "process-exit"
	| "process-signalled";

/**
 * The identity carried across an adapter request/result. The fields are derived
 * from ProjectStateV1 rather than becoming a second project-state contract.
 */
export type ProjectBinding = {
	schemaVersion: ProjectStateV1["schemaVersion"];
	cwd: ProjectStateV1["identity"]["cwd"];
	repositoryRoot?: ProjectStateV1["identity"]["repositoryRoot"];
	gitStateRef?: ProjectStateV1["git"]["stateRef"];
};

/** Public session metadata. Runtime ids, paths, and transcript data stay private. */
export type SessionMetadata = {
	reference: string;
	modifiedAtMs: number;
};

export type AdapterError = {
	code: AdapterErrorCode;
	exitCode?: number;
	signal?: string;
};

export type PiCreateSessionBindingIntent = {
	change: string;
	projectCwd: string;
};

/** A launch request is discriminated so resume cannot omit its reference. */
export type LaunchIntent =
	| {
			provider: "pi";
			mode: "create";
			project: ProjectBinding;
			reference?: never;
			sessionBinding?: PiCreateSessionBindingIntent;
		}
	| {
			provider: "claude";
			mode: "create";
			project: ProjectBinding;
			reference?: never;
			sessionBinding?: never;
		}
	| {
			provider: RuntimeProvider;
			mode: "resume";
			project: ProjectBinding;
			reference: string;
			sessionBinding?: never;
		};

export type AdapterSuccess<T> = {
	provider: RuntimeProvider;
	operation: RuntimeOperation;
	outcome: "success";
	project: ProjectBinding;
	data: T;
	error?: never;
};

type AdapterFailureOutcome = Exclude<AdapterOutcome, "success">;

export type AdapterFailure = {
	provider: RuntimeProvider;
	operation: RuntimeOperation;
	outcome: AdapterFailureOutcome;
	project: ProjectBinding;
	data?: never;
	error?: AdapterError;
};

/** Data is legal only for success; safe diagnostics are legal only otherwise. */
export type AdapterResult<T = unknown> = AdapterSuccess<T> | AdapterFailure;

export type RuntimeCapabilitySupport = "supported" | "unsupported";

export type RuntimeCapabilityDescriptor = {
	provider: RuntimeProvider;
	operation: RuntimeOperation;
	support: RuntimeCapabilitySupport;
	requestOnly?: boolean;
};

export type RuntimeCapabilityMatrix = {
	readonly [provider in RuntimeProvider]: {
		readonly [operation in RuntimeOperation]: RuntimeCapabilityDescriptor;
	};
};

/**
 * Initial evidence-based matrix. Supported create cells are request-only; a
 * supported launch cell can still become unavailable when its isolated runtime
 * inputs are absent. No common method name implies equal provider support.
 */
export const RUNTIME_CAPABILITY_MATRIX = {
	pi: {
		list: {
			provider: "pi",
			operation: "list",
			support: "supported",
		},
		create: {
			provider: "pi",
			operation: "create",
			support: "supported",
			requestOnly: true,
		},
		resume: {
			provider: "pi",
			operation: "resume",
			support: "supported",
		},
		launch: {
			provider: "pi",
			operation: "launch",
			support: "supported",
		},
	},
	claude: {
		list: {
			provider: "claude",
			operation: "list",
			support: "supported",
		},
		create: {
			provider: "claude",
			operation: "create",
			support: "supported",
			requestOnly: true,
		},
		resume: {
			provider: "claude",
			operation: "resume",
			support: "supported",
		},
		launch: {
			provider: "claude",
			operation: "launch",
			support: "supported",
		},
	},
} as const satisfies RuntimeCapabilityMatrix;

export type PiSessionListOptions = {
	limit?: number;
};

export type RuntimeSessionRequestOptions = {
	project?: ProjectBinding;
};

export type RuntimeSessionRequest = {
	provider: RuntimeProvider;
	state: unknown;
	project?: ProjectBinding;
};

export type RuntimeListRequest = RuntimeSessionRequest & PiSessionListOptions;

export type RuntimeResumeRequest = RuntimeSessionRequest & {
	reference: string | LaunchIntent;
};

/**
 * The process plans the adapter can build. `argv` is not free text: it is one of
 * four exact shapes (see LAUNCH_ARGV_SHAPES), whose only variable slot is a
 * session id validated against SESSION_ID_PATTERN. Nothing a caller supplies
 * ever becomes an argument, and `shell` stays false.
 */
export type LaunchPlan = {
	provider: RuntimeProvider;
	mode: "create" | "resume";
	project: ProjectBinding;
	executable: string;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string>>;
	shell: false;
};

/** Both runtimes name sessions with a canonical uuid; anything else fails closed. */
export const SESSION_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The flag each runtime uses to resume one specific session, non-interactively. */
export const RESUME_FLAG: Readonly<Record<RuntimeProvider, string>> = {
	pi: "--session",
	claude: "--resume",
};

/**
 * The closed table the validator compares against. Asking "is this plan one of
 * the four we know how to build?" is decidable; asking "is this argument safe?"
 * is judgement, and judgement is what gets argument injection wrong.
 */
export function launchArgvFor(
	provider: RuntimeProvider,
	mode: LaunchPlan["mode"],
	sessionId?: string,
): readonly string[] | null {
	if (mode === "create") return [];
	if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) return null;
	return [RESUME_FLAG[provider], sessionId];
}

/** True only for an argv this adapter could have produced for that provider and mode. */
export function isDeclaredLaunchArgv(
	provider: RuntimeProvider,
	mode: unknown,
	argv: unknown,
): boolean {
	if (!Array.isArray(argv) || argv.some((item) => typeof item !== "string")) return false;
	if (mode === "create") return argv.length === 0;
	if (mode !== "resume") return false;
	return (
		argv.length === 2 &&
		argv[0] === RESUME_FLAG[provider] &&
		SESSION_ID_PATTERN.test(argv[1] as string)
	);
}

export type LaunchPlanOptions = {
	/** Test/runtime boundary override; callers never provide an executable name. */
	resolveExecutable?: (
		provider: RuntimeProvider,
		environment: Readonly<Record<string, string | undefined>>,
	) => string | null | undefined;
	/** Environment inherited by the eventual executor when deriving isolation. */
	environment?: Readonly<Record<string, string | undefined>>;
	/** Explicit home only for a caller that already owns environment selection. */
	home?: string;
};

export type LaunchExecutorInput = {
	executable: string;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string>>;
	shell: false;
	signal: AbortSignal;
};

export type LaunchExecutorResult =
	| { kind: "exit"; code: number }
	| { kind: "signal"; signal: string | number };

export type LaunchExecutor = (
	input: LaunchExecutorInput,
) => LaunchExecutorResult | Promise<LaunchExecutorResult>;

export type LaunchExecutionOptions = {
	executor?: LaunchExecutor;
	signal?: AbortSignal;
};

export type LaunchResult = { exitCode: 0 };

export type RuntimeSessionAdapter = {
	readonly provider: RuntimeProvider;
	readonly capabilities: readonly RuntimeCapabilityDescriptor[];
	list(
		state: unknown,
		options?: PiSessionListOptions,
		request?: RuntimeSessionRequestOptions,
	): AdapterResult<readonly SessionMetadata[]>;
	create(
		state: unknown,
		request?: RuntimeSessionRequestOptions,
	): AdapterResult<LaunchIntent>;
	resume(
		state: unknown,
		reference: string | LaunchIntent,
		request?: RuntimeSessionRequestOptions,
	): AdapterResult<LaunchIntent>;
};

const STATE_REF_PATTERN = /^git-v1:sha256:[0-9a-f]{64}$/;
const OPAQUE_REFERENCE_PATTERNS: Record<RuntimeProvider, RegExp> = {
	pi: /^pi:v1:sha256:[0-9a-f]{64}$/,
	claude: /^claude:v1:sha256:[0-9a-f]{64}$/,
};
const RUNTIME_OPERATIONS: readonly RuntimeOperation[] = [
	"list",
	"create",
	"resume",
	"launch",
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function knownProvider(value: unknown): value is RuntimeProvider {
	return value === "pi" || value === "claude";
}

function safeProvider(value: unknown): RuntimeProvider {
	return knownProvider(value) ? value : "pi";
}

/**
 * Derive the public binding without copying verification, runtime state, or any
 * filesystem details. Invalid input still yields a bounded result envelope.
 */
export function projectBindingFromState(state: unknown): ProjectBinding {
	const record = isRecord(state) ? state : {};
	const identity = isRecord(record.identity) ? record.identity : {};
	const git = isRecord(record.git) ? record.git : {};
	const cwd = typeof identity.cwd === "string" ? identity.cwd : "";
	const repositoryRoot =
		typeof identity.repositoryRoot === "string" ? identity.repositoryRoot : undefined;
	const gitStateRef = typeof git.stateRef === "string" ? git.stateRef : undefined;
	return {
		schemaVersion: 1,
		cwd,
		...(repositoryRoot ? { repositoryRoot } : {}),
		...(gitStateRef ? { gitStateRef } : {}),
	};
}

function bindingMatches(left: ProjectBinding, right: ProjectBinding): boolean {
	return (
		left.schemaVersion === right.schemaVersion &&
		normalize(left.cwd) === normalize(right.cwd) &&
		normalize(left.repositoryRoot ?? "") === normalize(right.repositoryRoot ?? "") &&
		(left.gitStateRef ?? "") === (right.gitStateRef ?? "")
	);
}

function bindingForState(state: unknown): ProjectBinding {
	const binding = projectBindingFromState(state);
	return {
		...binding,
		cwd: normalize(binding.cwd),
		...(binding.repositoryRoot ? { repositoryRoot: normalize(binding.repositoryRoot) } : {}),
	};
}

export type ProjectStateValidation =
	| { ok: true; project: ProjectBinding }
	| { ok: false; project: ProjectBinding; code: AdapterErrorCode };
type ProjectStateValidationFailure = Extract<ProjectStateValidation, { ok: false }>;

/** Validate identity and Git binding before touching any provider source. */
export function validateProjectState(
	state: unknown,
	operation: RuntimeOperation = "list",
	expectedProject?: ProjectBinding,
): ProjectStateValidation {
	const project = bindingForState(state);
	if (!isRecord(state)) {
		return { ok: false, project, code: "project-identity-unavailable" };
	}
	if (state.schemaVersion !== 1) {
		return { ok: false, project, code: "unsupported-state-version" };
	}
	const identity = isRecord(state.identity) ? state.identity : undefined;
	const git = isRecord(state.git) ? state.git : undefined;
	if (!identity || !git || typeof identity.cwd !== "string" || !isAbsolute(identity.cwd)) {
		return { ok: false, project, code: "project-identity-unavailable" };
	}

	const cwd = normalize(identity.cwd);
	const identityRoot = identity.repositoryRoot;
	if (identityRoot !== undefined && (typeof identityRoot !== "string" || !isAbsolute(identityRoot))) {
		return { ok: false, project, code: "project-identity-unavailable" };
	}
	const repository = git.repository;
	if (repository !== true && repository !== false) {
		return { ok: false, project, code: "state-ref-unavailable" };
	}

	if (repository === true) {
		if (
			typeof git.root !== "string" ||
			!isAbsolute(git.root) ||
			!identityRoot ||
			normalize(git.root) !== normalize(identityRoot) ||
			!isWithinRoot(normalize(git.root), cwd)
		) {
			return { ok: false, project, code: "project-identity-unavailable" };
		}
		if (
			git.stateRef !== undefined &&
			(typeof git.stateRef !== "string" || !STATE_REF_PATTERN.test(git.stateRef))
		) {
			return { ok: false, project, code: "state-ref-unavailable" };
		}
		if (
			operation !== "list" &&
			(git.complete !== true ||
				typeof git.stateRef !== "string" ||
				!STATE_REF_PATTERN.test(git.stateRef))
		) {
			return { ok: false, project, code: "state-ref-unavailable" };
		}
	} else {
		if (
			identityRoot !== undefined ||
			git.root !== undefined ||
			git.stateRef !== undefined ||
			git.complete !== true
		) {
			return { ok: false, project, code: "project-identity-unavailable" };
		}
	}

	if (expectedProject !== undefined) {
		if (!validProjectBinding(expectedProject) || !bindingMatches(project, normalizedBinding(expectedProject))) {
			return { ok: false, project, code: "project-mismatch" };
		}
	}
	return { ok: true, project };
}

function validProjectBinding(project: unknown): project is ProjectBinding {
	if (
		!isRecord(project) ||
		project.schemaVersion !== 1 ||
		typeof project.cwd !== "string" ||
		!isAbsolute(project.cwd)
	) {
		return false;
	}
	if (
		project.repositoryRoot !== undefined &&
		(typeof project.repositoryRoot !== "string" || !isAbsolute(project.repositoryRoot))
	) {
		return false;
	}
	if (
		project.gitStateRef !== undefined &&
		(typeof project.gitStateRef !== "string" || !STATE_REF_PATTERN.test(project.gitStateRef))
	) {
		return false;
	}
	return true;
}

function normalizedBinding(project: ProjectBinding): ProjectBinding {
	return {
		...project,
		cwd: normalize(project.cwd),
		...(project.repositoryRoot ? { repositoryRoot: normalize(project.repositoryRoot) } : {}),
	};
}

function isWithinRoot(root: string, candidate: string): boolean {
	const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
	return candidate === root || candidate.startsWith(boundary);
}

/** True only for a provider-issued opaque reference envelope. */
export function validateOpaqueReference(
	provider: RuntimeProvider,
	reference: unknown,
): reference is string {
	return (
		knownProvider(provider) &&
		typeof reference === "string" &&
		OPAQUE_REFERENCE_PATTERNS[provider].test(reference)
	);
}

export const isOpaqueReference = validateOpaqueReference;

function referenceProvider(reference: string): RuntimeProvider | undefined {
	if (/^pi:v1:sha256:/.test(reference)) return "pi";
	if (/^claude:v1:sha256:/.test(reference)) return "claude";
	return undefined;
}

function resultProject(state: unknown, expectedProject?: ProjectBinding): ProjectBinding {
	return expectedProject && validProjectBinding(expectedProject)
		? normalizedBinding(expectedProject)
		: projectBindingFromState(state);
}

function failure<T>(
	provider: RuntimeProvider,
	operation: RuntimeOperation,
	state: unknown,
	code: AdapterErrorCode,
	expectedProject?: ProjectBinding,
	outcome: AdapterFailureOutcome = "error",
): AdapterResult<T> {
	return {
		provider,
		operation,
		outcome,
		project: resultProject(state, expectedProject),
		error: { code },
	};
}

function stateFailure<T>(
	provider: unknown,
	operation: RuntimeOperation,
	state: unknown,
	validation: ProjectStateValidationFailure,
	expectedProject?: ProjectBinding,
): AdapterResult<T> {
	return failure(
		safeProvider(provider),
		operation,
		state,
		validation.code,
		expectedProject,
	);
}

/**
 * The one place the public reference format is spelled. Exported so a reader
 * that lists sessions for display derives the same reference the adapter will
 * later resolve, instead of a second, drifting implementation of the format.
 */
export function sessionReferenceFor(provider: RuntimeProvider, id: string): string {
	return `${provider}:v1:sha256:${createHash("sha256").update(id).digest("hex")}`;
}

const opaqueReference = sessionReferenceFor;

function opaquePiReference(id: string): string {
	return opaqueReference("pi", id);
}

function scanFor(provider: RuntimeProvider, project: ProjectBinding, limit: number) {
	const scope = { cwd: project.cwd, repositoryRoot: project.repositoryRoot };
	return provider === "claude"
		? scanClaudeProjectSessions(scope, limit)
		: scanProjectSessions(scope, limit);
}

/**
 * Turn a public reference back into the private session id.
 *
 * The reference is `sha256(id)` and stays irreversible: this does not invert the
 * hash, it re-scans the project's store and asks which live session hashes to
 * it. That keeps the id out of every public envelope while making resume
 * possible, and costs one bounded scan per resume instead of a persisted
 * reference→id map, which would just be the hash reversed and written to disk.
 */
export function resolveSessionReference(
	provider: RuntimeProvider,
	project: ProjectBinding,
	reference: string,
): string | undefined {
	if (!validateOpaqueReference(provider, reference)) return undefined;
	for (const session of scanFor(provider, project, MAX_PROJECT_SESSIONS).matches) {
		if (opaqueReference(provider, session.id) === reference) return session.id;
	}
	return undefined;
}

/** Compose a bounded private runtime reader into the normalized adapter boundary. */
function listProjectSessions(
	provider: RuntimeProvider,
	project: ProjectBinding,
	options: PiSessionListOptions = {},
): AdapterResult<readonly SessionMetadata[]> {
	const limit = options.limit ?? 10;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PROJECT_SESSIONS) {
		return {
			provider,
			operation: "list",
			outcome: "error",
			project,
			error: { code: "invalid-request" },
		};
	}

	const scan = scanFor(provider, project, limit);
	// A store that cannot be listed is not a store with no sessions. Collapsing
	// the two would let the app tell the user "no sessions here" about a runtime
	// it never managed to look at.
	if (scan.store === "absent") {
		return {
			provider,
			operation: "list",
			outcome: "unavailable",
			project,
			error: { code: "session-source-unavailable" },
		};
	}
	if (scan.scanLimitExceeded) {
		return {
			provider,
			operation: "list",
			outcome: "unavailable",
			project,
			error: { code: "scan-limit-exceeded" },
		};
	}

	const references = new Set<string>();
	const data: SessionMetadata[] = [];
	for (const session of scan.matches) {
		const reference = opaqueReference(provider, session.id);
		if (references.has(reference)) {
			return {
				provider,
				operation: "list",
				outcome: "error",
				project,
				error: { code: "reference-ambiguous" },
			};
		}
		references.add(reference);
		data.push({ reference, modifiedAtMs: session.mtimeMs });
	}

	return { provider, operation: "list", outcome: "success", project, data };
}

export function listPiProjectSessions(
	project: ProjectBinding,
	options: PiSessionListOptions = {},
): AdapterResult<readonly SessionMetadata[]> {
	return listProjectSessions("pi", project, options);
}

export function listClaudeProjectSessions(
	project: ProjectBinding,
	options: PiSessionListOptions = {},
): AdapterResult<readonly SessionMetadata[]> {
	return listProjectSessions("claude", project, options);
}

function requestProject(request: unknown): ProjectBinding | undefined {
	if (validProjectBinding(request)) return normalizedBinding(request);
	if (isRecord(request) && validProjectBinding(request.project)) {
		return normalizedBinding(request.project);
	}
	return undefined;
}

type RequestParts = {
	provider: unknown;
	state: unknown;
	expectedProject?: ProjectBinding;
};

function requestParts(
	providerOrRequest: unknown,
	state: unknown,
	request: unknown,
): RequestParts {
	if (isRecord(providerOrRequest) && "state" in providerOrRequest) {
		return {
			provider: providerOrRequest.provider,
			state: providerOrRequest.state,
			expectedProject:
				requestProject(request) ?? requestProject(providerOrRequest.project),
		};
	}
	return {
		provider: providerOrRequest,
		state,
		expectedProject: requestProject(request),
	};
}

function success<T>(
	provider: RuntimeProvider,
	operation: RuntimeOperation,
	project: ProjectBinding,
	data: T,
): AdapterSuccess<T> {
	return { provider, operation, outcome: "success", project, data };
}

const RUNTIME_METADATA_CAPABILITIES: Partial<Record<RuntimeOperation, string>> = {
	list: "session.list",
	create: "session.create",
	launch: "runtime.launch",
};
const MAX_RUNTIME_METADATA_REFERENCES = 20;

function adapterErrorReason(code: AdapterErrorCode | undefined): ProjectStateReasonCode {
	switch (code) {
		case "operation-not-supported":
			return "not-provided";
		case "session-source-unavailable":
		case "scan-limit-exceeded":
			return "read-error";
		case "runtime-unavailable":
		case "executable-unavailable":
		case "spawn-failed":
		case "process-exit":
		case "process-signalled":
			return "command-error";
		case "project-mismatch":
		case "provider-mismatch":
			return "state-mismatch";
		case "reference-not-found":
			return "not-found";
		case "reference-ambiguous":
			return "ambiguous-selection";
		case "invalid-request":
		case "unsupported-state-version":
		case "project-identity-unavailable":
		case "state-ref-unavailable":
		case "reference-invalid":
		default:
			return "invalid-source";
	}
}

function publicRuntimeReferences(
	provider: RuntimeProvider,
	data: unknown,
): string[] {
	if (!Array.isArray(data)) return [];
	const references: string[] = [];
	const seen = new Set<string>();
	for (const item of data) {
		if (references.length >= MAX_RUNTIME_METADATA_REFERENCES) break;
		if (!isRecord(item)) continue;
		const reference = item.reference;
		if (!validateOpaqueReference(provider, reference) || seen.has(reference)) continue;
		seen.add(reference);
		references.push(reference);
	}
	return references;
}

function failureRuntimeMetadata(
	outcome: AdapterFailureOutcome,
	code: AdapterErrorCode | undefined,
): ProjectRuntimeMetadata {
	if (outcome === "cancelled") return { availability: "unavailable" };
	const reason: ProjectStateReasonCode =
		outcome === "unsupported" ? "not-provided" : adapterErrorReason(code);
	return {
		availability: outcome === "unsupported" ? "not-provided" : "unavailable",
		reason,
		errors: [{ code: reason }],
	};
}

/**
 * Translate one transient adapter observation into the existing B metadata
 * input. This is deliberately one-way: it copies no project state and performs
 * no projection, persistence, or filesystem work.
 */
export function toProjectRuntimeMetadata(
	result: AdapterResult<unknown>,
): ProjectRuntimeMetadata {
	if (result.outcome === "success") {
		const capability = RUNTIME_METADATA_CAPABILITIES[result.operation];
		const metadata: ProjectRuntimeMetadata = {
			availability: "available",
			...(capability ? { capabilities: [capability] } : {}),
		};
		if (result.operation === "list") {
			metadata.references = publicRuntimeReferences(result.provider, result.data);
		}
		return metadata;
	}

	return failureRuntimeMetadata(result.outcome, result.error?.code);
}

/** State-bound request-only create; no runtime store or projector is touched. */
export function createSessionRequest(
	providerOrRequest: RuntimeProvider | RuntimeSessionRequest,
	state?: unknown,
	request?: RuntimeSessionRequestOptions | ProjectBinding,
): AdapterResult<LaunchIntent> {
	const parts = requestParts(providerOrRequest, state, request);
	if (!knownProvider(parts.provider)) {
		return failure("pi", "create", parts.state, "invalid-request", parts.expectedProject);
	}
	const validation = validateProjectState(parts.state, "create", parts.expectedProject);
	if (!validation.ok) {
		return stateFailure(parts.provider, "create", parts.state, validation, parts.expectedProject);
	}
	const project = validation.project;
	return success(parts.provider, "create", project, {
		provider: parts.provider,
		mode: "create",
		project,
	});
}

/** List through the common state-validating surface; Claude has no safe source. */
export function listSessionRequest(
	providerOrRequest: unknown,
	state?: unknown,
	options: PiSessionListOptions = {},
	request?: RuntimeSessionRequestOptions | ProjectBinding,
): AdapterResult<readonly SessionMetadata[]> {
	const parts = requestParts(providerOrRequest, state, request);
	const requestRecord = isRecord(providerOrRequest) && "state" in providerOrRequest
		? providerOrRequest
		: undefined;
	const actualOptions: PiSessionListOptions = requestRecord
		? { limit: typeof requestRecord.limit === "number" ? requestRecord.limit : undefined }
		: options;
	if (!knownProvider(parts.provider)) {
		return failure("pi", "list", parts.state, "invalid-request", parts.expectedProject);
	}
	const validation = validateProjectState(parts.state, "list", parts.expectedProject);
	if (!validation.ok) {
		return stateFailure(parts.provider, "list", parts.state, validation, parts.expectedProject);
	}
	const limit = actualOptions.limit ?? 10;
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PROJECT_SESSIONS) {
		return failure(parts.provider, "list", parts.state, "invalid-request");
	}
	return listProjectSessions(parts.provider, validation.project, actualOptions);
}

/**
 * Validate a same-provider opaque envelope and prove it still names a live
 * session of this project, then hand back a resume intent. The intent carries
 * the public reference, not the private id: resolution happens again inside
 * buildLaunchPlan, which is the only place that needs the id — to spell the
 * runtime's own resume flag.
 */
export function resumeSessionRequest(
	providerOrRequest: RuntimeProvider | RuntimeResumeRequest,
	state?: unknown,
	referenceOrIntent?: unknown,
	request?: RuntimeSessionRequestOptions | ProjectBinding,
): AdapterResult<LaunchIntent> {
	const parts = requestParts(providerOrRequest, state, request);
	let reference = referenceOrIntent;
	let expectedProject = parts.expectedProject;
	if (isRecord(providerOrRequest) && "state" in providerOrRequest) {
		reference = providerOrRequest.reference;
	}
	if (!knownProvider(parts.provider)) {
		return failure("pi", "resume", parts.state, "invalid-request", expectedProject);
	}
	if (isRecord(reference)) {
		const intent = reference;
		if (intent.provider !== parts.provider) {
			const validation = validateProjectState(parts.state, "resume", expectedProject);
			if (!validation.ok) return stateFailure(parts.provider, "resume", parts.state, validation, expectedProject);
			return failure(parts.provider, "resume", parts.state, "provider-mismatch", expectedProject);
		}
		if (validProjectBinding(intent.project)) {
			expectedProject = normalizedBinding(intent.project);
		}
		reference = intent.reference;
		if (intent.mode !== "resume") reference = undefined;
	}
	const validation = validateProjectState(parts.state, "resume", expectedProject);
	if (!validation.ok) return stateFailure(parts.provider, "resume", parts.state, validation, expectedProject);
	if (typeof reference !== "string") {
		return failure(parts.provider, "resume", parts.state, "reference-invalid", expectedProject);
	}
	const issuedBy = referenceProvider(reference);
	if (issuedBy !== undefined && issuedBy !== parts.provider) {
		return failure(parts.provider, "resume", parts.state, "provider-mismatch", expectedProject);
	}
	if (!validateOpaqueReference(parts.provider, reference)) {
		return failure(parts.provider, "resume", parts.state, "reference-invalid", expectedProject);
	}
	if (!resolveSessionReference(parts.provider, validation.project, reference)) {
		return failure(parts.provider, "resume", parts.state, "reference-not-found", expectedProject);
	}
	return success(parts.provider, "resume", validation.project, {
		provider: parts.provider,
		mode: "resume",
		project: validation.project,
		reference,
	});
}

/** Stable translation of the provider matrix for factory consumers. */
export function getRuntimeCapabilities(
	provider: RuntimeProvider,
): readonly RuntimeCapabilityDescriptor[] {
	if (!knownProvider(provider)) return [];
	return RUNTIME_OPERATIONS.map((operation) => RUNTIME_CAPABILITY_MATRIX[provider][operation]);
}

export function createPiSessionAdapter(): RuntimeSessionAdapter {
	return {
		provider: "pi",
		capabilities: getRuntimeCapabilities("pi"),
		list: (state, options, request) => listSessionRequest("pi", state, options, request),
		create: (state, request) => createSessionRequest("pi", state, request),
		resume: (state, reference, request) => resumeSessionRequest("pi", state, reference, request),
	};
}

export function createClaudeSessionAdapter(): RuntimeSessionAdapter {
	return {
		provider: "claude",
		capabilities: getRuntimeCapabilities("claude"),
		list: (state, options, request) => listSessionRequest("claude", state, options, request),
		create: (state, request) => createSessionRequest("claude", state, request),
		resume: (state, reference, request) => resumeSessionRequest("claude", state, reference, request),
	};
}

export function createRuntimeSessionAdapter(provider: RuntimeProvider): RuntimeSessionAdapter {
	return provider === "claude" ? createClaudeSessionAdapter() : createPiSessionAdapter();
}

const TRUSTED_LAUNCH_EXECUTABLE: Record<RuntimeProvider, string> = {
	pi: "pi",
	claude: "claude",
};
type LaunchPlanSnapshot = Readonly<{
	provider: RuntimeProvider;
	mode: LaunchPlan["mode"];
	project: ProjectBinding;
	executable: string;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string>>;
	shell: false;
}>;

const EXPECTED_LAUNCH_PLANS = new WeakMap<object, LaunchPlanSnapshot>();

function launchEnvironment(
	options: LaunchPlanOptions = {},
): Readonly<Record<string, string | undefined>> {
	return options.environment ?? process.env;
}

function isTrustedExecutable(provider: RuntimeProvider, executable: unknown): executable is string {
	return (
		typeof executable === "string" &&
		isAbsolute(executable) &&
		basename(executable) === TRUSTED_LAUNCH_EXECUTABLE[provider]
	);
}

function isExecutableFile(path: string): boolean {
	try {
		if (!existsSync(path)) return false;
		const stat = statSync(path);
		return stat.isFile() && (stat.mode & 0o111) !== 0;
	} catch {
		return false;
	}
}

/** Resolve only the adapter-owned executable name, without a shell or caller command. */
export function resolveLaunchExecutable(
	provider: RuntimeProvider,
	options: LaunchPlanOptions = {},
): string | null {
	if (!knownProvider(provider)) return null;
	const environment = launchEnvironment(options);
	if (options.resolveExecutable) {
		try {
			const resolved = options.resolveExecutable(provider, environment);
			return isTrustedExecutable(provider, resolved) ? resolved : null;
		} catch {
			return null;
		}
	}

	const pathValue = typeof environment.PATH === "string" ? environment.PATH : "";
	for (const directory of pathValue.split(delimiter).filter(Boolean)) {
		const candidate = join(directory, TRUSTED_LAUNCH_EXECUTABLE[provider]);
		if (isExecutableFile(candidate)) return normalize(candidate);
	}
	return null;
}

function isLaunchExecutableResolver(
	value: unknown,
): value is NonNullable<LaunchPlanOptions["resolveExecutable"]> {
	return typeof value === "function";
}

function isLaunchEnvironment(
	value: unknown,
): value is Readonly<Record<string, string | undefined>> {
	return (
		isRecord(value) &&
		Object.values(value).every((entry) => typeof entry === "string" || entry === undefined)
	);
}

function launchPlanOptions(value: unknown): LaunchPlanOptions {
	if (!isRecord(value)) return {};
	const options: LaunchPlanOptions = {};
	if (isLaunchExecutableResolver(value.resolveExecutable)) {
		options.resolveExecutable = value.resolveExecutable;
	}
	if (isLaunchEnvironment(value.environment)) options.environment = value.environment;
	if (typeof value.home === "string") options.home = value.home;
	return options;
}

function launchBuildArguments(
	first: unknown,
	second: unknown,
	third: unknown,
): { state: unknown; intent: unknown; options: LaunchPlanOptions } {
	if (isRecord(first) && "state" in first && "intent" in first) {
		return {
			state: first.state,
			intent: first.intent,
			options: launchPlanOptions(second),
		};
	}
	if (isRecord(first) && "mode" in first && "project" in first) {
		return {
			state: second,
			intent: first,
			options: launchPlanOptions(third),
		};
	}
	return {
		state: first,
		intent: second,
		options: launchPlanOptions(third),
	};
}

function launchFailureProject(state: unknown, intent: unknown): ProjectBinding | undefined {
	if (isRecord(intent) && validProjectBinding(intent.project)) {
		return normalizedBinding(intent.project);
	}
	return undefined;
}

function validatedPiCreateBindingMetadata(
	state: unknown,
	intent: Record<string, unknown>,
	project: ProjectBinding,
): string | null | undefined {
	if (!("sessionBinding" in intent) || intent.sessionBinding === undefined) return undefined;
	if (intent.provider !== "pi" || intent.mode !== "create" || !isRecord(intent.sessionBinding)) return null;
	const binding = intent.sessionBinding;
	if (
		Object.keys(binding).length !== 2
		|| !Object.prototype.hasOwnProperty.call(binding, "change")
		|| !Object.prototype.hasOwnProperty.call(binding, "projectCwd")
		|| !isSafeChangeName(binding.change)
		|| binding.projectCwd !== project.cwd
	) return null;
	const openspec = isRecord(state) && isRecord(state.openspec) ? state.openspec : null;
	if (
		openspec?.quality !== "current"
		|| !Array.isArray(openspec.activeChanges)
		|| !openspec.activeChanges.every((change) => typeof change === "string")
		|| !openspec.activeChanges.includes(binding.change)
	) return null;
	return serializeSessionBindingLaunchMetadataV1({
		version: 1,
		change: binding.change,
		projectCwd: binding.projectCwd,
	});
}

/**
 * Build an adapter-owned, argument-free launch plan. Caller data is used only as
 * a validated project cwd; it is never converted into argv or a command string.
 */
export function buildLaunchPlan(
	first: unknown,
	second?: unknown,
	third?: LaunchPlanOptions,
): AdapterResult<LaunchPlan> {
	const { state, intent, options } = launchBuildArguments(first, second, third);
	const providerValue = isRecord(intent) ? intent.provider : undefined;
	const provider = safeProvider(providerValue);
	const validation = validateProjectState(state, "launch");
	if (!validation.ok) {
		return stateFailure(provider, "launch", state, validation, launchFailureProject(state, intent));
	}
	if (
		!isRecord(intent) ||
		!knownProvider(providerValue) ||
		(intent.mode !== "create" && intent.mode !== "resume") ||
		!validProjectBinding(intent.project)
	) {
		return failure(provider, "launch", state, "invalid-request");
	}

	const projectValidation = validateProjectState(state, "launch", intent.project);
	if (!projectValidation.ok) {
		return stateFailure(provider, "launch", state, projectValidation, intent.project);
	}
	const project = projectValidation.project;
	const bindingMetadata = validatedPiCreateBindingMetadata(state, intent, project);
	if (bindingMetadata === null) {
		return failure(provider, "launch", state, "invalid-request", project);
	}

	let argv: readonly string[] | null = [];
	if (intent.mode === "resume") {
		const reference = intent.reference;
		const issuedBy = typeof reference === "string" ? referenceProvider(reference) : undefined;
		if (issuedBy !== undefined && issuedBy !== provider) {
			return failure(provider, "launch", state, "provider-mismatch", project);
		}
		if (!validateOpaqueReference(provider, reference)) {
			return failure(provider, "launch", state, "reference-invalid", project);
		}
		const sessionId = resolveSessionReference(provider, project, reference);
		if (!sessionId) {
			return failure(provider, "launch", state, "reference-not-found", project);
		}
		argv = launchArgvFor(provider, "resume", sessionId);
		// A store that names a session with something other than a canonical uuid
		// cannot be resumed safely, so it is refused rather than passed through.
		if (!argv) return failure(provider, "launch", state, "reference-invalid", project);
	} else if ("reference" in intent && intent.reference !== undefined) {
		return failure(provider, "launch", state, "invalid-request", project);
	}

	const environment = launchEnvironment(options);
	const home = options.home ?? environment.HOME;
	if (typeof home !== "string" || !isAbsolute(home)) {
		return failure(provider, "launch", state, "runtime-unavailable", project, "unavailable");
	}
	const executable = resolveLaunchExecutable(provider, { ...options, environment });
	if (!executable) {
		return failure(provider, "launch", state, "executable-unavailable", project, "unavailable");
	}

	const piHome = join(home, ".pi-ein", "agent");
	const claudeHome = join(home, ".claude-ein");
	const engramHome = resolveEngramDataDir(provider, { HOME: home })!;
	const env: Readonly<Record<string, string>> = provider === "pi"
		? {
				PI_CODING_AGENT_DIR: piHome,
				EIN_PI_AGENT_HOME: piHome,
				ENGRAM_DATA_DIR: engramHome,
				...(bindingMetadata ? { [EIN_SDD_SESSION_BINDING_ENV_KEY]: bindingMetadata } : {}),
			}
		: {
				CLAUDE_CONFIG_DIR: claudeHome,
				ENGRAM_DATA_DIR: engramHome,
				PATH: [
					join(claudeHome, "bin"),
					typeof environment.PATH === "string" ? environment.PATH : "",
				].filter(Boolean).join(delimiter),
			};
	const plan: LaunchPlan = {
		provider,
		mode: intent.mode,
		project,
		executable,
		argv,
		cwd: project.cwd,
		env,
		shell: false,
	};
	EXPECTED_LAUNCH_PLANS.set(plan, Object.freeze({
		provider,
		mode: intent.mode,
		project: Object.freeze({ ...project }),
		executable,
		argv: Object.freeze([...argv]),
		cwd: project.cwd,
		env: Object.freeze({ ...env }),
		shell: false,
	}));
	return success(provider, "launch", project, plan);
}

function exactRecordValues(
	actual: Record<string, unknown>,
	expected: Readonly<Record<string, unknown>>,
): boolean {
	const actualKeys = Object.keys(actual).sort();
	const expectedKeys = Object.keys(expected).sort();
	return actualKeys.length === expectedKeys.length
		&& actualKeys.every((key, index) => key === expectedKeys[index] && actual[key] === expected[key]);
}

function validLaunchPlan(value: unknown): value is LaunchPlan {
	if (!isRecord(value) || !knownProvider(value.provider)) return false;
	const snapshot = EXPECTED_LAUNCH_PLANS.get(value);
	if (!snapshot) return false;
	if (Object.keys(value).sort().join("\0") !== [
		"argv", "cwd", "env", "executable", "mode", "project", "provider", "shell",
	].join("\0")) return false;
	if (
		value.provider !== snapshot.provider
		|| value.mode !== snapshot.mode
		|| value.executable !== snapshot.executable
		|| value.cwd !== snapshot.cwd
		|| value.shell !== snapshot.shell
	) return false;
	if (!validProjectBinding(value.project) || !exactRecordValues(value.project, snapshot.project)) return false;
	if (normalize(value.cwd) !== normalize(value.project.cwd)) return false;
	if (!isTrustedExecutable(value.provider, value.executable) || value.shell !== false) return false;
	if (!isDeclaredLaunchArgv(value.provider, value.mode, value.argv) || !Array.isArray(value.argv)) return false;
	if (value.argv.length !== snapshot.argv.length || value.argv.some((part, index) => part !== snapshot.argv[index])) return false;
	const environment = value.env;
	if (!isRecord(environment) || !exactRecordValues(environment, snapshot.env)) return false;
	const metadata = environment[EIN_SDD_SESSION_BINDING_ENV_KEY];
	if (metadata !== undefined) {
		if (value.provider !== "pi" || value.mode !== "create" || typeof metadata !== "string") return false;
		const parsed = parseSessionBindingLaunchMetadataV1(metadata);
		if (!parsed || parsed.projectCwd !== value.cwd) return false;
	}
	return true;
}

const SIGNAL_BY_NUMBER: Readonly<Record<number, string>> = {
	1: "SIGHUP",
	2: "SIGINT",
	3: "SIGQUIT",
	6: "SIGABRT",
	9: "SIGKILL",
	13: "SIGPIPE",
	14: "SIGALRM",
	15: "SIGTERM",
};
const KNOWN_SIGNAL_TOKENS = new Set([
	"SIGHUP",
	"SIGINT",
	"SIGQUIT",
	"SIGABRT",
	"SIGKILL",
	"SIGPIPE",
	"SIGALRM",
	"SIGTERM",
	"SIGUSR1",
	"SIGUSR2",
	"SIGCHLD",
	"SIGCONT",
	"SIGSTOP",
	"SIGTSTP",
	"SIGTTIN",
	"SIGTTOU",
]);

/** Normalize process termination to a closed, non-sensitive signal token. */
export function normalizeLaunchSignal(value: unknown): string {
	if (typeof value === "number" && Number.isInteger(value)) {
		return SIGNAL_BY_NUMBER[value] ?? "SIGUNKNOWN";
	}
	if (typeof value === "string") {
		const signal = value.trim().toUpperCase();
		if (KNOWN_SIGNAL_TOKENS.has(signal)) return signal;
	}
	return "SIGUNKNOWN";
}

/** Normalize an exit code without exposing process output or exception details. */
export function normalizeLaunchExitCode(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

export type NormalizedLaunchExecution =
	| { kind: "exit"; code: number }
	| { kind: "signal"; signal: string };

export function normalizeLaunchExecution(value: unknown): NormalizedLaunchExecution | null {
	if (!isRecord(value)) return null;
	if (value.kind === "exit" || value.outcome === "exit") {
		const code = normalizeLaunchExitCode(value.code ?? value.exitCode);
		return code === undefined ? null : { kind: "exit", code };
	}
	if (value.kind === "signal" || value.outcome === "signal") {
		return { kind: "signal", signal: normalizeLaunchSignal(value.signal) };
	}
	return null;
}

function inheritedProcessEnvironment(overrides: Readonly<Record<string, string>>): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") environment[key] = value;
	}
	Object.assign(environment, overrides);
	return environment;
}

function defaultLaunchExecutor(input: LaunchExecutorInput): Promise<LaunchExecutorResult> {
	return new Promise((resolve, reject) => {
		let child: ReturnType<typeof Bun.spawn>;
		try {
			child = Bun.spawn([input.executable, ...input.argv], {
				cwd: input.cwd,
				env: inheritedProcessEnvironment(input.env),
				stdin: "inherit",
				stdout: "inherit",
				stderr: "inherit",
			});
		} catch {
			reject(new Error("spawn failed"));
			return;
		}

		const abort = () => {
			try {
				child.kill();
			} catch {
				// The executor result remains normalized by executeLaunchPlan.
			}
		};
		if (input.signal.aborted) abort();
		else input.signal.addEventListener("abort", abort, { once: true });
		child.exited.then(
			(code) => {
				input.signal.removeEventListener("abort", abort);
				resolve({ kind: "exit", code });
			},
			() => {
				input.signal.removeEventListener("abort", abort);
				reject(new Error("process wait failed"));
			},
		);
	});
}

function executeFailure(
	plan: LaunchPlan,
	code: AdapterErrorCode,
	outcome: AdapterFailureOutcome,
	extra: Partial<AdapterError> = {},
): AdapterResult<LaunchResult> {
	return {
		provider: plan.provider,
		operation: "launch",
		outcome,
		project: plan.project,
		error: { code, ...extra },
	};
}

/** Execute a validated plan through an injectable non-shell process boundary. */
export async function executeLaunchPlan(
	plan: unknown,
	executorOrOptions?: LaunchExecutor | LaunchExecutionOptions,
	signal?: AbortSignal,
): Promise<AdapterResult<LaunchResult>> {
	if (!validLaunchPlan(plan)) {
		const provider = isRecord(plan) && knownProvider(plan.provider) ? plan.provider : "pi";
		const project: ProjectBinding = isRecord(plan) && validProjectBinding(plan.project)
			? normalizedBinding(plan.project)
			: { schemaVersion: 1, cwd: "" };
		return {
			provider,
			operation: "launch",
			outcome: "error",
			project,
			error: { code: "invalid-request" },
		};
	}

	let executor: LaunchExecutor = defaultLaunchExecutor;
	let requestSignal = signal;
	if (typeof executorOrOptions === "function") {
		executor = executorOrOptions;
	} else if (executorOrOptions) {
		executor = executorOrOptions.executor ?? defaultLaunchExecutor;
		requestSignal = executorOrOptions.signal ?? requestSignal;
	}
	const activeSignal = requestSignal ?? new AbortController().signal;
	if (activeSignal.aborted) {
		return { provider: plan.provider, operation: "launch", outcome: "cancelled", project: plan.project };
	}

	try {
		const execution = normalizeLaunchExecution(await executor({
			executable: plan.executable,
			argv: plan.argv,
			cwd: plan.cwd,
			env: plan.env,
			shell: false,
			signal: activeSignal,
		}));
		if (activeSignal.aborted) {
			return { provider: plan.provider, operation: "launch", outcome: "cancelled", project: plan.project };
		}
		if (!execution) return executeFailure(plan, "spawn-failed", "unavailable");
		if (execution.kind === "signal") {
			return executeFailure(plan, "process-signalled", "error", { signal: execution.signal });
		}
		if (execution.code !== 0) {
			return executeFailure(plan, "process-exit", "error", { exitCode: execution.code });
		}
		return success(plan.provider, "launch", plan.project, { exitCode: 0 });
	} catch {
		if (activeSignal.aborted) {
			return { provider: plan.provider, operation: "launch", outcome: "cancelled", project: plan.project };
		}
		return executeFailure(plan, "spawn-failed", "unavailable");
	}
}
