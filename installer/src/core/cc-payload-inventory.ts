// =============================================================================
// EIN-CC PAYLOAD INVENTORY
// The archive keeps repository-relative paths so staged sync runs without the
// caller's working directory or an adjacent checkout.
// =============================================================================

import {
  ORCHESTRATOR_SOURCE,
  STYLE_CONTRACT_SOURCE,
  SURFACE_RUNNER_SOURCE,
} from "../../../shared/ports/runtime-payload.ts";

/** Directories copied wholesale into the embedded runtime payload. */
export const EIN_CC_PAYLOAD_ROOTS = ["ein-cc", "runtime", "vendor/skills"] as const;

/** The canonical orchestrator asset shipped in the Claude payload. */
export const EIN_CC_ORCHESTRATOR_ASSET = ORCHESTRATOR_SOURCE;

/**
 * The style contract compiler, imported by `ein-cc/sync.ts` itself. It is a pure
 * module with no relative imports, so it ships as a single file rather than as
 * an entry-point closure.
 */
export const EIN_CC_STYLE_CONTRACT = STYLE_CONTRACT_SOURCE;

/** Explicit files shipped alongside the Claude adapter for packaged execution. */
export const EIN_CC_PAYLOAD_FILES = [
  "ein-pi/launchers/ein-pi.fish",
  "ein-pi/migrate.ts",
  EIN_CC_ORCHESTRATOR_ASSET,
  EIN_CC_STYLE_CONTRACT,
] as const;

/** The SDD CLI entry point whose relative imports form the extra source closure. */
export const EIN_CC_PAYLOAD_SDD_ENTRY = "ein-cc/sdd-cli/cli.ts" as const;

/**
 * Every entry point `ein-cc/sync.ts` compiles at install time. Each one's
 * relative-import closure is staged, because a packaged sync has no checkout to
 * fall back on: a missing entry here becomes a compile failure on the user's
 * machine, not at packaging time.
 */
export const EIN_CC_PAYLOAD_SOURCE_ENTRIES = [
  "ein-cc/sync.ts",
  EIN_CC_PAYLOAD_SDD_ENTRY,
  SURFACE_RUNNER_SOURCE,
  "ein-cc/continuity-runner.ts",
] as const;

/** Paths required before a staged sync can be considered usable. */
export const EIN_CC_PAYLOAD_REQUIRED_PATHS = [
  "ein-cc/sync.ts",
  EIN_CC_PAYLOAD_SDD_ENTRY,
  SURFACE_RUNNER_SOURCE,
  "ein-cc/continuity-runner.ts",
  "ein-cc/commands/ein/handoff.md",
  "runtime",
  "vendor/skills",
  EIN_CC_ORCHESTRATOR_ASSET,
  EIN_CC_STYLE_CONTRACT,
  "ein-pi/launchers/ein-pi.fish",
] as const;

export const EIN_CC_PAYLOAD_MANIFEST = "ein-cc-payload-manifest.json" as const;

export type EinCcPayloadManifestEntry = {
  path: string;
  sha256: string;
};

export type EinCcPayloadManifest = {
  format: "ein-cc-payload/v1";
  files: EinCcPayloadManifestEntry[];
};
