import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, relative } from "node:path";
import { projectProjectState } from "../ein-pi/agent/lib/project-state.ts";
import {
  buildLaunchPlan,
  createRuntimeSessionAdapter,
  createSessionRequest,
  executeLaunchPlan,
  listSessionRequest,
  resumeSessionRequest,
  type AdapterResult,
  type LaunchExecutorInput,
  type LaunchPlan,
  type ProjectBinding,
} from "../ein-pi/agent/lib/runtime-session-adapters.ts";
import { classifyWorkbenchExit, renderDoctorResult } from "../ein-pi/agent/lib/workbench.ts";

type Provider = "pi" | "claude";
type ExecutorResult =
  | { kind: "exit"; code: number }
  | { kind: "signal"; signal: string | number }
  | { kind: "throw" }
  | { kind: "invalid" };
type DoctorScenario =
  | { outcome: "success"; overall: "ok" | "warn" | "fail"; checks: Array<{ name: string; status: "ok" | "warn" | "fail" }> }
  | { outcome: "unavailable" | "cancelled" }
  | { outcome: "throw" };
type Scenario = {
  home: string;
  runtimeHome: string;
  evidence: string;
  executable: Record<Provider, string>;
  providerSentinels: Record<Provider, string>;
  executor: ExecutorResult;
  doctor?: DoctorScenario;
};
type ManifestEntry = {
  path: string;
  type: "file" | "directory" | "symlink";
  mode: number;
  hash?: string;
  target?: string;
};
type Manifest = {
  entries: ManifestEntry[];
  git?: { head: string; status: string; stateRef?: string };
};
type PseudoProcess = ReturnType<typeof Bun.spawn>;

