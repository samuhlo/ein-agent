import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
// @ts-expect-error The Bun entrypoint shares the package's index.d.ts declarations.
import { KeyEvent, KeyHandler } from "../../../node_modules/@opentui/core/index.bun.js";
import {
  createTerminalAppController,
  type LaunchOutcome,
  type TerminalAppController,
  type TerminalAppControllerPorts,
} from "../../../ein-pi/agent/lib/terminal-app-controller.ts";
import type { ProjectSummary, SystemComponent } from "../../../ein-pi/agent/lib/terminal-app.ts";
import { runTerminalDashboard as runDashboardCandidate, type TerminalDashboardRenderer as DashboardRenderer, type TerminalDashboardAdapters as DashboardRunnerAdapters } from "../../../ein-pi/agent/surfaces/terminal-dashboard-runner.tsx";

const summary: ProjectSummary = Object.freeze({
  name: "atlas", root: "/work/atlas", branch: "main", dirty: 0,
  change: undefined, phase: undefined, next: undefined,
  activeChanges: Object.freeze([]), blockers: Object.freeze([]), sessions: 0,
});

class FakeRenderer extends EventEmitter implements DashboardRenderer {
  readonly keyInput = new KeyHandler();
  readonly width = 40;
  readonly height = 10;
  destroys = 0;

  destroy(): void {
    if (this.destroys > 0) return;
    this.destroys += 1;
    this.emit("destroy");
  }
}

type Deferred<T> = Readonly<{ promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void }>;

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

function event(name: string, sequence = name, ctrl = false): KeyEvent {
  return new KeyEvent({
    name, sequence, ctrl, meta: false, shift: false, option: false,
    number: false, raw: sequence, eventType: "press", source: "raw",
  });
}

function controllerFactory(input: Readonly<{
  launch?: TerminalAppControllerPorts["launch"];
  run?: TerminalAppControllerPorts["run"];
  sessions?: TerminalAppControllerPorts["readSessions"];
  system?: readonly SystemComponent[];
  events?: string[];
}> = {}): (lifecycle: TerminalAppControllerPorts["lifecycle"]) => TerminalAppController {
  return (lifecycle) => createTerminalAppController({
    readSummary: () => summary,
    settings: { read: () => [], apply: () => true },
    readSessions: input.sessions ?? (() => ({ entries: [], unavailable: [] })),
    readSystem: () => input.system ?? [],
    launch: input.launch ?? (async () => ({ kind: "exited", code: 0 })),
    run: input.run ?? (async () => 0),
    lifecycle: {
      release: () => { input.events?.push("release"); lifecycle.release(); },
      resume: () => { input.events?.push("resume"); lifecycle.resume(); },
      exit: (code) => { input.events?.push(`exit:${code}`); lifecycle.exit(code); },
    },
  });
}

