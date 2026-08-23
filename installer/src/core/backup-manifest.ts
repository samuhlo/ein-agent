import { createHash } from "node:crypto";
import { constants, chmodSync, closeSync, existsSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readlinkSync, readSync, realpathSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { types } from "node:util";

export const MANIFEST_FILE = "manifest.json";
export const METADATA_FILE = "metadata.json";
export const CONTENT_DIR = "content";
export const EXCLUDED_STATE_VERSION = 1;
export const BACKUP_LIMITS = { files: 10_000, bytes: 128 * 1024 * 1024, path: 512, target: 4096, manifest: 2 * 1024 * 1024 } as const;

export type BackupManifestEntryV1 = Readonly<{ path: string; type: "file"; size: number; sha256: string; mode: number }>;
export type BackupManifestEntryV2 =
  | BackupManifestEntryV1
  | Readonly<{ path: string; type: "symlink"; target: string; mode?: never; size?: never; sha256?: never }>;
export type BackupManifestEntry = BackupManifestEntryV1 | Extract<BackupManifestEntryV2, { type: "symlink" }>;
export type BackupManifestV1 = Readonly<{ schemaVersion: 1; excludedStateVersion: 1; entries: readonly BackupManifestEntryV1[] }>;
export type BackupManifestV2 = Readonly<{ schemaVersion: 2; excludedStateVersion: 1; entries: readonly BackupManifestEntryV2[] }>;
export type BackupManifest = BackupManifestV1 | BackupManifestV2;
export type BackupMetadataV1 = Readonly<{ schemaVersion: 1; snapshotId: string; manifestSha256: string; contentDigest: string; reason: string; createdAt: string }>;

function fail(message: string): never { throw new Error(`Backup invalido: ${message.slice(0, 160)}`); }
const EXCLUDED_TOP_LEVEL = new Set(["backups", "npm", "node_modules", "sessions", "auth.json", "bin", "disabled-skill-conflicts", ".atl", ".piagents", ".sdd", "run-history.jsonl", "intercom", "secrets"]);
export function isExcluded(rel: string): boolean {
  const segments = rel.split("/"), [top, second] = segments;
  return EXCLUDED_TOP_LEVEL.has(top!) || segments.includes("node_modules") || (top === "skills" && second === "downloaded");
}
export function assertRelativePath(path: string): void {
  if (!path || path.length > BACKUP_LIMITS.path || path.startsWith("/") || path.includes("\\") || /[\x00-\x1f\x7f]/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) fail("ruta no permitida");
}
function sha256(data: string | Buffer): string { return createHash("sha256").update(data).digest("hex"); }
export function canonicalManifest(manifest: BackupManifest): string { return `${JSON.stringify(manifest)}\n`; }
export function manifestDigest(manifest: BackupManifest): string { return sha256(canonicalManifest(manifest)); }
export function contentDigest(entries: readonly BackupManifestEntry[]): string {
  const typed = entries.some((entry) => entry.type === "symlink");
  return sha256(entries.map((entry) => entry.type === "file"
    ? typed ? `file\0${entry.path}\0${entry.size}\0${entry.sha256}\0${entry.mode}\n` : `${entry.path}\0${entry.size}\0${entry.sha256}\0${entry.mode}\n`
    : `symlink\0${entry.path}\0${entry.target}\n`).join(""));
}
export function snapshotId(manifestRaw: string, reason: string, createdAt: string): string { return sha256(`${manifestRaw}\0${reason}\0${createdAt}`); }
export function canonicalMetadata(metadata: BackupMetadataV1): string { return `${JSON.stringify({ schemaVersion: metadata.schemaVersion, snapshotId: metadata.snapshotId, manifestSha256: metadata.manifestSha256, contentDigest: metadata.contentDigest, reason: metadata.reason, createdAt: metadata.createdAt })}\n`; }
const SAFE_MODES = new Set([0o600, 0o640, 0o644, 0o700, 0o750, 0o755]);
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return false; const own = Object.getOwnPropertyDescriptors(value); return Reflect.ownKeys(own).length === keys.length && keys.every((key) => own[key]?.enumerable && "value" in own[key]!); };
export function assertLinkTarget(target: string): void {
  if (!target || Buffer.byteLength(target, "utf8") > BACKUP_LIMITS.target || /[\x00-\x1f\x7f\u0080-\u009f]/.test(target)) fail("target de enlace no permitido");
}

