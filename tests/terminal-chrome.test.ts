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
	brandLines,
	contentLines,
	contextLines,
	homeTopLines,
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

// =============================================================================
// LA PORTADA
// El aparato y el contexto del proyecto se componen como LÍNEAS del chrome, no
// escribiendo a stdout: es lo que permite medirlos aquí y lo que deja a la vista
// montarlos junto al resto. El ancho vuelve a ser lo único que se rompe solo.
// =============================================================================

const SUMMARY = {
	name: "ein-agent",
	root: "~/dev/ein-agent",
	branch: "main",
	dirty: 0,
	change: "redesign-launcher-installer-shell",
	phase: "apply",
	next: "cc-ein-sdd verify",
};

describe("la marca de la portada", () => {
	test("en placa el texto va al costado del mueble, no debajo", () => {
		const lines = brandLines(W, "ein v0.82.0");
		const art = lines.map(flat);
		// El subtítulo comparte fila con el mueble: si estuviera debajo, ninguna
		// fila del aparato lo contendría.
		expect(art.some((line) => line.includes("│") && line.includes("workbench"))).toBe(true);
	});

	test("sin sitio para la placa, la marca se apila en vez de recortarse", () => {
		const narrow = brandLines(40, "ein v0.82.0").map(flat);
		expect(narrow.some((line) => line.includes("│") && line.includes("workbench"))).toBe(false);
		expect(narrow.some((line) => line.includes("workbench"))).toBe(true);
	});

	test("sin versión que enseñar, la placa se queda con el lema", () => {
		const lines = brandLines(W).map(flat);
		expect(lines.some((line) => line.includes("workbench"))).toBe(true);
		expect(lines.join("")).not.toContain("v0.");
		for (const line of brandLines(W)) expect(widthOf(line)).toBe(W);
	});

	test("toda línea mide el ancho pedido, quepa o no la placa", () => {
		for (const total of [W, 96, 40]) {
			for (const line of brandLines(total, "ein v0.82.0")) {
				expect(widthOf(line)).toBe(total);
			}
		}
	});
});

describe("el contexto del proyecto", () => {
	test("nombra proyecto y rama, y pega la ruta al margen derecho", () => {
		const [head] = contextLines(W, SUMMARY).map(flat);
		expect(head).toContain("ein-agent");
		expect(head).toContain("main");
		expect(head!.trimEnd().endsWith("~/dev/ein-agent")).toBe(true);
	});

	test("el cambio en curso añade una línea con su fase y su siguiente paso", () => {
		const withChange = contextLines(W, SUMMARY).map(flat);
		expect(withChange).toHaveLength(2);
		expect(withChange[1]).toContain("redesign-launcher-installer-shell");
		expect(withChange[1]).toContain("apply");
		expect(withChange[1]).toContain("cc-ein-sdd verify");
	});

	test("sin cambio activo esa línea no se dibuja vacía: no existe", () => {
		expect(contextLines(W, { ...SUMMARY, change: undefined })).toHaveLength(1);
	});

	test("toda línea mide el ancho pedido, con cambio y sin él", () => {
		for (const summary of [SUMMARY, { ...SUMMARY, change: undefined }]) {
			for (const line of contextLines(W, summary)) expect(widthOf(line)).toBe(W);
		}
	});

	test("una ruta larguísima se recorta y NO desborda", () => {
		const [head] = contextLines(W, { ...SUMMARY, root: "~/".padEnd(400, "x") });
		expect(widthOf(head!)).toBe(W);
	});
});

// El aparato son ocho filas. En un terminal bajo eso se come el menú entero, así
// que la marca cede por ALTO igual que ya cedía por ancho: primero pierde la
// placa, y el contexto —que es lo que informa— se queda siempre.
describe("cuánto sitio se lleva la portada", () => {
	test("con altura de sobra, la portada abre con el aparato", () => {
		const lines = homeTopLines(W, 40, SUMMARY).map(flat);
		expect(lines.some((line) => line.includes("│") && line.includes("workbench"))).toBe(true);
		expect(lines.some((line) => line.includes("ein-agent"))).toBe(true);
	});

	test("en un terminal bajo la marca desaparece, el contexto no", () => {
		const lines = homeTopLines(W, 24, SUMMARY).map(flat);
		expect(lines.some((line) => line.includes("│") && line.includes("workbench"))).toBe(false);
		expect(lines.some((line) => line.includes("ein-agent"))).toBe(true);
	});

	test("la portada nunca se lleva más de un tercio de la pantalla", () => {
		for (const height of [18, 24, 30, 40, 60]) {
			expect(homeTopLines(W, height, SUMMARY).length).toBeLessThanOrEqual(Math.ceil(height / 3));
		}
	});

	test("toda línea mide el ancho pedido, a cualquier altura", () => {
		for (const height of [18, 24, 40]) {
			for (const line of homeTopLines(W, height, SUMMARY)) expect(widthOf(line)).toBe(W);
		}
	});
});
