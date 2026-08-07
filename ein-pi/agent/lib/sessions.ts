// =============================================================================
// RECENT SESSIONS
// Lists recent Pi sessions across all projects for the banner and /ein:resume.
// Sessions live at ~/.pi/agent/sessions/<cwd-encoded>/<timestamp>_<uuid>.jsonl.
// The first line is {"type":"session","id","timestamp","cwd"} — we read only
// that line (sessions are large) to derive a project label and a resume id.
// =============================================================================

import { closeSync, openSync, readSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, normalize, sep } from "node:path";
import { AGENT_DIR } from "../extensions/ein-paths";
import { pick } from "./lang";

const SESSIONS_DIR = join(AGENT_DIR, "sessions");

export type RecentSession = {
  project: string;
  id: string;
  ageMs: number;
  cwd: string;
  path: string;
};

export function humanizeAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 45) return pick("justo ahora", "just now");
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

type Candidate = { path: string; mtimeMs: number };

// Cheap pass: collect top-level .jsonl files across project dirs with mtime.
function collectCandidates(): Candidate[] {
  const out: Candidate[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(SESSIONS_DIR);
  } catch {
    return out;
  }
  for (const proj of projectDirs) {
    const projDir = join(SESSIONS_DIR, proj);
    let entries: string[] = [];
    try {
      if (!statSync(projDir).isDirectory()) continue;
      entries = readdirSync(projDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const full = join(projDir, entry);
      try {
        const st = statSync(full);
        if (st.isFile()) out.push({ path: full, mtimeMs: st.mtimeMs });
      } catch {
        // skip unreadable
      }
    }
  }
  return out;
}

// Read only the first line of a (potentially large) session file.
function readFirstLine(path: string): string {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buf = Buffer.alloc(1024);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const text = buf.toString("utf8", 0, bytes);
    const nl = text.indexOf("\n");
    return nl >= 0 ? text.slice(0, nl) : text;
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
  }
}

function readSessionMeta(path: string): { id: string; cwd: string } | null {
  const line = readFirstLine(path);
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as { id?: unknown; cwd?: unknown };
    const id = typeof parsed.id === "string" ? parsed.id : "";
    if (!id) return null;
    return { id, cwd: typeof parsed.cwd === "string" ? parsed.cwd : "" };
  } catch {
    return null;
  }
}

const PROJECT_SCAN_LIMIT = 4_096;

export type ProjectSessionScope = {
  cwd: string;
  repositoryRoot?: string;
};

/** Internal metadata kept transiently between the Pi reader and its adapter. */
type ProjectSessionRecord = {
  id: string;
  cwd: string;
  path: string;
  mtimeMs: number;
};

export type ProjectSessionScan = {
  matches: readonly ProjectSessionRecord[];
  scanLimitExceeded: boolean;
};

function isWithin(root: string, candidate: string): boolean {
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate === root || candidate.startsWith(boundary);
}

function matchesProjectScope(meta: { cwd: string }, scope: ProjectSessionScope): boolean {
  const cwd = normalize(meta.cwd);
  const selectedCwd = normalize(scope.cwd);
  if (!isAbsolute(cwd) || !isAbsolute(selectedCwd)) return false;
  if (!scope.repositoryRoot) return cwd === selectedCwd;
  const root = normalize(scope.repositoryRoot);
  return isAbsolute(root) && isWithin(root, selectedCwd) && isWithin(root, cwd);
}

/**
 * Bounded project-scoped Pi metadata scan. Private ids, paths, and cwds do not
 * cross this reader/adapter seam and no transcript line is read.
 */
export function scanProjectSessions(
  scope: ProjectSessionScope,
  limit = 10,
): ProjectSessionScan {
  const boundedLimit = Math.min(20, Math.max(1, Math.trunc(limit)));
  const candidates = collectCandidates().sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path),
  );
  const matches: ProjectSessionRecord[] = [];
  for (const candidate of candidates.slice(0, PROJECT_SCAN_LIMIT)) {
    if (matches.length >= boundedLimit) break;
    const meta = readSessionMeta(candidate.path);
    if (!meta?.cwd || !matchesProjectScope(meta, scope)) continue;
    matches.push({ ...meta, path: candidate.path, mtimeMs: candidate.mtimeMs });
  }
  return {
    matches,
    scanLimitExceeded:
      matches.length < boundedLimit && candidates.length > PROJECT_SCAN_LIMIT,
  };
}

export type RecentOptions = {
  excludePath?: string;
  // Keep only the most recent session per project (distinct projects).
  dedupeByProject?: boolean;
};

// Recent sessions across all projects, newest first. Best-effort; never throws.
export function listRecentSessions(limit = 3, opts: RecentOptions = {}): RecentSession[] {
  const now = Date.now();
  const candidates = collectCandidates()
    .filter((c) => c.path !== opts.excludePath)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const out: RecentSession[] = [];
  const seenProjects = new Set<string>();
  for (const c of candidates) {
    if (out.length >= limit) break;
    const meta = readSessionMeta(c.path);
    if (!meta) continue;
    const project = meta.cwd ? basename(meta.cwd) : "sesion";
    if (opts.dedupeByProject) {
      if (seenProjects.has(project)) continue;
      seenProjects.add(project);
    }
    out.push({ project, id: meta.id, ageMs: now - c.mtimeMs, cwd: meta.cwd, path: c.path });
  }
  return out;
}
