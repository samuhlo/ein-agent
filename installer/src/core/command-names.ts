// =============================================================================
// COMMAND NAME PROMOTION
// `ein` is the terminal app; `ein-install` is this installer. Both names are
// written on every install and update so an existing `ein update` — where `ein`
// is still the old installer — lands in the new layout in a single step.
// =============================================================================

import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export const APP_COMMAND = "ein";
export const INSTALLER_COMMAND = "ein-install";

export type CommandPromotionOptions = {
  /** Directory holding the user-facing commands, usually ~/.local/bin. */
  binDir: string;
  /** Path of the running installer; it is copied to the installer name. */
  selfPath: string;
  /** Target-native terminal app embedded in the deployed template. */
  appArtifact: string;
  copy?: (from: string, to: string) => void;
  exists?: (path: string) => boolean;
};

export type CommandPromotionResult = {
  installer: { path: string; written: boolean };
  app: { path: string; written: boolean; reason?: string };
};

/**
 * Order matters: the installer is preserved under its new name *before* the app
 * overwrites `ein`. Doing it the other way round would destroy the only copy of
 * the installer on a machine migrating from the old layout.
 */
export function promoteCommandNames(options: CommandPromotionOptions): CommandPromotionResult {
  const exists = options.exists ?? existsSync;
  const copy = options.copy ?? copyFileSync;

  mkdirSync(options.binDir, { recursive: true });

  const installerPath = join(options.binDir, INSTALLER_COMMAND);
  let installerWritten = false;
  if (options.selfPath !== installerPath) {
    copy(options.selfPath, installerPath);
    chmodSync(installerPath, 0o755);
    installerWritten = true;
  }

  const appPath = join(options.binDir, APP_COMMAND);
  if (!exists(options.appArtifact)) {
    return {
      installer: { path: installerPath, written: installerWritten },
      app: { path: appPath, written: false, reason: "app-artifact-missing" },
    };
  }

  // Staged then renamed: a copy that fails must not leave `ein` half written
  // or, worse, delete the installer the user just migrated from.
  const staging = `${appPath}.staging-${process.pid}`;
  try {
    mkdirSync(dirname(appPath), { recursive: true });
    copy(options.appArtifact, staging);
    chmodSync(staging, 0o755);
    renameSync(staging, appPath);
  } catch (error) {
    rmSync(staging, { force: true });
    return {
      installer: { path: installerPath, written: installerWritten },
      app: { path: appPath, written: false, reason: error instanceof Error ? error.message : String(error) },
    };
  }

  return {
    installer: { path: installerPath, written: installerWritten },
    app: { path: appPath, written: true },
  };
}
