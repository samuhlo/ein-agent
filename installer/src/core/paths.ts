// =============================================================================
// TARGET PATHS
// Mirrors ein-paths.ts from the deployed agent. Single source of truth for
// where Ein lives on the user's machine. Derived from os.homedir().
// =============================================================================

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Respect $HOME when set (standard on POSIX, and lets us test against a temp
// home). Falls back to the OS lookup otherwise.
const HOME = process.env.HOME ?? homedir();

export const PI_HOME = join(HOME, ".pi");

// Desde la Fase 2, EIN vive AISLADO en ~/.pi-ein/agent (simétrico con cc-ein):
// `pi` queda vanilla, `pi-ein` (PI_CODING_AGENT_DIR) es la edición EIN. El
// installer/updater/deploy/marker/backup targetean AGENT_DIR, así que se
// resuelve el perfil correcto por AUTO-DETECCIÓN (marker), sin que el usuario
// pase env (`ein update` funciona en un shell normal):
//   1. Marker en el dir aislado → EIN vive ahí (instalación migrada o nueva).
//   2. Marker en el dir legacy ~/.pi/agent → instalación antigua sin migrar.
//   3. Ninguno → dir aislado (las instalaciones NUEVAS van aisladas por defecto).
// NOTA: a propósito NO se lee EIN_PI_AGENT_HOME/PI_CODING_AGENT_DIR aquí — esas
// son del RUNTIME (ein-paths del agente desplegado, que la suite setea global);
// el installer se guía por el marker en disco, no por el entorno de ejecución.
const LEGACY_AGENT = join(PI_HOME, "agent");
const ISOLATED_AGENT = join(HOME, ".pi-ein", "agent");
const MARKER_NAME = ".ein-install.json";

function resolveAgentDir(): string {
  if (existsSync(join(ISOLATED_AGENT, MARKER_NAME))) return ISOLATED_AGENT;
  if (existsSync(join(LEGACY_AGENT, MARKER_NAME))) return LEGACY_AGENT;
  return ISOLATED_AGENT;
}

export const AGENT_DIR = resolveAgentDir();
export const SECRETS_DIR = join(HOME, ".config", "opencode-secrets");
export const ENGRAM_DIR = join(HOME, ".engram-pi");
export const LOCAL_SKILLS_DIR = join(AGENT_DIR, "skills", "local");
export const DOWNLOADED_SKILLS_DIR = join(AGENT_DIR, "skills", "downloaded");
export const BACKUP_DIR = join(AGENT_DIR, "backups", "installer");

export const BUN_BIN_DIR = join(HOME, ".bun", "bin");
export const LOCAL_BIN_DIR = join(HOME, ".local", "bin");
// mise shima los binarios instalados vía npm global (p.ej. hypa) aquí.
export const MISE_SHIM_DIR = join(HOME, ".local", "share", "mise", "shims");

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
