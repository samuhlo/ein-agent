// =============================================================================
// PI LEGACY MIGRATION
// Safe move of an installer-owned legacy ~/.pi/agent into ~/.pi-ein/agent.
// The caller must gate this with a valid EIN marker; this function repeats the
// check so a future caller cannot accidentally migrate vanilla Pi state.
// =============================================================================

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  renameSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isValidInstallMarker, type PiInstallPaths } from "./paths.ts";

export type PiMigrationResult = {
  migrated: boolean;
  backupPath: string | null;
  source: string;
  destination: string;
};

export type PiMigrationOptions = {
  dryRun?: boolean;
};

/**
 * Migrate one positively identified legacy EIN installation. A destination
 * conflict or filesystem/backup error throws before the caller can deploy.
 */
export function migrateLegacyPi(
  paths: PiInstallPaths,
  options: PiMigrationOptions = {},
): PiMigrationResult {
  const { legacyAgentDir: source, isolatedAgentDir: destination } = paths;
  if (!isValidInstallMarker(paths.legacyMarker) || !existsSync(source)) {
    return { migrated: false, backupPath: null, source, destination };
  }

  if (existsSync(destination)) {
    throw new Error(`No se puede migrar Pi: el destino ya existe (${destination}).`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupPath = join(paths.piHome, `agent-premigrate-${stamp}.tar.gz`);
  // Keep the established migration's reversible pre-move backup semantics.
  if (options.dryRun) {
    return { migrated: false, backupPath, source, destination };
  }

  execFileSync("tar", ["-czf", backupPath, "-C", paths.piHome, "agent"], {
    stdio: "ignore",
  });

  mkdirSync(join(paths.home, ".pi-ein"), { recursive: true });
  renameSync(source, destination);

  // The deployed template contains absolute Pi paths in settings.json.
  const settingsPath = join(destination, "settings.json");
  if (existsSync(settingsPath)) {
    const before = readFileSync(settingsPath, "utf8");
    const after = before.split(source).join(destination);
    if (after !== before) writeFileSync(settingsPath, after);
  }

  return { migrated: true, backupPath, source, destination };
}
