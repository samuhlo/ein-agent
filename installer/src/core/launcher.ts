// =============================================================================
// FISH LAUNCHER INSTALL
// Writes one EIN-owned Fish function without touching neighboring functions.
// =============================================================================

import { basename, join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type LauncherInstallOptions = {
  /** Active user home used for the default Fish functions directory. */
  home: string;
  /** Exact file name to own, for example `ein-pi.fish`. */
  name: string;
  /** Packaged launcher source to write verbatim. */
  content: string;
  /** Explicit Fish functions directory, primarily useful for isolated tests. */
  destination?: string;
};

export type LauncherInstallResult = {
  path: string;
  changed: boolean;
};

/**
 * Install one named EIN Fish launcher. The helper creates only the parent
 * directory and reads/writes only the selected file, so unrelated Fish
 * functions remain outside its ownership boundary.
 */
export function installFishLauncher(options: LauncherInstallOptions): LauncherInstallResult {
  const { home, name, content } = options;
  if (!name || name !== basename(name)) {
    throw new Error(`Nombre de launcher invalido: ${name}`);
  }

  const destination = options.destination ?? join(home, ".config", "fish", "functions");
  mkdirSync(destination, { recursive: true });
  const path = join(destination, name);
  const changed = !existsSync(path) || readFileSync(path, "utf8") !== content;
  if (changed) writeFileSync(path, content);
  return { path, changed };
}
