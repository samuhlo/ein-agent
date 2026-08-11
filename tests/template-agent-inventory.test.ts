// =============================================================================
// TESTS: the Pi template ships everything the launchers and installer invoke
// Three releases shipped with `surfaces/` missing from the template allowlist,
// so `pi-ein workbench` and `pi-ein cleaner` never worked from a packaged
// install. These assertions derive what is required from the code that uses it,
// instead of trusting a hand-kept list.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const BUNDLE = readFileSync(join(REPO, "installer", "scripts", "bundle-template.ts"), "utf8");
const PI_LAUNCHER = readFileSync(join(REPO, "pi-ein", "pi-ein.fish"), "utf8");
const INSTALL_CLI = readFileSync(join(REPO, "installer", "src", "cli", "install.ts"), "utf8");

function allowlist(name: string): string[] {
  const match = new RegExp(`const ${name} = \\[([^\\]]*)\\]`, "s").exec(BUNDLE);
  return [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
}

const AGENT_FILES = allowlist("AGENT_FILES");
const AGENT_DIRS = allowlist("AGENT_DIRS");

/** First path segment of an agent-relative path, which is what the allowlist gates. */
function topLevel(path: string): string {
  return path.split("/")[0] ?? path;
}

function covered(path: string): boolean {
  const head = topLevel(path);
  return AGENT_DIRS.includes(head) || AGENT_FILES.includes(head);
}

describe("Pi template agent inventory", () => {
  test("every path the launcher invokes under the agent home is shipped", () => {
    const referenced = [...PI_LAUNCHER.matchAll(/\$EIN_PI_AGENT_HOME\/([A-Za-z0-9_./-]+)/g)]
      .map((match) => match[1] ?? "");
    expect(referenced.length).toBeGreaterThan(0);
    for (const path of referenced) {
      expect({ path, shipped: covered(path) }).toEqual({ path, shipped: true });
    }
  });

  test("the terminal app the installer compiles is shipped", () => {
    // install.ts delegates compilation to the package promotion boundary.
    expect(INSTALL_CLI + readFileSync(join(REPO, "installer", "src", "core", "app-package-promotion.ts"), "utf8")).toContain('"app.ts"');
    expect(AGENT_FILES).toContain("app.ts");
  });

  test("surfaces ship, because the launchers reach the runner by path", () => {
    expect(AGENT_DIRS).toContain("surfaces");
  });

  test("lib ships, because both the app and the runner import it", () => {
    expect(AGENT_DIRS).toContain("lib");
  });
});
