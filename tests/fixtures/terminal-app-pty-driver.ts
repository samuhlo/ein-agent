import { stdout } from "node:process";
import {
  productionTerminalIO,
  runTerminalApp,
  type LaunchOutcome,
} from "../../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import type { ProjectSummary } from "../../ein-pi/agent/lib/terminal-app.ts";

const scenario = process.argv[2] ?? "quit";
const summary: ProjectSummary = {
  name: "ein-agent",
  root: "/work/ein-agent",
  branch: "main",
  dirty: 0,
  change: "terminal-app-controller",
  phase: "apply",
  next: "verify",
  activeChanges: ["terminal-app-controller"],
  blockers: [],
  sessions: 0,
};

const launch = async (provider: "pi" | "claude", reference?: string): Promise<LaunchOutcome> => {
  stdout.write(`HANDOFF:${provider}:${reference ?? "new"}\n`);
  if (scenario === "unavailable") return { kind: "unavailable", reason: "pty-unavailable" };
  return { kind: "exited", code: 7 };
};

const code = await runTerminalApp({
  argv: ["--no-intro"],
  cwd: summary.root,
  io: productionTerminalIO(),
  summary: () => summary,
  settings: { read: () => [], apply: () => true },
  sessions: () => ({ entries: [], unavailable: [] }),
  system: () => [],
  runtime: { launch },
  run: async () => 0,
});
process.exit(code);
