// =============================================================================
// SECRETS
// Manages ~/.config/opencode-secrets/* plaintext keys + CONTEXT7_API_KEY shell
// export. Idempotent and sentinel-guarded; never touches auth.json.
// =============================================================================

import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { Platform } from "./platform.ts";
import {
  CONTEXT7_KEY_PATH,
  LINEAR_KEY_PATH,
  MINIMAX_KEY_PATH,
  SECRETS_DIR,
} from "./paths.ts";

export type SecretName = "linear" | "context7" | "minimax";

const SECRET_PATHS: Record<SecretName, string> = {
  linear: LINEAR_KEY_PATH,
  context7: CONTEXT7_KEY_PATH,
  minimax: MINIMAX_KEY_PATH,
};

export async function ensureSecretsDir(): Promise<void> {
  await mkdir(SECRETS_DIR, { recursive: true });
  try {
    chmodSync(SECRETS_DIR, 0o700);
  } catch {
    // best-effort
  }
}

export function hasSecret(name: SecretName): boolean {
  const path = SECRET_PATHS[name];
  return existsSync(path) && readFileSync(path, "utf8").trim().length > 0;
}

// Write a plaintext secret file with 0600 perms. Empty value is a no-op.
export async function writeSecret(name: SecretName, value: string): Promise<boolean> {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  await ensureSecretsDir();
  const path = SECRET_PATHS[name];
  writeFileSync(path, `${trimmed}\n`);
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort
  }
  return true;
}

const SENTINEL_START = "# >>> ein context7 export >>>";
const SENTINEL_END = "# <<< ein context7 export <<<";

// Idempotent: append a CONTEXT7_API_KEY export to the shell rc. The value is
// read from the secrets file at shell startup so the key is never inlined.
export function ensureContext7Export(platform: Platform): { changed: boolean; rc: string } {
  const rc = platform.shellRc;
  const existing = existsSync(rc) ? readFileSync(rc, "utf8") : "";
  if (existing.includes(SENTINEL_START)) {
    return { changed: false, rc };
  }

  const isFish = platform.shell === "fish";
  const block = isFish
    ? [
        SENTINEL_START,
        `test -f "${CONTEXT7_KEY_PATH}"; and set -gx CONTEXT7_API_KEY (cat "${CONTEXT7_KEY_PATH}")`,
        SENTINEL_END,
        "",
      ].join("\n")
    : [
        SENTINEL_START,
        `export CONTEXT7_API_KEY="$(cat "${CONTEXT7_KEY_PATH}" 2>/dev/null)"`,
        SENTINEL_END,
        "",
      ].join("\n");

  const next = existing.endsWith("\n") || existing.length === 0 ? existing : `${existing}\n`;
  writeFileSync(rc, `${next}${block}`);
  return { changed: true, rc };
}
