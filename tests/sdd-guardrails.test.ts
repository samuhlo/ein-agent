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

	// Una seccion ausente se REPORTA pero no bloquea: bloquear por la forma de un
	// documento mandaba el arreglo al ciclo tasks -> apply -> verify.
	test("falta una seccion => warning, no bloquea", () => {
		const noSpec = GOOD.replace("## B. Spec", "## B. Otra cosa");
		const r = lintDesignArtifact(noSpec);
		expect(r.ok).toBe(true);
		const issue = r.issues.find((i) => i.code === "missing-spec");
		expect(issue?.level).toBe("warning");
	});

	test("design sin tareas accionables sigue siendo valido", () => {
		const noTasks = GOOD.replace(/- \[ \].*\n/g, "");
		const r = lintDesignArtifact(noTasks);
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code === "no-tasks")).toBe(false);
	});

	// RETIRADO: el lint ya no vigila QUE dice el design. Mencionar delivery o
	// chained PRs es asunto del revisor, no del gatekeeper determinista.
	test("mencionar delivery en el design ya no genera issue", () => {
		const withForecast = `${GOOD}\n## Review Workload Forecast\nchained PRs recommended.\n`;
		const r = lintDesignArtifact(withForecast);
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code.startsWith("forbidden-"))).toBe(false);
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

	// `status`/`blocked_by` son señales de planificacion: ninguna herramienta las
	// consume. Se reportan como warning y no bloquean la fase.
	test("tasks sin status => warning, no bloquea", () => {
		const r = lintTasksArtifact(GOOD_TASKS.replace("status: ready\n", ""));
		expect(r.ok).toBe(true);
		expect(r.issues.find((i) => i.code === "missing-status-line")?.level).toBe("warning");
	});

	// Las secciones de prosa (skills/why/learn/architecture/avoid) dejaron de ser
	// obligatorias: nadie las lee aguas abajo y su ausencia bloqueaba la fase.
	test("tasks sin secciones de prosa sigue siendo valido", () => {
		let t = GOOD_TASKS;
		for (const k of ["skills", "why", "learn", "architecture", "avoid"]) {
			t = t.replace(new RegExp(`^\\s*-\\s*${k}\\s*:.*$`, "im"), "");
		}
		const r = lintTasksArtifact(t);
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code.startsWith("missing-skills"))).toBe(false);
	});

	// Lo que SI sigue siendo obligatorio: `verify` (el comando que se ejecuta).
	test("tasks sin verify falla — es el comando que corre la fase de verify", () => {
		const r = lintTasksArtifact(GOOD_TASKS.replace(/^\s*-\s*verify\s*:.*$/im, ""));
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-verify")).toBe(true);
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
	// La telemetria del ledger de coste (`budget_allocated`, `ledger`,
	// `budget_consumed`) dejo de ser obligatoria: el ledger se borro en 3a2ec6b y
	// exigir sus campos bloqueaba fases por no declarar cifras que nadie consume.
	test("scope ya no exige budget_allocated", () => {
		const r = lintPhaseArtifact("scope", "scope: solo x\n");
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code === "missing-budget-allocated")).toBe(false);
	});

	test("map solo exige scope_status", () => {
		const r = lintPhaseArtifact("map", "ledger: ok\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-budget-consumed")).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-scope-status")).toBe(true);
	});

	// Lo que SI sigue bloqueando: las lineas de estado que lee el router
	// determinista para decidir la siguiente fase.
	test("verify sin `status: pass|fail` sigue siendo error — lo lee el router", () => {
		const r = lintPhaseArtifact("verify", "todo bien, la suite pasa\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});

	test("apply sin `status: complete|partial|blocked` sigue siendo error", () => {
		const r = lintPhaseArtifact("apply", "hecho\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});
});

describe("OpenSpec spec delta declaration", () => {
	test("exige exactamente una declaración none válida o deltas válidos", () => {
		const c = change("feat-spec");
		put(c, "scope.md", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: mechanical formatting only\n");
		expect(lintChange(DIR, "feat-spec").issues.some((i) => i.code === "spec-delta-unresolved")).toBe(false);
		mkdirSync(join(c, "specs", "sdd-lifecycle"), { recursive: true });
		put(c, "specs/sdd-lifecycle/spec.md", "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: sdd-lifecycle\n\n## ADDED\n### Scenario: close\ntitle: Close\nrequirement: The system MUST close\nGiven: ready\nWhen: close\nThen: archived\n");
		expect(lintChange(DIR, "feat-spec").issues.some((i) => i.code === "spec-delta-unresolved")).toBe(true);
	});

	test("preserva .sdd sin declaración OpenSpec", () => {
		const c = join(DIR, ".sdd", "changes", "legacy");
		mkdirSync(c, { recursive: true });
		put(c, "scope.md", "scope: x\nbudget_allocated: 1\n");
		expect(lintChange(DIR, "legacy").issues.some((i) => i.code === "spec-delta-unresolved")).toBe(false);
	});
});

describe("canonical base spec preflight (P0-B)", () => {
	// El sync de close mergea el delta DENTRO del spec canónico base y lo parsea;
	// un base heredado sin cabeceras reventaba con invalid-format en la última
	// fase. El guard lo adelanta a lintChange (visible ya en scope).
	const VALID_BASE =
		"# OpenSpec Specification\nformat: openspec-spec/v1\ndomain: scout-routing\n\n## Scenario: route\ntitle: Route\nrequirement: The system MUST route\nGiven: a request\nWhen: routed\nThen: handled\n";
	const DELTA =
		"# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: scout-routing\n\n## ADDED\n### Scenario: bound\ntitle: Bound\nrequirement: The system MUST bound\nGiven: a packet\nWhen: routed\nThen: bounded\n";

	function putBase(domain: string, body: string): void {
		const dir = join(DIR, "openspec", "specs", domain);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "spec.md"), body);
	}

	function withDelta(name: string, domain: string): string {
		const c = change(name);
		put(c, "scope.md", "scope: x\nbudget_allocated: 10\n");
		mkdirSync(join(c, "specs", domain), { recursive: true });
		put(c, `specs/${domain}/spec.md`, DELTA);
		return c;
	}

	test("marca base canónico heredado que no parsea antes de close", () => {
		withDelta("feat-route", "scout-routing");
		// Base sin la línea `format:` — el bug real que salió en sync.
		putBase("scout-routing", "# OpenSpec Specification\ndomain: scout-routing\n\n## Scenario: route\ntitle: Route\nrequirement: The system MUST route\nGiven: a request\nWhen: routed\nThen: handled\n");
		const r = lintChange(DIR, "feat-route");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "canonical-base-invalid")).toBe(true);
	});

	test("no marca cuando el base canónico parsea", () => {
		withDelta("feat-route", "scout-routing");
		putBase("scout-routing", VALID_BASE);
		expect(lintChange(DIR, "feat-route").issues.some((i) => i.code === "canonical-base-invalid")).toBe(false);
	});

	test("no marca dominio nuevo sin base (sync lo crea)", () => {
		withDelta("feat-route", "scout-routing");
		// Sin putBase: no existe openspec/specs/scout-routing/spec.md todavía.
		expect(lintChange(DIR, "feat-route").issues.some((i) => i.code === "canonical-base-invalid")).toBe(false);
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
