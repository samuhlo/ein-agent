// =============================================================================
// COMMAND NAME PROMOTION
// `ein` is the terminal app; `ein-install` is this installer. Both names are
// written on every install and update so an existing `ein update` — where `ein`
// is still the old installer — lands in the new layout in a single step.
// =============================================================================

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export const APP_COMMAND = "ein";
export const INSTALLER_COMMAND = "ein-install";

export type CommandPromotionOptions = {
  /** Directory holding the user-facing commands, usually ~/.local/bin. */
  binDir: string;
  /** Path of the running installer; it is copied to the installer name. */
  selfPath: string;
  /** Source of the terminal app, compiled into the app name. */
  appSource: string;
  compile?: (entrypoint: string, output: string) => void;
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
  const copy = options.copy ?? ((from: string, to: string) => {
    copyFileSync(from, to);
    chmodSync(to, 0o755);
  });
  const compile = options.compile ?? ((entrypoint: string, output: string) => {
    execFileSync("bun", ["build", "--compile", entrypoint, "--outfile", output], { stdio: "ignore" });
  });

  mkdirSync(options.binDir, { recursive: true });

  const installerPath = join(options.binDir, INSTALLER_COMMAND);
  let installerWritten = false;
  if (options.selfPath !== installerPath) {
    copy(options.selfPath, installerPath);
    installerWritten = true;
  }

  const appPath = join(options.binDir, APP_COMMAND);
  if (!exists(options.appSource)) {
    return {
      installer: { path: installerPath, written: installerWritten },
      app: { path: appPath, written: false, reason: "app-source-missing" },
    };
  }

  // Staged then renamed: a compile that fails must not leave `ein` half written
  // or, worse, delete the installer the user just migrated from.
  const staging = `${appPath}.staging-${process.pid}`;
  try {
    compile(options.appSource, staging);
    mkdirSync(dirname(appPath), { recursive: true });
    renameSync(staging, appPath);
    chmodSync(appPath, 0o755);
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
