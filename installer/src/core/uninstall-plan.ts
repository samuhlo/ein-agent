import { existsSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { APP_COMMAND, INSTALLER_COMMAND } from "./command-names.ts";
import type { InstallTarget, RuntimeInstallTarget } from "./install-plan.ts";
import { isValidInstallMarker } from "./paths.ts";

export type UninstallEntry = Readonly<{ id: string; runtime: RuntimeInstallTarget; path: string; destination: string; state: "selected" | "absent" }>;
export type UninstallPlan = Readonly<{ target: InstallTarget; status: "ready" | "blocked"; blockers: readonly Readonly<{ runtime: RuntimeInstallTarget; reason: string }>[]; entries: readonly UninstallEntry[] }>;
export type UninstallPlanInput = Readonly<{ home: string; target: InstallTarget; binDir: string }>;

const pathsUnder = (root: string, names: readonly string[]): string[] => names.map((name) => `${root}/${name}`);
const PI_ASSETS = [
  ...pathsUnder(".pi-ein/agent", ["agents", "assets", "chains", "docs", "extensions", "lib", "prompts", "surfaces"]),
  ...pathsUnder(".pi-ein/agent", [".gitignore", "AGENTS.md", "app.ts", "brand.json", "ein-mode.json", "extensions-manifest.json", "mcp.json", "models.json", "settings.json", "template-manifest.json", ".ein-install.json"]),
  ".config/fish/functions/pi-ein.fish",
] as const;
const CLAUDE_ASSETS = [
  ...pathsUnder(".claude-ein", ["CLAUDE.md", "settings.json", ".ein-install.json", "skills"]),
  ...pathsUnder(".claude-ein/bin", ["cc-ein-sdd", "ein-surface-runner", "ein-app", "ein-continuity"]),
  ".claude-ein/commands/ein/handoff.md",
  ...pathsUnder(".claude-ein/agents", ["sdd-scope.md", "sdd-map.md", "sdd-design.md", "sdd-tasks.md", "sdd-apply.md", "sdd-verify.md", "sdd-close.md", "ein-scout.md", "ein-git.md", "ein-linear.md"]),
  ".config/fish/functions/cc-ein.fish",
] as const;
export const UNINSTALL_ASSETS = { pi: PI_ASSETS, claude: CLAUDE_ASSETS } as const;

function runtimeAssets(input: UninstallPlanInput, runtime: RuntimeInstallTarget): readonly string[] {
  if (runtime === "claude") return CLAUDE_ASSETS;
  const bin = relative(input.home, input.binDir);
  const commands = bin && bin !== ".." && !bin.startsWith(`..${sep}`) ? [join(bin, APP_COMMAND), join(bin, INSTALLER_COMMAND)] : [];
  return [...PI_ASSETS, ...commands];
}

export function createUninstallPlan(input: UninstallPlanInput): UninstallPlan {
  if (!isAbsolute(input.home) || !isAbsolute(input.binDir) || !["pi", "claude", "both"].includes(input.target)) throw new Error("Invalid uninstall arguments");
  const runtimes: RuntimeInstallTarget[] = input.target === "both" ? ["pi", "claude"] : [input.target];
  const blockers = runtimes.flatMap((runtime) => {
    const marker = runtime === "pi" ? ".pi-ein/agent/.ein-install.json" : ".claude-ein/.ein-install.json";
    return isValidInstallMarker(join(input.home, marker)) ? [] : [{ runtime, reason: `${runtime === "pi" ? "Pi" : "Claude"} install marker is missing or invalid` }];
  });
  const entries = runtimes.flatMap((runtime) => runtimeAssets(input, runtime).map((path) => {
    const destination = join(input.home, path);
    return { id: `${runtime}:${path}`, runtime, path, destination, state: existsSync(destination) ? "selected" as const : "absent" as const };
  }));
  return { target: input.target, status: blockers.length ? "blocked" : "ready", blockers, entries };
}

export function renderUninstallPlan(plan: UninstallPlan): string {
  const selected = plan.entries.filter(({ state }) => state === "selected");
  return [`Uninstall (${plan.target}): ${plan.status.toUpperCase()}`, `Actions: move ${selected.length}; absent ${plan.entries.length - selected.length}; blockers ${plan.blockers.length}`, ...selected.map(({ id }) => `  move ${id}`), ...plan.blockers.map(({ reason }) => `  BLOCKER: ${reason}`)].join("\n");
}
