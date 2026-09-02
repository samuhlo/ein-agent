// =============================================================================
// RUNTIME SESSION LAUNCH EXECUTION
// Executes authenticated launch plans through a fixed non-shell boundary and
// normalizes process outcomes without leaking output or exception details.
// =============================================================================

import {
	isRecord,
	knownProvider,
	normalizedBinding,
	validProjectBinding,
} from "./runtime-session-identity.ts";
import { validLaunchPlan } from "./runtime-session-launch-plan.ts";
import type {
	AdapterError,
	AdapterErrorCode,
	AdapterOutcome,
	AdapterResult,
	LaunchExecutionOptions,
	LaunchExecutor,
	LaunchExecutorInput,
	LaunchExecutorResult,
	LaunchPlan,
	LaunchResult,
	ProjectBinding,
} from "./runtime-session-adapters.ts";

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

/** Normalize an exit code without exposing output or exception details. */
export function normalizeLaunchExitCode(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 0
		? value
		: undefined;
}

export type NormalizedLaunchExecution =
	| { kind: "exit"; code: number }
	| { kind: "signal"; signal: string };

export function normalizeLaunchExecution(
	value: unknown,
): NormalizedLaunchExecution | null {
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

function inheritedProcessEnvironment(
	overrides: Readonly<Record<string, string>>,
): Record<string, string> {
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
				// The result remains normalized by executeLaunchPlan.
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

type AdapterFailureOutcome = Exclude<AdapterOutcome, "success">;

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

/** Execute an authenticated plan through an injectable process boundary. */
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
		return {
			provider: plan.provider,
			operation: "launch",
			outcome: "cancelled",
			project: plan.project,
		};
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
			return {
				provider: plan.provider,
				operation: "launch",
				outcome: "cancelled",
				project: plan.project,
			};
		}
		if (!execution) return executeFailure(plan, "spawn-failed", "unavailable");
		if (execution.kind === "signal") {
			return executeFailure(plan, "process-signalled", "error", {
				signal: execution.signal,
			});
		}
		if (execution.code !== 0) {
			return executeFailure(plan, "process-exit", "error", {
				exitCode: execution.code,
			});
		}
		return {
			provider: plan.provider,
			operation: "launch",
			outcome: "success",
			project: plan.project,
			data: { exitCode: 0 },
		};
	} catch {
		if (activeSignal.aborted) {
			return {
				provider: plan.provider,
				operation: "launch",
				outcome: "cancelled",
				project: plan.project,
			};
		}
		return executeFailure(plan, "spawn-failed", "unavailable");
	}
}
