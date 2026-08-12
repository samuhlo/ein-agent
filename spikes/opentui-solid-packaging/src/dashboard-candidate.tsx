import {
  createTerminalAppControllerFactoryForCwd,
  parseTerminalAppArgs,
  type TerminalAppOptions,
} from "../../../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import { runDashboardCandidate } from "./dashboard-runner";

const argv = process.argv.slice(2);
const cwd = process.cwd();
const parsed = parseTerminalAppArgs(argv, cwd);

if (parsed.kind !== "run" || parsed.once || !process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("The spike dashboard candidate requires an interactive TTY without --once.\n");
  process.exitCode = parsed.kind === "help" ? 0 : 2;
} else {
  const options: TerminalAppOptions = {
    argv,
    cwd,
    io: { isTTY: true, write: (text) => process.stdout.write(text) },
  };
  process.exitCode = await runDashboardCandidate(
    createTerminalAppControllerFactoryForCwd(options, parsed.cwd),
  );
}
