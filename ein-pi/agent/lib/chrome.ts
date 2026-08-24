// =============================================================================
// [CORE] GRAMÁTICA DE TERMINAL
// Las primitivas de `core/docs/STYLE.md // 002`, una sola vez. Antes cada
// superficie dibujaba su propio marco: el installer tenía `tui/frame.ts`, el
// banner `banner-panel.ts` y el overlay lo suyo, y las tres se separaron.
//
// Aquí no hay marco. La jerarquía sale del aire, de la sangría y del apagado:
//   - un bloque se agrupa con una REGLA VERTICAL, no con una caja;
//   - la fila con foco es una BANDA de fondo, no un borde;
//   - una sección es `// NNN. título`, sin `■` y sin regla debajo.
//
// Módulo PURO: entra texto y paleta, salen líneas. Sin fs, sin Pi, sin OpenTUI.
// Por eso el aspecto exacto se puede fijar en un test, que es lo que impide que
// una interfaz se degrade sin que nadie lo note.
// =============================================================================

import { fit, padVisible, visibleWidth, type Palette } from "./theme.ts";

/** Glifos de la gramática. Ninguno dibuja un contorno cerrado, a propósito. */
export const GLYPH = Object.freeze({
	/** Regla vertical: agrupa un bloque sin encerrarlo. */
	rule: "▏",
	/** Fila con foco. */
	focus: "▸",
	/** Separador universal de metadatos y atajos. */
	sep: "·",
	done: "✓",
	pending: "·",
	/** Fail-closed: lo que no se ha comprobado se dibuja como desconocido. */
	unknown: "?",
	/** Distinto de `unknown`: esto SÍ se comprobó, y salió mal. */
	failed: "×",
});

// Tintes derivados de `#0B0B0B` con la regla de STYLE.md // 001:
// superficie semántica = mix(c, α) = 11 + α·(c − 11) por canal.
// La banda de foco es yellow α 0.08 — cálida, para atarla al acento único.
const BAND_RGB = Object.freeze({ r: 31, g: 26, b: 15 });

const RESET = "\u001b[0m";

/** Fondo de la banda de foco. Sin color, la banda no existe y manda el `▸`. */
export function band(text: string, width: number, enabled: boolean): string {
	const filled = padVisible(text, width);
	if (!enabled) return filled;
	return `\u001b[48;2;${BAND_RGB.r};${BAND_RGB.g};${BAND_RGB.b}m${filled}${RESET}`;
}

/**
 * Título de sección: `// NNN. título`. El `//` es el gesto de marca y va en
 * acento; el número y el título quedan apagados. La numeración se conserva —
 * es lo que hace reconocible una salida de Ein — y lo que se retira es el peso
 * que la rodeaba.
 */
export function sectionTitle(index: number, title: string, palette: Palette): string {
	const n = String(Math.max(0, Math.trunc(index))).padStart(3, "0");
	return `${palette.accent("//")} ${palette.muted(`${n}. ${title.toLowerCase()}`)}`;
}

export type FieldOptions = Readonly<{
	/** Ancho de la columna de etiqueta. */
	labelWidth?: number;
	/** Sangría izquierda del bloque. */
	indent?: number;
	/** Ancho útil total, para recortar el valor sin desbordar. */
	width?: number;
}>;

const DEFAULT_LABEL_W = 16;
const DEFAULT_INDENT = 4;

/**
 * Fila etiqueta/valor: dos columnas con sangría fija. Sustituye a las líneas de
 * puntos que llevaban la etiqueta hasta su valor — los puntos eran una rejilla
 * dibujada a mano, y la columna hace el mismo trabajo sin pintar nada.
 */
export function field(label: string, value: string, palette: Palette, options: FieldOptions = {}): string {
	const indent = " ".repeat(Math.max(0, options.indent ?? DEFAULT_INDENT));
	const labelWidth = Math.max(1, options.labelWidth ?? DEFAULT_LABEL_W);
	const head = padVisible(palette.muted(fit(label, labelWidth - 1)), labelWidth);
	const room = options.width ? options.width - indent.length - labelWidth : undefined;
	const tail = room && room > 0 ? fit(value, room) : value;
	return `${indent}${head}${palette.text(tail)}`;
}

/**
 * Bloque agrupado por su regla vertical. `tone` decide el color de la barra:
 * el acento para lo que tiene el foco, apagado para lo demás.
 */
export function ruled(
	lines: readonly string[],
	palette: Palette,
	tone: "accent" | "muted" = "muted",
): readonly string[] {
	const bar = tone === "accent" ? palette.accent(GLYPH.rule) : palette.muted(GLYPH.rule);
	return lines.map((line) => `${bar} ${line}`);
}

/** Une metadatos con el punto medio, apagando solo los separadores. */
export function joinMeta(parts: readonly string[], palette: Palette): string {
	return parts.filter((part) => part.length > 0).join(palette.muted(` ${GLYPH.sep} `));
}

/**
 * Barra de chrome: identidad y contexto a la izquierda, estado a la derecha.
 * Es donde vive el estado permanente, para que no se vuelque al cuerpo.
 */
export function chromeBar(left: string, right: string, width: number, palette: Palette): string {
	const gap = Math.max(1, width - visibleWidth(left) - visibleWidth(right));
	return `${left}${" ".repeat(gap)}${palette.muted(right)}`;
}

/** El wordmark, con la `i` en amarillo: el gesto de marca a tamaño de chrome. */
export function wordmark(palette: Palette): string {
	return `${palette.text("e")}${palette.accent("i")}${palette.text("n")}`;
}
