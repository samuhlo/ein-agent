// =============================================================================
// CC-EIN PAYLOAD INVENTORY
// The archive keeps repository-relative paths so staged sync runs without the
// caller's working directory or an adjacent checkout.
// =============================================================================

/** Directories copied wholesale into the embedded runtime payload. */
export const CC_EIN_PAYLOAD_ROOTS = ["cc-ein", "ein-pi/core"] as const;

/** The canonical orchestrator asset shipped in the Claude payload. */
export const CC_EIN_ORCHESTRATOR_ASSET = "ein-pi/agent/assets/orchestrator.md" as const;

/**
 * The style contract compiler, imported by `cc-ein/sync.ts` itself. It is a pure
 * module with no relative imports, so it ships as a single file rather than as
 * an entry-point closure.
 */
export const CC_EIN_STYLE_CONTRACT = "ein-pi/agent/lib/style-contract.ts" as const;

/** Explicit files shipped alongside the Claude adapter for packaged execution. */
export const CC_EIN_PAYLOAD_FILES = [
  "pi-ein/pi-ein.fish",
  "pi-ein/migrate.ts",
  CC_EIN_ORCHESTRATOR_ASSET,
  CC_EIN_STYLE_CONTRACT,
] as const;

/** The SDD CLI entry point whose relative imports form the extra source closure. */
export const CC_EIN_PAYLOAD_SDD_ENTRY = "cc-ein/sdd-cli/cli.ts" as const;

/**
 * Every entry point `cc-ein/sync.ts` compiles at install time. Each one's
 * relative-import closure is staged, because a packaged sync has no checkout to
 * fall back on: a missing entry here becomes a compile failure on the user's
 * machine, not at packaging time.
 */
export const CC_EIN_PAYLOAD_SOURCE_ENTRIES = [
  CC_EIN_PAYLOAD_SDD_ENTRY,
  "ein-pi/agent/surfaces/surface-runner.ts",
  "cc-ein/continuity-runner.ts",
] as const;

/** Paths required before a staged sync can be considered usable. */
export const CC_EIN_PAYLOAD_REQUIRED_PATHS = [
  "cc-ein/sync.ts",
  CC_EIN_PAYLOAD_SDD_ENTRY,
  "ein-pi/agent/surfaces/surface-runner.ts",
  "cc-ein/continuity-runner.ts",
  "cc-ein/commands/ein/handoff.md",
  "ein-pi/core",
  CC_EIN_ORCHESTRATOR_ASSET,
  CC_EIN_STYLE_CONTRACT,
  "pi-ein/pi-ein.fish",
] as const;

export const CC_EIN_PAYLOAD_MANIFEST = "ein-cc-payload-manifest.json" as const;

export type CcEinPayloadManifestEntry = {
  path: string;
  sha256: string;
};

export type CcEinPayloadManifest = {
  format: "ein-cc-payload/v1";
  files: CcEinPayloadManifestEntry[];
};
