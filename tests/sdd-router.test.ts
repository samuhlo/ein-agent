// =============================================================================
// TESTS: sdd-router (estado SDD determinista)
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listActiveChanges, resolveSddStatus } from "../ein-pi/agent/lib/sdd-router";

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
	});

	test("tasks.md bloqueado alimenta contadores y blockers", () => {
		const c = change("feat-x");
		put(c, "tasks.md", "status: blocked\nblocked_by: decision missing\n- [ ] 1.1 Build router\n");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.counts.blocked).toBe(1);
		expect(s.blocked).toContain("tasks.md bloqueado por: decision missing");
	});

	test("sin tasks.md no rompe status", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		const s = resolveSddStatus(DIR, "feat-x");
		expect(s.tasks.present).toBe(false);
		expect(s.tasks.items).toEqual([]);
		expect(s.tasks.problems).toContain("tasks.md ausente.");
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
