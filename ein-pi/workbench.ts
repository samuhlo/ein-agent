#!/usr/bin/env bun
export {
  parseWorkbenchArgs,
  renderLauncherAdvisor,
  runWorkbenchEntrypoint,
  type ParsedWorkbenchArgs,
  type WorkbenchEntrypointOptions,
} from "./agent/surfaces/workbench-entrypoint.ts";

import { invokeProductionWorkbench } from "./agent/surfaces/workbench-entrypoint.ts";

if (import.meta.main) {
  process.exitCode = await invokeProductionWorkbench(Bun.argv.slice(2));
}
