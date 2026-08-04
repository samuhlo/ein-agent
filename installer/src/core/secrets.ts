// =============================================================================
// SECRETS
// Manages ~/.config/opencode-secrets/* plaintext keys + CONTEXT7_API_KEY shell
// export. Idempotent and sentinel-guarded; never touches auth.json.
// =============================================================================

import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import {
  lstat,
  mkdir,
  open as openFile,
  rename as renameFile,
  unlink as unlinkFile,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
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

/**
 * Narrow filesystem operations used by the atomic writer and its deterministic
 * test seam. This is intentionally local to the secrets boundary rather than
 * a reusable repository filesystem abstraction.
 */
export type AtomicFsHandle = unknown;

export type AtomicFsOps = {
  open: (path: string, flags: number, mode: number) => Promise<AtomicFsHandle>;
  write: (handle: AtomicFsHandle, data: Uint8Array, offset: number) => Promise<number>;
  fsync: (handle: AtomicFsHandle) => Promise<void>;
  close: (handle: AtomicFsHandle) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  revalidate: (destination: string, temporary: string) => Promise<void>;
};

export type AtomicWriteRequest = {
  destination: string;
  content: Uint8Array;
  mode?: number;
  ops?: AtomicFsOps;
  tempName?: (destination: string, attempt: number) => string;
};

/** Synchronous counterpart kept for the legacy synchronous RC API. */
export type SyncAtomicFsHandle = unknown;

export type SyncAtomicFsOps = {
  open: (path: string, flags: number, mode: number) => SyncAtomicFsHandle;
  write: (handle: SyncAtomicFsHandle, data: Uint8Array, offset: number) => number;
  fsync: (handle: SyncAtomicFsHandle) => void;
  close: (handle: SyncAtomicFsHandle) => void;
  chmod: (path: string, mode: number) => void;
  rename: (from: string, to: string) => void;
  unlink: (path: string) => void;
  revalidate: (destination: string, temporary: string) => void;
};

export type SyncAtomicWriteRequest = {
  destination: string;
  content: Uint8Array;
  mode?: number;
  ops?: SyncAtomicFsOps;
  tempName?: (destination: string, attempt: number) => string;
};

const O_NOFOLLOW = (constants as unknown as Record<string, number | undefined>).O_NOFOLLOW ?? 0;
const ATOMIC_TEMP_FLAGS = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | O_NOFOLLOW;
const MAX_TEMP_NAME_ATTEMPTS = 100;

type PathIdentity = {
  dev: number;
  ino: number;
};

type SafeTargetSnapshot = {
  parent: PathIdentity;
  target: PathIdentity | null;
  targetMode: number | null;
};

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function identityOf(metadata: { dev: number; ino: number }): PathIdentity {
  return { dev: metadata.dev, ino: metadata.ino };
}

function sameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function classifySafeTarget(destination: string): Promise<SafeTargetSnapshot> {
  const parentPath = dirname(destination);
  let parent;
  try {
    parent = await lstat(parentPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Atomic target parent does not exist: ${parentPath}`, { cause: error });
    }
    throw error;
  }

  if (!parent.isDirectory()) {
    throw new Error(`Atomic target parent is not a real directory: ${parentPath}`);
  }

  let target;
  try {
    target = await lstat(destination);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { parent: identityOf(parent), target: null, targetMode: null };
    }
    throw error;
  }

  if (target.isSymbolicLink()) {
    throw new Error(`Atomic target must not be a symbolic link: ${destination}`);
  }
  if (!target.isFile()) {
    throw new Error(`Atomic target must be a regular file or missing: ${destination}`);
  }

  return {
    parent: identityOf(parent),
    target: identityOf(target),
    targetMode: target.mode & 0o7777,
  };
}

async function revalidateSafeTarget(
  destination: string,
  expected: SafeTargetSnapshot,
): Promise<void> {
  const actual = await classifySafeTarget(destination);
  if (!sameIdentity(actual.parent, expected.parent)) {
    throw new Error(`Atomic target parent changed before commit: ${dirname(destination)}`);
  }
  if (actual.target === null || expected.target === null) {
    if (actual.target !== expected.target) {
      throw new Error(`Atomic target state changed before commit: ${destination}`);
    }
    return;
  }
  if (!sameIdentity(actual.target, expected.target)) {
    throw new Error(`Atomic target identity changed before commit: ${destination}`);
  }
}

function classifySafeTargetSync(destination: string): SafeTargetSnapshot {
  const parentPath = dirname(destination);
  let parent;
  try {
    parent = lstatSync(parentPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      throw new Error(`Atomic target parent does not exist: ${parentPath}`, { cause: error });
    }
    throw error;
  }

  if (!parent.isDirectory()) {
    throw new Error(`Atomic target parent is not a real directory: ${parentPath}`);
  }

  let target;
  try {
    target = lstatSync(destination);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { parent: identityOf(parent), target: null, targetMode: null };
    }
    throw error;
  }

  if (target.isSymbolicLink()) {
    throw new Error(`Atomic target must not be a symbolic link: ${destination}`);
  }
  if (!target.isFile()) {
    throw new Error(`Atomic target must be a regular file or missing: ${destination}`);
  }

  return {
    parent: identityOf(parent),
    target: identityOf(target),
    targetMode: target.mode & 0o7777,
  };
}

function revalidateSafeTargetSync(
  destination: string,
  expected: SafeTargetSnapshot,
): void {
  const actual = classifySafeTargetSync(destination);
  if (!sameIdentity(actual.parent, expected.parent)) {
    throw new Error(`Atomic target parent changed before commit: ${dirname(destination)}`);
  }
  if (actual.target === null || expected.target === null) {
    if (actual.target !== expected.target) {
      throw new Error(`Atomic target state changed before commit: ${destination}`);
    }
    return;
  }
  if (!sameIdentity(actual.target, expected.target)) {
    throw new Error(`Atomic target identity changed before commit: ${destination}`);
  }
}

const productionAtomicFsOps: AtomicFsOps = {
  open: (path, flags, mode) => openFile(path, flags, mode),
  write: async (handle, data, offset) =>
    (await (handle as FileHandle).write(data, 0, data.byteLength, offset)).bytesWritten,
  fsync: (handle) => (handle as FileHandle).sync(),
  close: (handle) => (handle as FileHandle).close(),
  rename: renameFile,
  unlink: unlinkFile,
  revalidate: async () => {},
};

const productionSyncAtomicFsOps: SyncAtomicFsOps = {
  open: (path, flags, mode) => openSync(path, flags, mode),
  write: (handle, data, offset) => writeSync(handle as number, data, 0, data.byteLength, offset),
  fsync: (handle) => fsyncSync(handle as number),
  close: (handle) => closeSync(handle as number),
  chmod: chmodSync,
  rename: renameSync,
  unlink: unlinkSync,
  revalidate: () => {},
};

function defaultTempName(destination: string, attempt: number): string {
  const directory = dirname(destination);
  const name = basename(destination);
  return join(directory, `.${name}.${process.pid}.${randomUUID()}.${attempt}.tmp`);
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function attachCleanupError(primary: unknown, cleanupErrors: readonly unknown[]): unknown {
  if (cleanupErrors.length === 0) return primary;
  const secondary = cleanupErrors.length === 1
    ? cleanupErrors[0]
    : new AggregateError(cleanupErrors, "Atomic temporary-file cleanup failed");

  if (typeof primary === "object" && primary !== null) {
    Object.defineProperty(primary, "cleanupError", {
      configurable: true,
      enumerable: false,
      value: secondary,
      writable: false,
    });
    return primary;
  }

  return new AggregateError([primary, secondary], "Atomic write failed during cleanup", { cause: primary });
}

async function writeFully(ops: AtomicFsOps, handle: AtomicFsHandle, content: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < content.byteLength) {
    const written = await ops.write(handle, content, offset);
    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("Atomic write made no progress");
    }
    offset += written;
  }
}

async function atomicWrite(request: AtomicWriteRequest): Promise<void> {
  const safeTarget = await classifySafeTarget(request.destination);
  const ops = request.ops ?? productionAtomicFsOps;
  const mode = request.mode ?? 0o600;
  const tempName = request.tempName ?? defaultTempName;
  let handle: AtomicFsHandle | undefined;
  let temporary: string | undefined;
  let ownsTemporary = false;
  let lastCollision: unknown;

  for (let attempt = 0; attempt < MAX_TEMP_NAME_ATTEMPTS; attempt += 1) {
    const candidate = tempName(request.destination, attempt);
    try {
      handle = await ops.open(candidate, ATOMIC_TEMP_FLAGS, mode);
      temporary = candidate;
      ownsTemporary = true;
      break;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      lastCollision = error;
    }
  }

  if (handle === undefined || temporary === undefined) {
    throw lastCollision ?? new Error("Unable to allocate an atomic temporary file");
  }

  try {
    await writeFully(ops, handle, request.content);
    await ops.fsync(handle);
    await ops.close(handle);
    handle = undefined;
    await ops.revalidate(request.destination, temporary);
    await revalidateSafeTarget(request.destination, safeTarget);
    await ops.rename(temporary, request.destination);
  } catch (primary) {
    const cleanupErrors: unknown[] = [];
    if (handle !== undefined) {
      try {
        await ops.close(handle);
        handle = undefined;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (ownsTemporary) {
      try {
        await ops.unlink(temporary);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    throw attachCleanupError(primary, cleanupErrors);
  }
}

function writeFullySync(ops: SyncAtomicFsOps, handle: SyncAtomicFsHandle, content: Uint8Array): void {
  let offset = 0;
  while (offset < content.byteLength) {
    const written = ops.write(handle, content, offset);
    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("Atomic write made no progress");
    }
    offset += written;
  }
}

function atomicWriteSync(request: SyncAtomicWriteRequest): void {
  const safeTarget = classifySafeTargetSync(request.destination);
  const ops = request.ops ?? productionSyncAtomicFsOps;
  const mode = request.mode ?? 0o600;
  const tempName = request.tempName ?? defaultTempName;
  let handle: SyncAtomicFsHandle | undefined;
  let temporary: string | undefined;
  let ownsTemporary = false;
  let lastCollision: unknown;

  for (let attempt = 0; attempt < MAX_TEMP_NAME_ATTEMPTS; attempt += 1) {
    const candidate = tempName(request.destination, attempt);
    try {
      handle = ops.open(candidate, ATOMIC_TEMP_FLAGS, 0o600);
      temporary = candidate;
      ownsTemporary = true;
      break;
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      lastCollision = error;
    }
  }

  if (handle === undefined || temporary === undefined) {
    throw lastCollision ?? new Error("Unable to allocate an atomic temporary file");
  }

  try {
    writeFullySync(ops, handle, request.content);
    ops.chmod(temporary, mode);
    ops.fsync(handle);
    ops.close(handle);
    handle = undefined;
    ops.revalidate(request.destination, temporary);
    revalidateSafeTargetSync(request.destination, safeTarget);
    ops.rename(temporary, request.destination);
  } catch (primary) {
    const cleanupErrors: unknown[] = [];
    if (handle !== undefined) {
      try {
        ops.close(handle);
        handle = undefined;
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (ownsTemporary) {
      try {
        ops.unlink(temporary);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    throw attachCleanupError(primary, cleanupErrors);
  }
}

/** @internal Deterministic adapter for the focused atomic-write tests only. */
export function atomicWriteForTesting(request: AtomicWriteRequest): Promise<void> {
  return atomicWrite(request);
}

export async function ensureSecretsDir(): Promise<void> {
  await mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 });
  const metadata = await lstat(SECRETS_DIR);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Secrets directory must be a real directory: ${SECRETS_DIR}`);
  }
  chmodSync(SECRETS_DIR, 0o700);
}

export function hasSecret(name: SecretName): boolean {
  const path = SECRET_PATHS[name];
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
    return readFileSync(path, "utf8").trim().length > 0;
  } catch {
    return false;
  }
}

