// =============================================================================
// TESTS: el esquema del candidato ENSEÑA su forma
// -----------------------------------------------------------------------------
// EL FALLO MEDIDO -> 439 intentos de guardado en 32 cambios, 0 guardados. El 85%
// (374) murió como `no_candidate`. Causa: `buildPhaseMemoryCandidate` exige
// cuatro campos con nombres exactos (`type`, `stableId`, `title`, `summary`),
// pero el parámetro se declaraba como `{ type: "object" }` a secas y ningún
// prompt los nombraba. Se le pedía al modelo adivinar cuatro nombres. No los
// adivinó ni una vez.
//
// Confirmación cruzada: los 33 candidatos VÁLIDOS del histórico son todos de la
// fase `close`, la única donde el candidato lo construye el código.
//
// La corrección es § 002 en estado puro: esto no es un párrafo de prompt, es un
// esquema. Este test fija que el esquema declare lo que el validador exige, para
// que las dos mitades no vuelvan a separarse.
// =============================================================================

import { describe, expect, test } from "bun:test";

import { MEMORY_CANDIDATE_SCHEMA, MEMORY_CANDIDATE_TYPES } from "../ein-pi/agent/lib/sdd-memory-save.ts";
import { buildPhaseMemoryCandidate } from "../ein-pi/agent/lib/sdd-memory-save.ts";

describe("el esquema declara lo que el validador exige", () => {
	test("nombra los cuatro campos obligatorios", () => {
		expect(Object.keys(MEMORY_CANDIDATE_SCHEMA.properties)).toEqual(
			expect.arrayContaining(["type", "stableId", "title", "summary"]),
		);
		expect(MEMORY_CANDIDATE_SCHEMA.required).toEqual(["type", "stableId", "title", "summary"]);
	});

	test("cada campo trae descripción: un nombre sin explicación no enseña nada", () => {
		for (const [name, property] of Object.entries(MEMORY_CANDIDATE_SCHEMA.properties)) {
			expect(property.description, `${name} sin descripción`).toBeTruthy();
		}
	});

	test("los tipos permitidos del esquema son EXACTAMENTE los que acepta el validador", () => {
		expect([...MEMORY_CANDIDATE_SCHEMA.properties.type.enum].sort()).toEqual(
			[...MEMORY_CANDIDATE_TYPES].sort(),
		);
	});

	test("declara los opcionales que el validador sí usa", () => {
		expect(Object.keys(MEMORY_CANDIDATE_SCHEMA.properties)).toEqual(
			expect.arrayContaining(["rationale", "evidence"]),
		);
	});
});

describe("un candidato con la forma que el esquema anuncia es aceptado", () => {
	const FROM_SCHEMA = {
		type: "decision",
		stableId: "engram-single-store",
		title: "Un solo cuaderno para los dos runtimes",
		summary: "Se retira el almacen por runtime porque dejo uno muerto y otro vacio.",
		rationale: "La continuidad entre runtimes es bidireccional.",
		evidence: "439 recibos, 0 guardados.",
	};

	test("el validador lo acepta tal cual", () => {
		const candidate = buildPhaseMemoryCandidate("mi-cambio", "design", FROM_SCHEMA);
		expect(candidate).toBeDefined();
		expect(candidate?.type).toBe("decision");
		expect(candidate?.stableId).toBe("engram-single-store");
		expect(candidate?.phase).toBe("design");
		expect(candidate?.change).toBe("mi-cambio");
	});

	test("los seis tipos anunciados en el esquema pasan el validador", () => {
		for (const type of MEMORY_CANDIDATE_SCHEMA.properties.type.enum) {
			expect(
				buildPhaseMemoryCandidate("mi-cambio", "design", { ...FROM_SCHEMA, type }),
				`el tipo ${type} se anuncia pero se rechaza`,
			).toBeDefined();
		}
	});

	test("falta uno de los cuatro obligatorios -> sigue sin haber candidato", () => {
		for (const missing of ["type", "stableId", "title", "summary"]) {
			const partial: Record<string, unknown> = { ...FROM_SCHEMA };
			delete partial[missing];
			expect(buildPhaseMemoryCandidate("mi-cambio", "design", partial)).toBeUndefined();
		}
	});

	test("un tipo fuera del enum se sigue rechazando", () => {
		expect(
			buildPhaseMemoryCandidate("mi-cambio", "design", { ...FROM_SCHEMA, type: "session_summary" }),
		).toBeUndefined();
	});
});
