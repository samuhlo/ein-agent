// =============================================================================
// UI — la superficie única del instalador
// Fachada sobre `report.ts` (lo que cuenta) y `prompt.ts` (lo que pregunta),
// con la MISMA forma que exponía `@clack/prompts`. Los puntos de llamada solo
// cambian de importación, no de forma: swap de una línea por fichero en vez de
// setenta ediciones, que es donde se colaría un error sin ruido.
//
// Por qué se retira clack: traía su propio canalón `│ ◆` con sus colores. Tras
// un banner de marca cuidado, el instalador volcaba log de desarrollador en un
// estilo ajeno — dos gramáticas visuales peleando en el mismo binario, que es
// justo lo contrario de «launcher, instalador y sesión son el mismo producto».
// =============================================================================

import * as report from "./report.ts";
import * as prompt from "./prompt.ts";

const ANSI = /\x1b\[[0-9;]*m/g;

function plain(text: string): string {
  return text.replace(ANSI, "");
}

/** Arranque. Llega ya pintado desde el punto de llamada; aquí manda la marca. */
export function intro(text: string): void {
  report.intro(plain(text));
}

/** Cierre. Una línea, sin caja y con aire por delante. */
export function outro(text: string): void {
  report.outro([plain(text)]);
}

/** Cancelación del usuario: no es un fallo del instalador, no se pinta rojo. */
export function cancel(text: string): void {
  report.note(plain(text));
  report.blank();
}

export const log = {
  success: (text: string): void => report.ok(plain(text)),
  info: (text: string): void => report.note(plain(text)),
  step: (text: string): void => report.ok(plain(text)),
  warn: (text: string): void => report.warn(plain(text)),
  error: (text: string): void => report.fail(plain(text)),
  /** Bloques ya compuestos (informe del doctor, planes): se sangran y ya. */
  message: (text: string): void => report.raw(text),
};

export const { select, confirm, password, spinner, isCancel } = prompt;

export { report };
