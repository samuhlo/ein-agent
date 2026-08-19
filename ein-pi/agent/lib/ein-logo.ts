// =============================================================================
// EIN WORDMARK — geometría de marca, fuente única del árbol ein-pi
// El banner de arranque de Pi (`extensions/ein-banner.ts`), el splash de la app
// (`surfaces/terminal-splash.ts`) y su entrypoint pintan la MISMA marca; tenerla
// varias veces garantizaba que se separasen. El installer conserva su copia a
// propósito: es un binario que corre ANTES de que exista este template.
//
// ANTES esto era un logo de bloque de 54x10 (`██`) con su corte estrecho y el
// rango de columnas de la I. Se retira entero: era un SEGUNDO alfabeto para una
// marca que en todas las demás superficies se escribe `ein`, y dos alfabetos no
// son jerarquía — son la misma cosa dicha dos veces. Además pesaba 540 celdas
// encima de pantallas cuyo argumento de diseño es el aire.
//
// El gesto de marca no se pierde: sigue siendo un solo elemento amarillo sobre
// neutro, la `i`. Solo que ahora cabe en una fila.
//
// Sin colores ni escapes ANSI aquí: solo la geometría. Cada superficie pinta con
// su propio mecanismo (secuencias ANSI en Pi, atributos en OpenTUI).
// =============================================================================

/**
 * Las tres piezas del wordmark. Se exponen sueltas porque lo que cambia entre
 * superficies es CÓMO se pinta el acento, no qué letras son: cada una colorea
 * `accent` con su mecanismo y deja las otras dos en el color de texto.
 */
export const WORDMARK = Object.freeze({
	before: "e",
	/** El gesto de marca: la única pieza en amarillo. */
	accent: "i",
	after: "n",
	/** Tracking de la escala de display. En chrome se usa sin él. */
	tracking: "   ",
});

/** El wordmark como texto plano, para medir y para fallback monocromo. */
export function wordmarkText(tracking: string = WORDMARK.tracking): string {
	return `${WORDMARK.before}${tracking}${WORDMARK.accent}${tracking}${WORDMARK.after}`;
}

/** Columna en la que cae el acento, para las superficies que pintan por celda. */
export function accentColumn(tracking: string = WORDMARK.tracking): number {
	return WORDMARK.before.length + tracking.length;
}

export const RULE_CH = "─";

/** Centra una línea en un ancho dado. Compartido para que subtítulo y lema
 *  queden alineados igual en banner y splash. */
export function centerInLogo(text: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - text.length) / 2));
	return " ".repeat(pad) + text;
}
