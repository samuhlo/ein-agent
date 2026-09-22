import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureVerificationSurface, type VerificationGitEntry, type VerificationSurfaceCapture, type VerificationSurfaceEntry } from "../shared/sdd/sdd-verification-surface.ts";

let root: string;
let changePath: string;
let entries: VerificationGitEntry[];

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "ein-verification-surface-"));
	changePath = join(root, "openspec/changes/probe");
	mkdirSync(changePath, { recursive: true });
	writeFileSync(join(root, "code.json"), "{\"ok\":true}\n");
	writeFileSync(join(root, "config.yaml"), "enabled: true\n");
	writeFileSync(join(root, "NOTICE"), "stable\n");
	entries = ["NOTICE", "code.json", "config.yaml"].map((path) => ({ path, kind: "file" as const }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function capture(previousEntries?: readonly VerificationSurfaceEntry[]): VerificationSurfaceCapture {
	return captureVerificationSurface(root, changePath, {
		enumerateGit: () => ({ ok: true, root, entries }),
		...(previousEntries ? { previousEntries } : {}),
	});
}
describe("captureVerificationSurface", () => {
	test("detecta contenido, modo, altas y borrados incluso conservando mtime", () => {
		const first = capture();
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		const fixed = new Date(1_700_000_000_000);
		utimesSync(join(root, "code.json"), fixed, fixed);
		writeFileSync(join(root, "code.json"), "{\"ok\":false}\n");
		utimesSync(join(root, "code.json"), fixed, fixed);
		const edited = capture(first.entries);
		expect(edited.ok && edited.surfaceRef).not.toBe(first.surfaceRef);
		writeFileSync(join(root, "new-file"), "new\n");
		entries.push({ path: "new-file", kind: "file" });
		const added = capture(first.entries);
		expect(added.ok && added.surfaceRef).not.toBe(first.surfaceRef);
		rmSync(join(root, "NOTICE"));
		entries = entries.filter((entry) => entry.path !== "NOTICE");
		const deleted = capture(first.entries);
		expect(deleted.ok).toBe(true);
		if (deleted.ok) expect(deleted.entries).toContainEqual({ path: "NOTICE", kind: "file", executable: false, sha256: "missing" });
		writeFileSync(join(root, "NOTICE"), "stable\n");
		entries.push({ path: "NOTICE", kind: "file" });
		chmodSync(join(root, "NOTICE"), 0o755);
		const mode = capture(first.entries);
		expect(mode.ok && mode.surfaceRef).not.toBe(first.surfaceRef);
	});

	test("detecta renombre y aparición de una ruta antes ausente", () => {
		entries.push({ path: "declared-later", kind: "file" });
		const missing = capture();
		expect(missing.ok).toBe(true);
		if (!missing.ok) return;
		writeFileSync(join(root, "declared-later"), "present\n");
		const appeared = capture(missing.entries);
		expect(appeared.ok && appeared.surfaceRef).not.toBe(missing.surfaceRef);
		rmSync(join(root, "config.yaml"));
		writeFileSync(join(root, "renamed.yaml"), "enabled: true\n");
		entries = entries.filter((entry) => entry.path !== "config.yaml");
		entries.push({ path: "renamed.yaml", kind: "file" });
		const renamed = capture(missing.entries);
		expect(renamed.ok && renamed.surfaceRef).not.toBe(missing.surfaceRef);
	});

	test("un fichero sin permiso degrada la captura", () => {
		chmodSync(join(root, "NOTICE"), 0o000);
		try {
			const result = capture();
			if (process.getuid?.() !== 0) expect(result).toMatchObject({ ok: false, code: "read-unavailable" });
		} finally {
			chmodSync(join(root, "NOTICE"), 0o644);
		}
	});

	test("separa decisiones y excluye artefactos de proceso sin excluir specs", () => {
		writeFileSync(join(changePath, "tasks.md"), "one\n");
		writeFileSync(join(changePath, "verify-report.md"), "status: pass\n");
		writeFileSync(join(changePath, "verification-receipt.json"), "{}\n");
		mkdirSync(join(root, "openspec/specs/widget"), { recursive: true });
		writeFileSync(join(root, "openspec/specs/widget/spec.md"), "spec\n");
		entries.push(
			{ path: "openspec/changes/probe/tasks.md", kind: "file" },
			{ path: "openspec/changes/probe/verify-report.md", kind: "file" },
			{ path: "openspec/changes/probe/verification-receipt.json", kind: "file" },
			{ path: "openspec/specs/widget/spec.md", kind: "file" },
		);
		const first = capture();
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.entries.map((entry) => entry.path)).toContain("openspec/specs/widget/spec.md");
		expect(first.entries.map((entry) => entry.path)).not.toContain("openspec/changes/probe/verify-report.md");
		writeFileSync(join(changePath, "verify-report.md"), "rewritten\n");
		const reportChanged = capture(first.entries);
		expect(reportChanged.ok && reportChanged.surfaceRef).toBe(first.surfaceRef);
		writeFileSync(join(changePath, "tasks.md"), "two\n");
		const decisionChanged = capture(first.entries);
		expect(decisionChanged.ok && decisionChanged.surfaceRef).toBe(first.surfaceRef);
		expect(decisionChanged.ok && decisionChanged.decisionRef).not.toBe(first.decisionRef);
	});

	test("falla cerrado con gitlink, symlink externo, límite o Git ilegible", () => {
		entries.push({ path: "vendor/submodule", kind: "gitlink" });
		expect(capture()).toMatchObject({ ok: false, code: "unsupported-surface" });
		entries.pop();
		symlinkSync(tmpdir(), join(root, "outside"));
		entries.push({ path: "outside", kind: "file" });
		expect(capture()).toMatchObject({ ok: false, code: "symlink-unavailable" });
		expect(captureVerificationSurface(root, changePath, { enumerateGit: () => ({ ok: false, code: "git-error", reason: "no Git" }) })).toEqual({ ok: false, code: "git-error", reason: "no Git" });
		expect(captureVerificationSurface(root, changePath, { enumerateGit: () => ({ ok: true, root, entries: entries.slice(0, 2) }), limits: { maxEntries: 1 } })).toMatchObject({ ok: false, code: "limit-exceeded" });
	});
});
