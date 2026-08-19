// =============================================================================
// ein update notice — runtime gate + deterministic rendering
// =============================================================================

import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { evaluateSharedConfigUpdateAdvisor, type AdvisorUpdateStatus, type InstallerAction, type SharedConfigUpdateAdvisorResult } from "./shared-config-update-advisor.ts";
import type { Evidence, StartupProvenanceRecorder } from "./startup-provenance.ts";

export type EinUpdateAvailability = {
  pi: boolean;
  ein: boolean;
};

export const UPDATE_CHECK_TIMEOUT_MS = 2_000;

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type UpdateCheckSource = () => Promise<boolean>;
export type PiEinUpdateStatus = "current" | "update-available" | "unavailable" | "unsupported" | "ambiguous" | "error" | "skipped";
export type PiEinUpdateObservation = Readonly<{
  source: "binary" | "packages" | "ein" | "claude";
  status: PiEinUpdateStatus;
  reason: string;
  freshness: "current" | "stale" | "unknown";
}>;
export type UpdateEvidenceSource = () => Promise<PiEinUpdateObservation | boolean | unknown>;

export type UpdateCheckSources = Readonly<{
  binary: UpdateCheckSource;
  packages: UpdateCheckSource;
  ein: UpdateCheckSource;
}>;
export type UpdateEvidenceSources = Readonly<{
  binary: UpdateEvidenceSource;
  packages: UpdateEvidenceSource;
  ein: UpdateEvidenceSource;
  /**
   * Optional so surfaces that have no business checking a third-party tool —
   * the Pi startup banner — keep working untouched. An absent probe yields no
   * observation at all, never an optimistic one.
   */
  claude?: UpdateEvidenceSource;
}>;

export type UpdateTimeoutScheduler = Readonly<{
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}>;

const DEFAULT_TIMEOUT_SCHEDULER: UpdateTimeoutScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

// Bounds the await, not the underlying operation: package-manager APIs do not
// expose cancellation, so a late result is deliberately ignored.
function failOpenWithin(
  source: UpdateCheckSource,
  timeoutMs: number,
  scheduler: UpdateTimeoutScheduler,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutHandle: unknown;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) scheduler.clearTimeout(timeoutHandle);
      resolve(value);
    };

    timeoutHandle = scheduler.setTimeout(() => finish(false), timeoutMs);
    void Promise.resolve()
      .then(source)
      .then(finish, () => finish(false));
  });
}

function observation(
  source: PiEinUpdateObservation["source"],
  value: unknown,
  fallbackReason: string,
): PiEinUpdateObservation {
  if (typeof value === "boolean") {
    return Object.freeze({
      source,
      status: value ? "update-available" : "unavailable",
      reason: value ? "legacy-available" : "legacy-false",
      freshness: "current",
    });
  }
  if (!value || typeof value !== "object") {
    return Object.freeze({ source, status: "error", reason: fallbackReason, freshness: "unknown" });
  }
  const candidate = value as Partial<PiEinUpdateObservation>;
  const statuses: readonly PiEinUpdateStatus[] = ["current", "update-available", "unavailable", "unsupported", "ambiguous", "error", "skipped"];
  const status = statuses.includes(candidate.status as PiEinUpdateStatus) ? candidate.status as PiEinUpdateStatus : "error";
  const freshness = candidate.freshness === "stale" || candidate.freshness === "unknown" ? candidate.freshness : "current";
  return Object.freeze({
    source,
    status,
    reason: typeof candidate.reason === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(candidate.reason) ? candidate.reason : fallbackReason,
    freshness,
  });
}

function failOpenEvidenceWithin(
  source: UpdateEvidenceSource,
  sourceName: PiEinUpdateObservation["source"],
  timeoutMs: number,
  scheduler: UpdateTimeoutScheduler,
): Promise<PiEinUpdateObservation> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutHandle: unknown;
    const finish = (value: PiEinUpdateObservation) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle !== undefined) scheduler.clearTimeout(timeoutHandle);
      resolve(value);
    };
    timeoutHandle = scheduler.setTimeout(
      () => finish({ source: sourceName, status: "unavailable", reason: "timeout", freshness: "unknown" }),
      timeoutMs,
    );
    void Promise.resolve()
      .then(source)
      .then((value) => finish(observation(sourceName, value, "malformed-evidence")), () =>
        finish({ source: sourceName, status: "error", reason: "probe-failed", freshness: "unknown" }));
  });
}

