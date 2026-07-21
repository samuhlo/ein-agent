// =============================================================================
// TESTS: sdd-close (mover determinista) + lint por fase
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeChange } from "../ein-pi/agent/lib/sdd-close";
import { approveCandidate } from "../ein-pi/agent/lib/memory-contract.ts";
import {
	appendMemoryReceipt,
	buildCloseMemoryCandidate,
	hasSuccessfulMemoryReceipt,
} from "../ein-pi/agent/lib/sdd-memory-save.ts";
import { lintChange, lintPhaseArtifact, oversizedGroupWarnings } from "../ein-pi/agent/lib/sdd-guardrails";
import { synchronizeOpenSpecFilesystem } from "../ein-pi/agent/lib/openspec-spec-sync-fs.ts";

let DIR: string;
function mkChange(name: string, files: Record<string, string>): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	for (const [f, body] of Object.entries(files)) writeFileSync(join(p, f), body);
	return p;
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-close-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("closeChange", () => {
	test("mueve el cambio a storage interno y conserva summary.md", () => {
		mkChange("feat-x", { "summary.md": "# Resumen\nqué cambió", "scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture" });
		const r = closeChange(DIR, "feat-x", { force: true });
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "feat-x"))).toBe(false);
		const closed = join(DIR, "openspec", "changes", "archive", "feat-x");
		expect(existsSync(join(closed, "summary.md"))).toBe(true);
		expect(readFileSync(join(closed, "summary.md"), "utf8")).toContain("qué cambió");
	});

	test("no pisa si ya existe en storage interno (idempotente-safe)", () => {
		mkChange("feat-x", { "summary.md": "v1", "scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture" });
		expect(closeChange(DIR, "feat-x", { force: true }).ok).toBe(true);
		mkChange("feat-x", { "summary.md": "v2" });
		const r2 = closeChange(DIR, "feat-x", { force: true });
		expect(r2.ok).toBe(false);
		expect(r2.reason).toContain("archive");
	});

	test("nombre inválido se rechaza", () => {
		expect(closeChange(DIR, "../escape").ok).toBe(false);
		expect(closeChange(DIR, "archive").ok).toBe(false);
	});

	// Fase 2: el cierre no archiva sobre evidencia incompleta u obsoleta.
	const READY_FILES = {
		"scope.md": "scope: x\nbudget_allocated: 1\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: mechanical close readiness fixture",
		"map.md": "m",
		"design.md": "d",
		"tasks.md": "status: ready\nblocked_by: none\n- [x] hecho\n",
		"apply-progress.md": "status: complete\n",
		"verify-report.md": "status: pass\nbehavior_coverage: verified\n",
		"summary.md": "# Resumen\ncierre",
	};

	function setMtime(change: string, file: string, ms: number): void {
		const p = join(DIR, "openspec", "changes", change, file);
		utimesSync(p, new Date(ms), new Date(ms));
	}

	// apply < verify < summary → todo fresco (orden natural del flujo).
	function makeFresh(change: string): void {
		mkChange(change, READY_FILES);
		setMtime(change, "apply-progress.md", 1_000_000);
		setMtime(change, "verify-report.md", 2_000_000);
		setMtime(change, "summary.md", 3_000_000);
	}

	test("cambio completo, verificado y fresco → cierra SIN force", () => {
		makeFresh("feat-ready");
		const r = closeChange(DIR, "feat-ready");
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "archive", "feat-ready"))).toBe(true);
	});

	test("solo summary.md (sin verify/apply) → NO cierra", () => {
		mkChange("feat-bare", { "summary.md": "x", "scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture" });
		const r = closeChange(DIR, "feat-bare");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("verify");
		expect(existsSync(join(DIR, "openspec", "changes", "feat-bare"))).toBe(true);
	});

	test("verify obsoleto (apply tocado DESPUÉS de verify) → NO cierra", () => {
		makeFresh("feat-stale");
		// Una corrección posterior reescribe apply-progress: ahora es más nuevo.
		setMtime("feat-stale", "apply-progress.md", 4_000_000);
		const r = closeChange(DIR, "feat-stale");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("obsoleta");
	});

	// `unresolved` SÍ es forzable: es un problema de metadatos, y hacerlo
	// absoluto dejaba el cierre muerto (ver el describe del final). Lo que NO
	// se fuerza es `conflict`, que es una incoherencia real de contenido.
	test("--force NO archiva sobre specs en conflicto", async () => {
		const p = mkChange("feat-conflict", {
			"summary.md": "x",
			"scope.md": "# Scope\n\nscope: algo\nbudget_allocated: 1000\n",
		});
		const scenario = [
			"### Scenario: alpha",
			"title: Alpha",
			"requirement: The system MUST retain alpha",
			"Given: an input",
			"When: it runs",
			"Then: it succeeds",
		].join("\n");
		// El delta AÑADE un escenario que la spec vigente ya tiene → added-existing.
		mkdirSync(join(p, "specs", "sdd-lifecycle"), { recursive: true });
		writeFileSync(
			join(p, "specs", "sdd-lifecycle", "spec.md"),
			["# OpenSpec Delta", "format: openspec-delta/v1", "domain: sdd-lifecycle", "", "## ADDED", scenario, ""].join("\n"),
		);
		mkdirSync(join(DIR, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
		writeFileSync(
			join(DIR, "openspec", "specs", "sdd-lifecycle", "spec.md"),
			["# OpenSpec Specification", "format: openspec-spec/v1", "domain: sdd-lifecycle", "", scenario.replace("###", "##"), ""].join("\n"),
		);

		// El motor real detecta el conflicto y publica el informe: es la ruta que
		// recorre `ein_openspec_sync` en producción.
		const { plan } = await synchronizeOpenSpecFilesystem(DIR, "feat-conflict");
		expect(plan.state).toBe("conflict");

		const r = closeChange(DIR, "feat-conflict", { force: true });
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("conflict");
	});

	test("cierra cambios en la raíz legacy .sdd/changes/", () => {
		const p = join(DIR, ".sdd", "changes", "fix-legacy");
		mkdirSync(p, { recursive: true });
		writeFileSync(join(p, "summary.md"), "# Resumen legacy");
		const r = closeChange(DIR, "fix-legacy", { force: true });
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, ".sdd", "changes", "archive", "fix-legacy", "summary.md"))).toBe(true);
	});

	test("el receipt de close vive tras el archive y evita otro fallback del mismo digest", () => {
		mkChange("feat-x", { "summary.md": "# Resumen\ncierre verificado", "scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture" });
		const r = closeChange(DIR, "feat-x", { force: true });
		expect(r.ok).toBe(true);
		const approved = approveCandidate(buildCloseMemoryCandidate("feat-x")).approved!;
		appendMemoryReceipt(r.to, {
			status: "saved",
			reason: "acknowledged",
			key: "sdd:feat-x:close",
			topic: approved.topic,
			digest: approved.digest,
			bytes: 12,
			durationMs: 1,
			timestamp: "2026-07-14T00:00:00.000Z",
		});
		expect(hasSuccessfulMemoryReceipt(r.to, approved.topic, approved.digest)).toBe(true);
		appendMemoryReceipt(join(DIR, "missing"), {
			status: "failed",
			reason: "timeout",
			key: "sdd:feat-x:close",
			durationMs: 1500,
			timestamp: "2026-07-14T00:00:00.000Z",
		});
		expect(existsSync(join(r.to, "summary.md"))).toBe(true);
	});
});

