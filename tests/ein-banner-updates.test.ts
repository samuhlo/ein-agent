// =============================================================================
// TESTS: aviso de updates propio de Ein en el runtime pi-ein
// =============================================================================

import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateSharedConfigUpdateAdvisor } from "../ein-pi/agent/lib/shared-config-update-advisor.ts";
import {
  createStartupProvenanceRecorder,
  type StartupProvenanceEvent,
} from "../ein-pi/agent/lib/startup-provenance.ts";

mock.module("@earendil-works/pi-coding-agent", () => ({
  DefaultPackageManager: class {},
  SettingsManager: { create: () => ({}) },
  VERSION: "0.0.0",
}));
mock.module("@earendil-works/pi-tui", () => ({
  // `Text` lo usa ein-ai para pintar los recibos de una linea de las tools.
  Text: class { constructor(public text: string) {} setText(value: string) { this.text = value; } },
  matchesKey: () => false,
  truncateToWidth: (value: string) => value,
}));

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

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function capturingProvenance(events: StartupProvenanceEvent[]) {
  let eventIndex = 0;
  return createStartupProvenanceRecorder({
    enabled: true,
    diagnosticRunId: "run-notice-correlation",
    nextEventId: () => `notice-event-${++eventIndex}`,
    wallClock: () => "2026-08-10T12:00:00.000Z",
    monotonicClock: () => eventIndex,
    processIdentity: { state: "observed", value: { pid: 101, ppid: 100 } },
    extensionSourceIdentity: { state: "observed", value: "file:///canonical/ein-banner.ts" },
    sink: (event) => events.push(event),
  });
}

function digestNotice(message: string): string {
  const normalized = message.normalize("NFC").replace(/\r\n?/g, "\n");
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

const PROVENANCE_ENV_KEYS = [
  "EIN_STARTUP_PROVENANCE",
  "EIN_STARTUP_PROVENANCE_RUN_ID",
  "EIN_STARTUP_PROVENANCE_OUTPUT",
  "EIN_STARTUP_PROVENANCE_EXTENSION_SOURCE",
] as const;

let bannerModuleNonce = 0;

type SessionStartHandler = (
  event: unknown,
  context: { hasUI: boolean },
) => Promise<void>;

type BannerExtension = (pi: {
  on: (event: "session_start", handler: SessionStartHandler) => void;
}) => void;

async function importBannerModule(label: string): Promise<BannerExtension> {
  const module = await import(
    `../ein-pi/agent/extensions/ein-banner.ts?startup-provenance-test=${label}-${++bannerModuleNonce}`
  );
  return module.default as BannerExtension;
}

function registrationProbe() {
  const registrations: Array<{
    event: "session_start";
    handler: SessionStartHandler;
  }> = [];
  return {
    registrations,
    pi: {
      on(event: "session_start", handler: SessionStartHandler) {
        registrations.push({ event, handler });
      },
    },
  };
}

function readProvenanceEvents(path: string): StartupProvenanceEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StartupProvenanceEvent);
}

