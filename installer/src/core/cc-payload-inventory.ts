// =============================================================================
// CC-EIN PAYLOAD INVENTORY
// The archive keeps repository-relative paths so staged sync runs without the
// caller's working directory or an adjacent checkout.
// =============================================================================

/** Directories copied wholesale into the embedded runtime payload. */
export const CC_EIN_PAYLOAD_ROOTS = ["cc-ein", "ein-pi/core"] as const;

/** Pi assets shipped alongside the Claude adapter for packaged execution. */
export const CC_EIN_PAYLOAD_FILES = ["pi-ein/pi-ein.fish", "pi-ein/migrate.ts"] as const;

/** The SDD CLI entry point whose relative imports form the extra source closure. */
export const CC_EIN_PAYLOAD_SDD_ENTRY = "cc-ein/sdd-cli/cli.ts" as const;

/**
 * Sync and every entry point it compiles need their relative-import closures in
 * the archive. A packaged sync has no checkout to fall back on: a missing entry
 * here becomes a compile failure on the user's machine, not at packaging time.
 */
export const CC_EIN_PAYLOAD_SOURCE_ENTRIES = [
  "cc-ein/sync.ts",
  CC_EIN_PAYLOAD_SDD_ENTRY,
  "ein-pi/agent/surfaces/surface-runner.ts",
  "ein-pi/agent/app.ts",
] as const;

/** Paths required before a staged sync can be considered usable. */
export const CC_EIN_PAYLOAD_REQUIRED_PATHS = [
  "cc-ein/sync.ts",
  "installer/src/core/app-package-promotion.ts",
  "installer/scripts/dashboard-candidate-input.ts",
  "spikes/opentui-solid-packaging/src/candidate-artifact.ts",
  "spikes/opentui-solid-packaging/src/package-layout.ts",
  "spikes/opentui-solid-packaging/src/targets.ts",
  "ein-pi/agent/launcher/dashboard-selector.ts",
  "ein-pi/agent/lib/dashboard-package.ts",
  "ein-pi/agent/lib/terminal-app-args.ts",
  CC_EIN_PAYLOAD_SDD_ENTRY,
  "ein-pi/agent/surfaces/surface-runner.ts",
  "ein-pi/agent/app.ts",
  "ein-pi/core",
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
  dashboardSeed?: { format: "ein-dashboard-seed/v1"; target: string };
};
