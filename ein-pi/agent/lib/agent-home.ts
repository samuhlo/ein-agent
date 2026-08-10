// =============================================================================
// AGENT HOME RESOLUTION
// The launchers (`pi-ein`, `cc-ein`) export EIN_PI_AGENT_HOME before running
// anything. The standalone terminal app has no launcher in front of it, so it
// resolves the isolated home itself instead of falling back to `~/.pi/agent`,
// which is vanilla Pi and holds none of Ein's sessions.
// =============================================================================

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const ISOLATED_PI_AGENT_HOME = ".pi-ein";

export type HomeProbe = Readonly<{
  env: Readonly<Record<string, string | undefined>>;
  home: string;
  exists: (path: string) => boolean;
}>;

/**
 * Environment first — a launcher that already decided must win. Otherwise the
 * isolated home when it exists. Never guesses vanilla `~/.pi/agent`: reporting
 * nothing beats reading someone else's sessions.
 */
export function resolveEinAgentHome(probe: HomeProbe): string | undefined {
  const declared = probe.env.EIN_PI_AGENT_HOME;
  if (declared) return declared;
  const isolated = join(probe.home, ISOLATED_PI_AGENT_HOME, "agent");
  return probe.exists(isolated) ? isolated : undefined;
}

/** Production probe. */
export function defaultHomeProbe(): HomeProbe {
  return { env: process.env, home: homedir(), exists: existsSync };
}

/**
 * Exports the resolved home so modules that read `EIN_PI_AGENT_HOME` at import
 * time see it. Returns what was resolved, or undefined when nothing was found.
 */
export function adoptEinAgentHome(probe: HomeProbe = defaultHomeProbe()): string | undefined {
  const resolved = resolveEinAgentHome(probe);
  if (resolved && !probe.env.EIN_PI_AGENT_HOME) process.env.EIN_PI_AGENT_HOME = resolved;
  return resolved;
}
