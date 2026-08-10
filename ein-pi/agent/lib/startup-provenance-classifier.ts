import type {
  Evidence,
  ProcessIdentity,
  StartupProvenanceEvent,
} from "./startup-provenance";

export interface StartupProvenanceStageSummary {
  readonly count: Evidence<number>;
  readonly eventIds: readonly string[];
}

export interface StartupProvenanceSummary {
  readonly diagnosticRunId: string;
  readonly loads: StartupProvenanceStageSummary;
  readonly registrations: StartupProvenanceStageSummary;
  readonly sessionStartInvocations: StartupProvenanceStageSummary;
  readonly notificationEmissions: StartupProvenanceStageSummary;
  readonly presentations: StartupProvenanceStageSummary;
}

export interface StartupProvenanceClassificationOptions {
  readonly diagnosticRunId: string;
  readonly referenceWallClockTimestamp: string;
  readonly maximumEvidenceAgeMs: number;
}

export type StartupProvenanceClassification =
  | { readonly kind: "loader-duplication" }
  | { readonly kind: "registration-duplication" }
  | { readonly kind: "event-delivery-duplication" }
  | { readonly kind: "emission-duplication" }
  | { readonly kind: "renderer-duplication" }
  | {
      readonly kind: "unknown";
      readonly reason:
        | "missing-evidence"
        | "stale-evidence"
        | "unknown-source"
        | "unknown-channel"
        | "uncorrelated-evidence"
        | "unsupported-pattern";
    };

type EventType = StartupProvenanceEvent["eventType"];

function summarizeStage(
  events: readonly StartupProvenanceEvent[],
  eventType: EventType,
): StartupProvenanceStageSummary {
  const eventIds = events
    .filter((event) => event.eventType === eventType)
    .map((event) => event.eventId);

  return {
    count:
      eventIds.length === 0
        ? { state: "unknown" }
        : { state: "observed", value: eventIds.length },
    eventIds,
  };
}

export function summarizeStartupProvenance(
  events: readonly StartupProvenanceEvent[],
  diagnosticRunId: string,
): StartupProvenanceSummary {
  const runEvents = events.filter(
    (event) => event.diagnosticRunId === diagnosticRunId,
  );

  return {
    diagnosticRunId,
    loads: summarizeStage(runEvents, "load"),
    registrations: summarizeStage(runEvents, "registration"),
    sessionStartInvocations: summarizeStage(runEvents, "session_start"),
    notificationEmissions: summarizeStage(
      runEvents,
      "notification-emission",
    ),
    presentations: summarizeStage(runEvents, "presentation"),
  };
}

function observedProcessIdentity(
  event: StartupProvenanceEvent,
): ProcessIdentity | undefined {
  return event.processIdentity.state === "observed"
    ? event.processIdentity.value
    : undefined;
}

function hasCurrentTimestamps(
  events: readonly StartupProvenanceEvent[],
  options: StartupProvenanceClassificationOptions,
): boolean {
  const reference = Date.parse(options.referenceWallClockTimestamp);
  if (
    !Number.isFinite(reference) ||
    !Number.isFinite(options.maximumEvidenceAgeMs) ||
    options.maximumEvidenceAgeMs < 0
  ) {
    return false;
  }

  return events.every((event) => {
    const timestamp = Date.parse(event.wallClockTimestamp);
    const age = reference - timestamp;
    return (
      Number.isFinite(timestamp) &&
      age >= 0 &&
      age <= options.maximumEvidenceAgeMs
    );
  });
}

function hasKnownCommonSource(
  events: readonly StartupProvenanceEvent[],
): boolean {
  if (
    events.some(
      (event) => event.extensionSourceIdentity.state !== "observed",
    )
  ) {
    return false;
  }

  const sources = new Set(
    events.map((event) =>
      event.extensionSourceIdentity.state === "observed"
        ? event.extensionSourceIdentity.value
        : "",
    ),
  );
  return sources.size === 1 && !sources.has("");
}

function hasKnownPresentationChannels(
  events: readonly StartupProvenanceEvent[],
): boolean {
  return events.every(
    (event) =>
      event.eventType !== "presentation" || event.channel.state === "observed",
  );
}

function hasCommonProcessIdentity(
  events: readonly StartupProvenanceEvent[],
): boolean {
  const identities = events.map(observedProcessIdentity);
  if (identities.some((identity) => identity === undefined)) return false;

  const first = identities[0];
  return (
    first !== undefined &&
    identities.every(
      (identity) =>
        identity?.pid === first.pid && identity.ppid === first.ppid,
    )
  );
}

function hasCompatibleRuntimeSessionIdentity(
  events: readonly StartupProvenanceEvent[],
): boolean {
  const observedSessionIds = new Set(
    events.flatMap((event) =>
      event.runtimeSessionIdentity.state === "observed"
        ? [event.runtimeSessionIdentity.value]
        : [],
    ),
  );
  return observedSessionIds.size <= 1;
}

