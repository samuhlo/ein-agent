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

const execAsync = promisify(exec);

// EIN block-letter logo. Clean, readable, 3-wide strokes (38 cols, 7 rows).
const TEXT_LOGO = [
  "██████████    █████████    ███     ███",
  "███              ███       ████    ███",
  "███              ███       █████   ███",
  "███████          ███       ███ ██  ███",
  "███              ███       ███  ██ ███",
  "███              ███       ███   █████",
  "██████████    █████████    ███    ████",
];

// Logo column ranges: E = 0..9, I = 14..22, N = 27..37.
const LOGO_I_START = 12;
const LOGO_I_END = 25;

const SUBTITLE = ".SAMUHLO · PI WORKBENCH";
const RULE_CH = "─";

// Brand palette (flat — no gradients). Fuente única: brand.json via ein-brand.
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

// Column-based flat logo color: I in industrial yellow, E/N in concrete.
function logoLetterColor(x: number): RGB {
  return x >= LOGO_I_START && x <= LOGO_I_END ? YELLOW : CONCRETE;
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

const FULL_INTRO_MIN_ROWS = 23;
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

    const logoBase = padLines(TEXT_LOGO);

    // Reveal sweeps left-to-right once; everything settles into flat color.
    const REVEAL_SPEED = 2.0; // logo columns per tick
    const REVEAL_END_TICK = Math.ceil(logoBase.width / REVEAL_SPEED) + 2;
    const RULE_START_TICK = REVEAL_END_TICK - 2;
    const RULE_END_TICK = RULE_START_TICK + 6;
    const SUB_START_TICK = RULE_END_TICK - 2;
    const SUB_END_TICK = SUB_START_TICK + Math.ceil(SUBTITLE.length / 2);
    const FINISH_TICK = SUB_END_TICK + 4;

    let gitBranch = "no git";
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

            const revealHead = tick * REVEAL_SPEED;
            const b = new LayoutBuilder();

            // Logo: single left-to-right reveal, flat brand colors after.
            for (const logoLine of logoBase.lines) {
              b.addRow();
              for (let x = 0; x < logoLine.length; x++) {
                const ch = logoLine[x];
                if (ch === " " || x > revealHead) {
                  b.add(" ");
                  continue;
                }
                const age = revealHead - x;
                if (age < 2) {
                  b.add(ch, CONCRETE, { bold: true });
                } else {
                  b.add(ch, logoLetterColor(x));
                }
              }
              b.center(width);
            }

            // Structural rule, drawn from the center outward.
            {
              b.addRow();
              const prog = Math.max(
                0,
                Math.min(1, (tick - RULE_START_TICK) / Math.max(1, RULE_END_TICK - RULE_START_TICK)),
              );
              const half = Math.floor((logoBase.width / 2) * prog);
              const center = Math.floor(logoBase.width / 2);
              for (let x = 0; x < logoBase.width; x++) {
                if (Math.abs(x - center) <= half) b.add(RULE_CH, STRUCTURE);
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

              // Spec grid: two columns, yellow block markers, gray labels,
              // concrete values. Every row is padded to the same visible
              // width so independent centering keeps the columns aligned.
              const L = 8; // label width
              const V = 14; // left value width
              const RV = 20; // right value width
              const GRID_W = 2 + L + V + 2 + L + RV;
              const pairs: Array<[[string, string], [string, string]]> = [
                [
                  ["AGENTS", `${agentsCount}`],
                  ["EXT", `${extensionsCount}`],
                ],
                [
                  ["SKILLS", `${skillsCount}`],
                  ["MCP", `${mcpServersCount} server(s)`],
                ],
                [
                  ["TOOLS", `${toolsCount}`],
                  ["GIT", fit(gitBranch, RV)],
                ],
              ];
              for (const [[l1, v1], [l2, v2]] of pairs) {
                b.addRow();
                b.add("■ ", YELLOW);
                b.add(l1.padEnd(L), STRUCTURE);
                b.add(v1.padEnd(V), CONCRETE);
                b.add("■ ", YELLOW);
                b.add(l2.padEnd(L), STRUCTURE);
                b.add(v2.padEnd(RV), CONCRETE);
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
