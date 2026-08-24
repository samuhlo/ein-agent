export type ReleaseTag = `installer-v${string}`;

export type ReleaseChannel = "stable" | "alpha";

export type ReleaseChannelResolution =
  | { status: "defaulted"; channel: "stable" }
  | { status: "explicit"; channel: ReleaseChannel }
  | { status: "unavailable"; reason: string };

export type ReleaseContract =
  | { status: "defaulted"; channel: "stable" }
  | { status: "explicit"; channel: ReleaseChannel; tag: ReleaseTag };

export type FreshnessEvidence =
  | { status: "current" | "stale" | "expired"; source: "immutable-publication" }
  | { status: "unknown" | "unavailable"; reason: string };

export type ArtifactId = string & { readonly __artifactId: unique symbol };

export type ArtifactIdentity =
  | { status: "pending" }
  | { status: "verified"; artifactId: ArtifactId };

export type ArtifactIdentityErrorCode =
  | "missing-release-tag"
  | "invalid-release-tag"
  | "missing-digest"
  | "invalid-digest"
  | "missing-artifact-id"
  | "identity-conflict";

export type ArtifactIdentityError = {
  code: ArtifactIdentityErrorCode;
  message: string;
};

export type ArtifactIdentityEvidence = {
  releaseTag?: string | null;
  sha256?: string | null;
  artifactId?: string | null;
};

const SEMVER_IDENTIFIER = "(?:0|[1-9]\\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)";
const RELEASE_TAG_PATTERN = new RegExp(
  `^(?:installer-)?v?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-(?:${SEMVER_IDENTIFIER})(?:\\.${SEMVER_IDENTIFIER})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`,
);
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function isReleaseChannel(value: unknown): value is ReleaseChannel {
  return value === "stable" || value === "alpha";
}

function artifactIdentityError(code: ArtifactIdentityErrorCode, message: string): ArtifactIdentityError {
  return { code, message };
}

export function normalizeReleaseTag(releaseTag: unknown): Result<ReleaseTag, ArtifactIdentityError> {
  if (typeof releaseTag !== "string" || releaseTag.length === 0) {
    return { ok: false, error: artifactIdentityError("missing-release-tag", "Verified artifact identity is missing its release tag") };
  }
  const match = RELEASE_TAG_PATTERN.exec(releaseTag);
  if (!match?.[0]) {
    return { ok: false, error: artifactIdentityError("invalid-release-tag", `Invalid release tag: ${releaseTag}`) };
  }
  const version = releaseTag.replace(/^(?:installer-)?v?/, "");
  return { ok: true, value: `installer-v${version}` };
}

export function deriveArtifactId(
  releaseTag: string | null | undefined,
  sha256: string | null | undefined,
): Result<ArtifactId, ArtifactIdentityError> {
  const tag = normalizeReleaseTag(releaseTag);
  if (!tag.ok) return tag;
  if (typeof sha256 !== "string" || sha256.length === 0) {
    return { ok: false, error: artifactIdentityError("missing-digest", "Verified artifact identity is missing its SHA-256 digest") };
  }
  if (!SHA256_PATTERN.test(sha256)) {
    return { ok: false, error: artifactIdentityError("invalid-digest", "Verified artifact identity requires a 64-character SHA-256 digest") };
  }
  return { ok: true, value: `${tag.value}@sha256:${sha256.toLowerCase()}` as ArtifactId };
}

export function agreeArtifactIdentity(
  evidence: ArtifactIdentityEvidence,
): Result<ArtifactId, ArtifactIdentityError> {
  const derived = deriveArtifactId(evidence.releaseTag, evidence.sha256);
  if (!derived.ok) return derived;
  if (typeof evidence.artifactId !== "string" || evidence.artifactId.length === 0) {
    return { ok: false, error: artifactIdentityError("missing-artifact-id", "Verified artifact identity is missing its canonical artifactId") };
  }
  if (evidence.artifactId !== derived.value) {
    return { ok: false, error: artifactIdentityError("identity-conflict", "Verified artifact identity evidence disagrees") };
  }
  return derived;
}

export type ReleaseSelector =
  | { kind: "latest"; raw: "latest" }
  | { kind: "explicit"; raw: string; tag: ReleaseTag };

export type ReleaseAsset = {
  name: string;
  downloadUrl: string;
};

export type ReleaseRecord = {
  tag: ReleaseTag;
  htmlUrl: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
};

export type ResolvedRelease = {
  selector: ReleaseSelector;
  release: ReleaseRecord;
};

export type AssetDigest = {
  assetName: string;
  sha256: string;
};

export type OwnershipMarker =
  | { type: "standalone" }
  | { type: "package-manager"; manager: string }
  | { type: "legacy-standalone" }
  | { type: "ownership-ambiguous"; reason: string };

export type MarkerV1 = {
  version: string;
  installedAt: string;
  channel: ReleaseChannel;
};

export type MarkerV2 = MarkerV1 & {
  schemaVersion: 2;
  releaseTag: ReleaseTag;
  binaryVersion: string;
  templateVersion: string;
  owner: OwnershipMarker;
  asset: AssetDigest;
};

export type UpdateOutcome =
  | { type: "updated"; release: ResolvedRelease }
  | { type: "already-current"; release: ResolvedRelease }
  | { type: "dry-run"; release: ResolvedRelease; owner: OwnershipMarker }
  | { type: "blocked-external-owner"; owner: Extract<OwnershipMarker, { type: "package-manager" }>; release?: ResolvedRelease }
  | { type: "failed"; stage: UpdateStage; message: string; selector?: ReleaseSelector; release?: ResolvedRelease };

export type UpdateStage =
  | "resolving"
  | "acquiring-metadata"
  | "verifying"
  | "staging"
  | "continuing"
  | "preparing"
  | "deploying"
  | "committing"
  | "recovering";

export type UpdateStageError = {
  stage: UpdateStage;
  code: string;
  message: string;
};

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function classifyOwnership(marker: MarkerV1 | MarkerV2 | null): OwnershipMarker {
  if (!marker) return { type: "ownership-ambiguous", reason: "missing marker" };
  if (!("schemaVersion" in marker)) {
    return marker.channel === "stable"
      ? { type: "legacy-standalone" }
      : { type: "ownership-ambiguous", reason: "unknown legacy channel" };
  }
  return marker.owner;
}
