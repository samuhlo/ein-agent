// =============================================================================
// EIN TERMINAL APP — terminal driver (the edge)
// Owns raw mode, redraws and process wiring. All navigation logic lives in
// `lib/terminal-app.ts`, which is pure and tested without a TTY.
// =============================================================================

import { stdin, stdout } from "node:process";
import { homedir } from "node:os";
import { join } from "node:path";
import { bannerFinal, bannerFrame, frameCount } from "../lib/banner.ts";
import { projectProjectState } from "../lib/project-state.ts";
import { applySetting, readSettings } from "../lib/project-settings.ts";
import {
  buildLaunchPlan,
  createRuntimeSessionAdapter,
  executeLaunchPlan,
  getRuntimeCapabilities,
} from "../lib/runtime-session-adapters.ts";
import { summarizeSessions } from "../lib/session-summary.ts";
import {
  checkClaudeCodeUpdate,
  checkEinTemplateUpdate,
  checkPiBinaryUpdate,
  defaultPiManifestPaths,
  readEinVersion,
  readPiBinaryVersion,
  startUpdateEvidenceSnapshot,
  type VersionProbeRunner,
} from "../lib/update-probes.ts";
import { humanizeAge, listRecentSessions } from "../lib/sessions.ts";
import {
  KEY_HINTS,
  buildConfigScreen,
  buildHomeScreen,
  buildSessionsScreen,
  buildSystemScreen,
  buildRuntimeScreen,
  nextRuntime,
  type RuntimeProviderId,
  type RuntimeSessionRow,
  handleKey,
  renderScreen,
  type Screen,
} from "../lib/terminal-app.ts";

const HELP = "Usage: ein [--project <root>] [--once] [--no-intro] [--help]";

/** Short enough to read as a flourish, not a wait. Any key skips it. */
export const INTRO_FRAME_MS = 22;
export const INTRO_COLUMN_STEP = 2;

export type TerminalAppArgs =
  | { kind: "run"; cwd: string; once: boolean; intro: boolean }
  | { kind: "help" }
  | { kind: "moved"; verb: string }
  | { kind: "usage"; reason: string };

/**
 * `ein` used to be the installer. Its verbs are recognized and redirected for
 * as long as muscle memory lasts, instead of opening the app and swallowing an
 * argument the user clearly meant as a command.
 */
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

