import { describe, expect, test } from "bun:test";

import {
  createStartupProvenanceRecorder,
  type StartupProvenanceEvent,
} from "../ein-pi/agent/lib/startup-provenance";

describe("startup provenance recorder", () => {
  test("records deterministic provenance without inventing a runtime session", () => {
    const events: StartupProvenanceEvent[] = [];
    const recorder = createStartupProvenanceRecorder({
      enabled: true,
      diagnosticRunId: "run-1",
      nextEventId: () => "event-1",
      wallClock: () => "2026-08-10T12:00:00.000Z",
      monotonicClock: () => 42,
      processIdentity: {
        state: "observed",
        value: { pid: 101, ppid: 100 },
      },
      extensionSourceIdentity: {
        state: "observed",
        value: "file:///ein-banner.ts",
      },
      sink: (event) => events.push(event),
    });

    const outcome = recorder.record({
      eventType: "load",
      parentEventId: null,
      runtimeSessionIdentity: { state: "unknown" },
    });

    const expectedEvent: StartupProvenanceEvent = {
      diagnosticRunId: "run-1",
      eventId: "event-1",
      eventType: "load",
      wallClockTimestamp: "2026-08-10T12:00:00.000Z",
      monotonicTimestamp: 42,
      processIdentity: {
        state: "observed",
        value: { pid: 101, ppid: 100 },
      },
      extensionSourceIdentity: {
        state: "observed",
        value: "file:///ein-banner.ts",
      },
      runtimeSessionIdentity: { state: "unknown" },
      parentEventId: null,
    };

    expect(outcome).toEqual({ state: "observed", event: expectedEvent });
    expect(events).toEqual([expectedEvent]);
  });

  test("emits nothing when diagnostics are disabled", () => {
    const recorder = createStartupProvenanceRecorder({ enabled: false });

    expect(
      recorder.record({
        eventType: "load",
        parentEventId: null,
        runtimeSessionIdentity: { state: "unknown" },
      }),
    ).toEqual({ state: "unavailable", reason: "disabled" });
  });

  test("keeps repeated event identities, parentage, and digest evidence independent", () => {
    const events: StartupProvenanceEvent[] = [];
    let nextId = 0;
    const recorder = createStartupProvenanceRecorder({
      enabled: true,
      diagnosticRunId: "run-2",
      nextEventId: () => `event-${++nextId}`,
      wallClock: () => "2026-08-10T12:00:01.000Z",
      monotonicClock: () => 43,
      processIdentity: {
        state: "unavailable",
        reason: "process metadata was not exposed",
      },
      extensionSourceIdentity: { state: "unknown" },
      sink: (event) => events.push(event),
    });

    recorder.record({
      eventType: "load",
      parentEventId: null,
      runtimeSessionIdentity: { state: "unknown" },
    });
    recorder.record({
      eventType: "registration",
      parentEventId: "event-1",
      runtimeSessionIdentity: { state: "unknown" },
    });
    recorder.record({
      eventType: "session_start",
      parentEventId: "event-2",
      runtimeSessionIdentity: { state: "unknown" },
      hasUI: { state: "observed", value: false },
      cliFiltered: { state: "unknown" },
    });
    recorder.record({
      eventType: "notification-emission",
      parentEventId: "event-3",
      runtimeSessionIdentity: { state: "unknown" },
      normalizedMessageDigest: "sha256:notification",
    });
    recorder.record({
      eventType: "presentation",
      parentEventId: { state: "unknown" },
      runtimeSessionIdentity: { state: "unknown" },
      normalizedOutputDigest: "sha256:presentation",
      channel: { state: "unknown" },
    });

    expect(events.map((event) => event.eventId)).toEqual([
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
    ]);
    expect(events.map((event) => event.parentEventId)).toEqual([
      null,
      "event-1",
      "event-2",
      "event-3",
      { state: "unknown" },
    ]);
    expect(events.every((event) => event.extensionSourceIdentity.state === "unknown")).toBe(
      true,
    );
    expect(events.every((event) => event.runtimeSessionIdentity.state === "unknown")).toBe(
      true,
    );
    expect(events[3]).toMatchObject({
      eventType: "notification-emission",
      normalizedMessageDigest: "sha256:notification",
    });
    expect(events[3]).not.toHaveProperty("message");
    expect(events[4]).toMatchObject({
      eventType: "presentation",
      normalizedOutputDigest: "sha256:presentation",
    });
    expect(events[4]).not.toHaveProperty("output");
  });

  test("reports a throwing side-channel sink as unavailable without throwing", () => {
    const recorder = createStartupProvenanceRecorder({
      enabled: true,
      diagnosticRunId: "run-3",
      nextEventId: () => "event-failed",
      wallClock: () => "2026-08-10T12:00:02.000Z",
      monotonicClock: () => 44,
      processIdentity: {
        state: "observed",
        value: { pid: 201, ppid: 200 },
      },
      extensionSourceIdentity: { state: "unknown" },
      sink: () => {
        throw new Error("side channel unavailable");
      },
    });
    let outcome: ReturnType<typeof recorder.record> | undefined;

    expect(() => {
      outcome = recorder.record({
        eventType: "load",
        parentEventId: null,
        runtimeSessionIdentity: { state: "unknown" },
      });
    }).not.toThrow();
    expect(outcome).toEqual({ state: "unavailable", reason: "sink-failure" });
  });
});
