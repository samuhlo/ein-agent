import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";
import type { LaunchPlan } from "../ein-pi/agent/lib/runtime-session-adapters.ts";
import {
	PI_PRELAUNCH_UPDATE_ARGV,
	createPiPrelaunchCoordinator,
	piOfflineEnabled,
	type PiPrelaunchCommand,
} from "../ein-pi/agent/lib/pi-prelaunch-update.ts";
import { buildLaunchPlan } from "../ein-pi/agent/lib/runtime-session-adapters.ts";
import { EIN_SDD_SESSION_BINDING_ENV_KEY } from "../ein-pi/agent/lib/sdd-session-binding.ts";

function stateFor(cwd: string): ProjectStateV1 {
	return {
		schemaVersion: 1,
		identity: { quality: "current", reason: "read-success", cwd },
		openspec: { quality: "current", reason: "read-success", activeChanges: ["active-change"] } as unknown as ProjectStateV1["openspec"],
		ein: {} as ProjectStateV1["ein"],
		git: { quality: "current", reason: "read-success", repository: false, dirty: false, complete: true, changes: [] },
		verification: {} as ProjectStateV1["verification"],
		runtimes: {} as ProjectStateV1["runtimes"],
	} as ProjectStateV1;
}

async function fixture(provider: "pi" | "claude" = "pi") {
	const home = mkdtempSync(join(tmpdir(), "ein-pi-prelaunch-"));
	const bin = join(home, "bin");
	mkdirSync(bin);
	const executable = join(bin, provider);
	writeFileSync(executable, "#!/bin/sh\nexit 0\n");
	chmodSync(executable, 0o755);
	const state = stateFor(home);
	const adapter = provider === "pi"
		? (await import("../ein-pi/agent/lib/runtime-session-adapters.ts")).createPiSessionAdapter()
		: (await import("../ein-pi/agent/lib/runtime-session-adapters.ts")).createClaudeSessionAdapter();
	const intent = adapter.create(state);
	if (intent.outcome !== "success") throw new Error("fixture intent unavailable");
	const built = buildLaunchPlan(state, intent.data, {
		home,
		environment: { HOME: home, PATH: bin },
		resolveExecutable: () => executable,
	});
	if (built.outcome !== "success") throw new Error("fixture plan unavailable");
	return { home, plan: built.data };
}

describe("Pi prelaunch update", () => {
	test("runs exact update argv before launch inputs and only once per coordinator", async () => {
		const { home, plan } = await fixture("pi");
		try {
			const calls: PiPrelaunchCommand[] = [];
			const coordinator = createPiPrelaunchCoordinator({
				run: async (command) => { calls.push(command); return { code: 0, stdout: "" }; },
			});

			const first = coordinator.prepare(plan);
			const second = coordinator.prepare(plan);
			expect(await first).toEqual({ kind: "ready", reason: "updated" });
			expect(await second).toEqual({ kind: "ready", reason: "updated" });
			expect(calls).toHaveLength(1);
			expect(calls[0]).toMatchObject({
				executable: plan.executable,
				argv: PI_PRELAUNCH_UPDATE_ARGV,
				cwd: plan.cwd,
				shell: false,
				stdio: "inherit",
			});
			expect(calls[0]?.env.PI_CODING_AGENT_DIR).toBe(join(home, ".pi-ein", "agent"));
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("never exposes one-shot session binding metadata to the updater", async () => {
		const { home, plan } = await fixture("pi");
		try {
			const planWithBinding: LaunchPlan = {
				...plan,
				env: { ...plan.env, [EIN_SDD_SESSION_BINDING_ENV_KEY]: "untrusted-test" },
			};
			const calls: PiPrelaunchCommand[] = [];
			const coordinator = createPiPrelaunchCoordinator({
				run: async (command) => { calls.push(command); return { code: 0, stdout: "" }; },
				validatePlan: (_value): _value is LaunchPlan => true,
			});
			await coordinator.prepare(planWithBinding);
			expect(calls[0]?.env[EIN_SDD_SESSION_BINDING_ENV_KEY]).toBeUndefined();
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("skips Claude without consuming the Pi preparation and respects offline mode", async () => {
		const piFixture = await fixture("pi");
		const claudeFixture = await fixture("claude");
		try {
			let calls = 0;
			const coordinator = createPiPrelaunchCoordinator({
				run: async () => { calls += 1; return { code: 0, stdout: "" }; },
			});
			expect(await coordinator.prepare(claudeFixture.plan)).toEqual({ kind: "skipped", reason: "not-pi" });
			expect(await coordinator.prepare(piFixture.plan)).toEqual({ kind: "ready", reason: "updated" });
			expect(calls).toBe(1);

			const offline = createPiPrelaunchCoordinator({
				offline: true,
				run: async () => { calls += 1; return { code: 0, stdout: "" }; },
			});
			expect(await offline.prepare(piFixture.plan)).toEqual({ kind: "skipped", reason: "offline" });
			expect(calls).toBe(1);
			expect(["1", "true", "YES"].every((value) => piOfflineEnabled(value))).toBe(true);
			expect([undefined, "", "0", "false"].some((value) => piOfflineEnabled(value))).toBe(false);
		} finally {
			rmSync(piFixture.home, { recursive: true, force: true });
			rmSync(claudeFixture.home, { recursive: true, force: true });
		}
	});

	test("degrades after update failure only when the installed host remains viable", async () => {
		const { home, plan } = await fixture("pi");
		try {
			const calls: PiPrelaunchCommand[] = [];
			const coordinator = createPiPrelaunchCoordinator({
				run: async (command) => {
					calls.push(command);
					return command.stdio === "inherit"
						? { code: 1, stdout: "" }
						: { code: 0, stdout: "0.84.4\n" };
				},
			});

			expect(await coordinator.prepare(plan)).toEqual({ kind: "degraded", reason: "update-failed", version: "0.84.4" });
			expect(calls.map(({ argv }) => argv)).toEqual([PI_PRELAUNCH_UPDATE_ARGV, ["--version"]]);
			expect(calls[1]).toMatchObject({ stdio: "capture", shell: false });
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});

	test("blocks an unauthenticated plan or an unusable host after update failure", async () => {
		const { home, plan } = await fixture("pi");
		try {
			const coordinator = createPiPrelaunchCoordinator({
				run: async (command) => command.stdio === "inherit"
					? { code: 1, stdout: "" }
					: { code: 0, stdout: "not-semver" },
			});
			expect(await coordinator.prepare(plan)).toEqual({ kind: "blocked", reason: "pi-prelaunch-unavailable" });

			const altered = { ...plan, executable: join(home, "bin", "other") };
			const rejected = createPiPrelaunchCoordinator({ run: async () => ({ code: 0, stdout: "" }) });
			expect(await rejected.prepare(altered)).toEqual({ kind: "blocked", reason: "invalid-launch-plan" });
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
