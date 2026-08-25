import { INSTALL_MARKER } from "./paths.ts";
import { agreeArtifactIdentity, deriveArtifactId, isReleaseChannel } from "./release-types.ts";
import type {
  ArtifactId,
  AssetDigest,
  MarkerV1,
  MarkerV2,
  OwnershipMarker,
  ReleaseChannel,
  ReleaseTag,
  ResolvedRelease,
  Result,
  UpdateStageError,
} from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type MarkerError = UpdateStageError;

export type InstalledMarkerV2 = MarkerV2 & { artifactId: ArtifactId };

export type MarkerCommit = {
  release: ResolvedRelease;
  binaryVersion: string;
  templateVersion: string;
  owner: OwnershipMarker;
  asset: AssetDigest;
  /** Optional cross-stage evidence; the canonical value is always derived from tag + verified digest. */
  artifactId?: string | null;
  channel?: ReleaseChannel;
  markerPath?: string;
  caps: UpdateCaps;
};

export type LegacyProof = {
  release: ResolvedRelease;
  binaryVersion: string;
  templateVersion: string;
  deployedTemplateVersion: string;
  asset: AssetDigest;
};

function markerError(code: string, message: string): MarkerError {
  return { stage: "committing", code, message };
}

function isV1(value: unknown): value is MarkerV1 {
  if (!value || typeof value !== "object") return false;
  const marker = value as Partial<MarkerV1>;
  return typeof marker.version === "string" && typeof marker.installedAt === "string" && isReleaseChannel(marker.channel);
}

function isOwner(value: unknown): value is Extract<OwnershipMarker, { type: "standalone" } | { type: "package-manager" }> {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const owner = value as OwnershipMarker;
  return owner.type === "standalone" ||
    (owner.type === "package-manager" && typeof owner.manager === "string" && owner.manager.length > 0);
}

function isV2(value: unknown): value is InstalledMarkerV2 {
  if (!isV1(value)) return false;
  const marker = value as Partial<InstalledMarkerV2>;
  if (marker.schemaVersion !== 2 || typeof marker.releaseTag !== "string" || typeof marker.binaryVersion !== "string" ||
    typeof marker.templateVersion !== "string" || !isReleaseChannel(marker.channel) || !isOwner(marker.owner) || !marker.asset ||
    typeof marker.asset.assetName !== "string" || marker.asset.assetName.length === 0 || typeof marker.asset.sha256 !== "string" ||
    marker.asset.sha256.length === 0 || marker.asset.sha256 !== marker.asset.sha256.toLowerCase() || typeof marker.artifactId !== "string") return false;
  return agreeArtifactIdentity({ releaseTag: marker.releaseTag, sha256: marker.asset.sha256, artifactId: marker.artifactId }).ok;
}

export function readMarkerV2(caps: Pick<UpdateCaps, "fs">, markerPath = INSTALL_MARKER): MarkerV1 | InstalledMarkerV2 | null {
  if (!caps.fs.exists(markerPath)) return null;
  try {
    const raw = new TextDecoder().decode(caps.fs.readFile(markerPath));
    const marker: unknown = JSON.parse(raw);
    // A malformed v2 must not be downgraded to an apparently coherent legacy marker.
    return isV2(marker) || (isV1(marker) && !("schemaVersion" in marker)) ? marker : null;
  } catch {
    return null;
  }
}

export function classifyOwnership(marker: MarkerV1 | MarkerV2 | null): OwnershipMarker {
  if (!marker) return { type: "ownership-ambiguous", reason: "missing or malformed marker" };
  if (!isV2(marker)) return { type: "legacy-standalone" };
  return marker.owner;
}

function versionFor(tag: ReleaseTag): string {
  return tag.slice("installer-v".length);
}

/** Commits only a fully proven identity and verifies the renamed marker by reading it back. */
export function commitMarkerV2(options: MarkerCommit): Result<InstalledMarkerV2, MarkerError> {
  const markerPath = options.markerPath ?? INSTALL_MARKER;
  if (options.owner.type === "legacy-standalone" || options.owner.type === "ownership-ambiguous") {
    return { ok: false, error: markerError("ambiguous-owner", "A v2 marker requires explicit ownership") };
  }
  const derivedIdentity = deriveArtifactId(options.release.release.tag, options.asset.sha256);
  if (!derivedIdentity.ok) {
    return { ok: false, error: markerError(derivedIdentity.error.code, derivedIdentity.error.message) };
  }
  if (options.artifactId !== undefined && options.artifactId !== null) {
    const agreement = agreeArtifactIdentity({ releaseTag: options.release.release.tag, sha256: options.asset.sha256, artifactId: options.artifactId });
    if (!agreement.ok) return { ok: false, error: markerError(agreement.error.code, agreement.error.message) };
  }
  const version = versionFor(options.release.release.tag);
  if (options.binaryVersion !== version || options.templateVersion !== version) {
    return { ok: false, error: markerError("identity-mismatch", "Marker cannot lead deployed binary or template") };
  }
  const marker: InstalledMarkerV2 = {
    schemaVersion: 2,
    version,
    releaseTag: options.release.release.tag,
    binaryVersion: options.binaryVersion,
    templateVersion: options.templateVersion,
    installedAt: options.caps.clock.now().toISOString(),
    channel: options.channel ?? "stable",
    owner: options.owner,
    artifactId: derivedIdentity.value,
    asset: { ...options.asset, sha256: options.asset.sha256.toLowerCase() },
  };
  const temporary = options.caps.fs.createSiblingFile(markerPath);
  try {
    options.caps.fs.writeFile(temporary, new TextEncoder().encode(`${JSON.stringify(marker, null, 2)}\n`));
    options.caps.fs.rename(temporary, markerPath);
    const readBack = readMarkerV2(options.caps, markerPath);
    if (!readBack || !isV2(readBack) || JSON.stringify(readBack) !== JSON.stringify(marker)) {
      return { ok: false, error: markerError("read-back-failed", "Committed marker could not be verified") };
    }
    return { ok: true, value: readBack };
  } catch (error) {
    try {
      options.caps.fs.removeFile(temporary);
    } catch {
      // Temporary marker is disposable; primary error remains authoritative.
    }
    return { ok: false, error: markerError("commit-failed", error instanceof Error ? error.message : "Could not atomically commit marker") };
  }
}

export function migrateLegacyMarker(
  marker: MarkerV1 | null,
  proof: LegacyProof,
  options: Omit<MarkerCommit, "release" | "binaryVersion" | "templateVersion" | "owner" | "asset">,
): Result<MarkerV2, MarkerError> {
  if (!marker || marker.channel !== "stable") {
    return { ok: false, error: markerError("migration-ineligible", "Only coherent stable legacy markers may migrate") };
  }
  const version = versionFor(proof.release.release.tag);
  if (marker.version !== version || proof.binaryVersion !== version || proof.templateVersion !== version || proof.deployedTemplateVersion !== version) {
    return { ok: false, error: markerError("coherence-unproven", "Legacy marker migration requires executable and template coherence") };
  }
  return commitMarkerV2({
    ...options,
    release: proof.release,
    binaryVersion: proof.binaryVersion,
    templateVersion: proof.templateVersion,
    owner: { type: "standalone" },
    asset: proof.asset,
  });
}
