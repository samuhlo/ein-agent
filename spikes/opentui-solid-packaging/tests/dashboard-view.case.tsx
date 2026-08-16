import { afterEach, describe, expect, test } from "bun:test";
// @ts-expect-error The Bun entrypoint shares the package's index.d.ts declarations.
import { testRender } from "../../../node_modules/@opentui/solid/index.bun.js";
import {
  buildConfigView,
  buildDashboard,
  buildSessionsView,
  buildStateView,
  buildSystemView,
  initialModel,
  type AppModel,
  type ProjectSummary,
} from "../../../ein-pi/agent/lib/terminal-app.ts";
import { TerminalDashboardView as DashboardCandidate } from "../../../ein-pi/agent/surfaces/terminal-dashboard-view.tsx";

const summary: ProjectSummary = Object.freeze({
  name: "atlas",
  root: "/work/atlas",
  branch: "feat/dashboard",
  dirty: 0,
  change: "opentui-candidate",
  phase: "apply",
  next: "prove lifecycle",
  activeChanges: Object.freeze(["opentui-candidate"]),
  blockers: Object.freeze([]),
  sessions: 3,
});
const model: AppModel = initialModel(summary, buildDashboard(summary));
const destroyers: Array<() => void> = [];

afterEach(() => {
  while (destroyers.length > 0) destroyers.pop()?.();
});

async function frame(width: number, height: number): Promise<string> {
  const setup = await testRender(() => <DashboardCandidate view={() => ({ model, width, height })} />, { width, height });
  destroyers.push(() => setup.renderer.destroy());
  await setup.flush();
  return setup.captureCharFrame();
}

function lines(output: string, width: number, height: number): string[] {
  const rows = output.split("\n").slice(0, -1);
  expect(rows).toHaveLength(height);
  expect(rows.every((row) => row.length === width)).toBe(true);
  return rows.map((row) => row.trimEnd());
}

describe("dashboard presentation", () => {
  test("keeps project status and navigation useful at 40x10", async () => {
    const output = lines(await frame(40, 10), 40, 10);
    const text = output.join("\n");
    expect(text).toContain("EIN · Ein");
    for (const value of ["atlas", "feat/dashboard"]) expect(text).toContain(value);
    expect(text).toMatch(/clean|limpio/);
    expect(text).toContain("▸ [s]");
    expect(text).toMatch(/j\/k (?:move|mover)/);
  });

  test("shows distinct Pi and Claude launch/Continue choices when wide", async () => {
    const output = lines(await frame(100, 40), 100, 40);
    const text = output.join("\n");
    for (const key of ["[p]", "[c]", "[P]", "[C]"]) expect(text).toContain(key);
    expect(text).toContain("opentui-candidate");
    expect(text).toMatch(/←\/→ (?:or|o) h\/l (?:change|cambiar)/);
  });

  test("renders every controller view through the generic row primitive", async () => {
    const views = [
      buildDashboard(summary),
      buildStateView(summary),
      buildConfigView([{ id: "theme", label: "Theme", options: ["dark"], value: "dark" }]),
      buildSessionsView([{ provider: "pi", reference: "pi-1", age: "now", lastAction: "work" }], []),
      buildSystemView([{ id: "ein", label: "Ein", status: "current" }]),
    ];
    for (const view of views) {
      const next = initialModel(summary, view);
      const setup = await testRender(() => <DashboardCandidate view={() => ({ model: next, width: 100, height: 40 })} />, { width: 100, height: 40 });
      destroyers.push(() => setup.renderer.destroy());
      await setup.flush();
      expect(setup.captureCharFrame()).toContain(view.title);
      expect(setup.captureCharFrame()).toContain(view.sections[0]!.rows[0]!.label);
    }
  });

  test("configuration shows current values and every available choice", async () => {
    const next = initialModel(summary, buildConfigView([{ id: "theme", label: "Theme", options: ["dark", "light"], value: "dark" }]));
    const setup = await testRender(() => <DashboardCandidate view={() => ({ model: next, width: 100, height: 40 })} />, { width: 100, height: 40 });
    destroyers.push(() => setup.renderer.destroy());
    await setup.flush();
    const output = setup.captureCharFrame();
    expect(output).toContain("Theme  dark");
    expect(output).toContain("dark · light");
  });
});
