// =============================================================================
// BACKUP
// Snapshot / list / restore of the Ein-owned tree under ~/.pi/agent.
// v2: tar.gz + content-hash dedup + auto-prune (pinned survive); legacy dir
// backups remain listable. Excludes heavy regenerable dirs (skills/downloaded,
// npm) and the backups dir itself.
// =============================================================================

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { AGENT_DIR, BACKUP_DIR } from "./paths.ts";
import { CONTENT_DIR, MANIFEST_FILE, METADATA_FILE, assertLinkTarget, assertSafeParent, assertSafePath, canonicalManifest, canonicalMetadata, collectTree, contentDigest, ensureSafeDestinationParent, fsyncDirectory, fsyncFile, fsyncTree, isExcluded, manifestDigest, snapshotId, unsealTree, validateSnapshot, type BackupMetadataV1 } from "./backup-manifest.ts";

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
  now?: () => Date;
  fault?: (point: string) => void;
};

export type BackupEntry = {
  name: string;
  path: string;
  mtime: Date;
  kind: "archive" | "dir" | "manifest-dir" | "recovery";
  pinned: boolean;
};

export type SnapshotResult = {
  // Absolute path of the backup covering the current state: the new archive,
  // or the existing one when deduped. Null when there is nothing to back up.
  path: string | null;
  deduped: boolean;
  pruned: string[];
};

export const BACKUP_FAILURE_MAX_BYTES = 512;
export const GENERIC_BACKUP_FAILURE = "Pi backup failed";
const backupEncoder = new TextEncoder();

function boundUtf8(value: string): string {
  let bounded = value;
  while (backupEncoder.encode(bounded).byteLength > BACKUP_FAILURE_MAX_BYTES) bounded = bounded.slice(0, -1);
  return bounded;
}

