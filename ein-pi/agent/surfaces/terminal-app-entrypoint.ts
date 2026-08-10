// =============================================================================
// EIN TERMINAL APP — terminal driver (the edge)
// Owns raw mode, redraws and process wiring. All navigation logic lives in
// `lib/terminal-app.ts`, which is pure and tested without a TTY.
// =============================================================================

import { stdin, stdout } from "node:process";
import { projectProjectState } from "../lib/project-state.ts";
import { applySetting, readSettings } from "../lib/project-settings.ts";
import {
  KEY_HINTS,
  buildConfigScreen,
  buildHomeScreen,
  handleKey,
  renderScreen,
  type Screen,
} from "../lib/terminal-app.ts";

const HELP = "Usage: ein app [--project <root>] [--once] [--help]";

export type TerminalAppArgs =
  | { kind: "run"; cwd: string; once: boolean }
  | { kind: "help" }
  | { kind: "usage"; reason: string };

export function parseTerminalAppArgs(argv: readonly string[], cwd: string): TerminalAppArgs {
  let root = cwd;
  let once = false;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { kind: "help" };
    if (argument === "--once") { once = true; continue; }
    if (argument === "--project") {
      const value = argv[index + 1];
      if (!value) return { kind: "usage", reason: "missing-project-value" };
      root = value;
      index += 1;
      continue;
    }
    return { kind: "usage", reason: "unknown-argument" };
  }
  return { kind: "run", cwd: root, once };
}

export type TerminalAppIO = Readonly<{
  write: (text: string) => void;
  isTTY: boolean;
  /** Absent when the terminal cannot deliver keystrokes; the app degrades. */
  onKey?: (handler: (key: string) => void) => () => void;
  setRawMode?: (raw: boolean) => void;
  clear?: () => void;
}>;

export type TerminalAppOptions = Readonly<{
  argv: readonly string[];
  cwd: string;
  io: TerminalAppIO;
  project?: (cwd: string) => Screen;
  /** Injected so tests exercise the config view without touching disk. */
  settings?: Readonly<{
    read: (cwd: string) => ReturnType<typeof readSettings>;
    apply: (cwd: string, settingId: string, value: string) => boolean;
  }>;
}>;

// `clear` only when redrawing an interactive screen: emitting it into a pipe
// puts escape sequences in output nobody asked to be a terminal.
function paint(io: TerminalAppIO, screen: Screen, status: string, clear: boolean): void {
  if (clear) io.clear?.();
  io.write(renderScreen(screen).join("\n"));
  if (status) io.write(`\n${status}`);
  io.write("\n");
}

/**
 * Runs the app. Without raw keystrokes — a pipe, a dumb terminal, `--once` — it
 * paints the screen once and exits 0 instead of pretending to be interactive.
 */
export async function runTerminalApp(options: TerminalAppOptions): Promise<number> {
  const parsed = parseTerminalAppArgs(options.argv, options.cwd);
  if (parsed.kind === "help") { options.io.write(`${HELP}\n`); return 0; }
  if (parsed.kind === "usage") { options.io.write(`${HELP}\n`); return 2; }

  const build = options.project ?? ((cwd: string) => buildHomeScreen(projectProjectState({ cwd })));
  const settings = options.settings ?? { read: readSettings, apply: applySetting };
  const buildConfig = (cwd: string): Screen => buildConfigScreen(settings.read(cwd));
  let screen = build(parsed.cwd);

  const interactive = options.io.isTTY && options.io.onKey !== undefined && !parsed.once;
  if (!interactive) {
    paint(options.io, screen, `Non-interactive: static view. ${KEY_HINTS}`, false);
    return 0;
  }

  options.io.setRawMode?.(true);
  paint(options.io, screen, "", true);
  return await new Promise<number>((resolve) => {
    const stop = options.io.onKey!((key) => {
      const outcome = handleKey(screen, key);
      screen = outcome.screen;
      const effect = outcome.effect;
      if (effect.kind === "quit") {
        stop();
        options.io.setRawMode?.(false);
        options.io.write("\n");
        resolve(0);
        return;
      }
      let status = effect.kind === "status" ? effect.message : "";
      if (effect.kind === "switch-view") {
        screen = screen.kind === "config" ? build(parsed.cwd) : buildConfig(parsed.cwd);
      }
      if (effect.kind === "apply") {
        // Persist through the setting's owner, then re-read: the screen shows
        // what disk says afterwards, not what the keystroke intended.
        const cursor = screen.cursor;
        const applied = settings.apply(parsed.cwd, effect.settingId, effect.value);
        screen = { ...buildConfig(parsed.cwd), cursor };
        status = applied ? `${effect.settingId} = ${effect.value}` : `${effect.settingId} — refused`;
      }
      paint(options.io, screen, status, true);
    });
  });
}

/** Wires the real terminal. Keystrokes arrive raw, one chunk per key. */
export function productionTerminalIO(): TerminalAppIO {
  return {
    write: (text) => { stdout.write(text); },
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    setRawMode: (raw) => { stdin.setRawMode?.(raw); },
    clear: () => { stdout.write("\u001b[2J\u001b[3J\u001b[H"); },
    onKey: (handler) => {
      const listener = (chunk: Buffer | string): void => { handler(chunk.toString()); };
      stdin.resume();
      stdin.on("data", listener);
      return () => { stdin.off("data", listener); stdin.pause(); };
    },
  };
}
