export const TERMINAL_APP_HELP = "Usage: ein [--project <root>] [--once] [--no-intro] [--help]";

export type TerminalAppArgs =
  | { kind: "run"; cwd: string; once: boolean; intro: boolean }
  | { kind: "help" }
  | { kind: "moved"; verb: string }
  | { kind: "usage"; reason: string };

export const INSTALLER_VERBS: readonly string[] = [
  "install", "update", "uninstall", "restore", "doctor",
];
export const INSTALLER_COMMAND = "ein-install";

export function parseTerminalAppArgs(argv: readonly string[], cwd: string): TerminalAppArgs {
  let root = cwd;
  let once = false;
  let intro = true;
  const first = argv[0];
  if (first && INSTALLER_VERBS.includes(first)) return { kind: "moved", verb: first };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { kind: "help" };
    if (argument === "--once") { once = true; continue; }
    if (argument === "--no-intro") { intro = false; continue; }
    if (argument === "--project") {
      const value = argv[index + 1];
      if (!value) return { kind: "usage", reason: "missing-project-value" };
      root = value;
      index += 1;
      continue;
    }
    return { kind: "usage", reason: "unknown-argument" };
  }
  return { kind: "run", cwd: root, once, intro };
}
