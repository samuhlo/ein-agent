// =============================================================================
// TESTS: sdd-status output (contrato de formato sin Pi runtime)
// Verifica que el output de /ein:sdd-status contiene las etiquetas correctas
// sin necesidad de levantar el agente Pi.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listActiveChanges, readSddRealCost, resolveSddStatus, type SddChangeStatus } from "../ein-pi/agent/lib/sdd-router";
import { t, tf } from "../ein-pi/agent/lib/i18n/strings";

let DIR: string;
const I18N_KEY = Symbol.for("rpiv-i18n");
const originalLocale = (globalThis as Record<symbol, unknown>)[I18N_KEY];

function setLocale(locale: string): void {
	(globalThis as Record<symbol, unknown>)[I18N_KEY] = { locale, namespaces: {} };
}

function change(name: string): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	return p;
}
function put(changePath: string, file: string, body = "x"): void {
	writeFileSync(join(changePath, file), body);
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-status-"));
	setLocale("en");
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
	(globalThis as Record<symbol, unknown>)[I18N_KEY] = originalLocale;
});

// Replica exacta del formatter del handler /ein:sdd-status
function compactBudget(budget: SddChangeStatus["budget"]): string {
	if (!budget.allocated && !budget.consumed) return "absent";
	return `allocated=${budget.allocated ?? "unknown"} · consumed=${budget.consumed ?? "unknown"}`;
}

function formatSddStatus(cwd: string, change?: string): string {
	const s = resolveSddStatus(cwd, change);
	const active = listActiveChanges(cwd);
	const lines: string[] = ["/// 000. SDD STATUS", ""];
	if (!s.change) {
		lines.push("- " + t("sdd-status.none", "No active SDD changes in openspec/changes/."));
	} else {
		const present = s.artifacts.present.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
		const missing = s.artifacts.missing.map((artifact) => `${artifact.phase}(${artifact.file})`).join(", ") || t("sdd-status.no-active", "none");
		lines.push(`${t("sdd-status.change", "change")}: ${s.change}`);
		if (active.length > 1) lines.push(`${t("sdd-status.active", "active")}: ${active.join(", ")}`);
		lines.push(`${t("sdd-status.current", "current phase")}: ${s.currentPhase}`);
		lines.push(`${t("sdd-status.next", "next")}: ${s.nextRecommended}`);
		lines.push(`${t("sdd-status.artifacts.present", "artifacts present")}: ${present}`);
		lines.push(`${t("sdd-status.artifacts.missing", "artifacts missing")}: ${missing}`);
		lines.push(`${t("sdd-status.apply", "apply")}: ${s.apply}`);
		lines.push(`${t("sdd-status.verify", "verify")}: ${s.verify}`);
		lines.push(`${t("sdd-status.tasks", "tasks")}: status=${s.tasks.status ?? "absent"} · ready=${s.tasks.counts.ready} · blocked=${s.tasks.counts.blocked} · pending=${s.tasks.counts.pending} · done=${s.tasks.counts.done}`);
		if (s.tasks.nextPending) lines.push(`${t("sdd-status.next-pending", "next pending")}: ${s.tasks.nextPending.id} ${s.tasks.nextPending.title}`);
		if (s.tasks.blockedBy) lines.push(`${t("sdd-status.blocked-by", "blocked_by")}: ${s.tasks.blockedBy}`);
		lines.push(`${t("sdd-status.budget", "budget")}: ${compactBudget(s.budget)}`);
		const problems = [...s.tasks.problems, ...s.budget.problems];
		if (s.blocked.length || problems.length) {
			lines.push("");
			lines.push(`■ ${t("sdd-status.blocked", "blockers")}:`);
			for (const b of s.blocked) lines.push(`- ${b}`);
			for (const p of problems) lines.push(`- ${p}`);
		}
	}
	return lines.join("\n");
}

