// =============================================================================
// TESTS: preview determinista del plan de apply (para el brief docente pre-apply)
// Extrae de tasks.md, por grupo, los ficheros de PRODUCCIÓN y un verify — para
// que "qué se toca" sean hechos, no la paráfrasis del modelo.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatSddPlanPreview, resolveSddPlanPreview } from "../ein-pi/agent/lib/sdd-router";

let DIR: string;
function mkTasks(change: string, body: string): void {
	const p = join(DIR, "openspec", "changes", change);
	mkdirSync(p, { recursive: true });
	writeFileSync(join(p, "tasks.md"), body);
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-plan-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

const TASKS = [
	"status: ready",
	"blocked_by: none",
	"## // 001. Contrato de snapshot",
	"File boundary: shared/types/planning.types.ts, app/stores/planning.ts and tests/stores/planning.test.ts.",
	"- [ ] 1.1 hacer\n  - verify: `RED: bunx vitest run tests/stores/planning.test.ts`; `GREEN: bunx vitest run tests/stores/planning.test.ts`",
	"## // 002. Guards de API",
	"File boundary: server/api/cursos/index.post.ts and tests/server/api/cursos.test.ts.",
	"- [ ] 2.1 hacer\n  - verify: `GREEN: bunx vitest run tests/server/api/cursos.test.ts`",
].join("\n");

describe("resolveSddPlanPreview", () => {
	test("extrae grupos con ficheros de producción (sin tests) y verify", () => {
		mkTasks("feat-x", TASKS);
		const preview = resolveSddPlanPreview(DIR, "feat-x");
		expect(preview.change).toBe("feat-x");
		expect(preview.groups).toHaveLength(2);
		expect(preview.groups[0].title).toContain("001. Contrato de snapshot");
		expect(preview.groups[0].files).toEqual(["shared/types/planning.types.ts", "app/stores/planning.ts"]);
		expect(preview.groups[0].files).not.toContain("tests/stores/planning.test.ts");
		expect(preview.groups[0].verify).toContain("bunx vitest run");
		expect(preview.groups[1].files).toEqual(["server/api/cursos/index.post.ts"]);
	});

	test("sin tasks.md → sin grupos, no explota", () => {
		mkdirSync(join(DIR, "openspec", "changes", "vacio"), { recursive: true });
		expect(resolveSddPlanPreview(DIR, "vacio").groups).toEqual([]);
	});

	// P1-C: los CONTRATOS markdown (prompts de agentes, orchestrator) SON
	// producción — un cambio que solo los toca ya no debe mentir con "sin
	// ficheros de producción". Pero los artefactos de proceso SDD y los deltas
	// de openspec/ NO cuentan (los gestiona el sync / la tool de deltas).
	test("cuenta contratos .md como producción, no los artefactos SDD ni deltas openspec/", () => {
		const body = [
			"status: ready",
			"blocked_by: none",
			"## // 001. Contrato del scout",
			"Edita ein-pi/core/agents/ein-scout.md y ein-pi/agent/assets/orchestrator.md.",
			"Declara el delta en openspec/changes/feat-md/specs/scout-routing/spec.md y actualiza design.md y tasks.md.",
			"- [ ] 1.1 hacer\n  - verify: `bunx vitest run tests/orchestrator-scope-gate.test.ts`",
		].join("\n");
		mkTasks("feat-md", body);
		const files = resolveSddPlanPreview(DIR, "feat-md").groups[0].files;
		expect(files).toContain("ein-pi/core/agents/ein-scout.md");
		expect(files).toContain("ein-pi/agent/assets/orchestrator.md");
		expect(files).not.toContain("design.md");
		expect(files).not.toContain("tasks.md");
		expect(files).not.toContain("openspec/changes/feat-md/specs/scout-routing/spec.md");
		expect(files.some((f) => f.endsWith(".test.ts"))).toBe(false);
	});
});

describe("formatSddPlanPreview", () => {
	test("bloque compacto con grupos, ficheros y verify", () => {
		mkTasks("feat-x", TASKS);
		const block = formatSddPlanPreview(resolveSddPlanPreview(DIR, "feat-x"));
		expect(block).toContain("plan de apply: 2 grupo(s)");
		expect(block).toContain("toca: shared/types/planning.types.ts, app/stores/planning.ts");
		expect(block).toContain("verify: ");
	});

	test("preview vacío → cadena vacía (no ensucia)", () => {
		expect(formatSddPlanPreview({ change: "x", groups: [] })).toBe("");
	});
});
