// =============================================================================
// TESTS: sdd-close (mover determinista) + lint por fase
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeChange } from "../ein-pi/agent/lib/sdd-close";
import { lintChange, lintPhaseArtifact, oversizedGroupWarnings } from "../ein-pi/agent/lib/sdd-guardrails";
import { synchronizeOpenSpecFilesystem } from "../ein-pi/agent/lib/openspec-spec-sync-fs.ts";

let DIR: string;
function durableSummary(change: string): string {
	return [
		"status: complete",
		`change: ${change}`,
		"work_groups: 1",
		"verification_status: pass",
		"",
		"## // 000. RESUMEN",
		"cierre",
		"## // 001. QUÉ CAMBIÓ",
		"- cambio",
		"## // 002. CÓMO FUNCIONA POR DENTRO",
		"mecanismo",
		"## // 003. DECISIONES",
		"- decisión",
		"## // 004. VERIFICACIÓN",
		"- verify: `bun test tests/example.test.ts`",
		"## // 005. PENDIENTE / RIESGOS",
		"Ninguno.",
		"",
	].join("\n");
}

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
	test("condensa el cambio en un único summary.md", () => {
		makeFresh("feat-x");
		const r = closeChange(DIR, "feat-x", { force: true });
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "feat-x"))).toBe(false);
		const closed = join(DIR, "openspec", "changes", "archive", "feat-x");
		expect(existsSync(join(closed, "summary.md"))).toBe(true);
		expect(readFileSync(join(closed, "summary.md"), "utf8")).toContain("cierre");
		expect(readdirSync(closed)).toEqual(["summary.md"]);
	});

	test("no pisa si ya existe en storage interno (idempotente-safe)", () => {
		makeFresh("feat-x");
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
		"summary.md": durableSummary("placeholder"),
	};

	function setMtime(change: string, file: string, ms: number): void {
		const p = join(DIR, "openspec", "changes", change, file);
		utimesSync(p, new Date(ms), new Date(ms));
	}

	// apply < verify < summary → todo fresco (orden natural del flujo).
	function makeFresh(change: string): void {
		const path = mkChange(change, READY_FILES);
		writeFileSync(join(path, "summary.md"), durableSummary(change));
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

	test("un resumen incompleto no se convierte en el único registro permanente", () => {
		makeFresh("feat-summary-incomplete");
		writeFileSync(join(DIR, "openspec", "changes", "feat-summary-incomplete", "summary.md"), "# Parece terminado\n");
		const result = closeChange(DIR, "feat-summary-incomplete");
		expect(result.ok).toBe(false);
		expect(result.blockers?.map((blocker) => blocker.code)).toContain("summary-contract-invalid");
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

	test("cierra cambios completos en la raíz legacy .sdd/changes/", () => {
		const p = join(DIR, ".sdd", "changes", "fix-legacy");
		mkdirSync(p, { recursive: true });
		for (const [file, body] of Object.entries({
			"explore.md": "scope: legacy\n",
			"apply.md": "# Design\n",
			"tasks.md": "status: ready\n- [x] done\n",
			"apply-progress.md": "status: complete\n",
			"verify-report.md": "status: pass\n",
			"summary.md": durableSummary("fix-legacy"),
		})) writeFileSync(join(p, file), body);
		const r = closeChange(DIR, "fix-legacy", { force: true });
		expect(r).toEqual({ ok: true, from: join(DIR, ".sdd", "changes", "fix-legacy"), to: join(DIR, ".sdd", "changes", "archive", "fix-legacy") });
	});

});

describe("closeChange — scope-only out-of-flow reconciliation", () => {
	const profile = "scope-only-out-of-flow";
	const reason = "Delivery predated the SDD lifecycle rollout.";

	function git(...args: string[]): string {
		return execFileSync("git", ["-C", DIR, ...args], { encoding: "utf8" }).trim();
	}

	function reconciliationFixture(change = "legacy-delivery", declaredNone = false): { source: string; evidencePath: string; identity: { head: string; tree: string; capturedAt: string } } {
		const summary = [
			"# Out-of-flow reconciliation",
			"Delivery occurred outside SDD.",
			"Excluded lifecycle artifacts: map.md, design.md, tasks.md, apply-progress.md, verify-report.md.",
			"## Repository verification",
			"- core-tests",
			"## Successor changes",
			"None.",
			"",
		].join("\n");
		const source = mkChange(change, {
			"scope.md": declaredNone
				? "# Historical scope\n\n## Spec delta declaration\nspec_delta: none\nspec_delta_reason: Delivery changed no canonical specification\n"
				: "# Historical scope\n",
			"summary.md": summary,
		});
		git("init", "-q");
		git("config", "user.email", "tests@example.invalid");
		git("config", "user.name", "Ein tests");
		git("add", ".");
		git("commit", "-qm", "fixture");
		const identity = {
			head: git("rev-parse", "HEAD"),
			tree: git("rev-parse", "HEAD^{tree}"),
			capturedAt: "2026-01-01T00:00:00.000Z",
		};
		const bytes = Buffer.byteLength(summary, "utf8");
		const evidence = {
			format: "ein-out-of-flow-reconciliation/v1",
			profile,
			change,
			auditReason: reason,
			createdAt: "2026-01-01T00:10:00.000Z",
			summary: { path: "summary.md", sha256: createHash("sha256").update(summary).digest("hex"), bytes },
			repositoryState: identity,
			repositoryChecks: [{
				id: "core-tests",
				performed: "bun test tests/sdd-close.test.ts",
				outcome: "pass",
				completedAt: "2026-01-01T00:05:00.000Z",
				evidenceRef: "ci://run/close#core-tests",
				repositoryState: identity,
			}],
		};
		writeFileSync(join(source, "out-of-flow-reconciliation.json"), JSON.stringify(evidence));
		return { source, evidencePath: `openspec/changes/${change}/out-of-flow-reconciliation.json`, identity };
	}

	test("archives an eligible record and returns a reconciliation receipt distinct from legacyEscape", () => {
		const fixture = reconciliationFixture();
		const result = closeChange(DIR, "legacy-delivery", {
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: reason,
		});
		expect(result.ok).toBe(true);
		expect(result.reconciliation).toMatchObject({ profile, change: "legacy-delivery", reason, checkIds: ["core-tests"], repositoryState: fixture.identity });
		expect(result).not.toHaveProperty("legacyEscape");
		expect(existsSync(fixture.source)).toBe(false);
		expect(existsSync(join(DIR, "openspec", "changes", "archive", "legacy-delivery", "summary.md"))).toBe(true);
	});

	test("also archives the exact spec_delta:none scope-only shape", () => {
		const fixture = reconciliationFixture("declared-none", true);
		const result = closeChange(DIR, "declared-none", {
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: reason,
		});
		expect(result.ok).toBe(true);
		expect(result.reconciliation?.change).toBe("declared-none");
		expect(result).not.toHaveProperty("legacyEscape");
	});

	test("accepts only an explicit profile and the canonical evidence path", () => {
		for (const options of [
			{ reconciliationEvidencePath: "openspec/changes/legacy-delivery/out-of-flow-reconciliation.json", legacyReason: reason },
			{ reconciliationProfile: profile, reconciliationEvidencePath: "out-of-flow-reconciliation.json", legacyReason: reason },
			{ reconciliationProfile: profile, reconciliationEvidencePath: "../copied.json", legacyReason: reason },
		]) {
			const fixture = reconciliationFixture();
			const result = closeChange(DIR, "legacy-delivery", options);
			expect(result.ok).toBe(false);
			expect(existsSync(fixture.source)).toBe(true);
		}
	});

	test("aggregates mixed-mode, malformed evidence, identity, and archive blockers before mutation", () => {
		const fixture = reconciliationFixture();
		const evidenceFile = join(fixture.source, "out-of-flow-reconciliation.json");
		const evidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
		evidence.repositoryState.tree = "f".repeat(40);
		evidence.format = "unknown-version";
		delete evidence.summary.sha256;
		writeFileSync(evidenceFile, JSON.stringify(evidence));
		mkdirSync(join(DIR, "openspec", "changes", "archive", "legacy-delivery"), { recursive: true });
		const result = closeChange(DIR, "legacy-delivery", {
			force: true,
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: reason,
		});
		const codes = result.blockers?.map((blocker) => blocker.code) ?? [];
		expect(codes).toContain("reconciliation-mixed-mode");
		expect(codes).toContain("archive-collision");
		expect(codes).toContain("reconciliation-evidence-malformed");
		expect(codes).toContain("reconciliation-repository-state-mismatch");
		expect(existsSync(fixture.source)).toBe(true);
		expect(existsSync(join(fixture.source, "summary.md"))).toBe(true);
	});

	test("denies mixed lifecycle shape before archive mutation", () => {
		const fixture = reconciliationFixture();
		writeFileSync(join(fixture.source, "map.md"), "retrospective map");
		const result = closeChange(DIR, "legacy-delivery", {
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: reason,
		});
		expect(result.blockers?.map((blocker) => blocker.code)).toContain("reconciliation-record-ineligible");
		expect(existsSync(fixture.source)).toBe(true);
	});

	test("independently rejects evidence after the repository HEAD changes", () => {
		const fixture = reconciliationFixture();
		writeFileSync(join(DIR, "delivered-code.ts"), "export const changed = true;\n");
		git("add", ".");
		git("commit", "-qm", "repository changed");
		const result = closeChange(DIR, "legacy-delivery", {
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: reason,
		});
		expect(result.blockers?.map((blocker) => blocker.code)).toContain("reconciliation-repository-state-mismatch");
		expect(existsSync(fixture.source)).toBe(true);
	});

	test("denies stale or mismatched summary and reason without reading alternate files or mutating", () => {
		const fixture = reconciliationFixture();
		writeFileSync(join(fixture.source, "summary.md"), "tampered");
		writeFileSync(join(DIR, "copied.json"), JSON.stringify({ format: "ein-out-of-flow-reconciliation/v1" }));
		const result = closeChange(DIR, "legacy-delivery", {
			reconciliationProfile: profile,
			reconciliationEvidencePath: fixture.evidencePath,
			legacyReason: "different reason",
		});
		const codes = result.blockers?.map((blocker) => blocker.code) ?? [];
		expect(codes).toContain("reconciliation-audit-reason-mismatch");
		expect(codes).toContain("reconciliation-summary-invalid");
		expect(existsSync(fixture.source)).toBe(true);
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

// RETIRADO (#4): el check de `behavior_coverage` exigia que verify DECLARASE una
// palabra en su informe; no comprobaba nada del codigo, y su ausencia generaba
// runs de "revisar verify-report.md para satisfacer el guardarrail". Lo que si
// protege calidad — que verify EJECUTE la suite — vive en sdd-verify.md, y la
// unica señal que el router necesita (`status: pass|fail`) sigue siendo error.
describe("verify — solo la señal que lee el router", () => {
	test("PASS sin behavior_coverage ya no genera issue de cobertura", () => {
		const r = lintPhaseArtifact("verify", "status: pass\n");
		expect(r.ok).toBe(true);
		expect(r.issues.some((i) => i.code.startsWith("behavior-coverage"))).toBe(false);
	});

	test("verify sin linea de status sigue bloqueando", () => {
		const r = lintPhaseArtifact("verify", "la suite pasa entera\n");
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.code === "missing-status-line")).toBe(true);
	});
});

describe("closeChange — force fail-closed matrix", () => {
	const READY = {
		"scope.md": "## Spec delta declaration\nspec_delta: none\nspec_delta_reason: fixture\n",
		"map.md": "# Map\n",
		"design.md": "# Design\n",
		"tasks.md": "status: ready\n- [x] done\n",
		"apply-progress.md": "status: complete\n",
		"verify-report.md": "status: pass\n",
		"summary.md": durableSummary("placeholder"),
	};
	function ready(name: string): string {
		const path = mkChange(name, READY);
		writeFileSync(join(path, "summary.md"), durableSummary(name));
		return path;
	}
	function declarationless(name: string): string {
		const path = ready(name);
		writeFileSync(join(path, "scope.md"), "# Scope legacy\n");
		return path;
	}

	test.each([
		["pending tasks", (p: string) => writeFileSync(join(p, "tasks.md"), "status: ready\n- [ ] pending\n"), "tasks-pending"],
		["blocked tasks", (p: string) => writeFileSync(join(p, "tasks.md"), "status: blocked\n- [ ] pending\n"), "tasks-pending"],
		["partial apply", (p: string) => writeFileSync(join(p, "apply-progress.md"), "status: partial\n"), "apply-not-complete"],
		["blocked apply", (p: string) => writeFileSync(join(p, "apply-progress.md"), "status: blocked\n"), "apply-not-complete"],
		["unknown apply", (p: string) => writeFileSync(join(p, "apply-progress.md"), "status: unknown\n"), "apply-not-complete"],
		["missing verify", (p: string) => rmSync(join(p, "verify-report.md")), "verify-missing"],
		["failed verify", (p: string) => writeFileSync(join(p, "verify-report.md"), "status: fail\n"), "verify-failed"],
		["unknown verify", (p: string) => writeFileSync(join(p, "verify-report.md"), "status: unknown\n"), "verify-unclear"],
		["missing summary", (p: string) => rmSync(join(p, "summary.md")), "summary-missing"],
		["pending spec", (p: string) => { writeFileSync(join(p, "scope.md"), "# Scope\n"); mkdirSync(join(p, "specs", "domain"), { recursive: true }); writeFileSync(join(p, "specs", "domain", "spec.md"), "# OpenSpec Delta\nformat: openspec-delta/v1\ndomain: domain\n\n## ADDED\n### Scenario: pending\ntitle: Pending\nrequirement: The system MUST wait\nGiven: ready\nWhen: close\nThen: blocked\n"); }, "spec-pending"],
		["malformed unresolved spec", (p: string) => writeFileSync(join(p, "scope.md"), "spec_delta: broken\n"), "spec-unresolved"],
	] as const)("force cannot bypass %s", (_name, mutate, expectedCode) => {
		const path = ready(`blocked-${_name.replaceAll(" ", "-")}`);
		mutate(path);
		const change = path.split("/").at(-1)!;
		expect(closeChange(DIR, change).ok).toBe(false);
		const result = closeChange(DIR, change, { force: true, legacyReason: "not relevant" });
		expect(result.ok).toBe(false);
		expect(result.blockers?.some((blocker) => blocker.code === expectedCode)).toBe(true);
		expect(existsSync(path)).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "archive", path.split("/").at(-1)!))).toBe(false);
	});

	test("eligible declarationless record requires force and a valid normalized reason", () => {
		declarationless("legacy");
		for (const legacyReason of [undefined, " ", "none", "N/A", "x".repeat(201)]) {
			const result = closeChange(DIR, "legacy", { force: true, legacyReason });
			expect(result.ok).toBe(false);
			expect(result.blockers?.some((blocker) => blocker.code === "legacy-reason-invalid")).toBe(true);
			expect(existsSync(join(DIR, "openspec", "changes", "legacy"))).toBe(true);
		}
		expect(closeChange(DIR, "legacy").ok).toBe(false);
		const result = closeChange(DIR, "legacy", { force: true, legacyReason: "  historic declaration missing  " });
		expect(result.legacyEscape).toEqual({ used: true, priorSpecState: "unresolved", eligibility: "declarationless-record", reason: "historic declaration missing" });
	});

	test("normal close and unused force retain the normal result shape", () => {
		ready("normal");
		expect(closeChange(DIR, "normal", { force: true, legacyReason: "ignored" })).toEqual({
			ok: true,
			from: join(DIR, "openspec", "changes", "normal"),
			to: join(DIR, "openspec", "changes", "archive", "normal"),
		});
	});

	test("multiple blockers are reported together and cannot be erased by legacy eligibility", () => {
		const path = declarationless("multiple");
		writeFileSync(join(path, "tasks.md"), "status: ready\n- [ ] pending\n");
		writeFileSync(join(path, "apply-progress.md"), "status: partial\n");
		const result = closeChange(DIR, "multiple", { force: true, legacyReason: "legacy" });
		expect(result.blockers?.map((blocker) => blocker.code)).toContain("tasks-pending");
		expect(result.blockers?.map((blocker) => blocker.code)).toContain("apply-not-complete");
		expect(existsSync(path)).toBe(true);
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