/** Status-preserving probe collection. The old boolean collector wraps this seam below. */
export async function collectPiEinUpdateEvidence(
  sources: UpdateEvidenceSources,
  options: { timeoutMs?: number; scheduler?: UpdateTimeoutScheduler } = {},
): Promise<readonly PiEinUpdateObservation[]> {
  const timeoutMs = options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
  const scheduler = options.scheduler ?? DEFAULT_TIMEOUT_SCHEDULER;
  const { claude } = sources;
  return Promise.all([
    failOpenEvidenceWithin(sources.binary, "binary", timeoutMs, scheduler),
    failOpenEvidenceWithin(sources.packages, "packages", timeoutMs, scheduler),
    failOpenEvidenceWithin(sources.ein, "ein", timeoutMs, scheduler),
    ...(claude ? [failOpenEvidenceWithin(claude, "claude", timeoutMs, scheduler)] : []),
  ]);
}

export const collectPiEinUpdatesEvidence = collectPiEinUpdateEvidence;
export const collectPiEinUpdateObservations = collectPiEinUpdateEvidence;

export function advisorResultFromPiEinUpdateObservations(
  observations: readonly PiEinUpdateObservation[],
): SharedConfigUpdateAdvisorResult {
  return evaluateSharedConfigUpdateAdvisor({ update: { observations } });
}

export type PiEinUpdateDetectorOptions = Readonly<{
  runtime?: () => boolean;
  sources?: UpdateEvidenceSources;
}>;

