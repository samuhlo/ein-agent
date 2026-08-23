import { dirname } from "node:path";
import { INSTALL_MARKER } from "./paths.ts";
import { readReleaseChannelPreference } from "./release-channel-preference.ts";
import { classifyOwnership, readMarkerV2 } from "./marker-v2.ts";
import { fetchLatestRelease } from "./release-record.ts";
import type {
  ArtifactId,
  FreshnessEvidence,
  MarkerV1,
  MarkerV2,
  OwnershipMarker,
  ReleaseChannel,
  ReleaseChannelResolution,
  Result,
  ReleaseRecord,
} from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type InstallerReadFreshness = "current" | "stale" | "unknown";
export type InstallerReadStatus = "valid" | "missing" | "invalid" | "unavailable" | "unsupported" | "ambiguous" | "error";
export type InstallerArtifactEvidence = Readonly<{
  status: "verified" | "pending" | "unavailable";
  reason: string;
  artifactId?: ArtifactId;
}>;
export type InstallerMarkerEvidence = Readonly<{
  status: InstallerReadStatus;
  source: "installer-marker";
  freshness: InstallerReadFreshness;
  reason: string;
  version?: string;
  owner?: "installer" | "external" | "ambiguous" | "unknown";
  artifact: InstallerArtifactEvidence;
}>;
export type InstallerReleaseEvidence = Readonly<{
  status: InstallerReadStatus;
  source: "release-provider";
  freshness: InstallerReadFreshness;
  reason: string;
  version?: string;
  artifact: InstallerArtifactEvidence;
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
  preference: ReleaseChannelResolution;
  effectiveChannel?: ReleaseChannel;
  freshness: FreshnessEvidence;
}>;

function unavailableArtifact(reason: string): InstallerArtifactEvidence {
  return { status: "unavailable", reason };
}

function artifactFromMarker(marker: MarkerV1 | MarkerV2): InstallerArtifactEvidence {
  if (!("schemaVersion" in marker)) return unavailableArtifact("legacy-marker-identity-unavailable");
  const artifactId = (marker as MarkerV2 & { artifactId?: unknown }).artifactId;
  return typeof artifactId === "string" && artifactId.length > 0
    ? { status: "verified", artifactId: artifactId as ArtifactId, reason: "verified-marker-identity" }
    : unavailableArtifact("marker-identity-unavailable");
}

function artifactFromRelease(release: ReleaseRecord): InstallerArtifactEvidence {
  const identity = (release as ReleaseRecord & { identity?: unknown }).identity;
  if (!identity || typeof identity !== "object") return { status: "pending", reason: "verification-pending" };
  const value = identity as { status?: unknown; artifactId?: unknown };
  if (value.status === "pending") return { status: "pending", reason: "verification-pending" };
  return value.status === "verified" && typeof value.artifactId === "string" && value.artifactId.length > 0
    ? { status: "verified", artifactId: value.artifactId as ArtifactId, reason: "verified-release-identity" }
    : unavailableArtifact("release-identity-unavailable");
}

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
      return { status: "missing", source: "installer-marker", freshness: "current", reason: "missing", artifact: unavailableArtifact("marker-missing") };
    }
    const marker = readMarkerV2(caps, markerPath);
    if (!marker) {
      return { status: "invalid", source: "installer-marker", freshness: "current", reason: "invalid-marker", artifact: unavailableArtifact("marker-identity-unavailable") };
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
      artifact: artifactFromMarker(marker),
    };
  } catch {
    return { status: "error", source: "installer-marker", freshness: "unknown", reason: "marker-read-failed", artifact: unavailableArtifact("marker-read-failed") };
  }
}

function unavailableRelease(reason: string): InstallerReleaseEvidence {
  return {
    status: "unavailable",
    source: "release-provider",
    freshness: "unknown",
    reason,
    artifact: unavailableArtifact("release-unavailable"),
  };
}

export async function readInstallerReleaseEvidence(
  caps: Pick<UpdateCaps, "http">,
  readRelease: () => Promise<Result<ReleaseRecord, unknown>> = () => fetchLatestRelease(caps),
  channel: ReleaseChannel = "stable",
): Promise<InstallerReleaseEvidence> {
  try {
    const result = await readRelease();
    if (!result.ok) return unavailableRelease("release-read-failed");
    return {
      status: "valid",
      source: "release-provider",
      freshness: channel === "alpha" ? "unknown" : "current",
      reason: "read-success",
      version: result.value.tag.slice("installer-v".length),
      artifact: artifactFromRelease(result.value),
    };
  } catch {
    return { ...unavailableRelease("release-read-failed"), status: "error" };
  }
}

export function readInstallerCapabilityEvidence(
  supported = true,
): InstallerCapabilityEvidence {
  return supported
    ? { status: "valid", source: "installer-capability", freshness: "current", reason: "read-success", supported: true }
    : { status: "unsupported", source: "installer-capability", freshness: "current", reason: "unsupported", supported: false };
}

function freshnessFor(
  preference: ReleaseChannelResolution,
  effectiveChannel: ReleaseChannel | undefined,
  releaseStatus: InstallerReadStatus,
): FreshnessEvidence {
  if (!effectiveChannel) {
    return { status: "unavailable", reason: preference.status === "unavailable" ? preference.reason : "effective-channel-unavailable" };
  }
  if (releaseStatus !== "valid") return { status: "unavailable", reason: "release-freshness-unavailable" };
  return effectiveChannel === "alpha"
    ? { status: "unknown", reason: "alpha-expiration-evidence-unavailable" }
    : { status: "unknown", reason: "publication-evidence-unavailable" };
}

/** Composes read evidence; no action owner, transaction, writer, or child process is called. */
export async function readInstallerUpdateEvidence(options: {
  caps: Pick<UpdateCaps, "fs" | "http">;
  markerPath?: string;
  installationPath?: string;
  readRelease?: () => Promise<Result<ReleaseRecord, unknown>>;
  updateSupported?: boolean;
}): Promise<InstallerUpdateReadEvidence> {
  const markerPath = options.markerPath ?? INSTALL_MARKER;
  const preference = readReleaseChannelPreference(options.installationPath ?? dirname(markerPath));
  const effectiveChannel = preference.status === "unavailable" ? undefined : preference.channel;
  const marker = readInstallerMarkerEvidence(options.caps, markerPath);
  const release = effectiveChannel
    ? await readInstallerReleaseEvidence(
      options.caps,
      options.readRelease ?? (() => fetchLatestRelease(options.caps, undefined, effectiveChannel)),
      effectiveChannel,
    )
    : unavailableRelease("effective-channel-unavailable");
  const capability = readInstallerCapabilityEvidence(options.updateSupported ?? true);
  const owner = marker.owner === "installer"
    ? { ...marker, action: "update" as const, actionId: "installer.update" as const }
    : marker;
  return Object.freeze({
    installed: marker,
    release,
    owner,
    capability,
    preference,
    effectiveChannel,
    freshness: freshnessFor(preference, effectiveChannel, release.status),
  });
}

export const readUpdateAdvisorEvidence = readInstallerUpdateEvidence;
