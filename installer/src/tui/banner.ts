// =============================================================================
// BANNER
// Logo EIN en bloque con la paleta brutalista plana: E y N en concrete, la I
// en amarillo industrial (el gesto de marca), regla en structure y subtítulo
// ".SAMUHLO · PI WORKBENCH" con el punto amarillo. Un solo reveal rápido, sin
// gradientes ni shine. Fallback estático en non-TTY / NO_COLOR.
// =============================================================================

import { INSTALLER_VERSION } from "../core/version.ts";
import { CONCRETE, STRUCTURE, YELLOW, colorEnabled } from "./theme.ts";

// EIN block-letter logo (38 cols, 7 rows, uniform width, 3-wide strokes).
const TEXT_LOGO = [
  "██████████    █████████    ███     ███",
  "███              ███       ████    ███",
  "███              ███       █████   ███",
  "███████          ███       ███ ██  ███",
  "███              ███       ███  ██ ███",
  "███              ███       ███   █████",
  "██████████    █████████    ███    ████",
];

// Columnas de la letra I dentro del logo (se pinta en amarillo de marca).
const LOGO_I_START = 14;
const LOGO_I_END = 22;

const SUBTITLE = `.SAMUHLO · PI WORKBENCH · v${INSTALLER_VERSION}`;
const RULE_CH = "─";

type RGB = { r: number; g: number; b: number };

function rgbRaw(c: RGB, text: string): string {
  return `\x1b[38;2;${c.r};${c.g};${c.b}m${text}\x1b[39m`;
}

function boldRgb(c: RGB, text: string): string {
  return `\x1b[1m${rgbRaw(c, text)}\x1b[22m`;
}

function logoColor(x: number): RGB {
  return x >= LOGO_I_START && x <= LOGO_I_END ? YELLOW : CONCRETE;
}

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

type Phase = {
  revealSpeed: number;
  revealEnd: number;
  ruleStart: number;
  ruleEnd: number;
  subStart: number;
  finish: number;
};

function buildPhase(width: number): Phase {
  const revealSpeed = 2.0;
  const revealEnd = Math.ceil(width / revealSpeed) + 2;
  const ruleStart = revealEnd - 2;
  const ruleEnd = ruleStart + 6;
  const subStart = ruleEnd - 2;
  const subEnd = subStart + Math.ceil(SUBTITLE.length / 2);
  const finish = subEnd + 4;
  return { revealSpeed, revealEnd, ruleStart, ruleEnd, subStart, finish };
}

function renderSubtitle(reveal: number, width: number): string {
  const pad = Math.max(0, Math.floor((width - SUBTITLE.length) / 2));
  let sub = " ".repeat(pad);
  for (let i = 0; i < SUBTITLE.length; i++) {
    const ch = SUBTITLE[i] ?? " ";
    if (i > reveal || ch === " ") {
      sub += " ";
      continue;
    }
    sub += i === 0 ? boldRgb(YELLOW, ch) : rgbRaw(STRUCTURE, ch);
  }
  return sub;
}

// Render estático: logo plano + regla + subtítulo. Non-TTY / NO_COLOR.
function renderStatic(): string {
  const { lines, width } = padLines(TEXT_LOGO);
  const out: string[] = [];
  if (!colorEnabled()) {
    out.push(...lines);
    out.push(RULE_CH.repeat(width));
    const pad = Math.max(0, Math.floor((width - SUBTITLE.length) / 2));
    out.push(" ".repeat(pad) + SUBTITLE);
    return out.join("\n");
  }
  for (const row of lines) {
    let line = "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? " ";
      line += ch === " " ? " " : rgbRaw(logoColor(x), ch);
    }
    out.push(line);
  }
  out.push(rgbRaw(STRUCTURE, RULE_CH.repeat(width)));
  out.push(renderSubtitle(SUBTITLE.length, width));
  return out.join("\n");
}

// Un frame de animación (logo + regla + subtítulo) como array de líneas.
function renderFrame(tick: number, ph: Phase): string[] {
  const { lines, width } = padLines(TEXT_LOGO);
  const revealHead = tick * ph.revealSpeed;
  const out: string[] = [];

  // Logo: reveal por columnas, color plano, borde de avance en bold.
  for (const rowStr of lines) {
    let line = "";
    for (let x = 0; x < rowStr.length; x++) {
      const ch = rowStr[x] ?? " ";
      if (ch === " " || x > revealHead) {
        line += " ";
        continue;
      }
      const col = logoColor(x);
      line += revealHead - x < 2 ? boldRgb(col, ch) : rgbRaw(col, ch);
    }
    out.push(line);
  }

  // Regla, del centro hacia afuera.
  {
    const prog = clamp01((tick - ph.ruleStart) / Math.max(1, ph.ruleEnd - ph.ruleStart));
    const half = Math.floor((width / 2) * prog);
    const center = Math.floor(width / 2);
    let rule = "";
    for (let x = 0; x < width; x++) {
      rule += Math.abs(x - center) <= half ? rgbRaw(STRUCTURE, RULE_CH) : " ";
    }
    out.push(rule);
  }

  // Subtítulo, typewriter.
  {
    const reveal = tick < ph.subStart ? -1 : Math.floor((tick - ph.subStart) * 2);
    out.push(renderSubtitle(reveal, width));
  }

  return out;
}

// Anima el banner una vez y resuelve. Sin animación en non-TTY.
export async function playBanner(): Promise<void> {
  if (!colorEnabled()) {
    process.stdout.write(`${renderStatic()}\n`);
    return;
  }

  const { width } = padLines(TEXT_LOGO);
  const ph = buildPhase(width);
  const rows = TEXT_LOGO.length + 2; // logo + regla + subtítulo

  process.stdout.write("\x1b[?25l"); // hide cursor
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    process.stdout.write("\x1b[?25h"); // restore cursor
  };
  const onSigint = () => {
    cleanup();
    process.exit(130);
  };
  process.once("SIGINT", onSigint);

  // Reserva las filas una vez y repinta in situ en cada tick.
  process.stdout.write("\n".repeat(rows));

  await new Promise<void>((resolve) => {
    let tick = 0;
    const start = Date.now();
    const timer = setInterval(() => {
      tick++;
      if (tick > ph.finish || Date.now() - start > 2500) {
        clearInterval(timer);
        process.stdout.write(`\x1b[${rows}A`);
        process.stdout.write(`${renderStatic()}\n`);
        cleanup();
        process.off("SIGINT", onSigint);
        resolve();
        return;
      }
      process.stdout.write(`\x1b[${rows}A`); // cursor up to frame top
      process.stdout.write(`${renderFrame(tick, ph).join("\n")}\n`);
    }, 30);
  });
}

export function bannerStatic(): string {
  return renderStatic();
}
