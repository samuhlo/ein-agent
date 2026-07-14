import { INSTALLER_REPO } from "./version.ts";
import { isEligibleRelease, normalizeTag } from "./release-resolver.ts";
import type { ReleaseAsset, ReleaseRecord, ReleaseTag, Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type ReleaseError = UpdateStageError & { stage: "acquiring-metadata" };

type GithubRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  assets?: unknown;
};

function releaseError(code: string, message: string): ReleaseError {
  return { stage: "acquiring-metadata", code, message };
}

function parseRecord(payload: Uint8Array): Result<ReleaseRecord, ReleaseError> {
  let parsed: GithubRelease;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payload)) as GithubRelease;
  } catch {
    return { ok: false, error: releaseError("invalid-response", "Release response is not JSON") };
  }
  if (typeof parsed.tag_name !== "string" || typeof parsed.html_url !== "string") {
    return { ok: false, error: releaseError("invalid-response", "Release response is missing identity") };
  }
  const tag = normalizeTag(parsed.tag_name);
  if (!tag.ok) return { ok: false, error: releaseError("invalid-tag", `Invalid release tag: ${parsed.tag_name}`) };
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
    value: { tag: tag.value, htmlUrl: parsed.html_url, draft: parsed.draft === true, prerelease: parsed.prerelease === true, assets },
  };
}

async function fetchRecord(url: string, caps: Pick<UpdateCaps, "http">): Promise<Result<ReleaseRecord, ReleaseError>> {
  try {
    const response = await caps.http.get(url);
    if (response.status === 404) return { ok: false, error: releaseError("not-found", "Release was not found") };
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, error: releaseError("http", `Release request failed with HTTP ${response.status}`) };
    }
    const record = parseRecord(response.body);
    if (!record.ok) return record;
    if (!isEligibleRelease(record.value)) {
      return { ok: false, error: releaseError("ineligible", `Release ${record.value.tag} is not eligible`) };
    }
    return record;
  } catch (error) {
    return { ok: false, error: releaseError("network", error instanceof Error ? error.message : "Release request failed") };
  }
}

export async function fetchLatestRelease(
  caps: Pick<UpdateCaps, "http">,
  repo = INSTALLER_REPO,
): Promise<Result<ReleaseRecord, ReleaseError>> {
  return fetchRecord(`https://api.github.com/repos/${repo}/releases/latest`, caps);
}

export async function fetchReleaseByTag(
  tag: ReleaseTag,
  caps: Pick<UpdateCaps, "http">,
  repo = INSTALLER_REPO,
): Promise<Result<ReleaseRecord, ReleaseError>> {
  return fetchRecord(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, caps);
}
