// =============================================================================
// SESSION SUMMARY
// One recognizable phrase per recent session. Parsing is pure; the only I/O is
// a bounded tail read, because a session transcript can be megabytes and the
// app must not read them whole just to label a list.
// =============================================================================

import { openSync, readSync, closeSync, statSync } from "node:fs";
import { humanizeAge, type RecentSession } from "./sessions.ts";

/**
 * Sessions are scanned backwards one chunk at a time and stop at the first user
 * message. Measured on real transcripts, the last user turn sits between 60 KB
 * and 250 KB from the end — a single small tail misses most of them, and always
 * reading the maximum wastes megabytes on the common case.
 */
export const SESSION_CHUNK_BYTES = 64 * 1024;
export const SESSION_MAX_SCAN_BYTES = 512 * 1024;
export const SESSION_LABEL_MAX = 72;

export type SessionSummary = Readonly<{
  id: string;
  project: string;
  age: string;
  /** `undefined` when no last action could be read; never invented. */
  lastAction: string | undefined;
}>;

/** Strips control characters and collapses whitespace to a single line. */
export function sanitizeLabel(value: string): string {
  // Explicit escapes: literal control characters in a source regex are
  // invisible and get mangled by tooling that rewrites the file.
  const withoutControls = value.replace(/[\u0000-\u001f\u007f]+/g, " ");
  const collapsed = withoutControls.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SESSION_LABEL_MAX) return collapsed;
  return `${collapsed.slice(0, SESSION_LABEL_MAX - 1).trimEnd()}…`;
}

function userText(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const message = (parsed as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) return undefined;
  const { role, content } = message as { role?: unknown; content?: unknown };
  if (role !== "user" || !Array.isArray(content)) return undefined;
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (type === "text" && typeof text === "string" && text.trim()) return text;
  }
  return undefined;
}

/**
 * Last thing the human asked, which identifies a session far better than the
 * reply to it. Only user text is considered: tool output and model reasoning
 * are never surfaced. A truncated first line is skipped, so a tail read that
 * starts mid-record cannot produce a mangled label.
 */
export function lastActionFromSessionText(text: string, partial = false): string | undefined {
  const lines = text.split("\n");
  const start = partial ? 1 : 0;
  for (let index = lines.length - 1; index >= start; index--) {
    const line = lines[index]?.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const found = userText(parsed);
    if (found) return sanitizeLabel(found);
  }
  return undefined;
}

export type SessionReader = Readonly<{
  size: (path: string) => number | undefined;
  chunk: (path: string, start: number, length: number) => string | undefined;
}>;

/** Bounded positional reads; never throws. */
export const fileSessionReader: SessionReader = {
  size: (path) => {
    try { return statSync(path).size; } catch { return undefined; }
  },
  chunk: (path, start, length) => {
    let handle: number | undefined;
    try {
      const buffer = Buffer.alloc(length);
      handle = openSync(path, "r");
      readSync(handle, buffer, 0, length, start);
      return buffer.toString("utf8");
    } catch {
      return undefined;
    } finally {
      if (handle !== undefined) {
        try { closeSync(handle); } catch { /* a handle that failed to close is not worth surfacing */ }
      }
    }
  },
};

export type ScanOptions = Readonly<{ chunkBytes?: number; maxScanBytes?: number }>;

/** Walks backwards chunk by chunk, stopping at the first user message or the cap. */
export function lastActionFromSession(
  path: string,
  reader: SessionReader = fileSessionReader,
  options: ScanOptions = {},
): string | undefined {
  const chunkBytes = options.chunkBytes ?? SESSION_CHUNK_BYTES;
  const maxScanBytes = options.maxScanBytes ?? SESSION_MAX_SCAN_BYTES;
  const size = reader.size(path);
  if (size === undefined || size === 0) return undefined;

  let end = size;
  let scanned = 0;
  while (end > 0 && scanned < maxScanBytes) {
    const length = Math.min(chunkBytes, end, maxScanBytes - scanned);
    const start = end - length;
    const text = reader.chunk(path, start, length);
    if (text === undefined) return undefined;
    // A chunk that does not start at byte 0 begins mid-record: its first line
    // is a fragment and must not be parsed as if it were whole.
    const found = lastActionFromSessionText(text, start > 0);
    if (found) return found;
    end = start;
    scanned += length;
  }
  return undefined;
}

/** Summarizes recent sessions; an unreadable one is listed with an unknown action. */
export function summarizeSessions(
  sessions: readonly RecentSession[],
  reader: SessionReader = fileSessionReader,
  options: ScanOptions = {},
): readonly SessionSummary[] {
  return Object.freeze(sessions.map((session) => Object.freeze({
    id: session.id,
    project: session.project,
    age: humanizeAge(session.ageMs),
    lastAction: lastActionFromSession(session.path, reader, options),
  })));
}
