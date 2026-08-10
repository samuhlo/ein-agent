#!/usr/bin/env bun
// Executable entry for the Ein terminal app. Runnable from any shell; all logic
// lives in the surface and the pure core.
// Resolved before anything imports ein-paths: AGENT_DIR is read at module load,
// so adopting the isolated home afterwards would be too late.
import { adoptEinAgentHome } from "./lib/agent-home.ts";

adoptEinAgentHome();

const { productionTerminalIO, runTerminalApp } = await import("./surfaces/terminal-app-entrypoint.ts");

process.exit(await runTerminalApp({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  io: productionTerminalIO(),
}));
