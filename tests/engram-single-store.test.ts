// =============================================================================
// TESTS: un solo cuaderno de Ein (`~/.engram-ein`)
// -----------------------------------------------------------------------------
// POR QUÉ CAMBIA -> la política anterior daba un almacén por runtime y prohibía
// mezclarlos. Medido: `~/.engram-pi` murió el 7 de junio con 238 observaciones,
// `~/__PRESERVE_ENGRAM_EIN_CC__` nunca llegó a tener ninguna, y un cambio empezado en Pi
// perdía su memoria al continuarlo en Claude. Eso es § 003 al revés: la
// continuidad entre runtimes es bidireccional, y el puente es el disco.
//
// La regla nueva: UN cuaderno para Ein, separado del `~/.engram` por defecto
// (que comparten otras herramientas), y UN solo sitio en el código que decida
// su ruta — dos sitios que declaren la misma ruta es cómo se desincronizan.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	ENGRAM_STORE_DIRNAME,
	engramStoreDir,
	resolveEngramDataDir,
} from "../ein-pi/agent/lib/memory-contract.ts";

const ROOT = join(import.meta.dir, "..");

describe("un solo cuaderno para los dos runtimes", () => {
	test("el nombre del directorio es el de Ein, no el genérico de Engram", () => {
		// `.engram` a secas es el almacén por defecto que usa cualquier otra
		// herramienta de la máquina; Ein no debe escribir ahí.
		expect(ENGRAM_STORE_DIRNAME).toBe(".engram-ein");
	});

	test("Pi y Claude resuelven EL MISMO almacén", () => {
		const pi = resolveEngramDataDir("pi", { HOME: "/home/ein" });
		const claude = resolveEngramDataDir("claude", { HOME: "/home/ein" });
		expect(pi).toBe("/home/ein/.engram-ein");
		expect(claude).toBe(pi);
	});

	test("un HOME no absoluto o ausente no produce ruta (fail closed)", () => {
		expect(resolveEngramDataDir("pi", { HOME: "relativo/no/vale" })).toBeUndefined();
		expect(resolveEngramDataDir("pi", {})).toBeUndefined();
	});

	test("engramStoreDir es el mismo cálculo, para quien ya tiene el home", () => {
		expect(engramStoreDir("/home/ein")).toBe("/home/ein/.engram-ein");
	});
});

describe("un solo dueño de la ruta", () => {
	// Anti-regresión del fallo que hizo falta arreglar: la ruta estaba escrita a
	// mano en 6 sitios de código distintos. Cualquiera de ellos podía quedarse
	// atrás en un rename y nadie se enteraría hasta ver un almacén vacío.
	const CODE_OWNERS = [
		"ein-pi/agent/extensions/ein-paths.ts",
		"ein-pi/agent/extensions/ein-doctor.ts",
		"ein-pi/agent/surfaces/terminal-app-entrypoint.ts",
		"installer/src/core/paths.ts",
		"installer/src/core/verify.ts",
	];

	test("ningún módulo escribe el nombre del almacén a mano", () => {
		const offenders = CODE_OWNERS.filter((file) =>
			/"\.engram(-pi|-ein-cc|-ein)?"/.test(readFileSync(join(ROOT, file), "utf8")),
		);
		expect(offenders).toEqual([]);
	});

	// Se mira el CÓDIGO, no la prosa: el módulo dueño cita los almacenes viejos en
	// un comentario a propósito, porque explicar por qué cambió la política vale
	// más que la pureza de un grep.
	test("ningún módulo enruta ya a los almacenes viejos", () => {
		for (const file of [...CODE_OWNERS, "ein-cc/sync.ts"]) {
			const code = readFileSync(join(ROOT, file), "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, "");
			expect(code).not.toContain("__PRESERVE_ENGRAM_EIN_CC__");
			expect(code).not.toContain(".engram-pi");
		}
	});
});
