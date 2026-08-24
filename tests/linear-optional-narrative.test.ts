// =============================================================================
// TESTS: narrativa coherente con Linear como integración opcional
// Antes Ein decía "Linear is the primary board" en ~8 sitios aunque el usuario
// trabajara sin Linear. Después la narrativa fue condicional a un modo de dos
// valores (solo/team); ahora ese modo no existe y la condición es la propia
// integración, apagada por defecto. Estos tests blindan que no reaparezca el
// sesgo Linear-first ni el vocabulario del modo retirado.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const CORE = join(import.meta.dir, "../ein-pi/core");
// Runtime Pi (assets/, lib/, extensions/) vive en agent/; el contenido
// portable (agents/, AGENTS.md, skills/) vive en core/.
const read = (p: string) =>
	readFileSync(join(p.startsWith("agents/") || p === "AGENTS.md" ? CORE : AGENT, p), "utf8");

describe("el orquestador conoce la integración", () => {
	const orch = read("assets/orchestrator.md");

	test("menciona la integración con Linear y sus dos estados", () => {
		const lower = orch.toLowerCase();
		expect(lower).toContain("linear integration");
		expect(lower).toContain("**off**");
		expect(lower).toContain("**on**");
	});

	test("trata la integración como autoritativa para Linear", () => {
		// No debe afirmar Linear como board primaria de forma incondicional.
		expect(orch).not.toMatch(/Ein uses Linear as the primary board\b/);
	});

	test("apagada = board local (openspec + git), sin preflight automático", () => {
		expect(orch.toLowerCase()).toContain("openspec/changes");
		expect(orch.toLowerCase()).toMatch(/off[^]*no linear|no linear[^]*board/);
	});

	// El modo de dos valores se retiró: si su vocabulario reaparece en el prompt,
	// es que alguien reintrodujo el ajuste sin darse cuenta.
	test("ya no habla de un modo de trabajo de dos valores", () => {
		expect(orch).not.toMatch(/\bwork mode\b/i);
		expect(orch).not.toMatch(/\bteam mode\b/i);
		expect(orch).not.toMatch(/\bsolo mode\b/i);
	});
});

describe("el preflight de Linear depende de la integración", () => {
	test("ein-linear: el preflight solo corre con la integración encendida", () => {
		const linear = read("agents/ein-linear.md");
		expect(linear).toContain("integration on only");
		expect(linear).not.toMatch(/\bTeam mode\b/);
	});

	test("AGENTS.md: la sección Linear se presenta como integración opcional", () => {
		const agents = read("AGENTS.md");
		expect(agents).toContain("Linear (optional integration)");
		expect(agents).not.toMatch(/\bTeam mode\b/);
	});
});
