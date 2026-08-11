// =============================================================================
// EIN TERMINAL APP — terminal driver (the edge)
// Owns raw mode, the alternate screen, redraws and every side effect. All
// navigation lives in `lib/terminal-app.ts`, which is pure and tested without a
// TTY; this file is the only place that reads disk, spawns, or paints.
// =============================================================================

import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { bannerFinal, bannerFrame, frameCount, logoFor, TAGLINE } from "../lib/banner.ts";
import { projectProjectState, type ProjectStateV1 } from "../lib/project-state.ts";
import { applySetting, readSettings } from "../lib/project-settings.ts";
import {
  buildLaunchPlan,
  createRuntimeSessionAdapter,
  executeLaunchPlan,
  type RuntimeProvider,
} from "../lib/runtime-session-adapters.ts";
import { collectRuntimeSessions, type RuntimeSessionList } from "../lib/runtime-sessions.ts";
import { pick } from "../lib/lang.ts";
import { createPalette, shouldUseColor } from "../lib/theme.ts";
import {
  createTerminalAppController,
  type LaunchOutcome,
  type TerminalAppController,
  type TerminalAppControllerPorts,
} from "../lib/terminal-app-controller.ts";
import {
  renderApp,
  splitKeys,
  type ProjectSummary,
  type Setting,
  type SystemComponent,
} from "../lib/terminal-app.ts";
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

const HELP = "Usage: ein [--project <root>] [--once] [--no-intro] [--help]";

/** Short enough to read as a flourish, not a wait. Any key skips it. */
export const INTRO_FRAME_MS = 22;
export const INTRO_COLUMN_STEP = 2;
/** Below this the logo is noise; the dashboard falls back to the name. */
export const MIN_BANNER_COLUMNS = 42;
export const MIN_BANNER_ROWS = 22;
const SESSION_LIST_LIMIT = 8;

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
  isTTY: boolean;
  /** Terminal size; drives the narrow logo cut and the banner decision. */
  columns?: number;
  rows?: number;
  /** Read for the colour decision; injected so tests are not machine-dependent. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Injected so the intro is deterministic in tests instead of wall-clock. */
  sleep?: (ms: number) => Promise<void>;
  /** Absent when the terminal cannot deliver keystrokes; the app degrades. */
  onKey?: (handler: (key: string) => void) => () => void;
  setRawMode?: (raw: boolean) => void;
  clear?: () => void;
  /** The alternate screen is what makes this feel like a program, not output. */
  setAltScreen?: (active: boolean) => void;
  onResize?: (handler: () => void) => () => void;
}>;

export type { LaunchOutcome } from "../lib/terminal-app-controller.ts";

export type TerminalAppOptions = Readonly<{
  argv: readonly string[];
  cwd: string;
  io: TerminalAppIO;
  /** Injected so tests describe a project without a repository on disk. */
  summary?: (cwd: string, change?: string) => ProjectSummary;
  settings?: Readonly<{
    read: (cwd: string) => readonly Setting[];
    apply: (cwd: string, settingId: string, value: string) => boolean;
  }>;
  sessions?: (cwd: string) => RuntimeSessionList;
  system?: () => readonly SystemComponent[];
  runtime?: Readonly<{
    launch: (provider: RuntimeProvider, reference?: string) => Promise<LaunchOutcome>;
  }>;
  /** Runs a system command with the terminal handed over; returns its code. */
  run?: (command: readonly string[]) => Promise<number>;
}>;

// ─── project summary ─────────────────────────────────────────────────────────

function dirtyCount(state: ProjectStateV1): number | undefined {
  if (state.git.repository !== true || !state.git.complete) return undefined;
  return state.git.changes.length;
}

export function summaryFromState(state: ProjectStateV1, sessions?: number): ProjectSummary {
  const root = state.identity.repositoryRoot ?? state.identity.cwd;
  return Object.freeze({
    name: basename(root) || root,
    root,
    branch: state.git.branch,
    dirty: dirtyCount(state),
    change: state.openspec.selectedChange,
    phase: state.openspec.phase,
    next: state.openspec.next,
    activeChanges: state.openspec.activeChanges,
    blockers: state.openspec.blockers,
    sessions,
  });
}

// ─── system components ───────────────────────────────────────────────────────

