// =============================================================================
// [CORE] CONTRATO DE ESTILO ENTREGADO
//
// RUIDO -> lo que llegaba al ejecutor eran TRES RUTAS y la orden de leerlas.
// Las dos skills suman 10,6 KB: abrirlas cuesta contexto, y quien escribe con
// presupuesto ajustado no las abre. El estilo existia y no se aplicaba.
//
// Cada skill empieza ahora por su seccion `Essentials`, que es lo unico que
// hace falta para escribir; el resto queda debajo como referencia. Esto entrega
// esa seccion —1,8 KB entre las dos— en vez de un puntero.
//
// Se lee de la skill, no se copia aqui: un extracto pegado en TypeScript se
// queda atras la primera vez que Samu edita la suya, y en silencio.
//
// FAIL CLOSED -> sin `Essentials`, esto falla nombrando la skill. Un bloque
// corto sigue pareciendo un bloque, y esa es la averia peligrosa.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** La seccion que cada skill expone como su nucleo operativo. */
export const ESSENTIALS_SECTION = "Essentials";

export type StyleContract = Readonly<{
	text: string;
	/** Viaja en cada turno que escribe codigo; su coste se mide, no se supone. */
	bytes: number;
}>;

export type CompileResult =
	| { ok: true; value: StyleContract }
	| { ok: false; reason: string };

/** Corta una seccion `## Titulo` hasta el siguiente `## `. */
function sectionOf(markdown: string, title: string): string | null {
	const start = markdown.indexOf(`\n## ${title}\n`);
	if (start < 0) return null;
	const from = start + 1;
	const next = markdown.indexOf("\n## ", from + 1);
	return markdown.slice(from, next < 0 ? undefined : next).trimEnd();
}

function readSkill(root: string, name: string): { ok: true; value: string } | { ok: false; reason: string } {
	const path = join(root, name, "SKILL.md");
	if (!existsSync(path)) return { ok: false, reason: `${name}: no se encuentra ${path}.` };
	try {
		return { ok: true, value: readFileSync(path, "utf8") };
	} catch (error) {
		return { ok: false, reason: `${name}: no se pudo leer ${path}: ${error instanceof Error ? error.message : String(error)}` };
	}
}

/**
 * El bloque que se entrega a quien escribe codigo: las reglas primero, y las
 * rutas al final para el detalle que el extracto no trae.
 *
 * PURO -> recibe la raiz de skills ya resuelta. Quien la resuelve es el borde,
 * porque en produccion sale del registry (el home instalado) y en un test sale
 * de un arbol de prueba.
 */
export function buildConventionBlock(root: string, paths: readonly string[]): string {
	const contract = compileStyleContract(root);
	if (!contract.ok) return "";
	return [
		contract.value.text,
		"",
		"Detalle completo, si hace falta:",
		...paths.map((path) => `- ${path}`),
	].join("\n");
}

/**
 * El extracto que se entrega a quien escribe codigo. `root` es la carpeta de
 * skills locales; se le pasa para poder compilar contra un arbol de prueba.
 */
export function compileStyleContract(root: string): CompileResult {
	const parts: string[] = [];
	for (const skill of ["comment-style", "logging-style"] as const) {
		const markdown = readSkill(root, skill);
		if (!markdown.ok) return markdown;
		const essentials = sectionOf(markdown.value, ESSENTIALS_SECTION);
		if (essentials === null) {
			return { ok: false, reason: `${skill}: falta la seccion "${ESSENTIALS_SECTION}"; el bloque no se entrega a medias.` };
		}
		parts.push(`# ${skill}\n${essentials.slice(`## ${ESSENTIALS_SECTION}`.length).trim()}`);
	}

	const text = [
		"## Code conventions (mandatory house style)",
		"Estas son las reglas, no un puntero a ellas. Aplicalas a los bloques que toques.",
		"",
		...parts,
	].join("\n");

	return { ok: true, value: { text, bytes: Buffer.byteLength(text) } };
}
