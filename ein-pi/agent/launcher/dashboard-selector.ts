import { spawn as nodeSpawn } from "node:child_process";
import { dashboardTarget, validateDashboardRelease, type DashboardRelease, type DashboardTarget } from "../lib/dashboard-package.ts";
import { parseTerminalAppArgs } from "../lib/terminal-app-args.ts";

export type SpawnResult = Readonly<{ started: boolean; code: number }>;
export type DashboardLauncherPorts = Readonly<{
  platform: string;
  arch: string;
  stdinTTY: boolean;
  stdoutTTY: boolean;
  validate?: (root: string, target: DashboardTarget) => Promise<DashboardRelease | undefined>;
  spawn: (binary: string, argv: readonly string[]) => Promise<SpawnResult>;
}>;

export async function selectDashboardBinary(options: {
  argv: readonly string[];
  cwd: string;
  packageRoot: string;
  legacyBinary: string;
  ports: Omit<DashboardLauncherPorts, "spawn">;
}): Promise<string> {
  const parsed = parseTerminalAppArgs(options.argv, options.cwd);
  const target = dashboardTarget(options.ports.platform, options.ports.arch);
  if (!target) return options.legacyBinary;
  const release = await (options.ports.validate ?? validateDashboardRelease)(options.packageRoot, target);
  if (!release) return options.legacyBinary;
  return parsed.kind === "run" && !parsed.once && options.ports.stdinTTY && options.ports.stdoutTTY
    ? release.candidate
    : release.legacy;
}

export async function launchDashboard(options: {
  argv: readonly string[];
  cwd: string;
  packageRoot: string;
  legacyBinary: string;
  ports: DashboardLauncherPorts;
}): Promise<number> {
  const attempt = async (binary: string): Promise<SpawnResult> => {
    try { return await options.ports.spawn(binary, options.argv); } catch { return { started: false, code: 1 }; }
  };
  const selected = await selectDashboardBinary(options);
  const result = await attempt(selected);
  if (selected !== options.legacyBinary && !result.started) {
    return (await attempt(options.legacyBinary)).code;
  }
  return result.code;
}

export function spawnInherited(binary: string, argv: readonly string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = nodeSpawn(binary, [...argv], { stdio: "inherit" });
    let started = false;
    let settled = false;
    child.once("spawn", () => { started = true; });
    child.once("error", () => { if (!settled) { settled = true; resolve({ started, code: 1 }); } });
    child.once("close", (code) => { if (!settled) { settled = true; resolve({ started, code: code ?? 1 }); } });
  });
}
