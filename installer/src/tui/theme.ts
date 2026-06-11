// =============================================================================
// THEME
// Paleta brutalista samuhlo (plana, sin gradientes). Fuente de verdad:
// ein-pi/agent/brand.json — el installer la duplica porque corre antes de que
// exista el template desplegado. Honra NO_COLOR / non-TTY.
// =============================================================================

export const CARBON = { r: 12, g: 0, b: 17 } as const; // #0C0011
export const CONCRETE = { r: 250, g: 243, b: 240 } as const; // #FAF3F0
export const STRUCTURE = { r: 115, g: 115, b: 115 } as const; // #737373
export const YELLOW = { r: 255, g: 202, b: 64 } as const; // #FFCA40

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

export function rgb(r: number, g: number, b: number, text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

// Amarillo industrial: acentos, marcadores ■, foco.
export function gold(text: string): string {
  return rgb(YELLOW.r, YELLOW.g, YELLOW.b, text);
}

// Gris estructura: etiquetas, reglas, texto secundario.
export function structure(text: string): string {
  return rgb(STRUCTURE.r, STRUCTURE.g, STRUCTURE.b, text);
}

// Blanco concreto: valores, texto principal.
export function concrete(text: string): string {
  return rgb(CONCRETE.r, CONCRETE.g, CONCRETE.b, text);
}

// Tag invertido: texto carbon sobre placa amarilla.
export function plate(text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[48;2;${YELLOW.r};${YELLOW.g};${YELLOW.b}m\x1b[38;2;${CARBON.r};${CARBON.g};${CARBON.b}m\x1b[1m${text}\x1b[22m\x1b[39m\x1b[49m`;
}

export function bold(text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[1m${text}\x1b[22m`;
}
