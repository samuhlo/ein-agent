#!/usr/bin/env bun
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

type Provider = "pi" | "claude";
type ExecutorResult =
  | { kind: "exit"; code: number }
  | { kind: "signal"; signal: string | number }
  | { kind: "throw" }
  | { kind: "invalid" };

type DriverScenario = {
  home: string;
  runtimeHome: string;
  evidence: string;
  executable: Record<Provider, string>;
  providerSentinels: Record<Provider, string>;
  executor: ExecutorResult;
  doctor?:
    | { outcome: "success"; overall: "ok" | "warn" | "fail"; checks: Array<{ name: string; status: "ok" | "warn" | "fail" }> }
    | { outcome: "unavailable" | "cancelled" }
    | { outcome: "throw" };
};

function scenarioFromEnvironment(): DriverScenario {
  const encoded = process.env.BETA_LAUNCHER_E2E_SCENARIO;
  if (!encoded) throw new Error("missing fixture scenario");
  return JSON.parse(encoded) as DriverScenario;
}

function record(path: string, event: Record<string, unknown>): void {
  appendFileSync(path, `${JSON.stringify(event)}\n`);
}

async function main(): Promise<void> {
  const scenario = scenarioFromEnvironment();
  const previousAgentHome = process.env.EIN_PI_AGENT_HOME;
  const previousConfigHome = process.env.EIN_PI_CONFIG_HOME;
  process.env.EIN_PI_AGENT_HOME = scenario.runtimeHome;
  process.env.EIN_PI_CONFIG_HOME = `${scenario.home}/.ein`;

  const [{ runWorkbenchEntrypoint }, { projectProjectState }, runtime, workbench] = await Promise.all([
    import("../../ein-pi/workbench.ts"),
    import("../../ein-pi/agent/lib/project-state.ts"),
    import("../../ein-pi/agent/lib/runtime-session-adapters.ts"),
    import("../../ein-pi/agent/lib/workbench.ts"),
  ]);

  const abort = new AbortController();
  const lines = createInterface({ input: stdin, output: stdout, terminal: true });
  const pendingReads = new Set<(answer: string | null) => void>();
  let cleaned = false;
  const resolvePending = () => {
    for (const resolveRead of pendingReads) resolveRead(null);
    pendingReads.clear();
  };
  lines.once("close", resolvePending);
  const onSigint = () => {
    abort.abort();
    resolvePending();
  };
  process.once("SIGINT", onSigint);
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    process.removeListener("SIGINT", onSigint);
    lines.removeListener("close", resolvePending);
    resolvePending();
    lines.close();
    record(scenario.evidence, {
      kind: "cleanup",
      sigintRemoved: !process.listeners("SIGINT").includes(onSigint),
      pendingReads: pendingReads.size,
    });
  };
  const project = (request: { cwd: string }) => {
    record(scenario.evidence, { kind: "project-start", cwd: request.cwd });
    const state = projectProjectState(request);
    record(scenario.evidence, {
      kind: "project",
      cwd: request.cwd,
      quality: state.identity.quality,
      reason: state.identity.reason,
      schemaVersion: state.schemaVersion,
      freshness: state.verification.freshness,
      effectiveOutcome: state.verification.effectiveOutcome,
    });
    return state;
  };
  const executor: runtime.LaunchExecutor = async (input) => {
    record(scenario.evidence, {
      kind: "executor",
      executor: "recording",
      executable: input.executable,
      argv: input.argv,
      cwd: input.cwd,
      env: input.env,
      shell: input.shell,
      signal: input.signal.constructor.name,
    });
    if (scenario.executor.kind === "throw") throw new Error("PRIVATE_EXECUTOR_FAILURE");
    if (scenario.executor.kind === "invalid") return { kind: "unknown" } as never;
    return scenario.executor;
  };
  const createDependencies = (candidates: readonly string[]) => {
    const dependencies: workbench.WorkbenchDependencies & { dispose: () => void } = {
      candidates,
      project,
      input: {
        read: async (prompt) => {
          if (abort.signal.aborted) return null;
          return await new Promise<string | null>((resolveRead) => {
            pendingReads.add(resolveRead);
            lines.question(prompt, (answer) => {
              pendingReads.delete(resolveRead);
              resolveRead(answer);
            });
          });
        },
      },
      output: { write: (text) => stdout.write(`${text}\n`) },
      adapter: runtime.createRuntimeSessionAdapter,
      launch: {
        build: (state, intent) => runtime.buildLaunchPlan(state, intent, {
          home: scenario.home,
          environment: { HOME: scenario.home, PATH: `${scenario.home}/bin` },
          resolveExecutable: (provider) => scenario.executable[provider],
        }),
        execute: runtime.executeLaunchPlan,
        executor,
      },
      doctor: async () => {
        const doctor = scenario.doctor ?? { outcome: "unavailable" as const };
        if (doctor.outcome === "throw") throw new Error("PRIVATE_DOCTOR_FAILURE");
        if (doctor.outcome === "cancelled") return { outcome: "cancelled", overall: "warn", checks: [] };
        if (doctor.outcome === "unavailable") return { outcome: "unavailable", overall: "unavailable", checks: [] };
        return doctor;
      },
      signal: abort.signal,
      dispose: cleanup,
    };
    return dependencies;
  };

  try {
    const exit = await runWorkbenchEntrypoint({
      argv: Bun.argv.slice(2),
      cwd: process.cwd(),
      stdinTTY: Boolean(stdin.isTTY),
      stdoutTTY: Boolean(stdout.isTTY),
      write: (text) => stdout.write(`${text}\n`),
      createDependencies,
    });
    process.exitCode = exit;
  } finally {
    cleanup();
    if (previousAgentHome === undefined) delete process.env.EIN_PI_AGENT_HOME;
    else process.env.EIN_PI_AGENT_HOME = previousAgentHome;
    if (previousConfigHome === undefined) delete process.env.EIN_PI_CONFIG_HOME;
    else process.env.EIN_PI_CONFIG_HOME = previousConfigHome;
  }
}

if (import.meta.main) await main();

export type { DriverScenario, ExecutorResult };
