// =============================================================================
// TESTS: el contrato de estilo compilado desde las skills
//   Las skills existian y no se aplicaban porque lo que llegaba al ejecutor era
//   una RUTA. Aqui se comprueba que lo que llega son las REGLAS, y que salen de
//   la skill y no de una copia que se queda atras en cuanto Samu la edita.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ESSENTIALS_SECTION, compileStyleContract } from "../ein-pi/agent/lib/style-contract.ts";

const SKILLS = join(import.meta.dir, "..", "runtime", "skills", "local");

describe("el extracto sale de la skill, no de una copia", () => {
	test("compila las dos skills reales y trae sus propias palabras", () => {
		const contract = compileStyleContract(SKILLS);
		expect(contract.ok).toBe(true);
		if (!contract.ok) return;

		// Frases textuales de las skills: si el extracto fuera una copia pegada en
		// TypeScript, editarlas en la skill no cambiaria nada y este test seguiria
		// verde mintiendo.
		expect(contract.value.text).toContain("Comenta el PORQUE, no el QUE");
		expect(contract.value.text).toContain("BLINDAJE");
		expect(contract.value.text).toContain("[CORE]");
		expect(contract.value.text).toContain("Un log = un evento");
	});

	test("trae el vocabulario acotado y el catalogo de tags, que es lo operativo", () => {
		const contract = compileStyleContract(SKILLS);
		if (!contract.ok) throw new Error(contract.reason);

		for (const word of ["RUIDO", "CORTE", "FAIL CLOSED", "NOISE KILL"]) {
			expect(contract.value.text).toContain(word);
		}
		for (const tag of ["[FLOW]", "[DATA]", "[HACK]"]) {
			expect(contract.value.text).toContain(tag);
		}
		// El catalogo SUGIERE. La propia skill usa [FEATURE] y [CRITICAL] fuera de
		// esa lista, asi que el bloque no puede presentarla como cerrada.
		expect(contract.value.text).toContain("un tag propio que aclare vale igual");
	});

	test("informa de su tamano, porque viaja en cada turno que escribe codigo", () => {
		const contract = compileStyleContract(SKILLS);
		if (!contract.ok) throw new Error(contract.reason);

		expect(contract.value.bytes).toBe(Buffer.byteLength(contract.value.text));
		expect(contract.value.bytes).toBeGreaterThan(0);
	});
});

describe("fail-closed sobre el nucleo de la skill", () => {
	function fakeSkills(comment: string, logging: string): string {
		const root = mkdtempSync(join(tmpdir(), "ein-style-contract-"));
		for (const [name, body] of [["comment-style", comment], ["logging-style", logging]] as const) {
			mkdirSync(join(root, name), { recursive: true });
			writeFileSync(join(root, name, "SKILL.md"), body);
		}
		return root;
	}

	const WITH_CORE = `# skill\n\n## ${ESSENTIALS_SECTION}\n\nreglas\n`;
	const WITHOUT_CORE = "# skill\n\n## Otra cosa\n\ncuerpo\n";

	test("una skill sin nucleo se nombra, en vez de entregar un bloque mas corto", () => {
		const root = fakeSkills(WITHOUT_CORE, WITH_CORE);
		try {
			const contract = compileStyleContract(root);
			expect(contract.ok).toBe(false);
			// El fallo peligroso es el silencioso: un bloque corto sigue
			// pareciendo un bloque.
			if (!contract.ok) expect(contract.reason).toContain("comment-style");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("tambien vigila la skill de logging, no solo la de comentarios", () => {
		const root = fakeSkills(WITH_CORE, WITHOUT_CORE);
		try {
			const contract = compileStyleContract(root);
			expect(contract.ok).toBe(false);
			if (!contract.ok) expect(contract.reason).toContain("logging-style");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("una skill ilegible tambien es un fallo explicito", () => {
		const root = mkdtempSync(join(tmpdir(), "ein-style-contract-empty-"));
		try {
			const contract = compileStyleContract(root);
			expect(contract.ok).toBe(false);
			if (!contract.ok) expect(contract.reason.length).toBeGreaterThan(0);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
