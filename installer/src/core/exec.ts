// =============================================================================
// EXEC HELPERS
// Safe process spawning, PATH lookup, candidate-chain resolution.
// No shell interpolation: args are passed as arrays to avoid injection.
// =============================================================================

import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

export type RunResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
};

export type RunOptions = {
  cwd?: string;
  env?: Record<string, string>;
  // Extra dirs to prepend to PATH (e.g. ~/.bun/bin after installing bun).
  extraPath?: string[];
  // Inherit stdio for interactive child processes (installers, brew, etc.).
  inherit?: boolean;
  timeoutMs?: number;
};

function buildEnv(opts: RunOptions): Record<string, string> {
  const base: Record<string, string> = { ...process.env, ...(opts.env ?? {}) } as Record<
    string,
    string
  >;
  if (opts.extraPath && opts.extraPath.length > 0) {
    const current = base.PATH ?? "";
    base.PATH = [...opts.extraPath, current].filter(Boolean).join(delimiter);
  }
  return base;
}

// BLINDAJE -> Never throws on non-zero exit; the caller decides via `.ok`.
export async function run(
  cmd: string,
  args: string[] = [],
  opts: RunOptions = {},
): Promise<RunResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: opts.cwd,
      env: buildEnv(opts),
      stdout: opts.inherit ? "inherit" : "pipe",
      stderr: opts.inherit ? "inherit" : "pipe",
      stdin: opts.inherit ? "inherit" : "ignore",
    });

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, opts.timeoutMs);
    }

    const stdout = opts.inherit ? "" : await new Response(proc.stdout).text();
    const stderr = opts.inherit ? "" : await new Response(proc.stderr).text();
    const code = await proc.exited;
    if (timer) clearTimeout(timer);

    return {
      ok: !timedOut && code === 0,
      code,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: -1, stdout: "", stderr: message };
  }
}

// Locate an executable on PATH without invoking a shell.
export function lookPath(bin: string, extraPath: string[] = []): string | null {
  const pathDirs = (process.env.PATH ?? "").split(delimiter);
  const dirs = [...extraPath, ...pathDirs].filter(Boolean);
  for (const dir of dirs) {
    const candidate = join(dir, bin);
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

function isExecutableFile(path: string): boolean {
  try {
    if (!existsSync(path)) return false;
    const st = statSync(path);
    if (!st.isFile() && !st.isSymbolicLink()) return false;
    // Any execute bit set counts as executable on unix.
    return (st.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

// PATH first, then explicit candidate paths. First hit wins; null if none.
export function resolveFromCandidates(
  bin: string,
  candidates: string[],
  extraPath: string[] = [],
): string | null {
  const onPath = lookPath(bin, extraPath);
  if (onPath) return onPath;
  for (const candidate of candidates) {
    if (isExecutableFile(candidate)) return candidate;
  }
  return null;
}

export function commandExists(bin: string, extraPath: string[] = []): boolean {
  return lookPath(bin, extraPath) !== null;
}