const UPDATE_COMMANDS: Readonly<Record<string, readonly string[]>> = {
  ein: ["ein-install", "update"],
  binary: ["ein-install", "update"],
  packages: ["pi-ein", "update", "--all"],
  claude: ["claude", "update"],
};

const UPDATE_LABELS: Readonly<Record<string, string>> = {
  ein: "Ein", binary: "Pi", packages: pick("Paquetes de Pi", "Pi packages"), claude: "Claude Code",
};

type UpdateObservation = Readonly<{ source?: unknown; status?: unknown }>;

/**
 * The system view's rows. Every command is a literal argv declared here — the
 * app never assembles one from evidence it read, which is what keeps "run the
 * update" from becoming "run whatever a probe said".
 */
export function systemComponentsFrom(
  observations: readonly UpdateObservation[] | undefined,
  facts: Readonly<{ engramInstalled: boolean }>,
): readonly SystemComponent[] {
  const components: SystemComponent[] = Object.keys(UPDATE_LABELS).map((source) => {
    const observation = observations?.find((item) => item.source === source);
    const status = typeof observation?.status === "string" ? observation.status : undefined;
    // Only a component that says it is behind gets something to run: an
    // unknown or skipped probe is not evidence that an update exists.
    const command = status === "update-available" ? UPDATE_COMMANDS[source] : undefined;
    return {
      id: source,
      label: UPDATE_LABELS[source] ?? source,
      status,
      ...(command ? { command } : {}),
    };
  });

  components.push({
    id: "engram",
    label: "Engram",
    // A component of the installation, not a project setting: there is no
    // persisted on/off, so a switch here would switch nothing.
    status: facts.engramInstalled ? pick("instalado", "installed") : pick("no instalado", "not installed"),
  });
  components.push({
    id: "doctor",
    label: pick("Diagnóstico", "Diagnostics"),
    status: pick("bajo demanda", "on demand"),
    command: ["ein-install", "doctor"],
  });
  return Object.freeze(components);
}

// ─── painting ────────────────────────────────────────────────────────────────

type Chrome = Readonly<{ columns: number; rows: number; banner?: readonly string[]; tagline?: string }>;

