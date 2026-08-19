// =============================================================================
// EIN BANNER — intro de arranque, estetica de 16 bits
// Paleta: Carbon #0B0B0B · Concrete #FAF3F0 · Structure #737373 · Yellow
// #FFCA40. Blanco y amarillo mandan. El logo materializa en concreto y la I
// sella en amarillo; despues abre una VENTANA DE ESTADO estilo menu de SNES:
// marco doble, pestanas de seccion invertidas y lineas de puntos que llevan
// cada etiqueta hasta su valor.
//
// La geometria y la animacion del panel viven en `lib/banner-panel.ts` (modulo
// puro y testeable). Aqui solo se traducen sus celdas a color y se centran.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DefaultPackageManager,
  SettingsManager,
  VERSION,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_DIR } from "./ein-paths";
import { loadPalette, type RGB } from "./ein-brand";
import { I_RANGE, LOGO_LARGE, LOGO_SMALL, RULE_CH } from "../lib/ein-logo";
import { PANEL_FRAME_TICKS, PANEL_LEADER_TICKS, PANEL_ROW_TICKS, composeColumns, composedWidth, renderPanel, type PanelTone } from "../lib/banner-panel";
import { humanizeAge, listRecentSessions, type RecentSession } from "../lib/sessions";
import { LANG_LABEL, readArtifactLang, readChatLang, type Lang } from "../lib/lang";
import { TDD_LABEL, readTddMode } from "../lib/tdd";
import { readHypaMode, resolveHypaEnabled } from "../lib/hypa";
import { readCodegraphMode, resolveCodegraphEnabled } from "../lib/codegraph";
import { readPersonaMode } from "../lib/persona";
import { readMode } from "../lib/mode";
import { agentAutomaticParticipationLabel, readProjectAgentControlStatus } from "../lib/agent-controls";
import { GitBannerController, renderGitBannerRows, type ProcessRunner } from "../lib/banner-git";
import {
  createStartupProvenanceRecorder,
  type Evidence,
  type StartupProvenanceRecorder,
} from "../lib/startup-provenance";
import {
  detectPiEinUpdates as detectCanonicalPiEinUpdates,
  isPiEinRuntime,
  startPiEinUpdateNotice,
  type PiEinUpdateObservation,
  type UpdateNoticeProvenance,
} from "../lib/ein-update-notice";
import {
  checkEinTemplateUpdate as checkEinTemplateUpdateProbe,
  checkPiBinaryUpdate as checkPiBinaryUpdateProbe,
  readEinVersion,
} from "../lib/update-probes";

type BannerModuleProvenance = Readonly<{
  recorder: StartupProvenanceRecorder;
  loadEventId: string | null;
}>;

function extensionSourceEvidence(): Evidence<string> {
  const source = process.env.EIN_STARTUP_PROVENANCE_EXTENSION_SOURCE?.trim();
  return source
    ? { state: "observed", value: source }
    : { state: "unknown" };
}

function createBannerModuleProvenance(): BannerModuleProvenance | null {
  if (process.env.EIN_STARTUP_PROVENANCE !== "1") return null;

  const diagnosticRunId = process.env.EIN_STARTUP_PROVENANCE_RUN_ID?.trim();
  const outputPath = process.env.EIN_STARTUP_PROVENANCE_OUTPUT?.trim();
  if (!diagnosticRunId || !outputPath) return null;

  const recorder = createStartupProvenanceRecorder({
    enabled: true,
    diagnosticRunId,
    nextEventId: randomUUID,
    wallClock: () => new Date().toISOString(),
    monotonicClock: () => performance.now(),
    processIdentity: {
      state: "observed",
      value: { pid: process.pid, ppid: process.ppid },
    },
    extensionSourceIdentity: extensionSourceEvidence(),
    sink: (event) => {
      appendFileSync(outputPath, `${JSON.stringify(event)}\n`, "utf8");
    },
  });
  const load = recorder.record({
    eventType: "load",
    parentEventId: null,
    runtimeSessionIdentity: { state: "unknown" },
  });

  return {
    recorder,
    loadEventId: load.state === "observed" ? load.event.eventId : null,
  };
}

