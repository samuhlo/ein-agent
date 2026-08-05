// =============================================================================
// TESTS: sdd-next dispatcher conservador
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSddNext, type SddNextReport } from "../ein-pi/agent/lib/sdd-router";
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
		`modo: ${report.mode}`,
		`fase actual: ${report.currentPhase}`,
		`siguiente recomendado: ${report.nextRecommended}`,
		`razon: ${report.reason}`,
		`accion sugerida: ${report.suggestedAction}`,
	];
	if (report.mode === "auto") {
		lines.push("", "■ dry-run: --auto fue reconocido, pero autoEnabled=false; no ejecute fases ni delegaciones.");
	}
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
		expect(report.mode).toBe("interactive");
		expect(report.autoEnabled).toBe(false);
	});

	test("--auto solo cambia modo y queda fail-closed", () => {
		const c = change("feat-x");
		put(c, "scope.md");

		const report = resolveSddNext(DIR, "feat-x", { auto: true });
		expect(report.mode).toBe("auto");
		expect(report.autoEnabled).toBe(false);
		expect(report.nextRecommended).toBe("scope");
	});

	test("cambio inexistente devuelve error legible sin crear estado", () => {
		const report = resolveSddNext(DIR, "missing-change");
		expect(report.exists).toBe(false);
		expect(report.change).toBe("missing-change");
		expect(report.reason).toContain("No encontre el cambio");
		expect(report.nextRecommended).toBe("done");
	});

	test("salida visible muestra fase, razon, accion y dry-run", () => {
		const c = change("feat-x");
		put(c, "scope.md");

		const out = formatSddNext(resolveSddNext(DIR, "feat-x", { auto: true }));
		expect(out).toContain("fase actual: scope");
		expect(out).toContain("siguiente recomendado: scope");
		expect(out).toContain("razon: estado de specs OpenSpec: unresolved;");
		expect(out).toContain("accion sugerida:");
		expect(out).toContain("dry-run");
		expect(out).toContain("autoEnabled=false");
	});

	test("renderiza la ruta scope y el diagnostico exacto para unresolved y conflict", () => {
		const unresolved = change("dispatcher-unresolved");
		put(unresolved, "scope.md", "scope: x\n");
		conflictChange("dispatcher-conflict");

		for (const [name, state] of [
			["dispatcher-unresolved", "unresolved"],
			["dispatcher-conflict", "conflict"],
		] as const) {
			const report = resolveSddNext(DIR, name, { auto: true });
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
			expect(output).toContain("dry-run");
			expect(output).toContain("autoEnabled=false");
		}
	});
});

describe("ein:sdd-next command wiring", () => {
	const src = readFileSync(EIN_AI_PATH, "utf8");

	test("registra el comando canonico y ayuda sin args", () => {
		expect(src).toMatch(/registerCommand\(\s*"ein:sdd-next"/);
		expect(src).toContain("Uso: /ein:sdd-next <change> [--auto]");
		expect(src).toContain("No elige un cambio activo implicitamente.");
	});

	test("el handler usa resolveSddNext y no ejecuta fases", () => {
		const block = src.match(/registerCommand\(\s*"ein:sdd-next"[\s\S]*?\n\t}\);/)?.[0] ?? "";
		expect(block).toContain("resolveSddNext");
		expect(block).not.toContain("subagent");
		expect(block).not.toContain("writeFileSync");
		expect(block).not.toContain("closeChange");
		expect(block).not.toContain("handleSddClose");
		expect(block).not.toContain("handleSddAudit");
	});
});
