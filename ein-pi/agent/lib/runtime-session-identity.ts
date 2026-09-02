// =============================================================================
// RUNTIME SESSION IDENTITY
// Owns project binding validation and irreversible public session references
// without exposing provider ids, paths, or transcript data.
// =============================================================================

import { createHash } from "node:crypto";
import { isAbsolute, normalize, sep } from "node:path";
import { scanClaudeProjectSessions } from "./claude-sessions.ts";
import { MAX_PROJECT_SESSIONS, scanProjectSessions } from "./sessions.ts";
import type {
	AdapterErrorCode,
	AdapterOutcome,
	AdapterResult,
	ProjectBinding,
	RuntimeOperation,
	RuntimeProvider,
} from "./runtime-session-adapters.ts";

const STATE_REF_PATTERN = /^git-v1:sha256:[0-9a-f]{64}$/;
const OPAQUE_REFERENCE_PATTERNS: Record<RuntimeProvider, RegExp> = {
	pi: /^pi:v1:sha256:[0-9a-f]{64}$/,
	claude: /^claude:v1:sha256:[0-9a-f]{64}$/,
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function knownProvider(value: unknown): value is RuntimeProvider {
	return value === "pi" || value === "claude";
}

export function safeProvider(value: unknown): RuntimeProvider {
	return knownProvider(value) ? value : "pi";
}

/** Derive the public binding without copying unrelated project state. */
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
		...(binding.repositoryRoot
			? { repositoryRoot: normalize(binding.repositoryRoot) }
			: {}),
	};
}

export type ProjectStateValidation =
	| { ok: true; project: ProjectBinding }
	| { ok: false; project: ProjectBinding; code: AdapterErrorCode };

export type ProjectStateValidationFailure = Extract<
	ProjectStateValidation,
	{ ok: false }
>;

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
	if (
		identityRoot !== undefined &&
		(typeof identityRoot !== "string" || !isAbsolute(identityRoot))
	) {
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
	} else if (
		identityRoot !== undefined ||
		git.root !== undefined ||
		git.stateRef !== undefined ||
		git.complete !== true
	) {
		return { ok: false, project, code: "project-identity-unavailable" };
	}

	if (
		expectedProject !== undefined &&
		(!validProjectBinding(expectedProject) ||
			!bindingMatches(project, normalizedBinding(expectedProject)))
	) {
		return { ok: false, project, code: "project-mismatch" };
	}
	return { ok: true, project };
}

export function validProjectBinding(project: unknown): project is ProjectBinding {
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
		(typeof project.repositoryRoot !== "string" ||
			!isAbsolute(project.repositoryRoot))
	) {
		return false;
	}
	if (
		project.gitStateRef !== undefined &&
		(typeof project.gitStateRef !== "string" ||
			!STATE_REF_PATTERN.test(project.gitStateRef))
	) {
		return false;
	}
	return true;
}

export function normalizedBinding(project: ProjectBinding): ProjectBinding {
	return {
		...project,
		cwd: normalize(project.cwd),
		...(project.repositoryRoot
			? { repositoryRoot: normalize(project.repositoryRoot) }
			: {}),
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

export function referenceProvider(reference: string): RuntimeProvider | undefined {
	if (/^pi:v1:sha256:/.test(reference)) return "pi";
	if (/^claude:v1:sha256:/.test(reference)) return "claude";
	return undefined;
}

function resultProject(
	state: unknown,
	expectedProject?: ProjectBinding,
): ProjectBinding {
	return expectedProject && validProjectBinding(expectedProject)
		? normalizedBinding(expectedProject)
		: projectBindingFromState(state);
}

type AdapterFailureOutcome = Exclude<AdapterOutcome, "success">;

export function failure<T>(
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

export function stateFailure<T>(
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

/** The one place the public reference format is spelled. */
export function sessionReferenceFor(provider: RuntimeProvider, id: string): string {
	return `${provider}:v1:sha256:${createHash("sha256").update(id).digest("hex")}`;
}

export function scanRuntimeSessions(
	provider: RuntimeProvider,
	project: ProjectBinding,
	limit: number,
) {
	const scope = { cwd: project.cwd, repositoryRoot: project.repositoryRoot };
	return provider === "claude"
		? scanClaudeProjectSessions(scope, limit)
		: scanProjectSessions(scope, limit);
}

/** Resolve a public hash by scanning only the bounded project session store. */
export function resolveSessionReference(
	provider: RuntimeProvider,
	project: ProjectBinding,
	reference: string,
): string | undefined {
	if (!validateOpaqueReference(provider, reference)) return undefined;
	for (const session of scanRuntimeSessions(
		provider,
		project,
		MAX_PROJECT_SESSIONS,
	).matches) {
		if (sessionReferenceFor(provider, session.id) === reference) return session.id;
	}
	return undefined;
}
