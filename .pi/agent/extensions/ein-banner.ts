import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

// EIN block-letter logo. Clean, readable, single weight.
const TEXT_LOGO = [
  "████████  ██████  ██    ██",
  "██          ██    ███   ██",
  "██████      ██    ████  ██",
  "██          ██    ██ ██ ██",
  "██          ██    ██  ████",
  "████████  ██████  ██   ███",
];

// EIN brand gold #FFCA40
const GOLD = { r: 255, g: 202, b: 64 } as const;

function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

type CellType = "banner" | "logo-tip" | "label" | "value" | "dim" | "accent" | "none";
type LayoutCell = { char: string; type: CellType };

class LayoutBuilder {
  lines: LayoutCell[][] = [];

  addRow() {
    this.lines.push([]);
  }

  add(type: CellType, text: string) {
    const row = this.lines[this.lines.length - 1];
    for (const char of text) row.push({ char, type });
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
    const extDir = join(os.homedir(), ".pi", "agent", "extensions");
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

    // Reveal sweeps left-to-right across the logo, then a glint passes once.
    const REVEAL_SPEED = 1.4; // logo columns per tick
    const REVEAL_END_TICK = Math.ceil(logoBase.width / REVEAL_SPEED) + 4;
    const GLINT_START_TICK = REVEAL_END_TICK + 3;
    const GLINT_END_TICK = GLINT_START_TICK + 12;
    const FINISH_TICK = GLINT_END_TICK + 18;

    let gitBranch = "Not a git repo";
    let extensionsCount = await countExtensions();
    let mcpServersCount = 0;

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
            join(os.homedir(), ".pi", "agent", "mcp.json"),
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
            const logoLeft = Math.max(0, Math.floor((width - logoBase.width) / 2));

            const glintActive = tick >= GLINT_START_TICK && tick <= GLINT_END_TICK;
            const glintLocal =
              ((tick - GLINT_START_TICK) /
                Math.max(1, GLINT_END_TICK - GLINT_START_TICK)) *
              (logoBase.width + 2);
            const glintHead = logoLeft + glintLocal;

            const b = new LayoutBuilder();
            b.addRow();
            b.center(width);

            // Logo with left-to-right pen sweep.
            for (let logoI = 0; logoI < logoBase.lines.length; logoI++) {
              const logoLine = logoBase.lines[logoI];
              b.addRow();
              for (let x = 0; x < logoLine.length; x++) {
                const ch = logoLine[x];
                if (ch === " ") {
                  b.add("none", " ");
                  continue;
                }
                if (x <= revealHead) {
                  const age = revealHead - x;
                  b.add(age < 1.6 ? "logo-tip" : "banner", ch);
                } else {
                  b.add("none", " ");
                }
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
                ["VER:", `v${VERSION}`],
                ["TOOLS:", `${customTools.length} custom`],
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

                if (cell.type === "banner" || cell.type === "logo-tip") {
                  // Glint sweep: a single warm highlight passes after the reveal.
                  if (glintActive && x >= glintHead - 1 && x <= glintHead + 1) {
                    line += `\x1b[1m` + rgb(255, 250, 220, cell.char) + `\x1b[22m`;
                    continue;
                  }
                  // Pen tip: brighter leading edge of the sweep.
                  if (cell.type === "logo-tip") {
                    line += `\x1b[1m` + rgb(255, 232, 150, cell.char) + `\x1b[22m`;
                    continue;
                  }
                  // Settled gold with a subtle living shimmer.
                  const s = 0.9 + Math.sin(x * 0.16 + y * 0.55 + tick * 0.08) * 0.1;
                  line += rgb(
                    Math.min(255, Math.round(GOLD.r * s)),
                    Math.min(255, Math.round(GOLD.g * s)),
                    Math.min(255, Math.round(GOLD.b * s)),
                    cell.char,
                  );
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
