export type ReleaseTag = `installer-v${string}`;

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
  channel: string;
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
