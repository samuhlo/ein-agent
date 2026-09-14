import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

// Run against a supplied installed package, so this catches regressions in the
// dependency that actually draws the widget rather than a local imitation.
const [packageRoot] = process.argv.slice(2);
if (!packageRoot) throw new Error("Usage: bun tooling/verify-subagent-widget-animation.ts <pi-subagents directory>");
const { renderWidget } = await import(pathToFileURL(join(resolve(packageRoot), "src/tui/render.ts")).href);
const { createAsyncJobTracker } = await import(pathToFileURL(join(resolve(packageRoot), "src/runs/background/async-job-tracker.ts")).href);
const frames = [..."⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"];
const originalNow = Date.now;
const origin = 1_800_000_000_000;
let now = origin;
let mounts = 0;
let component: { render(width: number): string[]; dispose?(): void } | undefined;
const disposeComponent = () => component?.dispose?.();
const theme = { fg: (_tone: string, text: string) => text, bg: (_tone: string, text: string) => text, bold: (text: string) => text };
const ui = {
  theme, getToolsExpanded: () => false,
  setWidget(_key: string, factory: any) {
    component?.dispose?.();
    component = factory?.({ requestRender() {} }, theme);
    if (component) mounts++;
  },
};
const ctx = { hasUI: true, ui };
const job = {
  asyncId: "animation-probe", asyncDir: "/unused-animation-probe", mode: "single", agents: ["sdd-apply"],
  status: "running", startedAt: origin, updatedAt: origin, currentTool: "read", toolCount: 0,
};
const glyph = () => {
  assert(component, "the active job must mount a widget");
  const match = component.render(100).join("\n").match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/)?.[0];
  assert(match, "the running job must display its spinner");
  return match;
};

try {
  Date.now = () => now;
  renderWidget(ctx, [job]);
  let previous = glyph();
  let lastChange = 0;
  let changes = 0;
  for (let ms = 10; ms <= 2_000; ms += 10) {
    now = origin + ms;
    const current = glyph();
    if (current !== previous) {
      assert.equal(current, frames[(frames.indexOf(previous) + 1) % frames.length], "animation must advance sequentially");
      assert(ms - lastChange <= 120, `spinner held a frame for ${ms - lastChange} ms`);
      previous = current;
      lastChange = ms;
      changes++;
    }
    assert(ms - lastChange <= 120, "spinner freezes despite regular render requests");
    if (ms % 70 === 0) {
      job.updatedAt += 7;
      job.toolCount++;
      job.currentTool = job.currentTool === "read" ? "bash" : "read";
      renderWidget(ctx, [job]);
      assert.equal(glyph(), current, "activity must not change the animation phase at the same time");
    }
  }
  assert(changes >= 16, "the spinner must animate while waiting for activity");
  assert.equal(mounts, 1, "progress must retain the mounted component");
  for (const status of ["paused", "failed", "complete"]) {
    job.status = status;
    renderWidget(ctx, [job]);
    const settled = component!.render(100).join("\n");
    assert(!/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(settled), `${status} must stop animating`);
    now += 80;
    assert.equal(component!.render(100).join("\n"), settled);
  }
  renderWidget(ctx, []);
  assert.equal(component, undefined);
  console.log(`Subagent animation passed: ${changes} sequential frames in 2 s, stable phase during activity, one mount, terminal states and cleanup.`);
} finally {
  disposeComponent();
  Date.now = originalNow;
}

// Exercise the real scheduler with a quiet job: no incoming activity or calls
// to refreshWidget may be needed to keep requesting animation frames.
const renderTimes: number[] = [];
const liveUi = {
  ...ui,
  requestRender() { renderTimes.push(performance.now()); },
};
const liveState = {
  asyncJobs: new Map(), cleanupTimers: new Map(),
  lastUiContext: { hasUI: true, ui: liveUi }, widgetsSuspended: false,
};
const tracker = createAsyncJobTracker({ events: { emit() {} } }, liveState, "/unused-animation-probe", {
  watch: () => ({ on() {}, close() {}, unref() {} }),
});
try {
  tracker.handleStarted({ id: "animation-probe", agent: "sdd-apply", asyncDir: "/unused-animation-probe" });
  await Bun.sleep(100);
  assert.equal(liveState.asyncJobs.get("animation-probe")?.status, "running");
  renderTimes.length = 0;
  await Bun.sleep(1_000);
  assert(renderTimes.length >= 8, `quiet job requested only ${renderTimes.length} renders in one second`);
  const gaps = renderTimes.slice(1).map((time, index) => time - renderTimes[index]!);
  assert(Math.max(...gaps) < 200, "animation scheduler stalls between frames");
  liveState.widgetsSuspended = true;
  renderTimes.length = 0;
  await Bun.sleep(200);
  assert.equal(renderTimes.length, 0, "a suspended widget must not request repaints");
  tracker.dispose();
  liveState.widgetsSuspended = false;
  await Bun.sleep(200);
  assert.equal(renderTimes.length, 0, "disposing the tracker must stop its animation timer");
  console.log(`Live scheduler passed: maximum render gap ${Math.max(...gaps).toFixed(1)} ms; suspension and disposal verified.`);
} finally {
  tracker.dispose();
  disposeComponent();
  for (const timer of liveState.cleanupTimers.values()) clearTimeout(timer);
}
