import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPhaseReceiptService } from "../shared/sdd/sdd-phase-receipt.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(freshness: "current" | "stale" = "current") {
	const cwd = mkdtempSync(join(tmpdir(), "ein-phase-receipt-"));
	roots.push(cwd);
	const changes = join(cwd, "openspec/changes");
	mkdirSync(changes, { recursive: true });
	let token = 0;
	let clock = 0;
	const api = createPhaseReceiptService({
		now: () => new Date(1_700_000_000_000 + clock++ * 1000).toISOString(),
		newToken: () => `nonce-${++token}`,
		readVerification: () => ({ state: freshness, reason: freshness }),
	});
	const change = (name = "change-a") => { const path = join(changes, name); mkdirSync(path, { recursive: true }); return path; };
	return { cwd, api, change };
}

describe("phase receipt service", () => {
	test("liga begin y complete a toolCallId, cambio, fase, nonce y digest", () => {
		const f = fixture();
		const dir = f.change();
		writeFileSync(join(dir, "map.md"), "# Map\nscope_status: valid\n");
		const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "map", toolCallId: "call-a" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "map", toolCallId: "call-a" })).toEqual(begun);
		expect(f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "call-a" })).toMatchObject({ ok: false, code: "run-conflict" });
		f.change("change-b");
		expect(f.api.beginPhaseRun({ cwd: f.cwd, change: "change-b", phase: "map", toolCallId: "call-a" })).toMatchObject({ ok: false, code: "run-conflict" });
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-a", nonce: "wrong", status: "complete" })).toMatchObject({ ok: false, code: "nonce-mismatch" });
		const finished = f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-a", nonce: begun.value.nonce, status: "complete" });
		expect(finished.ok).toBe(true);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-a", nonce: begun.value.nonce, status: "complete" })).toEqual(finished);
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "call-a", nonce: begun.value.nonce, change: "change-a", phase: "map", version: 1 }).state).toBe("complete");
		writeFileSync(join(dir, "map.md"), "# Map\nscope_status: changed\n");
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "call-a" }).state).toBe("invalid");
	});

	test("un artefacto ajeno o un borrador sin recibo no completa la ejecución", () => {
		const f = fixture();
		const a = f.change("change-a");
		const b = f.change("change-b");
		writeFileSync(join(a, "design.md"), "draft\n");
		writeFileSync(join(b, "design.md"), "finished elsewhere\n");
		const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "call-a" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "call-a" })).toMatchObject({ state: "unconfirmed" });
		expect(readFileSync(join(a, ".phase-runs", createHash("sha256").update("call-a").digest("hex"), "launch.json"), "utf8")).toContain("change-a");
	});

	test("partial conserva el motivo y nunca se asciende a complete", () => {
		const f = fixture(); const dir = f.change();
		writeFileSync(join(dir, "design.md"), "partial design\n");
		const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "call-partial" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-partial", nonce: begun.value.nonce, status: "partial", reason: "missing decision" }).ok).toBe(true);
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "call-partial" })).toMatchObject({ state: "partial", reason: "missing decision" });
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-partial", nonce: begun.value.nonce, status: "complete" })).toMatchObject({ ok: false, code: "already-finished" });
	});

	test("apply parcial y verify stale rechazan complete", () => {
		const f = fixture("stale"); const dir = f.change();
		writeFileSync(join(dir, "tasks.md"), "status: ready\nblocked_by: none\n- [ ] pending\n- verify: bun test\n");
		writeFileSync(join(dir, "apply-progress.md"), "status: partial\n");
		let begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "apply", toolCallId: "call-apply" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-apply", nonce: begun.value.nonce, status: "complete" })).toMatchObject({ ok: false, code: "phase-incomplete" });
		writeFileSync(join(dir, "verify-report.md"), "status: pass\nbehavior_coverage: verified\n");
		writeFileSync(join(dir, "verification-receipt.json"), "{}\n");
		begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "verify", toolCallId: "call-verify" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "call-verify", nonce: begun.value.nonce, status: "complete" })).toMatchObject({ ok: false, code: "verification-not-current" });
	});

	test("rechaza un change symlink sin escribir fuera de la raíz", () => {
		const f = fixture();
		const outside = mkdtempSync(join(tmpdir(), "ein-phase-outside-")); roots.push(outside);
		symlinkSync(outside, join(f.cwd, "openspec/changes/escape"));
		expect(f.api.beginPhaseRun({ cwd: f.cwd, change: "escape", phase: "map", toolCallId: "call" })).toMatchObject({ ok: false, code: "unsafe-change" });
		expect(existsSync(join(outside, ".phase-runs"))).toBe(false);
	});

	test("a malformed intent cannot be treated as an absent legacy agreement", () => {
		const f = fixture(); const dir = f.change();
		writeFileSync(join(dir, "design.md"), "Draft reviewed\n");
		const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "intent" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "intent", nonce: begun.value.nonce, status: "complete" }).ok).toBe(true);
		writeFileSync(join(dir, "intent.md"), "malformed agreement\n");
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "intent" }).state).toBe("invalid");
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "intent", nonce: begun.value.nonce, status: "complete" }).ok).toBe(false);
		expect(f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "another" }).ok).toBe(false);
	});

	test("completion and launch must retain the requested tool call identity", () => {
		for (const file of ["launch.json", "completion.json"]) {
			const f = fixture(); const dir = f.change();
			writeFileSync(join(dir, "design.md"), "Reviewed design\n");
			const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "design", toolCallId: "identity" });
			if (!begun.ok) throw new Error(begun.reason);
			expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "identity", nonce: begun.value.nonce, status: "complete" }).ok).toBe(true);
			const path = join(dir, ".phase-runs", createHash("sha256").update("identity").digest("hex"), file);
			const record = JSON.parse(readFileSync(path, "utf8"));
			writeFileSync(path, JSON.stringify({ ...record, toolCallId: "another-run" }));
			expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "identity" }).state).toBe("invalid");
		}
	});

	test("reopened tasks invalidate a previously completed apply without rewriting its artifact", () => {
		const f = fixture(); const dir = f.change();
		writeFileSync(join(dir, "tasks.md"), "- [x] completed\n- verify: bun test\n");
		writeFileSync(join(dir, "apply-progress.md"), "status: complete\n");
		const begun = f.api.beginPhaseRun({ cwd: f.cwd, change: "change-a", phase: "apply", toolCallId: "reopened" });
		if (!begun.ok) throw new Error(begun.reason);
		expect(f.api.finishPhaseRun({ cwd: f.cwd, toolCallId: "reopened", nonce: begun.value.nonce, status: "complete" }).ok).toBe(true);
		writeFileSync(join(dir, "tasks.md"), "- [ ] pending again\n- verify: bun test\n");
		expect(f.api.assessPhaseRecovery({ cwd: f.cwd, toolCallId: "reopened" }).state).toBe("invalid");
	});
});
