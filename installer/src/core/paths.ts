// =============================================================================
// TARGET PATHS
// Mirrors ein-paths.ts from the deployed agent. Single source of truth for
// where Ein lives on the user's machine. Derived from the active home.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { engramStoreDir } from "../../../shared/contracts/memory-contract.ts";

// Respect $HOME when set (standard on POSIX, and lets tests use a temp home).
// Keep HOME for the established no-context callers; new install flows use the
// dynamic activeHome()/derivePiInstallPaths() seam below.
const HOME = process.env.HOME ?? homedir();
export const INSTALL_MARKER_NAME = ".ein-install.json";

export type PiInstallPaths = {
  home: string;
  piHome: string;
  legacyAgentDir: string;
  isolatedAgentDir: string;
  legacyMarker: string;
  isolatedMarker: string;
};

export type PiInstallContext = PiInstallPaths & {
  agentDir: string;
  installMarker: string;
  backupDir: string;
  localSkillsDir: string;
  downloadedSkillsDir: string;
  secretsDir: string;
  engramDir: string;
  bunBinDir: string;
  localBinDir: string;
  miseShimDir: string;
};

/** Resolve the home used by a lifecycle that may have mutable test/runtime env. */
export function activeHome(): string {
  return process.env.HOME ?? homedir();
}

export function derivePiInstallPaths(home = activeHome()): PiInstallPaths {
  const piHome = join(home, ".pi");
  const legacyAgentDir = join(piHome, "agent");
  const isolatedAgentDir = join(home, ".pi-ein", "agent");
  return {
    home,
    piHome,
    legacyAgentDir,
    isolatedAgentDir,
    legacyMarker: join(legacyAgentDir, INSTALL_MARKER_NAME),
    isolatedMarker: join(isolatedAgentDir, INSTALL_MARKER_NAME),
  };
}

/**
 * The EIN marker is deliberately strict enough to distinguish a vanilla Pi
 * directory (or a damaged marker) from an installer-owned legacy directory.
 */
export function isValidInstallMarker(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const marker = value as Record<string, unknown>;
    return (
      typeof marker.version === "string" && marker.version.length > 0 &&
      typeof marker.installedAt === "string" &&
      marker.installedAt.length > 0 &&
      !Number.isNaN(Date.parse(marker.installedAt)) &&
      typeof marker.channel === "string" &&
      marker.channel.length > 0
    );
  } catch {
    return false;
  }
}

function makeContext(paths: PiInstallPaths, agentDir: string): PiInstallContext {
  return {
    ...paths,
    agentDir,
    installMarker: join(agentDir, INSTALL_MARKER_NAME),
    backupDir: join(agentDir, "backups", "installer"),
    localSkillsDir: join(agentDir, "skills", "local"),
    downloadedSkillsDir: join(agentDir, "skills", "downloaded"),
    secretsDir: join(paths.home, ".config", "opencode-secrets"),
    engramDir: engramStoreDir(paths.home),
    bunBinDir: join(paths.home, ".bun", "bin"),
    localBinDir: join(paths.home, ".local", "bin"),
    miseShimDir: join(paths.home, ".local", "share", "mise", "shims"),
  };
}

/**
 * Resolve the final target from one path snapshot. Migration is intentionally
 * not performed here: install.ts gates migration first, then calls this seam.
 */
export function resolvePiInstallContext(
  input: string | PiInstallPaths = derivePiInstallPaths(),
): PiInstallContext {
  const paths = typeof input === "string" ? derivePiInstallPaths(input) : input;
  const agentDir = isValidInstallMarker(paths.isolatedMarker)
    ? paths.isolatedAgentDir
    : isValidInstallMarker(paths.legacyMarker)
      ? paths.legacyAgentDir
      : paths.isolatedAgentDir;
  return makeContext(paths, agentDir);
}

export const PI_HOME = join(HOME, ".pi");

// Existing no-context consumers retain the established import-time contract.
const STATIC_PATHS = derivePiInstallPaths(HOME);
function resolveAgentDir(): string {
  if (isValidInstallMarker(STATIC_PATHS.isolatedMarker)) return STATIC_PATHS.isolatedAgentDir;
  if (isValidInstallMarker(STATIC_PATHS.legacyMarker)) return STATIC_PATHS.legacyAgentDir;
  return STATIC_PATHS.isolatedAgentDir;
}

export const AGENT_DIR = resolveAgentDir();
export const SECRETS_DIR = join(HOME, ".config", "opencode-secrets");
export const ENGRAM_DIR = engramStoreDir(HOME);
export const LOCAL_SKILLS_DIR = join(AGENT_DIR, "skills", "local");
export const DOWNLOADED_SKILLS_DIR = join(AGENT_DIR, "skills", "downloaded");
export const BACKUP_DIR = join(AGENT_DIR, "backups", "installer");

export const BUN_BIN_DIR = join(HOME, ".bun", "bin");
export const LOCAL_BIN_DIR = join(HOME, ".local", "bin");
// mise shima los binarios instalados vía npm global (p.ej. hypa) aquí.
export const MISE_SHIM_DIR = join(HOME, ".local", "share", "mise", "shims");

export const PI_BIN = join(BUN_BIN_DIR, "pi");
export const INSTALL_MARKER = join(AGENT_DIR, INSTALL_MARKER_NAME);

// Secret files Ein reads (plaintext, one token per file).
export const LINEAR_KEY_PATH = join(SECRETS_DIR, "linear-api-key");
export const CONTEXT7_KEY_PATH = join(SECRETS_DIR, "context7-api-key");
export const MINIMAX_KEY_PATH = join(SECRETS_DIR, "minimax-api-key");

// Files Ein owns and the installer manages. Never touched: auth.json and
// runtime state (handled by deploy exclusion list).
export const AUTH_JSON = join(AGENT_DIR, "auth.json");

export function defaultPiInstallContext(): PiInstallContext {
  return makeContext(STATIC_PATHS, AGENT_DIR);
}

export { HOME };
