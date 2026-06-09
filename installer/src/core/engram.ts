// =============================================================================
// ENGRAM RESOLUTION
// Finds the engram binary across platforms so mcp.json gets a correct path.
// Install logic (brew tap / linux release download) lives in deps.ts (Fase 3).
// =============================================================================

import { join } from "node:path";
import type { Platform } from "./platform.ts";
import { resolveFromCandidates } from "./exec.ts";
import { BUN_BIN_DIR, LOCAL_BIN_DIR } from "./paths.ts";

export type EngramResolution = {
  // Absolute path if found, or the literal "engram" fallback.
  command: string;
  found: boolean;
};

// Candidate locations engram may live in, by platform.
function candidatePaths(platform: Platform): string[] {
  if (platform.os === "darwin") {
    return [
      "/opt/homebrew/bin/engram", // Apple Silicon brew
      "/usr/local/bin/engram", // Intel brew
      join(LOCAL_BIN_DIR, "engram"),
    ];
  }
  // linux
  return [
    "/usr/local/bin/engram",
    join(LOCAL_BIN_DIR, "engram"),
    join(BUN_BIN_DIR, "engram"),
  ];
}

// Resolve engram for use in mcp.json. Returns an absolute path when found;
// otherwise the bare "engram" so the JSON stays valid and PATH can resolve it
// at runtime (doctor will flag it as a WARN).
export function resolveEngram(platform: Platform): EngramResolution {
  const found = resolveFromCandidates("engram", candidatePaths(platform), [
    BUN_BIN_DIR,
    LOCAL_BIN_DIR,
  ]);
  if (found) {
    // On macOS, avoid pinning a versioned Homebrew Cellar path; if the resolved
    // path points into Cellar, prefer the stable symlink under bin.
    if (found.includes("/Cellar/")) {
      const stable = candidatePaths(platform).find((c) => c.endsWith("/bin/engram"));
      return { command: stable ?? found, found: true };
    }
    return { command: found, found: true };
  }
  return { command: "engram", found: false };
}
