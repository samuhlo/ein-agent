import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
describe("candidate production boundary", () => {
  test("production owns the OpenTUI renderer and its pinned dependencies", () => {
    const runner = readFileSync(join(ROOT, "ein-pi/agent/surfaces/terminal-dashboard-runner.tsx"), "utf8");
    expect(runner).toMatch(/^import .*from ["']@opentui\/core["']/m);
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies).toMatchObject({ "@opentui/core": "0.5.1", "@opentui/solid": "0.5.1", "solid-js": "1.9.12" });
  });

  test("production routing selects OpenTUI and packaging compiles the production entrypoint", () => {
    const source = readFileSync(join(ROOT, "ein-pi/agent/surfaces/terminal-app-entrypoint.ts"), "utf8");
    expect(source).toContain("const interactive = io.isTTY && io.onKey !== undefined && !parsed.once;");
    expect(source).toContain("runTerminalDashboard");
    const build = readFileSync(join(ROOT, "spikes/opentui-solid-packaging/scripts/build-candidate.ts"), "utf8");
    expect(build).toContain("buildTerminalApp(target, outfile)");
    const productionBuild = readFileSync(join(ROOT, "installer/scripts/build-terminal-app.ts"), "utf8");
    expect(productionBuild).toContain('"ein-pi", "agent", "app.ts"');
  });
});
