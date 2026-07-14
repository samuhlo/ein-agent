// =============================================================================
// BANNER
// Logo EIN con la paleta brutalista plana: E y N en concrete, la I en
// amarillo industrial (gesto de marca), regla en structure y subtitulo
// ".SAMUHLO · PI WORKBENCH" con el punto amarillo. Animacion "materialize":
// cada celda aparece con retardo pseudoaleatorio (sesgo izq->dcha) y resuelve
// . -> : -> o -> # como hormigon fraguando; la I sella en amarillo al final.
// Corte grande (54x10) si el terminal da de si, pequeno (38x7) si no.
// Fallback estatico en non-TTY / NO_COLOR.
// =============================================================================

import { readMarkerV2 } from "../core/marker-v2.ts";
import { BACKUP_DIR, INSTALL_MARKER } from "../core/paths.ts";
import type { MarkerV1, MarkerV2 } from "../core/release-types.ts";
import { defaultUpdateCaps, type UpdateCaps } from "../core/update-caps.ts";
import { CONCRETE, STRUCTURE, YELLOW, colorEnabled } from "./theme.ts";

// Logo EIN grande: trazos de 4 (54 cols, 10 filas).
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

// Corte pequeno para terminales estrechos: trazos de 3 (38 cols, 7 filas).
const LOGO_SMALL = [
  "██████████    █████████    ███     ███",
  "███              ███       ████    ███",
  "███              ███       █████   ███",
  "███████          ███       ███ ██  ███",
  "███              ███       ███  ██ ███",
  "███              ███       ███   █████",
  "██████████    █████████    ███    ████",
];

// Rango de columnas de la letra I por corte (las columnas de hueco son
// espacios, pintarlas es inocuo).
const I_RANGE = {
  large: { start: 18, end: 33 },
  small: { start: 12, end: 25 },
} as const;

const BASE_SUBTITLE = ".SAMUHLO · PI WORKBENCH";
const RULE_CH = "─";

export type BannerState = {
  marker: MarkerV1 | MarkerV2 | null;
  recoveryRequired: boolean;
};

export function bannerVersionLabel(state: BannerState): string {
  if (state.recoveryRequired) return "recovery required";
  if (state.marker && "schemaVersion" in state.marker) return `v${state.marker.version}`;
  if (state.marker) return `legacy v${state.marker.version} (unverified)`;
  return "unverified";
}

export function readBannerState(caps: UpdateCaps = defaultUpdateCaps(), markerPath = INSTALL_MARKER, journalPath = `${BACKUP_DIR}/.ein-update-journal.json`): BannerState {
  return {
    marker: readMarkerV2(caps, markerPath),
    recoveryRequired: caps.fs.exists(journalPath),
  };
}

export function renderBanner(state: BannerState = readBannerState()): string {
  return `${BASE_SUBTITLE} · ${bannerVersionLabel(state)}`;
}

type RGB = { r: number; g: number; b: number };

function rgbRaw(c: RGB, text: string): string {
  return `\x1b[38;2;${c.r};${c.g};${c.b}m${text}\x1b[39m`;
}

function boldRgb(c: RGB, text: string): string {
  return `\x1b[1m${rgbRaw(c, text)}\x1b[22m`;
}

function dimRgb(c: RGB, text: string): string {
  return `\x1b[2m${rgbRaw(c, text)}\x1b[22m`;
}

type LogoCut = { lines: string[]; width: number; iStart: number; iEnd: number };

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

// Corte grande si el terminal da de si; pequeno si no (o si no hay columnas).
function pickLogo(): LogoCut {
  const cols = process.stdout.columns ?? 80;
  const largeWidth = Math.max(...LOGO_LARGE.map((l) => l.length));
  const useLarge = cols >= largeWidth + 2;
  const base = padLines(useLarge ? LOGO_LARGE : LOGO_SMALL);
  const range = useLarge ? I_RANGE.large : I_RANGE.small;
  return { ...base, iStart: range.start, iEnd: range.end };
}

function logoColor(logo: LogoCut, x: number): RGB {
  return x >= logo.iStart && x <= logo.iEnd ? YELLOW : CONCRETE;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// -----------------------------------------------------------------------------
// Materialize: retardo pseudoaleatorio por celda (sesgo izq->dcha) y resolucion
// . -> : -> o -> #. La I asienta en concrete y el amarillo entra de golpe al
// final, como un sello.
// -----------------------------------------------------------------------------
const SWEEP = 0.45; // ticks de retardo por columna
const JITTER = 7; // retardo extra aleatorio máximo por celda, en ticks
const SETTLE = 6; // ticks desde el primer ruido hasta el bloque sólido
const STAMP_HOLD = 3; // ticks que el sello amarillo se pinta en bold

// Hash determinista por celda: el ruido es estable entre frames.
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

type Phase = {
  stamp: number;
  ruleStart: number;
  ruleEnd: number;
  subStart: number;
  finish: number;
};

function buildPhase(width: number, subtitle: string): Phase {
  const noiseEnd = maxCellDelay(width) + SETTLE;
  const stamp = noiseEnd + 3;
  const ruleStart = stamp + STAMP_HOLD - 1;
  const ruleEnd = ruleStart + 6;
  const subStart = ruleEnd - 2;
  const subEnd = subStart + Math.ceil(subtitle.length / 2);
  const finish = subEnd + 4;
  return { stamp, ruleStart, ruleEnd, subStart, finish };
}

function renderSubtitle(subtitle: string, reveal: number, width: number): string {
  const pad = Math.max(0, Math.floor((width - subtitle.length) / 2));
  let sub = " ".repeat(pad);
  for (let i = 0; i < subtitle.length; i++) {
    const ch = subtitle[i] ?? " ";
    if (i > reveal || ch === " ") {
      sub += " ";
      continue;
    }
    sub += i === 0 ? boldRgb(YELLOW, ch) : rgbRaw(STRUCTURE, ch);
  }
  return sub;
}

// Render estático: logo plano + regla + subtítulo. Non-TTY / NO_COLOR.
function renderStatic(subtitle: string): string {
  const logo = pickLogo();
  const out: string[] = [];
  if (!colorEnabled()) {
    out.push(...logo.lines);
    out.push(RULE_CH.repeat(logo.width));
    const pad = Math.max(0, Math.floor((logo.width - subtitle.length) / 2));
    out.push(" ".repeat(pad) + subtitle);
    return out.join("\n");
  }
  for (const row of logo.lines) {
    let line = "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? " ";
      line += ch === " " ? " " : rgbRaw(logoColor(logo, x), ch);
    }
    out.push(line);
  }
  out.push(rgbRaw(STRUCTURE, RULE_CH.repeat(logo.width)));
  out.push(renderSubtitle(subtitle, subtitle.length, logo.width));
  return out.join("\n");
}

