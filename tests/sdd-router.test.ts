// =============================================================================
// TESTS: sdd-router (estado SDD determinista)
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessCloseReadiness, listActiveChanges, resolveSddNext, resolveSddStatus } from "../ein-pi/agent/lib/sdd-router";
import { planOpenSpecSync, serializeSyncReport } from "../ein-pi/agent/lib/openspec-spec-sync";
import { serializeOpenSpec } from "../ein-pi/agent/lib/openspec-spec-contract";

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
	DIR = mkdtempSync(join(tmpdir(), "sdd-router-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("resolveSddStatus", () => {
	test("sin openspec → done, change null", () => {
		const s = resolveSddStatus(DIR);
		expect(s.change).toBeNull();
		expect(s.nextRecommended).toBe("done");
	});

	test("solo scope.md → siguiente map", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		const s = resolveSddStatus(DIR);
		expect(s.change).toBe("feat-x");
		expect(s.nextRecommended).toBe("map");
	});

	test("hasta design → siguiente tasks", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md"]) put(c, f);
		expect(resolveSddStatus(DIR).nextRecommended).toBe("tasks");
	});

	test("design con C. Tasks pero sin tasks.md → recomienda tasks", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md", "## A. Proposal\nx\n## B. Spec\ny\n## C. Tasks\n- [ ] legacy\n");
		expect(resolveSddStatus(DIR).nextRecommended).toBe("tasks");
	});

	test("hasta tasks → siguiente apply", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md"]) put(c, f);
		expect(resolveSddStatus(DIR).nextRecommended).toBe("apply");
	});

	test("parsea tasks.md de forma tolerante", () => {
		const c = change("feat-x");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [ ] 1.1 Build router\n- [x] 1.2 Ship tests\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.present).toBe(true);
		expect(s.tasks.status).toBe("ready");
		expect(s.tasks.counts).toEqual({ pending: 1, ready: 1, blocked: 0, done: 1 });
		expect(s.tasks.items[0]).toEqual({ id: "1.1", title: "Build router", done: false });
		expect(s.tasks.nextPending).toEqual({ id: "1.1", title: "Build router", done: false });
	});

	test("nextPending = primera tarea sin marcar, saltando las hechas (reanudación)", () => {
		const c = change("feat-x");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [x] 1 hecho\n- [x] 2 hecho\n- [ ] 3 pendiente\n- [ ] 4 pendiente\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.nextPending).toEqual({ id: "3", title: "pendiente", done: false });
	});

	test("todas las tareas hechas → nextPending null", () => {
		const c = change("feat-x");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [x] 1 hecho\n- [x] 2 hecho\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.nextPending).toBeNull();
	});

	test("tasks.md bloqueado alimenta contadores y blockers", () => {
		const c = change("feat-x");
		put(c, "tasks.md", "status: blocked\nblocked_by: decision missing\n- [ ] 1.1 Build router\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.counts.blocked).toBe(1);
		expect(s.blocked).toContain("tasks.md bloqueado por: decision missing");
	});

	test("scope, map y design tratan tasks.md ausente como trabajo futuro", () => {
		const c = change("feat-x");
		for (const files of [[], ["scope.md"], ["scope.md", "map.md"]]) {
			for (const file of files) put(c, file);
			const status = resolveSddStatus(DIR, "feat-x");
			expect(status.tasks.problems).not.toContain("tasks.md ausente.");
		}
	});

	test("tasks.md ausente sigue siendo accionable al llegar a tasks", () => {
		const c = change("feat-x");
		for (const file of ["scope.md", "map.md", "design.md"]) put(c, file);
		const next = resolveSddNext(DIR, "feat-x");
		expect(next.nextRecommended).toBe("tasks");
		expect(next.blocked).toContain("tasks.md ausente.");
	});

	test("parsea budget parcial desde scope y map", () => {
		const c = change("feat-x");
		put(c, "scope.md", "scope: x\nbudget_allocated: 12 reads\n");
		put(c, "map.md", "ledger: ok\nbudget_consumed: 5 reads\nscope_status: ok\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.budget.allocated).toBe("12 reads");
		expect(s.budget.consumed).toBe("5 reads");
		expect(s.budget.allocatedValue).toBe(12);
		expect(s.budget.consumedValue).toBe(5);
	});

	test("devuelve fase actual y artefactos presentes/faltantes", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.currentPhase).toBe("design");
		expect(s.artifacts.present.map((artifact) => artifact.phase)).toContain("scope");
		expect(s.artifacts.missing.map((artifact) => artifact.phase)).toContain("tasks");
	});

	test("apply-progress.md sin status → siguiente apply (partial, no advance)", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f);
		const s = resolveSddStatus(DIR);
		expect(s.apply).toBe("partial");
		expect(s.nextRecommended).toBe("apply");
	});

	test("apply-progress.md con status: partial → siguiente apply", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f, "status: partial\n");
		const s = resolveSddStatus(DIR);
		expect(s.apply).toBe("partial");
		expect(s.nextRecommended).toBe("apply");
	});

	test("apply-progress.md con status: blocked → siguiente apply + blocked", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f, "status: blocked\n");
		const s = resolveSddStatus(DIR);
		expect(s.apply).toBe("blocked");
		expect(s.nextRecommended).toBe("apply");
		expect(s.blocked.length).toBeGreaterThan(0);
	});

	test("apply-progress.md con status: complete → siguiente verify", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f, "status: complete\n");
		const s = resolveSddStatus(DIR);
		expect(s.apply).toBe("complete");
		expect(s.nextRecommended).toBe("verify");
	});

	test("verify pass (con apply completo) → siguiente close", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f, "status: complete\n");
		put(c, "verify-report.md", "# Verify\nstatus: pass\n");
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("pass");
		expect(s.nextRecommended).toBe("close");
		expect(s.verifyStale).toBe(false);
	});

	test("verify pass pero apply tocado DESPUÉS → verifyStale, vuelve a verify", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md"]) put(c, f, "status: complete\n");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "# Verify\nstatus: pass\n");
		// Corrección posterior: apply-progress reescrito, ahora más nuevo que verify.
		utimesSync(join(c, "verify-report.md"), new Date(2_000_000), new Date(2_000_000));
		utimesSync(join(c, "apply-progress.md"), new Date(3_000_000), new Date(3_000_000));
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("pass");
		expect(s.verifyStale).toBe(true);
		expect(s.nextRecommended).toBe("verify");
		expect(s.blocked.join(" ")).toContain("obsoleta");
	});

	// P2-F: la staleness se basa en la SUPERFICIE ENTREGADA (producción + tests
	// de tasks.md), no en que el apply reescribiera apply-progress.md. Una
	// normalización post-verify (cabecera de spec bajo openspec/, docs) reescribe
	// apply-progress.md pero no toca código ni tests → no debe forzar re-verify.
	test("normalización post-verify (apply nuevo, fichero entregado intacto) → NO verifyStale", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md"]) put(c, f, "x\n");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n## // 001. G\nEdita app/foo.ts.\n- [ ] 1.1 hacer\n");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "# Verify\nstatus: pass\n");
		mkdirSync(join(DIR, "app"), { recursive: true });
		writeFileSync(join(DIR, "app", "foo.ts"), "export const x = 1;\n");
		// El fichero entregado es ANTERIOR a verify; apply-progress se reescribió DESPUÉS
		// (normalización), pero sin tocar app/foo.ts.
		utimesSync(join(DIR, "app", "foo.ts"), new Date(2_000_000), new Date(2_000_000));
		utimesSync(join(c, "verify-report.md"), new Date(3_000_000), new Date(3_000_000));
		utimesSync(join(c, "apply-progress.md"), new Date(4_000_000), new Date(4_000_000));
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("pass");
		expect(s.verifyStale).toBe(false);
		expect(s.nextRecommended).toBe("close");
	});

	test("cambio real post-verify (fichero entregado tocado DESPUÉS) → verifyStale", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md"]) put(c, f, "x\n");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n## // 001. G\nEdita app/foo.ts.\n- [ ] 1.1 hacer\n");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "# Verify\nstatus: pass\n");
		mkdirSync(join(DIR, "app"), { recursive: true });
		writeFileSync(join(DIR, "app", "foo.ts"), "export const x = 2;\n");
		utimesSync(join(c, "verify-report.md"), new Date(3_000_000), new Date(3_000_000));
		utimesSync(join(c, "apply-progress.md"), new Date(3_000_000), new Date(3_000_000));
		// El fichero entregado se editó DESPUÉS de verify → evidencia obsoleta.
		utimesSync(join(DIR, "app", "foo.ts"), new Date(5_000_000), new Date(5_000_000));
		const s = resolveSddStatus(DIR);
		expect(s.verifyStale).toBe(true);
		expect(s.nextRecommended).toBe("verify");
	});

	test("map.md sin scope.md → blocker de artefacto fuera de orden (fuga de fase-explorador)", () => {
		const c = change("cohesionar-x");
		put(c, "map.md", "# Map\nx\n");
		const s = resolveSddStatus(DIR, "cohesionar-x");
		expect(s.blocked.join(" ")).toContain("fuera de orden");
		expect(s.blocked.join(" ")).toContain("scope.md");
	});

	test("artefactos en orden (scope→map→design) → sin blocker de orden", () => {
		const c = change("ordenado");
		for (const f of ["scope.md", "map.md", "design.md"]) put(c, f, "x");
		const s = resolveSddStatus(DIR, "ordenado");
		expect(s.blocked.join(" ")).not.toContain("fuera de orden");
	});

	test("verify fail → vuelve a verify + blocked", () => {
		const c = change("feat-x");
		for (const f of ["scope.md", "map.md", "design.md", "tasks.md", "apply-progress.md"]) put(c, f, "status: complete\n");
		put(c, "verify-report.md", "# Verify\nstatus: fail\nCRITICAL: algo roto\n");
		const s = resolveSddStatus(DIR);
		expect(s.verify).toBe("fail");
		expect(s.nextRecommended).toBe("verify");
		expect(s.blocked.length).toBeGreaterThan(0);
	});

	test("listActiveChanges excluye archive/", () => {
		change("feat-x");
		change("feat-y");
		mkdirSync(join(DIR, "openspec", "changes", "archive", "viejo"), { recursive: true });
		expect(listActiveChanges(DIR).sort()).toEqual(["feat-x", "feat-y"]);
	});
});

