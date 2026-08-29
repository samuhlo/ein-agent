// =============================================================================
// TESTS: el linter de estilo
//   Comprueba lo mecanico y DECLARA lo que no comprueba. Un informe limpio dice
//   "estas tres pasaron", no "el estilo es correcto".
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
	LOG_SEPARATORS,
	LOG_TAGS,
	PERFORMED_CHECKS,
	lintStyle,
} from "../ein-pi/agent/lib/style-lint.ts";

const SKILLS = join(import.meta.dir, "..", "runtime", "skills", "local");

describe("lo que si comprueba", () => {
	test("un emoji en un comentario es un hallazgo", () => {
		const report = lintStyle(["// esto va bien 🚀"]);
		expect(report.findings.map((f) => f.rule)).toEqual(["emoji"]);
		expect(report.findings[0]?.line).toBe(1);
	});

	test("los glifos de la gramatica de Ein no son emojis", () => {
		// Marcarlos daba nueve falsos positivos sobre codigo correcto: `GLYPH.done`
		// es "\u2713" y el doctor pinta con "\u2713 \u2715". Son tipografia, no pictogramas.
		const report = lintStyle([
			"// terminal (\u2713 ok \u00b7 ! aviso \u00b7 \u2715 fallo), no verdes y rojos sueltos.",
			"// El runner marca \u2717 por cosas que no dicen nada del trabajo:",
		]);
		expect(report.findings).toEqual([]);
	});

	test("un dingbat con selector de presentacion si es emoji", () => {
		expect(lintStyle(["// corazon \u2764\uFE0F de verdad"]).findings.map((f) => f.rule)).toEqual(["emoji"]);
	});

	test("un tag fuera del catalogo NO se marca: la lista sugiere, no cierra", () => {
		// El caso real que lo destapo: `// [EXPORT] Registro en Pi` es un
		// comentario correcto. La propia skill usa [FEATURE] y [CRITICAL] fuera
		// del catalogo universal.
		expect(lintStyle(["// [EXPORT] Registro en Pi"]).findings).toEqual([]);
		expect(lintStyle(["// [CORE] el bunker de estado"]).findings).toEqual([]);
	});

	test("un log fuera de formato dice exactamente que falla", () => {
		const cases: readonly [string, string][] = [
			['console.log("[DEMASIADOLARGO] :: X");', "invalido"],
			['console.log("[INFO] ~~ WRITING");', "separador"],
			['console.log("[INFO] :: escribiendo cosas");', "accion"],
			['console.log("[NOPE] :: WRITING");', "catalogo"],
		];
		for (const [line, expected] of cases) {
			const report = lintStyle([line]);
			expect(report.findings.some((f) => f.rule === "log-format" && f.message.includes(expected))).toBe(true);
		}
	});

	test("un log en formato pasa entero", () => {
		expect(lintStyle(['console.log("[DB] >> CONN_OPEN :: host: local | attempt: 1");']).findings).toEqual([]);
	});

	test("un console.log de texto libre no se juzga: no pretende llevar tag", () => {
		expect(lintStyle(['console.log("compilando el template");']).findings).toEqual([]);
	});

	test("cita la linea correcta cuando se le da un desplazamiento", () => {
		expect(lintStyle(["// bien", "// mal 🔥"], 40)[
			"findings"
		][0]?.line).toBe(41);
	});
});

describe("lo que NO comprueba, y lo dice", () => {
	test("un informe limpio publica que reviso, para no leerse como un aprobado general", () => {
		const report = lintStyle(["// [CORE] esto pasa"]);
		expect(report.findings).toEqual([]);
		expect(report.checked).toEqual(PERFORMED_CHECKS);
		expect(report.checked.length).toBeGreaterThan(0);
	});

	test("un comentario inutil que repite el codigo NO se marca: eso es juicio", () => {
		// La skill lo prohibe, pero decidirlo es criterio humano. Fingir que una
		// maquina lo sabe seria la mentira que este repo persigue en otras
		// superficies.
		expect(lintStyle(["const total = a + b; // suma a y b"]).findings).toEqual([]);
	});
});

describe("los catalogos no derivan de las skills", () => {
	test("cada tag y separador de log declarado existe en la skill", () => {
		const skill = readFileSync(join(SKILLS, "logging-style", "SKILL.md"), "utf8");
		for (const tag of LOG_TAGS) expect(skill).toContain(`[${tag}]`);
		for (const separator of LOG_SEPARATORS) expect(skill).toContain(separator);
	});
});
