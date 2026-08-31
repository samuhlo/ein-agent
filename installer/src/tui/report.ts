// =============================================================================
// REPORT — la salida del instalador, en la gramática de Ein
// Sustituye a `@clack/prompts` para TODO lo que el instalador cuenta (intro,
// outro, log.*). Clack traía su propio canalón `│ ◆` con sus propios colores, y
// el resultado era que tras un banner de marca cuidado el instalador volcaba
// líneas de log de desarrollador en un estilo que no era el suyo: dos gramáticas
// visuales peleando dentro del mismo binario.
//
// El installer DUPLICA la gramática a propósito, igual que duplica la paleta:
// es un binario que corre antes de que exista el template desplegado, así que
// no puede importar de `ein-pi/`. Un test compara las dos copias.
//
// Aquí no hay marco. Aire, sangría y apagado: `runtime/docs/STYLE.md // 002`.
// =============================================================================

import { GLYPH, MARK, bold, concrete, danger, gold, structure, visibleWidth } from "./theme.ts";

const INDENT = "  ";
const FIELD_INDENT = "    ";
const LABEL_W = 18;

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export function blank(): void {
  out();
}

/** El wordmark, con la `i` en amarillo: el gesto de marca a tamaño de chrome. */
export function wordmark(): string {
  return `${concrete("e")}${gold("i")}${concrete("n")}`;
}

/** Arranque: marca y una línea de qué es esto. Sin caja y con aire de sobra. */
export function intro(subtitle: string): void {
  out();
  out(`${INDENT}${bold(wordmark())}`);
  out(`${INDENT}${structure(subtitle)}`);
  out();
}

/**
 * Título de sección: `// NNN. título`. El `//` es el gesto de marca y va en
 * acento; el número y el título quedan apagados.
 */
export function section(index: number, title: string): void {
  out();
  out(`${INDENT}${gold("//")} ${structure(`${String(index).padStart(3, "0")}. ${title.toLowerCase()}`)}`);
  out();
}

/** Fila etiqueta/valor: dos columnas con sangría fija, sin líneas de puntos. */
export function field(label: string, value: string): void {
  const head = label.toLowerCase();
  const pad = " ".repeat(Math.max(1, LABEL_W - visibleWidth(head)));
  out(`${FIELD_INDENT}${structure(head)}${pad}${concrete(value)}`);
}

/** Ayuda o matiz: ocupa el ancho entero, sin etiqueta ni valor a la derecha. */
export function note(text: string): void {
  out(`${FIELD_INDENT}${structure(text)}`);
}

type Level = "ok" | "warn" | "fail" | "idle";

const PAINT: Record<Level, (text: string) => string> = {
  ok: structure,
  warn: gold,
  fail: danger,
  idle: structure,
};

const GLYPH_FOR: Record<Level, string> = {
  ok: MARK.ok,
  warn: MARK.warn,
  fail: MARK.fail,
  idle: MARK.idle,
};

/**
 * Fila de resultado de un paso. El detalle va apagado a la derecha: quien lee un
 * instalador quiere saber si algo falló, no repasar cada ruta que se escribió.
 */
export function step(level: Level, label: string, detail = ""): void {
  const mark = PAINT[level](GLYPH_FOR[level]);
  const head = label.toLowerCase();
  const pad = " ".repeat(Math.max(1, LABEL_W - visibleWidth(head)));
  const body = level === "fail" || level === "warn" ? concrete(head) : structure(head);
  out(`${FIELD_INDENT}${mark} ${body}${pad}${structure(detail)}`);
}

export const ok = (label: string, detail?: string): void => step("ok", label, detail);
export const warn = (label: string, detail?: string): void => step("warn", label, detail);
export const fail = (label: string, detail?: string): void => step("fail", label, detail);
export const idle = (label: string, detail?: string): void => step("idle", label, detail);

/** Un bloque agrupado por su regla vertical, para texto que va junto. */
export function ruled(lines: readonly string[]): void {
  for (const line of lines) out(`${INDENT}${structure(GLYPH.rule)} ${line}`);
}

/** Texto libre, ya pintado por quien llama (informes del doctor, diffs). */
export function raw(text: string): void {
  for (const line of text.split("\n")) out(line ? `${FIELD_INDENT}${line}` : "");
}

/** Cierre. Se le pasan los comandos que el usuario tiene que recordar. */
export function outro(lines: readonly string[]): void {
  out();
  for (const line of lines) out(`${INDENT}${line}`);
  out();
}