const bannerModuleProvenance = createBannerModuleProvenance();

function recordBannerRegistration(): string | null {
  if (!bannerModuleProvenance?.loadEventId) return null;
  const registration = bannerModuleProvenance.recorder.record({
    eventType: "registration",
    parentEventId: bannerModuleProvenance.loadEventId,
    runtimeSessionIdentity: { state: "unknown" },
  });
  return registration.state === "observed" ? registration.event.eventId : null;
}

function recordSessionStart(
  registrationEventId: string | null,
  hasUI: boolean,
  cliFiltered: boolean,
): UpdateNoticeProvenance | undefined {
  if (!bannerModuleProvenance || !registrationEventId) return undefined;
  const runtimeSessionIdentity = { state: "unknown" } as const;
  const invocation = bannerModuleProvenance.recorder.record({
    eventType: "session_start",
    parentEventId: registrationEventId,
    runtimeSessionIdentity,
    hasUI: { state: "observed", value: hasUI },
    cliFiltered: { state: "observed", value: cliFiltered },
  });
  if (invocation.state !== "observed") return undefined;
  return {
    recorder: bannerModuleProvenance.recorder,
    invocationEventId: invocation.event.eventId,
    runtimeSessionIdentity,
  };
}

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER_BYTES = 1_024 * 1_024;

type ExecFileFailure = NodeJS.ErrnoException & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  killed?: boolean;
};

const gitProcessRunner: ProcessRunner = {
  async run({ file, args, cwd, timeout }) {
    try {
      const { stdout, stderr } = await execFileAsync(file, args, {
        cwd,
        encoding: "utf8",
        timeout,
        maxBuffer: GIT_MAX_BUFFER_BYTES,
      });
      return { stdout: String(stdout), stderr: String(stderr), exitCode: 0 };
    } catch (failure) {
      const error = failure as ExecFileFailure;
      return {
        stdout: String(error.stdout ?? ""),
        stderr: String(error.stderr ?? error.message ?? ""),
        exitCode: typeof error.code === "number" ? error.code : 1,
        cause: error.code === "ETIMEDOUT" || error.killed ? "timeout" : undefined,
      };
    }
  },
};

// Geometria del logo: fuente unica en `lib/ein-logo.ts`, compartida con el
// splash de la app de terminal. Aqui solo se PINTA (buffer de la extension).

const SUBTITLE = ".SAMUHLO · PI WORKBENCH";

// Brand palette (flat — no gradients). Single source: brand.json via ein-brand.
const PALETTE = loadPalette();
const CARBON: RGB = PALETTE.carbon;
const CONCRETE: RGB = PALETTE.concrete;
const STRUCTURE: RGB = PALETTE.structure;
const YELLOW: RGB = PALETTE.yellow;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function fgSeq(c: RGB): string {
  return `\x1b[38;2;${clampByte(c.r)};${clampByte(c.g)};${clampByte(c.b)}m`;
}

function bgSeq(c: RGB): string {
  return `\x1b[48;2;${clampByte(c.r)};${clampByte(c.g)};${clampByte(c.b)}m`;
}

// -----------------------------------------------------------------------------
// Materialize animation: each logo cell appears with a pseudo-random delay
// (biased left-to-right) and resolves ░ → ▒ → ▓ → █, like concrete setting.
// The I settles in concrete like the rest and then the yellow stamps in as a
// single global snap — the brand gesture as the final gesture.
// -----------------------------------------------------------------------------
const SWEEP = 0.45; // ticks of delay per logo column
const JITTER = 7; // max random extra delay per cell, in ticks
const SETTLE = 6; // ticks from first noise to solid block
const STAMP_HOLD = 3; // ticks the yellow stamp renders bold

