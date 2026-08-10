export type Evidence<T> =
  | { readonly state: "observed"; readonly value: T }
  | { readonly state: "unavailable"; readonly reason: string }
  | { readonly state: "unknown" };

export interface ProcessIdentity {
  readonly pid: number;
  readonly ppid: number;
}

export type PresentationChannel =
  | "notification-overlay"
  | "banner-stdout-redraw";

type RuntimeSessionEvidence = {
  readonly runtimeSessionIdentity: Evidence<string>;
};

export type StartupProvenanceEventDetails =
  | (RuntimeSessionEvidence & {
      readonly eventType: "load";
      readonly parentEventId: null;
    })
  | (RuntimeSessionEvidence & {
      readonly eventType: "registration";
      readonly parentEventId: string;
    })
  | (RuntimeSessionEvidence & {
      readonly eventType: "session_start";
      readonly parentEventId: string;
      readonly hasUI: Evidence<boolean>;
      readonly cliFiltered: Evidence<boolean>;
    })
  | (RuntimeSessionEvidence & {
      readonly eventType: "notification-emission";
      readonly parentEventId: string;
      readonly normalizedMessageDigest: string;
    })
  | (RuntimeSessionEvidence & {
      readonly eventType: "presentation";
      readonly parentEventId: Evidence<string>;
      readonly normalizedOutputDigest: string;
      readonly channel: Evidence<PresentationChannel>;
    });

interface StartupProvenanceEventMetadata {
  readonly diagnosticRunId: string;
  readonly eventId: string;
  readonly wallClockTimestamp: string;
  readonly monotonicTimestamp: number;
  readonly processIdentity: Evidence<ProcessIdentity>;
  readonly extensionSourceIdentity: Evidence<string>;
}

export type StartupProvenanceEvent = StartupProvenanceEventMetadata &
  StartupProvenanceEventDetails;

export type StartupProvenanceRecordOutcome =
  | { readonly state: "observed"; readonly event: StartupProvenanceEvent }
  | {
      readonly state: "unavailable";
      readonly reason:
        | "disabled"
        | "event-construction-failure"
        | "sink-failure";
    };

export interface StartupProvenanceRecorder {
  record(
    event: StartupProvenanceEventDetails,
  ): StartupProvenanceRecordOutcome;
}

type DisabledRecorderOptions = {
  readonly enabled: false;
};

type EnabledRecorderOptions = {
  readonly enabled: true;
  readonly diagnosticRunId: string;
  readonly nextEventId: () => string;
  readonly wallClock: () => string;
  readonly monotonicClock: () => number;
  readonly processIdentity: Evidence<ProcessIdentity>;
  readonly extensionSourceIdentity: Evidence<string>;
  readonly sink: (event: StartupProvenanceEvent) => void;
};

export type StartupProvenanceRecorderOptions =
  | DisabledRecorderOptions
  | EnabledRecorderOptions;

export function createStartupProvenanceRecorder(
  options: StartupProvenanceRecorderOptions,
): StartupProvenanceRecorder {
  if (!options.enabled) {
    return {
      record: () => ({ state: "unavailable", reason: "disabled" }),
    };
  }

  return {
    record(details) {
      let event: StartupProvenanceEvent;

      try {
        event = {
          diagnosticRunId: options.diagnosticRunId,
          eventId: options.nextEventId(),
          wallClockTimestamp: options.wallClock(),
          monotonicTimestamp: options.monotonicClock(),
          processIdentity: options.processIdentity,
          extensionSourceIdentity: options.extensionSourceIdentity,
          ...details,
        };
      } catch {
        return {
          state: "unavailable",
          reason: "event-construction-failure",
        };
      }

      try {
        options.sink(event);
        return { state: "observed", event };
      } catch {
        return { state: "unavailable", reason: "sink-failure" };
      }
    },
  };
}
