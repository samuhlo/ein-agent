// =============================================================================
// TESTS: aviso de updates propio de Ein en el runtime pi-ein
// =============================================================================

import { describe, expect, test } from "bun:test";
import { evaluateSharedConfigUpdateAdvisor } from "../ein-pi/agent/lib/shared-config-update-advisor.ts";
import {
  collectPiEinUpdates,
  collectPiEinUpdateEvidence,
  detectPiEinUpdates,
  legacyAvailabilityFromEvidence,
  renderPiEinAdvisorNotice,
  isPiEinRuntime,
  renderPiEinUpdateNotice,
  startPiEinUpdateNotice,
  UPDATE_CHECK_TIMEOUT_MS,
} from "../ein-pi/agent/lib/ein-update-notice";

const HOME = "/tmp/ein-banner-home";
const PI_EIN_ENV = {
  PI_CODING_AGENT_DIR: `${HOME}/.pi-ein/agent`,
  EIN_PI_AGENT_HOME: `${HOME}/.pi-ein/agent`,
};

type ManualTimer = {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
};

function createManualScheduler() {
  const timers: ManualTimer[] = [];
  return {
    timers,
    scheduler: {
      setTimeout(callback: () => void, delayMs: number) {
        const timer = { callback, delayMs, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout(handle: unknown) {
        (handle as ManualTimer).cancelled = true;
      },
    },
  };
}

async function flushChecks(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("pi-ein update notice", () => {
  test("detects the isolated launcher runtime, not vanilla Pi", () => {
    expect(isPiEinRuntime(PI_EIN_ENV, HOME)).toBe(true);
    expect(isPiEinRuntime({ ...PI_EIN_ENV, CLAUDE_CODE: "1" }, HOME)).toBe(false);
    expect(
      isPiEinRuntime(
        {
          PI_CODING_AGENT_DIR: `${HOME}/.pi/agent`,
          EIN_PI_AGENT_HOME: `${HOME}/.pi/agent`,
        },
        HOME,
      ),
    ).toBe(false);
    expect(isPiEinRuntime({}, HOME)).toBe(false);
  });

  test("renders exact pi-ein and Ein commands when both updates are available", () => {
    expect(
      renderPiEinUpdateNotice(
        { pi: true, ein: true },
        { env: PI_EIN_ENV, home: HOME },
      ),
    ).toBe(
      [
        "/// 000. EIN UPDATES",
        "",
        "- Pi binary, extensions and packages: `pi-ein update --all`",
        "- Ein template: `ein update`",
      ].join("\n"),
    );
  });

  test("does not emit the pi-ein notice for vanilla or without updates", () => {
    expect(
      renderPiEinUpdateNotice(
        { pi: true, ein: true },
        { env: {}, home: HOME },
      ),
    ).toBeNull();
    expect(
      renderPiEinUpdateNotice(
        { pi: false, ein: false },
        { env: PI_EIN_ENV, home: HOME },
      ),
    ).toBeNull();
    expect(
      renderPiEinUpdateNotice(
        { pi: true, ein: false },
        { env: PI_EIN_ENV, home: HOME },
      ),
    ).toContain("`pi-ein update --all`");
    expect(
      renderPiEinUpdateNotice(
        { pi: true, ein: false },
        { env: PI_EIN_ENV, home: HOME },
      ),
    ).not.toContain("`ein update`");
  });

  test("fails open when a source fails or exceeds the two-second bound", async () => {
    let resolvePackages!: (available: boolean) => void;
    const packages = new Promise<boolean>((resolve) => {
      resolvePackages = resolve;
    });
    const { timers, scheduler } = createManualScheduler();
    const availabilityPromise = collectPiEinUpdates(
      {
        binary: () => Promise.reject(new Error("binary unavailable")),
        packages: () => packages,
        ein: () => Promise.resolve(true),
      },
      { scheduler },
    );

    await flushChecks();
    expect(timers).toHaveLength(3);
    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1);
    expect(timers.find((timer) => !timer.cancelled)?.delayMs).toBe(UPDATE_CHECK_TIMEOUT_MS);

    for (const timer of timers) {
      if (!timer.cancelled) timer.callback();
    }
    await expect(availabilityPromise).resolves.toEqual({ pi: false, ein: true });

    resolvePackages(true);
    await flushChecks();
    expect(await availabilityPromise).toEqual({ pi: false, ein: true });
  });

  test("preserves timeout, rejection, malformed and skipped evidence without treating false as current", async () => {
    const { timers, scheduler } = createManualScheduler();
    const pending = new Promise<boolean>(() => {});
    const observationsPromise = collectPiEinUpdateEvidence({
      binary: () => Promise.reject(new Error("private-token")),
      packages: () => pending,
      ein: () => Promise.resolve({ status: "skipped", reason: "offline", freshness: "current" }),
    }, { scheduler });
    await flushChecks();
    for (const timer of timers) if (!timer.cancelled) timer.callback();
    const observations = await observationsPromise;
    expect(observations).toEqual([
      { source: "binary", status: "error", reason: "probe-failed", freshness: "unknown" },
      { source: "packages", status: "unavailable", reason: "timeout", freshness: "unknown" },
      { source: "ein", status: "skipped", reason: "offline", freshness: "current" },
    ]);
    expect(JSON.stringify(observations)).not.toContain("private-token");
  });

  test("stays silent when stale evidence never became an actionable update", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "valid", source: "project\u001b[2J", value: "solo", freshness: "current" },
        model: { status: "valid", source: "user", value: "configured", reason: "private\r", freshness: "current" },
      },
      update: {
        installed: { status: "valid", source: "installer-marker", version: "0.42.0", freshness: "current" },
        release: { status: "valid", source: "release-provider", version: "0.43.0", freshness: "stale" },
        owner: { status: "valid", source: "installer-marker", owner: "installer", action: "update", actionId: "installer.update", freshness: "current" },
        capability: { status: "valid", source: "installer-capability", supported: true, freshness: "current" },
      },
    });
    expect(result.update.status).toBe("unavailable");
    expect(renderPiEinAdvisorNotice(result, { env: PI_EIN_ENV, home: HOME })).toBeNull();
  });

  test("startup notice renders actionable commands and never claims unread configuration", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      update: {
        observations: [
          { status: "current", source: "binary", reason: "read-success", freshness: "current" },
          { status: "current", source: "packages", reason: "read-success", freshness: "current" },
          { status: "update-available", source: "ein", reason: "newer-release", freshness: "current" },
        ],
      },
    });
    const rendered = renderPiEinAdvisorNotice(result, { env: PI_EIN_ENV, home: HOME });
    expect(rendered).toBe(["/// 000. EIN UPDATES", "", "- Ein template: `ein update`"].join("\n"));
    expect(rendered).not.toContain("Configuration:");
    expect(rendered).not.toContain("pi-ein update --all");
  });

  test("an update with no ownership handoff is a read gap, not a healthy no-op", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      update: {
        observations: [
          { status: "update-available", source: "ein", reason: "newer-release", freshness: "current" },
        ],
      },
    });
    expect(result.handoff).toBeUndefined();
    expect(result.recommendation.kind).toBe("retry-read");
    expect(result.recommendation.reason).toBe("missing-handoff");
  });

  test("production detector preserves canonical observation status, provenance, and freshness until rendering", async () => {
    const result = await detectPiEinUpdates("/tmp/project", {
      runtime: () => true,
      sources: {
        binary: async () => ({ source: "binary", status: "update-available", reason: "newer-release", freshness: "current" }),
        packages: async () => ({ source: "packages", status: "current", reason: "read-success", freshness: "current" }),
        ein: async () => ({ source: "ein", status: "unavailable", reason: "offline", freshness: "unknown" }),
      },
    });
    expect(result.update.status).toBe("unavailable");
    expect(result.update.freshness).toBe("unknown");
    expect(result.update.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "binary", quality: "update-available" }),
      expect.objectContaining({ source: "ein", freshness: "unknown" }),
    ]));
    expect(result.handoff).toBeUndefined();
  });

  test("keeps legacy booleans at the edge without mapping uncertainty to current", () => {
    expect(legacyAvailabilityFromEvidence([
      { source: "binary", status: "error", reason: "probe-failed", freshness: "unknown" },
      { source: "packages", status: "current", reason: "read-success", freshness: "current" },
      { source: "ein", status: "update-available", reason: "newer-release", freshness: "current" },
    ])).toEqual({ pi: false, ein: true });
  });

  test("swallows detector failure without breaking session start", async () => {
    const notifications: string[] = [];
    const context = {
      cwd: "/tmp/project",
      ui: { notify: (message: string) => notifications.push(message) },
    };

    expect(() =>
      startPiEinUpdateNotice(
        context,
        () => Promise.reject(new Error("update service unavailable")),
        () => true,
      ),
    ).not.toThrow();
    await flushChecks();
    expect(notifications).toEqual([]);
  });

  test("accepts the canonical advisor result at the notice boundary", async () => {
    const notifications: string[] = [];
    const result = evaluateSharedConfigUpdateAdvisor({
      configuration: {
        mode: { status: "valid", source: "project", value: "solo", freshness: "current" },
        model: { status: "valid", source: "user", value: "configured", freshness: "current" },
      },
      update: {
        installed: { status: "valid", source: "installer-marker", version: "0.42.0", freshness: "current" },
        release: { status: "valid", source: "release-provider", version: "0.43.0", freshness: "current" },
        owner: { status: "valid", source: "installer-marker", owner: "installer", action: "update", actionId: "installer.update", freshness: "current" },
        capability: { status: "valid", source: "installer-capability", supported: true, freshness: "current" },
      },
    });
    startPiEinUpdateNotice({ cwd: "/tmp/project", ui: { notify: message => notifications.push(message) } }, async () => result, () => true, { env: PI_EIN_ENV, home: HOME });
    await flushChecks();
    expect(notifications[0]).toBe(["/// 000. EIN UPDATES", "", "- Ein template: `ein update`"].join("\n"));
  });

  test("notifies exactly once with exact commands in isolated pi-ein", async () => {
    const notifications: Array<{ message: string; level: string }> = [];
    const context = {
      cwd: "/tmp/project",
      ui: {
        notify: (message: string, level: "warning") => notifications.push({ message, level }),
      },
    };
    const { scheduler } = createManualScheduler();
    let detectorCalls = 0;

    startPiEinUpdateNotice(
      context,
      () => {
        detectorCalls++;
        return collectPiEinUpdates(
          {
            binary: () => Promise.resolve(true),
            packages: () => Promise.resolve(false),
            ein: () => Promise.resolve(true),
          },
          { scheduler },
        );
      },
      () => isPiEinRuntime(PI_EIN_ENV, HOME),
      { env: PI_EIN_ENV, home: HOME },
    );
    await flushChecks();

    expect(detectorCalls).toBe(1);
    expect(notifications).toEqual([
      {
        message: [
          "/// 000. EIN UPDATES",
          "",
          "- Pi binary, extensions and packages: `pi-ein update --all`",
          "- Ein template: `ein update`",
        ].join("\n"),
        level: "warning",
      },
    ]);

    let vanillaCalls = 0;
    const vanillaNotifications: string[] = [];
    startPiEinUpdateNotice(
      {
        cwd: "/tmp/project",
        ui: { notify: (message: string) => vanillaNotifications.push(message) },
      },
      () => {
        vanillaCalls++;
        return Promise.resolve({ pi: true, ein: true });
      },
      () => isPiEinRuntime({}, HOME),
      { env: {}, home: HOME },
    );
    await flushChecks();
    expect(vanillaCalls).toBe(0);
    expect(vanillaNotifications).toEqual([]);
  });
});