describe("lintPhaseArtifact / lintChange", () => {
	test("verify SIN línea status → error (el router lo necesita)", () => {
		const r = lintPhaseArtifact("verify", "# Verify\ntodo bien\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});

	test("verify CON status: pass → ok", () => {
		expect(lintPhaseArtifact("verify", "status: pass\n").ok).toBe(true);
	});

	test("apply SIN línea status → error (falta signal obligatorio)", () => {
		const r = lintPhaseArtifact("apply", "completed tasks:\n- [x] foo\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});

	test("apply CON status: partial → ok (partial satisface formato)", () => {
		expect(lintPhaseArtifact("apply", "status: partial\ncompleted tasks:\n- [x] foo\n").ok).toBe(true);
	});

	test("apply CON status: complete → ok", () => {
		expect(lintPhaseArtifact("apply", "status: complete\ncompleted tasks:\n- [x] foo\n").ok).toBe(true);
	});

	test("apply CON status: blocked → ok (blocked satisface formato)", () => {
		expect(lintPhaseArtifact("apply", "status: blocked\nbloqueado por X\n").ok).toBe(true);
	});

	test("artefacto vacío → error", () => {
		expect(lintPhaseArtifact("apply", "   ").ok).toBe(false);
	});

	test("design delega en el check rico sin exigir checklist", () => {
		const r = lintPhaseArtifact("design", "## A. Proposal\nx\n## B. Spec\nMUST\n");
		expect(r.ok).toBe(true);
	});

	test("tasks delega en lint rico", () => {
		const r = lintPhaseArtifact("tasks", "status: ready\nblocked_by: none\n- [ ] do\n  - skills: `comment-style`\n  - why: x\n  - learn: y\n  - architecture: z\n  - avoid: n\n  - verify: `bun test`\n");
		expect(r.ok).toBe(true);
	});

	test("lintChange agrega las fases presentes", () => {
		mkChange("feat-x", {
			"scope.md": "scope: x\nbudget_allocated: 1",
			"verify-report.md": "no status here",
		});
		const r = lintChange(DIR, "feat-x");
		expect(r.phases.find((p) => p.phase === "scope")?.present).toBe(true);
		expect(r.phases.find((p) => p.phase === "design")?.present).toBe(false);
		expect(r.ok).toBe(false); // verify sin status line
	});
});

// F: grupos sobredimensionados en tasks.md (demasiados ficheros de producción
// por grupo → apply se va de turnos, sobre todo con TDD estricto).
describe("oversizedGroupWarnings (F)", () => {
	test("un grupo con >4 ficheros de producción → warning; los tests no cuentan", () => {
		const tasks = [
			"## // 001. Grupo gordo",
			"File boundary: app/a.ts, app/b.ts, app/c.vue, app/d.ts, app/e.ts and tests/a.test.ts.",
			"- [ ] 1.1 hacer\n  - verify: `bunx vitest run tests/a.test.ts tests/b.test.ts`",
		].join("\n");
		const w = oversizedGroupWarnings(tasks);
		expect(w.length).toBe(1);
		expect(w[0].code).toBe("oversized-group");
		expect(w[0].message).toContain("5 ficheros");
	});

	test("un grupo acotado (≤4 producción) no avisa", () => {
		const tasks = [
			"## // 001. Grupo acotado",
			"File boundary: app/a.ts, app/b.ts and tests/a.test.ts, tests/b.test.ts.",
			"- [ ] 1.1 hacer\n  - verify: `bunx vitest run tests/a.test.ts`",
		].join("\n");
		expect(oversizedGroupWarnings(tasks).length).toBe(0);
	});

	test("lintTasksArtifact incluye el warning de grupo sobredimensionado", () => {
		const tasks = [
			"status: ready",
			"blocked_by: none",
			"## // 001. Gordo",
			"File boundary: app/a.ts, app/b.ts, app/c.ts, app/d.ts, app/e.ts, app/f.ts.",
			"- [ ] 1.1 x\n  - skills: `x`\n  - why: a\n  - learn: b\n  - architecture: c\n  - avoid: d\n  - verify: `bun test`",
		].join("\n");
		const r = lintPhaseArtifact("tasks", tasks);
		expect(r.issues.some((i) => i.code === "oversized-group")).toBe(true);
	});
});

// #4: verify no puede firmar PASS "limpio" solo con build/tipos verdes. Un PASS
// sin comportamiento confirmado se surface como warning (nunca bloquea el
// routing), y verify debe declarar `behavior_coverage`.
describe("verify behavior_coverage (#4)", () => {
	test("PASS sin behavior_coverage → warning undeclared, pero ok (no bloquea)", () => {
		const r = lintPhaseArtifact("verify", "status: pass\n");
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code === "behavior-coverage-undeclared")).toBe(true);
	});

	test("PASS + behavior_coverage: none → warning none (luz verde estructural)", () => {
		const r = lintPhaseArtifact("verify", "status: pass\nbehavior_coverage: none\n");
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code === "behavior-coverage-none")).toBe(true);
	});

	test("PASS + behavior_coverage: verified → sin warning de cobertura", () => {
		const r = lintPhaseArtifact("verify", "status: pass\nbehavior_coverage: verified\n");
		expect(r.issues.some((i) => i.code.startsWith("behavior-coverage"))).toBe(false);
	});

	test("PASS + behavior_coverage: n-a → sin warning (cambio no conductual)", () => {
		const r = lintPhaseArtifact("verify", "status: pass\nbehavior_coverage: n-a\n");
		expect(r.issues.some((i) => i.code.startsWith("behavior-coverage"))).toBe(false);
	});

	test("PASS + behavior_coverage: partial → warning partial", () => {
		const r = lintPhaseArtifact("verify", "status: pass\nbehavior_coverage: partial\n");
		expect(r.issues.some((i) => i.code === "behavior-coverage-partial")).toBe(true);
	});

	test("FAIL sin cobertura → NO warning de cobertura (solo aplica a PASS)", () => {
		const r = lintPhaseArtifact("verify", "status: fail\n");
		expect(r.issues.some((i) => i.code.startsWith("behavior-coverage"))).toBe(false);
	});
});

// =============================================================================
// Semántica de --force frente al estado de specs OpenSpec.
//
// BLINDAJE -> En su primera versión el blocker de specs se evaluaba ANTES del
// check de force, así que era ABSOLUTO. Eso dejó el cierre MUERTO: todo cambio
// anterior a la feature —y todo cambio cuyo ejecutor de scope no escribiera el
// bloque— no podía archivarse por ninguna vía. La suite no lo detectó porque
// los fixtures se editaron para incluir el bloque; estos tests lo comprueban
// SIN esa muleta, que es como llegan los cambios reales.
// =============================================================================
describe("closeChange — estado de specs y --force", () => {
	// Cambio íntegro tal y como lo produce el flujo: sin bloque de declaración.
	function completoSinDeclaracion(name: string) {
		return mkChange(name, {
			"scope.md": "# Scope\n\nscope: algo\nbudget_allocated: 1000\n",
			"map.md": "# Map\n\nledger: x\nbudget_consumed: 10\nscope_status: ok\n",
			"design.md": "# Design\n",
			"tasks.md": "# Tasks\n\n- [x] 1.1 hecho\n",
			"apply-progress.md": "# Apply\n\nstatus: complete\n",
			"verify-report.md": "# Verify\n\nstatus: pass\nbehavior_coverage: verified\n",
			"summary.md": "# Summary\n",
		});
	}

	test("sin declaración NO cierra por defecto, pero dice cómo salir", () => {
		completoSinDeclaracion("heredado");
		const r = closeChange(DIR, "heredado");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("unresolved");
		// El mensaje debe ofrecer una salida: un gate sin salida es un callejón.
		expect(r.reason).toContain("--force");
	});

	test("sin declaración SÍ cierra con --force (el cierre no queda muerto)", () => {
		completoSinDeclaracion("heredado");
		const r = closeChange(DIR, "heredado", { force: true });
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "archive", "heredado"))).toBe(true);
	});

	test("un cambio con declaración válida cierra sin necesitar force", () => {
		const p = completoSinDeclaracion("declarado");
		writeFileSync(
			join(p, "scope.md"),
			"# Scope\n\nscope: algo\nbudget_allocated: 1000\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: cambio mecánico sin comportamiento observable nuevo\n",
		);
		expect(closeChange(DIR, "declarado").ok).toBe(true);
	});

	test("una razón de relleno NO vale como declaración", () => {
		const p = completoSinDeclaracion("relleno");
		writeFileSync(
			join(p, "scope.md"),
			"# Scope\n\nscope: algo\nbudget_allocated: 1000\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: tbd\n",
		);
		expect(closeChange(DIR, "relleno").ok).toBe(false);
	});
});

// El nombre de un cambio es un SEGMENTO, nunca una ruta. La validación es
// COMPARTIDA con la sincronización OpenSpec (isSafeChangeName): estaban
// duplicadas —y una de las dos ni existía—, y esa divergencia fue el agujero.
describe("closeChange — nombres de cambio inseguros", () => {
	test("rechaza rutas, `..`, vacío y el storage reservado", () => {
		for (const malo of ["", "..", "a/b", "a\\b", "archive", "../../fuera"]) {
			const r = closeChange(DIR, malo, { force: true });
			expect(r.ok, `debería rechazar ${JSON.stringify(malo)}`).toBe(false);
			expect(r.reason).toContain("inválido");
		}
	});

	test("el vacío no apunta al directorio de cambios entero", () => {
		mkChange("vivo", { "summary.md": "x" });
		expect(closeChange(DIR, "", { force: true }).ok).toBe(false);
		// El cambio real sigue donde estaba: nada se movió en bloque.
		expect(existsSync(join(DIR, "openspec", "changes", "vivo"))).toBe(true);
	});
});
