// =============================================================================
// TARGET PATHS
// Mirrors ein-paths.ts from the deployed agent. Single source of truth for
// where Ein lives on the user's machine. Derived from os.homedir().
// =============================================================================

import { homedir } from "node:os";
import { join } from "node:path";

// Respect $HOME when set (standard on POSIX, and lets us test against a temp
// home). Falls back to the OS lookup otherwise.
const HOME = process.env.HOME ?? homedir();

export const PI_HOME = join(HOME, ".pi");
export const AGENT_DIR = join(PI_HOME, "agent");
export const SECRETS_DIR = join(HOME, ".config", "opencode-secrets");
export const ENGRAM_DIR = join(HOME, ".engram-pi");
export const LOCAL_SKILLS_DIR = join(AGENT_DIR, "skills", "local");
export const DOWNLOADED_SKILLS_DIR = join(AGENT_DIR, "skills", "downloaded");
export const BACKUP_DIR = join(AGENT_DIR, "backups", "installer");

export const BUN_BIN_DIR = join(HOME, ".bun", "bin");
export const LOCAL_BIN_DIR = join(HOME, ".local", "bin");

export const PI_BIN = join(BUN_BIN_DIR, "pi");
export const INSTALL_MARKER = join(AGENT_DIR, ".ein-install.json");

// Secret files Ein reads (plaintext, one token per file).
export const LINEAR_KEY_PATH = join(SECRETS_DIR, "linear-api-key");
export const CONTEXT7_KEY_PATH = join(SECRETS_DIR, "context7-api-key");
export const MINIMAX_KEY_PATH = join(SECRETS_DIR, "minimax-api-key");

// Files Ein owns and the installer manages. Never touched: auth.json and
// runtime state (handled by deploy exclusion list).
export const AUTH_JSON = join(AGENT_DIR, "auth.json");

export { HOME };
