// =============================================================================
// TESTS: guardrails SDD deterministas
// Design valida contrato de diseño; tasks valida el checklist ejecutable.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintChange, lintDesignArtifact, lintPhaseArtifact, lintTasksArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

let DIR: string;

function change(name: string): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	return p;
}

function put(changePath: string, file: string, body = "x"): void {
	writeFileSync(join(changePath, file), body);
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-guardrails-"));
});

afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

const GOOD = `# design.md

## A. Proposal
- **Intent:** add X.
- **Scope:** only Y.

## B. Spec
- The system MUST do Z.

## C. Decisions
- Keep design separate from execution.

## D. Success Criteria
- Focused tests pass.
`;

const GOOD_TASKS = `# Tasks — feat-x

status: ready
blocked_by: none

## // 001. Implementar

- [ ] 1.1 Implement Z in foo.ts
  - skills: \`comment-style\`
  - why: Required by the spec.
  - learn: Small tasks are easier to verify.
  - architecture: tasks.md owns execution state.
  - avoid: Do not duplicate the whole design here.
  - verify: \`bun test tests/foo.test.ts\`
`;

describe("lintDesignArtifact", () => {
	test("un design completo pasa sin issues", () => {
		const r = lintDesignArtifact(GOOD);
		expect(r.ok).toBe(true);
		expect(r.errors).toBe(0);
		expect(r.warnings).toBe(0);
	});

	test("vacio => error", () => {
		const r = lintDesignArtifact("   ");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "empty")).toBe(true);
	});

	test("falta una seccion obligatoria => error", () => {
		const noSpec = GOOD.replace("## B. Spec", "## B. Otra cosa");
		const r = lintDesignArtifact(noSpec);
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-spec")).toBe(true);
	});

	test("design sin tareas accionables sigue siendo valido", () => {
		const noTasks = GOOD.replace(/- \[ \].*\n/g, "");
		const r = lintDesignArtifact(noTasks);
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code === "no-tasks")).toBe(false);
	});

	test("planificacion de delivery prohibida => warning (no bloquea)", () => {
		const withForecast = `${GOOD}\n## Review Workload Forecast\nchained PRs recommended.\n`;
		const r = lintDesignArtifact(withForecast);
		expect(r.ok).toBe(true); // warnings no rompen el ok
		expect(r.issues.some((i) => i.code === "forbidden-forecast")).toBe(true);
		expect(r.issues.some((i) => i.code === "forbidden-chained-pr")).toBe(true);
	});

	test("placeholders sin rellenar => warning", () => {
		const withPlaceholder = GOOD.replace("add X.", "add <number> things in {change}.");
		const r = lintDesignArtifact(withPlaceholder);
		expect(r.issues.some((i) => i.code === "placeholder-angle-number")).toBe(true);
		expect(r.issues.some((i) => i.code === "placeholder-change-token")).toBe(true);
	});

	test("oversize => warning con umbral configurable", () => {
		const big = `${GOOD}\n${"linea\n".repeat(50)}`;
		const r = lintDesignArtifact(big, { oversizeLineThreshold: 20 });
		expect(r.issues.some((i) => i.code === "oversize")).toBe(true);
		expect(r.lineCount).toBeGreaterThan(20);
	});
});

describe("lintTasksArtifact", () => {
	test("tasks valido pasa", () => {
		const r = lintTasksArtifact(GOOD_TASKS);
		expect(r.ok).toBe(true);
		expect(r.errors).toBe(0);
	});

	test("tasks sin status falla", () => {
		const r = lintTasksArtifact(GOOD_TASKS.replace("status: ready\n", ""));
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});

	test("tasks sin checkbox falla", () => {
		const r = lintTasksArtifact(GOOD_TASKS.replace("- [ ]", "-"));
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-checkbox")).toBe(true);
	});

	test("tasks 100% completado (todo `- [x]`) PASA — el apply marca checkboxes", () => {
		// Regresión real (progreso-anexos-rail): el apply marcó 43/43 como [x]
		// y el gate reventaba con missing-checkbox, empujando a des-marcar
		// trabajo terminado. Un artefacto completado es válido.
		const done = GOOD_TASKS.replaceAll("- [ ]", "- [x]");
		const r = lintTasksArtifact(done);
		expect(r.issues.some((i) => i.code === "missing-checkbox")).toBe(false);
		expect(r.ok).toBe(true);
	});
});

describe("lintPhaseArtifact required signals", () => {
	test("scope requiere scope y budget_allocated", () => {
		const r = lintPhaseArtifact("scope", "scope: solo x\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-budget-allocated")).toBe(true);
	});

	test("map requiere ledger, budget_consumed y scope_status", () => {
		const r = lintPhaseArtifact("map", "ledger: ok\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-budget-consumed")).toBe(true);
		expect(r.issues.some((i) => i.code === "missing-scope-status")).toBe(true);
	});
});

describe("lintChange sequence consistency", () => {
	test("detecta hueco design presente pero tasks ausente", () => {
		const c = change("feat-x");
		put(c, "scope.md", "scope: x\nbudget_allocated: 10\n");
		put(c, "map.md", "ledger: ok\nbudget_consumed: 2\nscope_status: ok\n");
		put(c, "design.md", GOOD);

		const r = lintChange(DIR, "feat-x");
		expect(r.warnings).toBeGreaterThan(0);
		expect(r.issues.some((i) => i.code === "sequence-design-without-tasks")).toBe(true);
	});

	test("detecta salto de secuencia si apply existe sin tasks", () => {
		const c = change("feat-x");
		put(c, "scope.md", "scope: x\nbudget_allocated: 10\n");
		put(c, "apply-progress.md", "status: complete\n");

		const r = lintChange(DIR, "feat-x");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "sequence-tasks-missing-before-apply")).toBe(true);
	});
});