describe("assessCloseReadiness", () => {
	function closeReadyChange(name: string): string {
		const c = change(name);
		put(c, "scope.md", "# Scope\nDeclarationless legacy record.\n");
		put(c, "map.md");
		put(c, "design.md");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [x] 1 done\n");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "status: pass\n");
		put(c, "summary.md", "# Summary\n");
		return c;
	}

	test("expone códigos estables sin alterar los mensajes de lifecycle", () => {
		const c = change("blocked");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [ ] 1 pending\n");
		const readiness = assessCloseReadiness(DIR, "blocked");
		expect(readiness.ready).toBe(false);
		expect(readiness.blockers).toEqual([
			{ code: "apply-not-complete", message: "apply no está `status: complete`." },
			{ code: "verify-missing", message: "falta verify-report.md." },
			{ code: "summary-missing", message: "falta summary.md." },
			{ code: "tasks-pending", message: "quedan 1 tarea(s) sin completar." },
			{ code: "spec-unresolved", message: "estado de specs OpenSpec: unresolved." },
		]);
		expect(readiness.reasons).toEqual(readiness.blockers.map((blocker) => blocker.message));
	});

	test("reconoce solamente el registro canónico declarationless completo", () => {
		const c = closeReadyChange("eligible");
		const readiness = assessCloseReadiness(DIR, "eligible");
		expect(readiness.ready).toBe(false);
		expect(readiness.blockers.map((blocker) => blocker.code)).toEqual(["spec-unresolved"]);
		expect(readiness.legacyEligibility).toBe("declarationless-record");

		for (const [name, mutate] of [
			["declared", (path: string) => put(path, "scope.md", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: legacy\n")],
			["delta", (path: string) => { mkdirSync(join(path, "specs", "domain"), { recursive: true }); put(path, "specs/domain/spec.md", "bad delta"); }],
			["sync", (path: string) => put(path, "sync-report.md", "unreadable report")],
			["incomplete", (path: string) => put(path, "apply-progress.md", "status: partial\n")],
		] as const) {
			const candidate = closeReadyChange(name);
			mutate(candidate);
			expect(assessCloseReadiness(DIR, name).legacyEligibility).toBeNull();
		}
	});
});

describe("estado OpenSpec", () => {
	const DELTA = "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: sdd-lifecycle\n\n## ADDED\n### Scenario: close\ntitle: Close\nrequirement: The system MUST close\nGiven: ready\nWhen: close\nThen: archived\n";
	function deltaChange(name: string): string {
		const c = change(name);
		mkdirSync(join(c, "specs", "sdd-lifecycle"), { recursive: true });
		put(c, "specs/sdd-lifecycle/spec.md", DELTA);
		return c;
	}
	test("surface unresolved, pending, conflict y synchronized en orden", () => {
		const unresolved = change("unresolved");
		put(unresolved, "scope.md", "scope: x\n");
		expect(resolveSddStatus(DIR, "unresolved").specState).toBe("unresolved");
		const pending = deltaChange("pending");
		expect(resolveSddStatus(DIR, "pending").specState).toBe("pending");
		const plan = planOpenSpecSync("pending", [{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }], []);
		put(pending, "sync-report.md", serializeSyncReport(plan));
		// Un informe SOLO no sincroniza nada: mientras el spec canónico no exista
		// en disco con los bytes que el informe declara, el estado sigue pendiente.
		// Antes bastaba el informe y `synchronized` se afirmaba sin haber escrito
		// el spec — un recibo que no describía la realidad.
		expect(resolveSddStatus(DIR, "pending").specState).toBe("pending");
		mkdirSync(join(DIR, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
		writeFileSync(join(DIR, "openspec", "specs", "sdd-lifecycle", "spec.md"), serializeOpenSpec(plan.domains[0]!.result!));
		expect(resolveSddStatus(DIR, "pending").specState).toBe("synchronized");
		const conflict = deltaChange("conflict");
		const base = "# OpenSpec Specification\nformat: openspec-spec/v1\ndomain: sdd-lifecycle\n\n## Scenario: close\ntitle: Existing\nrequirement: The system MUST exist\nGiven: ready\nWhen: close\nThen: archived\n";
		mkdirSync(join(DIR, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
		writeFileSync(join(DIR, "openspec", "specs", "sdd-lifecycle", "spec.md"), base);
		const conflictPlan = planOpenSpecSync("conflict", [{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }], [{ domain: "sdd-lifecycle", bytes: Buffer.from(base) }]);
		put(conflict, "sync-report.md", serializeSyncReport(conflictPlan));
		expect(resolveSddStatus(DIR, "conflict").specState).toBe("conflict");
		const malformed = deltaChange("malformed");
		put(malformed, "sync-report.md", "not a sync report\n");
		expect(resolveSddStatus(DIR, "malformed").specState).toBe("pending");
		const stale = deltaChange("stale");
		const stalePlan = planOpenSpecSync("stale", [{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }], [{ domain: "sdd-lifecycle", bytes: Buffer.from(base) }]);
		put(stale, "sync-report.md", serializeSyncReport(stalePlan));
		put(stale, "specs/sdd-lifecycle/spec.md", DELTA.replace("title: Close", "title: Changed"));
		expect(resolveSddStatus(DIR, "stale").specState).toBe("pending");
	});
});

// Raíz dual + alias legacy: el router debe leer trabajo SDD existente en
// `.sdd/changes/` (gramática previa: explore.md ≈ scope+map, apply.md ≈ design)
// sin exigir migración de ficheros.
describe("resolveSddStatus con raíz .sdd/changes (legacy)", () => {
	function legacyChange(name: string): string {
		const p = join(DIR, ".sdd", "changes", name);
		mkdirSync(p, { recursive: true });
		return p;
	}

	test("sin openspec/, lista y enruta cambios de .sdd/changes/", () => {
		const c = legacyChange("fix-x");
		put(c, "explore.md", "scope: arreglar x\nbudget_allocated: 15000\n");
		expect(listActiveChanges(DIR)).toEqual(["fix-x"]);
		const s = resolveSddStatus(DIR);
		expect(s.change).toBe("fix-x");
		// explore.md cubre scope y map (gramática vieja fusionada) → siguiente design.
		expect(s.present.scope).toBe(true);
		expect(s.present.map).toBe(true);
		expect(s.nextRecommended).toBe("design");
	});

	test("cambio legacy completo y verificado → siguiente close", () => {
		const c = legacyChange("fix-x");
		put(c, "explore.md", "scope: arreglar x\n");
		put(c, "apply.md", "# plan de implementación\n");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [x] 1 hecho\n");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "Status: pass\n");
		const s = resolveSddStatus(DIR);
		expect(s.apply).toBe("complete");
		expect(s.verify).toBe("pass");
		expect(s.nextRecommended).toBe("close");
	});

	test("openspec/changes/ tiene prioridad sobre .sdd/changes/", () => {
		const canonical = change("feat-nuevo");
		put(canonical, "scope.md");
		const legacy = legacyChange("fix-viejo");
		put(legacy, "explore.md");
		expect(listActiveChanges(DIR)).toEqual(["feat-nuevo"]);
	});
});
