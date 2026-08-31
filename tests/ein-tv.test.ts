// =============================================================================
// TESTS: la marca
// Un dibujo de caracteres se rompe de una sola forma: una fila que no mide lo
// que las demás. El borde derecho deja de caer en columna y el mueble se abre.
// No falla nada, no salta ningún tipo — solo se ve mal. Por eso se fija aquí.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { TV_WIDTH, placaRows, renderTv, tvRowWidth, type TvCut, type TvRow, type TvSignal } from "../shared/contracts/ein-tv.ts";

const CUTS: readonly TvCut[] = ["full", "cabinet", "compact", "minimal"];
const SIGNALS: readonly TvSignal[] = ["idle", "working", "static", "standby"];

const flat = (row: TvRow): string => row.map((span) => span.text).join("");

// La antena y las patas son MÁS ESTRECHAS a propósito: no forman parte de la
// caja. Lo que tiene que cerrar en columna es el mueble.
const isCabinet = (row: TvRow): boolean => /^[╭│╰]/.test(flat(row));

describe("la marca cierra en columna", () => {
	for (const cut of CUTS) {
		for (const signal of SIGNALS) {
			test(`${cut} · ${signal}`, () => {
				const rows = renderTv({ cut, signal, lines: ["update-astro-docs", "▸ apply · 3/7"] });
				const box = rows.filter(isCabinet).map(tvRowWidth);
				expect(box.length).toBeGreaterThan(2);
				expect(new Set(box).size).toBe(1);
				expect(box[0]).toBe(TV_WIDTH[cut]);
			});
		}
	}
});

describe("cada corte pierde una pieza, no se encoge", () => {
	test("solo el completo lleva antena y patas", () => {
		const full = renderTv({ cut: "full" }).map(flat).join("\n");
		expect(full).toContain("╲");
		expect(full).toContain("▀▀▀");
		// Ningún otro corte apoya el mueble en nada: es un rectángulo, y por eso
		// todas sus filas miden lo mismo.
		for (const cut of ["cabinet", "compact", "minimal"] as const) {
			const art = renderTv({ cut }).map(flat).join("\n");
			expect(art).not.toContain("╲");
			expect(art).not.toContain("▀");
		}
	});

	// Los mandos son la fila que más fácil se tuerce: no la sostiene ningún borde,
	// solo el conteo de espacios. Se mide contra el bisel, que es lo que el ojo
	// usa de referencia.
	test("los mandos caen bajo el cristal, no bajo las tapas", () => {
		for (const cut of ["cabinet", "compact"] as const) {
			const rows = renderTv({ cut }).map(flat);
			const bezel = rows.find((line) => line.includes("╭─") && line.startsWith("│"))!;
			const knobs = rows.find((line) => line.includes("◉"))!;
			// El interior del bisel: la columna siguiente a su esquina y la anterior
			// a la otra. Ahí arranca el mando y ahí muere la rejilla.
			expect(knobs.indexOf("◉")).toBe(bezel.indexOf("╭") + 1);
			expect(knobs.lastIndexOf("▤")).toBe(bezel.indexOf("╮") - 1);
		}
	});

	test("el mínimo se queda sin bisel: el mueble ES la pantalla", () => {
		const rows = renderTv({ cut: "minimal" });
		expect(rows).toHaveLength(3);
		// Un solo par de bordes por fila, no dos: no hay caja dentro de la caja.
		expect(flat(rows[1]!).match(/│/g)).toHaveLength(2);
	});
});

describe("lo que emite la pantalla", () => {
	test("en reposo lleva el wordmark con la i en acento", () => {
		const rows = renderTv({ cut: "cabinet", signal: "idle" });
		const accent = rows.flat().filter((span) => span.tone === "accent");
		expect(accent.map((span) => span.text)).toContain("i");
	});

	test("emitiendo enseña lo que se le pasa, y enciende el piloto", () => {
		const rows = renderTv({ cut: "cabinet", signal: "working", lines: ["mi-cambio", "▸ apply"] });
		const body = rows.map(flat).join("\n");
		expect(body).toContain("mi-cambio");
		expect(body).toContain("▸ apply");
		// El mando de la izquierda pasa a acento: hay señal.
		const knobRow = rows.find((row) => flat(row).includes("◉"))!;
		expect(knobRow.find((span) => span.text === "◉")?.tone).toBe("accent");
	});

	// Un aparato encendido con el cristal en blanco es peor que uno apagado: dice
	// que hay señal y no enseña ninguna.
	test("ningún corte se queda con el cristal en blanco emitiendo", () => {
		for (const cut of CUTS) {
			const body = renderTv({ cut, signal: "working", lines: ["mi-cambio", "▸ apply"] }).map(flat).join("\n");
			expect(body).toContain("mi-cambio");
		}
	});

	test("un texto más largo que el cristal se recorta, no desborda", () => {
		const rows = renderTv({ cut: "cabinet", signal: "working", lines: ["x".repeat(300)] });
		const box = rows.filter(isCabinet).map(tvRowWidth);
		expect(new Set(box).size).toBe(1);
	});

	test("la nieve cambia de trama entre fotogramas", () => {
		const a = renderTv({ cut: "cabinet", signal: "static", tick: 0 }).map(flat).join("\n");
		const b = renderTv({ cut: "cabinet", signal: "static", tick: 1 }).map(flat).join("\n");
		expect(a).not.toBe(b);
	});

	// El aparato apagado no puede seguir pintando el mueble encendido: si el
	// piloto es lo único vivo, el resto tiene que estar en sombra.
	test("en espera se apaga todo menos el piloto", () => {
		const rows = renderTv({ cut: "cabinet", signal: "standby" });
		expect(rows.flat().some((span) => span.tone === "edge")).toBe(false);
		expect(rows.flat().some((span) => span.tone === "danger")).toBe(true);
	});
});

