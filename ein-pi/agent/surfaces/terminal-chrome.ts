// =============================================================================
// TERMINAL CHROME — la app, en la gramática de Ein
// Dos barras y nada más: una arriba con identidad y contexto, otra abajo con
// estado y atajos. Entre ellas el contenido FLOTA, sin marco.
//
// ANTES había un marco doble con pestañas invertidas y líneas de puntos que
// llevaban cada etiqueta hasta su valor. Los puntos eran una rejilla dibujada a
// mano y el marco encerraba una pantalla que no necesitaba paredes: la columna
// alinea igual y el aire separa mejor (`core/docs/STYLE.md // 002`).
//
// La fila con foco es una BANDA de fondo, no un cursor que late: un cursor
// parpadeante pide atención constantemente, y solo hay una fila activa.
//
// Módulo PURO: entra el modelo, salen líneas. Sin OpenTUI, sin fs. Es lo que
// permite ver y testear el layout sin abrir un terminal.
// =============================================================================

import type { Row, VisibleRow } from "../lib/terminal-app.ts";
import { rowMark } from "./terminal-theme.ts";

/** Glifos de la gramática. Ninguno dibuja un contorno cerrado, a propósito. */
export const GLYPH = {
	rule: "▏",
	focus: "▸",
	sep: "·",
	divider: "─",
} as const;

export type ChromeTone =
	| "frame" | "tab" | "label" | "value" | "dim" | "selected" | "key"
	| "ok" | "warn" | "danger";

export type ChromeCell = Readonly<{
	text: string;
	tone: ChromeTone;
	bold?: boolean;
	/** Parte de la banda de foco: el fondo lo pinta la vista. */
	bg?: boolean;
}>;
export type ChromeLine = readonly ChromeCell[];

const INDENT = "  ";

const width = (line: ChromeLine): number => {
	let total = 0;
	for (const cell of line) total += [...cell.text].length;
	return total;
};

/**
 * Rellena hasta el ancho total. Sin borde derecho que cerrar, pero el relleno
 * sigue importando: es lo que hace que la banda de foco llegue al final.
 */
function pad(cells: ChromeCell[], total: number, bg = false): ChromeLine {
	const missing = Math.max(0, total - width(cells));
	return [...cells, { text: " ".repeat(missing), tone: "value", bg }];
}

export function blankLine(total: number): ChromeLine {
	return pad([], total);
}

/** Regla fina de separación. Solo donde cambia el TIPO de contenido. */
export function ruleLine(total: number): ChromeLine {
	return [{ text: GLYPH.divider.repeat(Math.max(0, total)), tone: "dim" }];
}

/** Barra superior: wordmark, vista y contexto a la derecha. */
export function headerLine(total: number, title: string, right: string): ChromeLine {
	const cells: ChromeCell[] = [
		{ text: INDENT, tone: "value" },
		{ text: "e", tone: "value" },
		{ text: "i", tone: "selected" },
		{ text: "n", tone: "value" },
		{ text: `   ${title.toLowerCase()}`, tone: "label" },
	];
	const used = width(cells);
	const trimmed = right.slice(0, Math.max(0, total - used - 3));
	return [
		...cells,
		{ text: " ".repeat(Math.max(1, total - used - trimmed.length - 2)), tone: "value" },
		{ text: trimmed, tone: "dim" },
		{ text: INDENT, tone: "value" },
	];
}

export function textLine(total: number, text: string, tone: ChromeTone = "label"): ChromeLine {
	return pad([{ text: `${INDENT}${text}`.slice(0, total) }].map((cell) => ({ ...cell, tone })), total);
}

/**
 * Título de sección: `// NNN. sección`. El `//` va en acento y el resto
 * apagado — el gesto de marca a la intensidad de la referencia, sin pestaña.
 */
export function sectionLine(total: number, index: number, text: string): ChromeLine {
	return pad(
		[
			{ text: INDENT, tone: "value" },
			{ text: "//", tone: "selected" },
			{ text: ` ${String(index).padStart(3, "0")}. ${text.toLowerCase()}`, tone: "label" },
		],
		total,
	);
}

/**
 * Fila de menú: regla vertical, marcador, etiqueta y su valor o tecla. La
 * seleccionada va sobre banda y con la regla en acento; las demás, apagadas.
 */
export function rowLine(total: number, row: Row, selected: boolean): ChromeLine {
	const bg = selected;
	const cells: ChromeCell[] = [
		{ text: INDENT, tone: "value", bg },
		{ text: GLYPH.rule, tone: selected ? "selected" : "dim", bg },
		{ text: " ", tone: "value", bg },
	];
	const glyph = row.icon ?? rowMark(row);
	cells.push({ text: `${glyph} `, tone: selected ? "selected" : toneOf(row), bg });

	// Presupuesto duro: sangría + regla + glifo + etiqueta + cola. Una etiqueta
	// o un valor larguísimos se RECORTAN, nunca empujan la línea fuera del ancho.
	const rawTail = "value" in row ? String(row.value ?? "unknown") : row.key ? `[${row.key}]` : "";
	const tail = rawTail.slice(0, Math.max(0, total - 14));
	const label = row.label.slice(0, Math.max(1, total - 8 - [...tail].length));
	cells.push({ text: label, tone: selected ? "value" : "label", bold: selected, bg });

	const used = width(cells);
	const gap = Math.max(1, total - used - [...tail].length - (selected ? 4 : 2));
	cells.push({ text: " ".repeat(gap), tone: "value", bg });
	if (tail) cells.push({ text: tail, tone: "value" in row ? valueTone(row) : "key", bg });
	if (selected) cells.push({ text: `  ${GLYPH.focus}`, tone: "selected", bg });
	return pad(cells, total, bg);
}

function toneOf(row: Row): ChromeTone {
	if (row.tone === "danger") return "danger";
	if (row.tone === "warn") return "warn";
	if (row.tone === "ok") return "ok";
	if (row.tone === "muted") return "dim";
	return "label";
}

function valueTone(row: Row): ChromeTone {
	return toneOf(row) === "label" ? "value" : toneOf(row);
}

export function noteLine(total: number, note: string): ChromeLine {
	return pad([{ text: `${INDENT}${GLYPH.rule}     ${note}`.slice(0, total), tone: "dim" }], total);
}

/** Todas las líneas del contenido, con sus secciones numeradas. */
export function contentLines(
	total: number,
	rows: readonly VisibleRow[],
	cursor: number,
	maximum: number,
	showAllNotes: boolean,
): readonly ChromeLine[] {
	const out: ChromeLine[] = [];
	const start = Math.min(Math.max(0, cursor - Math.floor(maximum / 2)), Math.max(0, rows.length - maximum));
	let previous: string | undefined;
	let sectionIndex = 0;
	for (const [offset, { section, row }] of rows.slice(start, start + maximum).entries()) {
		const index = start + offset;
		if (section && section !== previous) {
			if (out.length) out.push(blankLine(total));
			out.push(sectionLine(total, sectionIndex, section));
			out.push(blankLine(total));
			sectionIndex += 1;
		}
		const selected = index === cursor;
		out.push(rowLine(total, row, selected));
		if ((showAllNotes || selected) && row.note) out.push(noteLine(total, row.note));
		previous = section;
	}
	return out;
}
