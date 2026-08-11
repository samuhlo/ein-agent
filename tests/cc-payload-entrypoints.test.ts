// =============================================================================
// TESTS: every entry point cc-ein/sync.ts compiles must ship in the payload
// This exists because the surface runner shipped for two releases without its
// source: a packaged install failed at compile time on the user's machine, and
// nothing here caught it at packaging time.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_SOURCE_ENTRIES,
} from "../installer/src/core/cc-payload-inventory.ts";

const REPO = join(import.meta.dir, "..");
const SYNC_SOURCE = readFileSync(join(REPO, "cc-ein", "sync.ts"), "utf8");

/** Repository-relative paths `sync.ts` builds with `join(REPO, ...)`. */
function compiledEntrypoints(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/join\(REPO,\s*((?:"[^"]+"\s*,?\s*)+)\)/g)) {
    const parts = [...(match[1] ?? "").matchAll(/"([^"]+)"/g)].map((part) => part[1]);
    const path = parts.join("/");
    if (path.endsWith(".ts")) found.add(path);
  }
  return [...found];
}

describe("cc-ein payload entry points", () => {
  test("sync.ts declares at least the runner and the terminal app", () => {
    const entrypoints = compiledEntrypoints(SYNC_SOURCE);
    expect(entrypoints).toContain("ein-pi/agent/surfaces/surface-runner.ts");
    expect(entrypoints).toContain("ein-pi/agent/app.ts");
  });

  test("every entry point sync.ts compiles is staged in the payload", () => {
    const staged: readonly string[] = CC_EIN_PAYLOAD_SOURCE_ENTRIES;
    for (const entrypoint of compiledEntrypoints(SYNC_SOURCE)) {
      expect(staged).toContain(entrypoint);
    }
  });

  test("those entry points are required, so a bad package fails at packaging time", () => {
    const required: readonly string[] = CC_EIN_PAYLOAD_REQUIRED_PATHS;
    expect(required).toContain("ein-pi/agent/surfaces/surface-runner.ts");
    expect(required).toContain("ein-pi/agent/app.ts");
    expect(required).toContain("installer/src/core/app-package-promotion.ts");
    expect(required).toContain("installer/scripts/dashboard-candidate-input.ts");
    expect(required).toContain("ein-pi/agent/launcher/dashboard-selector.ts");
    expect(required).toContain("ein-pi/agent/lib/dashboard-package.ts");
  });

  test("the compile seam reports the child's output instead of discarding it", () => {
    // `stdio: "ignore"` is what made a missing file undiagnosable in the field.
    expect(SYNC_SOURCE).not.toMatch(/"--compile"[^)]*stdio:\s*"ignore"/s);
    expect(SYNC_SOURCE).toContain("stdio: [\"ignore\", \"pipe\", \"pipe\"]");
  });
});
