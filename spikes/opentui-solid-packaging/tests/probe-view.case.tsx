import { afterEach, describe, expect, test } from "bun:test";
import { testRender } from "@opentui/solid";
import { ProbeView, RENDER_MARKER } from "../src/probe-view";

const destroyers: Array<() => void> = [];
afterEach(() => {
  while (destroyers.length > 0) destroyers.pop()?.();
});

describe("Solid lifecycle marker", () => {
  test("renders deterministically and observes resize", async () => {
    const observations: Array<{ width: number; height: number }> = [];
    const setup = await testRender(() => <ProbeView />, {
      width: 40,
      height: 10,
    });
    destroyers.push(() => setup.renderer.destroy());
    setup.renderer.on("resize", (width: number, height: number) => observations.push({ width, height }));
    await setup.flush();
    expect(setup.captureCharFrame()).toContain(RENDER_MARKER);

    setup.resize(100, 40);
    await setup.flush();
    expect(observations).toContainEqual({ width: 100, height: 40 });
    expect(setup.captureCharFrame()).toContain("resize:renderer-event");
  });
});
