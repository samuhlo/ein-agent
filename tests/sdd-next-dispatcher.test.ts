// =============================================================================
// TESTS: sdd-next dispatcher conservador
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSddNext, sddNextHandoff, type SddNextReport } from "../ein-pi/agent/lib/sdd-router";
import { planOpenSpecSync, serializeSyncReport } from "../ein-pi/agent/lib/openspec-spec-sync";

const EIN_AI_PATH = join(import.meta.dir, "../ein-pi/agent/extensions/ein-ai.ts");
let DIR: string;

function change(name: string): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	return p;
}

function put(changePath: string, file: string, body = "x"): void {
	writeFileSync(join(changePath, file), body);
}

const DELTA = "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: sdd-lifecycle\n\n## ADDED\n### Scenario: close\ntitle: Close\nrequirement: The system MUST close\nGiven: ready\nWhen: close\nThen: archived\n";
const BASE = "# OpenSpec Specification\nformat: openspec-spec/v1\ndomain: sdd-lifecycle\n\n## Scenario: close\ntitle: Existing\nrequirement: The system MUST exist\nGiven: ready\nWhen: close\nThen: archived\n";

function conflictChange(name: string): string {
	const c = change(name);
	put(c, "scope.md", "scope: x\n");
	mkdirSync(join(c, "specs", "sdd-lifecycle"), { recursive: true });
	put(c, "specs/sdd-lifecycle/spec.md", DELTA);
	mkdirSync(join(DIR, "openspec", "specs", "sdd-lifecycle"), { recursive: true });
	put(join(DIR, "openspec", "specs", "sdd-lifecycle"), "spec.md", BASE);
	const plan = planOpenSpecSync(
		name,
		[{ path: "specs/sdd-lifecycle/spec.md", bytes: Buffer.from(DELTA) }],
		[{ domain: "sdd-lifecycle", bytes: Buffer.from(BASE) }],
	);
	put(c, "sync-report.md", serializeSyncReport(plan));
	return c;
}

function formatSddNext(report: SddNextReport): string {
	const lines = [
		"/// 000. SDD NEXT",
		"",
		`cambio: ${report.change ?? "ninguno"}`,
		`fase actual: ${report.currentPhase}`,
		`siguiente recomendado: ${report.nextRecommended}`,
		`razon: ${report.reason}`,
		`accion sugerida: ${report.suggestedAction}`,
	];
	if (report.blocked.length > 0) {
		lines.push("", "■ revisar antes de avanzar:");
		for (const item of report.blocked) lines.push(`- ${item}`);
	}
	return lines.join("\n");
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-next-"));
});

afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("resolveSddNext", () => {
	test("devuelve recomendacion humana encima del router", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");

		const report = resolveSddNext(DIR, "feat-x");
		expect(report.change).toBe("feat-x");
		expect(report.currentPhase).toBe("tasks");
		expect(report.nextRecommended).toBe("tasks");
		expect(report.reason).toContain("diseno");
		expect(report.suggestedAction).toContain("sdd-tasks");
		expect(Object.keys(report)).not.toContain("mode");
		expect(Object.keys(report)).not.toContain("autoEnabled");
	});

	test("cambio inexistente devuelve error legible sin crear estado", () => {
		const report = resolveSddNext(DIR, "missing-change");
		expect(report.exists).toBe(false);
		expect(report.change).toBe("missing-change");
		expect(report.reason).toContain("No encontre el cambio");
		expect(report.nextRecommended).toBe("done");
	});

	test("salida visible muestra fase, razon y accion", () => {
		const c = change("feat-x");
		put(c, "scope.md");

		const out = formatSddNext(resolveSddNext(DIR, "feat-x"));
		expect(out).toContain("fase actual: scope");
		expect(out).toContain("siguiente recomendado: scope");
		expect(out).toContain("razon: estado de specs OpenSpec: unresolved;");
		expect(out).toContain("accion sugerida:");
	});

	test("renderiza la ruta scope y el diagnostico exacto para unresolved y conflict", () => {
		const unresolved = change("dispatcher-unresolved");
		put(unresolved, "scope.md", "scope: x\n");
		conflictChange("dispatcher-conflict");

		for (const [name, state] of [
			["dispatcher-unresolved", "unresolved"],
			["dispatcher-conflict", "conflict"],
		] as const) {
			const report = resolveSddNext(DIR, name);
			const blocker = `estado de specs OpenSpec: ${state}; map bloqueado hasta resolver la procedencia desde scope.`;
			const output = formatSddNext(report);

			expect(report.currentPhase).toBe("scope");
			expect(report.nextRecommended).toBe("scope");
			expect(report.reason).toBe(blocker);
			expect(report.blocked).toContain(blocker);
			expect(report.suggestedAction).toContain(state);
			expect(output).toContain("siguiente recomendado: scope");
			expect(output).not.toContain("siguiente recomendado: map");
			expect(output).toContain(`razon: ${blocker}`);
			expect(output).toContain(`- ${blocker}`);
			expect(output).toContain(`accion sugerida: ${report.suggestedAction}`);
		}
	});
});

