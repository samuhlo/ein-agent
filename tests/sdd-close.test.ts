// =============================================================================
// TESTS: sdd-close (mover determinista) + lint por fase
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeChange } from "../ein-pi/agent/lib/sdd-close";
import { lintChange, lintPhaseArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

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
		mkChange("feat-x", { "summary.md": "# Resumen\nqué cambió", "design.md": "x" });
		const r = closeChange(DIR, "feat-x");
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "feat-x"))).toBe(false);
		const closed = join(DIR, "openspec", "changes", "archive", "feat-x");
		expect(existsSync(join(closed, "summary.md"))).toBe(true);
		expect(readFileSync(join(closed, "summary.md"), "utf8")).toContain("qué cambió");
	});

	test("no pisa si ya existe en storage interno (idempotente-safe)", () => {
		mkChange("feat-x", { "summary.md": "v1" });
		expect(closeChange(DIR, "feat-x").ok).toBe(true);
		mkChange("feat-x", { "summary.md": "v2" });
		const r2 = closeChange(DIR, "feat-x");
		expect(r2.ok).toBe(false);
		expect(r2.reason).toContain("archive");
	});

	test("nombre inválido se rechaza", () => {
		expect(closeChange(DIR, "../escape").ok).toBe(false);
		expect(closeChange(DIR, "archive").ok).toBe(false);
	});

	test("cierra cambios en la raíz legacy .sdd/changes/", () => {
		const p = join(DIR, ".sdd", "changes", "fix-legacy");
		mkdirSync(p, { recursive: true });
		writeFileSync(join(p, "summary.md"), "# Resumen legacy");
		const r = closeChange(DIR, "fix-legacy");
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, ".sdd", "changes", "archive", "fix-legacy", "summary.md"))).toBe(true);
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
