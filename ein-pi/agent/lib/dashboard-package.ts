import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

export const DASHBOARD_TARGETS = ["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"] as const;
export type DashboardTarget = typeof DASHBOARD_TARGETS[number];
type Artifact = Readonly<{ filename: string; sha256: string; bytes: number; mode: "0755" }>;
type Manifest = Readonly<{
  format: "ein-dashboard-release/v1";
  release: string;
  target: DashboardTarget;
  legacy: Artifact;
  candidate: Artifact;
}>;
export type DashboardRelease = Readonly<{ legacy: string; candidate: string }>;

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && keys.toSorted().every((key, index) => actual[index] === key);
};
const safeName = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value !== "." && value !== "..";
const artifact = (value: unknown): value is Artifact => exact(value, ["bytes", "filename", "mode", "sha256"])
  && safeName(value.filename) && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256)
  && Number.isSafeInteger(value.bytes) && (value.bytes as number) > 0 && value.mode === "0755";

export function dashboardTarget(platform: string, arch: string): DashboardTarget | undefined {
  const value = `${platform}-${arch}`;
  return (DASHBOARD_TARGETS as readonly string[]).includes(value) ? value as DashboardTarget : undefined;
}

async function jsonFile(path: string): Promise<unknown> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("unsafe metadata file");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function verifyArtifact(path: string, expected: Artifact): Promise<void> {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o755
    || (metadata.mode & 0o111) === 0 || metadata.size !== expected.bytes) throw new Error("unsafe artifact");
  const digest = createHash("sha256").update(await readFile(path)).digest("hex");
  if (digest !== expected.sha256) throw new Error("artifact checksum mismatch");
}

/** Returns both bound artifacts, or undefined for every untrusted package state. */
export async function validateDashboardRelease(root: string, target: DashboardTarget): Promise<DashboardRelease | undefined> {
  try {
    const current = await jsonFile(join(root, "current.json"));
    if (!exact(current, ["format", "release"]) || current.format !== "ein-dashboard-current/v1" || !safeName(current.release)) return undefined;
    const releaseRoot = join(root, "releases", current.release);
    const releaseMetadata = await lstat(releaseRoot);
    if (!releaseMetadata.isDirectory() || releaseMetadata.isSymbolicLink()) return undefined;
    const value = await jsonFile(join(releaseRoot, "manifest.json"));
    if (!exact(value, ["candidate", "format", "legacy", "release", "target"])) return undefined;
    if (value.format !== "ein-dashboard-release/v1" || value.release !== current.release || value.target !== target
      || !artifact(value.legacy) || !artifact(value.candidate) || value.legacy.filename === value.candidate.filename) return undefined;
    const manifest = value as Manifest;
    const legacyPath = join(releaseRoot, manifest.legacy.filename);
    await verifyArtifact(legacyPath, manifest.legacy);
    const candidatePath = join(releaseRoot, manifest.candidate.filename);
    await verifyArtifact(candidatePath, manifest.candidate);
    return { legacy: legacyPath, candidate: candidatePath };
  } catch {
    return undefined;
  }
}

export async function validateDashboardPackage(root: string, target: DashboardTarget): Promise<string | undefined> {
  return (await validateDashboardRelease(root, target))?.candidate;
}
