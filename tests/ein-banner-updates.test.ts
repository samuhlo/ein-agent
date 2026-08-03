// =============================================================================
// TESTS: aviso de updates propio de Ein en el runtime pi-ein
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  collectPiEinUpdates,
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
