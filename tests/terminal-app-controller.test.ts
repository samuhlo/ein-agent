import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTerminalAppController,
  type LaunchOutcome,
  type TerminalAppControllerPorts,
} from "../ein-pi/agent/lib/terminal-app-controller.ts";
import { DASHBOARD_KEYS, visibleRows, type ProjectSummary, type Setting } from "../ein-pi/agent/lib/terminal-app.ts";

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
    expect(lifecycle).toEqual(["release", "exit:7"]);
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
