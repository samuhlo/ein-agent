import { describe, expect, test } from "bun:test";

import {
  classifyStartupProvenance,
  summarizeStartupProvenance,
} from "../ein-pi/agent/lib/startup-provenance-classifier";
import type {
  StartupProvenanceEvent,
  StartupProvenanceEventDetails,
} from "../ein-pi/agent/lib/startup-provenance";

const RUN_ID = "run-1";
const SOURCE_ID = "file:///ein-banner.ts";
const REFERENCE_TIME = "2026-08-10T12:00:10.000Z";

const classificationOptions = {
  diagnosticRunId: RUN_ID,
  referenceWallClockTimestamp: REFERENCE_TIME,
  maximumEvidenceAgeMs: 60_000,
} as const;

type Multiplicity = {
  readonly loads?: number;
  readonly registrationsPerLoad?: number;
  readonly invocationsPerRegistration?: number;
  readonly emissionsPerInvocation?: number;
  readonly presentationsPerEmission?: number;
};

function completeTrace(multiplicity: Multiplicity = {}): StartupProvenanceEvent[] {
  const events: StartupProvenanceEvent[] = [];
  let sequence = 0;
  let registrationSequence = 0;
  let invocationSequence = 0;
  let emissionSequence = 0;
  let presentationSequence = 0;

  const add = (details: StartupProvenanceEventDetails): StartupProvenanceEvent => {
    sequence += 1;
    const event: StartupProvenanceEvent = {
      diagnosticRunId: RUN_ID,
      eventId: `${details.eventType}-${sequence}`,
      wallClockTimestamp: "2026-08-10T12:00:00.000Z",
      monotonicTimestamp: sequence,
      processIdentity: { state: "observed", value: { pid: 101, ppid: 100 } },
      extensionSourceIdentity: { state: "observed", value: SOURCE_ID },
      ...details,
    };
    events.push(event);
    return event;
  };

  for (let loadIndex = 0; loadIndex < (multiplicity.loads ?? 1); loadIndex += 1) {
    const load = add({
      eventType: "load",
      parentEventId: null,
      runtimeSessionIdentity: { state: "observed", value: "session-1" },
    });

    for (
      let registrationIndex = 0;
      registrationIndex < (multiplicity.registrationsPerLoad ?? 1);
      registrationIndex += 1
    ) {
      registrationSequence += 1;
      const registration = add({
        eventType: "registration",
        parentEventId: load.eventId,
        runtimeSessionIdentity: { state: "observed", value: "session-1" },
      });

      for (
        let invocationIndex = 0;
        invocationIndex < (multiplicity.invocationsPerRegistration ?? 1);
        invocationIndex += 1
      ) {
        invocationSequence += 1;
        const invocation = add({
          eventType: "session_start",
          parentEventId: registration.eventId,
          runtimeSessionIdentity: { state: "observed", value: "session-1" },
          hasUI: { state: "observed", value: true },
          cliFiltered: { state: "observed", value: false },
        });

        for (
          let emissionIndex = 0;
          emissionIndex < (multiplicity.emissionsPerInvocation ?? 1);
          emissionIndex += 1
        ) {
          emissionSequence += 1;
          const digest = `sha256:notification-${emissionSequence}`;
          const emission = add({
            eventType: "notification-emission",
            parentEventId: invocation.eventId,
            runtimeSessionIdentity: { state: "observed", value: "session-1" },
            normalizedMessageDigest: digest,
          });

          for (
            let presentationIndex = 0;
            presentationIndex < (multiplicity.presentationsPerEmission ?? 1);
            presentationIndex += 1
          ) {
            presentationSequence += 1;
            add({
              eventType: "presentation",
              parentEventId: { state: "observed", value: emission.eventId },
              runtimeSessionIdentity: { state: "observed", value: "session-1" },
              normalizedOutputDigest: digest,
              channel: { state: "observed", value: "notification-overlay" },
            });
          }
        }
      }
    }
  }

  expect(registrationSequence).toBeGreaterThan(0);
  expect(invocationSequence).toBeGreaterThan(0);
  expect(presentationSequence).toBeGreaterThan(0);
  return events;
}

