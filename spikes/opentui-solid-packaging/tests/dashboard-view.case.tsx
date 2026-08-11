import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
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
import { DashboardCandidate } from "../src/dashboard-view";

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
  test("renders the deterministic narrow 40x10 acceptance frame", async () => {
    const output = lines(await frame(40, 10), 40, 10);
    expect(output[1]).toBe(" EIN / Ein");
    expect(output[2]).toBe(" atlas  feat/dashboard");
    expect(output.slice(4, 8).map((row) => row.trimStart())).toEqual([
      `> [s] ▸ ${model.view.sections[0]!.rows[0]!.label}`,
      `[p] ◆ ${model.view.sections[0]!.rows[1]!.label}`,
      `[c] ◇ ${model.view.sections[0]!.rows[2]!.label}`,
      `[e] ▪ ${model.view.sections[0]!.rows[3]!.label}`,
    ]);
    expect(output[8]).toBe(" j/k move  enter select  q quit");
  });

  test("renders the deterministic wide 100x40 acceptance frame", async () => {
    const output = lines(await frame(100, 40), 100, 40);
    expect(output[1]).toBe(" EIN / Ein");
    expect(output[2]).toBe(" atlas  feat/dashboard  |  opentui-candidate  |  prove lifecycle");
    expect(output.slice(4, 11).map((row) => row.trimStart())).toEqual([
      `> [s] ▸ ${model.view.sections[0]!.rows[0]!.label}`,
      `[p] ◆ ${model.view.sections[0]!.rows[1]!.label}`,
      `[c] ◇ ${model.view.sections[0]!.rows[2]!.label}`,
      `[e] ▪ ${model.view.sections[0]!.rows[3]!.label}`,
      `[o] ○ ${model.view.sections[0]!.rows[4]!.label}`,
      `[u] ▴ ${model.view.sections[0]!.rows[5]!.label}`,
      `[q] ✕ ${model.view.sections[0]!.rows[6]!.label}`,
    ]);
    expect(output[38]).toBe(" j/k or arrows  enter select  tab views  q quit");
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
});
