import { INSTALL_MARKER } from "./paths.ts";
import { classifyOwnership, readMarkerV2 } from "./marker-v2.ts";
import type { MarkerV1, MarkerV2, OwnershipMarker, Result, ReleaseRecord } from "./release-types.ts";
import { fetchLatestRelease } from "./release-record.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type InstallerReadFreshness = "current" | "stale" | "unknown";
export type InstallerReadStatus = "valid" | "missing" | "invalid" | "unavailable" | "unsupported" | "ambiguous" | "error";
export type InstallerMarkerEvidence = Readonly<{
  status: InstallerReadStatus;
  source: "installer-marker";
  freshness: InstallerReadFreshness;
  reason: string;
  version?: string;
  owner?: "installer" | "external" | "ambiguous" | "unknown";
}>;
export type InstallerReleaseEvidence = Readonly<{
  status: InstallerReadStatus;
  source: "release-provider";
  freshness: InstallerReadFreshness;
  reason: string;
  version?: string;
}>;
export type InstallerCapabilityEvidence = Readonly<{
  status: InstallerReadStatus;
  source: "installer-capability";
  freshness: InstallerReadFreshness;
  reason: string;
  supported?: boolean;
}>;
export type InstallerUpdateReadEvidence = Readonly<{
  installed: InstallerMarkerEvidence;
  release: InstallerReleaseEvidence;
  owner: Readonly<InstallerMarkerEvidence & { action?: "update"; actionId?: "installer.update" }>;
  capability: InstallerCapabilityEvidence;
}>;

function markerOwner(owner: OwnershipMarker): InstallerMarkerEvidence["owner"] {
  if (owner.type === "standalone") return "installer";
  if (owner.type === "package-manager") return "external";
  return "ambiguous";
}

function versionFromMarker(marker: MarkerV1 | MarkerV2): string {
  return marker.version;
}

/** Read the marker only; malformed, missing, and ambiguous identity stay visible. */
export function readInstallerMarkerEvidence(
  caps: Pick<UpdateCaps, "fs">,
  markerPath = INSTALL_MARKER,
): InstallerMarkerEvidence {
  try {
    if (!caps.fs.exists(markerPath)) {
      return { status: "missing", source: "installer-marker", freshness: "current", reason: "missing" };
    }
    const marker = readMarkerV2(caps, markerPath);
    if (!marker) {
      return { status: "invalid", source: "installer-marker", freshness: "current", reason: "invalid-marker" };
    }
    const ownership = classifyOwnership(marker);
    const owner = markerOwner(ownership);
    return {
      status: owner === "ambiguous" ? "ambiguous" : "valid",
      source: "installer-marker",
      freshness: "current",
      reason: owner === "ambiguous" ? "ambiguous-owner" : "read-success",
      version: versionFromMarker(marker),
      owner,
    };
  } catch {
    return { status: "error", source: "installer-marker", freshness: "unknown", reason: "marker-read-failed" };
  }
}

export async function readInstallerReleaseEvidence(
  caps: Pick<UpdateCaps, "http">,
  readRelease: () => Promise<Result<ReleaseRecord, unknown>> = () => fetchLatestRelease(caps),
): Promise<InstallerReleaseEvidence> {
  try {
    const result = await readRelease();
    if (!result.ok) return { status: "unavailable", source: "release-provider", freshness: "unknown", reason: "release-read-failed" };
    return { status: "valid", source: "release-provider", freshness: "current", reason: "read-success", version: result.value.tag.slice("installer-v".length) };
  } catch {
    return { status: "error", source: "release-provider", freshness: "unknown", reason: "release-read-failed" };
  }
}

export function readInstallerCapabilityEvidence(
  supported = true,
): InstallerCapabilityEvidence {
  return supported
    ? { status: "valid", source: "installer-capability", freshness: "current", reason: "read-success", supported: true }
    : { status: "unsupported", source: "installer-capability", freshness: "current", reason: "unsupported", supported: false };
}

/** Composes read evidence; no action owner, transaction, writer, or child process is called. */
export async function readInstallerUpdateEvidence(options: {
  caps: Pick<UpdateCaps, "fs" | "http">;
  markerPath?: string;
  readRelease?: () => Promise<Result<ReleaseRecord, unknown>>;
  updateSupported?: boolean;
}): Promise<InstallerUpdateReadEvidence> {
  const marker = readInstallerMarkerEvidence(options.caps, options.markerPath);
  const release = await readInstallerReleaseEvidence(options.caps, options.readRelease);
  const capability = readInstallerCapabilityEvidence(options.updateSupported ?? true);
  const owner = marker.owner === "installer"
    ? { ...marker, action: "update" as const, actionId: "installer.update" as const }
    : marker;
  return Object.freeze({ installed: marker, release, owner, capability });
}

export const readUpdateAdvisorEvidence = readInstallerUpdateEvidence;
