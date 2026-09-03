// =============================================================================
// PI PRELAUNCH UPDATE — pure orchestration over an authenticated launch plan
// Process execution is injected. This module decides exact argv, isolation,
// once-only semantics, offline behavior, and the viability fallback.
// =============================================================================

import type { LaunchPlan } from "./runtime-session-adapters.ts";
import { validLaunchPlan } from "./runtime-session-launch-plan.ts";
import { EIN_SDD_SESSION_BINDING_ENV_KEY } from "./sdd-session-binding.ts";
import { isPublishedPackageVersion } from "./runtime-compat.ts";

export const PI_PRELAUNCH_UPDATE_ARGV: readonly string[] = Object.freeze([
	"update",
	"--all",
	"--no-approve",
]);

export const PI_PRELAUNCH_UPDATE_TIMEOUT_MS = 2 * 60_000;
export const PI_PRELAUNCH_VERSION_TIMEOUT_MS = 2_000;

export type PiPrelaunchCommand = Readonly<{
	executable: string;
	argv: readonly string[];
	cwd: string;
	env: Readonly<Record<string, string>>;
	shell: false;
	stdio: "inherit" | "capture";
	timeoutMs: number;
}>;

export type PiPrelaunchCommandResult = Readonly<{ code: number; stdout: string }>;
export type PiPrelaunchRunner = (command: PiPrelaunchCommand) => Promise<PiPrelaunchCommandResult>;

export type PiPrelaunchResult =
	| Readonly<{ kind: "ready"; reason: "updated" }>
	| Readonly<{ kind: "skipped"; reason: "not-pi" | "offline" }>
	| Readonly<{ kind: "degraded"; reason: "update-failed"; version: string }>
	| Readonly<{ kind: "blocked"; reason: "invalid-launch-plan" | "pi-prelaunch-unavailable" }>;

export type PiPrelaunchCoordinator = Readonly<{
	prepare: (plan: unknown) => Promise<PiPrelaunchResult>;
}>;

export type PiPrelaunchDependencies = Readonly<{
	run: PiPrelaunchRunner;
	offline?: boolean;
	validatePlan?: (plan: unknown) => plan is LaunchPlan;
}>;

/** Mirrors Pi's documented truthy PI_OFFLINE grammar. */
export function piOfflineEnabled(value: string | undefined): boolean {
	return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

function maintenanceEnvironment(plan: LaunchPlan): Readonly<Record<string, string>> {
	const environment = { ...plan.env };
	// This one-shot metadata belongs exclusively to the interactive session
	// child. Letting `pi update` see it could consume/bind it before that child.
	delete environment[EIN_SDD_SESSION_BINDING_ENV_KEY];
	return Object.freeze(environment);
}

function command(
	plan: LaunchPlan,
	argv: readonly string[],
	stdio: PiPrelaunchCommand["stdio"],
	timeoutMs: number,
): PiPrelaunchCommand {
	return Object.freeze({
		executable: plan.executable,
		argv,
		cwd: plan.cwd,
		env: maintenanceEnvironment(plan),
		shell: false,
		stdio,
		timeoutMs,
	});
}

async function reconcilePi(
	plan: LaunchPlan,
	run: PiPrelaunchRunner,
): Promise<PiPrelaunchResult> {
	let updated = false;
	try {
		updated = (await run(command(
			plan,
			PI_PRELAUNCH_UPDATE_ARGV,
			"inherit",
			PI_PRELAUNCH_UPDATE_TIMEOUT_MS,
		))).code === 0;
	} catch {
		updated = false;
	}
	if (updated) return Object.freeze({ kind: "ready", reason: "updated" });

	try {
		const probe = await run(command(
			plan,
			Object.freeze(["--version"]),
			"capture",
			PI_PRELAUNCH_VERSION_TIMEOUT_MS,
		));
		const version = probe.stdout.trim();
		if (probe.code === 0 && isPublishedPackageVersion(version)) {
			return Object.freeze({ kind: "degraded", reason: "update-failed", version });
		}
	} catch {
		// The closed blocked result below owns all process/probe failures.
	}
	return Object.freeze({ kind: "blocked", reason: "pi-prelaunch-unavailable" });
}

export function createPiPrelaunchCoordinator(
	dependencies: PiPrelaunchDependencies,
): PiPrelaunchCoordinator {
	const validate = dependencies.validatePlan ?? validLaunchPlan;
	let piPreparation: Promise<PiPrelaunchResult> | undefined;

	return Object.freeze({
		prepare(plan: unknown): Promise<PiPrelaunchResult> {
			if (!validate(plan)) {
				return Promise.resolve(Object.freeze({ kind: "blocked", reason: "invalid-launch-plan" }));
			}
			if (plan.provider !== "pi") {
				return Promise.resolve(Object.freeze({ kind: "skipped", reason: "not-pi" }));
			}
			if (dependencies.offline) {
				return Promise.resolve(Object.freeze({ kind: "skipped", reason: "offline" }));
			}
			piPreparation ??= reconcilePi(plan, dependencies.run);
			return piPreparation;
		},
	});
}