export function assertSafePath(path: string): void {
  try { const absolute = resolve(path), temp = resolve(tmpdir()), canonicalTemp = realpathSync(temp), expected = absolute === temp || absolute.startsWith(`${temp}${sep}`) ? join(canonicalTemp, relative(temp, absolute)) : absolute; if (realpathSync(path) !== expected) throw 0; let current = parse(expected).root; for (const part of relative(current, expected).split(sep).filter(Boolean)) { current = join(current, part); const stat = lstatSync(current); if (stat.isSymbolicLink() || current !== expected && !stat.isDirectory()) throw 0; } } catch { fail("componente enlazado o invalido"); }
}
export function assertSafeParent(path: string): void { let current = resolve(path); while (!existsSync(current)) current = dirname(current); assertSafePath(current); }

function ensureRealDirectory(path: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") fail("padre de staging no permitido");
    try { mkdirSync(path, { mode: 0o700 }); stat = lstatSync(path); } catch { fail("padre de staging no permitido"); }
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("padre de staging no permitido");
  assertSafePath(path);
}

export function assertSafeEmptyDirectory(path: string): void {
  ensureRealDirectory(path);
  if (readdirSync(path).length !== 0) fail("staging no vacio");
}

export function ensureSafeDestinationParent(root: string, relativePath: string): string {
  assertRelativePath(relativePath);
  ensureRealDirectory(root);
  let current = root;
  const parent = dirname(relativePath).split("/").filter((part) => part && part !== ".");
  for (const part of parent) {
    current = join(current, part);
    ensureRealDirectory(current);
  }
  return current;
}

function assertDestinationAbsent(path: string): void {
  try {
    lstatSync(path);
    fail("colision en staging");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function writeStagedFile(path: string, data: Buffer, mode: number): void {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), mode);
    let offset = 0;
    while (offset < data.byteLength) offset += writeSync(fd, data, offset, data.byteLength - offset, null);
    fchmodSync(fd, mode);
  } catch { fail("staging de fichero no permitido"); }
  finally { if (fd !== undefined) closeBounded(fd, "staging de fichero no permitido"); }
}

export function collectTree(root: string, destination?: string, applyExclusions = true, fault?: (point: string) => void, prefix = "copy"): BackupManifest {
  assertSafePath(root);
  if (destination) assertSafeEmptyDirectory(destination);
  const entries: BackupManifestEntry[] = [];
  let bytes = 0;
  let hasSymlink = false;
  const walk = (dir: string): void => {
    assertSafePath(dir);
    for (const name of readdirSync(dir).sort()) {
      assertSafePath(dir);
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join("/");
      assertRelativePath(rel);
      if (applyExclusions && isExcluded(rel)) continue;
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(full, "utf8");
        assertLinkTarget(target);
        if (entries.length + 1 > BACKUP_LIMITS.files) fail("limite de contenido excedido");
        entries.push({ path: rel, type: "symlink", target });
        hasSymlink = true;
        if (destination) {
          ensureSafeDestinationParent(destination, rel);
          const targetPath = join(destination, ...rel.split("/"));
          assertDestinationAbsent(targetPath);
          try { symlinkSync(target, targetPath); } catch { fail("staging de enlace no permitido"); }
          fault?.(`${prefix}:symlink:${rel}`);
        }
        continue;
      }
      if (!stat.isDirectory() && !stat.isFile()) fail("tipo de entrada no permitido");
      if (stat.isDirectory()) { walk(full); continue; }
      bytes += stat.size;
      if (entries.length + 1 > BACKUP_LIMITS.files || bytes > BACKUP_LIMITS.bytes) fail("limite de contenido excedido");
      const mode = stat.mode & 0o7777;
      if (!SAFE_MODES.has(mode)) fail("modo no permitido");
      const fd = openSync(full, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); let data: Buffer;
      try { const opened = fstatSync(fd); data = readFileSync(fd); const after = fstatSync(fd), pathAfter = lstatSync(full); if ([opened, after, pathAfter].some((item) => item.dev !== stat.dev || item.ino !== stat.ino || item.mode !== stat.mode || item.size !== stat.size)) fail("origen cambio durante lectura"); } finally { closeBounded(fd, "source-read"); }
      const entry: BackupManifestEntryV1 = { path: rel, type: "file", size: data.byteLength, sha256: sha256(data), mode };
      entries.push(entry);
      if (destination) {
        ensureSafeDestinationParent(destination, rel);
        const target = join(destination, ...rel.split("/"));
        assertDestinationAbsent(target);
        writeStagedFile(target, data, entry.mode);
        fault?.(`${prefix}:write:${rel}`); fault?.(`${prefix}:chmod:${rel}`);
      }
    }
  };
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("raiz no permitida");
  walk(root);
  assertSafePath(root);
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return hasSymlink ? { schemaVersion: 2, excludedStateVersion: EXCLUDED_STATE_VERSION, entries } : { schemaVersion: 1, excludedStateVersion: EXCLUDED_STATE_VERSION, entries: entries as BackupManifestEntryV1[] };
}

