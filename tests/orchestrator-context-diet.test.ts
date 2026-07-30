// =============================================================================
// TESTS: dieta de contexto del orquestador — el envelope de retorno es COMPACTO
// =============================================================================
// El mensaje FINAL de cada fase se copia VERBATIM al contexto del padre, y el
// padre no lo resetea entre fases (subagent-runner.ts: getFinalOutput ->
// finalizeSingleOutput -> displayOutput = fullOutput cuando no hay outputPath).
// Un envelope gordo por fase (executive_summary largo, listas de ficheros,
// tablas de tests, salida de comandos pegada) es lo que llena al orquestador en
// un flujo SDD de ~19 subagentes. El contrato de cada fase debe capar ese
// retorno: el detalle vive en el artefacto en disco, no en el envelope.
//
// Este test BLINDA el contrato en prosa (no hay definición central: cada agente
// .md lo declara). Si alguien reintroduce el envelope verboso, salta aquí.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CORE_AGENTS = join(import.meta.dir, "../ein-pi/core/agents");
const ORCHESTRATOR = join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md");

// Las siete fases SDD cuyo envelope de retorno drena al padre.
const PHASE_AGENTS = [
	"sdd-scope",
	"sdd-map",
	"sdd-design",
	"sdd-tasks",
	"sdd-apply",
	"sdd-verify",
	"sdd-close",
];

function agent(name: string): string {
	return readFileSync(join(CORE_AGENTS, `${name}.md`), "utf8");
}

describe("compact return envelope — cada fase SDD", () => {
	for (const name of PHASE_AGENTS) {
		test(`${name} declara el contrato de envelope compacto`, () => {
			const raw = agent(name);
			expect(raw).toContain("## Return contract (compact envelope)");
			// Cap explícito del resumen que drena al padre.
			expect(raw).toContain("≤ 3 lines");
			// Prohibición de pegar el payload gordo en el retorno.
			expect(raw).toMatch(/NEVER paste/i);
		});

		test(`${name} ya NO pide el envelope verboso antiguo`, () => {
			const raw = agent(name);
			// La línea antigua mandaba "Return the standard phase envelope with
			// status, executive_summary, ..." sin cap alguno.
			expect(raw).not.toContain(
				"Return the standard phase envelope with status, executive_summary",
			);
		});
	}

	test("sdd-map ya no reenvía el contenido del artefacto como output", () => {
		const raw = agent("sdd-map");
		expect(raw).not.toContain("ALSO return the same content");
	});
});

describe("orchestrator — doctrina de dieta de contexto", () => {
	const raw = readFileSync(ORCHESTRATOR, "utf8");

	test("el esquema del envelope se declara compacto por contrato", () => {
		expect(raw).toContain("Phase result envelope (compact by contract)");
	});

	test("ein-scout está en el inventario de subagentes", () => {
		expect(raw).toContain("`ein-scout`");
	});

	test("la investigación pesada se enruta a ein-scout, no al padre", () => {
		// El padre solo hace un peek de 1-2 ficheros inline; lo demás va a scout.
		expect(raw).toMatch(/ein-scout/);
		expect(raw).toContain("1-2 file peek");
	});

	test("el fallback de recuperación apunta al transcript, no al envelope", () => {
		// Con el envelope compacto, el contenido completo ya no está en él:
		// la recuperación de última instancia usa el transcript.jsonl.
		expect(raw).toContain("_transcript.jsonl");
	});
});
