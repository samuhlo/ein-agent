// =============================================================================
// TESTS: el chrome de la app de terminal
// La gramática nueva no dibuja marco: dos barras y el contenido flotando entre
// ellas. Lo que se rompe solo en un layout de caracteres sigue siendo el ANCHO
// —una celda de más y la banda de foco deja de llegar al final—, así que eso es
// lo que se fija aquí, además de que los keybinds sigan visibles en su fila.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	blankLine,
	contentLines,
	GLYPH,
	headerLine,
	noteLine,
	rowLine,
	ruleLine,
	sectionLine,
	textLine,
	type ChromeLine,
} from "../ein-pi/agent/surfaces/terminal-chrome";
import type { Row, VisibleRow } from "../ein-pi/agent/lib/terminal-app";

const W = 78;
const flat = (line: ChromeLine): string => line.map((cell) => cell.text).join("");
const widthOf = (line: ChromeLine): number => [...flat(line)].length;

const row = (label: string, over: Partial<Row> = {}): Row =>
	({ label, action: { kind: "fact" }, ...over }) as Row;

const rows: VisibleRow[] = [
	{ section: "sesiones", row: row("Arrancar Pi", { icon: "◆", key: "p", action: { kind: "launch", provider: "pi" } }) },
	{ section: "sesiones", row: row("Arrancar Claude", { icon: "◇", key: "c", action: { kind: "launch", provider: "claude" } }) },
	{ section: "estado", row: row("Rama", { icon: "▪", value: "main" }) },
];

describe("chrome de la app", () => {
	test("todas las líneas miden lo mismo — la banda llega al final", () => {
		const lines = [
			headerLine(W, "dashboard", "ein-agent"),
			textLine(W, "contexto"),
			blankLine(W),
			...contentLines(W, rows, 0, rows.length, false),
		];
		for (const line of lines) expect(widthOf(line)).toBe(W);
	});

	test("un valor larguísimo no desborda la línea", () => {
		const line = rowLine(W, row("x".repeat(200), { value: "y".repeat(200) }), false);
		expect(widthOf(line)).toBe(W);
	});

	test("una nota larga tampoco desborda", () => {
		expect(widthOf(noteLine(W, "z".repeat(300)))).toBe(W);
	});

	// El punto del rediseño: el foco es una BANDA, no un cursor que late. Una
	// fila activa se distingue por su fondo y su regla en acento.
	test("solo la fila seleccionada lleva banda y regla de acento", () => {
		const active = rowLine(W, rows[0]!.row, true);
		expect(active.every((cell) => cell.bg === true)).toBe(true);
		expect(flat(active)).toContain(GLYPH.focus);

		const idle = rowLine(W, rows[0]!.row, false);
		expect(idle.some((cell) => cell.bg === true)).toBe(false);
		expect(flat(idle)).not.toContain(GLYPH.focus);
	});

	test("ninguna línea dibuja un contorno cerrado", () => {
		const lines = [
			headerLine(W, "dashboard", "ein-agent"),
			ruleLine(W),
			...contentLines(W, rows, 0, rows.length, false),
		].map(flat);
		for (const line of lines) {
			for (const glyph of ["╔", "╗", "╚", "╝", "═", "║", "╟", "╢"]) {
				expect(line).not.toContain(glyph);
			}
		}
	});

	test("los keybinds siguen visibles en su fila", () => {
		expect(flat(rowLine(W, rows[0]!.row, false))).toContain("[p]");
		expect(flat(rowLine(W, rows[1]!.row, false))).toContain("[c]");
	});

	test("una fila con valor muestra el valor, no la tecla", () => {
		const line = flat(rowLine(W, rows[2]!.row, false));
		expect(line).toContain("main");
		expect(line).not.toContain("[");
	});

	test("el icono del modelo manda sobre el marcador genérico", () => {
		expect(flat(rowLine(W, rows[0]!.row, false))).toContain("◆");
		expect(flat(rowLine(W, rows[1]!.row, false))).toContain("◇");
	});

	test("cada sección abre su título una sola vez, numerado", () => {
		const lines = contentLines(W, rows, 0, rows.length, false).map(flat);
		expect(lines.filter((line) => line.includes("sesiones"))).toHaveLength(1);
		expect(lines.filter((line) => line.includes("estado"))).toHaveLength(1);
		expect(lines.some((line) => line.includes("// 000. sesiones"))).toBe(true);
		expect(lines.some((line) => line.includes("// 001. estado"))).toBe(true);
	});

	test("el chrome se adapta a un terminal estrecho sin romperse", () => {
		for (const width of [40, 52, 96]) {
			expect(widthOf(rowLine(width, rows[0]!.row, true))).toBe(width);
			expect(widthOf(sectionLine(width, 0, "sesiones"))).toBe(width);
			expect(widthOf(headerLine(width, "config", "proyecto"))).toBe(width);
		}
	});
});
