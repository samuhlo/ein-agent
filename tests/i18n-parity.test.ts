// =============================================================================
// TESTS: paridad i18n (lib/i18n/strings.ts)
// Invariante de mantenimiento: cada clave de UI existe en ambos mapas (en/es)
// y sin duplicados. Se valida parseando el fichero (no se importa: arrastra
// @juicesharp/rpiv-i18n, irresoluble en los tests con bun).
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const STRINGS_PATH = join(
	import.meta.dir,
	"..",
	"ein-pi",
	"agent",
	"lib",
	"i18n",
	"strings.ts",
);

function extractKeys(block: string): string[] {
	return [...block.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1] as string);
}

function blockBetween(src: string, start: string, end: string): string {
	const from = src.indexOf(start);
	const to = src.indexOf(end);
	if (from < 0 || to < 0 || to <= from) {
		throw new Error(`No se pudo aislar el bloque entre "${start}" y "${end}"`);
	}
	return src.slice(from, to);
}

describe("i18n parity (en/es)", () => {
	const src = readFileSync(STRINGS_PATH, "utf8");
	const en = extractKeys(blockBetween(src, "const EN", "const ES"));
	const es = extractKeys(blockBetween(src, "const ES", "registerStrings(NS"));

	test("ambos mapas tienen claves", () => {
		expect(en.length).toBeGreaterThan(0);
		expect(es.length).toBe(en.length);
	});

	test("sin claves duplicadas", () => {
		expect(en.length).toBe(new Set(en).size);
		expect(es.length).toBe(new Set(es).size);
	});

	test("mismo conjunto de claves en en y es", () => {
		const setEn = new Set(en);
		const setEs = new Set(es);
		const onlyEn = [...setEn].filter((k) => !setEs.has(k));
		const onlyEs = [...setEs].filter((k) => !setEn.has(k));
		expect(onlyEn).toEqual([]);
		expect(onlyEs).toEqual([]);
	});
});