async function withProvenanceEnvironment(
  values: Partial<Record<(typeof PROVENANCE_ENV_KEYS)[number], string>>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = Object.fromEntries(
    PROVENANCE_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as Record<(typeof PROVENANCE_ENV_KEYS)[number], string | undefined>;
  try {
    for (const key of PROVENANCE_ENV_KEYS) delete process.env[key];
    Object.assign(process.env, values);
    await run();
  } finally {
    for (const key of PROVENANCE_ENV_KEYS) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("ein-banner extension provenance", () => {
  test("records distinct module loads and parent-linked registrations", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ein-banner-provenance-"));
    const output = join(directory, "events.jsonl");
    try {
      await withProvenanceEnvironment({
        EIN_STARTUP_PROVENANCE: "1",
        EIN_STARTUP_PROVENANCE_RUN_ID: "run-extension-boundaries",
        EIN_STARTUP_PROVENANCE_OUTPUT: output,
        EIN_STARTUP_PROVENANCE_EXTENSION_SOURCE: "file:///canonical/ein-banner.ts",
      }, async () => {
        const firstModule = await importBannerModule("first");
        const firstProbe = registrationProbe();
        firstModule(firstProbe.pi);
        firstModule(firstProbe.pi);

        const secondModule = await importBannerModule("second");
        const secondProbe = registrationProbe();
        secondModule(secondProbe.pi);

        expect(firstProbe.registrations).toHaveLength(2);
        expect(secondProbe.registrations).toHaveLength(1);
      });

      const events = readProvenanceEvents(output);
      const loads = events.filter((event) => event.eventType === "load");
      const registrations = events.filter(
        (event) => event.eventType === "registration",
      );

      expect(loads).toHaveLength(2);
      expect(registrations).toHaveLength(3);
      expect(new Set(events.map((event) => event.eventId)).size).toBe(5);
      expect(loads.map((event) => event.parentEventId)).toEqual([null, null]);
      expect(registrations.map((event) => event.parentEventId)).toEqual([
        loads[0]?.eventId,
        loads[0]?.eventId,
        loads[1]?.eventId,
      ]);
      expect(events.every(
        (event) =>
          event.diagnosticRunId === "run-extension-boundaries" &&
          event.runtimeSessionIdentity.state === "unknown" &&
          event.extensionSourceIdentity.state === "observed" &&
          event.processIdentity.state === "observed" &&
          event.processIdentity.value.pid === process.pid &&
          event.processIdentity.value.ppid === process.ppid,
      )).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("records every session entry with filter observations and its registration parent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ein-banner-invocations-"));
    const output = join(directory, "events.jsonl");
    const originalArgv = [...process.argv];
    try {
      await withProvenanceEnvironment({
        EIN_STARTUP_PROVENANCE: "1",
        EIN_STARTUP_PROVENANCE_RUN_ID: "run-session-entries",
        EIN_STARTUP_PROVENANCE_OUTPUT: output,
      }, async () => {
        const extension = await importBannerModule("session-entries");
        const probe = registrationProbe();
        extension(probe.pi);
        const handler = probe.registrations[0]!.handler;

        process.argv.splice(0, process.argv.length, "/usr/bin/bun", "ein-banner.ts");
        await expect(handler({}, { hasUI: false })).resolves.toBeUndefined();

        process.argv.push("update");
        await expect(handler({}, { hasUI: true })).resolves.toBeUndefined();
      });

      const events = readProvenanceEvents(output);
      const registration = events.find((event) => event.eventType === "registration");
      const invocations = events.filter((event) => event.eventType === "session_start");

      expect(registration).toBeDefined();
      expect(invocations).toHaveLength(2);
      expect(new Set(invocations.map((event) => event.eventId)).size).toBe(2);
      expect(invocations.map((event) => event.parentEventId)).toEqual([
        registration!.eventId,
        registration!.eventId,
      ]);
      expect(invocations).toEqual([
        expect.objectContaining({
          hasUI: { state: "observed", value: false },
          cliFiltered: { state: "observed", value: false },
          runtimeSessionIdentity: { state: "unknown" },
        }),
        expect.objectContaining({
          hasUI: { state: "observed", value: true },
          cliFiltered: { state: "observed", value: true },
          runtimeSessionIdentity: { state: "unknown" },
        }),
      ]);
    } finally {
      process.argv.splice(0, process.argv.length, ...originalArgv);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("keeps registration and the no-UI startup path unchanged when disabled", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ein-banner-disabled-"));
    const output = join(directory, "events.jsonl");
    try {
      await withProvenanceEnvironment({
        EIN_STARTUP_PROVENANCE_OUTPUT: output,
      }, async () => {
        const extension = await importBannerModule("disabled");
        const probe = registrationProbe();

        extension(probe.pi);

        expect(probe.registrations.map(({ event }) => event)).toEqual([
          "session_start",
        ]);
        await expect(
          probe.registrations[0]!.handler({}, { hasUI: false }),
        ).resolves.toBeUndefined();
      });
      expect(existsSync(output)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("keeps source evidence unknown and startup registration alive when the sink fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "ein-banner-failed-sink-"));
    const output = join(directory, "events.jsonl");
    try {
      await withProvenanceEnvironment({
        EIN_STARTUP_PROVENANCE: "1",
        EIN_STARTUP_PROVENANCE_RUN_ID: "run-failed-sink",
        EIN_STARTUP_PROVENANCE_OUTPUT: output,
      }, async () => {
        const extension = await importBannerModule("failed-sink");
        const loadEvents = readProvenanceEvents(output);
        expect(loadEvents).toHaveLength(1);
        expect(loadEvents[0]).toMatchObject({
          eventType: "load",
          extensionSourceIdentity: { state: "unknown" },
        });

        const retainedEvidence = join(directory, "retained-events.jsonl");
        renameSync(output, retainedEvidence);
        mkdirSync(output);
        const probe = registrationProbe();

        expect(() => extension(probe.pi)).not.toThrow();
        expect(probe.registrations).toHaveLength(1);
        expect(readProvenanceEvents(retainedEvidence)).toEqual(loadEvents);
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

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
        "// 000. ein updates",
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
    expect(rendered).toBe(["// 000. ein updates", "", "- Ein template: `ein update`"].join("\n"));
    expect(rendered).not.toContain("Configuration:");
    expect(rendered).not.toContain("pi-ein update --all");
  });

  test("renders an actionable component even when the aggregate facet is unavailable", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      update: {
        observations: [
          { status: "update-available", source: "ein", reason: "newer-release", freshness: "current" },
          { status: "current", source: "binary", reason: "read-success", freshness: "current" },
          { status: "skipped", source: "packages", reason: "offline", freshness: "current" },
        ],
      },
    });
    expect(result.update.status).toBe("unavailable");
    const rendered = renderPiEinAdvisorNotice(result, { env: PI_EIN_ENV, home: HOME });
    expect(rendered).toBe(["// 000. ein updates", "", "- Ein template: `ein update`"].join("\n"));
  });

  for (const [status, reason] of [
    ["ambiguous", "ambiguous-evidence"],
    ["error", "invalid-evidence"],
    ["unsupported", "unsupported"],
  ] as const) {
    test(`stays silent when the aggregate facet is ${status}, even with an actionable component`, () => {
      const observations = [
        { status: "update-available", source: "ein", reason: "newer-release", freshness: "current" },
        { status, source: "binary", reason, freshness: "current" },
      ] as const;
      const result = evaluateSharedConfigUpdateAdvisor({ update: { observations } });
      expect(result.update.status).toBe(status);
      expect(renderPiEinAdvisorNotice(result, { env: PI_EIN_ENV, home: HOME })).toBeNull();
    });
  }

  test("stays silent when the aggregate facet is current, by construction and by intent", () => {
    const result = evaluateSharedConfigUpdateAdvisor({
      update: {
        observations: [
          { status: "current", source: "binary", reason: "read-success", freshness: "current" },
          { status: "current", source: "packages", reason: "read-success", freshness: "current" },
        ],
      },
    });
    expect(result.update.status).toBe("current");
    expect(renderPiEinAdvisorNotice(result, { env: PI_EIN_ENV, home: HOME })).toBeNull();
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

  test("keeps overlapping notice work linked and records each emission before notify", async () => {
    const events: StartupProvenanceEvent[] = [];
    const recorder = capturingProvenance(events);
    const first = deferred<{ pi: boolean; ein: boolean }>();
    const second = deferred<{ pi: boolean; ein: boolean }>();
    const notifications: Array<{
      message: string;
      precedingEvent: StartupProvenanceEvent | undefined;
    }> = [];
    const context = {
      cwd: "/tmp/project",
      ui: {
        notify(message: string) {
          notifications.push({ message, precedingEvent: events.at(-1) });
        },
      },
    };

    startPiEinUpdateNotice(
      context,
      () => first.promise,
      () => true,
      { env: PI_EIN_ENV, home: HOME },
      {
        recorder,
        invocationEventId: "invocation-first",
        runtimeSessionIdentity: { state: "unknown" },
      },
    );
    startPiEinUpdateNotice(
      context,
      () => second.promise,
      () => true,
      { env: PI_EIN_ENV, home: HOME },
      {
        recorder,
        invocationEventId: "invocation-second",
        runtimeSessionIdentity: { state: "unknown" },
      },
    );

    second.resolve({ pi: false, ein: true });
    await flushChecks();
    first.resolve({ pi: true, ein: false });
    await flushChecks();

    const emissions = events.filter((event) => event.eventType === "notification-emission");
    expect(emissions).toHaveLength(2);
    expect(new Set(emissions.map((event) => event.eventId)).size).toBe(2);
    expect(emissions.map((event) => event.parentEventId)).toEqual([
      "invocation-second",
      "invocation-first",
    ]);
    expect(emissions.map((event) => event.runtimeSessionIdentity)).toEqual([
      { state: "unknown" },
      { state: "unknown" },
    ]);
    expect(emissions.map((event) => event.normalizedMessageDigest)).toEqual(
      notifications.map(({ message }) => digestNotice(message)),
    );
    expect(notifications.map(({ precedingEvent }) => precedingEvent?.eventId)).toEqual(
      emissions.map((event) => event.eventId),
    );
  });

  test("does not synthesize emissions for detector failure or timeout", async () => {
    const events: StartupProvenanceEvent[] = [];
    const recorder = capturingProvenance(events);
    const notifications: string[] = [];
    const context = {
      cwd: "/tmp/project",
      ui: { notify: (message: string) => notifications.push(message) },
    };
    const provenance = {
      recorder,
      invocationEventId: "invocation-unavailable",
      runtimeSessionIdentity: { state: "unknown" } as const,
    };

    expect(() =>
      startPiEinUpdateNotice(
        context,
        () => Promise.reject(new Error("update service unavailable")),
        () => true,
        { env: PI_EIN_ENV, home: HOME },
        provenance,
      ),
    ).not.toThrow();
    await flushChecks();

    const { timers, scheduler } = createManualScheduler();
    startPiEinUpdateNotice(
      context,
      () => collectPiEinUpdates({
        binary: () => new Promise<boolean>(() => {}),
        packages: () => Promise.resolve(false),
        ein: () => Promise.resolve(false),
      }, { scheduler }),
      () => true,
      { env: PI_EIN_ENV, home: HOME },
      provenance,
    );
    await flushChecks();
    for (const timer of timers) if (!timer.cancelled) timer.callback();
    await flushChecks();

    expect(notifications).toEqual([]);
    expect(events).toEqual([]);
  });

  test("keeps the real notification when provenance recording is unavailable", async () => {
    const unavailableOutcomes: unknown[] = [];
    const failingRecorder = createStartupProvenanceRecorder({
      enabled: true,
      diagnosticRunId: "run-failed-emission-sink",
      nextEventId: () => "unretained-emission",
      wallClock: () => "2026-08-10T12:00:00.000Z",
      monotonicClock: () => 1,
      processIdentity: { state: "observed", value: { pid: 101, ppid: 100 } },
      extensionSourceIdentity: { state: "unknown" },
      sink: () => {
        throw new Error("diagnostic sink unavailable");
      },
    });
    const recorder = {
      record: (...args: Parameters<typeof failingRecorder.record>) => {
        const outcome = failingRecorder.record(...args);
        unavailableOutcomes.push(outcome);
        return outcome;
      },
    };
    const notifications: string[] = [];

    startPiEinUpdateNotice(
      {
        cwd: "/tmp/project",
        ui: { notify: (message: string) => notifications.push(message) },
      },
      async () => ({ pi: false, ein: true }),
      () => true,
      { env: PI_EIN_ENV, home: HOME },
      {
        recorder,
        invocationEventId: "invocation-failed-sink",
        runtimeSessionIdentity: { state: "unknown" },
      },
    );
    await flushChecks();

    expect(notifications).toEqual([
      ["// 000. ein updates", "", "- Ein template: `ein update`"].join("\n"),
    ]);
    expect(unavailableOutcomes).toEqual([
      { state: "unavailable", reason: "sink-failure" },
    ]);
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
    expect(notifications[0]).toBe(["// 000. ein updates", "", "- Ein template: `ein update`"].join("\n"));
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
          "// 000. ein updates",
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
