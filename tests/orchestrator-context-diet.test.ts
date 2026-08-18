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
// Este test solo blinda un contrato estático en prosa, porque no puede probar
// la compactación del runtime ni el comportamiento de un modelo.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
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
		test(`${name} declara el contrato de envelope compacto como heading real`, () => {
			const raw = agent(name);
			expect(raw).toMatch(/^## Return contract \(compact envelope\)$/m);
			expect(raw).toContain("≤ 3 lines");
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

	test("sdd-verify acota el acceptance-report al contrato inyectado", () => {
		const raw = agent("sdd-verify");
		expect(raw).toMatch(/injected Acceptance Contract explicitly requires/i);
		expect(raw).toMatch(/concise fenced `acceptance-report`/i);
		expect(raw).toMatch(/pi-subagents.*strips.*before displaying output to the parent/i);
		expect(raw).toContain("not generic acceptance `fileOutput` for direct phase calls");
	});
});

describe("orchestrator — doctrina de dieta de contexto", () => {
	const raw = readFileSync(ORCHESTRATOR, "utf8");

	// El esquema detallado se retiró del orquestador porque los SIETE agentes ya
	// lo llevan, que es donde se aplica. Aquí solo queda la consecuencia para el
	// padre: un envelope gordo es lo que le llena el contexto.
	test("el contrato del envelope vive en los agentes, no duplicado en el prompt", () => {
		expect(raw).toContain("Phase result envelope");
		expect(raw).toContain("lee el artefacto");

		const agentsDir = join(import.meta.dir, "..", "ein-pi", "core", "agents");
		const phases = readdirSync(agentsDir).filter((f) => f.startsWith("sdd-") && f.endsWith(".md"));
		expect(phases.length).toBe(7);
		for (const file of phases) {
			expect(readFileSync(join(agentsDir, file), "utf8")).toContain("executive_summary");
		}
	});

	test("ein-scout está en el inventario de subagentes", () => {
		expect(raw).toContain("`ein-scout`");
	});

	test("la investigación pesada se enruta a ein-scout, no al padre", () => {
		expect(raw).toMatch(/ein-scout/);
		expect(raw).toContain("1-2 file peek");
	});

	test("el fan-out secuencial usa de uno a tres scouts frescos, uno por turno, y nunca ramas sdd-map", () => {
		const fanOut = raw.slice(raw.indexOf("## Read-only fan-out (sequential)"));
		expect(raw).not.toContain("## Parallel read-only fan-out");
		expect(fanOut).toContain("one to three distinct fresh scouts");
		expect(fanOut).toMatch(/independent `ein-scout` call/);
		expect(fanOut).not.toMatch(/read-only `sdd-map`/);
		expect(fanOut).toContain("no OpenSpec artifacts");
		expect(fanOut).toMatch(/one scout per turn/);
	});

	describe("routing determinista de investigación pre-scope", () => {
		test("delega desde cuatro archivos o dos clases de fuente", () => {
			expect(raw).toContain("four or more distinct files");
			expect(raw).toContain("at least two source classes");
		});

		test("limita lecturas de routing y spot-checks materiales", () => {
			expect(raw).toContain("at most two routing reads");
			expect(raw).toContain("at most two material spot-checks");
		});

		test("reenvía evidencia aceptada sin redescubrimiento automático", () => {
			expect(raw).toContain("accepted findings, references, and explicit uncertainties");
			expect(raw).toContain("MUST NOT automatically rediscover");
		});

		test("mantiene evaluación read-only sin estado SDD/OpenSpec", () => {
			expect(raw).toContain("read-only assessment creates no OpenSpec, SDD, or lifecycle state");
		});

		test("distingue los límites de activación de sus casos inferiores", () => {
			expect(raw).toContain("Three files alone do not meet the four-file threshold");
			expect(raw).toContain("one source class alone does not meet the two-class threshold");
		});

		test("prohíbe comprobaciones no materiales y redescubrimiento amplio", () => {
			expect(raw).toContain("Non-material checks and broad rediscovery are prohibited");
			expect(raw).toMatch(/at most two material spot-checks/);
		});
	});

	test("acota las lecturas inline del propio padre (no full diff / wide -C / logs)", () => {
		expect(raw).toContain("Parent read discipline");
		expect(raw).toMatch(/never a full `git diff`|NEVER a full `git diff`/i);
	});

	test("scout caído no es licencia para tragar la investigación inline", () => {
		expect(raw).toMatch(/When `ein-scout` is unavailable/);
		expect(raw).toMatch(/infrastructure incident/i);
		expect(raw).toMatch(/degrade to \*\*bounded\*\* reads|bounded.*reads only/i);
	});

	test("orientación acotada: nada de ritual de investigación al arrancar", () => {
		expect(raw).toContain("Orientation is cheap by contract");
		// Reconoce la limpieza trivial de un cambio sin trackear (rm -rf, no auditoría).
		expect(raw).toMatch(/fully UNTRACKED/);
		expect(raw).toContain("rm -rf");
		// Disciplina de las herramientas ctx: indexar y buscar, no volcar.
		expect(raw).toMatch(/INDEX-and-SEARCH, never echo/);
	});

	test("el fallback de recuperación apunta al transcript, no al envelope", () => {
		// Con el envelope compacto, el contenido completo ya no está en él:
		// la recuperación de última instancia usa el transcript.jsonl.
		expect(raw).toContain("_transcript.jsonl");
	});
});
