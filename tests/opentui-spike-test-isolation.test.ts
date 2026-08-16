import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SPIKE = join(import.meta.dir, "../spikes/opentui-solid-packaging");
const TESTS = join(SPIKE, "tests");
const packageJson = JSON.parse(readFileSync(join(SPIKE, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

describe("OpenTUI spike test isolation", () => {
  test("root discovery excludes every spike-owned case", () => {
    const files = readdirSync(TESTS).filter((file) => /\.[cm]?[jt]sx?$/.test(file)).sort();
    expect(files).toEqual([
      "candidate-artifact.case.ts",
      "dashboard-key.case.ts",
      "dashboard-lifecycle.case.ts",
      "dashboard-reactivity.case.tsx",
      "dashboard-static-boundary.case.ts",
      "dashboard-view.case.tsx",
      "package-layout.case.ts",
      "probe-view.case.tsx",
      "targets.case.ts",
    ]);
    expect(files.some((file) => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))).toBe(false);
  });

  test("the isolated check explicitly executes both case conventions", () => {
    // The spike no longer declares OpenTUI: it resolves the preload from the
    // root node_modules, which owns the dependency since the repackaging.
    expect(packageJson.scripts?.test).toBe("bun test --preload ../../node_modules/@opentui/solid/scripts/preload.js ./tests/*.case.ts ./tests/*.case.tsx");
    expect(packageJson.scripts?.check).toBe("bun run typecheck && bun run test");
  });
});
