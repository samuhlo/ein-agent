// =============================================================================
// THEME
// Ein brand gold #FFCA40 and truecolor helpers. Honors NO_COLOR / non-TTY.
// =============================================================================

export const GOLD = { r: 255, g: 202, b: 64 } as const;
// Complementary tones for labels, dim text, and highlights.
export const GOLD_DIM = { r: 190, g: 150, b: 70 } as const;
export const GOLD_BRIGHT = { r: 255, g: 224, b: 150 } as const;
export const GLINT = { r: 255, g: 250, b: 220 } as const;
export const TIP = { r: 255, g: 232, b: 150 } as const;

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export function rgb(r: number, g: number, b: number, text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

export function gold(text: string): string {
  return rgb(GOLD.r, GOLD.g, GOLD.b, text);
}

export function goldDim(text: string): string {
  return rgb(GOLD_DIM.r, GOLD_DIM.g, GOLD_DIM.b, text);
}

export function goldBright(text: string): string {
  return rgb(GOLD_BRIGHT.r, GOLD_BRIGHT.g, GOLD_BRIGHT.b, text);
}

export function bold(text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[1m${text}\x1b[22m`;
}
