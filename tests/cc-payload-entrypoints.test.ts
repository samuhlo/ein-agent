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
  CC_EIN_ORCHESTRATOR_ASSET,
  CC_EIN_PAYLOAD_FILES,
  CC_EIN_PAYLOAD_REQUIRED_PATHS,
  CC_EIN_PAYLOAD_ROOTS,
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
    expect(entrypoints).toContain("cc-ein/continuity-runner.ts");
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
    expect(required).toContain("cc-ein/continuity-runner.ts");
    expect(required).toContain("cc-ein/commands/ein/handoff.md");
  });

  test("the canonical orchestrator route is explicit and required exactly once", () => {
    const canonicalRoute = "ein-pi/agent/assets/orchestrator.md";
    expect(CC_EIN_ORCHESTRATOR_ASSET).toBe(canonicalRoute);
    expect(CC_EIN_PAYLOAD_FILES.filter((path) => path === canonicalRoute)).toHaveLength(1);
    expect(CC_EIN_PAYLOAD_REQUIRED_PATHS.filter((path) => path === canonicalRoute)).toHaveLength(1);
  });

  test("the orchestrator inventory does not broaden to the agent root or aliases", () => {
    expect(CC_EIN_PAYLOAD_FILES).not.toContain("ein-pi/agent");
    expect(CC_EIN_PAYLOAD_ROOTS).not.toContain("ein-pi/agent");
    expect(CC_EIN_PAYLOAD_FILES.filter((path) => path.includes("orchestrator"))).toEqual([
      CC_EIN_ORCHESTRATOR_ASSET,
    ]);
    expect(CC_EIN_PAYLOAD_REQUIRED_PATHS.filter((path) => path.includes("orchestrator"))).toEqual([
      CC_EIN_ORCHESTRATOR_ASSET,
    ]);
    expect(CC_EIN_PAYLOAD_FILES).toContain("pi-ein/pi-ein.fish");
    expect(CC_EIN_PAYLOAD_FILES).toContain("pi-ein/migrate.ts");
    expect(CC_EIN_PAYLOAD_REQUIRED_PATHS).toContain("ein-pi/core");
  });

  test("the compile seam reports the child's output instead of discarding it", () => {
    // `stdio: "ignore"` is what made a missing file undiagnosable in the field.
    expect(SYNC_SOURCE).not.toMatch(/"--compile"[^)]*stdio:\s*"ignore"/s);
    expect(SYNC_SOURCE).toContain("stdio: [\"ignore\", \"pipe\", \"pipe\"]");
  });
});
