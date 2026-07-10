// =============================================================================
// EIN BANNER — brutalist industrial intro
// Brand: Carbon #0C0011 · Concrete White #FAF3F0 · Structure Gray #737373 ·
// Industrial Yellow #FFCA40. Flat color, no metallic gradients: the logo is
// concrete with the I in yellow (like the brand wordmark's yellow glyph),
// a structural rule, and a spec-plate info grid with yellow block markers.
// =============================================================================

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_DIR } from "./ein-paths";
import { loadPalette, type RGB } from "./ein-brand";
import { humanizeAge, listRecentSessions, type RecentSession } from "../lib/sessions";
import { LANG_LABEL, readArtifactLang, readChatLang } from "../lib/lang";
import { TDD_LABEL, readTddMode } from "../lib/tdd";
import { readHypaMode, resolveHypaEnabled } from "../lib/hypa";
import { readPersonaMode } from "../lib/persona";
import { readMode } from "../lib/mode";

const execAsync = promisify(exec);

// Estado de git para "saber antes de tocar": rama vs remoto (una ronda de red
// con ls-remote) + cambios sin commitear. Determinista, cero tokens de modelo.
// Best-effort: offline/sin repo/sin remoto degradan a "sync?"/"local"/"".
async function computeGitSync(cwd: string): Promise<string> {
  const g = `git -C "${cwd}"`;
  const run = (cmd: string, timeout = 2500) =>
    execAsync(`${g} ${cmd}`, { timeout }).then((r) => r.stdout.trim());
  const ok = (cmd: string) =>
    execAsync(`${g} ${cmd}`).then(() => true).catch(() => false);
  try {
    const branch = await run("branch --show-current");
    if (!branch) return ""; // detached o no-repo: nada útil
    const porcelain = await run("status --porcelain").catch(() => "");
    const dirty = porcelain ? porcelain.split("\n").length : 0;
    const dirtyTag = dirty ? ` · ○${dirty}` : "";

    let remote = "";
    try {
      remote = (await run(`ls-remote origin ${branch}`, 4000)).split(/\s+/)[0] ?? "";
    } catch {
      return `sync?${dirtyTag}`; // offline
    }
    if (!remote) return `local${dirtyTag}`; // rama no publicada
    const local = await run("rev-parse HEAD");
    if (remote === local) return `✓ sync${dirtyTag}`;
    // ¿tenemos el commit remoto? Si es ancestro de HEAD → local adelante; si no
    // lo tenemos, el remoto avanzó en otro sitio (otro PC) → toca pull.
    if ((await ok(`cat-file -e ${remote}`)) && (await ok(`merge-base --is-ancestor ${remote} HEAD`))) {
      const ahead = await run(`rev-list --count ${remote}..HEAD`).catch(() => "?");
      return `↑${ahead} sin pushear${dirtyTag}`;
    }
    return `⚠ pull (remoto adelante)${dirtyTag}`;
  } catch {
    return "";
  }
}

// EIN block-letter logo, large cut: 4-wide strokes (54 cols, 10 rows).
const LOGO_LARGE = [
  "██████████████      ████████████      ████        ████",
  "██████████████      ████████████      ██████      ████",
  "████                    ████          ███████     ████",
  "████                    ████          ████ ███    ████",
  "██████████              ████          ████  ███   ████",
  "██████████              ████          ████   ███  ████",
  "████                    ████          ████    ███ ████",
  "████                    ████          ████     ███████",
  "██████████████      ████████████      ████      ██████",
  "██████████████      ████████████      ████       █████",
];

// Small cut for narrow terminals: 3-wide strokes (38 cols, 7 rows).
const LOGO_SMALL = [
  "██████████    █████████    ███     ███",
  "███              ███       ████    ███",
  "███              ███       █████   ███",
  "███████          ███       ███ ██  ███",
  "███              ███       ███  ██ ███",
  "███              ███       ███   █████",
  "██████████    █████████    ███    ████",
];

// Column range of the I glyph per logo cut (gap columns are spaces, harmless).
const I_RANGE = {
  large: { start: 18, end: 33 },
  small: { start: 12, end: 25 },
} as const;

const SUBTITLE = ".SAMUHLO · PI WORKBENCH";
const RULE_CH = "─";

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

