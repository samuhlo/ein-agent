// =============================================================================
// TESTS: la app de terminal, en la marca
// La TUI iba por libre (fondo azul #0d1118, acentos turquesa/morado) mientras
// el banner de Pi y el installer usaban la paleta brutalista. Estos tests fijan
// las dos cosas que hacen que no vuelva a separarse:
//   1. Una sola geometría de logo en el árbol ein-pi (era CUATRO copias).
//   2. La superficie pinta solo con los colores de brand.json.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bannerFinal, trackingFor } from "../ein-pi/agent/lib/banner";
import {
	WORDMARK,
	accentColumn,
	centerInLogo,
	wordmarkText,
} from "../ein-pi/agent/lib/ein-logo";
import { BRAND, MARK, SIGNAL, SURFACE, TONE_COLOR, rowColor, rowMark } from "../ein-pi/agent/surfaces/terminal-theme";
import type { Row } from "../ein-pi/agent/lib/terminal-app";

const ROOT = join(import.meta.dir, "..");

describe("una sola geometría de marca", () => {
	test("el wordmark se escribe `ein`, con la `i` como único acento", () => {
		expect(WORDMARK.before + WORDMARK.accent + WORDMARK.after).toBe("ein");
		expect(WORDMARK.accent).toBe("i");
	});

	// El guard que importa: si alguien vuelve a dibujar la marca a mano en otro
	// fichero del árbol ein-pi, esto lo caza. El installer queda fuera a propósito
	// (es un binario que corre antes de que exista este template).
	test("no queda ni un logo de bloque en ein-pi/", () => {
		const candidates = [
			"ein-pi/agent/lib/ein-logo.ts",
			"ein-pi/agent/lib/banner.ts",
			"ein-pi/agent/extensions/ein-banner.ts",
			"ein-pi/agent/surfaces/terminal-splash.ts",
			"ein-pi/agent/surfaces/terminal-dashboard-view.tsx",
		];
		// `████` seguidos son letra de bloque; un `▏` o un `─` sueltos no lo son.
		const holders = candidates.filter((rel) => /█{4}/.test(readFileSync(join(ROOT, rel), "utf8")));
		expect(holders).toEqual([]);
	});

	test("el acento cae en la columna que se declara, con y sin tracking", () => {
		for (const tracking of ["   ", " ", ""]) {
			const text = wordmarkText(tracking);
			expect(text[accentColumn(tracking)]).toBe(WORDMARK.accent);
		}
	});

	test("el tracking se aprieta en un terminal estrecho", () => {
		expect(trackingFor(120)).toBe("   ");
		expect(trackingFor(40)).toBe(" ");
		expect(wordmarkText(trackingFor(40))).toBe("e i n");
	});

	test("la marca asentada lleva wordmark, aire y lema", () => {
		const lines = bannerFinal(120);
		expect(lines[0]).toBe("e   i   n");
		expect(lines[1]).toBe("");
		expect(lines[2]).toBe("coding agent workbench");
	});

	test("centerInLogo centra sin desbordar", () => {
		expect(centerInLogo("ein", 11)).toBe("    ein");
		expect(centerInLogo("demasiado largo", 4)).toBe("demasiado largo");
	});
});

