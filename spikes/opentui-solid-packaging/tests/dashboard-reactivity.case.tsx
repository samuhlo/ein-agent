import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { createTerminalAppController, type TerminalAppController, type TerminalAppControllerPorts } from "../../../ein-pi/agent/lib/terminal-app-controller.ts";
import type { ProjectSummary } from "../../../ein-pi/agent/lib/terminal-app.ts";
import { DashboardRoot } from "../src/dashboard-root";

const destroyers: Array<() => void> = [];
afterEach(() => {
  while (destroyers.length > 0) destroyers.pop()?.();
});

const summary: ProjectSummary = Object.freeze({
  name: "atlas", root: "/work/atlas", branch: "main", dirty: 0,
  change: undefined, phase: undefined, next: undefined,
  activeChanges: Object.freeze([]), blockers: Object.freeze([]), sessions: 0,
});

function controller(): TerminalAppController {
  const lifecycle: TerminalAppControllerPorts["lifecycle"] = { release: () => {}, resume: () => {}, exit: () => {} };
  return createTerminalAppController({
    readSummary: () => summary,
    settings: { read: () => [], apply: () => true },
    readSessions: () => ({ entries: [], unavailable: [] }),
    readSystem: () => [],
    launch: async () => ({ kind: "exited", code: 0 }),
    run: async () => 0,
    lifecycle,
  });
}

describe("dashboard Solid reactivity", () => {
  test("publishes snapshots into the frame and destruction stops updates", async () => {
    const source = controller();
    let publications = 0;
    const observed: TerminalAppController = {
      ...source,
      subscribe: (listener) => source.subscribe((snapshot) => { publications += 1; listener(snapshot); }),
    };
    const setup = await testRender(() => <DashboardRoot controller={observed} />, { width: 40, height: 10 });
    destroyers.push(() => setup.renderer.destroy());
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("> [s]");
    source.dispatch({ kind: "key", key: "j" });
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("> [p]");
    expect(publications).toBe(1);
    setup.renderer.destroy();
    source.dispatch({ kind: "key", key: "k" });
    expect(publications).toBe(1);
  });

  test("continues accepting input after a 40x10 to 100x40 resize", async () => {
    const source = controller();
    const setup = await testRender(() => <DashboardRoot controller={source} />, { width: 40, height: 10 });
    destroyers.push(() => setup.renderer.destroy());
    await setup.flush();
    setup.resize(100, 40);
    source.dispatch({ kind: "key", key: "\u001b[B" });
    await setup.flush();
    expect(setup.captureCharFrame()).toContain("No active change");
    expect(setup.captureCharFrame()).toContain("> [p]");
  });
});