// Write a plaintext secret file with 0600 perms. Empty value is a no-op.
export async function writeSecret(name: SecretName, value: string): Promise<boolean> {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  await ensureSecretsDir();
  const path = SECRET_PATHS[name];
  await atomicWrite({
    destination: path,
    content: new TextEncoder().encode(`${trimmed}\n`),
    mode: 0o600,
  });
  return true;
}

const SENTINEL_START = "# >>> ein context7 export >>>";
const SENTINEL_END = "# <<< ein context7 export <<<";

function readRegularFileSync(destination: string, expected: SafeTargetSnapshot): Uint8Array {
  if (expected.target === null) return new Uint8Array();

  const flags = constants.O_RDONLY | O_NOFOLLOW;
  const handle = openSync(destination, flags);
  try {
    const opened = fstatSync(handle);
    if (!opened.isFile() || !sameIdentity(identityOf(opened), expected.target)) {
      throw new Error(`Atomic target changed while reading: ${destination}`);
    }

    const content = new Uint8Array(opened.size);
    let offset = 0;
    while (offset < content.byteLength) {
      const bytesRead = readSync(handle, content, offset, content.byteLength - offset, null);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }

    const after = fstatSync(handle);
    if (
      !after.isFile() ||
      !sameIdentity(identityOf(after), expected.target) ||
      after.size !== opened.size ||
      offset !== content.byteLength
    ) {
      throw new Error(`Atomic target changed while reading: ${destination}`);
    }
    return content;
  } finally {
    closeSync(handle);
  }
}

