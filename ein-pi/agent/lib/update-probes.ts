// =============================================================================
// UPDATE PROBES — portable version checks, no SDK dependency
// Lives in lib/ so it loads under any runtime (Pi extension or Claude Code
// launcher). Local facts (installed version, agent dir) are injected as
// parameters instead of read from the SDK, which only extensions can import.
// =============================================================================

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  collectPiEinUpdateEvidence,
  UPDATE_CHECK_TIMEOUT_MS,
  type PiEinUpdateObservation,
  type UpdateEvidenceSources,
  type UpdateTimeoutScheduler,
} from "./ein-update-notice.ts";

export type FetchLike = typeof fetch;

function updateObservation(
  source: PiEinUpdateObservation["source"],
  status: PiEinUpdateObservation["status"],
  reason: string,
  freshness: PiEinUpdateObservation["freshness"] = "current",
): PiEinUpdateObservation {
  return { source, status, reason, freshness };
}

export function parseVersion(value: string): [number, number, number] | undefined {
  const match = /(?:^|v|installer-v)(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  // Destructured rather than index-looped: a variable index widens the tuple
  // element to `| undefined` under noUncheckedIndexedAccess.
  const [nextMajor, nextMinor, nextPatch] = next;
  const [major, minor, patch] = installed;
  if (nextMajor !== major) return nextMajor > major;
  if (nextMinor !== minor) return nextMinor > minor;
  return nextPatch > patch;
}

/** Fail-closed: without an injected version there is nothing to compare against. */
export async function checkPiBinaryUpdate(
  installedVersion?: string,
  fetchFn: FetchLike = fetch,
): Promise<PiEinUpdateObservation> {
  if (!installedVersion) return updateObservation("binary", "skipped", "installed-version-unavailable", "unknown");
  try {
    const response = await fetchFn("https://pi.dev/api/latest-version", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return updateObservation("binary", "unavailable", "provider-unavailable", "unknown");
    const payload = (await response.json()) as { version?: unknown };
    if (typeof payload.version !== "string") return updateObservation("binary", "error", "malformed-response", "unknown");
    return updateObservation("binary", isNewerVersion(payload.version, installedVersion) ? "update-available" : "current", "read-success");
  } catch {
    return updateObservation("binary", "error", "probe-failed", "unknown");
  }
}

/** Ein version from the installer marker; "dev" when deployed by hand. */
export async function readEinVersion(agentDir: string): Promise<string> {
  try {
    const raw = await readFile(join(agentDir, ".ein-install.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version ? `v${parsed.version}` : "dev";
  } catch {
    return "dev";
  }
}

/** Fail-closed: without an injected version there is nothing to compare against. */
export async function checkEinTemplateUpdate(
  installedVersion?: string,
  fetchFn: FetchLike = fetch,
): Promise<PiEinUpdateObservation> {
  if (!installedVersion) return updateObservation("ein", "skipped", "installed-version-unavailable", "unknown");
  if (installedVersion === "dev") return updateObservation("ein", "skipped", "development-install", "unknown");
  try {
    const repository = process.env.EIN_INSTALLER_REPO ?? "samuhlo/ein-agent";
    const response = await fetchFn(`https://api.github.com/repos/${repository}/releases/latest`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return updateObservation("ein", "unavailable", "provider-unavailable", "unknown");
    const payload = (await response.json()) as { tag_name?: unknown };
    if (typeof payload.tag_name !== "string") return updateObservation("ein", "error", "malformed-response", "unknown");
    return updateObservation("ein", isNewerVersion(payload.tag_name, installedVersion) ? "update-available" : "current", "read-success");
  } catch {
    return updateObservation("ein", "error", "probe-failed", "unknown");
  }
}

/**
 * Installed Pi version without importing the SDK. `ein-banner.ts` reads it from
 * the SDK's `VERSION`, which only extensions can import; the launcher is a
 * standalone process, so it reads the same fact from the package manifest on
 * disk. Candidate paths are injected to keep this testable and to allow layouts
 * other than a Bun global install.
 */
export function defaultPiManifestPaths(home: string): readonly string[] {
  return [
    join(home, ".bun", "install", "global", "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
  ];
}

export async function readPiBinaryVersion(
  candidates: readonly string[],
): Promise<string | undefined> {
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version) return parsed.version;
    } catch {
      // Try the next layout; a missing or unreadable manifest is not an error
      // here — exhausting every candidate is what makes the source unverifiable.
    }
  }
  return undefined;
}

/** Bounded process boundary, injected so tests never spawn anything real. */
export type VersionProbeRunner = (
  input: Readonly<{ file: string; args: readonly string[]; timeoutMs: number; maxBuffer: number }>,
) => Promise<Readonly<{ stdout: string; exitCode: number }>>;

/** Strictly below the collector budget: the collector bounds the wait, not the process. */
export const CLAUDE_VERSION_TIMEOUT_MS = 1_500;
const CLAUDE_VERSION_MAX_BUFFER = 64 * 1_024;

export const CLAUDE_UPDATE_COMMAND = "claude update";

/**
 * Claude Code publishes no version file, so the installed version costs a
 * bounded spawn. Availability is deliberately never asserted: the only
 * documented check (`claude update`) installs as part of checking, so the
 * launcher would have to mutate the machine to find out. Declaring ignorance
 * beats inventing a release endpoint.
 */
export async function checkClaudeCodeUpdate(
  run: VersionProbeRunner,
  executable = "claude",
): Promise<PiEinUpdateObservation> {
  let result: Awaited<ReturnType<VersionProbeRunner>>;
  try {
    result = await run({
      file: executable,
      args: ["--version"],
      timeoutMs: CLAUDE_VERSION_TIMEOUT_MS,
      maxBuffer: CLAUDE_VERSION_MAX_BUFFER,
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ENOENT") return updateObservation("claude", "skipped", "executable-not-found", "unknown");
    if (code === "ETIMEDOUT") return updateObservation("claude", "unavailable", "probe-timeout", "unknown");
    return updateObservation("claude", "error", "probe-failed", "unknown");
  }
  if (result.exitCode !== 0) return updateObservation("claude", "error", "probe-failed", "unknown");
  if (!parseVersion(result.stdout)) return updateObservation("claude", "error", "malformed-response", "unknown");
  // Installed version is known; availability is not, and must never be guessed.
  return updateObservation("claude", "unavailable", "availability-not-verifiable", "unknown");
}

export type UpdateEvidenceSnapshot = Readonly<{
  /** Synchronous, non-blocking: resolved observations, or `undefined` while pending. */
  read(): readonly PiEinUpdateObservation[] | undefined;
}>;

export type UpdateEvidenceSnapshotOptions = Readonly<{
  timeoutMs?: number;
  scheduler?: UpdateTimeoutScheduler;
}>;

/**
 * Starts the three probes in parallel at construction time (the edge) and
 * returns a snapshot whose `read()` never awaits. If the probes have not
 * settled yet, `read()` returns `undefined` so callers declare "pending"
 * instead of blocking the interactive flow.
 */
export function startUpdateEvidenceSnapshot(
  sources: UpdateEvidenceSources,
  options: UpdateEvidenceSnapshotOptions = {},
): UpdateEvidenceSnapshot {
  let resolved: readonly PiEinUpdateObservation[] | undefined;
  void collectPiEinUpdateEvidence(sources, options).then((observations) => {
    resolved = observations;
  });
  return Object.freeze({
    read: () => resolved,
  });
}
