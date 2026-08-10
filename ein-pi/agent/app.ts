#!/usr/bin/env bun
// Executable entry for the Ein terminal app. Runnable from any shell; all logic
// lives in the surface and the pure core.
import { productionTerminalIO, runTerminalApp } from "./surfaces/terminal-app-entrypoint.ts";

process.exit(await runTerminalApp({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  io: productionTerminalIO(),
}));
