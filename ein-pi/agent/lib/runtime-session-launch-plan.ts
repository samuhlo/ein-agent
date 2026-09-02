// =============================================================================
// RUNTIME SESSION LAUNCH PLAN
// Builds and authenticates fixed, non-shell runtime launch plans. Process
// execution stays outside this module.
// =============================================================================

import { existsSync, statSync } from "node:fs";
import { basename, delimiter, isAbsolute, join, normalize } from "node:path";
import { resolveEngramDataDir } from "./memory-contract.ts";
import {
	failure,
	isRecord,
	knownProvider,
	normalizedBinding,
	referenceProvider,
	resolveSessionReference,
	safeProvider,
	stateFailure,
	validProjectBinding,
	validateOpaqueReference,
	validateProjectState,
} from "./runtime-session-identity.ts";
import type { AdapterResult, LaunchPlan, LaunchPlanOptions, ProjectBinding, RuntimeProvider } from "./runtime-session-adapters.ts";
import {
	EIN_SDD_SESSION_BINDING_ENV_KEY,
	parseSessionBindingLaunchMetadataV1,
	serializeSessionBindingLaunchMetadataV1,
} from "./sdd-session-binding.ts";
import { isSafeChangeName } from "./sdd-routing-core.ts";

/** Both runtimes name sessions with a canonical uuid. */
export const SESSION_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The flag each runtime uses to resume one specific session. */
export const RESUME_FLAG: Readonly<Record<RuntimeProvider, string>> = {
	pi: "--session",
	claude: "--resume",
};

export function launchArgvFor(
	provider: RuntimeProvider,
	mode: LaunchPlan["mode"],
	sessionId?: string,
): readonly string[] | null {
	if (mode === "create") return [];
	if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) return null;
	return [RESUME_FLAG[provider], sessionId];
}

/** True only for an argv this adapter could have produced. */
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

function launchEnvironment(options: LaunchPlanOptions = {}): Readonly<Record<string, string | undefined>> {
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

/** Resolve only the adapter-owned executable name. */
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

function isLaunchEnvironment(value: unknown): value is Readonly<Record<string, string | undefined>> {
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

function launchFailureProject(intent: unknown): ProjectBinding | undefined {
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
	if (
		intent.provider !== "pi" ||
		intent.mode !== "create" ||
		!isRecord(intent.sessionBinding)
	) return null;
	const binding = intent.sessionBinding;
	if (
		Object.keys(binding).length !== 2 ||
		!Object.prototype.hasOwnProperty.call(binding, "change") ||
		!Object.prototype.hasOwnProperty.call(binding, "projectCwd") ||
		!isSafeChangeName(binding.change) ||
		binding.projectCwd !== project.cwd
	) return null;
	const openspec = isRecord(state) && isRecord(state.openspec) ? state.openspec : null;
	if (
		openspec?.quality !== "current" ||
		!Array.isArray(openspec.activeChanges) ||
		!openspec.activeChanges.every((change) => typeof change === "string") ||
		!openspec.activeChanges.includes(binding.change)
	) return null;
	return serializeSessionBindingLaunchMetadataV1({
		version: 1,
		change: binding.change,
		projectCwd: binding.projectCwd,
	});
}

function success(
	provider: RuntimeProvider,
	project: ProjectBinding,
	plan: LaunchPlan,
): AdapterResult<LaunchPlan> {
	return { provider, operation: "launch", outcome: "success", project, data: plan };
}

/** Build an authenticated, non-shell launch plan from validated state. */
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
		return stateFailure(provider, "launch", state, validation, launchFailureProject(intent));
	}
	if (
		!isRecord(intent) ||
		!knownProvider(providerValue) ||
		(intent.mode !== "create" && intent.mode !== "resume") ||
		!validProjectBinding(intent.project)
	) return failure(provider, "launch", state, "invalid-request");

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
		const issuedBy =
			typeof reference === "string" ? referenceProvider(reference) : undefined;
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
				...(bindingMetadata
					? { [EIN_SDD_SESSION_BINDING_ENV_KEY]: bindingMetadata }
					: {}),
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
	return success(provider, project, plan);
}

function exactRecordValues(
	actual: Record<string, unknown>,
	expected: Readonly<Record<string, unknown>>,
): boolean {
	const actualKeys = Object.keys(actual).sort();
	const expectedKeys = Object.keys(expected).sort();
	return actualKeys.length === expectedKeys.length &&
		actualKeys.every(
			(key, index) => key === expectedKeys[index] && actual[key] === expected[key],
		);
}

/** Authenticate that a plan is the unchanged object built by this owner. */
export function validLaunchPlan(value: unknown): value is LaunchPlan {
	if (!isRecord(value) || !knownProvider(value.provider)) return false;
	const snapshot = EXPECTED_LAUNCH_PLANS.get(value);
	if (!snapshot) return false;
	if (Object.keys(value).sort().join("\0") !== [
		"argv", "cwd", "env", "executable", "mode", "project", "provider", "shell",
	].join("\0")) return false;
	if (
		value.provider !== snapshot.provider ||
		value.mode !== snapshot.mode ||
		value.executable !== snapshot.executable ||
		value.cwd !== snapshot.cwd ||
		value.shell !== snapshot.shell
	) return false;
	if (
		!validProjectBinding(value.project) ||
		!exactRecordValues(value.project, snapshot.project)
	) return false;
	if (normalize(value.cwd) !== normalize(value.project.cwd)) return false;
	if (!isTrustedExecutable(value.provider, value.executable) || value.shell !== false) {
		return false;
	}
	if (
		!isDeclaredLaunchArgv(value.provider, value.mode, value.argv) ||
		!Array.isArray(value.argv)
	) return false;
	if (
		value.argv.length !== snapshot.argv.length ||
		value.argv.some((part, index) => part !== snapshot.argv[index])
	) return false;
	const environment = value.env;
	if (!isRecord(environment) || !exactRecordValues(environment, snapshot.env)) return false;
	const metadata = environment[EIN_SDD_SESSION_BINDING_ENV_KEY];
	if (metadata !== undefined) {
		if (
			value.provider !== "pi" ||
			value.mode !== "create" ||
			typeof metadata !== "string"
		) return false;
		const parsed = parseSessionBindingLaunchMetadataV1(metadata);
		if (!parsed || parsed.projectCwd !== value.cwd) return false;
	}
	return true;
}