describe("la superficie solo usa colores de marca", () => {
	const brandValues = new Set<string>([
		BRAND.carbon,
		BRAND.concrete,
		BRAND.structure,
		BRAND.yellow,
		SURFACE.rule,
		SURFACE.dim,
		SIGNAL.danger,
	]);

	test("todo tono resuelve a un color de la familia", () => {
		for (const [tone, color] of Object.entries(TONE_COLOR)) {
			expect(brandValues.has(color)).toBe(true);
			expect(color).toMatch(/^#[0-9A-F]{6}$/i);
			expect(tone.length).toBeGreaterThan(0);
		}
	});

	test("la paleta coincide con brand.json — una sola fuente de verdad", () => {
		const brand = JSON.parse(readFileSync(join(ROOT, "ein-pi/agent/brand.json"), "utf8"));
		expect(BRAND.carbon).toBe(brand.colors.carbon);
		expect(BRAND.concrete).toBe(brand.colors.concrete);
		expect(BRAND.structure).toBe(brand.colors.structure);
		expect(BRAND.yellow).toBe(brand.colors.yellow);
	});

	// La regresión concreta: el azul de dev-tool y los acentos de proveedor.
	test("no queda rastro del tema azul ni de los acentos turquesa/morado", () => {
		for (const rel of ["terminal-dashboard-view.tsx", "terminal-chrome.ts", "terminal-theme.ts"]) {
			// Solo codigo: un comentario que NOMBRA el azul viejo para explicar de
			// donde se viene es documentacion util, no una recaida.
			const source = readFileSync(join(ROOT, "ein-pi/agent/surfaces", rel), "utf8")
				.split("\n")
				.filter((line) => !line.trim().startsWith("//"))
				.join("\n")
				.toLowerCase();
			for (const dead of ["#0d1118", "#d7dee8", "#69778b", "#55d6be", "#bf9cff", "#344154", "#78dce8"]) {
				expect(source).not.toContain(dead);
			}
		}
	});

	test("el fondo es carbón, no un azul", () => {
		expect(SURFACE.background).toBe(BRAND.carbon);
	});
});

describe("Pi y Claude se distinguen por marcador, no por color", () => {
	const row = (over: Partial<Row>): Row => ({
		label: "Continuar en Pi",
		action: { kind: "continue", provider: "pi" },
		...over,
	} as Row);

	// El icono del modelo manda: `◆` Pi / `◇` Claude ya distinguen el proveedor y
	// dicen qué es la fila. `rowMark` es el fallback de las filas sin icono.
	test("el icono del modelo gana al marcador genérico", () => {
		expect(rowMark(row({}))).toBe(MARK.active);
		// La eleccion vive ahora en el marco de la app, no en la vista.
		const chrome = readFileSync(join(ROOT, "ein-pi/agent/surfaces/terminal-chrome.ts"), "utf8");
		expect(chrome).toContain("row.icon ?? rowMark(row)");
	});

	test("el proveedor NO cambia el color — misma fila, mismo tono", () => {
		const pi = rowColor(row({}), false);
		const claude = rowColor(row({ action: { kind: "continue", provider: "claude" } } as Partial<Row>), false);
		expect(pi).toBe(claude);
		expect(pi).toBe(BRAND.concrete);
	});

	test("seleccionada manda sobre el tono", () => {
		expect(rowColor(row({ tone: "muted" }), true)).toBe(BRAND.yellow);
	});

	test("el semáforo conserva su marcador y su color", () => {
		expect(rowMark(row({ tone: "danger" }))).toBe(MARK.danger);
		expect(rowMark(row({ tone: "warn" }))).toBe(MARK.warn);
		expect(rowColor(row({ tone: "danger" }), false)).toBe(SIGNAL.danger);
	});

	test("una fila no accionable queda en hueco □", () => {
		expect(rowMark(row({ action: { kind: "fact" } }))).toBe(MARK.idle);
		expect(rowMark(row({ action: { kind: "open-view", view: "state" } }))).toBe(MARK.idle);
	});
});

// =============================================================================
// El installer y la app de terminal son dos superficies de la MISMA marca. El
// installer duplica la paleta a proposito (corre antes de que exista este
// template), asi que lo unico que puede protegerla es un test que compare las
// dos copias.
// =============================================================================
describe("installer y app de terminal, misma marca", () => {
	const theme = readFileSync(join(ROOT, "installer/src/tui/theme.ts"), "utf8");

	test("la paleta duplicada del installer coincide con brand.json", () => {
		const brand = JSON.parse(readFileSync(join(ROOT, "ein-pi/agent/brand.json"), "utf8"));
		const rgbOf = (hex: string) => {
			const n = Number.parseInt(hex.replace("#", ""), 16);
			return `{ r: ${(n >> 16) & 0xff}, g: ${(n >> 8) & 0xff}, b: ${n & 0xff} }`;
		};
		for (const key of ["carbon", "concrete", "structure", "yellow"] as const) {
			expect(theme).toContain(rgbOf(brand.colors[key]));
		}
	});

	test("mismo vocabulario de marcadores en las dos superficies", () => {
		expect(theme).toContain(`ok: "${MARK.active}"`);
		expect(theme).toContain(`idle: "${MARK.idle}"`);
		expect(theme).toContain(`warn: "${MARK.warn}"`);
		expect(theme).toContain(`fail: "${MARK.danger}"`);
	});

	test("mismo rojo de fallo, y ningun verde suelto", () => {
		const { r, g, b } = { r: 229, g: 72, b: 77 };
		expect(SIGNAL.danger.toUpperCase()).toBe("#E5484D");
		expect(theme).toContain(`r: ${r}, g: ${g}, b: ${b}`);
		// La regresion concreta: los colores inventados del doctor.
		const doctor = readFileSync(join(ROOT, "installer/src/cli/doctor.ts"), "utf8");
		expect(doctor).not.toContain("rgb(120, 200, 120");
		expect(doctor).not.toContain("rgb(230, 110, 110");
	});
});

// =============================================================================
// Las TRES superficies —banner de arranque, app de terminal e instalador— hablan
// la misma gramatica. El instalador la duplica a proposito (corre antes de que
// exista el template), asi que lo unico que puede protegerla es un test que
// compare las copias.
//
// Antes esto custodiaba un marco doble con pestanas invertidas y lineas de
// puntos. La gramatica nueva es la contraria: sin contornos, con el aire y el
// apagado haciendo la jerarquia. El test se invierte con ella — es un test de
// presentacion, que es para lo que existe.
// =============================================================================
describe("una sola gramatica de terminal", () => {
	const sources = {
		banner: readFileSync(join(ROOT, "ein-pi/agent/lib/banner-panel.ts"), "utf8"),
		app: readFileSync(join(ROOT, "ein-pi/agent/surfaces/terminal-chrome.ts"), "utf8"),
		installer: readFileSync(join(ROOT, "installer/src/tui/report.ts"), "utf8"),
	};

	test("ninguna dibuja un contorno cerrado", () => {
		for (const [name, source] of Object.entries(sources)) {
			for (const glyph of ["╔", "╗", "╚", "╝", "═", "║", "╟", "╢"]) {
				expect(source, name).not.toContain(glyph);
			}
		}
	});

	test("ninguna conserva la placa invertida", () => {
		for (const [name, source] of Object.entries(sources)) {
			expect(source.toLowerCase(), name).not.toMatch(/tone: "plate"|plate\(/);
		}
	});

	test("las tres numeran sus secciones a tres dígitos", () => {
		for (const [name, source] of Object.entries(sources)) {
			expect(source, name).toContain('padStart(3, "0")');
		}
	});

	test("las tres bajan a minuscula el texto corrido", () => {
		for (const [name, source] of Object.entries(sources)) {
			expect(source, name).toContain("toLowerCase()");
		}
	});

	test("las tres recortan en vez de desbordar el ancho", () => {
		for (const [name, source] of Object.entries(sources)) {
			expect(source, name).toMatch(/\.slice\(|visibleWidth/);
		}
	});
});