/** A terminal that reports nothing useful gets a sane default, not a zero. */
function size(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function chromeFor(io: TerminalAppIO): Chrome {
  const columns = size(io.columns, 100);
  const rows = size(io.rows, 40);
  const logo = logoFor(columns);
  const fits = columns >= MIN_BANNER_COLUMNS && rows >= MIN_BANNER_ROWS && columns >= logo[0]!.length;
  return {
    columns,
    rows,
    ...(fits ? { banner: bannerFrame(frameCount(columns), columns), tagline: TAGLINE } : {}),
  };
}

// ─── the app ─────────────────────────────────────────────────────────────────

/**
 * Runs the app. Without raw keystrokes — a pipe, a dumb terminal, `--once` — it
 * paints the screen once and exits 0 instead of pretending to be interactive.
 */
export async function runTerminalApp(options: TerminalAppOptions): Promise<number> {
  const io = options.io;
  const parsed = parseTerminalAppArgs(options.argv, options.cwd);
  if (parsed.kind === "help") { io.write(`${HELP}\n`); return 0; }
  if (parsed.kind === "moved") {
    io.write(
      `\`ein ${parsed.verb}\` ahora es \`${INSTALLER_COMMAND} ${parsed.verb}\`.\n` +
      `\`ein\` sin argumentos abre la aplicación.\n`,
    );
    return 2;
  }
  if (parsed.kind === "usage") { io.write(`${HELP}\n`); return 2; }

  const cwd = parsed.cwd;
  const settings = options.settings ?? { read: readSettings, apply: applySetting };
  const readSessions = options.sessions ?? ((root: string) => productionSessions(root));
  // Probes start at the edge so they run while the intro plays and the first
  // screen is read; nothing in the loop ever waits on the network.
  const snapshot = options.system ? undefined : startUpdateEvidenceSnapshot({
    binary: async () => checkPiBinaryUpdate(await readPiBinaryVersion(defaultPiManifestPaths(homedir()))),
    packages: async () => ({ source: "packages", status: "skipped", reason: "requires-pi-runtime", freshness: "unknown" }),
    ein: async () => checkEinTemplateUpdate(await readEinVersion(resolveAgentDir())),
    claude: () => checkClaudeCodeUpdate(spawnVersionProbe),
  });
  const readSystem = options.system
    ?? (() => systemComponentsFrom(snapshot?.read(), { engramInstalled: existsSync(engramHome()) }));
  const launch = options.runtime?.launch ?? ((provider, reference) => productionLaunch(cwd, provider, reference));
  const runCommand = options.run ?? productionRun;

  const readSummary = options.summary
    ?? ((root: string, change?: string) =>
      summaryFromState(projectProjectState({ cwd: root, ...(change ? { selectedChange: change } : {}) })));
  const chrome = () => chromeFor(io);
  const palette = createPalette(
    !parsed.once && shouldUseColor({ isTTY: io.isTTY, env: io.env ?? process.env }),
  );

  const controllerPorts = (lifecycle: TerminalAppControllerPorts["lifecycle"]): TerminalAppControllerPorts => ({
    readSummary: (focusedChange, sessions) => {
      const next = readSummary(cwd, focusedChange);
      return next.sessions === undefined ? Object.freeze({ ...next, sessions }) : next;
    },
    settings: {
      read: () => settings.read(cwd),
      apply: (settingId, value) => settings.apply(cwd, settingId, value),
    },
    readSessions: () => readSessions(cwd),
    readSystem,
    launch,
    run: runCommand,
    lifecycle,
  });

  const paint = (controller: TerminalAppController, clear: boolean): void => {
    if (clear) io.clear?.();
    const model = controller.snapshot();
    const { columns, banner, tagline } = chrome();
    io.write(`${renderApp(model, { columns, palette, banner, tagline, footer: footerFor(model.summary) }).join("\n")}\n`);
  };

  const interactive = io.isTTY && io.onKey !== undefined && !parsed.once;
  if (!interactive) {
    const controller = createTerminalAppController(controllerPorts({ release: () => {}, resume: () => {}, exit: () => {} }));
    paint(controller, false);
    return 0;
  }

  // The terminal is a shared resource with two toggles, and asking twice for a
  // state it is already in leaks escape sequences into whatever runs next.
  let owned = false;
  const own = (take: boolean): void => {
    if (owned === take) return;
    owned = take;
    if (take) {
      io.setAltScreen?.(true);
      io.setRawMode?.(true);
      return;
    }
    io.setRawMode?.(false);
    io.setAltScreen?.(false);
  };

  own(true);
  if (parsed.intro) await playIntro(io, palette.enabled);

  return await new Promise<number>((resolve) => {
    let stop: (() => void) | undefined;
    let stopResize: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let finished = false;
    let released = false;
    let controller: TerminalAppController;

    const restore = (): void => {
      stop?.();
      stop = undefined;
      stopResize?.();
      stopResize = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
      own(false);
    };

    const finish = (code: number, newline = true): void => {
      if (finished) return;
      finished = true;
      restore();
      if (newline) io.write("\n");
      resolve(code);
    };

    const repaint = (): void => {
      if (finished) return;
      try { paint(controller, true); } catch { finish(1); }
    };

    const release = (): void => {
      released = true;
      stop?.();
      stop = undefined;
      own(false);
      io.write("\n");
    };

    const resume = (): void => {
      released = false;
      own(true);
      stop = io.onKey!(onKey);
      repaint();
    };

    function onKey(key: string): void {
      controller.dispatch({ kind: "key", key });
    }

    controller = createTerminalAppController(controllerPorts({
      release,
      resume,
      exit: (code) => finish(code, !released),
    }));
    unsubscribe = controller.subscribe(repaint);
    stop = io.onKey!(onKey);
    stopResize = io.onResize?.(repaint);
    repaint();
  });
}

function footerFor(summary: ProjectSummary): string | undefined {
  if (summary.sessions === undefined) return undefined;
  return summary.sessions === 1
    ? pick("1 sesión previa", "1 previous session")
    : pick(`${summary.sessions} sesiones previas`, `${summary.sessions} previous sessions`);
}

/**
 * 8-bit wipe-in: a dither edge sweeps the logo left to right. Skipped whenever
 * the terminal cannot animate, and abandoned as soon as the sleep seam says so.
 */
async function playIntro(io: TerminalAppIO, colour: boolean): Promise<void> {
  const sleep = io.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const columns = size(io.columns, 100);
  const paint = createPalette(colour).accent;
  const total = frameCount(columns);
  for (let frame = 0; frame <= total; frame += INTRO_COLUMN_STEP) {
    io.clear?.();
    io.write(`${bannerFrame(frame, columns).map(paint).join("\n")}\n`);
    await sleep(INTRO_FRAME_MS);
  }
  io.clear?.();
  io.write(`${bannerFinal(columns).map(paint).join("\n")}\n`);
  await sleep(INTRO_FRAME_MS * 6);
}

// ─── production seams ────────────────────────────────────────────────────────

function resolveAgentDir(): string {
  return process.env.EIN_PI_AGENT_HOME ?? join(homedir(), ".pi", "agent");
}

function engramHome(): string {
  return join(homedir(), ".engram-pi");
}

function productionSessions(cwd: string): RuntimeSessionList {
  const state = projectProjectState({ cwd });
  return collectRuntimeSessions(
    { cwd: state.identity.cwd, ...(state.identity.repositoryRoot ? { repositoryRoot: state.identity.repositoryRoot } : {}) },
    { limit: SESSION_LIST_LIMIT },
  );
}

/**
 * Launching goes through the same plan/execute pair the adapters own, so the
 * app inherits every guard those already enforce instead of re-implementing
 * them. Its only addition is telling apart "the runtime ran" from "the runtime
 * is not installed", which the app needs in order to stay alive.
 */
async function productionLaunch(
  cwd: string,
  provider: RuntimeProvider,
  reference?: string,
): Promise<LaunchOutcome> {
  const state = projectProjectState({ cwd });
  const adapter = createRuntimeSessionAdapter(provider);
  const intent = reference ? adapter.resume(state, reference) : adapter.create(state);
  if (intent.outcome !== "success") {
    return { kind: "unavailable", reason: intent.error?.code ?? intent.outcome };
  }
  const plan = buildLaunchPlan(state, intent.data);
  if (plan.outcome !== "success") {
    return { kind: "unavailable", reason: plan.error?.code ?? plan.outcome };
  }
  const executed = await executeLaunchPlan(plan.data);
  if (executed.outcome === "success") return { kind: "exited", code: 0 };
  if (executed.outcome === "unavailable") {
    return { kind: "unavailable", reason: executed.error?.code ?? "unavailable" };
  }
  return { kind: "exited", code: executed.error?.exitCode ?? 1 };
}

/** Runs one of the app's own declared commands, inheriting the terminal. */
async function productionRun(command: readonly string[]): Promise<number> {
  const [file, ...args] = command;
  if (!file) return 1;
  try {
    const child = Bun.spawn([file, ...args], { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    return await child.exited;
  } catch {
    return 1;
  }
}

/** Bounded spawn for version queries only; mirrors the workbench probe. */
const spawnVersionProbe: VersionProbeRunner = async ({ file, args, timeoutMs, maxBuffer }) => {
  const child = Bun.spawn([file, ...args], { stdout: "pipe", stderr: "ignore" });
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    const output = (await new Response(child.stdout).text()).slice(0, maxBuffer);
    return { stdout: output, exitCode: await child.exited };
  } finally {
    clearTimeout(timer);
  }
};

/** Wires the real terminal. Keystrokes arrive raw, one chunk per key. */
export function productionTerminalIO(): TerminalAppIO {
  return {
    write: (text) => { stdout.write(text); },
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    get columns() { return stdout.columns; },
    get rows() { return stdout.rows; },
    env: process.env,
    setRawMode: (raw) => { stdin.setRawMode?.(raw); },
    clear: () => { stdout.write("\u001b[2J\u001b[3J\u001b[H"); },
    setAltScreen: (active) => {
      // Cursor hidden with the screen: a block cursor parked on a painted row
      // reads as a second selection.
      stdout.write(active ? "\u001b[?1049h\u001b[?25l" : "\u001b[?25h\u001b[?1049l");
    },
    onResize: (handler) => {
      stdout.on("resize", handler);
      return () => { stdout.off("resize", handler); };
    },
    onKey: (handler) => {
      // One read can carry several keys — a paste, a fast typist, a pipe — and
      // handing the block over as one key makes the app look frozen.
      const listener = (chunk: Buffer | string): void => {
        for (const key of splitKeys(chunk.toString())) handler(key);
      };
      stdin.resume();
      stdin.on("data", listener);
      return () => { stdin.off("data", listener); stdin.pause(); };
    },
  };
}
