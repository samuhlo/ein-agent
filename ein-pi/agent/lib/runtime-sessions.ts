// =============================================================================
// UNIFIED SESSION LIST
// One list of a project's sessions across every runtime Ein can launch. This is
// the whole point of sitting above the agents rather than beside them: which
// runtime wrote a session is a property of the row, not a mode of the app.
//
// Reader side only. It derives the same public reference the adapter resolves
// on resume, so the list and the launch agree without the private id ever
// becoming part of what the app holds.
// =============================================================================

import { scanClaudeProjectSessions } from "./claude-sessions.ts";
import { sessionReferenceFor, type RuntimeProvider } from "./runtime-session-adapters.ts";
import { lastActionFromSession } from "./session-summary.ts";
import {
  MAX_PROJECT_SESSIONS,
  humanizeAge,
  scanProjectSessions,
  type ProjectSessionScan,
  type ProjectSessionScope,
} from "./sessions.ts";

export type RuntimeSessionEntry = Readonly<{
  provider: RuntimeProvider;
  /** Opaque handle the adapter resolves back to a live session on resume. */
  reference: string;
  modifiedAtMs: number;
  /** Relative age, which is what makes a session recognizable at a glance. */
  age: string;
  /** The last thing the human asked; `undefined` when it could not be read. */
  lastAction: string | undefined;
}>;

export type RuntimeStoreGap = Readonly<{
  provider: RuntimeProvider;
  reason: "no-store";
}>;

export type RuntimeSessionList = Readonly<{
  entries: readonly RuntimeSessionEntry[];
  /** Runtimes that could not be looked at. Never folded into "no sessions". */
  unavailable: readonly RuntimeStoreGap[];
}>;

export type RuntimeSessionOptions = Readonly<{
  limit?: number;
  /** Injected so age is deterministic in tests instead of wall-clock. */
  now?: number;
  /** Injected so a caller can list without reading transcripts. */
  summarize?: (path: string) => string | undefined;
}>;

const SCANNERS: Readonly<Record<RuntimeProvider, (scope: ProjectSessionScope, limit: number) => ProjectSessionScan>> = {
  pi: (scope, limit) => scanProjectSessions(scope, limit),
  claude: (scope, limit) => scanClaudeProjectSessions(scope, limit),
};

const PROVIDERS: readonly RuntimeProvider[] = ["pi", "claude"];

/**
 * Every runtime's sessions for one project, newest first. Each runtime is
 * scanned up to `limit` so a chatty runtime cannot crowd the other out of the
 * window before the merge decides what is actually recent.
 */
export function collectRuntimeSessions(
  scope: ProjectSessionScope,
  options: RuntimeSessionOptions = {},
): RuntimeSessionList {
  const limit = Math.min(MAX_PROJECT_SESSIONS, Math.max(1, Math.trunc(options.limit ?? 10)));
  const now = options.now ?? Date.now();
  const summarize = options.summarize ?? ((path: string) => lastActionFromSession(path));

  const entries: RuntimeSessionEntry[] = [];
  const unavailable: RuntimeStoreGap[] = [];

  for (const provider of PROVIDERS) {
    const scan = SCANNERS[provider](scope, limit);
    if (scan.store === "absent") {
      unavailable.push({ provider, reason: "no-store" });
      continue;
    }
    for (const record of scan.matches) {
      entries.push({
        provider,
        reference: sessionReferenceFor(provider, record.id),
        modifiedAtMs: record.mtimeMs,
        age: humanizeAge(Math.max(0, now - record.mtimeMs)),
        lastAction: summarize(record.path),
      });
    }
  }

  entries.sort((left, right) => right.modifiedAtMs - left.modifiedAtMs);
  return Object.freeze({
    entries: Object.freeze(entries.slice(0, limit)),
    unavailable: Object.freeze(unavailable),
  });
}