function padLines(lines: string[]): { lines: string[]; width: number } {
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

const FULL_INTRO_MIN_ROWS = 27;
const FULL_INTRO_MIN_COLS = 80;
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

// Ein version from the installer marker; "dev" when deployed by hand.
async function readEinVersion(): Promise<string> {
  try {
    const raw = await readFile(join(AGENT_DIR, ".ein-install.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version ? `v${parsed.version}` : "dev";
  } catch {
    return "dev";
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // No animated intro while running a CLI command (pi update, pi install, ...).
    const isCLICommand =
      process.argv.length > 2 &&
      !process.argv.every((arg) => arg.startsWith("-") || arg.endsWith(".ts"));
    if (isCLICommand) return;

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
    const FINISH_TICK = SUB_END_TICK + 4;

    let gitBranch = "no git";
    let gitSync = "";
    const [einVersion, extensionsCount, agentsCount] = await Promise.all([
      readEinVersion(),
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
    const langChat = LANG_LABEL[readChatLang()];
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

    const allCommands = pi.getCommands();
    const skillsCount = allCommands.filter((c) => c.source === "skill").length;
    const allTools = pi.getAllTools();
    const toolsCount = allTools.filter(
      (t) => !["builtin", "sdk"].includes(t.sourceInfo.source),
    ).length;

    setTimeout(() => {
      execAsync(`git -C "${ctx.cwd}" branch --show-current`)
        .then(({ stdout }) => {
          const b = stdout.trim();
          gitBranch = b || "detached";
        })
        .catch(() => {});
      // Sync con el remoto (best-effort, ~1s de red): se refleja en los
      // re-renders del header mientras dura la animación.
      computeGitSync(ctx.cwd)
        .then((s) => {
          gitSync = s;
        })
        .catch(() => {});
    }, 100);

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

    setTimeout(() => {
      ctx.ui.setHeader((tui, theme) => {
        if (state.timer) clearInterval(state.timer);

        const animStart = Date.now();
        const HARD_TIMEOUT_MS = 3000;

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

            // Top margin: the header paints on a cleared screen and the logo
            // shouldn't hug the terminal edge.
            b.addRow();

            // Logo: per-cell materialize (░▒▓█), then the I stamps yellow.
            for (let y = 0; y < logoBase.lines.length; y++) {
              const logoLine = logoBase.lines[y];
              b.addRow();
              for (let x = 0; x < logoLine.length; x++) {
                const ch = logoLine[x];
                if (ch === " ") {
                  b.add(" ");
                  continue;
                }
                const cell = noiseCell(ch, tick - cellDelay(x, y), CONCRETE);
                if (!cell) {
                  b.add(" ");
                  continue;
                }
                const settled = cell.char === ch;
                if (settled && tick >= STAMP_TICK && x >= iRange.start && x <= iRange.end) {
                  b.add(ch, YELLOW, { bold: tick < STAMP_TICK + STAMP_HOLD });
                } else {
                  b.add(cell.char, cell.color, { bold: cell.bold, dim: cell.dim });
                }
              }
              b.center(width);
            }

            // Structural rule, drawn from the center outward (nothing before
            // its phase starts).
            {
              b.addRow();
              const prog =
                tick < RULE_START_TICK
                  ? -1
                  : Math.min(1, (tick - RULE_START_TICK) / Math.max(1, RULE_END_TICK - RULE_START_TICK));
              const half = Math.floor((logoBase.width / 2) * prog);
              const center = Math.floor(logoBase.width / 2);
              for (let x = 0; x < logoBase.width; x++) {
                if (prog >= 0 && Math.abs(x - center) <= half) b.add(RULE_CH, STRUCTURE);
                else b.add(" ");
              }
              b.center(width);
            }

            // Subtitle: typewriter; the leading dot is yellow like the wordmark.
            {
              b.addRow();
              const pad = Math.max(0, Math.floor((logoBase.width - SUBTITLE.length) / 2));
              const reveal = Math.floor((tick - SUB_START_TICK) * 2);
              for (let x = 0; x < logoBase.width; x++) {
                const i = x - pad;
                const ch = i >= 0 && i < SUBTITLE.length ? SUBTITLE[i] : " ";
                if (i < 0 || i >= SUBTITLE.length || ch === " " || tick < SUB_START_TICK || i > reveal) {
                  b.add(" ");
                  continue;
                }
                b.add(ch, i === 0 ? YELLOW : STRUCTURE, { bold: i === 0 });
              }
              b.center(width);
            }

            if (state.mode === "full") {
              const fit = (v: unknown, w: number) =>
                String(v ?? "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, w);

              b.addRow();
              b.center(width);

              // Version plate: yellow block tag (carbon text) + pi version.
              {
                b.addRow();
                b.add(` EIN ${einVersion} `, CARBON, { bg: YELLOW, bold: true });
                b.add("  ");
                b.add(`PI v${VERSION}`, STRUCTURE);
                b.center(width);
              }

              b.addRow();
              b.center(width);

              // Spec grid: three columns, yellow block markers, gray labels,
              // concrete values. Flat list chunked into rows of 3 so cada celda
              // tiene el mismo ancho visible y el centrado mantiene la alineación.
              const L = 8; // label width
              const V = 13; // value width (cabe "auto (config)" del TDD)
              const COLS = 3;
              const CELL = 2 + L + V; // "■ " + label + value
              const GRID_W = CELL * COLS;
              const cells: Array<[string, string]> = [
                ["AGENTS", `${agentsCount}`],
                ["EXT", `${extensionsCount}`],
                ["TOOLS", `${toolsCount}`],
                ["SKILLS", `${skillsCount}`],
                ["MCP", `${mcpServersCount} srv`],
                ["MODE", fit(modeLabel, V)],
                ["PERSONA", fit(personaLabel, V)],
                ["LANG", fit(langChat, V)],
                ["ARTF", fit(langArtifact, V)],
                ["TDD", fit(tddLabel, V)],
                ["HYPA", fit(hypaLabel, V)],
              ];
              // Defensive: una celda malformada nunca debe tumbar el banner — un
              // crash aquí se lleva por delante la sesión de Pi al arrancar.
              for (let i = 0; i < cells.length; i += COLS) {
                b.addRow();
                for (let c = 0; c < COLS; c++) {
                  const cell = cells[i + c];
                  if (!cell) continue;
                  b.add("■ ", YELLOW);
                  b.add(cell[0].padEnd(L), STRUCTURE);
                  b.add(cell[1].padEnd(V), CONCRETE);
                }
                b.center(width);
              }

              // GIT en su propia fila (prominente: "saber antes de tocar"):
              // rama + estado de sync con el remoto. El sync entra async (~1s).
              {
                const gitVal = gitSync ? `${gitBranch} · ${gitSync}` : gitBranch;
                b.addRow();
                b.add("■ ", YELLOW);
                b.add("GIT".padEnd(L), STRUCTURE);
                b.add(fit(gitVal, GRID_W - 2 - L).padEnd(GRID_W - 2 - L), CONCRETE);
                b.center(width);
              }

              // Working path on its own row, same total width as the grid.
              {
                b.addRow();
                b.add("■ ", YELLOW);
                b.add("PATH".padEnd(L), STRUCTURE);
                b.add(fit(shortenHome(ctx.cwd), GRID_W - 2 - L).padEnd(GRID_W - 2 - L), CONCRETE);
                b.center(width);
              }

              // Recent sessions (distinct projects) + resume hint. Rows are
              // padded to GRID_W so they left-align with the spec grid.
              if (recentSessions.length) {
                b.addRow();
                b.center(width);
                b.addRow();
                b.add("■ ", YELLOW);
                b.add("SESIONES RECIENTES".padEnd(GRID_W - 2), STRUCTURE, { bold: true });
                b.center(width);
                for (const s of recentSessions) {
                  b.addRow();
                  b.add("  ");
                  const label = s.project;
                  const age = ` (${humanizeAge(s.ageMs)})`;
                  b.add(fit(label, GRID_W - 2 - age.length), CONCRETE);
                  b.add(age.padEnd(Math.max(0, GRID_W - 2 - fit(label, GRID_W - 2 - age.length).length)), STRUCTURE);
                  b.center(width);
                }
                b.addRow();
                b.add("pi -c continuar · pi -r elegir · /ein:resume".padEnd(GRID_W), STRUCTURE, { dim: true });
                b.center(width);
              }

              b.addRow();
              b.center(width);
            }

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
            cleanup();
          },
        };
      });
    }, 50);
  });
}