describe("startup provenance summary and classifier", () => {
  test("summarizes and classifies distinct same-source loads through linked identities", () => {
    const events = completeTrace({ loads: 2 });

    expect(summarizeStartupProvenance(events, RUN_ID)).toEqual({
      diagnosticRunId: RUN_ID,
      loads: {
        count: { state: "observed", value: 2 },
        eventIds: ["load-1", "load-6"],
      },
      registrations: {
        count: { state: "observed", value: 2 },
        eventIds: ["registration-2", "registration-7"],
      },
      sessionStartInvocations: {
        count: { state: "observed", value: 2 },
        eventIds: ["session_start-3", "session_start-8"],
      },
      notificationEmissions: {
        count: { state: "observed", value: 2 },
        eventIds: ["notification-emission-4", "notification-emission-9"],
      },
      presentations: {
        count: { state: "observed", value: 2 },
        eventIds: ["presentation-5", "presentation-10"],
      },
    });
    expect(classifyStartupProvenance(events, classificationOptions)).toEqual({
      kind: "loader-duplication",
    });
  });

  test("distinguishes two attributable presentations from upstream multiplicity", () => {
    const events = completeTrace({ presentationsPerEmission: 2 });

    expect(classifyStartupProvenance(events, classificationOptions)).toEqual({
      kind: "renderer-duplication",
    });
  });

  test("keeps registration, event-delivery, and emission duplication distinct", () => {
    expect(
      classifyStartupProvenance(
        completeTrace({ registrationsPerLoad: 2 }),
        classificationOptions,
      ),
    ).toEqual({ kind: "registration-duplication" });
    expect(
      classifyStartupProvenance(
        completeTrace({ invocationsPerRegistration: 2 }),
        classificationOptions,
      ),
    ).toEqual({ kind: "event-delivery-duplication" });
    expect(
      classifyStartupProvenance(
        completeTrace({ emissionsPerInvocation: 2 }),
        classificationOptions,
      ),
    ).toEqual({ kind: "emission-duplication" });
  });

  test("fails closed when any classification-critical stage is missing", () => {
    const events = completeTrace({ presentationsPerEmission: 2 });
    const eventTypes: StartupProvenanceEvent["eventType"][] = [
      "load",
      "registration",
      "session_start",
      "notification-emission",
      "presentation",
    ];

    for (const eventType of eventTypes) {
      const incomplete = events.filter((event) => event.eventType !== eventType);
      expect(classifyStartupProvenance(incomplete, classificationOptions)).toEqual({
        kind: "unknown",
        reason: "missing-evidence",
      });
      expect(
        summarizeStartupProvenance(incomplete, RUN_ID)[
          eventType === "load"
            ? "loads"
            : eventType === "registration"
              ? "registrations"
              : eventType === "session_start"
                ? "sessionStartInvocations"
                : eventType === "notification-emission"
                  ? "notificationEmissions"
                  : "presentations"
        ].count,
      ).toEqual({ state: "unknown" });
    }
  });

  test("rejects stale, unknown-source, and unknown-channel evidence", () => {
    const events = completeTrace({ presentationsPerEmission: 2 });
    const stale = events.map((event) => ({
      ...event,
      wallClockTimestamp: "2026-08-10T11:00:00.000Z",
    })) as StartupProvenanceEvent[];
    expect(classifyStartupProvenance(stale, classificationOptions)).toEqual({
      kind: "unknown",
      reason: "stale-evidence",
    });

    const unknownSource = events.map((event, index) =>
      index === 0
        ? { ...event, extensionSourceIdentity: { state: "unknown" as const } }
        : event,
    );
    expect(
      classifyStartupProvenance(unknownSource, classificationOptions),
    ).toEqual({ kind: "unknown", reason: "unknown-source" });

    const unknownChannel = events.map((event) =>
      event.eventType === "presentation"
        ? { ...event, channel: { state: "unknown" as const } }
        : event,
    );
    expect(
      classifyStartupProvenance(unknownChannel, classificationOptions),
    ).toEqual({ kind: "unknown", reason: "unknown-channel" });
  });

  test("rejects uncorrelated identities even when stage counts match", () => {
    const events = completeTrace({ presentationsPerEmission: 2 });
    const brokenParent = events.map((event) =>
      event.eventType === "notification-emission"
        ? { ...event, parentEventId: "missing-invocation" }
        : event,
    );
    expect(
      classifyStartupProvenance(brokenParent, classificationOptions),
    ).toEqual({ kind: "unknown", reason: "uncorrelated-evidence" });

    const mixedRun = events.map((event, index) =>
      index === events.length - 1
        ? { ...event, diagnosticRunId: "run-2" }
        : event,
    );
    expect(classifyStartupProvenance(mixedRun, classificationOptions)).toEqual({
      kind: "unknown",
      reason: "uncorrelated-evidence",
    });

    const mixedSession = events.map((event, index) =>
      index === events.length - 1
        ? {
            ...event,
            runtimeSessionIdentity: {
              state: "observed" as const,
              value: "session-2",
            },
          }
        : event,
    );
    expect(
      classifyStartupProvenance(mixedSession, classificationOptions),
    ).toEqual({ kind: "unknown", reason: "uncorrelated-evidence" });

    const unknownParent = events.map((event, index) =>
      event.eventType === "presentation" && index === events.length - 1
        ? { ...event, parentEventId: { state: "unknown" as const } }
        : event,
    );
    expect(
      classifyStartupProvenance(unknownParent, classificationOptions),
    ).toEqual({ kind: "unknown", reason: "uncorrelated-evidence" });
  });
});
