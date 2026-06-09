// =============================================================================
// BANNER
// EIN block logo with a metallic gold gradient, a repeating diagonal shine
// sweep, a center-out accent rule, and a typewriter subtitle reading
// "SAMUHLO · PI WORKBENCH". Rendered with plain stdout writes (no pi).
// Falls back to a static render on non-TTY / NO_COLOR.
// =============================================================================

import { GOLD, GOLD_BRIGHT, GOLD_DIM, colorEnabled } from "./theme.ts";

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

const SUBTITLE = "SAMUHLO · PI WORKBENCH";
const RULE_CH = "─";

// Metallic gradient anchors: deep gold → brand gold → bright gold.
const DEEP = { r: 198, g: 138, b: 28 } as const;
const MID = GOLD; // #FFCA40
const HI = { r: 255, g: 238, b: 170 } as const;

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
    return { r: lerp(DEEP.r, MID.r, t), g: lerp(DEEP.g, MID.g, t), b: lerp(DEEP.b, MID.b, t) };
  }
  const t = (d - 0.5) / 0.5;
  return { r: lerp(MID.r, HI.r, t), g: lerp(MID.g, HI.g, t), b: lerp(MID.b, HI.b, t) };
}

function rgbRaw(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${clampByte(r)};${clampByte(g)};${clampByte(b)}m${text}\x1b[39m`;
}

function boldRgb(c: RGB, text: string): string {
  return `\x1b[1m${rgbRaw(c.r, c.g, c.b, text)}\x1b[22m`;
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
  const revealSpeed = 1.5;
  const revealEnd = Math.ceil(width / revealSpeed) + 3;
  const ruleStart = revealEnd - 2;
  const ruleEnd = ruleStart + 8;
  const subStart = ruleEnd - 2;
  const subEnd = subStart + Math.ceil(SUBTITLE.length / 1.6);
  const finish = subEnd + 16;
  return { revealSpeed, revealEnd, ruleStart, ruleEnd, subStart, finish };
}

// Static render: gold logo + rule + subtitle, no animation. Non-TTY / NO_COLOR.
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
  for (let y = 0; y < lines.length; y++) {
    let line = "";
    const row = lines[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? " ";
      if (ch === " ") { line += " "; continue; }
      const d = (x / Math.max(1, width - 1)) * 0.6 + (y / Math.max(1, lines.length - 1)) * 0.4;
      const c = goldAt(d);
      line += rgbRaw(c.r, c.g, c.b, ch);
    }
    out.push(line);
  }
  out.push(rgbRaw(GOLD_DIM.r, GOLD_DIM.g, GOLD_DIM.b, RULE_CH.repeat(width)));
  const pad = Math.max(0, Math.floor((width - SUBTITLE.length) / 2));
  out.push(" ".repeat(pad) + rgbRaw(GOLD.r, GOLD.g, GOLD.b, SUBTITLE));
  return out.join("\n");
}

// Build one animation frame (logo + rule + subtitle) as an array of lines.
function renderFrame(tick: number, ph: Phase): string[] {
  const { lines, width } = padLines(TEXT_LOGO);
  const height = lines.length;
  const revealHead = tick * ph.revealSpeed;

  // Diagonal shine band sweeps across, repeating, brightening cells it crosses.
  const SHINE_PERIOD = 24;
  const SHINE_BAND = 5;
  const diagMax = width + (height - 1) * 2;
  const shinePos =
    ((tick % SHINE_PERIOD) / SHINE_PERIOD) * (diagMax + SHINE_BAND * 2) - SHINE_BAND;
  const breathe = 0.96 + Math.sin(tick * 0.12) * 0.04;

  const out: string[] = [];

  // Logo.
  for (let y = 0; y < height; y++) {
    const rowStr = lines[y] ?? "";
    let line = "";
    for (let x = 0; x < rowStr.length; x++) {
      const ch = rowStr[x] ?? " ";
      if (ch === " " || x > revealHead) { line += " "; continue; }

      // Pen tip: bright leading edge of the reveal sweep.
      const age = revealHead - x;
      if (age < 1.6) {
        line += boldRgb(GOLD_BRIGHT, ch);
        continue;
      }

      // Base metallic gradient.
      const d = (x / Math.max(1, width - 1)) * 0.6 + (y / Math.max(1, height - 1)) * 0.4;
      let col = goldAt(d);

      // Shine boost toward white-gold near the moving band.
      const diag = x + y * 2;
      const dist = Math.abs(diag - shinePos);
      let boosted = false;
      if (dist < SHINE_BAND) {
        const boost = (1 - dist / SHINE_BAND) ** 2 * 0.85;
        col = {
          r: lerp(col.r, 255, boost),
          g: lerp(col.g, 250, boost),
          b: lerp(col.b, 230, boost),
        };
        boosted = boost > 0.5;
      }

      const body = rgbRaw(col.r * breathe, col.g * breathe, col.b * breathe, ch);
      line += boosted ? `\x1b[1m${body}\x1b[22m` : body;
    }
    out.push(line);
  }

  // Accent rule, drawn from the center outward.
  {
    const prog = clamp01((tick - ph.ruleStart) / Math.max(1, ph.ruleEnd - ph.ruleStart));
    const half = Math.floor((width / 2) * prog);
    const center = Math.floor(width / 2);
    let rule = "";
    for (let x = 0; x < width; x++) {
      rule += Math.abs(x - center) <= half
        ? rgbRaw(GOLD_DIM.r, GOLD_DIM.g, GOLD_DIM.b, RULE_CH)
        : " ";
    }
    out.push(rule);
  }

  // Subtitle, typewriter reveal left-to-right.
  {
    const reveal = Math.floor((tick - ph.subStart) * 1.6);
    const pad = Math.max(0, Math.floor((width - SUBTITLE.length) / 2));
    let sub = " ".repeat(pad);
    for (let i = 0; i < SUBTITLE.length; i++) {
      const ch = SUBTITLE[i] ?? " ";
      if (tick < ph.subStart || i > reveal || ch === " ") { sub += " "; continue; }
      sub += reveal - i < 2 ? boldRgb(GOLD_BRIGHT, ch) : rgbRaw(GOLD.r, GOLD.g, GOLD.b, ch);
    }
    out.push(sub);
  }

  return out;
}

// Animate the banner once, then resolve. No-op animation on non-TTY.
export async function playBanner(): Promise<void> {
  if (!colorEnabled()) {
    process.stdout.write(`${renderStatic()}\n`);
    return;
  }

  const { width } = padLines(TEXT_LOGO);
  const ph = buildPhase(width);
  const rows = TEXT_LOGO.length + 2; // logo + rule + subtitle

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

  // Reserve the rows once, then repaint in place each tick.
  process.stdout.write("\n".repeat(rows));

  await new Promise<void>((resolve) => {
    let tick = 0;
    const start = Date.now();
    const timer = setInterval(() => {
      tick++;
      if (tick > ph.finish || Date.now() - start > 4500) {
        clearInterval(timer);
        process.stdout.write(`\x1b[${rows}A`);
        process.stdout.write(`${renderFrame(ph.finish, ph).join("\n")}\n`);
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
