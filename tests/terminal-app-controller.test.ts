import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTerminalAppController,
  type LaunchOutcome,
  type TerminalAppControllerPorts,
} from "../ein-pi/agent/lib/terminal-app-controller.ts";
import { DASHBOARD_KEYS, visibleRows, type ProjectSummary, type Setting } from "../ein-pi/agent/lib/terminal-app.ts";
import type { ContinuityPrepareResult } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";

const ENTER = "\r";
const SUMMARY: ProjectSummary = {
  name: "ein-agent",
  root: "/work/ein-agent",
  branch: "main",
  dirty: 0,
  change: "terminal-app-controller",
  phase: "apply",
  next: "verify",
  activeChanges: ["terminal-app-controller"],
  blockers: [],
  sessions: 1,
};

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function focusChange(controller: ReturnType<typeof createTerminalAppController>, change: string): void {
  controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.state });
  const index = visibleRows(controller.snapshot().view, "")
    .findIndex(({ row }) => row.action.kind === "focus-change" && row.action.change === change);
  expect(index).toBeGreaterThanOrEqual(0);
  controller.dispatch({ kind: "key", key: "g" });
  for (let cursor = 0; cursor < index; cursor += 1) controller.dispatch({ kind: "key", key: "j" });
  controller.dispatch({ kind: "key", key: ENTER });
  controller.dispatch({ kind: "key", key: "\u001b" });
}

function harness(overrides: Partial<TerminalAppControllerPorts> = {}) {
  const lifecycle: string[] = [];
  const snapshots: ProjectSummary[] = [];
  let settings: readonly Setting[] = [
    { id: "mode", label: "Mode", options: ["solo", "team"], value: "solo" },
  ];
  const ports: TerminalAppControllerPorts = {
    readSummary: (focusedChange, sessions) => {
      const summary = Object.freeze({ ...SUMMARY, change: focusedChange ?? SUMMARY.change, sessions });
      snapshots.push(summary);
      return summary;
    },
    settings: {
      read: () => settings,
      apply: (settingId, value) => {
        settings = settings.map((setting) => setting.id === settingId ? { ...setting, value } : setting);
        return true;
      },
    },
    readSessions: () => ({
      entries: [{
        provider: "claude",
        reference: "claude:v1:sha256:opaque",
        modifiedAtMs: 1,
        age: "1h",
        lastAction: undefined,
      }],
      unavailable: [],
    }),
    readSystem: () => [
      { id: "alpha", label: "Alpha", status: "current" },
      { id: "beta", label: "Beta", status: "current", command: ["ein-install", "doctor"] },
    ],
    launch: async () => ({ kind: "exited", code: 0 }),
    prepareContinue: async (provider) => ({ ok: true, brief: {
      ok: true, version: 1, format: "continuity-resume-brief/v1", content: "PRIVATE-BRIEF-CANARY",
      byteLength: 20, payloadByteLength: 1, payloadSha256: `sha256:${"a".repeat(64)}`, target: provider,
      checkpointRevision: `sha256:${"b".repeat(64)}`, truncated: false,
      omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [],
    } }),
    continueLaunch: async () => ({ kind: "exited", code: 0 }),
    run: async () => 0,
    lifecycle: {
      release: () => { lifecycle.push("release"); },
      resume: () => { lifecycle.push("resume"); },
      exit: (code) => { lifecycle.push(`exit:${code}`); },
    },
    ...overrides,
  };
  return { controller: createTerminalAppController(ports), lifecycle, snapshots };
}

