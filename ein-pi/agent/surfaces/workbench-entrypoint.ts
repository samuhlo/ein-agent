import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { projectProjectState } from "../lib/project-state.ts";
import { inspectLinearIntegration } from "../lib/linear-integration.ts";
import { inspectModelConfig } from "../lib/model-config.ts";
import {
  buildLaunchPlan,
  createRuntimeSessionAdapter,
  executeLaunchPlan,
  type LaunchExecutor,
} from "../lib/runtime-session-adapters.ts";
import {
  classifyWorkbenchExit,
  createWorkbenchAdvisor,
  renderWorkbenchAdvisor,
  runWorkbench,
  type WorkbenchDependencies,
  type WorkbenchResult,
} from "../lib/workbench.ts";
import type { SharedConfigUpdateAdvisorResult } from "../lib/shared-config-update-advisor.ts";
import {
  checkEinTemplateUpdate,
  checkPiBinaryUpdate,
  readEinVersion,
  checkClaudeCodeUpdate,
  defaultPiManifestPaths,
  readPiBinaryVersion,
  startUpdateEvidenceSnapshot,
  type VersionProbeRunner,
} from "../lib/update-probes.ts";

const HELP = "Usage: bun ein-pi/workbench.ts [--project <root>]... [--help]";
const NON_TTY = "Workbench requires TTY stdin and stdout. Re-run interactively, optionally with --project <root>.";

export function renderLauncherAdvisor(result: SharedConfigUpdateAdvisorResult): string {
  return renderWorkbenchAdvisor(result);
}

export type ParsedWorkbenchArgs =
  | { kind: "help" }
  | { kind: "run"; candidates: readonly string[] }
  | { kind: "error"; message: string };

export function parseWorkbenchArgs(argv: readonly string[], cwd: string): ParsedWorkbenchArgs {
  const roots: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help") return argv.length === 1 ? { kind: "help" } : { kind: "error", message: HELP };
    if (argument !== "--project" || !argv[index + 1] || argv[index + 1]!.startsWith("--")) {
      return { kind: "error", message: HELP };
    }
    roots.push(resolve(cwd, argv[++index]!));
  }
  const candidates = [...new Set(roots.length ? roots : [resolve(cwd)])];
  return candidates.length > 20
    ? { kind: "error", message: "At most 20 distinct --project candidates are allowed." }
    : { kind: "run", candidates };
}

export type WorkbenchEntrypointOptions = {
  argv: readonly string[];
  cwd: string;
  stdinTTY: boolean;
  stdoutTTY: boolean;
  write: (text: string) => void;
  createDependencies: (candidates: readonly string[]) => WorkbenchDependencies & { dispose?: () => void };
  run?: (dependencies: WorkbenchDependencies) => Promise<WorkbenchResult>;
};

export async function runWorkbenchEntrypoint(options: WorkbenchEntrypointOptions): Promise<number> {
  const parsed = parseWorkbenchArgs(options.argv, options.cwd);
  if (parsed.kind === "help") { options.write(HELP); return 0; }
  if (parsed.kind === "error") { options.write(parsed.message); return 2; }
  if (!options.stdinTTY || !options.stdoutTTY) { options.write(NON_TTY); return 2; }

  const dependencies = options.createDependencies(parsed.candidates);
  try {
    return classifyWorkbenchExit(await (options.run ?? runWorkbench)(dependencies));
  } finally {
    dependencies.dispose?.();
  }
}

// Same agent dir the Pi extensions resolve, without importing the SDK: the
// launcher runs as a standalone process under both Pi and Claude Code.
/**
 * Bounded spawn for version queries only. The collector bounds the wait, not
 * the child, so the process carries its own timeout to avoid outliving it.
 */
const spawnVersionProbe: VersionProbeRunner = async ({ file, args, timeoutMs, maxBuffer }) => {
  const child = Bun.spawn([file, ...args], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const stdout = (await new Response(child.stdout).text()).slice(0, maxBuffer);
    return { stdout, exitCode: await child.exited };
  } finally {
    clearTimeout(timer);
  }
};

function resolveAgentDir(): string {
  return process.env.EIN_PI_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

function createProductionDependencies(candidates: readonly string[]): WorkbenchDependencies & { dispose: () => void } {
  const abort = new AbortController();
  const lines = createInterface({ input: stdin, output: stdout, terminal: true });
  const onSigint = () => abort.abort();
  process.once("SIGINT", onSigint);

  // Starts at construction time (the edge), in parallel with candidate
  // selection and confirmation; never awaited before render (R6).
  const agentDir = resolveAgentDir();
  const snapshot = startUpdateEvidenceSnapshot({
    // Read from the package manifest on disk rather than the SDK's VERSION,
    // which only extensions can import.
    binary: async () => checkPiBinaryUpdate(await readPiBinaryVersion(defaultPiManifestPaths(homedir()))),
    // Genuinely SDK-bound: resolving package updates means DefaultPackageManager,
    // and reimplementing it here would duplicate Pi's source of truth.
    packages: async () => ({ source: "packages", status: "skipped", reason: "requires-pi-runtime", freshness: "unknown" }),
    ein: async () => checkEinTemplateUpdate(await readEinVersion(agentDir)),
    claude: () => checkClaudeCodeUpdate(spawnVersionProbe),
  });

  const executor: LaunchExecutor = async (input) => {
    const child = Bun.spawn([input.executable, ...input.argv], {
      cwd: input.cwd, env: { ...process.env, ...input.env }, stdin: "inherit", stdout: "inherit", stderr: "inherit",
    });
    const abortChild = () => { child.kill(); };
    if (input.signal.aborted) abortChild(); else input.signal.addEventListener("abort", abortChild, { once: true });
    const code = await child.exited;
    input.signal.removeEventListener("abort", abortChild);
    return { kind: "exit", code };
  };

  return {
    candidates,
    project: projectProjectState,
    input: { read: async (prompt) => {
      if (abort.signal.aborted) return null;
      try { return await lines.question(`${prompt} `, { signal: abort.signal }); } catch { return null; }
    } },
    output: { write: (text) => { stdout.write(`${text}\n`); } },
    adapter: createRuntimeSessionAdapter,
    launch: { build: buildLaunchPlan, execute: executeLaunchPlan, executor },
    advisor: state => createWorkbenchAdvisor(state, {
      inspectLinearIntegration,
      inspectModelConfig,
      readUpdateObservations: () => snapshot.read(),
    }),
    doctor: async () => ({ outcome: "unavailable", overall: "unavailable", checks: [] }),
    signal: abort.signal,
    dispose: () => { process.removeListener("SIGINT", onSigint); lines.close(); },
  };
}

export function invokeProductionWorkbench(args: readonly string[]): Promise<number> {
  return runWorkbenchEntrypoint({
    argv: args,
    cwd: process.cwd(),
    stdinTTY: Boolean(stdin.isTTY),
    stdoutTTY: Boolean(stdout.isTTY),
    write: text => stdout.write(`${text}\n`),
    createDependencies: createProductionDependencies,
  });
}
