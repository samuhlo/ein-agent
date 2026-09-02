import { isReleaseChannel, normalizeReleaseTag } from "./release-types.ts";
import type {
  ReleaseChannel,
  ReleaseContract,
  ReleaseRecord,
  ReleaseSelector,
  ReleaseTag,
  ResolvedRelease,
  Result,
  UpdateStageError,
} from "./release-types.ts";

export type ResolutionError = UpdateStageError & { stage: "resolving" };

type SemVer = {
  major: string;
  minor: string;
  patch: string;
  prerelease: string[];
};

function resolutionError(code: string, message: string): ResolutionError {
  return { stage: "resolving", code, message };
}

export function normalizeTag(input: string): Result<ReleaseTag, ResolutionError> {
  const normalized = normalizeReleaseTag(input);
  if (!normalized.ok) return { ok: false, error: resolutionError("invalid-selector", normalized.error.message) };
  return { ok: true, value: normalized.value };
}

export function resolveReleaseContract(
  channel: unknown,
  tag: unknown,
  target: unknown,
  runningVersion: string,
): Result<ReleaseContract, ResolutionError> {
  if (channel === undefined && tag === undefined) {
    return { ok: true, value: { status: "defaulted", channel: "stable" } };
  }
  if (channel === undefined || tag === undefined) {
    return { ok: false, error: resolutionError("incomplete-contract", "Release channel and tag must be provided together") };
  }
  if (!isReleaseChannel(channel)) {
    return { ok: false, error: resolutionError("invalid-channel", `Unsupported release channel: ${String(channel)}`) };
  }

  const normalized = normalizeReleaseTag(tag);
  if (!normalized.ok) return { ok: false, error: resolutionError("invalid-contract-tag", normalized.error.message) };
  if (tag !== normalized.value) {
    return { ok: false, error: resolutionError("non-canonical-tag", `Release tag must use canonical form: ${normalized.value}`) };
  }

  const version = parseSemVer(normalized.value);
  if (!version) return { ok: false, error: resolutionError("invalid-contract-tag", `Invalid release tag: ${String(tag)}`) };
  const tagChannel: ReleaseChannel | undefined = version.prerelease.length === 0
    ? "stable"
    : version.prerelease[0] === "alpha"
      ? "alpha"
      : undefined;
  if (!tagChannel) {
    return { ok: false, error: resolutionError("unsupported-prerelease", `Unsupported release prerelease vocabulary in ${normalized.value}`) };
  }
  if (channel === "stable" && tagChannel !== "stable") {
    return { ok: false, error: resolutionError("channel-tag-mismatch", `Release channel ${channel} does not match ${normalized.value}`) };
  }
  if (target !== "pi" && target !== "claude" && target !== "both") {
    return { ok: false, error: resolutionError("invalid-target", "Explicit installs require runtime pi, claude, or both") };
  }

  const versionText = normalized.value.slice("installer-v".length);
  if (versionText !== runningVersion) {
    return { ok: false, error: resolutionError("compiled-version-mismatch", `Release ${normalized.value} does not match running installer ${runningVersion}`) };
  }
  return { ok: true, value: { status: "explicit", channel, tag: normalized.value } };
}

function parseSemVer(tag: string): SemVer | null {
  const normalized = normalizeReleaseTag(tag);
  if (!normalized.ok) return null;
  const version = normalized.value.slice("installer-v".length);
  const versionWithoutBuild = version.split("+", 1)[0];
  if (!versionWithoutBuild) return null;
  const prereleaseSeparator = versionWithoutBuild.indexOf("-");
  const core = prereleaseSeparator < 0 ? versionWithoutBuild : versionWithoutBuild.slice(0, prereleaseSeparator);
  const coreParts = core.split(".");
  if (coreParts.length !== 3) return null;
  return {
    major: coreParts[0]!,
    minor: coreParts[1]!,
    patch: coreParts[2]!,
    prerelease: prereleaseSeparator < 0 ? [] : versionWithoutBuild.slice(prereleaseSeparator + 1).split("."),
  };
}

function compareNumeric(left: string, right: string): number {
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = /^(0|[1-9]\d*)$/.test(left);
  const rightNumeric = /^(0|[1-9]\d*)$/.test(right);
  if (leftNumeric && rightNumeric) return compareNumeric(left, right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left === right ? 0 : left > right ? 1 : -1;
}

function compareSemVer(left: SemVer, right: SemVer): number {
  for (const [leftPart, rightPart] of [[left.major, right.major], [left.minor, right.minor], [left.patch, right.patch]] as const) {
    const comparison = compareNumeric(leftPart, rightPart);
    if (comparison !== 0) return comparison;
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0;
    return left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) return leftIdentifier === undefined ? -1 : 1;
    const comparison = compareIdentifier(leftIdentifier, rightIdentifier);
    if (comparison !== 0) return comparison;
  }
  return 0;
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

export function isEligibleRelease(
  release: Pick<ReleaseRecord, "tag" | "draft" | "prerelease">,
  channel: ReleaseChannel = "stable",
): boolean {
  if (channel !== "stable" && channel !== "alpha") return false;
  if (release.draft) return false;
  const version = parseSemVer(release.tag);
  if (!version) return false;
  if (version.prerelease.length === 0) return release.prerelease === false;
  return channel === "alpha" && release.prerelease === true && version.prerelease[0] === "alpha";
}

export function selectHighestRelease(
  releases: readonly ReleaseRecord[],
  channel: ReleaseChannel = "stable",
): Result<ReleaseRecord, ResolutionError> {
  let highest: ReleaseRecord | undefined;
  let highestVersion: SemVer | undefined;
  for (const release of releases) {
    if (!isEligibleRelease(release, channel)) continue;
    const version = parseSemVer(release.tag);
    if (!version) continue;
    if (!highestVersion || compareSemVer(version, highestVersion) > 0) {
      highest = release;
      highestVersion = version;
    }
  }
  return highest
    ? { ok: true, value: highest }
    : { ok: false, error: resolutionError("ineligible", `No eligible ${channel} release was found`) };
}

export function resolveRecord(
  selector: ReleaseSelector,
  release: ReleaseRecord,
  channel: ReleaseChannel = "stable",
): Result<ResolvedRelease, ResolutionError> {
  if (!isEligibleRelease(release, channel)) {
    return { ok: false, error: resolutionError("ineligible", `Release ${release.tag} is not eligible for ${channel}`) };
  }
  if (selector.kind === "explicit" && selector.tag !== release.tag) {
    return { ok: false, error: resolutionError("exact-tag-mismatch", `Expected ${selector.tag}, got ${release.tag}`) };
  }
  return { ok: true, value: { selector, release } };
}

export function resolveReleases(
  selector: ReleaseSelector,
  releases: readonly ReleaseRecord[],
  channel: ReleaseChannel = "stable",
): Result<ResolvedRelease, ResolutionError> {
  if (selector.kind === "explicit") {
    const matching = releases.find(release => release.tag === selector.tag);
    return matching
      ? resolveRecord(selector, matching, channel)
      : { ok: false, error: resolutionError("exact-tag-mismatch", `Expected ${selector.tag}, got no matching release`) };
  }
  const highest = selectHighestRelease(releases, channel);
  return highest.ok ? resolveRecord(selector, highest.value, channel) : highest;
}
