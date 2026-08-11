// =============================================================================
// BACKUP
// Snapshot / list / restore of the Ein-owned tree under ~/.pi/agent.
// v2: tar.gz + content-hash dedup + auto-prune (pinned survive); legacy dir
// backups remain listable. Excludes heavy regenerable dirs (skills/downloaded,
// npm) and the backups dir itself.
// =============================================================================

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
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
import { appPackageHash, copyAppPackage, restoreAppPackage, type AppPackagePaths } from "./app-package-lifecycle.ts";

const APP_PACKAGE_BACKUP = ".ein-app-package";

// BLINDAJE -> auth.json and sessions are never copied: restoring an old
// credential over the current one silently breaks Pi. Rest are regenerable
// or recursive and would bloat snapshots.
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
  "intercom",
]);

// Backups beyond this count are pruned oldest-first (pinned ones survive).
const KEEP_COUNT = 5;

export type BackupPaths = {
  agentDir?: string;
  backupDir?: string;
  keep?: number;
  appPackage?: AppPackagePaths;
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

// NOISE KILL -> Excluding downloaded/ (large, reinstallable) keeps snapshots
// small without losing local skills or lockfiles.
// GUARD -> cpSync abre cada fichero; un socket/FIFO/dispositivo (p.ej. el
// intercom/broker.sock del runtime de Pi) revienta con ENXIO. Se saltan del
// copiado — nunca son estado que restaurar.
function isCopyable(path: string): boolean {
  try {
    const st = lstatSync(path);
    return !(
      st.isSocket() ||
      st.isFIFO() ||
      st.isCharacterDevice() ||
      st.isBlockDevice()
    );
  } catch {
    return false;
  }
}

function copyEntry(srcRoot: string, destRoot: string, name: string): void {
  const src = join(srcRoot, name);
  const dest = join(destRoot, name);
  if (name === "skills") {
    mkdirSync(dest, { recursive: true });
    for (const sub of readdirSync(src)) {
      if (sub === "downloaded") continue;
      cpSync(join(src, sub), join(dest, sub), { recursive: true, filter: isCopyable });
    }
    return;
  }
  cpSync(src, dest, { recursive: true, filter: isCopyable });
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

// Deterministic hash of the backup-relevant tree (same exclusions as snapshot).
// Sorted by relative path; path + content both hashed so two identical
// snapshots collide on the same digest.
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

// Delete oldest backups beyond `keep`, skipping pinned. Returns deleted names.
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

  // NOISE KILL -> If the newest archive already captures this exact tree, skip.
  const tree = treeHash(agentDir);
  const hash = paths.appPackage
    ? createHash("sha256").update(tree ?? "").update(appPackageHash(paths.appPackage)).digest("hex")
    : tree;
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
    if (paths.appPackage) copyAppPackage(paths.appPackage, join(staging, APP_PACKAGE_BACKUP));

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

// Restore a backup over the live tree. Only overwrites files present in the
// backup; user state outside it (auth.json, sessions, ...) is untouched.
// Supports v2 archives and legacy directory backups.
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
  const staging = mkdtempSync(join(tmpdir(), "ein-restore-"));
  try {
    const result = await run("tar", ["-xzf", backupPath, "-C", staging]);
    if (!result.ok) throw new Error(`No se pudo restaurar el backup (tar): ${result.stderr}`);
    const packaged = join(staging, APP_PACKAGE_BACKUP);
    if (paths.appPackage && existsSync(packaged)) restoreAppPackage(packaged, paths.appPackage);
    rmSync(packaged, { recursive: true, force: true });
    mkdirSync(agentDir, { recursive: true });
    for (const name of readdirSync(staging)) cpSync(join(staging, name), join(agentDir, name), { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