const DRIVER = resolve(import.meta.dir, "fixtures/beta-launcher-e2e-driver.ts");
const CHILD_DEADLINE_MS = 2_000;
const PROMPT_DEADLINE_MS = 1_000;
const createdRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function writeText(path: string, content: string): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function makeFixture(): {
  root: string;
  project: string;
  home: string;
  runtimeHome: string;
  tracked: string;
  evidence: string;
  scenario(overrides?: Partial<Scenario>): Scenario;
  baselineProject: Manifest;
  baselineRuntime: Manifest;
  dispose(): void;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ein-beta-launcher-e2e-")));
  createdRoots.push(root);
  const project = join(root, "project");
  const home = join(root, "home");
  const runtimeHome = join(home, ".pi-ein", "agent");
  const bin = join(home, "bin");
  const evidence = join(root, "evidence", "events.jsonl");
  const providerSentinels = {
    pi: join(root, "evidence", "pi-provider-sentinel"),
    claude: join(root, "evidence", "claude-provider-sentinel"),
  };
  mkdirSync(project, { recursive: true });
  mkdirSync(runtimeHome, { recursive: true });
  mkdirSync(join(home, ".claude-ein"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeText(join(project, "EIN.md"), "# EIN.md\n## Overview\nFixture context.\n<!-- ein:auto:start -->\n## Commands\n_fixture_\n<!-- ein:auto:end -->\n");
  writeText(join(project, "src", "tracked.ts"), "export const fixture = 'baseline';\n");
  writeText(join(project, ".gitignore"), "openspec/changes/beta-fixture/verify-report.md\n");
  const change = join(project, "openspec", "changes", "beta-fixture");
  writeText(join(change, "scope.md"), "# Scope\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture\n");
  writeText(join(change, "map.md"), "# Map\n");
  writeText(join(change, "design.md"), "# Design\n");
  writeText(join(change, "tasks.md"), "status: ready\nblocked_by: none\n- [x] fixture\n");
  writeText(join(change, "apply-progress.md"), "status: complete\n");
  writeText(join(project, "ownership", "target.txt"), "canary\n");
  symlinkSync(join(project, "ownership", "target.txt"), join(project, "ownership", "link.txt"));
  for (const path of [
    ".pi/session-canary",
    ".claude/session-canary",
    "transcripts/canary",
    "cache/canary",
    "installer/canary",
    "updater/canary",
    "project-state.json",
  ]) writeText(join(project, path), "must remain untouched\n");
  writeText(join(runtimeHome, "session-canary"), "must remain untouched\n");
  writeText(join(home, ".claude-ein", "session-canary"), "must remain untouched\n");
  for (const sentinel of Object.values(providerSentinels)) writeText(sentinel, "untouched\n");
  const executables = { pi: join(bin, "pi"), claude: join(bin, "claude") };
  for (const provider of ["pi", "claude"] as const) {
    const sentinel = providerSentinels[provider].replaceAll("'", "'\\''");
    writeText(executables[provider], `#!/bin/sh\nprintf 'spawned\\n' >> '${sentinel}'\nexit 99\n`);
    chmodSync(executables[provider], 0o755);
  }
  git(project, ["init", "--quiet"]);
  git(project, ["config", "user.email", "ein-tests@example.invalid"]);
  git(project, ["config", "user.name", "Ein Tests"]);
  git(project, ["add", "--all"]);
  git(project, ["commit", "--quiet", "-m", "fixture"]);
  const currentStateRef = projectProjectState({ cwd: project }).git.stateRef!;
  writeText(join(change, "verify-report.md"), `status: pass\nproject_state_git_ref: ${currentStateRef}\n`);
  const scenario = (overrides: Partial<Scenario> = {}): Scenario => ({
    home,
    runtimeHome,
    evidence,
    executable: executables,
    providerSentinels,
    executor: { kind: "exit", code: 0 },
    ...overrides,
  });
  const baselineProject = manifest(project, true);
  const baselineRuntime = manifest(home, false);
  return {
    root,
    project,
    home,
    runtimeHome,
    tracked: join(project, "src", "tracked.ts"),
    evidence,
    scenario,
    baselineProject,
    baselineRuntime,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function manifest(root: string, includeGit: boolean): Manifest {
  const entries: ManifestEntry[] = [];
  const visit = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const path = prefix ? `${prefix}/${entry}` : entry;
      const stat = lstatSync(full);
      const mode = stat.mode & 0o7777;
      if (stat.isSymbolicLink()) {
        entries.push({ path, type: "symlink", mode, target: readlinkSync(full) });
      } else if (stat.isDirectory()) {
        entries.push({ path, type: "directory", mode });
        visit(full, path);
      } else {
        entries.push({ path, type: "file", mode, hash: createHash("sha256").update(readFileSync(full)).digest("hex") });
      }
    }
  };
  visit(root, "");
  entries.sort((left, right) => left.path.localeCompare(right.path));
  if (!includeGit) return { entries };
  const state = projectProjectState({ cwd: root });
  return {
    entries,
    git: {
      head: git(root, ["rev-parse", "HEAD"]),
      status: git(root, ["status", "--porcelain=v2", "--untracked-files=all"]),
      stateRef: state.git.stateRef,
    },
  };
}

function readEvents(path: string): Array<Record<string, unknown>> {
  try {
    return readFileSync(path, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

function plain(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

class PtySession {
  private readonly process: PseudoProcess;
  private readonly terminal: Bun.Terminal;
  private readonly promptListeners = new Set<() => void>();
  private output = "";
  private promptCursor = 0;
  private disposed = false;
  private terminalClosed = false;

  constructor(argv: string[], scenario?: Scenario, extraEnv: Record<string, string> = {}) {
    this.terminal = new Bun.Terminal({
      data: (_terminal, data) => {
        this.output += new TextDecoder().decode(data);
        for (const listener of this.promptListeners) listener();
      },
    });
    try {
      this.process = Bun.spawn(argv, {
        cwd: process.cwd(),
        env: { ...process.env, ...(scenario ? { BETA_LAUNCHER_E2E_SCENARIO: JSON.stringify(scenario) } : {}), ...extraEnv },
        terminal: this.terminal,
      });
    } catch (error) {
      this.terminal.close();
      this.terminalClosed = true;
      throw error;
    }
  }

  transcript(): string {
    return plain(this.output);
  }

  rawTranscript(): string {
    return this.output;
  }

  async waitForPrompt(prompt: string, timeoutMs = PROMPT_DEADLINE_MS): Promise<void> {
    const match = () => {
      const transcript = this.transcript();
      const index = transcript.indexOf(prompt, this.promptCursor);
      if (index < 0) return false;
      this.promptCursor = index + prompt.length;
      return true;
    };
    if (match()) return;
    await new Promise<void>((resolvePrompt, reject) => {
      const timer = setTimeout(() => {
        this.promptListeners.delete(check);
        reject(new Error(`prompt deadline exceeded: ${prompt}\n${this.transcript()}`));
      }, timeoutMs);
      const check = () => {
        if (!match()) return;
        clearTimeout(timer);
        this.promptListeners.delete(check);
        resolvePrompt();
      };
      this.promptListeners.add(check);
    });
  }

  writeLine(value: string): void {
    this.terminal.write(`${value}\n`);
  }

  sendEOF(): void {
    this.terminal.write("\u0004");
  }

  sendSIGINT(): void {
    this.terminal.write("\u0003");
    this.process.kill("SIGINT");
  }

  async waitForExit(timeoutMs = CHILD_DEADLINE_MS): Promise<number> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.process.exited,
        new Promise<number>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`child deadline exceeded\n${this.transcript()}`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  get pid(): number {
    return this.process.pid;
  }

  isAlive(): boolean {
    try {
      process.kill(this.process.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async reapWithin(timeoutMs: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.process.exited,
        new Promise<void>((resolveExit) => {
          timer = setTimeout(resolveExit, timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.isAlive()) {
      try { this.terminal.write("\u0004"); } catch {}
      await this.reapWithin(100);
    }
    if (this.isAlive()) {
      this.process.kill("SIGTERM");
      await this.reapWithin(100);
    }
    if (this.isAlive()) this.process.kill("SIGKILL");
    await this.process.exited;
    this.terminal.close();
    this.terminalClosed = true;
    this.promptListeners.clear();
  }

  promptListenerCount(): number {
    return this.promptListeners.size;
  }

  isTerminalClosed(): boolean {
    return this.terminalClosed;
  }
}

async function runDriver(
  fixture: ReturnType<typeof makeFixture>,
  scenario: Scenario,
  steps: (pty: PtySession) => Promise<number>,
  candidate = fixture.project,
): Promise<{ code: number; transcript: string; rawTranscript: string; events: Array<Record<string, unknown>> }> {
  const beforeProject = manifest(fixture.project, true);
  const beforeRuntime = manifest(fixture.home, false);
  const beforeSentinels = Object.fromEntries(
    (Object.entries(scenario.providerSentinels) as Array<[Provider, string]>).map(([provider, path]) => [provider, readFileSync(path, "utf8")]),
  ) as Record<Provider, string>;
  const eventsBefore = readEvents(scenario.evidence);
  const pty = new PtySession([process.execPath, DRIVER, "--project", candidate], scenario);
  let code: number;
  try {
    code = await steps(pty);
  } finally {
    await pty.dispose();
  }
  const events = readEvents(scenario.evidence);
  expect(manifest(fixture.project, true)).toEqual(beforeProject);
  expect(manifest(fixture.home, false)).toEqual(beforeRuntime);
  for (const [provider, path] of Object.entries(scenario.providerSentinels) as Array<[Provider, string]>) {
    expect(readFileSync(path, "utf8")).toBe(beforeSentinels[provider]);
  }
  expect(pty.isAlive()).toBe(false);
  expect(pty.transcript()).not.toContain(fixture.root);
  expect(pty.transcript()).not.toContain("PRIVATE");
  expect(pty.transcript()).not.toMatch(/\x1b/);
  expect(pty.promptListenerCount()).toBe(0);
  expect(pty.isTerminalClosed()).toBe(true);
  const cleanupEvents = events.slice(eventsBefore.length).filter((event) => event.kind === "cleanup");
  expect(cleanupEvents).toHaveLength(1);
  expect(cleanupEvents[0]).toMatchObject({ kind: "cleanup", sigintRemoved: true, pendingReads: 0 });
  return { code: code!, transcript: pty.transcript(), rawTranscript: pty.rawTranscript(), events };
}

async function exitNormally(pty: PtySession, runtime: "1" | "2" = "1", action: string = "4"): Promise<number> {
  await pty.waitForPrompt("Select project number: ");
  pty.writeLine("1");
  await pty.waitForPrompt("Confirm project");
  pty.writeLine("yes");
  await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
  pty.writeLine(runtime);
  await pty.waitForPrompt("Select action: ");
  pty.writeLine(action);
  return pty.waitForExit();
}

function fixturePlan(fixture: ReturnType<typeof makeFixture>, provider: Provider): { state: ReturnType<typeof projectProjectState>; intent: Extract<ReturnType<typeof createSessionRequest>, { outcome: "success" }>['data']; plan: LaunchPlan } {
  const state = projectProjectState({ cwd: fixture.project });
  const created = createSessionRequest(provider, state);
  if (created.outcome !== "success") throw new Error("fixture create request failed");
  const built = buildLaunchPlan(state, created.data, {
    home: fixture.home,
    environment: { HOME: fixture.home, PATH: join(fixture.home, "bin") },
    resolveExecutable: () => join(fixture.home, "bin", provider),
  });
  if (built.outcome !== "success") throw new Error("fixture plan failed");
  return { state, intent: created.data, plan: built.data };
}

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

describe("beta launcher E2E PTY contract", () => {
  test("runs a real PTY with prompt synchronization, argv launch, normal exit, and teardown", async () => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario(), (pty) => exitNormally(pty));
      expect(result.code).toBe(0);
      expect(result.transcript).toContain("Confirmed project: 1. project");
      expect(result.transcript).toContain("Runtime: pi");
      expect(result.transcript).not.toContain(fixture.root);
    } finally {
      fixture.dispose();
    }
  });

  test("runs the real Claude PTY launch through the recording executor", async () => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario(), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("2");
        await pty.waitForPrompt("Select action: ");
        // Claude lists its sessions now, so "Create session" is the second
        // entry for both runtimes instead of the first one for Claude only.
        pty.writeLine("2");
        await pty.waitForPrompt("Confirm launch?");
        pty.writeLine("yes");
        await pty.waitForPrompt("Launch handoff: confirmed snapshot freshness=current");
        return pty.waitForExit();
      });
      expect(result.code).toBe(0);
      expect(result.transcript).toContain("Runtime: claude");
      expect(readEvents(fixture.evidence).filter((event) => event.kind === "executor")).toEqual([{
        kind: "executor",
        executor: "recording",
        executable: fixture.scenario().executable.claude,
        argv: [],
        cwd: fixture.project,
        env: {
          CLAUDE_CONFIG_DIR: join(fixture.home, ".claude-ein"),
          ENGRAM_DATA_DIR: join(fixture.home, ".engram-cc-ein"),
          PATH: `${join(fixture.home, ".claude-ein", "bin")}:${join(fixture.home, "bin")}`,
        },
        shell: false,
        signal: "AbortSignal",
      }]);
      expect(readFileSync(fixture.scenario().providerSentinels.claude, "utf8")).toBe("untouched\n");
    } finally {
      fixture.dispose();
    }
  });

  test("normalizes deliberate CRLF, echo, and ANSI terminal bytes", () => {
    const raw = "\u001b[2KSelect runtime: 1. Pi 2. Claude: \r\n2\r\nRuntime: claude\r\n";
    expect(plain(raw)).toBe("Select runtime: 1. Pi 2. Claude: \n2\nRuntime: claude\n");
  });

  test("delivers EOF and SIGINT as bounded cancellation paths", async () => {
    for (const signal of ["eof", "sigint"] as const) {
      const fixture = makeFixture();
      try {
        const result = await runDriver(fixture, fixture.scenario(), async (pty) => {
          await pty.waitForPrompt("Select project number: ");
          pty.writeLine("1");
          await pty.waitForPrompt("Confirm project");
          if (signal === "eof") pty.sendEOF(); else pty.sendSIGINT();
          return pty.waitForExit();
        });
        expect(result.code).toBe(130);
      } finally {
        fixture.dispose();
      }
    }
  });

  test("bounds prompt waits, reaps a timed-out child, and closes the terminal in finally", async () => {
    const fixture = makeFixture();
    const beforeProject = manifest(fixture.project, true);
    const beforeRuntime = manifest(fixture.home, false);
    const pty = new PtySession([process.execPath, "-e", "setInterval(() => {}, 1000)"]);
    try {
      await expect(pty.waitForPrompt("NEVER", 25)).rejects.toThrow("prompt deadline exceeded");
      await expect(pty.waitForExit(50)).rejects.toThrow("child deadline exceeded");
    } finally {
      await pty.dispose();
    }
    expect(() => process.kill(pty.pid, 0)).toThrow();
    expect(pty.isAlive()).toBe(false);
    expect(pty.promptListenerCount()).toBe(0);
    expect(pty.isTerminalClosed()).toBe(true);
    expect(manifest(fixture.project, true)).toEqual(beforeProject);
    expect(manifest(fixture.home, false)).toEqual(beforeRuntime);
    fixture.dispose();
  });
});

describe("project fixtures and ownership manifests", () => {
  test("projects canonical OpenSpec, Git, and verification state through B", () => {
    const fixture = makeFixture();
    try {
      const state = projectProjectState({ cwd: fixture.project });
      expect(state.schemaVersion).toBe(1);
      expect(state.openspec).toMatchObject({ selection: "selected", provenance: "canonical", verify: "pass" });
      expect(state.git).toMatchObject({ repository: true, quality: "current", complete: true });
      expect(state.verification).toMatchObject({ freshness: "current", effectiveOutcome: "pass", currentStateRef: state.git.stateRef });
      expect(fixture.baselineProject.git?.stateRef).toBe(state.git.stateRef);
    } finally {
      fixture.dispose();
    }
  });

  test("invalidates bound evidence after exactly one tracked-source mutation", () => {
    const fixture = makeFixture();
    try {
      const baseline = projectProjectState({ cwd: fixture.project });
      writeFileSync(fixture.tracked, "export const fixture = 'mutated';\n");
      const mutated = projectProjectState({ cwd: fixture.project });
      expect(mutated.git.stateRef).not.toBe(baseline.git.stateRef);
      expect(mutated.verification).toMatchObject({ freshness: "stale", effectiveOutcome: "unknown", observedStateRef: baseline.git.stateRef });
      const after = manifest(fixture.project, true);
      const changed = after.entries.filter((entry, index) => JSON.stringify(entry) !== JSON.stringify(fixture.baselineProject.entries[index]));
      expect(changed.map((entry) => entry.path)).toContain("src/tracked.ts");
      expect(changed).toHaveLength(1);
    } finally {
      fixture.dispose();
    }
  });

  test("renders stale evidence through a second fresh PTY launch without refreshing it", async () => {
    const fixture = makeFixture();
    const report = join(fixture.project, "openspec", "changes", "beta-fixture", "verify-report.md");
    try {
      const reportBefore = readFileSync(report);
      writeFileSync(fixture.tracked, "export const fixture = 'mutated';\n");
      const result = await runDriver(fixture, fixture.scenario(), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        expect(pty.transcript()).toContain("Verification: outcome=unknown freshness=stale");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("2");
        await pty.waitForPrompt("Confirm launch?");
        pty.writeLine("yes");
        await pty.waitForPrompt("Launch handoff: confirmed snapshot freshness=stale");
        return pty.waitForExit();
      });
      expect(result.code).toBe(0);
      expect(readFileSync(report)).toEqual(reportBefore);
      const events = readEvents(fixture.evidence);
      expect(events.filter((event) => event.kind === "project-start")).toHaveLength(1);
      expect(events.filter((event) => event.kind === "project")).toHaveLength(1);
      expect(events.find((event) => event.kind === "project")).toMatchObject({ freshness: "stale" });
      expect(events.filter((event) => event.kind === "executor")).toHaveLength(1);
    } finally {
      fixture.dispose();
    }
  });

  test("keeps stale, invalid, incomplete, and unavailable verification explicit", () => {
    const fixture = makeFixture();
    try {
      const report = join(fixture.project, "openspec", "changes", "beta-fixture", "verify-report.md");
      writeFileSync(report, "status: fail\nproject_state_git_ref: invalid\n");
      expect(projectProjectState({ cwd: fixture.project }).verification).toMatchObject({ freshness: "invalid", effectiveOutcome: "fail", quality: "incomplete" });
      writeFileSync(report, "not a verification report\n");
      expect(projectProjectState({ cwd: fixture.project }).verification).toMatchObject({ freshness: "invalid", effectiveOutcome: "unknown", reportedOutcome: "unknown" });
      rmSync(report);
      expect(projectProjectState({ cwd: fixture.project }).verification).toMatchObject({ freshness: "unavailable", effectiveOutcome: "absent", quality: "absent" });
    } finally {
      fixture.dispose();
    }
  });

  test("keeps project and isolated runtime manifests exact after a default-no PTY run", async () => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario(), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("2");
        await pty.waitForPrompt("Confirm launch?");
        pty.writeLine("no");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("4");
        return pty.waitForExit();
      });
      expect(result.code).toBe(0);
      expect(manifest(fixture.project, true)).toEqual(fixture.baselineProject);
      expect(manifest(fixture.home, false)).toEqual(fixture.baselineRuntime);
      expect(readEvents(fixture.evidence).filter((event) => event.kind === "executor")).toHaveLength(0);
      for (const sentinel of Object.values(fixture.scenario().providerSentinels)) {
        expect(readFileSync(sentinel, "utf8")).toBe("untouched\n");
      }
      expect(readEvents(fixture.evidence).filter((event) => event.kind === "cleanup")).toHaveLength(1);
    } finally {
      fixture.dispose();
    }
  });
});

