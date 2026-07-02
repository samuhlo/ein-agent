// =============================================================================
// BACKUP
// Snapshot / list / restore of the Ein-owned tree under ~/.pi/agent.
// v2: compressed tar.gz archives, content-hash dedup (identical trees are not
// re-backed up), auto-prune (keeps the N most recent, pinned backups survive),
// legacy directory backups remain listable/restorable. Backups live in
// ~/.pi/agent/backups/installer and exclude heavy regenerable dirs
// (skills/downloaded, npm) and the backups dir itself.
// =============================================================================

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { run } from "./exec.ts";
import { AGENT_DIR, BACKUP_DIR } from "./paths.ts";

// Dirs/files we never copy into a backup (regenerable, recursive, or user
// state the installer must never overwrite on restore — auth.json included:
// restoring an old credential file over the current one breaks Pi silently).
const BACKUP_EXCLUDE = new Set([
  "backups",
  "npm",
  "node_modules",
  "sessions",
  "auth.json",
  "bin",
  "disabled-skill-conflicts",
  ".atl",
  ".piagents",
  ".sdd",
  "run-history.jsonl",
]);

// Backups beyond this count are pruned oldest-first (pinned ones survive).
const KEEP_COUNT = 5;

export type BackupPaths = {
  agentDir?: string;
  backupDir?: string;
  keep?: number;
};

export type BackupEntry = {
  name: string;
  path: string;
  mtime: Date;
  kind: "archive" | "dir";
  pinned: boolean;
};

export type SnapshotResult = {
  // Absolute path of the backup covering the current state: the new archive,
  // or the existing one when deduped. Null when there is nothing to back up.
  path: string | null;
  deduped: boolean;
  pruned: string[];
};

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

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(root, full, out);
    else if (st.isFile()) out.push(relative(root, full));
  }
}

// Deterministic content hash of the backup-relevant tree: same exclusions as
// the snapshot itself, files sorted by relative path, path + content hashed.
export function treeHash(agentDir: string): string | null {
  if (!existsSync(agentDir)) return null;
  const files: string[] = [];
  for (const name of readdirSync(agentDir)) {
    if (BACKUP_EXCLUDE.has(name)) continue;
    const full = join(agentDir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (name === "skills") {
        for (const sub of readdirSync(full)) {
          if (sub === "downloaded") continue;
          const subFull = join(full, sub);
          if (statSync(subFull).isDirectory()) walkFiles(agentDir, subFull, files);
          else files.push(relative(agentDir, subFull));
        }
      } else {
        walkFiles(agentDir, full, files);
      }
    } else if (st.isFile()) {
      files.push(name);
    }
  }
  files.sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update("\0");
    hash.update(readFileSync(join(agentDir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function metaPath(backupPath: string): string {
  return `${backupPath}.meta.json`;
}

function pinPath(backupPath: string): string {
  return `${backupPath}.pin`;
}

function readMetaHash(backupPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(metaPath(backupPath), "utf8")) as { hash?: unknown };
    return typeof parsed.hash === "string" ? parsed.hash : null;
  } catch {
    return null;
  }
}

export function listBackups(paths: BackupPaths = {}): BackupEntry[] {
  const backupDir = paths.backupDir ?? BACKUP_DIR;
  if (!existsSync(backupDir)) return [];
  const entries: BackupEntry[] = [];
  for (const name of readdirSync(backupDir)) {
    if (name.endsWith(".meta.json") || name.endsWith(".pin")) continue;
    const path = join(backupDir, name);
    try {
      const st = statSync(path);
      if (st.isDirectory()) {
        entries.push({ name, path, mtime: st.mtime, kind: "dir", pinned: existsSync(pinPath(path)) });
      } else if (name.endsWith(".tar.gz")) {
        entries.push({ name, path, mtime: st.mtime, kind: "archive", pinned: existsSync(pinPath(path)) });
      }
    } catch {
      // skip
    }
  }
  return entries.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

// Delete oldest backups beyond `keep`, skipping pinned ones. Returns the
// deleted backup names.
export function pruneBackups(paths: BackupPaths = {}): string[] {
  const keep = paths.keep ?? KEEP_COUNT;
  const entries = listBackups(paths);
  const pruned: string[] = [];
  let kept = 0;
  for (const entry of entries) {
    if (entry.pinned) {
      kept += 1;
      continue;
    }
    if (kept < keep) {
      kept += 1;
      continue;
    }
    rmSync(entry.path, { recursive: true, force: true });
    rmSync(metaPath(entry.path), { force: true });
    pruned.push(entry.name);
  }
  return pruned;
}

// Pin/unpin a backup so pruning never deletes it.
export function setPinned(backupPath: string, pinned: boolean): void {
  if (pinned) writeFileSync(pinPath(backupPath), "");
  else rmSync(pinPath(backupPath), { force: true });
}

export async function snapshot(reason: string, paths: BackupPaths = {}): Promise<SnapshotResult> {
  const agentDir = paths.agentDir ?? AGENT_DIR;
  const backupDir = paths.backupDir ?? BACKUP_DIR;
  if (!existsSync(agentDir)) return { path: null, deduped: false, pruned: [] };

  // Dedup: if the newest archive already captures this exact tree, skip.
  const hash = treeHash(agentDir);
  const newest = listBackups({ ...paths, backupDir })[0];
  if (hash && newest && newest.kind === "archive" && readMetaHash(newest.path) === hash) {
    return { path: newest.path, deduped: true, pruned: [] };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeReason = reason.replace(/[^a-z0-9-]/gi, "-");
  mkdirSync(backupDir, { recursive: true });

  const staging = mkdtempSync(join(tmpdir(), "ein-backup-"));
  try {
    for (const name of readdirSync(agentDir)) {
      if (BACKUP_EXCLUDE.has(name)) continue;
      copyEntry(agentDir, staging, name);
    }

    const dest = join(backupDir, `${stamp}_${safeReason}.tar.gz`);
    const result = await run("tar", ["-czf", dest, "-C", staging, "."]);
    if (!result.ok) {
      throw new Error(`No se pudo crear el backup (tar): ${result.stderr}`);
    }
    writeFileSync(
      metaPath(dest),
      `${JSON.stringify({ hash, reason, createdAt: new Date().toISOString() }, null, 2)}\n`,
    );

    const pruned = pruneBackups({ ...paths, backupDir });
    return { path: dest, deduped: false, pruned };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Restore a backup over the live tree. Only overwrites the files present in
// the backup; user state outside it (auth.json, sessions, etc.) stays
// untouched. Supports both v2 archives and legacy directory backups.
export async function restoreBackup(backupPath: string, paths: BackupPaths = {}): Promise<void> {
  const agentDir = paths.agentDir ?? AGENT_DIR;
  if (!existsSync(backupPath)) {
    throw new Error(`Backup no encontrado: ${backupPath}`);
  }
  if (statSync(backupPath).isDirectory()) {
    for (const name of readdirSync(backupPath)) {
      cpSync(join(backupPath, name), join(agentDir, name), { recursive: true });
    }
    return;
  }
  mkdirSync(agentDir, { recursive: true });
  const result = await run("tar", ["-xzf", backupPath, "-C", agentDir]);
  if (!result.ok) {
    throw new Error(`No se pudo restaurar el backup (tar): ${result.stderr}`);
  }
}
