// =============================================================================
// EIN BANNER — la marca de arranque y el estado
// Wordmark con la `i` en amarillo, subtitulo, versiones, y debajo el panel de
// estado entrando en cascada. Sin marco y sin logo de bloque: el gesto de marca
// es un solo elemento amarillo sobre neutro, y eso cabe en una fila.
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
import { PANEL_FRAME_TICKS, PANEL_LEADER_TICKS, PANEL_ROW_TICKS, PANEL_W, renderPanel, type PanelTone } from "../lib/banner-panel";
import { renderTv, tvRowWidth, TV_WIDTH, type TvCut, type TvTone } from "../lib/ein-tv";
import { humanizeAge, listRecentSessions, type RecentSession } from "../lib/sessions";
import { LANG_LABEL, readArtifactLang, readChatLang, type Lang } from "../lib/lang";
import { TDD_LABEL, readTddMode } from "../lib/tdd";
import { readHypaMode, resolveHypaEnabled } from "../lib/hypa";
import { readCodegraphMode, resolveCodegraphEnabled } from "../lib/codegraph";
import { readPersonaMode } from "../lib/persona";
import { readLinearIntegration } from "../lib/linear-integration";
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

const SUBTITLE = ".samuhlo · pi workbench";

// El material del mueble. Tres tonos de plástico para que el aparato tenga
// volumen — la técnica del arte ANSI, donde el relieve sale del color y no de
// la forma. No entran en `brand.json` a propósito: no son colores del producto,
// son de un objeto dibujado.
const PLASTIC = {
  edge: { r: 138, g: 129, b: 117 },
  body: { r: 110, g: 103, b: 92 },
  shadow: { r: 74, g: 68, b: 58 },
  knob: { r: 196, g: 183, b: 158 },
  danger: { r: 217, g: 108, b: 95 },
  dim: { r: 90, g: 90, b: 90 },
} as const;

// Brand palette (flat — no gradients). Single source: brand.json via ein-brand.
const PALETTE = loadPalette();
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

// El minimo del modo completo es el ancho del panel mas su respiro. Con el logo
// de bloque retirado ya no hay una columna de 54 que reservar, asi que el banner
// entra entero en terminales donde antes caia al modo minimo.
const FULL_INTRO_MIN_ROWS = 30;
const FULL_INTRO_MIN_COLS = PANEL_W + 4;
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

    // La marca ya no se materializa celda a celda, así que no hay cadencia que
    // esperar antes del panel: entra de inmediato. Lo único que queda animado es
    // la cascada de filas del estado, que es un reveal único y además informa.
    const PANEL_START_TICK = 0;
    // Cota superior de filas del panel. Generosa a proposito: si el cambio real
    // tiene mas filas que la cuenta, FINISH_TICK corta la animacion antes de
    // dibujar el borde inferior y la caja se queda abierta.
    const PANEL_MAX_ROWS = 34;
    const PANEL_END_TICK =
      PANEL_START_TICK + PANEL_FRAME_TICKS + PANEL_MAX_ROWS * PANEL_ROW_TICKS + PANEL_LEADER_TICKS;
    const FINISH_TICK = PANEL_END_TICK;

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
    const linearLabel = readLinearIntegration(ctx.cwd);
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

            const b = new LayoutBuilder();
            // Etiqueta gris a la izquierda y valor en concreto, como el panel.
            // Sin marcador por fila: el acento se reserva para la `i` y para el
            // foco, no se reparte por cada dato.
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

            type Cell = { text: string; color?: RGB; bg?: RGB; bold?: boolean; dim?: boolean };
            const left: Cell[][] = [];

            // LA MARCA DE ARRANQUE
            // Un televisor de tubo con una terminal dentro. La geometría vive en
            // `lib/ein-tv.ts` y se comparte con el splash de la app; aquí solo se
            // traducen sus tonos a color.
            //
            // Por qué un objeto y no unas letras: dibujar una letra con bloques
            // es pelearse con una rejilla de 2×4 píxeles, sale roma, y el fallo
            // se ve porque todo el mundo sabe cómo es una E. Un televisor son
            // cuatro rectángulos, dos ruedas y una antena — y las letras de
            // dentro son TEXTO, así que no hay letterform que falle.
            //
            // El arranque conserva su momento: el panel sigue entrando en
            // cascada, que es un reveal único (STYLE.md // 001) y además informa.
            const TV_TONE: Record<TvTone, RGB> = {
              edge: PLASTIC.edge,
              body: PLASTIC.body,
              shadow: PLASTIC.shadow,
              knob: PLASTIC.knob,
              screen: CONCRETE,
              accent: YELLOW,
              danger: PLASTIC.danger,
              dim: PLASTIC.dim,
            };
            // Un televisor cortado por la derecha no es un televisor: se baja de
            // corte antes que recortar.
            const tvCut: TvCut = width >= TV_WIDTH.full + 2
              ? "full"
              : width >= TV_WIDTH.compact + 2
                ? "compact"
                : "minimal";
            for (const tvRow of renderTv({ cut: tvCut })) {
              left.push(tvRow.map((span) => ({ text: span.text, color: TV_TONE[span.tone] })));
            }
            const tvWidth = Math.max(...renderTv({ cut: tvCut }).map(tvRowWidth));
            left.push([]);
            left.push([
              { text: " ".repeat(Math.max(0, Math.floor((tvWidth - SUBTITLE.length) / 2))) },
              { text: SUBTITLE, color: STRUCTURE },
            ]);

            if (state.mode === "full") {
              const fit = (v: unknown, w: number) =>
                String(v ?? "").replace(/\s+/g, " ").trim().slice(0, w);

              // Las versiones bajan a gris junto al wordmark. Eran una placa
              // invertida —carbón sobre amarillo— y con ella el arranque gastaba
              // su único acento en un dato que nadie consulta con urgencia. El
              // amarillo queda para la `i` y para el foco, que es lo que marca.
              left.push([
                { text: `ein v${einVersion}`, color: STRUCTURE },
                { text: "  ·  ", color: STRUCTURE, dim: true },
                { text: `pi v${VERSION}`, color: STRUCTURE },
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
                title: "estado",
                right: shortenHome(ctx.cwd),
                sections: [
                  { kind: "fields" as const, title: "SISTEMA", fields: [
                    { label: "AGENTES", value: `${agentsCount}` },
                    { label: "EXTENSIONES", value: `${extensionsCount}` },
                    { label: "TOOLS", value: `${toolsCount}` },
                    { label: "SKILLS", value: `${skillsCount}` },
                    { label: "MCP", value: `${mcpServersCount} srv` } ] },
                  { kind: "fields" as const, title: "SESION", fields: [
                    { label: "LINEAR", value: fit(linearLabel, 24) },
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
                frame: YELLOW, label: STRUCTURE, value: CONCRETE, dim: STRUCTURE, accent: YELLOW,
              };
              const panel: Cell[][] = renderPanel(panelData, tick - PANEL_START_TICK).map((line) =>
                line.map((cell) => ({
                  text: cell.text,
                  color: TONE[cell.tone],
                                    ...(cell.bold ? { bold: true } : {}),
                  ...(cell.tone === "dim" ? { dim: true } : {}),
                })),
              );

              // APILADO, ya no en dos columnas.
              // Las dos columnas existían para que trece filas de logo y veinte
              // de panel no sumaran cuarenta y una y se salieran por abajo. Con
              // la marca en tres filas el problema desaparece, y apilar lee mejor:
              // marca, respiro, estado. Que es el orden en que se mira.
              const rows = [...left, [], ...panel];

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