describe("sdd-status output format", () => {
	test("compatibility reader exposes only the local ledger and nullable provider cost", () => {
		const artifacts = join(DIR, ".pi-subagents", "artifacts");
		mkdirSync(artifacts, { recursive: true });
		writeFileSync(join(artifacts, "legacy_meta.json"), JSON.stringify({ task: "feat-x", usage: { input: 99, cost: 5 } }));
		const ledger = readSddRealCost(DIR, "feat-x");
		expect(ledger.runs).toBe(0);
		expect(ledger.costUsd).toBeNull();
		expect(ledger.problems.some((problem) => problem.code === "legacy-metadata-excluded")).toBe(true);
	});

	test("sin cambios → mensaje de ninguno", () => {
		const out = formatSddStatus(DIR);
		expect(out).toContain(t("sdd-status.none", "No hay cambios SDD activos en openspec/changes/."));
	});

	test("scope no muestra tasks.md ausente como blocker", () => {
		const c = change("feat-x");
		put(c, "scope.md");

		const out = formatSddStatus(DIR);
		expect(out).toContain("next: map");
		expect(out).not.toContain("tasks.md ausente.");
	});

	test("un cambio activo → muestra change, apply, verify, next", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");
		put(c, "tasks.md");
		put(c, "apply-progress.md", "status: partial\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("change: feat-x");
		expect(out).toContain("current phase: apply");
		expect(out).toContain("artifacts present: scope(scope.md)");
		expect(out).toContain("apply: partial");
		expect(out).toContain("verify: absent");
		expect(out).toContain("next: apply");
	});

	test("apply completo → verify presente", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");
		put(c, "tasks.md");
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "status: pass\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("apply: complete");
		expect(out).toContain("verify: pass");
		expect(out).toContain("next: close");
	});

	test("multiples cambios activos → muestra lista de activos", () => {
		change("feat-x");
		change("feat-y");
		const out = formatSddStatus(DIR);
		expect(out).toContain("active: feat-x, feat-y");
	});

	test("bloqueos → muestra seccion de bloqueos", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");
		put(c, "tasks.md");
		put(c, "apply-progress.md", "status: blocked\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("■ blockers:");
		expect(out).toContain("- apply-progress.md indica bloqueo.");
	});

	test("argumento opcional permite elegir change", () => {
		const a = change("feat-a");
		const b = change("feat-b");
		put(a, "scope.md");
		put(b, "scope.md");
		put(b, "map.md");

		const out = formatSddStatus(DIR, "feat-b");
		expect(out).toContain("change: feat-b");
		expect(out).toContain("current phase: design");
	});

	test("muestra tareas y budget sin hacer dump gigante", () => {
		const c = change("feat-x");
		put(c, "scope.md", "scope: x\nbudget_allocated: 10 reads\n");
		put(c, "map.md", "ledger: ok\nbudget_consumed: 4 reads\nscope_status: ok\n");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [ ] 1.1 Build\n- [x] 1.2 Test\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("tasks: status=ready · ready=1 · blocked=0 · pending=1 · done=1");
		expect(out).toContain("budget: allocated=10 reads · consumed=4 reads");
		// Punto de reanudación surface para el apply por grupos.
		expect(out).toContain("next pending: 1.1 Build");
	});

	test("sin tareas pendientes no muestra `next pending`", () => {
		const c = change("feat-done");
		put(c, "tasks.md", "status: ready\nblocked_by: none\n- [x] 1 hecho\n");
		const out = formatSddStatus(DIR);
		expect(out).not.toContain("next pending:");
	});
});

describe("strings.ts i18n keys present", () => {
	test("sdd-status.change key exists in EN and ES", () => {
		expect(t("sdd-status.change", "")).toBe("change");
	});

	test("sdd-status.apply key exists in EN and ES", () => {
		expect(t("sdd-status.apply", "")).toBe("apply");
	});

	test("sdd-status.next key exists in EN and ES", () => {
		expect(t("sdd-status.next", "")).toBe("next");
	});

	test("sdd-next description key exists and help exposes dry-run command", () => {
		expect(t("cmd.sdd-next.description", "")).toContain("next recommended SDD step");
		expect(t("help.short", "")).toContain("/ein:sdd-next <change> [--auto]");
		expect(t("help.full", "")).toContain("--auto is dry-run today");
	});

	test("status.sdd.active key exists", () => {
		expect(t("status.sdd.active", "")).toBe("active change");
	});

	test("status.sdd.multi con interpolacion", () => {
		const out = tf("status.sdd.multi", "{0} active", 3);
		expect(out).toBe("3 active");
	});

	test("sdd-status current/tasks/budget keys exist", () => {
		expect(t("sdd-status.current", "")).toBe("current phase");
		expect(t("sdd-status.tasks", "")).toBe("tasks");
		expect(t("sdd-status.budget", "")).toBe("budget");
	});
});