function assertSafeTargetUnchanged(destination: string, expected: SafeTargetSnapshot): void {
  const actual = classifySafeTargetSync(destination);
  if (!sameIdentity(actual.parent, expected.parent)) {
    throw new Error(`Atomic target parent changed before publication: ${dirname(destination)}`);
  }
  if (actual.target === null || expected.target === null) {
    if (actual.target !== expected.target) {
      throw new Error(`Atomic target state changed before publication: ${destination}`);
    }
    return;
  }
  if (!sameIdentity(actual.target, expected.target)) {
    throw new Error(`Atomic target identity changed before publication: ${destination}`);
  }
}

function context7Block(shell: Platform["shell"]): string {
  return shell === "fish"
    ? [
        SENTINEL_START,
        `test -f "${CONTEXT7_KEY_PATH}"; and set -gx CONTEXT7_API_KEY (cat "${CONTEXT7_KEY_PATH}")`,
        SENTINEL_END,
        "",
      ].join("\n")
    : [
        SENTINEL_START,
        `export CONTEXT7_API_KEY=\"$(cat \"${CONTEXT7_KEY_PATH}\" 2>/dev/null)\"`,
        SENTINEL_END,
        "",
      ].join("\n");
}

function ensureContext7ExportInternal(
  platform: Platform,
  ops?: SyncAtomicFsOps,
  tempName?: (destination: string, attempt: number) => string,
): { changed: boolean; rc: string } {
  const rc = platform.shellRc;
  const safeTarget = classifySafeTargetSync(rc);
  const existing = readRegularFileSync(rc, safeTarget);
  const existingText = new TextDecoder().decode(existing);
  if (existingText.includes(SENTINEL_START)) {
    return { changed: false, rc };
  }

  const block = context7Block(platform.shell);
  const separator = existing.byteLength === 0
    ? ""
    : existing[existing.byteLength - 1] === 0x0a
      ? ""
      : "\n";
  const appended = new TextEncoder().encode(`${separator}${block}`);
  const content = new Uint8Array(existing.byteLength + appended.byteLength);
  content.set(existing);
  content.set(appended, existing.byteLength);

  assertSafeTargetUnchanged(rc, safeTarget);
  atomicWriteSync({
    destination: rc,
    content,
    mode: safeTarget.targetMode ?? 0o600,
    ops,
    tempName,
  });
  return { changed: true, rc };
}

// Idempotent: append a CONTEXT7_API_KEY export to the shell rc. The value is
// read from the secrets file at shell startup so the key is never inlined.
export function ensureContext7Export(platform: Platform): { changed: boolean; rc: string } {
  return ensureContext7ExportInternal(platform);
}

/** @internal Deterministic adapter for focused RC publication tests only. */
export function ensureContext7ExportForTesting(
  platform: Platform,
  ops: SyncAtomicFsOps,
  tempName?: (destination: string, attempt: number) => string,
): { changed: boolean; rc: string } {
  return ensureContext7ExportInternal(platform, ops, tempName);
}
