import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const HOME = homedir();

export const PI_HOME = join(HOME, ".pi");
export const AGENT_DIR = join(PI_HOME, "agent");
export const SECRETS_DIR = join(HOME, ".config", "opencode-secrets");
export const ENGRAM_DIR = join(HOME, ".engram");
export const LOCAL_SKILLS_DIR = join(AGENT_DIR, "skills", "local");
export const DOWNLOADED_SKILLS_DIR = join(AGENT_DIR, "skills", "downloaded");
export const BACKUP_AUTO_DIR = join(AGENT_DIR, "backups", "auto");

export const LINEAR_KEY_PATH = join(SECRETS_DIR, "linear-api-key");
export const CONTEXT7_KEY_PATH = join(SECRETS_DIR, "context7-api-key");
export const MINIMAX_KEY_PATH = join(SECRETS_DIR, "minimax-api-key");

export function resolvePiBin(): string {
  const local = join(HOME, ".bun", "bin", "pi");
  return existsSync(local) ? local : "pi";
}

export function resolveUvxBin(): string {
  const local = join(HOME, ".local", "bin", "uvx");
  return existsSync(local) ? local : "uvx";
}

export default function einPaths(_pi: ExtensionAPI): void {
  // modulo de constantes compartidas; no registra hooks
}
