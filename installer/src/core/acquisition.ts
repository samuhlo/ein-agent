import { join } from "node:path";
import { selectAsset, type AssetPlatform } from "./asset-selector.ts";
import { parseChecksums, verifyAsset } from "./checksum.ts";
import { fetchLatestRelease, fetchReleaseByTag } from "./release-record.ts";
import { resolveRecord } from "./release-resolver.ts";
import { deriveArtifactId, isReleaseChannel } from "./release-types.ts";
import type { ArtifactIdentity, AssetDigest, ReleaseChannel, ReleaseSelector, ResolvedRelease, Result, UpdateStageError } from "./release-types.ts";
import { isTrustedReleaseUrl, updateCapsLimits, type UpdateCaps } from "./update-caps.ts";

type AcquiredResolvedRelease = ResolvedRelease & { identity: ArtifactIdentity };
type VerifiedArtifactIdentity = Extract<ArtifactIdentity, { status: "verified" }>;

export type AcquiredRelease = {
  stagedPath: string;
  stagingDir: string;
  digest: AssetDigest;
  /** The candidate remains pending until the downloaded bytes pass verification. */
  release: AcquiredResolvedRelease;
  identity: VerifiedArtifactIdentity;
  artifactId: VerifiedArtifactIdentity["artifactId"];
  assetName: string;
  cleanup(): void;
};

export type AcquireOptions = {
  selector: ReleaseSelector;
  platform: AssetPlatform;
  caps: UpdateCaps;
  /** Direct callers retain stable compatibility until the preference boundary supplies a channel. */
  channel?: ReleaseChannel;
  repo?: string;
};

function acquisitionError(code: string, message: string): UpdateStageError {
  return { stage: "acquiring-metadata", code, message };
}

function text(body: Uint8Array): string {
  return new TextDecoder().decode(body);
}

export async function acquireRelease(
  options: AcquireOptions,
): Promise<Result<AcquiredRelease, UpdateStageError>> {
  const { caps, selector, platform, repo } = options;
  const channel: unknown = options.channel ?? "stable";
  if (!isReleaseChannel(channel)) {
    return { ok: false, error: acquisitionError("invalid-channel", "Release acquisition requires stable or alpha") };
  }
  const record = selector.kind === "latest"
    ? await fetchLatestRelease(caps, repo, channel)
    : await fetchReleaseByTag(selector.tag, caps, repo, channel);
  if (!record.ok) return record;
  const resolved = resolveRecord(selector, record.value, channel);
  if (!resolved.ok) return resolved;
  // Provider metadata carries no trustworthy byte identity. Keep that fact explicit
  // while selection and acquisition proceed; verification upgrades it below.
  const pendingRelease: AcquiredResolvedRelease = { ...resolved.value, identity: { status: "pending" } };
  const selection = selectAsset(platform, record.value);
  if (!selection.ok) return { ok: false, error: acquisitionError(selection.error.code, selection.error.message) };
  const asset = record.value.assets.find((item) => item.name === selection.value.assetName);
  const checksums = record.value.assets.filter((item) => item.name === "checksums.txt");
  if (!asset || checksums.length !== 1) {
    return { ok: false, error: acquisitionError("missing-checksums", "Release must contain one checksums.txt asset") };
  }

  const stagingDir = caps.fs.createTempDir("ein-release-");
  const stagedPath = join(stagingDir, asset.name);
  let retained = false;
  try {
    const [assetResponse, checksumResponse] = await Promise.all([
      // The asset is the ~90 MB Bun binary: give it the long timeout so the
      // download is not aborted mid-transfer. Checksums is tiny → short default.
      caps.http.get(asset.downloadUrl, { timeoutMs: updateCapsLimits.ASSET_TIMEOUT_MS }),
      caps.http.get(checksums[0]!.downloadUrl),
    ]);
    if (!isTrustedReleaseUrl(assetResponse.url) || !isTrustedReleaseUrl(checksumResponse.url)) {
      return { ok: false, error: acquisitionError("unsafe-redirect", "Release download redirected outside GitHub") };
    }
    if (assetResponse.status < 200 || assetResponse.status >= 300) {
      return { ok: false, error: acquisitionError("asset-http", `Asset request failed with HTTP ${assetResponse.status}`) };
    }
    if (checksumResponse.status < 200 || checksumResponse.status >= 300) {
      return { ok: false, error: acquisitionError("checksums-http", `Checksum request failed with HTTP ${checksumResponse.status}`) };
    }
    caps.fs.writeFile(stagedPath, assetResponse.body);
    const expected = parseChecksums(text(checksumResponse.body), asset.name);
    if (!expected.ok) return expected;
    const verified = await verifyAsset(stagedPath, expected.value, caps);
    if (!verified.ok) return verified;
    const derivedIdentity = deriveArtifactId(pendingRelease.release.tag, verified.value.sha256);
    if (!derivedIdentity.ok) {
      return { ok: false, error: { stage: "verifying", code: derivedIdentity.error.code, message: derivedIdentity.error.message } };
    }
    const identity: VerifiedArtifactIdentity = { status: "verified", artifactId: derivedIdentity.value };
    retained = true;
    return {
      ok: true,
      value: {
        stagedPath,
        stagingDir,
        digest: verified.value,
        release: { ...pendingRelease, identity },
        identity,
        artifactId: derivedIdentity.value,
        assetName: asset.name,
        cleanup: () => caps.fs.removeDir(stagingDir),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: acquisitionError("network", error instanceof Error ? error.message : "Asset acquisition failed"),
    };
  } finally {
    // Failures never retain disposable bytes; a caller owns cleanup after success.
    if (!retained) caps.fs.removeDir(stagingDir);
  }
}

export const acquireReleaseForUpdate = acquireRelease;
