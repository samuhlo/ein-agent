import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");
const productionFiles = [
  "ein-pi/agent/app.ts",
  "ein-pi/agent/surfaces/terminal-app-entrypoint.ts",
  "ein-pi/agent/lib/terminal-app-controller.ts",
  "ein-pi/agent/lib/terminal-app.ts",
];

describe("candidate production boundary", () => {
  test("production static paths have no top-level OpenTUI or Solid imports", () => {
    for (const file of productionFiles) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source).not.toMatch(/^import .*from ["'](?:@opentui\/|solid-js)/m);
    }
  });

  test("legacy routing predicate remains authoritative and the candidate is spike-local", () => {
    const source = readFileSync(join(ROOT, "ein-pi/agent/surfaces/terminal-app-entrypoint.ts"), "utf8");
    expect(source).toContain("const interactive = io.isTTY && io.onKey !== undefined && !parsed.once;");
    expect(source).not.toContain("dashboard-candidate");

    const rootPackage = readFileSync(join(ROOT, "package.json"), "utf8");
    expect(rootPackage).not.toMatch(/@opentui\/|solid-js/);
  });
});
