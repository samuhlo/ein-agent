// =============================================================================
// CLAUDE CODE SESSION STORE
// Claude keeps transcripts at <config>/projects/<encoded-cwd>/<uuid>.jsonl.
// Mirrors the bounded Pi reader in `sessions.ts`: cheap stat pass, newest first,
// then a capped head read per candidate. Two things differ and both matter:
//   - the folder name is a LOSSY encoding of the cwd (every non-alphanumeric
//     character becomes `-`), so membership is decided by the `cwd` field the
//     records carry, never by the folder;
//   - the cwd is not on the first line, so the head read spans several records.
// Private ids and paths stay behind this reader; only its adapter crosses out.
// =============================================================================

import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import {
  MAX_PROJECT_SESSIONS,
  PROJECT_SCAN_LIMIT,
  matchesProjectScope,
  type Candidate,
  type ProjectSessionRecord,
  type ProjectSessionScan,
  type ProjectSessionScope,
  type SessionStorePresence,
} from "./sessions.ts";

/** Ein's isolated Claude home. Vanilla `~/.claude` is deliberately not ours. */
export const ISOLATED_CLAUDE_HOME = ".claude-ein";

/**
 * How far into a transcript the reader looks for the first record carrying a
 * `cwd`. Measured on real transcripts the first user record sits within a few
 * kilobytes; the cap exists so one pathological preamble cannot make the scan
 * read a multi-megabyte file.
 */
export const CLAUDE_HEAD_SCAN_BYTES = 64 * 1024;

export type ClaudeHomeProbe = Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  exists: (path: string) => boolean;
}>;

/**
 * Declared config first — a launcher that already decided wins. Otherwise the
 * isolated home when it exists. Never `~/.claude`: that is the user's own Claude
 * Code, and listing its sessions here would be reading someone else's work.
 */
export function resolveClaudeHome(probe: ClaudeHomeProbe): string | undefined {
  const declared = probe.env.CLAUDE_CONFIG_DIR;
  if (declared) return declared;
  const isolated = join(probe.home, ISOLATED_CLAUDE_HOME);
  return probe.exists(isolated) ? isolated : undefined;
}

function defaultProbe(): ClaudeHomeProbe {
  return {
    env: process.env,
    home: homedir(),
    exists: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

/** The lossy folder name Claude derives from a cwd. Used to read, never to decide. */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

function projectsRoot(probe: ClaudeHomeProbe): string | undefined {
  const home = resolveClaudeHome(probe);
  return home ? join(home, "projects") : undefined;
}

function collectCandidates(root: string): { candidates: Candidate[]; store: SessionStorePresence } {
  const out: Candidate[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(root);
  } catch {
    return { candidates: out, store: "absent" };
  }
  for (const project of projectDirs) {
    const dir = join(root, project);
    let entries: string[] = [];
    try {
      if (!statSync(dir).isDirectory()) continue;
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const path = join(dir, entry);
      try {
        const stat = statSync(path);
        if (stat.isFile()) out.push({ path, mtimeMs: stat.mtimeMs });
      } catch {
        // Unreadable candidate: skipped, never guessed at.
      }
    }
  }
  return { candidates: out, store: "present" };
}

function readHead(path: string, bytes: number): string {
  let handle: number | undefined;
  try {
    handle = openSync(path, "r");
    const buffer = Buffer.alloc(bytes);
    const read = readSync(handle, buffer, 0, bytes, 0);
    return buffer.toString("utf8", 0, read);
  } catch {
    return "";
  } finally {
    if (handle !== undefined) {
      try {
        closeSync(handle);
      } catch {
        // A handle that failed to close is not worth surfacing.
      }
    }
  }
}

// Targeted extraction instead of JSON.parse per line: a single record can be
// hundreds of kilobytes (file snapshots, tool results) and parsing it whole to
// read one field is waste the scan repeats per candidate.
const CWD_FIELD = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/;
const SESSION_ID_FIELD = /"sessionId"\s*:\s*("(?:[^"\\]|\\.)*")/;

function jsonString(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export type ClaudeSessionMeta = { id: string; cwd: string };

/**
 * The session's project and id from a bounded head read. The id falls back to
 * the file name because Claude names transcripts after the session uuid, which
 * makes a store whose records omit `sessionId` still resumable.
 */
export function readClaudeSessionMeta(
  path: string,
  bytes = CLAUDE_HEAD_SCAN_BYTES,
): ClaudeSessionMeta | undefined {
  const head = readHead(path, bytes);
  if (!head) return undefined;
  const cwd = jsonString(CWD_FIELD.exec(head)?.[1]);
  if (!cwd) return undefined;
  const id = jsonString(SESSION_ID_FIELD.exec(head)?.[1]) ?? basename(path, ".jsonl");
  return id ? { id, cwd } : undefined;
}

/**
 * Bounded project-scoped scan of the Claude store. Same shape as the Pi reader
 * so the unified session list can treat both runtimes identically.
 */
export function scanClaudeProjectSessions(
  scope: ProjectSessionScope,
  limit = 10,
  probe: ClaudeHomeProbe = defaultProbe(),
): ProjectSessionScan {
  const root = projectsRoot(probe);
  if (!root) return { matches: [], scanLimitExceeded: false, store: "absent" };

  const boundedLimit = Math.min(MAX_PROJECT_SESSIONS, Math.max(1, Math.trunc(limit)));
  const scan = collectCandidates(root);
  const candidates = scan.candidates.sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path),
  );
  const matches: ProjectSessionRecord[] = [];
  for (const candidate of candidates.slice(0, PROJECT_SCAN_LIMIT)) {
    if (matches.length >= boundedLimit) break;
    const meta = readClaudeSessionMeta(candidate.path);
    if (!meta || !matchesProjectScope(meta, scope)) continue;
    matches.push({ ...meta, path: candidate.path, mtimeMs: candidate.mtimeMs });
  }
  return {
    matches,
    scanLimitExceeded: matches.length < boundedLimit && candidates.length > PROJECT_SCAN_LIMIT,
    store: scan.store,
  };
}