describe("real adapter, plan, and recording executor boundaries", () => {
  test("crosses both real adapters and records only validated fixed plans", async () => {
    const fixture = makeFixture();
    try {
      for (const provider of ["pi", "claude"] as const) {
        const { state, intent, plan } = fixturePlan(fixture, provider);
        const adapter = createRuntimeSessionAdapter(provider);
        const request = adapter.create(state, { project: plan.project });
        expect(request).toEqual({ provider, operation: "create", outcome: "success", project: plan.project, data: intent });
        const calls: LaunchExecutorInput[] = [];
        const result = await executeLaunchPlan(plan, async (input) => {
          calls.push(input);
          return { kind: "exit", code: 0 };
        });
        expect(result).toMatchObject({ provider, operation: "launch", outcome: "success", data: { exitCode: 0 } });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ executable: join(fixture.home, "bin", provider), argv: [], shell: false });
        expect(realpathSync(calls[0]?.cwd ?? "")).toBe(fixture.project);
        expect(calls[0]?.env).toEqual(provider === "pi"
          ? { PI_CODING_AGENT_DIR: fixture.runtimeHome, EIN_PI_AGENT_HOME: fixture.runtimeHome, ENGRAM_DATA_DIR: join(fixture.home, ".engram-pi") }
          : { CLAUDE_CONFIG_DIR: join(fixture.home, ".claude-ein"), ENGRAM_DATA_DIR: join(fixture.home, ".engram-cc-ein"), PATH: `${join(fixture.home, ".claude-ein", "bin")}:${join(fixture.home, "bin")}` });
      }
    } finally {
      fixture.dispose();
    }
  });

  test("lists both runtimes, refuses a reference no session backs, and keeps ids private", () => {
    const fixture = makeFixture();
    const previousClaudeHome = process.env.CLAUDE_CONFIG_DIR;
    // Point Claude at the fixture's own (empty) store so the answer depends on
    // the fixture, not on whatever this machine happens to have installed.
    process.env.CLAUDE_CONFIG_DIR = join(fixture.home, ".claude-ein");
    try {
      const state = projectProjectState({ cwd: fixture.project });
      const opaque = `pi:v1:sha256:${"a".repeat(64)}`;
      expect(listSessionRequest("pi", state)).toMatchObject({ outcome: "success", operation: "list" });
      // The store exists but holds no projects directory: unavailable is the
      // honest answer, and it is no longer "this runtime cannot be listed".
      expect(listSessionRequest("claude", state)).toMatchObject({
        outcome: "unavailable",
        error: { code: "session-source-unavailable" },
      });
      // Well-formed references that no live session hashes to.
      expect(resumeSessionRequest("pi", state, opaque)).toMatchObject({ error: { code: "reference-not-found" } });
      expect(resumeSessionRequest("claude", state, `claude:v1:sha256:${"b".repeat(64)}`))
        .toMatchObject({ error: { code: "reference-not-found" } });
      for (const provider of ["pi", "claude"] as const) {
        const adapter = createRuntimeSessionAdapter(provider);
        expect(adapter.capabilities.find((capability) => capability.operation === "create")).toMatchObject({ requestOnly: true });
      }
      expect(JSON.stringify(listSessionRequest("pi", state))).not.toContain("transcript");
    } finally {
      if (previousClaudeHome === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previousClaudeHome;
      fixture.dispose();
    }
  });

  test("normalizes success, unavailable, error, signal, throw, and cancelled executor results", async () => {
    const fixture = makeFixture();
    try {
      const { plan } = fixturePlan(fixture, "pi");
      const cases: Array<[unknown, AdapterResult<unknown>["outcome"]]> = [
        [{ kind: "exit", code: 0 }, "success"],
        [{ kind: "exit", code: 7 }, "error"],
        [{ kind: "signal", signal: "SIGTERM" }, "error"],
        [{ kind: "unknown" }, "unavailable"],
      ];
      for (const [execution, outcome] of cases) {
        const result = await executeLaunchPlan(plan, async () => execution as never);
        expect(result.outcome).toBe(outcome);
      }
      const thrown = await executeLaunchPlan(plan, async () => { throw new Error(fixture.root); });
      expect(thrown.outcome).toBe("unavailable");
      const abort = new AbortController();
      abort.abort();
      expect((await executeLaunchPlan(plan, async () => ({ kind: "exit", code: 0 }), abort.signal)).outcome).toBe("cancelled");
    } finally {
      fixture.dispose();
    }
  });

  test("rejects a mutated plan before the recording executor and preserves zero-call default-no", async () => {
    const fixture = makeFixture();
    try {
      const { plan } = fixturePlan(fixture, "pi");
      const invalid = { ...plan, argv: ["provider-output"] };
      let calls = 0;
      const result = await executeLaunchPlan(invalid, async () => { calls += 1; return { kind: "exit", code: 0 }; });
      expect(result).toMatchObject({ outcome: "error", error: { code: "invalid-request" } });
      expect(calls).toBe(0);
      for (const sentinel of Object.values(fixture.scenario().providerSentinels)) {
        expect(readFileSync(sentinel, "utf8")).toBe("untouched\n");
      }
      expect(readEvents(fixture.evidence).filter((event) => event.kind === "executor")).toHaveLength(0);
    } finally {
      fixture.dispose();
    }
  });
});

