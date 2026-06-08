import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { VERSION } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const execAsync = promisify(exec);

// EIN-PI block letter ASCII art - clean and simple
const TEXT_LOGO = [
  "   ██████    ██████   ██████   ███████  ██    ██",
  "  ██    ██  ██    ██  ██   ██  ██       ██    ██",
  "  ██    ██  ██    ██  ██████   █████    ██    ██",
  "  ██    ██  ██    ██  ██   ██  ██       ██    ██",
  "   ██████    ██████   ██████   ███████   ██████ ",
  "                                                  ",
  "   ██████   ███████  ████████  ██████   ██████   ███████",
  "  ██    ██  ██          ██    ██   ██  ██   ██  ██     ",
  "  ██    ██  ███████     ██    ██████   ██████   █████  ",
  "  ██    ██       ██    ██    ██   ██  ██   ██  ██     ",
  "   ██████   ███████    ██    ██████   ██████   ███████",
];

function rgb(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function normalizeAscii(lines: string[]): string[] {
  const trimmed = lines.map((l) => l.replace(/\s+$/g, ""));
  const nonEmpty = trimmed.filter((l) => l.trim().length > 0);
  const minLead = nonEmpty.length
    ? Math.min(...nonEmpty.map((l) => (l.match(/^\s*/) || [""])[0].length))
    : 0;
  return trimmed.map((l) => (l.length >= minLead ? l.slice(minLead) : l));
}

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

type CellType =
  | "banner"
  | "label"
  | "value"
  | "dim"
  | "accent"
  | "none";
type LayoutCell = { char: string; type: CellType };

function buildLetterStrokeMap(lines: string[]): { orderMap: Map<string, number>; maxOrder: number } {
  const orderMap = new Map<string, number>();
  let order = 0;

  for (let y = 0; y < lines.length; y++) {
    const line = lines[y] ?? "";
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch !== " ") {
        orderMap.set(`${x}:${y}`, order++);
      }
    }
  }

  return { orderMap, maxOrder: Math.max(1, order - 1) };
}

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

const FULL_INTRO_MIN_ROWS = 24;
const FULL_INTRO_MIN_COLS = 80;
const MINIMAL_INTRO_MIN_ROWS = 16;
const MINIMAL_INTRO_MIN_COLS = 50;
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

    const isCLICommand =
      process.argv.length > 2 &&
      !process.argv.every((arg) => arg.startsWith("-") || arg.endsWith(".ts"));
    if (isCLICommand) return;

    if (currentIntroMode() === "skip") return;

    process.stdout.write("\x1b[2J\x1b[3J\x1b[H");

    const logoBase = padLines(normalizeAscii(TEXT_LOGO));
    const letterStroke = buildLetterStrokeMap(logoBase.lines);

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
          const finishedAnimation = tick > letterStroke.maxOrder + 30;
          if (finishedAnimation || elapsed > HARD_TIMEOUT_MS) {
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

            const logoProgress = Math.min(1, tick / (letterStroke.maxOrder + 15));

            const b = new LayoutBuilder();
            b.addRow();
            b.center(width);

            // Draw logo with fade-in effect
            for (let logoI = 0; logoI < logoBase.lines.length; logoI++) {
              const logoLine = logoBase.lines[logoI];
              b.addRow();
              for (const ch of logoLine) {
                if (ch === " ") {
                  b.add("none", " ");
                } else {
                  // Simple fade-in based on progress
                  const shouldShow = Math.random() < logoProgress || tick > letterStroke.maxOrder + 10;
                  if (shouldShow) {
                    b.add("banner", ch);
                  } else {
                    b.add("none", " ");
                  }
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

              const narrowLabelW = Math.max(...rows.map(([l]) => l.length));
              const narrowValueW = Math.max(
                0,
                Math.min(
                  Math.max(...rows.map(([, v]) => v.length)),
                  Math.max(8, width - narrowLabelW - 4),
                ),
              );

              const addNarrowRow = (label: string, value: string) => {
                b.addRow();
                b.add("label", label.padEnd(narrowLabelW));
                b.add("none", "  ");
                b.add("value", fit(value, narrowValueW));
                b.center(width);
              };

              for (const [label, value] of rows) {
                addNarrowRow(label, value);
              }

              b.addRow();
              b.center(width);
            }

            const out: string[] = [];

            for (const row of b.lines) {
              let line = "";
              for (const cell of row) {
                if (cell.type === "none") {
                  line += cell.char;
                  continue;
                }

                if (cell.type === "banner") {
                  // Ein brand colors: cyan/teal gradient
                  const hue = 0.5 + (cell.char.charCodeAt(0) % 20) * 0.02;
                  const r = Math.floor(50 + hue * 30);
                  const g = Math.floor(200 + hue * 55);
                  const bCol = Math.floor(220 + hue * 35);
                  line += rgb(r, g, bCol, cell.char);
                  continue;
                }

                switch (cell.type) {
                  case "label":
                    line += rgb(100, 200, 220, cell.char);
                    break;
                  case "value":
                    line += rgb(150, 230, 240, cell.char);
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