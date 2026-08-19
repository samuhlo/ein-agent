// =============================================================================
// [CORE] EIN BANNER — la marca de arranque de la app
// Generación pura: el banner es una función de su ancho, así que se puede
// probar sin terminal y el driver solo posee el reloj.
//
// ANTES esto era un barrido de 8 bits: un borde de dithering (░▒▓█) recorría el
// logo de bloque de izquierda a derecha, fotograma a fotograma. Se retira con el
// logo — la geometría vive en `ein-logo.ts` y ahora es un wordmark de una fila,
// que no tiene nada que barrer. Un arranque que hace esperar para enseñar su
// propio nombre cobra tiempo a cambio de nada.
// =============================================================================

export { WORDMARK, accentColumn, wordmarkText } from "./ein-logo.ts";
import { wordmarkText } from "./ein-logo.ts";

export const NARROW_COLUMNS = 60;
export const TAGLINE = "coding agent workbench";

/** Tracking según el sitio: apretado en terminales estrechos. */
export function trackingFor(columns: number): string {
  return columns < NARROW_COLUMNS ? " " : "   ";
}

/** La marca asentada: wordmark y lema, con su aire en medio. */
export function bannerFinal(columns: number): readonly string[] {
  return [wordmarkText(trackingFor(columns)), "", TAGLINE];
}
