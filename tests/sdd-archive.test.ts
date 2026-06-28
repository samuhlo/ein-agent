// =============================================================================
// TESTS: sdd-archive (mover determinista) + lint por fase
// =============================================================================

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { archiveChange } from "../ein-pi/agent/lib/sdd-archive";
import { lintChange, lintPhaseArtifact } from "../ein-pi/agent/lib/sdd-guardrails";

let DIR: string;
function mkChange(name: string, files: Record<string, string>): string {
	const p = join(DIR, "openspec", "changes", name);
	mkdirSync(p, { recursive: true });
	for (const [f, body] of Object.entries(files)) writeFileSync(join(p, f), body);
	return p;
}

beforeEach(() => {
	DIR = mkdtempSync(join(tmpdir(), "sdd-archive-"));
});
afterEach(() => {
	rmSync(DIR, { recursive: true, force: true });
});

describe("archiveChange", () => {
	test("mueve el cambio a archive/ y conserva summary.md", () => {
		mkChange("feat-x", { "summary.md": "# Resumen\nqué cambió", "design.md": "x" });
		const r = archiveChange(DIR, "feat-x");
		expect(r.ok).toBe(true);
		expect(existsSync(join(DIR, "openspec", "changes", "feat-x"))).toBe(false);
		const archived = join(DIR, "openspec", "changes", "archive", "feat-x");
		expect(existsSync(join(archived, "summary.md"))).toBe(true);
		expect(readFileSync(join(archived, "summary.md"), "utf8")).toContain("qué cambió");
	});

	test("no pisa si ya existe en archive/ (idempotente-safe)", () => {
		mkChange("feat-x", { "summary.md": "v1" });
		expect(archiveChange(DIR, "feat-x").ok).toBe(true);
		mkChange("feat-x", { "summary.md": "v2" });
		const r2 = archiveChange(DIR, "feat-x");
		expect(r2.ok).toBe(false);
		expect(r2.reason).toContain("archive");
	});

	test("nombre inválido se rechaza", () => {
		expect(archiveChange(DIR, "../escape").ok).toBe(false);
		expect(archiveChange(DIR, "archive").ok).toBe(false);
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
			"init.md": "scope: x\nbudget_allocated: 1",
			"verify-report.md": "no status here",
		});
		const r = lintChange(DIR, "feat-x");
		expect(r.phases.find((p) => p.phase === "init")?.present).toBe(true);
		expect(r.phases.find((p) => p.phase === "design")?.present).toBe(false);
		expect(r.ok).toBe(false); // verify sin status line
	});
});