describe("doctor, failure matrix, privacy, and closed exits", () => {
  test("returns bounded fixture doctor outcomes to the same menu", async () => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario({ doctor: { outcome: "success", overall: "warn", checks: Array.from({ length: 15 }, (_, index) => ({ name: `check-${index}`, status: "ok" as const })) } }), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("3");
        await pty.waitForPrompt("Doctor: overall=warn");
        expect(pty.transcript().match(/^- check-/gm)).toHaveLength(10);
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("4");
        return pty.waitForExit();
      });
      expect(result.code).toBe(0);
      expect(result.transcript).not.toMatch(/\x1b|PRIVATE|\/private/);
    } finally {
      fixture.dispose();
    }
  });

  test("keeps production doctor fallback actionable and privacy-safe", () => {
    const rendered = renderDoctorResult({ outcome: "unavailable", overall: "unavailable", checks: [] });
    expect(rendered).toContain("run `ein doctor` directly");
    expect(rendered).not.toMatch(/\x1b|\/private|PRIVATE/);
  });

  test("drives the actual production no-bridge doctor path through a PTY", async () => {
    const fixture = makeFixture();
    const beforeProject = manifest(fixture.project, true);
    const beforeRuntime = manifest(fixture.home, false);
    const pty = new PtySession(
      [process.execPath, resolve(import.meta.dir, "../ein-pi/workbench.ts"), "--project", fixture.project],
      undefined,
      { HOME: fixture.home, EIN_PI_AGENT_HOME: fixture.runtimeHome, EIN_PI_CONFIG_HOME: join(fixture.home, ".ein") },
    );
    try {
      try {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("3");
        await pty.waitForPrompt("Doctor: unavailable — run `ein doctor` directly, then return to the workbench.");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("4");
        expect(await pty.waitForExit()).toBe(0);
      } finally {
        await pty.dispose();
      }
      expect(pty.transcript()).not.toContain(fixture.root);
      expect(pty.isAlive()).toBe(false);
      expect(pty.promptListenerCount()).toBe(0);
      expect(pty.isTerminalClosed()).toBe(true);
      expect(manifest(fixture.project, true)).toEqual(beforeProject);
      expect(manifest(fixture.home, false)).toEqual(beforeRuntime);
    } finally {
      fixture.dispose();
    }
  });

  test.each([
    [{ outcome: "cancelled" as const }, "Doctor: cancelled — no diagnostics changed."],
    [{ outcome: "unavailable" as const }, "Doctor: unavailable — run `ein doctor` directly, then return to the workbench."],
    [{ outcome: "throw" as const }, "Doctor: unavailable — run `ein doctor` directly, then return to the workbench."],
  ])("normalizes bounded doctor %s and returns to the menu", async (doctor, expected) => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario({ doctor }), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("3");
        await pty.waitForPrompt(expected);
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("4");
        return pty.waitForExit();
      });
      expect(result.code).toBe(0);
      expect(result.transcript).not.toMatch(/\x1b|PRIVATE|\/private/);
    } finally {
      fixture.dispose();
    }
  });

  test.each([
    [{ executor: { kind: "exit", code: 7 } }, 1],
    [{ executor: { kind: "signal", signal: "SIGTERM" } }, 1],
    [{ executor: { kind: "throw" } }, 1],
    [{ executor: { kind: "invalid" } }, 1],
  ] as const)("maps fixture executor failures to closed exit %d", async (overrides, expected) => {
    const fixture = makeFixture();
    try {
      const result = await runDriver(fixture, fixture.scenario(overrides), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Select action: ");
        pty.writeLine("2");
        await pty.waitForPrompt("Confirm launch?");
        pty.writeLine("yes");
        return pty.waitForExit();
      });
      expect(result.code).toBe(expected);
      expect(readEvents(fixture.evidence).filter((event) => event.kind === "executor")).toHaveLength(1);
      expect(result.transcript).not.toContain(fixture.root);
      expect(result.transcript).not.toContain("PRIVATE");
      expect(result.transcript).not.toMatch(/\x1b/);
    } finally {
      fixture.dispose();
    }
  });

  test("covers invalid selection, unavailable candidate, invalid runtime, EOF, SIGINT, and exit codes", async () => {
    const fixture = makeFixture();
    try {
      const invalid = await runDriver(fixture, fixture.scenario(), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.writeLine("1");
        await pty.waitForPrompt("Confirm project");
        pty.writeLine("yes");
        await pty.waitForPrompt("Select runtime: 1. Pi 2. Claude: ");
        pty.writeLine("invalid");
        return pty.waitForExit();
      });
      expect(invalid.code).toBe(2);

      const unavailable = await runDriver(fixture, fixture.scenario(), (pty) => pty.waitForExit(), join(fixture.root, "missing"));
      expect(unavailable.code).toBe(1);

      const eof = await runDriver(fixture, fixture.scenario(), async (pty) => {
        await pty.waitForPrompt("Select project number: ");
        pty.sendEOF();
        return pty.waitForExit();
      });
      expect(eof.code).toBe(130);
      expect([invalid.code, unavailable.code, eof.code]).toEqual([2, 1, 130]);
    } finally {
      fixture.dispose();
    }
  });

  test("classifies every closed workbench result without provider details", () => {
    expect(classifyWorkbenchExit({ outcome: "normal", reason: "exit" })).toBe(0);
    expect(classifyWorkbenchExit({ outcome: "operational", reason: "failure" })).toBe(1);
    expect(classifyWorkbenchExit({ outcome: "usage", reason: "invalid-input" })).toBe(2);
    expect(classifyWorkbenchExit({ outcome: "cancelled", reason: "sigint" })).toBe(130);
  });
});