describe("terminal app controller snapshots", () => {
  test("snapshots are readable, immutable, and replaced rather than mutated", () => {
    const { controller } = harness();
    const before = controller.snapshot();
    expect(Object.isFrozen(before)).toBe(true);

    controller.dispatch({ kind: "key", key: "j" });
    const after = controller.snapshot();
    expect(Object.isFrozen(after)).toBe(true);
    expect(after).not.toBe(before);
    expect(before.cursor).toBe(0);
    expect(after.cursor).toBe(1);
  });

  test("key dispatch publishes the same navigation effects as handleKey", () => {
    const { controller } = harness();
    const published: string[] = [];
    const unsubscribe = controller.subscribe((snapshot) => { published.push(snapshot.view.kind); });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.config });
    unsubscribe();

    expect(controller.snapshot().view.kind).toBe("config");
    expect(published).toEqual(["config"]);
  });

  test("refresh rebuilds current evidence while preserving cursor and query", () => {
    let betaStatus = "current";
    const { controller } = harness({
      readSystem: () => [
        { id: "alpha", label: "Alpha", status: "current" },
        { id: "beta", label: "Beta", status: betaStatus },
      ],
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.system });
    controller.dispatch({ kind: "key", key: "j" });
    controller.dispatch({ kind: "key", key: "f" });
    controller.dispatch({ kind: "key", key: "a" });
    controller.dispatch({ kind: "key", key: ENTER });
    betaStatus = "update-available";
    controller.dispatch({ kind: "refresh" });

    const snapshot = controller.snapshot();
    expect(snapshot.cursor).toBe(1);
    expect(snapshot.query).toBe("a");
    expect(visibleRows(snapshot.view, "")[1]?.row.value).toMatch(/actualización disponible|update available/);
  });
});

