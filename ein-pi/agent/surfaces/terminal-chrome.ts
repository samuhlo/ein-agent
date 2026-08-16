// =============================================================================
// TERMINAL CHROME — el marco de la app, mismo lenguaje que el banner de Pi
// Marco doble, pestañas de sección invertidas y líneas de puntos que llevan la
// etiqueta hasta su valor o su tecla. Es la misma gramática que
// `lib/banner-panel.ts`: arranque y app se leen como el mismo producto.
//
// Módulo PURO: entra el modelo, salen líneas. Sin OpenTUI, sin fs. Es lo que
// permite ver y testear el layout sin abrir un terminal.
// =============================================================================

import type { Row, VisibleRow } from "../lib/terminal-app.ts";
import { rowMark } from "./terminal-theme.ts";

export const FRAME = {
	topLeft: "╔", topRight: "╗", bottomLeft: "╚", bottomRight: "╝",
	horizontal: "═", vertical: "║", tLeft: "╟", tRight: "╢", separator: "─",
} as const;

const DOT = "·";
/** Cursor de selección: el gesto de menú de 16 bits. Late entre dos formas. */
export const CURSOR = ["▶", "▷"] as const;

export type ChromeTone =
	| "frame" | "tab" | "label" | "value" | "dim" | "selected" | "key"
	| "ok" | "warn" | "danger";

export type ChromeCell = Readonly<{ text: string; tone: ChromeTone; bold?: boolean }>;
export type ChromeLine = readonly ChromeCell[];

const width = (line: ChromeLine): number => {
	let total = 0;
	for (const cell of line) total += [...cell.text].length;
	return total;
};

/**
 * Rellena la línea hasta el ancho total y la cierra con el borde derecho.
 * La cuenta se hace sobre el TOTAL, no sobre el interior: derivarla del interior
 * dejaba las líneas una columna cortas y el borde derecho no caía en vertical
 * — el mismo descuadre que tenía el panel del banner.
 */
function close(cells: ChromeCell[], total: number): ChromeLine {
	const pad = Math.max(0, total - 1 - width(cells));
	return [...cells, { text: " ".repeat(pad), tone: "value" }, { text: FRAME.vertical, tone: "frame" }];
}

const open = (): ChromeCell[] => [{ text: `${FRAME.vertical} `, tone: "frame" }];

export function frameTop(total: number): ChromeLine {
	return [
		{ text: FRAME.topLeft, tone: "frame" },
		{ text: FRAME.horizontal.repeat(Math.max(0, total - 2)), tone: "frame" },
		{ text: FRAME.topRight, tone: "frame" },
	];
}

export function frameBottom(total: number): ChromeLine {
	return [
		{ text: FRAME.bottomLeft, tone: "frame" },
		{ text: FRAME.horizontal.repeat(Math.max(0, total - 2)), tone: "frame" },
		{ text: FRAME.bottomRight, tone: "frame" },
	];
}

export function frameDivider(total: number): ChromeLine {
	return [
		{ text: FRAME.tLeft, tone: "frame" },
		{ text: FRAME.separator.repeat(Math.max(0, total - 2)), tone: "label" },
		{ text: FRAME.tRight, tone: "frame" },
	];
}

/** Cabecera: placa de marca, título de vista y contexto a la derecha. */
export function headerLine(total: number, title: string, right: string): ChromeLine {
	const inner = total - 4;
	const plate = " EIN ";
	const heading = `  ${title.toUpperCase()}`;
	const cells = open();
	cells.push({ text: plate, tone: "tab", bold: true });
	cells.push({ text: heading, tone: "value", bold: true });
	const used = plate.length + heading.length;
	const trimmed = right.slice(0, Math.max(0, inner - used - 1));
	cells.push({ text: " ".repeat(Math.max(1, inner - used - trimmed.length)), tone: "value" });
	cells.push({ text: trimmed, tone: "label" });
	return close(cells, total);
}

export function textLine(total: number, text: string, tone: ChromeTone = "label"): ChromeLine {
	const inner = total - 4;
	return close([...open(), { text: text.slice(0, inner), tone }], total);
}

export function blankLine(total: number): ChromeLine {
	return close(open(), total);
}

/** Pestaña de sección: carbón sobre amarillo, como el banner. */
export function tabLine(total: number, text: string): ChromeLine {
	const inner = total - 4;
	return close([...open(), { text: ` ${text.toUpperCase()} `, tone: "tab", bold: true }], total);
}

/**
 * Fila de menú: cursor, icono del modelo, etiqueta, puntos y tecla o valor.
 * El cursor sólo lo lleva la seleccionada — es lo que hace que se lea como un
 * menú y no como una lista.
 */
export function rowLine(
	total: number,
	row: Row,
	selected: boolean,
	blink: boolean,
): ChromeLine {
	const inner = total - 4;
	const cells = open();
	cells.push({
		text: selected ? `${blink ? CURSOR[0] : CURSOR[1]} ` : "  ",
		tone: selected ? "selected" : "value",
		bold: selected,
	});
	const glyph = row.icon ?? rowMark(row);
	cells.push({ text: `${glyph} `, tone: selected ? "selected" : toneOf(row) });

	// Presupuesto duro: cursor (2) + glifo (2) + etiqueta + puntos + cola. Un
	// valor o una etiqueta larguisimos deben RECORTARSE, nunca empujar el borde
	// derecho fuera del marco.
	const rawTail = "value" in row ? String(row.value ?? "unknown") : row.key ? `[${row.key}]` : "";
	const tail = rawTail.slice(0, Math.max(0, inner - 8));
	const label = row.label.slice(0, Math.max(1, inner - 4 - [...tail].length - 2));
	cells.push({ text: label, tone: selected ? "selected" : "value", bold: selected });

	const used = 2 + 2 + [...label].length;
	const span = Math.max(1, inner - used - [...tail].length - 1);
	cells.push({ text: ` ${DOT.repeat(Math.max(0, span - 1))}`, tone: "dim" });
	if (tail) cells.push({ text: ` ${tail}`, tone: "value" in row ? valueTone(row) : "key" });
	return close(cells, total);
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
	const inner = total - 4;
	return close([...open(), { text: `      ${note}`.slice(0, inner), tone: "dim" }], total);
}

/** Todas las líneas del contenido, con sus secciones como pestañas. */
export function contentLines(
	total: number,
	rows: readonly VisibleRow[],
	cursor: number,
	maximum: number,
	showAllNotes: boolean,
	blink: boolean,
): readonly ChromeLine[] {
	const out: ChromeLine[] = [];
	const start = Math.min(Math.max(0, cursor - Math.floor(maximum / 2)), Math.max(0, rows.length - maximum));
	let previous: string | undefined;
	for (const [offset, { section, row }] of rows.slice(start, start + maximum).entries()) {
		const index = start + offset;
		if (section && section !== previous) {
			if (out.length) out.push(blankLine(total));
			out.push(tabLine(total, section));
		}
		const selected = index === cursor;
		out.push(rowLine(total, row, selected, blink));
		if ((showAllNotes || selected) && row.note) out.push(noteLine(total, row.note));
		previous = section;
	}
	return out;
}
