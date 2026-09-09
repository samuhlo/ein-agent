// =============================================================================
// [CORE] GRAMÁTICA DE TERMINAL
// Las primitivas de `runtime/docs/STYLE.md // 002`, una sola vez. Antes cada
// superficie dibujaba su propio marco: el installer tenía `tui/frame.ts`, el
// banner `banner-panel.ts` y el overlay lo suyo, y las tres se separaron.
//
// Aquí no hay marco. La jerarquía sale del aire, de la sangría y del apagado:
//   - un bloque se agrupa con una REGLA VERTICAL, no con una caja;
//   - la fila con foco se distingue por su marcador y el acento;
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
	/** Rama y hoja del árbol de actividad. Los pinta Pi; se adoptan tal cual. */
	branch: "├─",
	lastBranch: "└─",
	leaf: "⎿",
	/** Fail-closed: lo que no se ha comprobado se dibuja como desconocido. */
	unknown: "?",
	/** Distinto de `unknown`: esto SÍ se comprobó, y salió mal. */
	failed: "×",
});

/**
 * Título de sección: `// NNN  TÍTULO`. El `//` conserva el acento —es el gesto
 * de marca— pero el TÍTULO sube a primario.
 *
 * POR QUÉ -> el título era el elemento con menos peso de la pantalla, siendo la
 * única señal de estructura que hay. Apagar la jerarquía entera no es hacer
 * jerarquía: lo que se apaga es lo accesorio, y aquí eso es el número.
 */
export function sectionTitle(index: number, title: string, palette: Palette): string {
	const n = String(Math.max(0, Math.trunc(index))).padStart(3, "0");
	return `${palette.accent("//")} ${palette.structure(n)}  ${palette.text(title.toUpperCase())}`;
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

/**
 * LAS SUPERFICIES DERIVADAS, en hex. Duplicadas de `themes/ein.json` por la
 * misma razón que la marca: el banner pinta antes de que exista un tema
 * cargado, y una superficie que solo existe en el JSON no puede usarla.
 *
 * Neutras: gris puro escalonado sobre carbón. Semánticas: el color mezclado a
 * alfa baja sobre la base — `mix(c, α) = 11 + α · (c − 11)` por canal
 * (`runtime/docs/STYLE.md // 001`), que es de donde salen exactamente estos
 * valores y no de un ojo puesto encima.
 */
export const SURFACE = Object.freeze({
	/** Barras de chrome y mensaje del usuario. */
	chrome: { r: 0x12, g: 0x12, b: 0x12 },
	/** Caja de herramienta en curso. */
	pending: { r: 0x16, g: 0x16, b: 0x16 },
	/** Salida de un comando de Ein — acento α 0.04. */
	command: { r: 0x15, g: 0x13, b: 0x0d },
	/** Acción resuelta — verde α 0.10. */
	ok: { r: 0x1a, g: 0x1c, b: 0x15 },
	/** Acción fallida — rojo α 0.10. */
	failed: { r: 0x20, g: 0x15, b: 0x13 },
	/** La fila con el foco — acento α 0.08. */
	focus: { r: 0x1f, g: 0x1a, b: 0x0f },
});

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
