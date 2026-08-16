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
import { LOGO, LOGO_NARROW, logoFor } from "../ein-pi/agent/lib/banner";
import {
	I_RANGE,
	LOGO_LARGE,
	LOGO_SMALL,
	centerInLogo,
	isIColumn,
	pickLogo,
} from "../ein-pi/agent/lib/ein-logo";
import { BRAND, MARK, SIGNAL, SURFACE, TONE_COLOR, rowColor, rowMark } from "../ein-pi/agent/surfaces/terminal-theme";
import type { Row } from "../ein-pi/agent/lib/terminal-app";

const ROOT = join(import.meta.dir, "..");

describe("una sola geometría de logo", () => {
	test("lib/banner re-exporta ein-logo — no es otra copia", () => {
		expect(LOGO).toBe(LOGO_LARGE);
		expect(LOGO_NARROW).toBe(LOGO_SMALL);
	});

	// El guard que importa: si alguien vuelve a pegar el dibujo en otro fichero
	// del árbol ein-pi, esto lo caza. El installer queda fuera a propósito (es un
	// binario que corre antes de que exista este template).
	test("el dibujo del logo aparece UNA sola vez en ein-pi/", () => {
		const firstRow = LOGO_LARGE[0] ?? "";
		const candidates = [
			"ein-pi/agent/lib/ein-logo.ts",
			"ein-pi/agent/lib/banner.ts",
			"ein-pi/agent/extensions/ein-banner.ts",
			"ein-pi/agent/surfaces/terminal-splash.ts",
			"ein-pi/agent/surfaces/terminal-dashboard-view.tsx",
		];
		const holders = candidates.filter((rel) => readFileSync(join(ROOT, rel), "utf8").includes(firstRow));
		expect(holders).toEqual(["ein-pi/agent/lib/ein-logo.ts"]);
	});

	test("pickLogo elige corte por ancho real de terminal", () => {
		expect(pickLogo(120).lines).toEqual(LOGO_LARGE.map((l) => l));
		expect(pickLogo(40).lines.length).toBe(LOGO_SMALL.length);
		expect(logoFor(120)).toBe(LOGO_LARGE);
	});

	test("la I cae dentro del rango declarado en los dos cortes", () => {
		const large = pickLogo(120);
		expect(isIColumn(large, I_RANGE.large.start)).toBe(true);
		expect(isIColumn(large, I_RANGE.large.end)).toBe(true);
		expect(isIColumn(large, I_RANGE.large.start - 1)).toBe(false);
		expect(isIColumn(large, I_RANGE.large.end + 1)).toBe(false);
	});

	test("centerInLogo centra sin desbordar", () => {
		expect(centerInLogo("EIN", 11)).toBe("    EIN");
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
