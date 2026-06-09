// =============================================================================
// BACKUP
// Snapshot / list / restore of the Ein-owned tree under ~/.pi/agent. Backups
// live in ~/.pi/agent/backups/installer/<timestamp>_<reason> and exclude heavy
// regenerable dirs (skills/downloaded, npm) and the backups dir itself.
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AGENT_DIR, BACKUP_DIR } from "./paths.ts";

// Dirs/files we never copy into a backup (regenerable or recursive).
const BACKUP_EXCLUDE = new Set([
  "backups",
  "npm",
  "node_modules",
  "sessions",
  ".atl",
  ".piagents",
  ".sdd",
  "run-history.jsonl",
]);

// Within skills, downloaded/ is large and reinstallable; back up everything
// except that to keep snapshots small while preserving local skills + locks.
function copyEntry(srcRoot: string, destRoot: string, name: string): void {
  const src = join(srcRoot, name);
  const dest = join(destRoot, name);
  if (name === "skills") {
    mkdirSync(dest, { recursive: true });
    for (const sub of readdirSync(src)) {
      if (sub === "downloaded") continue;
      cpSync(join(src, sub), join(dest, sub), { recursive: true });
    }
    return;
  }
  cpSync(src, dest, { recursive: true });
}

export type BackupEntry = { name: string; path: string; mtime: Date };

export function snapshot(reason: string): string | null {
  if (!existsSync(AGENT_DIR)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = reason.replace(/[^a-z0-9-]/gi, "-");
  const dest = join(BACKUP_DIR, `${stamp}_${safeReason}`);
  mkdirSync(dest, { recursive: true });

  for (const name of readdirSync(AGENT_DIR)) {
    if (BACKUP_EXCLUDE.has(name)) continue;
    copyEntry(AGENT_DIR, dest, name);
  }
  return dest;
}

export function listBackups(): BackupEntry[] {
  if (!existsSync(BACKUP_DIR)) return [];
  const entries: BackupEntry[] = [];
  for (const name of readdirSync(BACKUP_DIR)) {
    const path = join(BACKUP_DIR, name);
    try {
      const st = statSync(path);
      if (st.isDirectory()) entries.push({ name, path, mtime: st.mtime });
    } catch {
      // skip
    }
  }
  return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

// Restore a backup over the live tree. Only overwrites the files present in the
// backup; user state outside it (auth.json, sessions, etc.) stays untouched.
export function restoreBackup(backupPath: string): void {
  if (!existsSync(backupPath)) {
    throw new Error(`Backup no encontrado: ${backupPath}`);
  }
  for (const name of readdirSync(backupPath)) {
    cpSync(join(backupPath, name), join(AGENT_DIR, name), { recursive: true });
  }
}
