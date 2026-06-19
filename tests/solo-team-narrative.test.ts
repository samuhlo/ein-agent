// =============================================================================
// TESTS: narrativa Solo/Team coherente (no Linear-first incondicional)
// Antes Ein decía "Linear is the primary board" en ~8 sitios aunque el usuario
// trabajara solo. Ahora la narrativa es condicional al modo: Solo (default) sin
// Linear; Team con Linear. Estos tests blindan que no reaparezca el sesgo.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT = join(import.meta.dir, "../ein-pi/agent");
const read = (p: string) => readFileSync(join(AGENT, p), "utf8");

describe("orchestrator es mode-aware", () => {
	const orch = read("assets/orchestrator.md");

	test("menciona el work mode solo/team", () => {
		expect(orch.toLowerCase()).toContain("work mode");
		expect(orch.toLowerCase()).toContain("solo");
		expect(orch.toLowerCase()).toContain("team");
	});

	test("trata el modo como autoritativo para Linear", () => {
		// No debe afirmar Linear como board primaria de forma incondicional.
		expect(orch).not.toMatch(/Ein uses Linear as the primary board\b/);
	});

	test("Solo mode = board local (openspec + git), sin preflight automático", () => {
		expect(orch.toLowerCase()).toContain("openspec/changes");
		expect(orch.toLowerCase()).toMatch(/solo[^]*no linear|no linear[^]*board/);
	});
});

describe("preflight Linear gated a Team mode", () => {
	test("ein-linear: el preflight es Team-mode only", () => {
		const linear = read("agents/ein-linear.md");
		expect(linear).toContain("Team mode only");
	});

	test("AGENTS.md: la sección Linear es Team-mode only", () => {
		const agents = read("AGENTS.md");
		expect(agents).toMatch(/Linear \(Team mode only\)|Team mode/);
	});
});
