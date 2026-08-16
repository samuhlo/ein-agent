// =============================================================================
// TESTS: el marco de la app de terminal
// Misma gramática que el banner de Pi (marco doble, pestañas invertidas, líneas
// de puntos). Lo que se rompe solo en un layout de caracteres es el ANCHO: una
// celda de más y el borde derecho deja de caer en columna. Eso es lo que se fija
// aquí, además de que los keybinds sigan visibles en su fila.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	blankLine,
	contentLines,
	CURSOR,
	frameBottom,
	frameDivider,
	frameTop,
	headerLine,
	noteLine,
	rowLine,
	tabLine,
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

describe("marco de la app", () => {
	test("todas las líneas miden lo mismo — el borde cae en columna", () => {
		const lines = [
			frameTop(W), headerLine(W, "dashboard", "ein-agent"),
			textLine(W, "  contexto"), frameDivider(W), blankLine(W),
			...contentLines(W, rows, 0, rows.length, false, true),
			frameBottom(W),
		];
		for (const line of lines) expect(widthOf(line)).toBe(W);
	});

	test("un valor larguísimo no desborda el marco", () => {
		const line = rowLine(W, row("x".repeat(200), { value: "y".repeat(200) }), false, true);
		expect(widthOf(line)).toBe(W);
	});

	test("una nota larga tampoco desborda", () => {
		expect(widthOf(noteLine(W, "z".repeat(300)))).toBe(W);
	});

	// El punto del rediseño: se lee como un MENÚ, no como una lista impresa.
	test("solo la fila seleccionada lleva cursor, y late", () => {
		expect(flat(rowLine(W, rows[0]!.row, true, true))).toContain(CURSOR[0]);
		expect(flat(rowLine(W, rows[0]!.row, true, false))).toContain(CURSOR[1]);
		const idle = flat(rowLine(W, rows[0]!.row, false, true));
		for (const glyph of CURSOR) expect(idle).not.toContain(glyph);
	});

	test("los keybinds siguen visibles en su fila", () => {
		expect(flat(rowLine(W, rows[0]!.row, false, true))).toContain("[p]");
		expect(flat(rowLine(W, rows[1]!.row, false, true))).toContain("[c]");
	});

	test("una fila con valor muestra el valor, no la tecla", () => {
		const line = flat(rowLine(W, rows[2]!.row, false, true));
		expect(line).toContain("main");
		expect(line).not.toContain("[");
	});

	test("el icono del modelo manda sobre el marcador genérico", () => {
		expect(flat(rowLine(W, rows[0]!.row, false, true))).toContain("◆");
		expect(flat(rowLine(W, rows[1]!.row, false, true))).toContain("◇");
	});

	test("cada sección abre su pestaña una sola vez", () => {
		const lines = contentLines(W, rows, 0, rows.length, false, true).map(flat);
		expect(lines.filter((line) => line.includes("SESIONES"))).toHaveLength(1);
		expect(lines.filter((line) => line.includes("ESTADO"))).toHaveLength(1);
	});

	test("la pestaña va en mayúsculas, como en el banner", () => {
		expect(flat(tabLine(W, "sesiones"))).toContain(" SESIONES ");
	});

	test("el marco se adapta a un terminal estrecho sin romperse", () => {
		for (const width of [40, 52, 96]) {
			expect(widthOf(frameTop(width))).toBe(width);
			expect(widthOf(rowLine(width, rows[0]!.row, true, true))).toBe(width);
			expect(widthOf(headerLine(width, "config", "proyecto"))).toBe(width);
		}
	});
});