function sanitizeText(value: string, privateRoots: readonly string[]): string {
  let sanitized = value.replace(/\u001b\[[0-?]*[ -\/]*[@-~]/g, "").replace(/[\u0000-\u001f\u007f]/g, " ");
  for (const root of [...privateRoots].filter(Boolean).sort((a, b) => b.length - a.length)) sanitized = sanitized.split(root).join("[private-path]");
  sanitized = sanitized.replace(/\b(?:stack|stdout|stderr|environment)\b\s*[:=]?/gi, "");
  sanitized = sanitized.replace(/(?:[A-Za-z]:[\\/]|\/)(?:[^\s"'`<>]+[\\/])*[^\s"'`<>]+/g, "[path]");
  return sanitized.replace(/\s+/g, " ").trim();
}

function safeEntry(relativeEntry: string | undefined): string | undefined {
  if (!relativeEntry || relativeEntry.includes("\\") || relativeEntry.startsWith("/") || /^[A-Za-z]:[\\/]/.test(relativeEntry) || relativeEntry.split("/").some((part) => !part || part === "." || part === "..")) return undefined;
  return relativeEntry.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) || undefined;
}

export function sanitizeBackupFailureDetail(value: unknown, privateRoots: readonly string[] = []): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  return boundUtf8(sanitizeText(raw, privateRoots));
}

export class BackupFailure extends Error {
  readonly operation: string;
  readonly relativeEntry?: string;

  constructor(operation: string, relativeEntry: string | undefined, cause: unknown, privateRoots: readonly string[] = []) {
    const entry = safeEntry(relativeEntry);
    const detail = sanitizeBackupFailureDetail(cause, privateRoots) || "operation failed";
    super(boundUtf8(`${GENERIC_BACKUP_FAILURE}: operation=${sanitizeText(operation, privateRoots)}${entry ? `; entry=${entry}` : ""}; detail=${detail}`));
    this.name = "BackupFailure";
    this.operation = operation;
    this.relativeEntry = entry;
  }
}

function walkFiles(root: string, dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walkFiles(root, full, out);
    else if (st.isFile()) out.push(relative(root, full));
  }
}

// Deterministic hash of the backup-relevant tree (same exclusions as snapshot).
// Sorted by relative path; path + content both hashed so two identical
// snapshots collide on the same digest.
export function treeHash(agentDir: string): string | null {
  if (!existsSync(agentDir)) return null;
  try { return contentDigest(collectTree(agentDir).entries); } catch { return null; }
  /* legacy hash implementation retained below for archive metadata compatibility */
  /* c8 ignore start */
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
  /* c8 ignore stop */
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
  try { assertSafePath(backupDir); } catch { return []; }
  const entries: BackupEntry[] = [];
  for (const name of readdirSync(backupDir)) {
    if (name.startsWith(".staging-") || name.endsWith(".meta.json") || name.endsWith(".pin")) continue;
    const path = join(backupDir, name);
    try {
      const st = lstatSync(path);
      if (st.isSymbolicLink()) continue;
      const pin = safeMarker(pinPath(path));
      if (pin === false) continue;
      if (st.isDirectory()) {
        const manifest = safeMarker(join(path, MANIFEST_FILE)), metadata = safeMarker(join(path, METADATA_FILE));
        if (manifest === false || metadata === false || manifest !== metadata) continue;
        const recovery = name.startsWith(".recovery-") && safeMarker(metaPath(path)) === true && pin === true; if (name.startsWith(".recovery-") && !recovery) continue;
        entries.push({ name, path, mtime: st.mtime, kind: recovery ? "recovery" : manifest ? "manifest-dir" : "dir", pinned: recovery || pin === true });
      } else if (name.endsWith(".tar.gz")) {
        entries.push({ name, path, mtime: st.mtime, kind: "archive", pinned: pin === true });
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
    if (entry.kind !== "manifest-dir") continue;
    if (entry.pinned) {
      kept += 1;
      continue;
    }
    if (kept < keep) {
      kept += 1;
      continue;
    }
    try { validateSnapshot(entry.path); } catch { continue; }
    rmSync(entry.path, { recursive: true, force: true });
    rmSync(metaPath(entry.path), { force: true });
    rmSync(pinPath(entry.path), { force: true });
    pruned.push(entry.name);
  }
  return pruned;
}

// Pin/unpin a backup so pruning never deletes it.
export function setPinned(backupPath: string, pinned: boolean): void {
  assertSafePath(backupPath); assertSafePath(dirname(backupPath));
  if (lstatSync(backupPath).isSymbolicLink()) throw new Error("Backup no permitido");
  if (backupPath.includes(`${sep}.recovery-`) && !pinned) throw new Error("Recovery pin protegido");
  if (safeMarker(pinPath(backupPath)) === false) throw new Error("Pin no permitido");
  if (pinned) writeFileSync(pinPath(backupPath), "", { mode: 0o600 });
  else rmSync(pinPath(backupPath), { force: true });
}

export async function snapshot(reason: string, paths: BackupPaths = {}): Promise<SnapshotResult> {
  const agentDir = paths.agentDir ?? AGENT_DIR;
  const backupDir = paths.backupDir ?? BACKUP_DIR;
  let operation = "snapshot";
  let relativeEntry: string | undefined;
  const fault = (point: string): void => {
    const parts = point.split(":");
    const entryStart = parts.length >= 4 ? 3 : 2;
    operation = parts.slice(0, entryStart).join(":");
    relativeEntry = parts.length > entryStart ? parts.slice(entryStart).join(":") || undefined : undefined;
    try { paths.fault?.(point); } catch (error) { throw new BackupFailure(operation, relativeEntry, error, [agentDir, backupDir]); }
  };
  let published: string | null = null;
  let complete = false;
  try {
    try { const source = lstatSync(agentDir); if (source.isSymbolicLink() || !source.isDirectory()) throw 0; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path: null, deduped: false, pruned: [] }; throw new Error("Raiz de backup no permitida"); }
    operation = "snapshot:root-check"; assertSafePath(agentDir); assertSafeParent(backupDir);

    // Manifest-backed snapshots publish on the backup filesystem and dedupe bytes, not mtimes.
    operation = "snapshot:hash";
    const hash = treeHash(agentDir);
    operation = "snapshot:list";
    const newest = listBackups({ ...paths, backupDir })[0];
    if (hash && newest && newest.kind === "manifest-dir") {
      operation = "snapshot:dedupe-validate";
      if (validateSnapshot(newest.path).metadata.contentDigest === hash) return { path: newest.path, deduped: true, pruned: [] };
    }

    const createdAt = (paths.now?.() ?? new Date()).toISOString();
    const stamp = createdAt.replace(/[:.]/g, "-");
    const safeReason = reason.replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "snapshot";
    operation = "snapshot:prepare";
    mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    assertSafePath(backupDir);
    const staging = join(backupDir, `.staging-${randomUUID()}`);
    mkdirSync(join(staging, CONTENT_DIR), { recursive: true, mode: 0o700 });
    try {
      operation = "snapshot:copy";
      const manifest = collectTree(agentDir, join(staging, CONTENT_DIR), true, fault, "snapshot:copy");
      fault("snapshot:copy");
      const manifestRaw = canonicalManifest(manifest);
      const metadata: BackupMetadataV1 = { schemaVersion: 1, snapshotId: snapshotId(manifestRaw, safeReason, createdAt), manifestSha256: manifestDigest(manifest), contentDigest: contentDigest(manifest.entries), reason: safeReason, createdAt };
      operation = "snapshot:manifest-write";
      writeFileSync(join(staging, MANIFEST_FILE), manifestRaw, { mode: 0o600 }); fault("snapshot:manifest-write");
      operation = "snapshot:metadata-write";
      writeFileSync(join(staging, METADATA_FILE), canonicalMetadata(metadata), { mode: 0o600 }); fault("snapshot:metadata-write");
      operation = "snapshot:validate";
      validateSnapshot(staging); fault("snapshot:fsync");
      operation = "snapshot:fsync";
      fsyncTree(staging, fault, "snapshot:fsync");
      const dest = join(backupDir, `${stamp}_${safeReason}_${metadata.contentDigest.slice(0, 12)}.snapshot`);
      operation = "snapshot:rename";
      renameSync(staging, dest); published = dest; fault("snapshot:rename");
      operation = "snapshot:readback";
      validateSnapshot(dest); fault("snapshot:readback");
      operation = "snapshot:parent-fsync";
      fsyncDirectory(backupDir); fault("snapshot:parent-fsync"); complete = true;
      const pruned = pruneBackups({ ...paths, backupDir });
      return { path: dest, deduped: false, pruned };
    } finally {
      operation = "snapshot:cleanup";
      if (existsSync(staging)) { fault("snapshot:cleanup-staging"); unsealTree(staging); rmSync(staging, { recursive: true, force: true }); }
      if (!complete && published) { fault("snapshot:cleanup-published"); unsealTree(published); rmSync(published, { recursive: true, force: true }); }
    }
  } catch (error) {
    if (error instanceof BackupFailure) throw error;
    throw new BackupFailure(operation, relativeEntry, error, [agentDir, backupDir]);
  }
}

function assertDestinationAbsent(path: string): void {
  try {
    lstatSync(path);
    throw new Error("Restore rechazado: colision de destino");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function writeNoFollowFile(path: string, data: Buffer, mode: number): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
    let offset = 0;
    while (offset < data.byteLength) offset += writeSync(fd, data, offset, data.byteLength - offset, null);
    fchmodSync(fd, mode);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function copyNodeNoFollow(source: string, destination: string, destinationRoot: string): void {
  assertSafePath(dirname(source));
  const rel = relative(destinationRoot, destination).split(sep).join("/");
  ensureSafeDestinationParent(destinationRoot, rel);
  assertDestinationAbsent(destination);
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    const target = readlinkSync(source, "utf8");
    assertLinkTarget(target);
    symlinkSync(target, destination);
    return;
  }
  if (sourceStat.isDirectory()) {
    mkdirSync(destination, { mode: sourceStat.mode & 0o7777 });
    assertSafePath(destination);
    for (const name of readdirSync(source).sort()) copyNodeNoFollow(join(source, name), join(destination, name), destinationRoot);
    chmodSync(destination, sourceStat.mode & 0o7777);
    return;
  }
  if (!sourceStat.isFile()) throw new Error("Restore rechazado: estado excluido no permitido");
  let fd: number | undefined;
  try {
    fd = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.dev !== sourceStat.dev || opened.ino !== sourceStat.ino || opened.mode !== sourceStat.mode || opened.size !== sourceStat.size) throw new Error("Restore rechazado: origen excluido cambio");
    const data = readFileSync(fd);
    const after = fstatSync(fd);
    if (after.dev !== sourceStat.dev || after.ino !== sourceStat.ino || after.mode !== sourceStat.mode || after.size !== sourceStat.size) throw new Error("Restore rechazado: origen excluido cambio");
    writeNoFollowFile(destination, data, sourceStat.mode & 0o7777);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function replaceNodeNoFollow(source: string, destination: string, destinationRoot: string): void {
  const rel = relative(destinationRoot, destination).split(sep).join("/");
  ensureSafeDestinationParent(destinationRoot, rel);
  try {
    const targetStat = lstatSync(destination);
    if (targetStat.isDirectory() && !targetStat.isSymbolicLink()) throw new Error("Restore rechazado: destino de estado legacy no permitido");
    unlinkSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  copyNodeNoFollow(source, destination, destinationRoot);
}

function copyExcludedState(sourceRoot: string, destinationRoot: string): void {
  assertSafePath(sourceRoot);
  assertSafePath(destinationRoot);
  for (const name of readdirSync(sourceRoot).sort()) {
    // Regenerable dependency trees stay excluded during restore as well; copying
    // them would turn a bounded backup into an unbounded dependency transfer.
    if (name === "npm" || name === "node_modules") continue;
    if (isExcluded(name)) copyNodeNoFollow(join(sourceRoot, name), join(destinationRoot, name), destinationRoot);
  }
  const downloaded = join(sourceRoot, "skills", "downloaded");
  try { lstatSync(downloaded); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  copyNodeNoFollow(downloaded, join(destinationRoot, "skills", "downloaded"), destinationRoot);
}

// Restore a backup over the live tree. Only overwrites files present in the
// backup; user state outside it (auth.json, sessions, ...) is untouched.
// Supports v2 archives and legacy directory backups.
export async function restoreBackup(backupPath: string, paths: BackupPaths = {}): Promise<void> {
  const agentDir = paths.agentDir ?? AGENT_DIR;
  const backupDir = paths.backupDir ?? BACKUP_DIR;
  if (resolve(dirname(backupPath)) !== resolve(backupDir)) throw new Error("Backup fuera de la raiz permitida");
  assertSafePath(backupDir); assertSafePath(dirname(agentDir));
  if (!existsSync(backupPath)) {
    throw new Error(`Backup no encontrado: ${backupPath}`);
  }
  if (lstatSync(backupPath).isSymbolicLink()) throw new Error("Backup enlazado no permitido");
  if (statSync(backupPath).isDirectory() && existsSync(join(backupPath, MANIFEST_FILE))) {
    const { manifest } = validateSnapshot(backupPath);
    const stage = `${agentDir}.restore-${randomUUID()}`;
    const rollback = `${agentDir}.rollback-${randomUUID()}`;
    const retained = join(backupDir, `.recovery-${randomUUID()}`);
    const hadLive = existsSync(agentDir);
    let moved = false;
    let retainedMoved = false;
    try {
      mkdirSync(stage, { recursive: true, mode: 0o700 });
      collectTree(join(backupPath, CONTENT_DIR), stage, false, paths.fault, "restore:stage-copy"); paths.fault?.("restore:stage-copy");
      if (canonicalManifest(collectTree(stage)) !== canonicalManifest(manifest)) throw new Error("Backup invalido: staging no coincide");
      if (existsSync(agentDir)) { if (lstatSync(agentDir).isSymbolicLink()) throw new Error("Restore rechazado: raiz live enlazada"); renameSync(agentDir, rollback); moved = true; paths.fault?.("restore:live-rename"); }
      renameSync(stage, agentDir); paths.fault?.("restore:stage-rename");
      if (moved) {
        copyExcludedState(rollback, agentDir);
        for (const name of readdirSync(rollback)) if (isExcluded(name)) paths.fault?.(`restore:excluded-copy:${name}`);
        if (existsSync(join(rollback, "skills", "downloaded"))) paths.fault?.("restore:excluded-copy:skills/downloaded");
        paths.fault?.("restore:excluded-copy");
      }
      if (canonicalManifest(collectTree(agentDir)) !== canonicalManifest(manifest)) throw new Error("Restore rechazado: readback no coincide");
      paths.fault?.("restore:readback");
      paths.fault?.("restore:live-fsync"); fsyncTree(agentDir, paths.fault, "restore:live-fsync"); fsyncDirectory(dirname(agentDir)); paths.fault?.("restore:live-parent-fsync");
      if (moved) { renameSync(rollback, retained); retainedMoved = true; paths.fault?.("restore:retain-rename"); writeFileSync(metaPath(retained), `${JSON.stringify({ kind: "restore-recovery-v1", createdAt: (paths.now?.() ?? new Date()).toISOString() })}\n`, { mode: 0o600 }); paths.fault?.("restore:retain-meta-write"); writeFileSync(pinPath(retained), "", { mode: 0o600 }); paths.fault?.("restore:retain-pin-write"); paths.fault?.("restore:retain-fsync"); fsyncTree(retained, paths.fault, "restore:retain-fsync"); fsyncFile(metaPath(retained)); paths.fault?.("restore:retain-meta-fsync"); fsyncFile(pinPath(retained)); paths.fault?.("restore:retain-pin-fsync"); fsyncDirectory(backupDir); paths.fault?.("restore:retain-parent-fsync"); }
      return;
    } catch (error) {
      try {
        if (retainedMoved) { paths.fault?.("recovery:retained-to-rollback"); renameSync(retained, rollback); retainedMoved = false; paths.fault?.("recovery:meta-remove"); rmSync(metaPath(retained), { force: true }); paths.fault?.("recovery:pin-remove"); rmSync(pinPath(retained), { force: true }); fsyncDirectory(backupDir); paths.fault?.("recovery:backup-parent-fsync"); }
        if (moved && existsSync(rollback)) { paths.fault?.("recovery:live-remove"); unsealAgentBackups(agentDir); rmSync(agentDir, { recursive: true, force: true }); paths.fault?.("recovery:rollback-to-live"); renameSync(rollback, agentDir); moved = false; paths.fault?.("recovery:live-fsync"); fsyncTree(agentDir, paths.fault, "recovery:live-fsync"); fsyncDirectory(dirname(agentDir)); paths.fault?.("recovery:parent-fsync"); }
        else if (!hadLive && existsSync(agentDir)) { paths.fault?.("recovery:new-live-remove"); rmSync(agentDir, { recursive: true, force: true }); }
        if (existsSync(stage)) { paths.fault?.("recovery:stage-remove"); rmSync(stage, { recursive: true, force: true }); }
      } catch { throw new Error("Restore requiere recuperacion; artefactos retenidos"); }
      throw error;
    }
  }
  if (statSync(backupPath).isDirectory()) {
    const legacy = collectTree(backupPath);
    for (const entry of legacy.entries) {
      const source = join(backupPath, ...entry.path.split("/"));
      const target = join(agentDir, ...entry.path.split("/"));
      replaceNodeNoFollow(source, target, agentDir);
      paths.fault?.(`legacy:copy:${entry.path}`);
      // Regular files are chmodded by descriptor in copyNodeNoFollow. Symlink
      // entries intentionally have no chmod fault point: chmodSync would follow.
      if (entry.type === "file") paths.fault?.(`legacy:chmod:${entry.path}`);
    }
    return;
  }
  throw new Error("Restore legacy rechazado: archives no soportados de forma segura");
}

function safeMarker(path: string): boolean | undefined { try { const stat = lstatSync(path); return !stat.isSymbolicLink() && stat.isFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; return false; } }

function unsealAgentBackups(agentDir: string): void {
  for (const entry of listBackups({ backupDir: join(agentDir, "backups", "installer") })) if (entry.kind === "manifest-dir") unsealTree(entry.path);
}