export async function detectPiEinUpdates(
  _cwd: string,
  options: PiEinUpdateDetectorOptions = {},
): Promise<SharedConfigUpdateAdvisorResult> {
  const runtime = options.runtime ?? (() => isPiEinRuntime());
  if (!runtime()) {
    return advisorResultFromPiEinUpdateObservations([
      { source: "binary", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
      { source: "packages", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
      { source: "ein", status: "skipped", reason: "not-isolated-runtime", freshness: "current" },
    ]);
  }
  if (!options.sources) {
    return advisorResultFromPiEinUpdateObservations([
      { source: "binary", status: "skipped", reason: "no-probe", freshness: "unknown" },
      { source: "packages", status: "skipped", reason: "no-probe", freshness: "unknown" },
      { source: "ein", status: "skipped", reason: "no-probe", freshness: "unknown" },
    ]);
  }
  return advisorResultFromPiEinUpdateObservations(await collectPiEinUpdateEvidence(options.sources));
}

/** Compatibility lives at the boundary; uncertainty never becomes current evidence. */
export function legacyAvailabilityFromEvidence(
  observations: readonly PiEinUpdateObservation[],
): EinUpdateAvailability {
  return {
    pi: observations.some((item) => (item.source === "binary" || item.source === "packages") && item.status === "update-available" && item.freshness === "current"),
    ein: observations.some((item) => item.source === "ein" && item.status === "update-available" && item.freshness === "current"),
  };
}

export const adaptPiEinUpdateEvidence = legacyAvailabilityFromEvidence;

export async function collectPiEinUpdates(
  sources: UpdateCheckSources,
  options: {
    timeoutMs?: number;
    scheduler?: UpdateTimeoutScheduler;
  } = {},
): Promise<EinUpdateAvailability> {
  const timeoutMs = options.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;
  const scheduler = options.scheduler ?? DEFAULT_TIMEOUT_SCHEDULER;
  const [binary, packages, ein] = await Promise.all([
    failOpenWithin(sources.binary, timeoutMs, scheduler),
    failOpenWithin(sources.packages, timeoutMs, scheduler),
    failOpenWithin(sources.ein, timeoutMs, scheduler),
  ]);
  return { pi: binary || packages, ein };
}

export type UpdateNoticeContext = Readonly<{
  cwd: string;
  ui: {
    notify: (message: string, level: "warning") => void;
  };
}>;

export type UpdateAvailabilityDetector = (cwd: string) => Promise<EinUpdateAvailability | SharedConfigUpdateAdvisorResult>;

export type UpdateNoticeProvenance = Readonly<{
  recorder: StartupProvenanceRecorder;
  invocationEventId: string;
  runtimeSessionIdentity: Evidence<string>;
}>;

export type RuntimeOptions = {
  env?: RuntimeEnvironment;
  home?: string;
};

/** The isolated launcher sets both runtime roots; vanilla Pi and Claude do not. */
export function isPiEinRuntime(
  env: RuntimeEnvironment = process.env,
  home = homedir(),
): boolean {
  if (env.CLAUDE_CODE || env.CLAUDE_CODE_ENTRYPOINT) return false;
  const piAgentDir = env.PI_CODING_AGENT_DIR;
  const einAgentDir = env.EIN_PI_AGENT_HOME;
  if (!piAgentDir || !einAgentDir) return false;

  const isolatedAgentDir = resolve(home, ".pi-ein", "agent");
  return resolve(piAgentDir) === isolatedAgentDir && resolve(einAgentDir) === isolatedAgentDir;
}

function recordNotificationEmission(
  message: string,
  provenance: UpdateNoticeProvenance | undefined,
): void {
  if (!provenance) return;
  try {
    const normalized = message.normalize("NFC").replace(/\r\n?/g, "\n");
    provenance.recorder.record({
      eventType: "notification-emission",
      parentEventId: provenance.invocationEventId,
      runtimeSessionIdentity: provenance.runtimeSessionIdentity,
      normalizedMessageDigest: `sha256:${createHash("sha256").update(normalized).digest("hex")}`,
    });
  } catch {
    // Diagnostics are optional and must never suppress the real notification.
  }
}

/** Start the notice without making session_start wait for update checks. */
export function startPiEinUpdateNotice(
  ctx: UpdateNoticeContext,
  detectUpdates: UpdateAvailabilityDetector,
  runtime: () => boolean = () => isPiEinRuntime(),
  renderRuntime: RuntimeOptions = {},
  provenance?: UpdateNoticeProvenance,
): void {
  try {
    if (!runtime()) return;
    void detectUpdates(ctx.cwd)
      .then((availability) => {
        const notice = "configuration" in availability
          ? renderPiEinAdvisorNotice(availability, renderRuntime)
          : renderPiEinUpdateNotice(availability, renderRuntime);
        if (notice) {
          recordNotificationEmission(notice, provenance);
          ctx.ui.notify(notice, "warning");
        }
      })
      .catch(() => {
        // Update checks are optional and must never break session startup.
      });
  } catch {
    // A synchronous detector/runtime failure is also fail-open.
  }
}

const UPDATE_COMMANDS: Readonly<Record<string, string>> = {
  binary: "- Pi binary, extensions and packages: `pi-ein update --all`",
  packages: "- Pi binary, extensions and packages: `pi-ein update --all`",
  ein: "- Ein template: `ein update`",
};

// Only install/update exist as installer commands; the other actions are diagnosed.
const HANDOFF_COMMANDS: Readonly<Record<InstallerAction, string>> = {
  install: "- Ein template: `ein install`",
  update: "- Ein template: `ein update`",
  repair: "- Ein template: `ein doctor`",
  configure: "- Ein template: `ein doctor`",
};

/**
 * Facet statuses whose evidence can still contain actionable components.
 * - `update-available`: complete evidence, all components checked.
 * - `unavailable`: incomplete evidence (one or more sources skipped), but other sources may have actionable updates.
 * - Excludes `current`, `ambiguous`, `error`, `unsupported`: either no updates available or evidence is contradictory/unrecoverable.
 */
const RENDERABLE_UPDATE_STATUSES: ReadonlySet<AdvisorUpdateStatus> = new Set(["update-available", "unavailable"]);

/**
 * Startup only observes update probes, so it renders update evidence only: claiming
 * a configuration facet it never read produced a permanent false alarm. Full advisor
 * semantics stay on the workbench surface, which does supply configuration evidence.
 * Everything except a fresh, actionable update stays silent — the probe is best-effort.
 */
export function renderPiEinAdvisorNotice(
  result: SharedConfigUpdateAdvisorResult,
  runtime: { env?: RuntimeEnvironment; home?: string } = {},
): string | null {
  if (!isPiEinRuntime(runtime.env, runtime.home)) return null;
  if (!RENDERABLE_UPDATE_STATUSES.has(result.update.status)) return null;

  // Version-comparison evidence names the installer action; probe observations name the component.
  const handoff = result.handoff;
  if (handoff?.owner === "installer" && handoff.performed === false) {
    return ["// 000. ein updates", "", HANDOFF_COMMANDS[handoff.action] ?? HANDOFF_COMMANDS.configure].join("\n");
  }

  const commands = [...new Set(
    result.update.provenance
      .filter((item) => item.quality === "update-available" && item.freshness === "current")
      .map((item) => UPDATE_COMMANDS[item.source])
      .filter((command): command is string => command !== undefined),
  )];
  if (!commands.length) return null;
  return ["// 000. ein updates", "", ...commands].join("\n");
}

export const renderPiEinUpdateAdvice = renderPiEinAdvisorNotice;

export function renderPiEinUpdateNotice(
  availability: EinUpdateAvailability,
  runtime: { env?: RuntimeEnvironment; home?: string } = {},
): string | null {
  if (!isPiEinRuntime(runtime.env, runtime.home) || (!availability.pi && !availability.ein)) {
    return null;
  }

  const lines = ["// 000. ein updates", ""];
  if (availability.pi) {
    lines.push("- Pi binary, extensions and packages: `pi-ein update --all`");
  }
  if (availability.ein) {
    lines.push("- Ein template: `ein update`");
  }
  return lines.join("\n");
}