// Una celda del logo en un tick dado: ruido, bloque asentado o sello amarillo.
function renderCell(logo: LogoCut, x: number, y: number, ch: string, tick: number, ph: Phase): string {
  const age = tick - cellDelay(x, y);
  if (age < 0) return " ";
  if (age < 2) return dimRgb(STRUCTURE, "░");
  if (age < 4) return rgbRaw(STRUCTURE, "▒");
  if (age < SETTLE) return dimRgb(CONCRETE, "▓");
  if (tick >= ph.stamp && x >= logo.iStart && x <= logo.iEnd) {
    return tick < ph.stamp + STAMP_HOLD ? boldRgb(YELLOW, ch) : rgbRaw(YELLOW, ch);
  }
  return rgbRaw(CONCRETE, ch);
}

// Un frame de animación (logo + regla + subtítulo) como array de líneas.
function renderFrame(logo: LogoCut, subtitle: string, tick: number, ph: Phase): string[] {
  const out: string[] = [];

  for (let y = 0; y < logo.lines.length; y++) {
    const rowStr = logo.lines[y] ?? "";
    let line = "";
    for (let x = 0; x < rowStr.length; x++) {
      const ch = rowStr[x] ?? " ";
      line += ch === " " ? " " : renderCell(logo, x, y, ch, tick, ph);
    }
    out.push(line);
  }

  // Regla, del centro hacia afuera (nada antes de su fase).
  if (tick < ph.ruleStart) {
    out.push(" ".repeat(logo.width));
  } else {
    const prog = clamp01((tick - ph.ruleStart) / Math.max(1, ph.ruleEnd - ph.ruleStart));
    const half = Math.floor((logo.width / 2) * prog);
    const center = Math.floor(logo.width / 2);
    let rule = "";
    for (let x = 0; x < logo.width; x++) {
      rule += Math.abs(x - center) <= half ? rgbRaw(STRUCTURE, RULE_CH) : " ";
    }
    out.push(rule);
  }

  // Subtítulo, typewriter.
  {
    const reveal = tick < ph.subStart ? -1 : Math.floor((tick - ph.subStart) * 2);
    out.push(renderSubtitle(subtitle, reveal, logo.width));
  }

  return out;
}

// NOISE KILL -> La animación se toca UNA vez por proceso. Menú → Install la
// disparaba dos veces; a partir de la primera, las siguientes pintan estático.
let bannerAnimated = false;

// Frases de arranque (voz de la casa: Ein es el "data dog" de Cowboy Bebop —
// discreto y capaz). Una al azar tras materializar el logo, atenuada.
const MOTTOS = [
  "el data dog ya husmea el repo.",
  "modelos caros piensan; baratos ejecutan.",
  "trabajo difícil, sin ruido.",
  "discreto, pero profundamente capaz.",
  "el plan primero; luego el código.",
  "cambios pequeños, verificados, explicados.",
];

function renderMotto(width: number): string {
  const motto = MOTTOS[Math.floor(Math.random() * MOTTOS.length)] ?? MOTTOS[0];
  const line = `// ${motto}`;
  const pad = Math.max(0, Math.floor((width - line.length) / 2));
  return " ".repeat(pad) + dimRgb(STRUCTURE, line);
}

// Anima el banner una vez y resuelve. Sin animación en non-TTY o repeticiones.
export async function playBanner(state: BannerState = readBannerState()): Promise<void> {
  const subtitle = renderBanner(state);
  if (bannerAnimated || !colorEnabled()) {
    process.stdout.write(`${renderStatic(subtitle)}\n`);
    return;
  }
  bannerAnimated = true;

  const logo = pickLogo();
  const ph = buildPhase(logo.width, subtitle);
  const rows = logo.lines.length + 2; // logo + regla + subtítulo

  // Ocultar cursor durante el repaint in-situ evita parpadeo entre frames.
  process.stdout.write("\x1b[?25l");
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    process.stdout.write("\x1b[?25h");
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
      if (tick > ph.finish || Date.now() - start > 3000) {
        clearInterval(timer);
        process.stdout.write(`\x1b[${rows}A`);
        process.stdout.write(`${renderStatic(subtitle)}\n`);
        cleanup();
        process.off("SIGINT", onSigint);
        resolve();
        return;
      }
      process.stdout.write(`\x1b[${rows}A`); // cursor up to frame top
      process.stdout.write(`${renderFrame(logo, subtitle, tick, ph).join("\n")}\n`);
    }, 30);
  });

  // Sello final: una frase de la casa, atenuada, bajo el subtítulo.
  process.stdout.write(`${renderMotto(logo.width)}\n`);
}

export function bannerStatic(state: BannerState = readBannerState()): string {
  return renderStatic(renderBanner(state));
}