function harness(events: string[] = []): Readonly<{
  adapters: DashboardRunnerAdapters;
  renderers: FakeRenderer[];
}> {
  const renderers: FakeRenderer[] = [];
  return {
    renderers,
    adapters: {
      createRenderer: async () => {
        events.push("create-renderer");
        const renderer = new FakeRenderer();
        renderers.push(renderer);
        return renderer;
      },
      mount: async (controller, renderer) => {
        events.push("mount");
        const unsubscribe = controller.subscribe(() => { events.push("snapshot"); });
        (renderer as FakeRenderer).once("destroy", () => { unsubscribe(); events.push("destroy"); });
      },
    },
  };
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("dashboard renderer lifecycle", () => {
  test("normal quit and Ctrl+C dispatch once and clean up", async () => {
    for (const key of [event("q"), event("c", "\u0003", true)]) {
      const events: string[] = [];
      const owned = harness(events);
      const result = runDashboardCandidate(controllerFactory({ events }), owned.adapters);
      await tick();
      owned.renderers[0]!.keyInput.emit("keypress", key);
      expect(await result).toBe(0);
      expect(events).toEqual(["create-renderer", "mount", "exit:0", "destroy"]);
      expect(owned.renderers[0]!.destroys).toBe(1);
    }
  });

  test("arrows, j/k, Enter, q and Tab dispatch exactly one normalized key", async () => {
    const owned = harness();
    const dispatched: string[] = [];
    const result = runDashboardCandidate((lifecycle) => {
      const source = controllerFactory()(lifecycle);
      return {
        ...source,
        dispatch: (action) => {
          if (action.kind === "key") dispatched.push(action.key);
          source.dispatch(action);
        },
      };
    }, owned.adapters);
    await tick();
    for (const key of [
      event("down", "\u001b[B"), event("up", "\u001b[A"), event("j"), event("k"),
      event("tab", "\t"), event("escape", "\u001b"), event("enter", "\r"), event("q"),
    ]) owned.renderers[0]!.keyInput.emit("keypress", key);
    expect(await result).toBe(0);
    expect(dispatched).toEqual(["\u001b[B", "\u001b[A", "j", "k", "\t", "\u001b", "\r", "q"]);
  });

  test("setup and render errors exit 1 with owned cleanup", async () => {
    expect(await runDashboardCandidate(() => { throw new Error("setup"); }, harness().adapters)).toBe(1);
    expect(await runDashboardCandidate(controllerFactory(), {
      createRenderer: async () => { throw new Error("renderer setup"); },
      mount: async () => undefined,
    })).toBe(1);

    const renderer = new FakeRenderer();
    const code = await runDashboardCandidate(controllerFactory(), {
      createRenderer: async () => renderer,
      mount: async () => { throw new Error("render"); },
    });
    expect(code).toBe(1);
    expect(renderer.destroys).toBe(1);
  });

  test("launch rejection and run rejection preserve exit semantics and repeated destroy is harmless", async () => {
    const launchOwned = harness();
    const launchResult = runDashboardCandidate(controllerFactory({ launch: async () => { throw new Error("launch"); } }), launchOwned.adapters);
    await tick();
    launchOwned.renderers[0]!.keyInput.emit("keypress", event("p"));
    expect(await launchResult).toBe(1);
    expect(launchOwned.renderers[0]!.destroys).toBe(1);

    const runOwned = harness();
    const runResult = runDashboardCandidate(controllerFactory({
      system: [{ id: "doctor", label: "Doctor", status: "update-available", command: ["ein-install", "doctor"] }],
      run: async () => { throw new Error("run"); },
    }), runOwned.adapters);
    await tick();
    runOwned.renderers[0]!.keyInput.emit("keypress", event("u"));
    runOwned.renderers[0]!.keyInput.emit("keypress", event("enter", "\r"));
    runOwned.renderers[0]!.keyInput.emit("keypress", event("enter", "\r"));
    expect(await runResult).toBe(1);
    runOwned.renderers[0]!.destroy();
    expect(runOwned.renderers[0]!.destroys).toBe(1);
  });

  test("Pi and Claude create/resume unavailable handoff creates exactly one fresh generation", async () => {
    const cases = [
      { provider: "pi" as const, hotkey: "p", reference: undefined },
      { provider: "claude" as const, hotkey: "c", reference: undefined },
      { provider: "pi" as const, hotkey: "enter", reference: "pi-session" },
      { provider: "claude" as const, hotkey: "enter", reference: "claude-session" },
    ];
    for (const item of cases) {
      const launch = deferred<LaunchOutcome>();
      const events: string[] = [];
      const owned = harness(events);
      const result = runDashboardCandidate(controllerFactory({
        events,
        sessions: () => item.reference
          ? { entries: [{ provider: item.provider, reference: item.reference, modifiedAtMs: 1, age: "now", lastAction: "work" }], unavailable: [] }
          : { entries: [], unavailable: [] },
        launch: async (provider, reference) => { events.push(`launch:${provider}:${reference ?? "create"}`); return launch.promise; },
      }), owned.adapters);
      await tick();
      if (item.reference) owned.renderers[0]!.keyInput.emit("keypress", event("s"));
      owned.renderers[0]!.keyInput.emit("keypress", event(item.hotkey, item.hotkey === "enter" ? "\r" : item.hotkey));
      expect(events.slice(-3)).toEqual(["release", "destroy", `launch:${item.provider}:${item.reference ?? "create"}`]);
      launch.resolve({ kind: "unavailable", reason: "missing" });
      for (let index = 0; index < 4 && events.filter((item) => item === "mount").length < 2; index += 1) await tick();
      expect(owned.renderers).toHaveLength(2);
      expect(events.filter((item) => item === "create-renderer")).toHaveLength(2);
      expect(events.filter((item) => item === "mount")).toHaveLength(2);
      owned.renderers[1]!.keyInput.emit("keypress", event("q"));
      expect(await result).toBe(0);
    }
  });

  test("Pi and Claude create/resume exited handoff returns with one fresh listener generation", async () => {
    const cases = [
      { provider: "pi" as const, key: "p", reference: undefined },
      { provider: "claude" as const, key: "c", reference: undefined },
      { provider: "pi" as const, key: "enter", reference: "pi-session" },
      { provider: "claude" as const, key: "enter", reference: "claude-session" },
    ];
    for (const item of cases) {
      const events: string[] = [];
      const owned = harness(events);
      const result = runDashboardCandidate(controllerFactory({
        events,
        sessions: () => item.reference
          ? { entries: [{ provider: item.provider, reference: item.reference, modifiedAtMs: 1, age: "now", lastAction: "work" }], unavailable: [] }
          : { entries: [], unavailable: [] },
        launch: async (provider, reference) => {
          events.push(`launch:${provider}:${reference ?? "create"}`);
          return { kind: "exited", code: 7 };
        },
      }), owned.adapters);
      await tick();
      if (item.reference) owned.renderers[0]!.keyInput.emit("keypress", event("s"));
      owned.renderers[0]!.keyInput.emit("keypress", event(item.key, item.key === "enter" ? "\r" : item.key));
      for (let index = 0; index < 4 && owned.renderers.length < 2; index += 1) await tick();
      expect(events.indexOf("destroy")).toBeLessThan(events.findIndex((value) => value.startsWith("launch:")));
      expect(events).toContain("resume");
      expect(owned.renderers).toHaveLength(2);
      expect(owned.renderers[0]!.keyInput.listenerCount("keypress")).toBe(0);
      expect(owned.renderers[1]!.keyInput.listenerCount("keypress")).toBe(1);
      owned.renderers[1]!.keyInput.emit("keypress", event("q"));
      expect(await result).toBe(0);
    }
  });
});
