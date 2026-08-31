// =============================================================================
// TESTS: ein-git no interactivo (anti-regresión de prompt)
// El cuelgue #1 de ein-git: `gh pr create` cae en un prompt/editor interactivo
// en un subagente headless (sin TTY) y arde hasta el timeout. El fix manda la
// receta no interactiva (body a fichero, flags explícitos, sin --web) + precheck
// de scope `workflow` + maxRuntimeMs tirante para delivery en el orquestador.
// Contratos de prompt → se asertan por substring para que no se pierdan.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { ensurePhaseRuntime } from "../ein-pi/agent/lib/sdd-preflight.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../runtime");
const einGit = readFileSync(join(CORE, "agents/ein-git.md"), "utf8");
const orchestrator = readFileSync(join(CORE, "assets/orchestrator.md"), "utf8");
const agentsGuide = readFileSync(join(CORE, "AGENTS.md"), "utf8");

describe("ein-git crea PRs de forma no interactiva (no cuelga)", () => {
	test("manda body-file + flags explícitos, prohíbe bare y --web", () => {
		expect(einGit).toContain("--body-file");
		expect(einGit).toContain("--head");
		expect(einGit).toContain("never a bare `gh pr create`");
		expect(einGit).toContain("never `--web`");
	});

	test("fuerza entorno no interactivo (sin prompt, sin pager)", () => {
		expect(einGit).toContain("GH_PROMPT_DISABLED=1");
		expect(einGit).toContain("GH_PAGER=cat");
	});

	test("read-back por JSON (no paginable)", () => {
		expect(einGit).toContain("gh pr view");
		expect(einGit).toContain("--json");
	});

	test("no reintenta el comando idéntico que se cuelga", () => {
		expect(einGit.toLowerCase()).toContain("do **not** retry the identical command");
	});
});

describe("gates de entrega deterministas (pathspec cerrado + grant de intención)", () => {
	test("delega el staging cerrado al runtime, sin recibo de candidato", () => {
		expect(einGit).toContain("closed pathspec");
		// El subsistema de recibo de candidato fue retirado: el prompt no debe
		// resucitar sus conceptos ni pedir declaraciones de contenido.
		expect(einGit).not.toContain("verified-sdd");
		expect(einGit).not.toContain("mechanical-unverified");
		expect(einGit).not.toContain("validatedDeliveryHead");
	});

	test("el push se apoya en el grant de intención de un solo uso", () => {
		expect(einGit).toContain("one-shot delivery grant");
	});
});

describe("precheck del scope workflow (fail-fast)", () => {
	test("comprueba el scope antes de pushear .github/workflows", () => {
		expect(einGit).toContain(".github/workflows");
		expect(einGit).toContain("gh auth status");
		expect(einGit).toContain("gh auth refresh --scopes workflow");
	});
});

// El cap de 2 minutos mataba entregas reales: 7 de 63 runs de ein-git murieron
// a 6-9 turnos. Una entrega cortada entre `push` y `gh pr create` deja el repo
// a medias y cuesta más reconciliarla que esperar a un `gh` lento.
describe("presupuesto de entrega de ein-git", () => {
	// El techo de entrega dejó de vivir en la prosa —donde estaba duplicado en dos
	// reglas— y lo fija la tabla por agente. El cap corto mataba 7 de 63 entregas.
	test("la tabla le da 300000, ni el cap corto ni el de chain", () => {
		const input: Record<string, unknown> = { agent: "ein-git", task: "commit y push" };
		expect(ensurePhaseRuntime(input)).toBe(true);
		expect(input.maxRuntimeMs).toBe(300_000);
		expect(orchestrator).not.toContain("tight `maxRuntimeMs`");
	});
});

describe("contrato anti double-ask para delivery delegada", () => {
	test("el orquestador prohíbe preguntar manualmente y exige el gate determinista", () => {
		expect(orchestrator).toContain("Delivery confirmation is NOT yours to ask");
		expect(orchestrator).toContain("Do NOT use `ask_user_question`");
		expect(orchestrator).toContain("deterministic delivery gate");
		expect(orchestrator).toContain("re-delegate only with explicit delivery wording");
	});

	test("AGENTS.md replica la regla para sesiones instaladas", () => {
		expect(agentsGuide).toContain("Delivery confirmation is NOT yours to ask");
		expect(agentsGuide).toContain("Do NOT use `ask_user_question`");
		expect(agentsGuide).toContain("deterministic delivery gate");
		expect(agentsGuide).toContain("re-delegate only with explicit delivery wording");
	});
});
