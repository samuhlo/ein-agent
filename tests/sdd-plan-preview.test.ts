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
	"Production files: `shared/types/planning.types.ts`, `app/stores/planning.ts`\nTest files: `tests/stores/planning.test.ts`",
	"- [ ] 1.1 hacer\n  - verify: `RED: bunx vitest run tests/stores/planning.test.ts`; `GREEN: bunx vitest run tests/stores/planning.test.ts`",
	"## // 002. Guards de API",
	"Production files: `server/api/cursos/index.post.ts`\nTest files: `tests/server/api/cursos.test.ts`",
	"- [ ] 2.1 hacer\n  - verify: `GREEN: bunx vitest run tests/server/api/cursos.test.ts`",
].join("\n");

describe("resolveSddPlanPreview", () => {
	test("uses edit/verify fields, never read paths, skill names or examples in prose", () => {
		mkTasks("precise", [
			"## // 001. Exact frontier",
			"- [ ] 1.1 Deliver",
			"  - skills: `Bun test`",
			"  - read: `EIN.md`, `src/reference.ts`",
			"  - avoid: Never edit forbidden.ts or run bun test imaginary.test.ts",
			"  - edit: `src/result.ts` | modify | preserve `src/reference.ts`",
			"  - edit: `tests/result.test.ts` | modify | assert behavior",
			"  - edit: `config.json` | modify | retain other values",
			"  - verify: `bun run test`; `bun run typecheck`",
			"  - verify: `npm run lint -- --quiet`",
		].join("\n"));
		expect(resolveSddPlanPreview(DIR, "precise").groups[0]).toEqual({
			title: "// 001. Exact frontier", files: ["src/result.ts", "config.json"],
			testFiles: ["tests/result.test.ts"], verify: "`bun run test`; `bun run typecheck`; `npm run lint -- --quiet`",
		});
	});

	test("unlabelled legacy prose is not promoted to an exact write frontier", () => {
		mkTasks("legacy", "## Old group\n- [ ] 1.1 Legacy task\nMaybe edit source.ts; read EIN.md. Bun test is the runner.\n");
		const preview = resolveSddPlanPreview(DIR, "legacy");
		expect(preview.groups[0].files).toEqual([]);
		expect(preview.groups[0].verify).toBeNull();
		expect(formatSddPlanPreview(preview)).toContain("sin rutas de producción declaradas");
	});

	test("empty verify fields do not consume the following line; CRLF and duplicate fields are preserved", () => {
		mkTasks("commands", "## Group\r\n- [ ] 1.1 Run checks\r\n  - verify:\r\n  - skills: Bun test\r\n  - verify: `npm run test -- --run`\r\n  - verify: `npm run test -- --run`\r\n");
		expect(resolveSddPlanPreview(DIR, "commands").groups[0].verify).toBe("`npm run test -- --run`");
	});

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
			"Production files: `runtime/agents/ein-scout.md`, `runtime/assets/orchestrator.md`",
			"Declara el delta en openspec/changes/feat-md/specs/scout-routing/spec.md y actualiza design.md y tasks.md.",
			"- [ ] 1.1 hacer\n  - verify: `bunx vitest run tests/orchestrator-scope-gate.test.ts`",
		].join("\n");
		mkTasks("feat-md", body);
		const files = resolveSddPlanPreview(DIR, "feat-md").groups[0].files;
		expect(files).toContain("runtime/agents/ein-scout.md");
		expect(files).toContain("runtime/assets/orchestrator.md");
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
