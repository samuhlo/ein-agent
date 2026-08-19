// =============================================================================
// THEME
// Paleta brutalista samuhlo (plana, sin gradientes). Fuente de verdad:
// ein-pi/agent/brand.json — el installer la duplica porque corre antes de que
// exista el template desplegado. Honra NO_COLOR / non-TTY.
// =============================================================================

export const CARBON = { r: 11, g: 11, b: 11 } as const; // #0B0B0B
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

// Banda de foco: la fila activa se tiñe a todo el ancho, en vez de llevar borde
// o cursor. Derivada del amarillo a alfa 0.08 sobre la base (STYLE.md // 001),
// que es lo que la ata al acento único sin meter un quinto color.
const BAND = { r: 31, g: 26, b: 15 } as const; // #1F1A0F

export function band(text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[48;2;${BAND.r};${BAND.g};${BAND.b}m${text}\x1b[49m`;
}

export function bold(text: string): string {
  if (!colorEnabled()) return text;
  return `\x1b[1m${text}\x1b[22m`;
}

/** Ancho visible: los códigos ANSI no ocupan columnas. */
export function visibleWidth(text: string): number {
  return [...text.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

// -----------------------------------------------------------------------------
// Vocabulario de estado, común con la app de terminal
// (`ein-pi/agent/surfaces/terminal-theme.ts`). Antes el doctor pintaba con
// verdes y rojos inventados (rgb(120,200,120)…) que no salían de brand.json:
// la misma deriva que tenía la TUI con su tema azul. El semáforo es la ÚNICA
// concesión fuera de los cuatro colores, y solo porque comunica estado.
// -----------------------------------------------------------------------------
export const MARK = {
  ok: "✓",
  idle: "·",
  warn: "!",
  fail: "✕",
} as const;

/** Glifos de la gramática. Ninguno dibuja un contorno cerrado, a propósito. */
export const GLYPH = {
  rule: "▏",
  focus: "▸",
  sep: "·",
} as const;

const DANGER = { r: 229, g: 72, b: 77 } as const; // #E5484D

/** Rojo de fallo: fuera de marca a propósito, dentro del semáforo. */
export function danger(text: string): string {
  return rgb(DANGER.r, DANGER.g, DANGER.b, text);
}

/** Marcador + color por nivel. `OK` en concreto, `WARN` en amarillo, `FAIL` en rojo. */
export function levelMark(level: "OK" | "WARN" | "FAIL" | string): string {
  if (level === "OK") return concrete(MARK.ok);
  if (level === "WARN") return gold(MARK.warn);
  if (level === "FAIL") return danger(MARK.fail);
  return structure(MARK.idle);
}