describe("terminal app controller effects", () => {
  test("a setting write is followed by a persisted-state reread", () => {
    const applied: string[] = [];
    let value = "solo";
    const { controller } = harness({
      settings: {
        read: () => [{ id: "mode", label: "Mode", options: ["solo", "team"], value }],
        apply: (settingId, next) => { applied.push(`${settingId}=${next}`); value = next; return true; },
      },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.config });
    controller.dispatch({ kind: "key", key: ENTER });

    expect(applied).toEqual(["mode=team"]);
    expect(controller.snapshot().view.settings?.[0]?.value).toBe("team");
  });

  test("session launch preserves the provider and opaque reference", async () => {
    const launched: unknown[] = [];
    const { controller, lifecycle } = harness({
      launch: async (provider, reference) => {
        launched.push({ provider, reference });
        return { kind: "exited", code: 7 };
      },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.sessions });
    controller.dispatch({ kind: "key", key: ENTER });
    await tick();

    expect(launched).toEqual([{ provider: "claude", reference: "claude:v1:sha256:opaque" }]);
    expect(lifecycle).toEqual(["release", "resume"]);
    expect(controller.snapshot().status).toMatch(/código 7|code 7/);
  });

  test("a selected project change survives back navigation and reaches a new Pi launch", async () => {
    const calls: unknown[][] = [];
    const summary = { ...SUMMARY, change: undefined, activeChanges: ["alpha", "beta"] };
    const { controller } = harness({
      readSummary: (focusedChange, sessions) => ({ ...summary, change: focusedChange, sessions }),
      launch: async (...args) => { calls.push(args); return { kind: "exited", code: 0 }; },
    });

    focusChange(controller, "beta");
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.pi });
    await tick();

    expect(calls).toEqual([["pi", undefined, "beta"]]);
  });

  test("an unavailable runtime resumes the same app and publishes status", async () => {
    const outcome: LaunchOutcome = { kind: "unavailable", reason: "executable-unavailable" };
    const { controller, lifecycle } = harness({ launch: async () => outcome });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.pi });
    await tick();

    expect(lifecycle).toEqual(["release", "resume"]);
    expect(controller.snapshot().view.kind).toBe("dashboard");
    expect(controller.snapshot().status).toContain("executable-unavailable");
  });

  test("Continue prepares before release, suppresses duplicates, and resumes once when unavailable", async () => {
    const order: string[] = [];
    let resolvePrepare!: (value: ContinuityPrepareResult) => void;
    const prepared = new Promise<ContinuityPrepareResult>((resolve) => { resolvePrepare = resolve; });
    const { controller, lifecycle } = harness({
      prepareContinue: async (provider) => { order.push(`prepare:${provider}`); return prepared; },
      continueLaunch: async (provider, brief) => { order.push(`launch:${provider}:${brief === "PRIVATE-BRIEF-CANARY"}`); return { kind: "unavailable", reason: "executable-unavailable" }; },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continueClaude });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continueClaude });
    expect(order).toEqual(["prepare:claude"]);
    expect(lifecycle).toEqual([]);
    resolvePrepare({ ok: true, brief: {
      ok: true, version: 1, format: "continuity-resume-brief/v1", content: "PRIVATE-BRIEF-CANARY", byteLength: 20,
      payloadByteLength: 1, payloadSha256: `sha256:${"a".repeat(64)}`, target: "claude", checkpointRevision: `sha256:${"b".repeat(64)}`,
      truncated: false, omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [],
    } });
    await tick(); await tick();
    expect(order).toEqual(["prepare:claude", "launch:claude:true"]);
    expect(lifecycle).toEqual(["release", "resume"]);
  });

  test("continue captures focus before async preparation while preserving no-focus and Claude intent", async () => {
    let resolvePrepare!: (value: ContinuityPrepareResult) => void;
    const prepared = new Promise<ContinuityPrepareResult>((resolve) => { resolvePrepare = resolve; });
    const calls: unknown[][] = [];
    const summary = { ...SUMMARY, change: "focus-before", activeChanges: ["focus-before", "focus-after"] };
    const focused = harness({
      readSummary: (focusedChange, sessions) => ({ ...summary, change: focusedChange ?? summary.change, sessions }),
      prepareContinue: async () => prepared,
      continueLaunch: async (...args) => { calls.push(args); return { kind: "exited", code: 0 }; },
    });
    focusChange(focused.controller, "focus-before");
    focused.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    focusChange(focused.controller, "focus-after");
    resolvePrepare({ ok: true, brief: {
      ok: true, version: 1, format: "continuity-resume-brief/v1", content: "PRIVATE-BRIEF-CANARY", byteLength: 20,
      payloadByteLength: 1, payloadSha256: `sha256:${"a".repeat(64)}`, target: "pi", checkpointRevision: `sha256:${"b".repeat(64)}`,
      truncated: false, omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [],
    } });
    await tick(); await tick();
    expect(calls).toEqual([["pi", "PRIVATE-BRIEF-CANARY", "focus-before"]]);

    const noFocusCalls: unknown[][] = [];
    const noFocus = harness({ continueLaunch: async (...args) => { noFocusCalls.push(args); return { kind: "exited", code: 0 }; } });
    noFocus.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    await tick(); await tick();
    expect(noFocusCalls).toEqual([["pi", "PRIVATE-BRIEF-CANARY", undefined]]);

    const claudeCalls: unknown[][] = [];
    const claude = harness({
      readSummary: (focusedChange, sessions) => ({ ...summary, change: focusedChange ?? summary.change, sessions }),
      continueLaunch: async (...args) => { claudeCalls.push(args); return { kind: "exited", code: 0 }; },
    });
    focusChange(claude.controller, "focus-before");
    claude.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continueClaude });
    await tick(); await tick();
    expect(claudeCalls).toEqual([["claude", "PRIVATE-BRIEF-CANARY", "focus-before"]]);
  });

  test("direct create carries visible focus while picked resume remains session-owned", async () => {
    const calls: unknown[][] = [];
    const { controller } = harness({
      launch: async (...args) => { calls.push(args); return { kind: "exited", code: 0 }; },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.pi });
    await tick();
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.sessions });
    controller.dispatch({ kind: "key", key: ENTER });
    await tick();

    expect(calls).toEqual([
      ["pi", undefined, "terminal-app-controller"],
      ["claude", "claude:v1:sha256:opaque"],
    ]);
  });

  test("quit invalidates pending Continue before its preparation completes", async () => {
    let resolvePrepare!: (value: ContinuityPrepareResult) => void;
    const prepared = new Promise<ContinuityPrepareResult>((resolve) => { resolvePrepare = resolve; });
    const trace: string[] = [], published: string[] = [];
    const { controller } = harness({
      prepareContinue: async () => prepared,
      continueLaunch: async () => { trace.push("launch"); return { kind: "exited", code: 0 }; },
      lifecycle: { release: () => trace.push("release"), resume: () => trace.push("resume"), exit: (code) => trace.push(`exit:${code}`) },
    });
    controller.subscribe((snapshot) => { published.push(snapshot.status); });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi }); controller.dispatch({ kind: "key", key: "q" });
    resolvePrepare({ ok: true, brief: { content: "PRIVATE-BRIEF-CANARY" } } as ContinuityPrepareResult);
    await tick(); expect(trace).toEqual(["exit:0"]); expect(published).toEqual([]);
  });

  test("Start and Resume cannot compete with pending Continue", async () => {
    const prepared = new Promise<ContinuityPrepareResult>(() => {});
    const { controller, lifecycle } = harness({
      prepareContinue: async () => prepared,
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi }); controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.pi });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.sessions }); controller.dispatch({ kind: "key", key: ENTER });
    expect(lifecycle).toEqual([]);
    expect(controller.snapshot().status).toMatch(/Continuación en curso|Continue already in progress/);
  });

  test("unsafe Continue briefs fail before terminal release", async () => {
    const launched: string[] = [];
    const { controller, lifecycle } = harness({
      prepareContinue: async () => ({ ok: true, brief: { content: "safe\n\u001b[201~injected" } } as ContinuityPrepareResult),
      continueLaunch: async () => { launched.push("launch"); return { kind: "exited", code: 0 }; },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    await tick();
    expect(lifecycle).toEqual([]); expect(launched).toEqual([]);
    expect(controller.snapshot().status).toContain("unsafe-brief");
  });

  test("blocked Continue stays owned and launch rejection exits fail-safe", async () => {
    const blocked = harness({ prepareContinue: async () => ({ ok: false, reason: "mutation-uncertain", blockers: ["PRIVATE"] }) });
    blocked.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    await tick();
    expect(blocked.lifecycle).toEqual([]);
    expect(blocked.controller.snapshot().status).toContain("mutation-uncertain");
    expect(blocked.controller.snapshot().status).not.toContain("PRIVATE");

    const failed = harness({ prepareContinue: async () => { throw new Error("PRIVATE"); } });
    failed.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    await tick();
    expect(failed.lifecycle).toEqual([]);
    expect(failed.controller.snapshot().status).toContain("refresh-failed");

    const rejected = harness({ continueLaunch: async () => { throw new Error("PRIVATE"); } });
    rejected.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.continuePi });
    await tick(); await tick();
    expect(rejected.lifecycle).toEqual(["release", "exit:1"]);
  });

  test("launch and command failures release ownership and exit safely", async () => {
    const launch = harness({ launch: async () => { throw new Error("boom"); } });
    launch.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.pi });
    await tick();
    expect(launch.lifecycle).toEqual(["release", "exit:1"]);

    const run = harness({ run: async () => { throw new Error("boom"); } });
    run.controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.system });
    run.controller.dispatch({ kind: "key", key: "j" });
    run.controller.dispatch({ kind: "key", key: ENTER });
    run.controller.dispatch({ kind: "key", key: ENTER });
    await tick();
    expect(run.lifecycle).toEqual(["release", "exit:1"]);
  });

  test("a confirmed command releases ownership and propagates its exit code", async () => {
    const commands: string[][] = [];
    const { controller, lifecycle } = harness({
      run: async (command) => { commands.push([...command]); return 9; },
    });
    controller.dispatch({ kind: "key", key: DASHBOARD_KEYS.system });
    controller.dispatch({ kind: "key", key: "j" });
    controller.dispatch({ kind: "key", key: ENTER });
    expect(lifecycle).toEqual([]);
    controller.dispatch({ kind: "key", key: ENTER });
    await tick();

    expect(commands).toEqual([["ein-install", "doctor"]]);
    expect(lifecycle).toEqual(["release", "exit:9"]);
  });
});

test("the controller has no terminal or renderer dependency", () => {
  const source = readFileSync(join(import.meta.dir, "../ein-pi/agent/lib/terminal-app-controller.ts"), "utf8");
  expect(source).not.toMatch(/terminal-app-entrypoint|TerminalAppIO|renderApp|theme\.ts|opentui|solid-js/);
});
