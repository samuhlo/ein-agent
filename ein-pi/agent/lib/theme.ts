// =============================================================================
// [CORE] TERMINAL THEME
// The brand palette as ANSI, plus the width arithmetic a centred layout needs.
// Pure: it never asks whether the destination is a terminal — the driver decides
// that once and builds the palette accordingly, so a palette without colour is
// the identity function and a pipe cannot receive escapes by accident.
//
// The palette is duplicated from ein-pi/agent/brand.json rather than read at
// runtime, for the same reason installer/src/tui/theme.ts duplicates it: the app
// paints before it knows where the agent home is.
// =============================================================================

export const BRAND = Object.freeze({
  carbon: "#0B0B0B",
  concrete: "#FAF3F0",
  structure: "#737373",
  yellow: "#FFCA40",
});

const RESET = "\u001b[0m";
const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const REVERSE = "\u001b[7m";

// Matches the escape sequences this module and the renderer can emit: colour,
// attributes and cursor control. Anything measured or cut goes through here.
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `\u001b[38;2;${(value >> 16) & 255};${(value >> 8) & 255};${value & 255}m`;
}

export type ColorProbe = Readonly<{
  isTTY: boolean;
  env: Readonly<Record<string, string | undefined>>;
}>;

/**
 * NO_COLOR is absolute — it is a user saying "not on this machine", and a tool
 * that overrides it is a tool that ignores its user. Everything else is the
 * usual order: an explicit request, then whether the destination is a terminal
 * that can render anything at all.
 */
export function shouldUseColor(probe: ColorProbe): boolean {
  if (probe.env.NO_COLOR) return false;
  if (probe.env.TERM === "dumb") return false;
  if (probe.env.FORCE_COLOR) return true;
  return probe.isTTY;
}

export type StyleName =
  | "title"
  | "accent"
  | "text"
  | "muted"
  | "key"
  | "danger"
  | "ok"
  | "selected";

export type Palette = Readonly<Record<StyleName, (text: string) => string>> &
  Readonly<{ enabled: boolean }>;

const STYLES: Readonly<Record<StyleName, string>> = {
  title: `${BOLD}${rgb(BRAND.yellow)}`,
  accent: rgb(BRAND.yellow),
  text: rgb(BRAND.concrete),
  muted: `${DIM}${rgb(BRAND.structure)}`,
  key: rgb(BRAND.yellow),
  danger: "\u001b[38;2;255;107;107m",
  ok: "\u001b[38;2;122;200;140m",
  selected: `${BOLD}${rgb(BRAND.concrete)}`,
};

export function createPalette(enabled: boolean): Palette {
  const wrap = (code: string) => (text: string): string =>
    enabled && text ? `${code}${text}${RESET}` : text;
  const palette: Record<string, unknown> = { enabled };
  for (const [name, code] of Object.entries(STYLES)) palette[name] = wrap(code);
  return Object.freeze(palette as Palette);
}

/** Reverse video for a selected row, when a bar alone would not read. */
export function highlight(text: string, enabled: boolean): string {
  return enabled && text ? `${REVERSE}${text}${RESET}` : text;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** Columns the text occupies once the escapes are gone. */
export function visibleWidth(text: string): number {
  return [...stripAnsi(text)].length;
}

export function padVisible(text: string, width: number): string {
  const missing = width - visibleWidth(text);
  return missing > 0 ? text + " ".repeat(missing) : text;
}

/** Left padding only, so a centred block keeps its own internal alignment. */
export function center(text: string, width: number): string {
  const left = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
  return " ".repeat(left) + text;
}

/**
 * Cut to fit, marking the cut. Escapes are preserved and re-closed, because a
 * naive slice can end inside a colour sequence and bleed it into the rest of
 * the screen.
 */
export function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  if (width === 1) return "…";

  const limit = width - 1;
  let out = "";
  let visible = 0;
  let index = 0;
  let painted = false;
  while (index < text.length && visible < limit) {
    ANSI.lastIndex = index;
    const match = ANSI.exec(text);
    if (match && match.index === index) {
      out += match[0];
      painted = true;
      index += match[0].length;
      continue;
    }
    out += text[index];
    visible += 1;
    index += 1;
  }
  ANSI.lastIndex = 0;
  return `${out}…${painted ? RESET : ""}`;
}
