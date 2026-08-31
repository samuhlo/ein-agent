import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, parse, resolve, sep } from "node:path";

export type InstallJournalFs = {
  read(path: string): Uint8Array;
  mkdir(path: string, mode: number): void;
  open(path: string, flags: number, mode?: number): number;
  write(fd: number, data: Uint8Array, offset: number): number;
  fsync(fd: number): void;
  close(fd: number): void;
  rename(from: string, to: string): void;
  unlink(path: string): void;
  inspect(path: string): {
    kind: "missing" | "file" | "directory" | "symlink" | "other";
    mode: number;
    size: number;
  };
};

export type StoredInstallJournalInspection =
  | { status: "missing" }
  | { status: "available"; bytes: Uint8Array }
  | { status: "invalid" };

const NO_FOLLOW = (constants as unknown as Record<string, number | undefined>).O_NOFOLLOW ?? 0;
const MAX_JOURNAL_BYTES = 64 * 1024;

export const productionInstallJournalFs: InstallJournalFs = {
  read: (path) => readFileSync(path),
  mkdir: (path, mode) => mkdirSync(path, { mode }),
  open: (path, flags, mode) => openSync(path, flags, mode),
  write: (fd, data, offset) => writeSync(fd, data, offset, data.length - offset),
  fsync: fsyncSync,
  close: closeSync,
  rename: renameSync,
  unlink: unlinkSync,
  inspect: (path) => {
    try {
      const value = lstatSync(path);
      return {
        kind: value.isSymbolicLink()
          ? "symlink"
          : value.isFile()
            ? "file"
            : value.isDirectory()
              ? "directory"
              : "other",
        mode: value.mode & 0o777,
        size: value.size,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { kind: "missing", mode: 0, size: 0 };
      }
      throw error;
    }
  },
};

export const installJournalPath = (home: string): string =>
  join(home, ".ein-installer", "install-execution-v1.json");

function homeUsesRealDirectories(home: string, fs: InstallJournalFs): boolean {
  if (resolve(home) !== home) return false;
  let cursor = parse(home).root;
  for (const part of home.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (fs.inspect(cursor).kind !== "directory") return false;
  }
  return true;
}

function requirePrivateParent(home: string, fs: InstallJournalFs): string {
  if (!homeUsesRealDirectories(home, fs)) throw new Error("unsafe journal home");
  const parent = dirname(installJournalPath(home));
  const info = fs.inspect(parent);
  if (info.kind === "missing") fs.mkdir(parent, 0o700);
  else if (info.kind !== "directory" || (info.mode & 0o077) !== 0) {
    throw new Error("unsafe journal parent");
  }
  return parent;
}

export function inspectStoredInstallJournal(
  home: string,
  fs: InstallJournalFs,
): StoredInstallJournalInspection {
  try {
    if (!homeUsesRealDirectories(home, fs)) return { status: "invalid" };
    const path = installJournalPath(home);
    const parentInfo = fs.inspect(dirname(path));
    if (parentInfo.kind === "missing") return { status: "missing" };
    if (parentInfo.kind !== "directory" || (parentInfo.mode & 0o077) !== 0) {
      return { status: "invalid" };
    }
    const info = fs.inspect(path);
    if (info.kind === "missing") return { status: "missing" };
    if (info.kind !== "file" || (info.mode & 0o077) !== 0 || info.size > MAX_JOURNAL_BYTES) {
      return { status: "invalid" };
    }
    const bytes = fs.read(path);
    return bytes.length > MAX_JOURNAL_BYTES
      ? { status: "invalid" }
      : { status: "available", bytes };
  } catch {
    return { status: "invalid" };
  }
}

// BLINDAJE -> El temporal exclusivo y el fsync del directorio convierten cada
// checkpoint en un estado completo o en un fallo visible, nunca en medio JSON.
export function publishStoredInstallJournal(
  home: string,
  transactionId: string,
  bytes: Uint8Array,
  fs: InstallJournalFs,
): void {
  const path = installJournalPath(home);
  const temp = `${path}.${transactionId}.tmp`;
  let fd: number | undefined;

  try {
    const parent = requirePrivateParent(home, fs);
    const target = fs.inspect(path);
    if (
      target.kind !== "missing" && (target.kind !== "file" || (target.mode & 0o077) !== 0)
      || fs.inspect(temp).kind !== "missing"
    ) {
      throw new Error("unsafe journal target");
    }

    fd = fs.open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.write(fd, bytes, offset);
      if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
        throw new Error("invalid journal write");
      }
      offset += written;
    }
    fs.fsync(fd);
    fs.close(fd);
    fd = undefined;
    fs.rename(temp, path);

    const directory = fs.open(parent, constants.O_RDONLY);
    try {
      fs.fsync(directory);
    } finally {
      fs.close(directory);
    }
    if (new TextDecoder().decode(fs.read(path)) !== new TextDecoder().decode(bytes)) {
      throw new Error("journal read-back mismatch");
    }
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.close(fd);
      } catch {}
    }
    try {
      fs.unlink(temp);
    } catch {}
    throw error;
  }
}
