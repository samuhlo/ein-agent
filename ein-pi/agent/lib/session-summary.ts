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
 *
 * The cap is generous because an agentic session inverts the usual shape: the
 * human speaks once and the following megabytes are tool results, so the last
 * human turn can sit near the start of a multi-megabyte file. Measured here:
 * 2.3 MB between the prompt and the end of a working session. The scan still
 * stops at the first match, so the common case reads one chunk.
 */
export const SESSION_CHUNK_BYTES = 64 * 1024;
export const SESSION_MAX_SCAN_BYTES = 4 * 1024 * 1024;
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

/**
 * Turns the harness injects on the user's behalf. They are structurally user
 * records, so only these markers separate "what the human typed" from tool
 * output and subagent traffic — and mistaking one for the other would label a
 * session with a JSON blob.
 */
const SYNTHETIC_TURN_PREFIXES = [
  "<local-command-stdout>",
  "<local-command-caveat>",
  "<command-name>",
  "<system-reminder>",
  "<bash-stdout>",
  "<bash-stderr>",
  "<bash-input>",
  "Caveat: The messages below",
];

function syntheticText(value: string): boolean {
  const trimmed = value.trimStart();
  return SYNTHETIC_TURN_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * The human's own words, across both transcript dialects: Pi writes an array of
 * content parts, Claude Code writes a plain string for a real turn and an array
 * of tool results for the synthetic ones. Everything else — assistant turns,
 * tool results, subagent turns, harness meta — is not the human.
 */
function userText(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const record = parsed as { message?: unknown; isSidechain?: unknown; isMeta?: unknown };
  if (record.isSidechain === true || record.isMeta === true) return undefined;
  const message = record.message;
  if (typeof message !== "object" || message === null) return undefined;
  const { role, content } = message as { role?: unknown; content?: unknown };
  if (role !== "user") return undefined;

  if (typeof content === "string") {
    return content.trim() && !syntheticText(content) ? content : undefined;
  }
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (type !== "text" || typeof text !== "string" || !text.trim()) continue;
    if (syntheticText(text)) continue;
    return text;
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
  // The fragment left dangling at the start of the chunk just read. Carried
  // into the next (earlier) chunk so a record larger than one chunk — a pasted
  // image, a huge tool result — is eventually reassembled instead of being
  // unparseable in every chunk it spans, which silently hid the human's turn.
  let carry = "";
  while (end > 0 && scanned < maxScanBytes) {
    const length = Math.min(chunkBytes, end, maxScanBytes - scanned);
    const start = end - length;
    const text = reader.chunk(path, start, length);
    if (text === undefined) return undefined;
    const combined = text + carry;
    // A chunk that does not start at byte 0 begins mid-record: its first line
    // is a fragment and must not be parsed as if it were whole.
    const found = lastActionFromSessionText(combined, start > 0);
    if (found) return found;
    // No newline at all means the whole chunk is still inside one record;
    // dropping it here is what made a record spanning three chunks vanish.
    const boundary = combined.indexOf("\n");
    carry = start === 0 ? "" : boundary >= 0 ? combined.slice(0, boundary) : combined;
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
