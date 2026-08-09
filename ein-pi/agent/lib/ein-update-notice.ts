// =============================================================================
// EIN UPDATE NOTICE — runtime gate + deterministic rendering
// =============================================================================

import { homedir } from "node:os";
import { resolve } from "node:path";
import { evaluateSharedConfigUpdateAdvisor, renderAdvisorSemantics, type SharedConfigUpdateAdvisorResult } from "./shared-config-update-advisor.ts";

export type EinUpdateAvailability = {
  pi: boolean;
  ein: boolean;
};

export const UPDATE_CHECK_TIMEOUT_MS = 2_000;

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type UpdateCheckSource = () => Promise<boolean>;
export type PiEinUpdateStatus = "current" | "update-available" | "unavailable" | "unsupported" | "ambiguous" | "error" | "skipped";
export type PiEinUpdateObservation = Readonly<{
  source: "binary" | "packages" | "ein";
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
  return Promise.all([
    failOpenEvidenceWithin(sources.binary, "binary", timeoutMs, scheduler),
    failOpenEvidenceWithin(sources.packages, "packages", timeoutMs, scheduler),
    failOpenEvidenceWithin(sources.ein, "ein", timeoutMs, scheduler),
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

/** Start the notice without making session_start wait for update checks. */
export function startPiEinUpdateNotice(
  ctx: UpdateNoticeContext,
  detectUpdates: UpdateAvailabilityDetector,
  runtime: () => boolean = () => isPiEinRuntime(),
  renderRuntime: RuntimeOptions = {},
): void {
  try {
    if (!runtime()) return;
    void detectUpdates(ctx.cwd)
      .then((availability) => {
        const notice = "configuration" in availability
          ? renderPiEinAdvisorNotice(availability, renderRuntime)
          : renderPiEinUpdateNotice(availability, renderRuntime);
        if (notice) ctx.ui.notify(notice, "warning");
      })
      .catch(() => {
        // Update checks are optional and must never break session startup.
      });
  } catch {
    // A synchronous detector/runtime failure is also fail-open.
  }
}

/** Render only Ein's own notice; Pi's native update message remains untouched. */
export function renderPiEinAdvisorNotice(
  result: SharedConfigUpdateAdvisorResult,
  runtime: { env?: RuntimeEnvironment; home?: string } = {},
): string | null {
  if (!isPiEinRuntime(runtime.env, runtime.home)) return null;
  if (result.update.status === "current") return null;
  return ["/// 000. EIN ADVISOR", "", renderAdvisorSemantics(result)].join("\n");
}

export const renderPiEinUpdateAdvice = renderPiEinAdvisorNotice;

export function renderPiEinUpdateNotice(
  availability: EinUpdateAvailability,
  runtime: { env?: RuntimeEnvironment; home?: string } = {},
): string | null {
  if (!isPiEinRuntime(runtime.env, runtime.home) || (!availability.pi && !availability.ein)) {
    return null;
  }

  const lines = ["/// 000. EIN UPDATES", ""];
  if (availability.pi) {
    lines.push("- Pi binary, extensions and packages: `pi-ein update --all`");
  }
  if (availability.ein) {
    lines.push("- Ein template: `ein update`");
  }
  return lines.join("\n");
}
