import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { AGENT_DIR } from "./ein-paths";
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

// EIN brand gold #FFCA40
const GOLD = { r: 255, g: 202, b: 64 } as const;

// Wordmark shown under the logo so the author's name always appears.
const SUBTITLE = "SAMUHLO · PI WORKBENCH";
const RULE_CH = "─";

// Metallic gradient anchors: deep gold → brand gold → bright gold.
const DEEP_GOLD = { r: 198, g: 138, b: 28 } as const;
const BRIGHT_GOLD = { r: 255, g: 238, b: 170 } as const;
const SUBTITLE_GOLD = { r: 255, g: 224, b: 150 } as const;
const RULE_GOLD = { r: 190, g: 150, b: 70 } as const;

type RGB = { r: number; g: number; b: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

// Diagonal metallic gold at normalized position d in [0,1].
function goldAt(d: number): RGB {
  if (d <= 0.5) {
    const t = d / 0.5;
    return {
      r: lerp(DEEP_GOLD.r, GOLD.r, t),
      g: lerp(DEEP_GOLD.g, GOLD.g, t),
      b: lerp(DEEP_GOLD.b, GOLD.b, t),
    };
  }
  const t = (d - 0.5) / 0.5;
  return {
    r: lerp(GOLD.r, BRIGHT_GOLD.r, t),
    g: lerp(GOLD.g, BRIGHT_GOLD.g, t),
    b: lerp(GOLD.b, BRIGHT_GOLD.b, t),
  };
}

// Per-cell metallic color: diagonal gradient + a sweeping shine band + breathing.
function logoColor(
  x: number,
  y: number,
  width: number,
  height: number,
  tick: number,
): { color: RGB; bold: boolean } {
  const SHINE_PERIOD = 24;
  const SHINE_BAND = 5;
  const diagMax = width + (height - 1) * 2;
  const shinePos =
    ((tick % SHINE_PERIOD) / SHINE_PERIOD) * (diagMax + SHINE_BAND * 2) - SHINE_BAND;
  const breathe = 0.96 + Math.sin(tick * 0.12) * 0.04;

  const d = (x / Math.max(1, width - 1)) * 0.6 + (y / Math.max(1, height - 1)) * 0.4;
  let col = goldAt(d);

  const diag = x + y * 2;
  const dist = Math.abs(diag - shinePos);
  let bold = false;
  if (dist < SHINE_BAND) {
    const boost = (1 - dist / SHINE_BAND) ** 2 * 0.85;
    col = {
      r: lerp(col.r, 255, boost),
      g: lerp(col.g, 250, boost),
      b: lerp(col.b, 230, boost),
    };
    bold = boost > 0.5;
  }

  return { color: { r: col.r * breathe, g: col.g * breathe, b: col.b * breathe }, bold };
}

function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${clampByte(r)};${clampByte(g)};${clampByte(b)}m${text}\x1b[39m`;
}

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

type CellType = "banner" | "label" | "value" | "dim" | "accent" | "none";
type LayoutCell = { char: string; type: CellType; color?: RGB; bold?: boolean };

class LayoutBuilder {
  lines: LayoutCell[][] = [];

  addRow() {
    this.lines.push([]);
  }

  add(type: CellType, text: string) {
    const row = this.lines[this.lines.length - 1];
    for (const char of text) row.push({ char, type });
  }

  // Add a single char with an explicit precomputed color (and optional bold).
  addColored(char: string, color: RGB, bold = false) {
    this.lines[this.lines.length - 1].push({ char, type: "banner", color, bold });
  }

  center(width: number) {
    const row = this.lines[this.lines.length - 1];
    const pad = Math.max(0, Math.floor((width - row.length) / 2));
    const prefix: LayoutCell[] = Array.from({ length: pad }, () => ({
      char: " ",
      type: "none" as const,
    }));
    this.lines[this.lines.length - 1] = prefix.concat(row);
  }
}

const FULL_INTRO_MIN_ROWS = 22;
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

async function countExtensions(): Promise<number> {
  try {
    const extDir = join(AGENT_DIR, "extensions");
    const files = await readdir(extDir);
    return files.filter((f) => f.endsWith(".ts")).length;
  } catch {
    return 0;
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

    // Reveal sweeps left-to-right; a metallic shine then sweeps repeatedly while
    // the accent rule draws out and the subtitle types in.
    const REVEAL_SPEED = 1.5; // logo columns per tick
    const REVEAL_END_TICK = Math.ceil(logoBase.width / REVEAL_SPEED) + 3;
    const RULE_START_TICK = REVEAL_END_TICK - 2;
    const RULE_END_TICK = RULE_START_TICK + 8;
    const SUB_START_TICK = RULE_END_TICK - 2;
    const SUB_END_TICK = SUB_START_TICK + Math.ceil(SUBTITLE.length / 1.6);
    const FINISH_TICK = SUB_END_TICK + 16;

    let gitBranch = "Not a git repo";
    let extensionsCount = await countExtensions();
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
    const skills = allCommands.filter((c) => c.source === "skill");
    const allTools = pi.getAllTools();
    const customTools = allTools.filter(
      (t) => !["builtin", "sdk"].includes(t.sourceInfo.source),
    );

    setTimeout(() => {
      execAsync(`git -C "${ctx.cwd}" branch --show-current`)
        .then(({ stdout }) => {
          const b = stdout.trim();
          gitBranch = b ? `On branch ${b}` : "Detached HEAD";
        })
        .catch(() => {});
    }, 100);

    setTimeout(() => {
      (async () => {
        try {
          const raw = await readFile(
            join(AGENT_DIR, "mcp.json"),
            "utf8",
          );
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
        const HARD_TIMEOUT_MS = 4000;

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
            const logoH = logoBase.lines.length;

            const b = new LayoutBuilder();
            b.addRow();
            b.center(width);

            // Logo: left-to-right pen sweep, then metallic gradient + shine.
            for (let logoI = 0; logoI < logoBase.lines.length; logoI++) {
              const logoLine = logoBase.lines[logoI];
              b.addRow();
              for (let x = 0; x < logoLine.length; x++) {
                const ch = logoLine[x];
                if (ch === " " || x > revealHead) {
                  b.add("none", " ");
                  continue;
                }
                const age = revealHead - x;
                if (age < 1.6) {
                  b.addColored(ch, BRIGHT_GOLD, true);
                } else {
                  const c = logoColor(x, logoI, logoBase.width, logoH, tick);
                  b.addColored(ch, c.color, c.bold);
                }
              }
              b.center(width);
            }

            // Accent rule, drawn from the center outward.
            {
              b.addRow();
              const prog = Math.max(
                0,
                Math.min(1, (tick - RULE_START_TICK) / Math.max(1, RULE_END_TICK - RULE_START_TICK)),
              );
              const half = Math.floor((logoBase.width / 2) * prog);
              const center = Math.floor(logoBase.width / 2);
              for (let x = 0; x < logoBase.width; x++) {
                if (Math.abs(x - center) <= half) b.addColored(RULE_CH, RULE_GOLD);
                else b.add("none", " ");
              }
              b.center(width);
            }

            // Subtitle, typewriter reveal left-to-right.
            {
              b.addRow();
              const pad = Math.max(0, Math.floor((logoBase.width - SUBTITLE.length) / 2));
              const reveal = Math.floor((tick - SUB_START_TICK) * 1.6);
              for (let x = 0; x < logoBase.width; x++) {
                const i = x - pad;
                const ch = i >= 0 && i < SUBTITLE.length ? SUBTITLE[i] : " ";
                if (i < 0 || i >= SUBTITLE.length || ch === " " || tick < SUB_START_TICK || i > reveal) {
                  b.add("none", " ");
                  continue;
                }
                if (reveal - i < 2) b.addColored(ch, BRIGHT_GOLD, true);
                else b.addColored(ch, SUBTITLE_GOLD);
              }
              b.center(width);
            }

            if (state.mode === "full") {
              b.addRow();
              b.center(width);

              const fit = (v: unknown, w: number) =>
                String(v ?? "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, w)
                  .padEnd(w);

              const rows: Array<[string, string]> = [
                ["GIT:", gitBranch],
                ["PATH:", ctx.cwd],
                ["MCP:", `${mcpServersCount} server(s)`],
                ["EXTENSIONS:", `${extensionsCount} active`],
                ["AGENTS:", `${skills.length} loaded`],
                ["VER:", `v${VERSION} · ${customTools.length} tools`],
              ];

              const labelW = Math.max(...rows.map(([l]) => l.length));
              const valueW = Math.max(
                0,
                Math.min(
                  Math.max(...rows.map(([, v]) => v.length)),
                  Math.max(8, width - labelW - 4),
                ),
              );

              for (const [label, value] of rows) {
                b.addRow();
                b.add("label", label.padEnd(labelW));
                b.add("none", "  ");
                b.add("value", fit(value, valueW));
                b.center(width);
              }

              // Recent sessions (distinct projects) + resume hint.
              if (recentSessions.length) {
                b.addRow();
                b.center(width);
                b.addRow();
                b.add("label", "SESIONES RECIENTES");
                b.center(width);
                for (const s of recentSessions) {
                  b.addRow();
                  b.add("value", `• ${s.project} (${humanizeAge(s.ageMs)})`);
                  b.center(width);
                }
                b.addRow();
                b.add("dim", "pi -c continuar · pi -r elegir · /ein:resume");
                b.center(width);
              }

              b.addRow();
              b.center(width);
            }

            const out: string[] = [];

            for (let y = 0; y < b.lines.length; y++) {
              const row = b.lines[y];
              let line = "";
              for (let x = 0; x < row.length; x++) {
                const cell = row[x];
                if (cell.type === "none" || cell.char === " ") {
                  line += cell.char;
                  continue;
                }

                // Precomputed metallic color (logo, rule, subtitle).
                if (cell.color) {
                  const body = rgb(cell.color.r, cell.color.g, cell.color.b, cell.char);
                  line += cell.bold ? `\x1b[1m${body}\x1b[22m` : body;
                  continue;
                }

                switch (cell.type) {
                  case "label":
                    line += rgb(190, 150, 70, cell.char);
                    break;
                  case "value":
                    line += rgb(255, 224, 150, cell.char);
                    break;
                  case "dim":
                    line += theme.fg("dim", cell.char);
                    break;
                  case "accent":
                    line += theme.fg("accent", cell.char);
                    break;
                  default:
                    line += cell.char;
                }
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
