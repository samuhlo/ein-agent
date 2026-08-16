// =============================================================================
// [CORE] EIN BANNER — 8-bit style intro
// Pure frame generation: a frame is a function of its index, so the animation
// is testable without a terminal and the driver only owns the clock.
// =============================================================================

// La geometría vive en `ein-logo.ts` — fuente única del árbol ein-pi. Estaba
// copiada aquí, en `extensions/ein-banner.ts` y en el splash de la app: cuatro
// copias del mismo dibujo, garantía de que acabaran divergiendo. Se re-exporta
// con los nombres de siempre para no tocar a los consumidores.
export { LOGO_LARGE as LOGO, LOGO_SMALL as LOGO_NARROW } from "./ein-logo.ts";
import { LOGO_LARGE, LOGO_SMALL } from "./ein-logo.ts";

/** Dither ramp: the 8-bit look comes from block density, not from colour. */
const RAMP = ["░", "▒", "▓", "█"] as const;
const SWEEP_TAIL = RAMP.length;

export const NARROW_COLUMNS = 60;
export const TAGLINE = "coding agent workbench";

export function logoFor(columns: number): readonly string[] {
  return columns < NARROW_COLUMNS ? LOGO_SMALL : LOGO_LARGE;
}

/** Total frames of the intro, including the settled one. */
export function frameCount(columns: number): number {
  const width = Math.max(...logoFor(columns).map((line) => line.length));
  return width + SWEEP_TAIL + 1;
}

/**
 * One frame of the sweep. A bright edge travels left to right; behind it the
 * logo is solid, ahead of it nothing has been drawn yet, and the few columns
 * around it fade through the dither ramp — the classic 8-bit wipe-in.
 */
export function bannerFrame(index: number, columns: number): readonly string[] {
  const logo = logoFor(columns);
  const width = Math.max(...logo.map((line) => line.length));
  const edge = Math.min(index, width + SWEEP_TAIL);
  return logo.map((line) => {
    let out = "";
    for (let column = 0; column < line.length; column++) {
      const character = line[column] ?? " ";
      if (character === " ") { out += " "; continue; }
      const distance = edge - column;
      if (distance <= 0) { out += " "; continue; }
      if (distance >= SWEEP_TAIL) { out += "█"; continue; }
      out += RAMP[distance - 1] ?? "█";
    }
    return out.trimEnd();
  });
}

/** The settled banner: full logo plus tagline. */
export function bannerFinal(columns: number): readonly string[] {
  return [...bannerFrame(frameCount(columns), columns), "", TAGLINE];
}
