import type {
  ReleaseRecord,
  ReleaseSelector,
  ReleaseTag,
  ResolvedRelease,
  Result,
  UpdateStageError,
} from "./release-types.ts";

export type ResolutionError = UpdateStageError & { stage: "resolving" };

function resolutionError(code: string, message: string): ResolutionError {
  return { stage: "resolving", code, message };
}

export function normalizeTag(input: string): Result<ReleaseTag, ResolutionError> {
  const match = /^(?:installer-)?v?(\d+\.\d+\.\d+)$/.exec(input);
  if (!match?.[1]) return { ok: false, error: resolutionError("invalid-selector", `Unsupported release selector: ${input}`) };
  return { ok: true, value: `installer-v${match[1]}` };
}

export function resolveExplicitTag(input: string): Result<ReleaseTag, ResolutionError> {
  return normalizeTag(input);
}

export function parseSelector(args: string[]): Result<ReleaseSelector, ResolutionError> {
  if (args.length === 0 || (args.length === 1 && args[0] === "latest")) {
    return { ok: true, value: { kind: "latest", raw: "latest" } };
  }
  if (args.length !== 1 || !args[0]) {
    return { ok: false, error: resolutionError("invalid-selector", "Expected latest or one stable version") };
  }
  const tag = resolveExplicitTag(args[0]);
  return tag.ok
    ? { ok: true, value: { kind: "explicit", raw: args[0], tag: tag.value } }
    : tag;
}

export function isEligibleRelease(release: Pick<ReleaseRecord, "tag" | "draft" | "prerelease">): boolean {
  return !release.draft && !release.prerelease && normalizeTag(release.tag).ok;
}

export function resolveRecord(
  selector: ReleaseSelector,
  release: ReleaseRecord,
): Result<ResolvedRelease, ResolutionError> {
  if (!isEligibleRelease(release)) {
    return { ok: false, error: resolutionError("ineligible", `Release ${release.tag} is not eligible`) };
  }
  if (selector.kind === "explicit" && selector.tag !== release.tag) {
    return { ok: false, error: resolutionError("exact-tag-mismatch", `Expected ${selector.tag}, got ${release.tag}`) };
  }
  return { ok: true, value: { selector, release } };
}
