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

type BlockedProvenanceState = "unresolved" | "conflict";
function mapProvenanceBlocker(state: BlockedProvenanceState): string {
	return `estado de specs OpenSpec: ${state}; map bloqueado hasta resolver la procedencia desde scope.`;
}
function expectMapProvenanceBlock(status: ReturnType<typeof resolveSddStatus>, state: BlockedProvenanceState): void {
	expect(status.specState).toBe(state);
	expect(status.nextRecommended).toBe("scope");
	expect(status.blocked).toContain(mapProvenanceBlocker(state));
}
function expectProvenanceNext(report: ReturnType<typeof resolveSddNext>, state: BlockedProvenanceState): void {
	expect(report.nextRecommended).toBe("scope");
	expect(report.reason).toBe(mapProvenanceBlocker(state));
	expect(report.suggestedAction).toContain("scope");
	expect(report.suggestedAction).toContain(state);
	expect(report.suggestedAction).toContain("OpenSpec");
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

	test("solo scope.md con procedencia no resuelta → siguiente scope", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		const s = resolveSddStatus(DIR);
		expect(s.change).toBe("feat-x");
		expectMapProvenanceBlock(s, "unresolved");
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
	const PROFILE = "scope-only-out-of-flow";
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

	function reconciliationRecord(name: string, scope = "# Scope\nDeclarationless historical record.\n"): string {
		const c = change(name);
		put(c, "scope.md", scope);
		put(c, "summary.md", "Delivery occurred outside SDD.\n");
		put(c, "out-of-flow-reconciliation.json", "{}\n");
		return c;
	}

	test("clasifica de forma genérica las dos formas scope-only elegibles", () => {
		reconciliationRecord("not-allowlisted");
		const declarationless = assessCloseReadiness(DIR, "not-allowlisted", { reconciliationProfile: PROFILE });
		expect(declarationless.reconciliationEligibility).toBe(PROFILE);
		expect(declarationless.reconciliationBlockers).toEqual([]);

		reconciliationRecord("also-generic", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: Delivered through the prior release workflow.\n");
		const declaredNone = assessCloseReadiness(DIR, "also-generic", { reconciliationProfile: PROFILE });
		expect(declaredNone.reconciliationEligibility).toBe(PROFILE);
		expect(declaredNone.reconciliationBlockers).toEqual([]);
	});

	test("requiere selección explícita sin alterar readiness ordinario", () => {
		reconciliationRecord("profile-absent");
		const ordinary = assessCloseReadiness(DIR, "profile-absent");
		expect(ordinary.reconciliationEligibility).toBeNull();
		expect(ordinary.reconciliationBlockers).toEqual([]);
		expect(ordinary.blockers.map((blocker) => blocker.code)).toEqual([
			"apply-not-complete", "verify-missing", "spec-unresolved",
		]);

		const unsupported = assessCloseReadiness(DIR, "profile-absent", { reconciliationProfile: "other" });
		expect(unsupported.reconciliationEligibility).toBeNull();
		expect(unsupported.reconciliationBlockers.map((blocker) => blocker.code)).toEqual(["reconciliation-profile-unsupported"]);
	});

	test("rechaza deltas, sync reports, artefactos mixtos y declaraciones malformadas", () => {
		const cases: Array<[string, (path: string) => void]> = [
			["local-delta", (path) => { mkdirSync(join(path, "specs", "domain"), { recursive: true }); put(path, "specs/domain/spec.md", "malformed delta\n"); }],
			["sync-report", (path) => put(path, "sync-report.md", "stale or ambiguous\n")],
			["mixed-lifecycle", (path) => put(path, "map.md", "retrospective\n")],
			["malformed-none", (path) => put(path, "scope.md", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: TBD\n")],
			["duplicate-none", (path) => put(path, "scope.md", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: valid reason\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: another reason\n")],
			["ambiguous-none", (path) => put(path, "scope.md", "spec_delta: none\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: valid reason\n")],
		];
		for (const [name, mutate] of cases) {
			const path = reconciliationRecord(name);
			mutate(path);
			const readiness = assessCloseReadiness(DIR, name, { reconciliationProfile: PROFILE });
			expect(readiness.reconciliationEligibility, name).toBeNull();
			expect(readiness.reconciliationBlockers.map((blocker) => blocker.code), name).toContain("reconciliation-record-ineligible");
		}
	});

	test("preserva conflictos, pendientes, sincronización y el escape force declarationless", () => {
		const ordinary = closeReadyChange("ordinary-regression");
		expect(assessCloseReadiness(DIR, "ordinary-regression").legacyEligibility).toBe("declarationless-record");
		put(ordinary, "scope.md", "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: valid declaration reason\n");
		expect(assessCloseReadiness(DIR, "ordinary-regression").legacyEligibility).toBeNull();

		const pending = reconciliationRecord("pending-regression");
		mkdirSync(join(pending, "specs", "domain"), { recursive: true });
		put(pending, "specs/domain/spec.md", "malformed delta\n");
		const classified = assessCloseReadiness(DIR, "pending-regression", { reconciliationProfile: PROFILE });
		expect(classified.ready).toBe(false);
		expect(classified.reconciliationEligibility).toBeNull();
		expect(classified.reconciliationBlockers.map((blocker) => blocker.code)).toContain("reconciliation-record-ineligible");
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

	test("canonical scope→map gate blocks unresolved and conflict but preserves pending and synchronized", () => {
		const unresolved = change("map-unresolved");
		put(unresolved, "scope.md", "scope: x\n");
		const unresolvedStatus = resolveSddStatus(DIR, "map-unresolved");
		expectMapProvenanceBlock(unresolvedStatus, "unresolved");

		const pending = deltaChange("map-pending");
		put(pending, "scope.md", "scope: x\n");
		const pendingStatus = resolveSddStatus(DIR, "map-pending");
		expect(pendingStatus.specState).toBe("pending");
		expect(pendingStatus.nextRecommended).toBe("map");
		expect(pendingStatus.blocked.join(" ")).not.toContain("map bloqueado");

		const synchronized = deltaChange("map-synchronized");
		put(synchronized, "scope.md", "scope: x\n");
		const syncPlan = planOpenSpecSync("map-synchronized", [{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }], []);
		put(synchronized, "sync-report.md", serializeSyncReport(syncPlan));
		mkdirSync(join(DIR, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
		writeFileSync(join(DIR, "openspec", "specs", "sdd-lifecycle", "spec.md"), serializeOpenSpec(syncPlan.domains[0]!.result!));
		const synchronizedStatus = resolveSddStatus(DIR, "map-synchronized");
		expect(synchronizedStatus.specState).toBe("synchronized");
		expect(synchronizedStatus.nextRecommended).toBe("map");
		expect(synchronizedStatus.blocked.join(" ")).not.toContain("map bloqueado");

		const conflict = deltaChange("map-conflict");
		put(conflict, "scope.md", "scope: x\n");
		const base = "# OpenSpec Specification\nformat: openspec-spec/v1\ndomain: sdd-lifecycle\n\n## Scenario: close\ntitle: Existing\nrequirement: The system MUST exist\nGiven: ready\nWhen: close\nThen: archived\n";
		writeFileSync(join(DIR, "openspec", "specs", "sdd-lifecycle", "spec.md"), base);
		const conflictPlan = planOpenSpecSync("map-conflict", [{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }], [{ domain: "sdd-lifecycle", bytes: Buffer.from(base) }]);
		put(conflict, "sync-report.md", serializeSyncReport(conflictPlan));
		const conflictStatus = resolveSddStatus(DIR, "map-conflict");
		expectMapProvenanceBlock(conflictStatus, "conflict");

		expectProvenanceNext(resolveSddNext(DIR, "map-unresolved"), "unresolved");
		expectProvenanceNext(resolveSddNext(DIR, "map-conflict"), "conflict");
	});

	test("provenance gate stays out of missing-scope, existing-map, and later routes", () => {
		const missingScope = change("map-without-scope");
		put(missingScope, "map.md");
		const missingScopeStatus = resolveSddStatus(DIR, "map-without-scope");
		expect(missingScopeStatus.nextRecommended).toBe("scope");
		expect(missingScopeStatus.blocked.join(" ")).not.toContain("map bloqueado");

		const existingMap = change("already-mapped");
		put(existingMap, "scope.md");
		put(existingMap, "map.md");
		const existingMapStatus = resolveSddStatus(DIR, "already-mapped");
		expect(existingMapStatus.nextRecommended).toBe("design");
		expect(existingMapStatus.blocked.join(" ")).not.toContain("map bloqueado");

		const laterPhase = change("later-phase");
		for (const file of ["scope.md", "map.md", "design.md"]) put(laterPhase, file);
		const laterPhaseStatus = resolveSddStatus(DIR, "later-phase");
		expect(laterPhaseStatus.nextRecommended).toBe("tasks");
		expect(laterPhaseStatus.blocked.join(" ")).not.toContain("map bloqueado");
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