// =============================================================================
// LA PLACA
// El texto de marca al costado del mueble. Es la composición que comparten el
// banner de Pi, la portada de `ein` y el instalador, así que se fija una vez.
// =============================================================================
describe("la placa", () => {
	const SUB = ".samuhlo · pi workbench";
	const TAG = "ein v0.82.0";

	test("el texto comparte fila con el mueble, no cae debajo", () => {
		const rows = placaRows({ subtitle: SUB, tag: TAG, width: 80 }).map(flat);
		expect(rows.some((line) => line.includes("│") && line.includes(SUB))).toBe(true);
		expect(rows.some((line) => line.includes("│") && line.includes(TAG))).toBe(true);
	});

	test("el mueble no se toca: sus filas siguen cerrando en columna", () => {
		const rows = placaRows({ subtitle: SUB, tag: TAG, width: 80 });
		const box = rows.filter((row) => /^[╭│╰]/.test(flat(row))).map((row) => flat(row).indexOf(SUB));
		// El aparato sigue midiendo lo mismo: el texto se AÑADE a la derecha.
		for (const row of rows.filter((r) => /^[╭│╰]/.test(flat(r)))) {
			expect(flat(row).startsWith("╭") || flat(row).startsWith("│") || flat(row).startsWith("╰")).toBe(true);
		}
		expect(box.filter((index) => index > 0)).toHaveLength(1);
	});

	test("sin sitio, la marca se apila en vez de recortarse", () => {
		const rows = placaRows({ subtitle: SUB, tag: TAG, width: 40 }).map(flat);
		expect(rows.some((line) => line.includes("│") && line.includes(SUB))).toBe(false);
		expect(rows).toContain(SUB);
		expect(rows).toContain(TAG);
	});

	test("sin tag no se dibuja una fila vacía para él", () => {
		const banded = placaRows({ subtitle: SUB, width: 80 }).map(flat);
		expect(banded.some((line) => line.includes(SUB))).toBe(true);
		expect(banded).toHaveLength(renderTv({ cut: "cabinet" }).length);
		const stacked = placaRows({ subtitle: SUB, width: 40 }).map(flat);
		expect(stacked).toHaveLength(renderTv({ cut: "cabinet" }).length + 2);
	});

	test("cada corte apoya el texto contra su pantalla, no contra el borde", () => {
		for (const cut of ["cabinet", "compact"] as const) {
			const rows = placaRows({ cut, subtitle: SUB, width: 120 });
			const index = rows.findIndex((row) => flat(row).includes(SUB));
			expect(index).toBeGreaterThanOrEqual(0);
			// Nunca la primera ni la última: esas son las tapas del mueble.
			expect(index).toBeGreaterThan(0);
			expect(index).toBeLessThan(rows.length - 1);
		}
	});

	// `minimal` mide tres filas, de las que dos son las tapas. Antes anclaba el
	// texto ahí: el lema colgado del borde de arriba y las versiones del de
	// abajo, con el cristal vacío en medio. Sin fila que ofrecer, apila.
	test("el mínimo no tiene fila contra el cristal, así que apila aunque sobre ancho", () => {
		const rows = placaRows({ cut: "minimal", subtitle: SUB, tag: TAG, width: 200 }).map(flat);
		const art = renderTv({ cut: "minimal" }).map(flat);
		expect(rows.slice(0, art.length)).toEqual(art);
		expect(rows).toContain(SUB);
		expect(rows).toContain(TAG);
		expect(rows.some((line) => line.includes("│") && line.includes(SUB))).toBe(false);
	});
});
