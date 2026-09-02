import type {
	ProjectRuntimeMetadata,
	ProjectStateReasonCode,
	ProjectStateV1,
} from "./project-state.ts";
import { MAX_PROJECT_SESSIONS } from "./sessions.ts";
import {
	failure,
	isOpaqueReference,
	isRecord,
	knownProvider,
	normalizedBinding,
	projectBindingFromState,
	referenceProvider,
	resolveSessionReference,
	safeProvider,
	scanRuntimeSessions,
	sessionReferenceFor,
	stateFailure,
	validProjectBinding,
	validateOpaqueReference,
	validateProjectState,
} from "./runtime-session-identity.ts";

export {
	isOpaqueReference,
	projectBindingFromState,
	resolveSessionReference,
	sessionReferenceFor,
	validateOpaqueReference,
	validateProjectState,
};
export type { ProjectStateValidation } from "./runtime-session-identity.ts";
export {
	buildLaunchPlan,
	isDeclaredLaunchArgv,
	launchArgvFor,
	RESUME_FLAG,
	resolveLaunchExecutable,
	SESSION_ID_PATTERN,
} from "./runtime-session-launch-plan.ts";
export {
	executeLaunchPlan,
	normalizeLaunchExecution,
	normalizeLaunchExitCode,
	normalizeLaunchSignal,
} from "./runtime-session-launch-execution.ts";
export type { NormalizedLaunchExecution } from "./runtime-session-launch-execution.ts";

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

const RUNTIME_OPERATIONS: readonly RuntimeOperation[] = [
	"list",
	"create",
	"resume",
	"launch",
];

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

	const scan = scanRuntimeSessions(provider, project, limit);
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
		const reference = sessionReferenceFor(provider, session.id);
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
