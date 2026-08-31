// =============================================================================
// TESTS: el estilo llega igual a los dos runtimes
//   Pi recibia 2 KB de reglas y Claude una frase suelta entre diez mil bytes de
//   politica. Claude es relevo, no un segundo estandar de escritura.
//
//   Diferencia real que este contrato asume: en Pi el bloque se inyecta en cada
//   turno leyendo las skills del home; en Claude se MATERIALIZA al sincronizar,
//   asi que queda congelado hasta el siguiente sync. Por eso se comprueba que lo
//   materializado siga coincidiendo con lo compilado desde la skill.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { compileClaudeSurface } from "../ein-cc/sync.ts";
import { compileStyleContract } from "../shared/contracts/style-contract.ts";

const SKILLS = join(import.meta.dir, "..", "runtime", "skills", "local");

function styleText(): string {
	const contract = compileStyleContract(SKILLS);
	if (!contract.ok) throw new Error(contract.reason);
	return contract.value.text;
}

describe("paridad de estilo entre Pi y Claude", () => {
	test("el agente que escribe codigo recibe las reglas, no una frase", () => {
		const apply = compileClaudeSurface().agents["sdd-apply.md"] ?? "";

		expect(apply).toContain("Comenta el PORQUE, no el QUE");
		expect(apply).toContain("BLINDAJE");
		expect(apply).toContain("Un log = un evento");
	});

	test("el coordinador tambien, porque tambien escribe codigo en la practica", () => {
		expect(compileClaudeSurface().coordinator).toContain("Comenta el PORQUE, no el QUE");
	});

	test("lo materializado coincide con lo compilado desde la skill", () => {
		const expected = styleText();
		const surface = compileClaudeSurface();

		// Si alguien edita la skill y no vuelve a sincronizar, esto cae: es la
		// unica forma de que el congelado no se quede atras en silencio.
		expect(surface.agents["sdd-apply.md"]).toContain(expected);
		expect(surface.coordinator).toContain(expected);
	});

	test("los agentes que no escriben codigo no cargan con el bloque", () => {
		const surface = compileClaudeSurface();
		for (const file of ["ein-scout.md", "sdd-scope.md", "ein-linear.md"]) {
			expect(surface.agents[file] ?? "", file).not.toContain("Comenta el PORQUE");
		}
	});
});
