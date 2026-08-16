import { stdout } from "node:process";
import {
  productionTerminalIO,
  runTerminalApp,
  type LaunchOutcome,
} from "../../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import type { ProjectSummary } from "../../ein-pi/agent/lib/terminal-app.ts";
import { join } from "node:path";
import { runContinueInPty } from "../../ein-pi/agent/lib/terminal-continue-transport.ts";

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
const brief = (target: "pi" | "claude") => ({ ok: true as const, brief: {
  ok: true as const, version: 1 as const, format: "continuity-resume-brief/v1" as const,
  content: "PRIVATE-BRIEF-CANARY", byteLength: 20, payloadByteLength: 1,
  payloadSha256: `sha256:${"a".repeat(64)}`, target, checkpointRevision: `sha256:${"b".repeat(64)}`,
  truncated: false, omissions: { changedPaths: 0, completed: 0, unresolvedDecisions: 0 }, warnings: [],
} });

const code = await runTerminalApp({
  argv: ["--no-intro"],
  cwd: summary.root,
  io: productionTerminalIO(),
  summary: () => summary,
  settings: { read: () => [], apply: () => true },
  sessions: () => ({ entries: [], unavailable: [] }),
  system: () => [],
  runtime: {
    launch,
    continue: (provider, content) => runContinueInPty({
      cwd: process.cwd(), provider, brief: content,
      command: [process.execPath, join(import.meta.dir, "terminal-continue-provider-stub.ts"), provider],
    }),
  },
  continuity: { prepare: async (target) => brief(target as "pi" | "claude") },
  run: async () => 0,
});
process.exit(code);