function countChildren(
  events: readonly StartupProvenanceEvent[],
  parentEventId: string,
): number {
  return events.filter((event) => {
    if (event.eventType === "load") return false;
    if (event.eventType === "presentation") {
      return (
        event.parentEventId.state === "observed" &&
        event.parentEventId.value === parentEventId
      );
    }
    return event.parentEventId === parentEventId;
  }).length;
}

function hasCompleteIdentityGraph(
  events: readonly StartupProvenanceEvent[],
): boolean {
  const eventById = new Map(
    events.map((event) => [event.eventId, event] as const),
  );
  if (
    eventById.size !== events.length ||
    events.some((event) => !event.eventId || !Number.isFinite(event.monotonicTimestamp))
  ) {
    return false;
  }

  for (const event of events) {
    if (event.eventType === "load") {
      if (event.parentEventId !== null) return false;
      continue;
    }

    const parentId =
      event.eventType === "presentation"
        ? event.parentEventId.state === "observed"
          ? event.parentEventId.value
          : undefined
        : event.parentEventId;
    if (parentId === undefined) return false;

    const parent = eventById.get(parentId);
    if (!parent || parent.monotonicTimestamp >= event.monotonicTimestamp) {
      return false;
    }

    if (
      (event.eventType === "registration" && parent.eventType !== "load") ||
      (event.eventType === "session_start" &&
        parent.eventType !== "registration") ||
      (event.eventType === "notification-emission" &&
        parent.eventType !== "session_start") ||
      (event.eventType === "presentation" &&
        parent.eventType !== "notification-emission")
    ) {
      return false;
    }

    if (
      event.eventType === "presentation" &&
      parent.eventType === "notification-emission" &&
      event.normalizedOutputDigest !== parent.normalizedMessageDigest
    ) {
      return false;
    }
  }

  return events.every((event) => {
    if (event.eventType === "presentation") return true;
    return countChildren(events, event.eventId) > 0;
  });
}

function hasCompleteInvocationObservations(
  events: readonly StartupProvenanceEvent[],
): boolean {
  return events.every(
    (event) =>
      event.eventType !== "session_start" ||
      (event.hasUI.state === "observed" &&
        event.hasUI.value === true &&
        event.cliFiltered.state === "observed" &&
        event.cliFiltered.value === false),
  );
}

function knownCount(
  stage: StartupProvenanceStageSummary,
): number | undefined {
  return stage.count.state === "observed" ? stage.count.value : undefined;
}

export function classifyStartupProvenance(
  events: readonly StartupProvenanceEvent[],
  options: StartupProvenanceClassificationOptions,
): StartupProvenanceClassification {
  const summary = summarizeStartupProvenance(
    events,
    options.diagnosticRunId,
  );
  const loads = knownCount(summary.loads);
  const registrations = knownCount(summary.registrations);
  const invocations = knownCount(summary.sessionStartInvocations);
  const emissions = knownCount(summary.notificationEmissions);
  const presentations = knownCount(summary.presentations);

  if (
    loads === undefined ||
    registrations === undefined ||
    invocations === undefined ||
    emissions === undefined ||
    presentations === undefined
  ) {
    return { kind: "unknown", reason: "missing-evidence" };
  }
  if (!hasCurrentTimestamps(events, options)) {
    return { kind: "unknown", reason: "stale-evidence" };
  }
  if (!hasKnownCommonSource(events)) {
    return { kind: "unknown", reason: "unknown-source" };
  }
  if (!hasKnownPresentationChannels(events)) {
    return { kind: "unknown", reason: "unknown-channel" };
  }
  if (
    events.some(
      (event) => event.diagnosticRunId !== options.diagnosticRunId,
    ) ||
    !hasCommonProcessIdentity(events) ||
    !hasCompatibleRuntimeSessionIdentity(events) ||
    !hasCompleteInvocationObservations(events) ||
    !hasCompleteIdentityGraph(events)
  ) {
    return { kind: "unknown", reason: "uncorrelated-evidence" };
  }

  if (
    loads > 1 &&
    registrations === loads &&
    invocations === registrations &&
    emissions === invocations &&
    presentations === emissions
  ) {
    return { kind: "loader-duplication" };
  }
  if (
    loads === 1 &&
    registrations > 1 &&
    invocations === registrations &&
    emissions === invocations &&
    presentations === emissions
  ) {
    return { kind: "registration-duplication" };
  }
  if (
    loads === 1 &&
    registrations === 1 &&
    invocations > 1 &&
    emissions === invocations &&
    presentations === emissions
  ) {
    return { kind: "event-delivery-duplication" };
  }
  if (
    loads === 1 &&
    registrations === 1 &&
    invocations === 1 &&
    emissions > 1 &&
    presentations === emissions
  ) {
    return { kind: "emission-duplication" };
  }
  if (
    loads === 1 &&
    registrations === 1 &&
    invocations === 1 &&
    emissions === 1 &&
    presentations > 1
  ) {
    return { kind: "renderer-duplication" };
  }

  return { kind: "unknown", reason: "unsupported-pattern" };
}
