// =============================================================================
// FRAME — la ventana de 16 bits del instalador
// Misma gramática que el banner de arranque y que la app de terminal: marco
// doble, pestañas de sección invertidas (carbón sobre amarillo) y líneas de
// puntos que llevan cada etiqueta hasta su valor.
//
// El instalador DUPLICA la gramática a propósito, igual que duplica la paleta:
// es un binario que corre antes de que exista el template desplegado, así que
// no puede importar de `ein-pi/`. Un test compara las dos copias.
//
// Módulo puro salvo por el color, que respeta NO_COLOR a través de `theme.ts`.
// =============================================================================

import { concrete, gold, plate, structure } from "./theme.ts";

const TOP_L = "╔", TOP_R = "╗", BOT_L = "╚", BOT_R = "╝";
const H = "═", V = "║", SEP_L = "╟", SEP_R = "╢", SEP = "─";
const DOT = "·";

// El marco se adapta al terminal. Fijo en 62 se salían los detalles largos del
// doctor (rutas, versiones, motivos de fallo): el valor se recortaba a mitad de
// palabra y la caja parecía rota. Se acota por arriba para que en pantallas muy
// anchas no quede una caja desmesurada.
const FRAME_MIN = 62;
const FRAME_MAX = 110;

export function frameWidth(columns = process.stdout.columns ?? 80): number {
	return Math.max(FRAME_MIN, Math.min(FRAME_MAX, columns - 2));
}

export const FRAME_W = frameWidth();
const INNER = FRAME_W - 4;
const LABEL_W = 13;

/** Ancho visible: los códigos ANSI no ocupan columnas. */
function visibleWidth(text: string): number {
	return [...text.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

/** Cierra la línea contra el borde derecho, contando solo lo visible. */
function row(content: string): string {
	const pad = Math.max(0, FRAME_W - 3 - visibleWidth(content));
	return `${gold(V)} ${content}${" ".repeat(pad)}${gold(V)}`;
}

export function frameTop(): string {
	return gold(`${TOP_L}${H.repeat(FRAME_W - 2)}${TOP_R}`);
}

export function frameBottom(): string {
	return gold(`${BOT_L}${H.repeat(FRAME_W - 2)}${BOT_R}`);
}

export function frameDivider(): string {
	return `${gold(SEP_L)}${structure(SEP.repeat(FRAME_W - 2))}${gold(SEP_R)}`;
}

/** Cabecera: placa invertida a la izquierda, contexto a la derecha. */
export function frameHeader(title: string, right = ""): string {
	const tag = plate(` ${title.toUpperCase()} `);
	const used = title.length + 2;
	const trimmed = right.slice(0, Math.max(0, INNER - used - 1));
	const gap = " ".repeat(Math.max(1, INNER - used - trimmed.length));
	return row(`${tag}${gap}${structure(trimmed)}`);
}

export function frameTab(text: string): string {
	return row(plate(` ${text.toUpperCase()} `));
}

export function frameBlank(): string {
	return row("");
}

export function frameText(text: string, paint: (value: string) => string = structure): string {
	return row(paint(text.slice(0, INNER)));
}

/**
 * Fila etiqueta → puntos → valor. `mark` es el marcador de estado opcional
 * (■ ok, ▲ aviso, ✕ fallo) que se pinta antes de la etiqueta.
 */
export function frameField(label: string, value: string, mark = ""): string {
	const head = mark ? `${mark} ` : "";
	const headWidth = mark ? 2 : 0;
	const shownValue = value.slice(0, Math.max(0, INNER - LABEL_W - headWidth - 2));
	const span = Math.max(1, INNER - headWidth - LABEL_W - shownValue.length - 1);
	return row(`${head}${structure(label.padEnd(LABEL_W))}${structure(DOT.repeat(span))} ${concrete(shownValue)}`);
}

/** Envuelve un bloque entero: cabecera, cuerpo y cierre. */
export function frameBlock(title: string, right: string, body: readonly string[]): string {
	return [frameTop(), frameHeader(title, right), frameDivider(), ...body, frameBottom()].join("\n");
}
