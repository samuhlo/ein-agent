// =============================================================================
// BANNER
// EIN block logo with gold #FFCA40 sweep + glint + shimmer. Ported from the
// pure parts of ein-banner.ts and rendered with plain stdout writes (no pi).
// Falls back to a static render on non-TTY / NO_COLOR.
// =============================================================================

import { GLINT, GOLD, TIP, colorEnabled } from "./theme.ts";

// EIN block-letter logo (26 cols, 6 rows, uniform width).
const TEXT_LOGO = [
  "████████  ██████  ██    ██",
  "██          ██    ███   ██",
  "██████      ██    ████  ██",
  "██          ██    ██ ██ ██",
  "██          ██    ██  ████",
  "████████  ██████  ██   ███",
];

function rgbRaw(r: number, g: number, b: number, text: string): string {
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

function padLines(lines: string[]): { lines: string[]; width: number } {
  const width = Math.max(...lines.map((l) => l.length), 0);
  return { lines: lines.map((l) => l.padEnd(width)), width };
}

// Static render: plain gold logo, no animation. Used for non-TTY / NO_COLOR.
function renderStatic(): string {
  const { lines } = padLines(TEXT_LOGO);
  if (!colorEnabled()) return lines.join("\n");
  return lines.map((l) => rgbRaw(GOLD.r, GOLD.g, GOLD.b, l)).join("\n");
}

// Build one animation frame at a given tick.
function renderFrame(tick: number, revealSpeed: number, glint: { start: number; end: number }): string {
  const { lines, width } = padLines(TEXT_LOGO);
  const revealHead = tick * revealSpeed;
  const glintActive = tick >= glint.start && tick <= glint.end;
  const glintLocal = ((tick - glint.start) / Math.max(1, glint.end - glint.start)) * (width + 2);

  const out: string[] = [];
  for (let y = 0; y < lines.length; y++) {
    const row = lines[y] ?? "";
    let line = "";
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] ?? " ";
      if (ch === " ") {
        line += " ";
        continue;
      }
      if (x > revealHead) {
        line += " ";
        continue;
      }
      // Glint: a single warm highlight sweeps after the reveal.
      if (glintActive && x >= glintLocal - 1 && x <= glintLocal + 1) {
        line += `\x1b[1m${rgbRaw(GLINT.r, GLINT.g, GLINT.b, ch)}\x1b[22m`;
        continue;
      }
      // Pen tip: brighter leading edge.
      const age = revealHead - x;
      if (age < 1.6) {
        line += `\x1b[1m${rgbRaw(TIP.r, TIP.g, TIP.b, ch)}\x1b[22m`;
        continue;
      }
      // Settled gold with subtle living shimmer.
      const s = 0.9 + Math.sin(x * 0.16 + y * 0.55 + tick * 0.08) * 0.1;
      line += rgbRaw(
        Math.min(255, Math.round(GOLD.r * s)),
        Math.min(255, Math.round(GOLD.g * s)),
        Math.min(255, Math.round(GOLD.b * s)),
        ch,
      );
    }
    out.push(line);
  }
  return out.join("\n");
}

// Animate the banner once, then resolve. No-op animation on non-TTY.
export async function playBanner(): Promise<void> {
  if (!colorEnabled()) {
    process.stdout.write(`${renderStatic()}\n`);
    return;
  }

  const { width } = padLines(TEXT_LOGO);
  const revealSpeed = 1.4;
  const revealEnd = Math.ceil(width / revealSpeed) + 4;
  const glintStart = revealEnd + 3;
  const glintEnd = glintStart + 12;
  const finish = glintEnd + 18;
  const rows = TEXT_LOGO.length;

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
      if (tick > finish || Date.now() - start > 4000) {
        clearInterval(timer);
        // Final settled frame.
        process.stdout.write(`\x1b[${rows}A`);
        process.stdout.write(`${renderFrame(finish, revealSpeed, { start: glintStart, end: glintEnd })}\n`);
        cleanup();
        process.off("SIGINT", onSigint);
        resolve();
        return;
      }
      process.stdout.write(`\x1b[${rows}A`); // cursor up to frame top
      process.stdout.write(`${renderFrame(tick, revealSpeed, { start: glintStart, end: glintEnd })}\n`);
    }, 30);
  });
}

export function bannerStatic(): string {
  return renderStatic();
}
