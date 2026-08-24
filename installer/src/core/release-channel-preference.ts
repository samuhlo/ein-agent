import { closeSync, constants, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { isReleaseChannel, type ReleaseChannel, type ReleaseChannelResolution } from "./release-types.ts";

const PREFERENCE_FILE_NAME = "release-channel-preference.json";
const MAX_PREFERENCE_BYTES = 1024;

export type ReleaseChannelPreferenceFs = {
  makeDir(path: string): void;
  createTempPath(destinationPath: string): string;
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
  rename(sourcePath: string, destinationPath: string): void;
  removeFile(path: string): void;
  syncFile(path: string): void;
  syncDirectory(path: string): void;
};

export type ReleaseChannelPreferenceOptions = {
  fs?: ReleaseChannelPreferenceFs;
};

const productionFs: ReleaseChannelPreferenceFs = {
  makeDir: path => mkdirSync(path, { recursive: true, mode: 0o700 }),
  createTempPath: destinationPath => join(dirname(destinationPath), `.${basename(destinationPath)}.${randomUUID()}.tmp`),
  writeFile: (path, data) => writeFileSync(path, data, { flag: "wx", mode: 0o600 }),
  readFile: path => new Uint8Array(readFileSync(path)),
  rename: renameSync,
  removeFile: path => unlinkSync(path),
  syncFile: path => {
    const fd = openSync(path, constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  },
  syncDirectory: path => {
    const fd = openSync(path, constants.O_RDONLY);
    try { fsyncSync(fd); } finally { closeSync(fd); }
  },
};

export function preferenceFilePath(installationPath: string): string {
  return join(installationPath, PREFERENCE_FILE_NAME);
}

function unavailable(reason: string): ReleaseChannelResolution {
  return { status: "unavailable", reason };
}

function encodePreference(channel: ReleaseChannel): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ channel })}\n`);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function decodePreference(bytes: Uint8Array): ReleaseChannelResolution {
  if (bytes.length > MAX_PREFERENCE_BYTES) return unavailable("malformed-preference");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return unavailable("malformed-preference");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return unavailable("malformed-preference");
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !("channel" in record)) return unavailable("malformed-preference");
  if (!isReleaseChannel(record.channel)) return unavailable("unsupported-channel");
  return { status: "explicit", channel: record.channel };
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}

export function readReleaseChannelPreference(
  installationPath: string,
  options: ReleaseChannelPreferenceOptions = {},
): ReleaseChannelResolution {
  const fs = options.fs ?? productionFs;
  try {
    const bytes = fs.readFile(preferenceFilePath(installationPath));
    return decodePreference(bytes);
  } catch (error) {
    return isMissingFile(error) ? { status: "defaulted", channel: "stable" } : unavailable("preference-unreadable");
  }
}

export function writeReleaseChannelPreference(
  installationPath: string,
  channel: ReleaseChannel,
  options: ReleaseChannelPreferenceOptions = {},
): ReleaseChannelResolution {
  if (!isReleaseChannel(channel)) return unavailable("unsupported-channel");
  const fs = options.fs ?? productionFs;
  const destinationPath = preferenceFilePath(installationPath);
  let temporaryPath: string | undefined;
  const bytes = encodePreference(channel);
  try {
    const directoryPath = dirname(destinationPath);
    fs.makeDir(directoryPath);
    temporaryPath = fs.createTempPath(destinationPath);
    fs.writeFile(temporaryPath, bytes);
    fs.syncFile(temporaryPath);
    fs.rename(temporaryPath, destinationPath);
    temporaryPath = undefined;
    fs.syncDirectory(directoryPath);
    const readBack = fs.readFile(destinationPath);
    if (!sameBytes(readBack, bytes)) return unavailable("atomic-read-back-mismatch");
    return decodePreference(readBack);
  } catch {
    return unavailable("preference-write-failed");
  } finally {
    if (temporaryPath) {
      try { fs.removeFile(temporaryPath); } catch {}
    }
  }
}
