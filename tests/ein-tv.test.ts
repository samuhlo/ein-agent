// =============================================================================
// TESTS: la marca
// Un dibujo de caracteres se rompe de una sola forma: una fila que no mide lo
// que las demás. El borde derecho deja de caer en columna y el mueble se abre.
// No falla nada, no salta ningún tipo — solo se ve mal. Por eso se fija aquí.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { TV_WIDTH, renderTv, tvRowWidth, type TvCut, type TvRow, type TvSignal } from "../ein-pi/agent/lib/ein-tv.ts";

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
		expect(renderTv({ cut: "cabinet" }).map(flat).join("\n")).not.toContain("╲");
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