export type TerminalAppIO = Readonly<{
  write: (text: string) => void;
  /** Terminal width; drives the narrow logo cut. */
  columns?: number;
  /** Injected so the intro is deterministic in tests instead of wall-clock. */
  sleep?: (ms: number) => Promise<void>;
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
  /** Injected so tests exercise the sessions view without reading transcripts. */
  sessions?: () => Parameters<typeof buildSessionsScreen>[0];
  /** Injected so tests exercise the system view without probing anything. */
  system?: () => Parameters<typeof buildSystemScreen>[0];
  /** Injected so tests exercise the runtime view without spawning anything. */
  runtime?: Readonly<{
    sessions: (provider: RuntimeProviderId) => readonly RuntimeSessionRow[];
    launch: (provider: RuntimeProviderId, reference?: string) => Promise<number>;
    capabilities?: (provider: RuntimeProviderId) => string | undefined;
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
 * 8-bit wipe-in: a dither edge sweeps the logo left to right. Skipped whenever
 * the terminal cannot animate, and abandoned as soon as the sleep seam says so.
 */
async function playIntro(io: TerminalAppIO): Promise<void> {
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const columns = io.columns ?? 100;
  const total = frameCount(columns);
  for (let frame = 0; frame <= total; frame += INTRO_COLUMN_STEP) {
    io.clear?.();
    io.write(`${bannerFrame(frame, columns).join("\n")}\n`);
    await sleep(INTRO_FRAME_MS);
  }
  io.clear?.();
  io.write(`${bannerFinal(columns).join("\n")}\n`);
  await sleep(INTRO_FRAME_MS * 6);
}

/**
 * Runs the app. Without raw keystrokes — a pipe, a dumb terminal, `--once` — it
 * paints the screen once and exits 0 instead of pretending to be interactive.
 */
export async function runTerminalApp(options: TerminalAppOptions): Promise<number> {
  const parsed = parseTerminalAppArgs(options.argv, options.cwd);
  if (parsed.kind === "help") { options.io.write(`${HELP}\n`); return 0; }
  if (parsed.kind === "moved") {
    options.io.write(
      `\`ein ${parsed.verb}\` ahora es \`${INSTALLER_COMMAND} ${parsed.verb}\`.\n` +
      `\`ein\` sin argumentos abre la aplicación.\n`,
    );
    return 2;
  }
  if (parsed.kind === "usage") { options.io.write(`${HELP}\n`); return 2; }

  const build = options.project ?? ((cwd: string) => buildHomeScreen(projectProjectState({ cwd })));
  const settings = options.settings ?? { read: readSettings, apply: applySetting };
  const buildConfig = (cwd: string): Screen => buildConfigScreen(settings.read(cwd));
  const readSessions = options.sessions ?? (() => summarizeSessions(listRecentSessions(5)));
  // Started at the edge, like the workbench does: probes run while the intro
  // plays and the first screens are read, so nothing waits on the network.
  const snapshot = options.system ? undefined : startUpdateEvidenceSnapshot({
    binary: async () => checkPiBinaryUpdate(await readPiBinaryVersion(defaultPiManifestPaths(homedir()))),
    packages: async () => ({ source: "packages", status: "skipped", reason: "requires-pi-runtime", freshness: "unknown" }),
    ein: async () => checkEinTemplateUpdate(await readEinVersion(resolveAgentDir())),
    claude: () => checkClaudeCodeUpdate(spawnVersionProbe),
  });
  const readSystem = options.system ?? (() => systemRowsFrom(snapshot?.read()));
  const runtimeSeam = options.runtime ?? productionRuntimeSeam(() => projectProjectState({ cwd: parsed.cwd }));
  let provider: RuntimeProviderId = "pi";
  const buildSessions = (): Screen => buildSessionsScreen(readSessions());
  const buildSystem = (): Screen => buildSystemScreen(readSystem());
  const buildRuntime = (): Screen =>
    buildRuntimeScreen(provider, runtimeSeam.sessions(provider), runtimeSeam.capabilities?.(provider));
  // One key cycles the three views, so there is nothing to remember beyond tab.
  const nextView = (current: Screen): Screen => {
    if (current.kind === "home") return buildConfig(parsed.cwd);
    if (current.kind === "config") return buildSessions();
    if (current.kind === "sessions") return buildSystem();
    return current.kind === "system" ? buildRuntime() : build(parsed.cwd);
  };
  let screen = build(parsed.cwd);

  const interactive = options.io.isTTY && options.io.onKey !== undefined && !parsed.once;
  if (!interactive) {
    paint(options.io, screen, `Non-interactive: static view. ${KEY_HINTS}`, false);
    return 0;
  }

  options.io.setRawMode?.(true);
  if (parsed.intro) await playIntro(options.io);
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
      if (effect.kind === "switch-view") screen = nextView(screen);
      if (effect.kind === "cycle-runtime") {
        provider = nextRuntime(provider);
        screen = buildRuntime();
        status = `Runtime: ${provider}`;
      }
      if (effect.kind === "launch") {
        // Hand the terminal over: leave raw mode, let the runtime own the tty,
        // and end the app with whatever the runtime exited with.
        stop();
        options.io.setRawMode?.(false);
        options.io.write("\n");
        void runtimeSeam.launch(effect.provider, effect.reference).then(resolve, () => resolve(1));
        return;
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

function resolveAgentDir(): string {
  return process.env.EIN_PI_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

/** Bounded spawn for version queries only; mirrors the workbench probe. */
const spawnVersionProbe: VersionProbeRunner = async ({ file, args, timeoutMs, maxBuffer }) => {
  const child = Bun.spawn([file, ...args], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const stdout = (await new Response(child.stdout).text()).slice(0, maxBuffer);
    return { stdout, exitCode: await child.exited };
  } finally {
    clearTimeout(timer);
  }
};

const UPDATE_COMMANDS: Readonly<Record<string, string>> = {
  ein: "ein-install update",
  binary: "ein-install update",
  packages: "pi-ein update --all",
  claude: "claude update",
};

const UPDATE_LABELS: Readonly<Record<string, string>> = {
  ein: "Ein", binary: "Pi binary", packages: "Pi packages", claude: "Claude Code",
};

/**
 * System rows from the update evidence plus the diagnostics entry point. The
 * app prints commands; running them stays with the installer (block N).
 */
export function systemRowsFrom(
  observations: ReturnType<typeof startUpdateEvidenceSnapshot>["read"] extends () => infer T ? T : never,
): Parameters<typeof buildSystemScreen>[0] {
  const rows = Object.keys(UPDATE_LABELS).map((source) => {
    const observation = observations?.find((item) => item.source === source);
    const status = observation
      ? (observation.status === "update-available" ? "update available" : observation.status)
      : undefined;
    return {
      label: UPDATE_LABELS[source] ?? source,
      status,
      command: observation?.status === "update-available" || observation?.status === "unavailable"
        ? UPDATE_COMMANDS[source]
        : undefined,
    };
  });
  return [...rows, { label: "Diagnostics", status: "run on demand", command: "ein-install doctor" }];
}

/**
 * Production runtime seam. Sessions come from the adapters and launching goes
 * through the same plan/execute pair the workbench uses, so the app inherits
 * every guard those already enforce instead of re-implementing them.
 */
export function productionRuntimeSeam(project: () => unknown) {
  return {
    capabilities: (provider: RuntimeProviderId) =>
      getRuntimeCapabilities(provider).map((item) => `${item.operation}=${item.support}`).join(" "),
    sessions: (provider: RuntimeProviderId): readonly RuntimeSessionRow[] => {
      const result = createRuntimeSessionAdapter(provider).list(project());
      if (result.outcome !== "success") return [];
      // A provider whose resume capability is unsupported must not present its
      // sessions as launchable: pressing enter would fail after the fact.
      const resumable = getRuntimeCapabilities(provider)
        .some((item) => item.operation === "resume" && item.support === "supported");
      const now = Date.now();
      return result.data.map((session) => ({
        reference: resumable ? session.reference : undefined,
        // Relative age reads at a glance; the exact stamp is the detail.
        label: humanizeAge(Math.max(0, now - session.modifiedAtMs)),
        detail: resumable
          ? new Date(session.modifiedAtMs).toISOString()
          : `${new Date(session.modifiedAtMs).toISOString()} · resume unsupported`,
      }));
    },
    launch: async (provider: RuntimeProviderId, reference?: string): Promise<number> => {
      const state = project();
      const adapter = createRuntimeSessionAdapter(provider);
      const intent = reference ? adapter.resume(state, reference) : adapter.create(state);
      if (intent.outcome !== "success") return 1;
      const plan = buildLaunchPlan(state, intent.data);
      if (plan.outcome !== "success") return 1;
      const executed = await executeLaunchPlan(plan.data);
      return executed.outcome === "success" ? 0 : 1;
    },
  };
}

/** Wires the real terminal. Keystrokes arrive raw, one chunk per key. */
export function productionTerminalIO(): TerminalAppIO {
  return {
    write: (text) => { stdout.write(text); },
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    columns: stdout.columns,
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
