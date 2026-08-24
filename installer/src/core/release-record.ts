import { INSTALLER_REPO } from "./version.ts";
import { isEligibleRelease, selectHighestRelease } from "./release-resolver.ts";
import { normalizeReleaseTag } from "./release-types.ts";
import type { ArtifactIdentity, ReleaseAsset, ReleaseChannel, ReleaseRecord, ReleaseTag, Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type ReleaseError = UpdateStageError & { stage: "acquiring-metadata" };

export type GithubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
};

export type AdaptedReleaseRecord = ReleaseRecord & { identity: ArtifactIdentity };

function releaseError(code: string, message: string): ReleaseError {
  return { stage: "acquiring-metadata", code, message };
}

export function adaptReleaseRecord(payload: unknown): Result<AdaptedReleaseRecord, ReleaseError> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: releaseError("invalid-response", "Release response is not an object") };
  }
  const parsed = payload as GithubRelease;
  if (typeof parsed.tag_name !== "string" || typeof parsed.html_url !== "string") {
    return { ok: false, error: releaseError("invalid-response", "Release response is missing identity") };
  }
  const tag = normalizeReleaseTag(parsed.tag_name);
  if (!tag.ok) return { ok: false, error: releaseError("invalid-tag", tag.error.message) };
  if (!Array.isArray(parsed.assets)) return { ok: false, error: releaseError("invalid-response", "Release response is missing assets") };
  const assets: ReleaseAsset[] = [];
  for (const asset of parsed.assets) {
    if (!asset || typeof asset !== "object") return { ok: false, error: releaseError("invalid-response", "Invalid release asset") };
    const value = asset as { name?: unknown; browser_download_url?: unknown };
    if (typeof value.name !== "string" || typeof value.browser_download_url !== "string") {
      return { ok: false, error: releaseError("invalid-response", "Invalid release asset") };
    }
    assets.push({ name: value.name, downloadUrl: value.browser_download_url });
  }
  return {
    ok: true,
    value: {
      tag: tag.value,
      htmlUrl: parsed.html_url,
      draft: parsed.draft === true,
      prerelease: parsed.prerelease === true,
      assets,
      identity: { status: "pending" },
    },
  };
}

function parseRecord(payload: Uint8Array): Result<AdaptedReleaseRecord, ReleaseError> {
  try {
    return adaptReleaseRecord(JSON.parse(new TextDecoder().decode(payload)));
  } catch {
    return { ok: false, error: releaseError("invalid-response", "Release response is not JSON") };
  }
}

function parseCandidateList(payload: Uint8Array): Result<AdaptedReleaseRecord[], ReleaseError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return { ok: false, error: releaseError("invalid-response", "Release response is not JSON") };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: releaseError("invalid-response", "Release response is not a candidate list") };
  }

  const records: AdaptedReleaseRecord[] = [];
  for (const candidate of parsed) {
    const record = adaptReleaseRecord(candidate);
    if (record.ok) records.push(record.value);
  }
  return { ok: true, value: records };
}

async function fetchResponse(
  url: string,
  caps: Pick<UpdateCaps, "http">,
  notFoundMessage: string,
): Promise<Result<Uint8Array, ReleaseError>> {
  try {
    const response = await caps.http.get(url);
    if (response.status === 404) return { ok: false, error: releaseError("not-found", notFoundMessage) };
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: releaseError("http", `Release request failed with HTTP ${response.status}`) };
    }
    return { ok: true, value: response.body };
  } catch (error) {
    return { ok: false, error: releaseError("network", error instanceof Error ? error.message : "Release request failed") };
  }
}

async function fetchRecord(
  url: string,
  caps: Pick<UpdateCaps, "http">,
  channel: ReleaseChannel = "stable",
): Promise<Result<AdaptedReleaseRecord, ReleaseError>> {
  const response = await fetchResponse(url, caps, "Release was not found");
  if (!response.ok) return response;
  const record = parseRecord(response.value);
  if (!record.ok) return record;
  if (!isEligibleRelease(record.value, channel)) {
    return { ok: false, error: releaseError("ineligible", `Release ${record.value.tag} is not eligible for ${channel}`) };
  }
  return record;
}

const RELEASE_CANDIDATE_LIMIT = 30;

export async function fetchLatestRelease(
  caps: Pick<UpdateCaps, "http">,
  repo = INSTALLER_REPO,
  channel: ReleaseChannel = "stable",
): Promise<Result<ReleaseRecord, ReleaseError>> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=${RELEASE_CANDIDATE_LIMIT}`;
  const response = await fetchResponse(url, caps, "Release candidate list was not found");
  if (!response.ok) return response;
  const candidates = parseCandidateList(response.value);
  if (!candidates.ok) return candidates;
  const selected = selectHighestRelease(candidates.value, channel);
  if (!selected.ok) return { ok: false, error: releaseError("ineligible", selected.error.message) };
  return selected;
}

export async function fetchReleaseByTag(
  tag: ReleaseTag,
  caps: Pick<UpdateCaps, "http">,
  repo = INSTALLER_REPO,
  channel: "stable" | "alpha" = "stable",
): Promise<Result<ReleaseRecord, ReleaseError>> {
  return fetchRecord(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, caps, channel);
}