function hasPathConflict(entries: readonly BackupManifestEntry[]): boolean {
  for (let index = 1; index < entries.length; index++) {
    const previous = entries[index - 1]!, current = entries[index]!;
    if (previous.path >= current.path || current.path.startsWith(`${previous.path}/`)) return true;
  }
  return false;
}

export function parseManifest(raw: string): BackupManifest {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { fail("manifest no es JSON"); }
  if (!exact(value, ["schemaVersion", "excludedStateVersion", "entries"])) fail("manifest no es objeto");
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).sort().join() !== "entries,excludedStateVersion,schemaVersion" || (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) || candidate.excludedStateVersion !== EXCLUDED_STATE_VERSION || !Array.isArray(candidate.entries)) fail("schema de manifest no soportado");
  const schemaVersion = candidate.schemaVersion as 1 | 2;
  const entries: BackupManifestEntry[] = [];
  const seen = new Set<string>();
  let bytes = 0;
  for (const rawEntry of candidate.entries) {
    if (!exact(rawEntry, ["path", "type", "size", "sha256", "mode"]) && !exact(rawEntry, ["path", "type", "target"])) fail("entrada invalida");
    const entry = rawEntry as Record<string, unknown>;
    if (typeof entry.path !== "string") fail("entrada invalida");
    assertRelativePath(entry.path);
    if (isExcluded(entry.path) || seen.has(entry.path)) fail("ruta excluida o duplicada");
    seen.add(entry.path);
    if (entry.type === "file") {
      if (!exact(rawEntry, ["path", "type", "size", "sha256", "mode"]) || !Number.isSafeInteger(entry.size) || (entry.size as number) < 0 || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) || !SAFE_MODES.has(entry.mode as number)) fail("entrada invalida");
      bytes += entry.size as number;
      entries.push({ path: entry.path, type: "file", size: entry.size, sha256: entry.sha256, mode: entry.mode } as BackupManifestEntryV1);
    } else if (schemaVersion === 2 && entry.type === "symlink" && exact(rawEntry, ["path", "type", "target"]) && typeof entry.target === "string") {
      assertLinkTarget(entry.target);
      entries.push({ path: entry.path, type: "symlink", target: entry.target });
    } else {
      fail("entrada invalida");
    }
  }
  if (schemaVersion === 1 && entries.some((entry) => entry.type !== "file")) fail("entrada invalida");
  if (entries.length > BACKUP_LIMITS.files || bytes > BACKUP_LIMITS.bytes || hasPathConflict(entries)) fail("manifest no canonico");
  return schemaVersion === 1
    ? { schemaVersion: 1, excludedStateVersion: EXCLUDED_STATE_VERSION, entries: entries as BackupManifestEntryV1[] }
    : { schemaVersion: 2, excludedStateVersion: EXCLUDED_STATE_VERSION, entries };
}

