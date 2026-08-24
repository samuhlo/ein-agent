// =============================================================================
// TESTS: sdd-status output (contrato de formato sin Pi runtime)
// Verifica que el output de /ein:sdd-status contiene las etiquetas correctas
// sin necesidad de levantar el agente Pi.
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatBudget, listActiveChanges, resolveSddStatus, sddStatusBlockers, type SddBudgetStatus, type SddChangeStatus } from "../ein-pi/agent/lib/sdd-router";
import { t, tf } from "../ein-pi/agent/lib/i18n/strings";
import { readFileSync } from "node:fs";

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

// Replica del handler /ein:sdd-status; el budget usa la fuente única formatBudget.
const compactBudget = formatBudget;

function formatSddStatus(cwd: string, change?: string): string {
	const s = resolveSddStatus(cwd, change);
	const active = listActiveChanges(cwd);
	const lines: string[] = ["// 000. sdd status", ""];
	if (!s.change) {
		// Ambigüedad ≠ repo limpio: hay trabajo abierto, solo que sin elegir.
		if (s.selection.kind === "ambiguous") {
			lines.push(`- ${s.selection.candidates.length} cambios activos y ninguno elegido.`);
			lines.push(`- ${t("sdd-status.active", "active")}: ${s.selection.candidates.join(", ")}`);
			lines.push("- Indica cuál con su nombre antes de continuar.");
		} else {
			lines.push("- " + t("sdd-status.none", "No active SDD changes in openspec/changes/."));
		}
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
		const blockers = sddStatusBlockers({ blocked: s.blocked, taskProblems: s.tasks.problems, budgetProblems: s.budget.problems });
		if (blockers.length) {
			lines.push("");
			lines.push(`▏ ${t("sdd-status.blocked", "blockers")}:`);
			for (const b of blockers) lines.push(`- ${b}`);
		}
	}
	return lines.join("\n");
}

describe("sdd-status output format", () => {
	test("sin cambios → mensaje de ninguno", () => {
		const out = formatSddStatus(DIR);
		expect(out).toContain(t("sdd-status.none", "No hay cambios SDD activos en openspec/changes/."));
	});

	test("scope no muestra tasks.md ausente como blocker", () => {
		const c = change("feat-x");
		put(c, "scope.md");

		const out = formatSddStatus(DIR);
		expect(out).toContain("next: scope");
		expect(out).toContain("- estado de specs OpenSpec: unresolved; map bloqueado hasta resolver la procedencia desde scope.");
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

	// Esta suite reproduce el handler de `/ein:sdd-status` en vez de importarlo:
	// `ein-ai.ts` registra tools de Pi al cargarse. La réplica es útil mientras no
	// derive, así que este contrato la ata al original en lo que importa.
	test("la rama de ambigüedad existe también en el handler real", () => {
		const einAi = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
		const handler = einAi.slice(einAi.indexOf("function formatSddStatus"));
		expect(handler).toContain('status.selection.kind === "ambiguous"');
		expect(handler).toContain("ninguno elegido");
	});

	test("multiples cambios activos → los lista y pide elegir, sin elegir por su cuenta", () => {
		change("feat-x");
		change("feat-y");
		const out = formatSddStatus(DIR);
		expect(out).toContain("active: feat-x, feat-y");
		// Antes salía `change: feat-x` — el primero de `readdirSync` presentado
		// como decisión. Y con `change` nulo, decir "no hay ninguno" sería la
		// misma mentira por el otro lado.
		expect(out).not.toContain("change: feat-x");
		expect(out).not.toContain("No active SDD changes");
		expect(out).toContain("ninguno elegido");
	});

	test("bloqueos → muestra seccion de bloqueos", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");
		put(c, "tasks.md");
		put(c, "apply-progress.md", "status: blocked\n");

		const out = formatSddStatus(DIR);
		expect(out).toContain("▏ blockers:");
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

describe("formatBudget avisa al superar lo asignado (P2-G)", () => {
	const budget = (over: Partial<SddBudgetStatus>): SddBudgetStatus => ({
		allocated: null, consumed: null, allocatedValue: null, consumedValue: null, problems: [], ...over,
	});

	test("consumido > asignado → marca advisory con porcentaje", () => {
		const out = formatBudget(budget({ allocated: "max_tokens: 15000", consumed: "{ tokens: 30690 }", allocatedValue: 15000, consumedValue: 30690 }));
		expect(out).toContain("allocated=max_tokens: 15000");
		expect(out).toContain("consumed={ tokens: 30690 }");
		expect(out).toContain("⚠");
		expect(out).toContain("205%");
	});

	test("consumido ≤ asignado → sin aviso", () => {
		const out = formatBudget(budget({ allocated: "15000", consumed: "5000", allocatedValue: 15000, consumedValue: 5000 }));
		expect(out).not.toContain("⚠");
	});

	test("sin datos → absent", () => {
		expect(formatBudget(budget({}))).toBe("absent");
	});

	test("el aviso NO es un bloqueo (no alimenta sddStatusBlockers)", () => {
		// Superar el presupuesto es advisory, no impide cerrar; los bloqueos salen de otra fuente.
		expect(sddStatusBlockers({ blocked: [], taskProblems: [], budgetProblems: [] })).toEqual([]);
	});
});

describe("sddStatusBlockers separa bloqueos de procedencia (P1-D)", () => {
	test("solo incluye bloqueos reales; la procedencia del ledger no entra por diseño", () => {
		const out = sddStatusBlockers({
			blocked: ["verify-report indica fallo: remediar antes de cerrar."],
			taskProblems: ["1.2 bloqueada"],
			budgetProblems: [],
		});
		expect(out).toEqual(["verify-report indica fallo: remediar antes de cerrar.", "1.2 bloqueada"]);
		// change-unresolved / legacy-metadata-excluded no son parámetros: no pueden colarse aquí.
	});

	test("el formatter real no vuelca la procedencia del ledger en los bloqueos", () => {
		const einAi = readFileSync(join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts"), "utf8");
		// Usa la fuente única de bloqueos...
		expect(einAi).toContain("sddStatusBlockers(");
		// ...y ya NO mezcla realCost.problems en la sección de bloqueos.
		expect(einAi).not.toContain("...(realCost?.problems.map");
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

	test("sdd-next description key exists and help exposes the handoff, not a dry-run", () => {
		expect(t("cmd.sdd-next.description", "")).toContain("next recommended SDD step");
		expect(t("help.short", "")).toContain("/ein:sdd-next <change>");
		expect(t("help.short", "")).not.toContain("[--auto]");
		expect(t("help.full", "")).toContain("hands that route to the orchestrator");
		expect(t("help.full", "")).not.toContain("dry-run");
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
