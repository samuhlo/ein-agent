// =============================================================================
// TESTS: lo que se entrega a quien escribe codigo
//   El bloque decia "lee y sigue estas skills" + tres rutas. Un puntero no es
//   una entrega: nada distinguia "no la leyo" de "la leyo y la ignoro".
// =============================================================================

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { buildConventionBlock } from "../shared/contracts/style-contract.ts";
import { codeConventionSkillBlock } from "../ein-pi/agent/extensions/ein-skill-registry";

const REPO = join(import.meta.dir, "..");
const SKILLS = join(REPO, "runtime", "skills", "local");

describe("el bloque de convenciones", () => {
	test("entrega las reglas, no solo el camino a las reglas", () => {
		const block = buildConventionBlock(SKILLS, [join(SKILLS, "comment-style", "SKILL.md")]);

		expect(block).toContain("Comenta el PORQUE, no el QUE");
		expect(block).toContain("BLINDAJE");
		expect(block).toContain("Un log = un evento");
	});

	test("conserva las rutas para el detalle que no cabe en el extracto", () => {
		const path = join(SKILLS, "comment-style", "SKILL.md");
		expect(buildConventionBlock(SKILLS, [path])).toContain(path);
	});

	test("sin skills legibles no inventa un bloque a medias", () => {
		expect(buildConventionBlock(join(REPO, "no-existe"), [])).toBe("");
	});

	test("un arbol sin skills no rompe la sesion: devuelve vacio", () => {
		expect(codeConventionSkillBlock(join(REPO, "no-existe-esta-carpeta"))).toBe("");
	});
});