export function validateSnapshot(snapshot: string): { manifest: BackupManifest; metadata: BackupMetadataV1 } {
  assertSafePath(snapshot);
  if (readdirSync(snapshot).sort().join() !== [CONTENT_DIR, MANIFEST_FILE, METADATA_FILE].sort().join()) fail("estructura de snapshot inesperada");
  const contentStat = lstatSync(join(snapshot, CONTENT_DIR)); if (!contentStat.isDirectory() || contentStat.isSymbolicLink()) fail("estructura de snapshot inesperada");
  const raw = readBoundedFile(join(snapshot, MANIFEST_FILE), BACKUP_LIMITS.manifest, "manifest-read").toString("utf8");
  const manifest = parseManifest(raw);
  if (raw !== canonicalManifest(manifest)) fail("manifest no canonico");
  const metadataRaw = readBoundedFile(join(snapshot, METADATA_FILE), 1024, "metadata-read").toString("utf8");
  let metadata: BackupMetadataV1;
  try { metadata = JSON.parse(metadataRaw) as BackupMetadataV1; } catch { fail("metadata no es JSON"); }
  if (!exact(metadata, ["schemaVersion", "snapshotId", "manifestSha256", "contentDigest", "reason", "createdAt"]) || metadata.schemaVersion !== 1 || metadata.manifestSha256 !== sha256(raw) || metadata.contentDigest !== contentDigest(manifest.entries) || typeof metadata.reason !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(metadata.reason) || typeof metadata.createdAt !== "string" || !Number.isFinite(Date.parse(metadata.createdAt)) || new Date(metadata.createdAt).toISOString() !== metadata.createdAt || metadata.snapshotId !== snapshotId(raw, metadata.reason, metadata.createdAt) || metadataRaw !== canonicalMetadata(metadata)) fail("metadata no vinculada");
  const actual = collectTree(join(snapshot, CONTENT_DIR), undefined, false);
  if (canonicalManifest(actual) !== raw) fail("contenido extra, ausente o alterado");
  return { manifest, metadata };
}

export function readBoundedFile(path: string, limit: number, code: string, afterOpen?: () => void): Buffer {
  let fd: number | undefined;
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); const before = fstatSync(fd); if (!before.isFile() || before.size > limit || (before.mode & 0o7777) !== 0o600) throw 0; afterOpen?.(); const data = Buffer.alloc(before.size + 1); let bytes = 0, read = 0; while (bytes < data.length && (read = readSync(fd, data, bytes, data.length - bytes, null)) > 0) bytes += read; const after = fstatSync(fd), current = lstatSync(path); if (bytes !== before.size || [after, current].some((item) => item.dev !== before.dev || item.ino !== before.ino || item.mode !== before.mode || item.size !== before.size)) throw 0; return data.subarray(0, bytes); } catch { return fail(code); } finally { if (fd !== undefined) closeBounded(fd, code); }
}
function closeBounded(fd: number, code: string): void { try { closeSync(fd); } catch { fail(code); } }
export function fsyncFile(path: string): void { let fd: number | undefined; try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); if (!fstatSync(fd).isFile()) throw 0; fsyncSync(fd); } catch { fail("file-fsync"); } finally { if (fd !== undefined) closeBounded(fd, "file-fsync"); } }
export function fsyncDirectory(path: string): void { let fd: number | undefined; try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_DIRECTORY ?? 0)); if (!fstatSync(fd).isDirectory()) throw 0; fsyncSync(fd); } catch { fail("directory-fsync"); } finally { if (fd !== undefined) closeBounded(fd, "directory-fsync"); } }
export function fsyncTree(root: string, fault?: (point: string) => void, prefix = "fsync", applyExclusions = false): void {
  const walk = (dir: string): void => { for (const name of readdirSync(dir).sort()) { const path = join(dir, name), rel = relative(root, path).split(sep).join("/"); if (applyExclusions && isExcluded(rel)) continue; const stat = lstatSync(path); if (stat.isSymbolicLink()) { fault?.(`${prefix}:symlink:${rel}`); continue; } if (stat.isDirectory()) walk(path); else { fsyncFile(path); fault?.(`${prefix}:file:${rel}`); } } fsyncDirectory(dir); fault?.(`${prefix}:dir:${relative(root, dir).split(sep).join("/") || "."}`); };
  try { const rootStat = lstatSync(root); if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw 0; assertSafePath(root); walk(root); } catch { fail("tree-fsync"); }
}

function assertTreeRoot(root: string): void {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("raiz de arbol no permitida");
  assertSafePath(root);
}

export function sealTree(root: string): void {
  assertTreeRoot(root);
  const walk = (dir: string): void => { chmodSync(dir, 0o700); for (const name of readdirSync(dir)) { const path = join(dir, name); const stat = lstatSync(path); if (stat.isSymbolicLink()) continue; if (stat.isDirectory()) walk(path); else chmodSync(path, stat.mode & 0o111 ? 0o500 : 0o400); } };
  walk(root);
}
export function unsealTree(root: string): void {
  assertTreeRoot(root);
  const walk = (dir: string): void => { chmodSync(dir, 0o700); for (const name of readdirSync(dir)) { const path = join(dir, name); if (lstatSync(path).isDirectory()) walk(path); } };
  walk(root);
}