// Deterministic per-cell hash so the shimmer is stable across renders.
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function cellDelay(x: number, y: number): number {
  return Math.floor(x * SWEEP) + (cellHash(x, y) % JITTER);
}

function maxCellDelay(width: number): number {
  return Math.floor((width - 1) * SWEEP) + JITTER - 1;
}

type NoiseCell = { char: string; color: RGB; bold?: boolean; dim?: boolean };

// Cell appearance at a given age (ticks since its delay elapsed).
function noiseCell(char: string, age: number, finalColor: RGB): NoiseCell | null {
  if (age < 0) return null;
  if (age < 2) return { char: "░", color: STRUCTURE, dim: true };
  if (age < 4) return { char: "▒", color: STRUCTURE };
  if (age < SETTLE) return { char: "▓", color: CONCRETE, dim: true };
  return { char, color: finalColor };
}

function padLines(lines: readonly string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

function shortenHome(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

type LayoutCell = {
  char: string;
  color?: RGB;
  bg?: RGB;
  bold?: boolean;
  dim?: boolean;
};

class LayoutBuilder {
  lines: LayoutCell[][] = [];

  addRow() {
    this.lines.push([]);
  }

  add(text: string, color?: RGB, opts: { bg?: RGB; bold?: boolean; dim?: boolean } = {}) {
    const row = this.lines[this.lines.length - 1];
    for (const char of text) {
      row.push({ char, color, bg: opts.bg, bold: opts.bold, dim: opts.dim });
    }
  }

  center(width: number) {
    const row = this.lines[this.lines.length - 1];
    const pad = Math.max(0, Math.floor((width - row.length) / 2));
    const prefix: LayoutCell[] = Array.from({ length: pad }, () => ({ char: " " }));
    this.lines[this.lines.length - 1] = prefix.concat(row);
  }
}

// El modo completo pinta logo + panel EN DOS COLUMNAS, asi que su minimo es el
// ancho compuesto real (54 del logo + 3 de calle + 62 del panel = 119), no un
// 80 heredado de cuando el banner era una torre. Con 80 columnas caia al
// apilado, que mide 41 filas y se salia por abajo del terminal: ese era el
// "no llega hasta el fondo".
const FULL_INTRO_MIN_ROWS = 30;
const FULL_INTRO_MIN_COLS = composedWidth(Math.max(...LOGO_LARGE.map((line) => line.length)));
const MINIMAL_INTRO_MIN_ROWS = 14;
const MINIMAL_INTRO_MIN_COLS = 40;
const RESIZE_DEBOUNCE_MS = 150;
const RESIZE_GRACE_PERIOD_MS = 300;

type IntroMode = "full" | "minimal" | "skip";

function pickIntroMode(rows: number, cols: number): IntroMode {
  if (rows >= FULL_INTRO_MIN_ROWS && cols >= FULL_INTRO_MIN_COLS) return "full";
  if (rows >= MINIMAL_INTRO_MIN_ROWS && cols >= MINIMAL_INTRO_MIN_COLS) return "minimal";
  return "skip";
}

function currentIntroMode(): IntroMode {
  const rows = process.stdout.rows ?? 0;
  const cols = process.stdout.columns ?? 0;
  return pickIntroMode(rows, cols);
}

function updateObservation(
  source: PiEinUpdateObservation["source"],
  status: PiEinUpdateObservation["status"],
  reason: string,
  freshness: PiEinUpdateObservation["freshness"] = "current",
): PiEinUpdateObservation {
  return { source, status, reason, freshness };
}

// Gated wrappers: PI_OFFLINE/PI_SKIP_VERSION_CHECK short-circuit before the
// portable probe runs, and the SDK-provided version is injected here — the
// only place in this file allowed to know about `VERSION` and `AGENT_DIR`.
async function checkPiBinaryUpdate(): Promise<PiEinUpdateObservation> {
  if (process.env.PI_OFFLINE || process.env.PI_SKIP_VERSION_CHECK) return updateObservation("binary", "skipped", "offline-check");
  return checkPiBinaryUpdateProbe(VERSION);
}

async function checkPiPackageUpdates(cwd: string): Promise<PiEinUpdateObservation> {
  if (process.env.PI_OFFLINE) return updateObservation("packages", "skipped", "offline-check");
  try {
    const settingsManager = SettingsManager.create(cwd, AGENT_DIR);
    const packageManager = new DefaultPackageManager({
      cwd,
      agentDir: AGENT_DIR,
      settingsManager,
    });
    const available = (await packageManager.checkForAvailableUpdates()).length > 0;
    return updateObservation("packages", available ? "update-available" : "current", "read-success");
  } catch {
    return updateObservation("packages", "error", "probe-failed", "unknown");
  }
}

async function checkEinTemplateUpdate(): Promise<PiEinUpdateObservation> {
  if (process.env.PI_OFFLINE) return updateObservation("ein", "skipped", "offline-check");
  const installed = await readEinVersion(AGENT_DIR);
  return checkEinTemplateUpdateProbe(installed);
}

export async function detectPiEinUpdates(cwd: string) {
  return detectCanonicalPiEinUpdates(cwd, {
    runtime: () => isPiEinRuntime(),
    sources: {
      binary: checkPiBinaryUpdate,
      packages: () => checkPiPackageUpdates(cwd),
      ein: checkEinTemplateUpdate,
    },
  });
}

async function countMdFiles(dir: string): Promise<number> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

async function countExtensions(): Promise<number> {
  try {
    const files = await readdir(join(AGENT_DIR, "extensions"));
    return files.filter((f) => f.endsWith(".ts")).length;
  } catch {
    return 0;
  }
}

export default function (pi: ExtensionAPI) {
  let registrationEventId: string | null = null;
  pi.on("session_start", async (_event, ctx) => {
    // No animated intro while running a CLI command (pi update, pi install, ...).
    const isCLICommand =
      process.argv.length > 2 &&
      !process.argv.every((arg) => arg.startsWith("-") || arg.endsWith(".ts"));
    const noticeProvenance = recordSessionStart(
      registrationEventId,
      ctx.hasUI,
      isCLICommand,
    );

    if (!ctx.hasUI) return;
    if (isCLICommand) return;

    startPiEinUpdateNotice(
      ctx,
      detectPiEinUpdates,
      undefined,
      undefined,
      noticeProvenance,
    );

    if (currentIntroMode() === "skip") return;

    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    const logoLarge = padLines(LOGO_LARGE);
    const logoSmall = padLines(LOGO_SMALL);
    const startupLogo = currentIntroMode() === "full" ? logoLarge : logoSmall;

    // Cadence: materialize → yellow stamp → rule → subtitle.
    const NOISE_END_TICK = maxCellDelay(startupLogo.width) + SETTLE;
    const STAMP_TICK = NOISE_END_TICK + 3;
    const RULE_START_TICK = STAMP_TICK + STAMP_HOLD - 1;
    const RULE_END_TICK = RULE_START_TICK + 6;
    const SUB_START_TICK = RULE_END_TICK - 2;
    const SUB_END_TICK = SUB_START_TICK + Math.ceil(SUBTITLE.length / 2);
    // ── Fases del panel de estado (estilo ventana de RPG de 16 bits) ──────────
    // El marco se dibuja solo: el borde superior barre de izquierda a derecha,
    // los laterales bajan, y el inferior cierra. Luego cada sección "abre" y sus
    // filas se rellenan con la línea de puntos que lleva la etiqueta al valor.
    const PANEL_START_TICK = STAMP_TICK;
    // Cota superior de filas del panel. Generosa a proposito: si el cambio real
    // tiene mas filas que la cuenta, FINISH_TICK corta la animacion antes de
    // dibujar el borde inferior y la caja se queda abierta.
    const PANEL_MAX_ROWS = 34;
    const PANEL_END_TICK =
      PANEL_START_TICK + PANEL_FRAME_TICKS + PANEL_MAX_ROWS * PANEL_ROW_TICKS + PANEL_LEADER_TICKS;
    const FINISH_TICK = Math.max(SUB_END_TICK + 4, PANEL_END_TICK);

    const [einVersion, extensionsCount, agentsCount] = await Promise.all([
      readEinVersion(AGENT_DIR),
      countExtensions(),
      countMdFiles(join(AGENT_DIR, "agents")),
    ]);
    let mcpServersCount = 0;

    // Recent sessions across projects (distinct projects), excluding this one.
    let recentSessions: RecentSession[] = [];
    try {
      const currentSessionPath = (
        ctx as unknown as { sessionManager?: { getSessionFile?: () => string | undefined } }
      ).sessionManager?.getSessionFile?.();
      recentSessions = listRecentSessions(3, {
        dedupeByProject: true,
        excludePath: currentSessionPath,
      });
    } catch {
      recentSessions = [];
    }

    // Active language: chat/UI (shared locale) and artifacts (project config).
    const gitLang: Lang = readChatLang();
    const langChat = LANG_LABEL[gitLang];
    const langArtifact = LANG_LABEL[readArtifactLang(ctx.cwd)];
    const tddLabel = TDD_LABEL[readTddMode(ctx.cwd)];
    const personaLabel = readPersonaMode(ctx.cwd);
    const modeLabel = readMode(ctx.cwd);
    // Hypa: modo + estado resuelto en auto (como TDD muestra su label).
    const hypaMode = readHypaMode(ctx.cwd);
    const hypaLabel =
      hypaMode === "auto"
        ? `auto·${resolveHypaEnabled(ctx.cwd) ? "on" : "off"}`
        : hypaMode;
    // Codegraph: mismo formato modo·estado.
    const cgMode = readCodegraphMode(ctx.cwd);
    // `on` declara la intención; lo que importa enseñar es si está ACTIVO de
    // verdad, que exige índice. Sin él, `on·sin índice` dice la verdad entera.
    const cgLabel =
      cgMode === "on"
        ? resolveCodegraphEnabled(ctx.cwd)
          ? "on"
          : "on·sin índice"
        : cgMode;
    const cleanerLabel = agentAutomaticParticipationLabel(readProjectAgentControlStatus(ctx.cwd, "cleaner").enabled);
    const architectLabel = agentAutomaticParticipationLabel(readProjectAgentControlStatus(ctx.cwd, "architect").enabled);

    const allCommands = pi.getCommands();
    const skillsCount = allCommands.filter((c) => c.source === "skill").length;
    const allTools = pi.getAllTools();
    const toolsCount = allTools.filter(
      (t) => !["builtin", "sdk"].includes(t.sourceInfo.source),
    ).length;

    setTimeout(() => {
      (async () => {
        try {
          const raw = await readFile(join(AGENT_DIR, "mcp.json"), "utf8");
          const cfg = JSON.parse(raw);
          mcpServersCount = Object.keys(cfg.mcpServers || {}).length;
        } catch {
          mcpServersCount = 0;
        }
      })();
    }, 150);

    let tick = 0;
    const state = {
      timer: null as NodeJS.Timeout | null,
      mode: currentIntroMode() as IntroMode,
      resizeHandler: null as (() => void) | null,
      resizeDebounceTimer: null as NodeJS.Timeout | null,
    };

    const cleanup = () => {
      if (state.timer) {
        clearInterval(state.timer);
        state.timer = null;
      }
      if (state.resizeHandler) {
        process.stdout.off("resize", state.resizeHandler);
        state.resizeHandler = null;
      }
      if (state.resizeDebounceTimer) {
        clearTimeout(state.resizeDebounceTimer);
        state.resizeDebounceTimer = null;
      }
    };

    let headerActive = false;
    let activeTui: { requestRender(): void } | null = null;
    const gitController = new GitBannerController(gitProcessRunner, {
      onRefresh: () => {
        const tui = headerActive ? activeTui : null;
        if (!tui) return;
        try {
          tui.requestRender();
        } catch {
          headerActive = false;
          activeTui = null;
        }
      },
    });

    setTimeout(() => {
      gitController.refresh(ctx.cwd);
    }, 100);

    setTimeout(() => {
      ctx.ui.setHeader((tui, theme) => {
        headerActive = true;
        activeTui = tui;
        if (state.timer) clearInterval(state.timer);

        const animStart = Date.now();
        // Holgura real sobre la animacion mas larga (~2.3s). Con 3000 el corte
        // llegaba antes que el borde inferior del panel y la caja quedaba abierta.
        const HARD_TIMEOUT_MS = 5000;

        state.timer = setInterval(() => {
          tick++;
          const elapsed = Date.now() - animStart;
          if (tick > FINISH_TICK || elapsed > HARD_TIMEOUT_MS) {
            cleanup();
            return;
          }
          try {
            tui.requestRender();
          } catch {
            cleanup();
          }
        }, 30);

        const bootStart = Date.now();
        const resizeHandler = () => {
          if (Date.now() - bootStart < RESIZE_GRACE_PERIOD_MS) return;
          if (state.resizeDebounceTimer) clearTimeout(state.resizeDebounceTimer);
          state.resizeDebounceTimer = setTimeout(() => {
            state.resizeDebounceTimer = null;
            const next = currentIntroMode();
            if (next === state.mode) return;
            state.mode = next;
            if (next === "skip") {
              cleanup();
              process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
              return;
            }
            try {
              tui.requestRender();
            } catch {
              cleanup();
            }
          }, RESIZE_DEBOUNCE_MS);
        };
        state.resizeHandler = resizeHandler;
        process.stdout.on("resize", resizeHandler);

        return {
          render(width: number): string[] {
            if (state.mode === "skip") return [];

            const logoBase = state.mode === "full" ? logoLarge : logoSmall;
            const iRange = state.mode === "full" ? I_RANGE.large : I_RANGE.small;
            const b = new LayoutBuilder();
            // Mismo lenguaje que la placa de specs: etiqueta gris a la izquierda
            // y valor en concreto. Sin `■` amarillo por fila — el acento se
            // reserva para la placa de versión, no se reparte por cada dato.
            const addGitBannerRows = () => {
              const labelWidth = 10;
              for (const gitRow of renderGitBannerRows(gitController.getSnapshot(), gitLang, width)) {
                for (const [index, value] of gitRow.value.split(" ↵ ").entries()) {
                  b.addRow();
                  b.add((index === 0 ? gitRow.label.toUpperCase() : "").padEnd(labelWidth), STRUCTURE);
                  b.add(value, CONCRETE);
                  b.center(width);
                }
              }
            };

            // DISPOSICION EN DOS COLUMNAS
            // Apilado, el banner medía 13 filas de logo + 28 de panel = 41, y el
            // modo completo solo exige 30 filas de terminal: se salía por abajo.
            // Lado a lado la altura es el MAXIMO de las dos columnas, no la suma,
            // y de paso aprovecha el ancho en vez de crecer hacia abajo.
            type Cell = { text: string; color?: RGB; bg?: RGB; bold?: boolean; dim?: boolean };
            const left: Cell[][] = [];

            // Logo: materialize por celda; la I sella en amarillo al final.
            for (let y = 0; y < logoBase.lines.length; y++) {
              const logoLine = logoBase.lines[y];
              const row: Cell[] = [];
              for (let x = 0; x < logoLine.length; x++) {
                const ch = logoLine[x];
                if (ch === " ") { row.push({ text: " " }); continue; }
                const cell = noiseCell(ch, tick - cellDelay(x, y), CONCRETE);
                if (!cell) { row.push({ text: " " }); continue; }
                const settled = cell.char === ch;
                if (settled && tick >= STAMP_TICK && x >= iRange.start && x <= iRange.end) {
                  row.push({ text: ch, color: YELLOW, bold: tick < STAMP_TICK + STAMP_HOLD });
                } else {
                  row.push({ text: cell.char, color: cell.color, bold: cell.bold, dim: cell.dim });
                }
              }
              left.push(row);
            }

            // Regla estructural, abriéndose desde el centro.
            {
              const prog = tick < RULE_START_TICK
                ? -1
                : Math.min(1, (tick - RULE_START_TICK) / Math.max(1, RULE_END_TICK - RULE_START_TICK));
              const half = Math.floor((logoBase.width / 2) * prog);
              const center = Math.floor(logoBase.width / 2);
              const row: Cell[] = [];
              for (let x = 0; x < logoBase.width; x++) {
                row.push(prog >= 0 && Math.abs(x - center) <= half
                  ? { text: RULE_CH, color: STRUCTURE }
                  : { text: " " });
              }
              left.push(row);
            }

            // Subtítulo a máquina de escribir; el punto inicial en amarillo.
            {
              const pad = Math.max(0, Math.floor((logoBase.width - SUBTITLE.length) / 2));
              const reveal = Math.floor((tick - SUB_START_TICK) * 2);
              const row: Cell[] = [];
              for (let x = 0; x < logoBase.width; x++) {
                const i = x - pad;
                const ch = i >= 0 && i < SUBTITLE.length ? SUBTITLE[i] : " ";
                if (i < 0 || i >= SUBTITLE.length || ch === " " || tick < SUB_START_TICK || i > reveal) {
                  row.push({ text: " " });
                  continue;
                }
                row.push({ text: ch!, color: i === 0 ? YELLOW : STRUCTURE, bold: i === 0 });
              }
              left.push(row);
            }

            if (state.mode === "full") {
              const fit = (v: unknown, w: number) =>
                String(v ?? "").replace(/\s+/g, " ").trim().slice(0, w);

              // La placa de versión viaja con el logo, a la izquierda: es
              // identidad, no un dato mas del panel.
              const plate = ` EIN ${einVersion} `;
              const platePad = Math.max(0, Math.floor((logoBase.width - plate.length - 12) / 2));
              left.push([]);
              left.push([
                { text: " ".repeat(platePad) },
                { text: plate, color: CARBON, bg: YELLOW, bold: true },
                { text: "  " },
                { text: `PI v${VERSION}`, color: STRUCTURE },
              ]);

              const isOn = (label: string) => Boolean(label) && !/^(off|no|desactivad)/i.test(label);
              const gitFields = renderGitBannerRows(gitController.getSnapshot(), gitLang, width)
                .flatMap((gitRow) =>
                  gitRow.value.split(" \u21b5 ").map((value, index) => ({
                    label: index === 0 ? gitRow.label.toUpperCase() : "",
                    value,
                  })),
                );

              const panelData = {
                plate: " ESTADO ",
                right: shortenHome(ctx.cwd),
                sections: [
                  { kind: "fields" as const, title: "SISTEMA", fields: [
                    { label: "AGENTES", value: `${agentsCount}` },
                    { label: "EXTENSIONES", value: `${extensionsCount}` },
                    { label: "TOOLS", value: `${toolsCount}` },
                    { label: "SKILLS", value: `${skillsCount}` },
                    { label: "MCP", value: `${mcpServersCount} srv` } ] },
                  { kind: "fields" as const, title: "SESION", fields: [
                    { label: "MODO", value: fit(modeLabel, 24) },
                    { label: "PERSONA", value: fit(personaLabel, 24) },
                    { label: "IDIOMA", value: langChat === langArtifact ? langChat : `${langChat} / ${langArtifact}` },
                    { label: "TDD", value: fit(tddLabel, 24) } ] },
                  { kind: "chips" as const, label: "ACTIVO", chips: [
                    { text: "hypa", on: isOn(hypaLabel) },
                    { text: "codegraph", on: isOn(cgLabel) },
                    { text: "cleaner", on: isOn(cleanerLabel) },
                    { text: "architect", on: isOn(architectLabel) } ] },
                  { kind: "fields" as const, title: "REPO", fields: gitFields },
                  ...(recentSessions.length
                    ? [{ kind: "loose" as const, fields: [
                        ...recentSessions.map((session, index) => ({
                          label: index === 0 ? "RECIENTES" : "",
                          value: session.project,
                          trail: humanizeAge(session.ageMs),
                        })),
                        { label: "", value: "pi -c continuar / pi -r elegir / /ein:resume", note: true },
                      ] }]
                    : []),
                ],
              };

              const TONE: Record<PanelTone, RGB> = {
                frame: YELLOW, label: STRUCTURE, value: CONCRETE, plate: CARBON, dim: STRUCTURE, accent: YELLOW,
              };
              const panel: Cell[][] = renderPanel(panelData, tick - PANEL_START_TICK).map((line) =>
                line.map((cell) => ({
                  text: cell.text,
                  color: TONE[cell.tone],
                  ...(cell.tone === "plate" ? { bg: YELLOW } : {}),
                  ...(cell.bold ? { bold: true } : {}),
                  ...(cell.tone === "dim" ? { dim: true } : {}),
                })),
              );

              // Lado a lado solo si el terminal da de sí; si no, apilado, que es
              // lo que cabe en un terminal estrecho.
              // El ancho compuesto se reserva DESDE EL PRIMER FOTOGRAMA, aunque
              // el panel todavia no exista. Sin esto el centrado se calculaba
              // solo sobre el logo, y al aparecer la caja el logo saltaba a la
              // izquierda: ese era el "barrido" que movia el EIN de sitio.
              const side = width >= composedWidth(logoBase.width);
              const composed = side
                ? composeColumns<Cell, Cell>(left, logoBase.width, panel, (gap) => ({ text: " ".repeat(gap) }))
                : [...left, [], ...panel];
              const rows = composed;

              // Aire arriba y abajo: el banner pinta sobre pantalla limpia y
              // pegado al borde se lee peor.
              b.addRow();
              b.center(width);
              for (const row of rows) {
                b.addRow();
                for (const cell of row) {
                  b.add(cell.text, cell.color, {
                    ...(cell.bg ? { bg: cell.bg } : {}),
                    ...(cell.bold ? { bold: true } : {}),
                    ...(cell.dim ? { dim: true } : {}),
                  });
                }
                b.center(width);
              }
              b.addRow();
              b.center(width);
            } else {
              for (const row of left) {
                b.addRow();
                for (const cell of row) {
                  b.add(cell.text, cell.color, {
                    ...(cell.bold ? { bold: true } : {}),
                    ...(cell.dim ? { dim: true } : {}),
                  });
                }
                b.center(width);
              }
            }

            if (state.mode === "minimal") addGitBannerRows();

            const out: string[] = [];
            for (const row of b.lines) {
              let line = "";
              for (const cell of row) {
                if (!cell.color && !cell.bg) {
                  line += cell.dim ? theme.fg("dim", cell.char) : cell.char;
                  continue;
                }
                let body = cell.color ? `${fgSeq(cell.color)}${cell.char}\x1b[39m` : cell.char;
                if (cell.bg) body = `${bgSeq(cell.bg)}${body}\x1b[49m`;
                if (cell.bold) body = `\x1b[1m${body}\x1b[22m`;
                if (cell.dim) body = `\x1b[2m${body}\x1b[22m`;
                line += body;
              }
              out.push(truncateToWidth(line, Math.max(1, width), ""));
            }

            return out;
          },
          invalidate() {
            if (activeTui === tui) {
              headerActive = false;
              activeTui = null;
            }
            gitController.invalidate();
            cleanup();
          },
        };
      });
    }, 50);
  });
  registrationEventId = recordBannerRegistration();
}