describe("sddNextHandoff", () => {
	test("entrega la fase que el router decidio, prohibiendo re-derivarla", () => {
		const c = change("feat-x");
		put(c, "scope.md");
		put(c, "map.md");
		put(c, "design.md");

		const handoff = sddNextHandoff(resolveSddNext(DIR, "feat-x"));
		expect(handoff).toContain("feat-x");
		expect(handoff).toContain("next phase to run `tasks`");
		expect(handoff).toContain('subagent({ agent: "sdd-tasks"');
		expect(handoff).toContain("do NOT re-derive");
	});

	test("close nombra los dos pasos: resumen y archivado determinista", () => {
		const c = change("feat-close");
		for (const file of ["scope.md", "map.md", "design.md", "tasks.md"]) put(c, file);
		put(c, "apply-progress.md", "status: complete\n");
		put(c, "verify-report.md", "status: pass\n");

		const report = resolveSddNext(DIR, "feat-close");
		const handoff = sddNextHandoff(report);
		if (report.nextRecommended === "close") {
			expect(handoff).toContain('agent: "sdd-close"');
			expect(handoff).toContain("ein_sdd_close");
		}
	});

	test("un cambio inexistente no genera trabajo inventado", () => {
		expect(sddNextHandoff(resolveSddNext(DIR, "missing-change"))).toBeNull();
	});

	test("los bloqueos del router viajan con la entrega, no se ocultan", () => {
		const c = change("dispatcher-unresolved");
		put(c, "scope.md", "scope: x\n");

		const report = resolveSddNext(DIR, "dispatcher-unresolved");
		const handoff = sddNextHandoff(report);
		expect(report.blocked.length).toBeGreaterThan(0);
		expect(handoff).toContain("Resolve these router-reported blockers first");
		for (const item of report.blocked) expect(handoff).toContain(item);
	});

	test("el bloqueo de participantes se adelanta antes de verify", () => {
		const c = change("feat-verify");
		for (const file of ["scope.md", "map.md", "design.md", "tasks.md"]) put(c, file);
		put(c, "apply-progress.md", "status: complete\n");

		const report = resolveSddNext(DIR, "feat-verify");
		const handoff = sddNextHandoff(report, { participantsBlocker: "ein-cleaner pendiente." });
		expect(report.nextRecommended).toBe("verify");
		expect(handoff).toContain("Before `sdd-verify`: ein-cleaner pendiente.");
	});
});

describe("ein:sdd-next command wiring", () => {
	const src = readFileSync(EIN_AI_PATH, "utf8");

	test("registra el comando canonico y ayuda sin args", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-next"/);
		expect(src).toContain("Uso: /ein:sdd-next <change>");
		expect(src).toContain("No elige un cambio activo implicitamente.");
	});

	// Se comprueba que la superficie ya no la OFRECE ni la reporta. El código
	// puede seguir nombrandola en un comentario que explique la retirada: eso
	// es documentación, no una bandera viva.
	test("la bandera --auto ya no se ofrece ni se reporta", () => {
		expect(src).not.toContain("[--auto]");
		expect(src).not.toContain("autoEnabled");
	});

	// Antes este test fijaba lo contrario ("no ejecuta fases"), y por eso el
	// comando era un callejón sin salida: imprimía la ruta al usuario y nadie la
	// ejecutaba. Lo que se protege ahora es el reparto de autoridad: el comando
	// ENTREGA la ruta que calculó el router, y no ejecuta la fase por su cuenta.
	test("el handler entrega la ruta al orquestador sin ejecutarla el mismo", () => {
		const block = src.match(/registerCommand\(\s*"ein:sdd-next"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		expect(block).toContain("resolveSddNext");
		expect(block).toContain("sddNextHandoff");
		expect(block).toContain("pi.sendUserMessage");
		expect(block).not.toContain("writeFileSync");
		expect(block).not.toContain("closeChange");
		expect(block).not.toContain("handleSddClose");
		expect(block).not.toContain("handleSddAudit");
	});
});
