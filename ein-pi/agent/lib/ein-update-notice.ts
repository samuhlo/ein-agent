// =============================================================================
// EIN UPDATE NOTICE — runtime gate + deterministic rendering
// =============================================================================

import { homedir } from "node:os";
import { resolve } from "node:path";

export type EinUpdateAvailability = {
  pi: boolean;
  ein: boolean;
};

export const UPDATE_CHECK_TIMEOUT_MS = 2_000;

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export type UpdateCheckSource = () => Promise<boolean>;

export type UpdateCheckSources = Readonly<{
  binary: UpdateCheckSource;
  packages: UpdateCheckSource;
  ein: UpdateCheckSource;
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

export type UpdateAvailabilityDetector = (cwd: string) => Promise<EinUpdateAvailability>;

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
        const notice = renderPiEinUpdateNotice(availability, renderRuntime);
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
