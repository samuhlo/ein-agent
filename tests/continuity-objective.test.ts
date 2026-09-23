import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { setContinuityObjective, showContinuityObjective } from "../ein-pi/agent/lib/continuity-objective.ts";
import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { writeAgreement } from "../ein-pi/agent/lib/intent-agreement.ts";
import { createIntentMaterialKey } from "../ein-pi/agent/lib/sdd-intent-preflight.ts";
import { initializeSddChange } from "../ein-pi/agent/lib/sdd-preflight-record.ts";

const roots: string[] = [];
const recordedAt = "2026-09-22T10:00:00Z";

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-objective-")); roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	writeFileSync(join(root, ".gitignore"), "/.ein/continuity.json\n"); writeFileSync(join(root, "safe.txt"), "safe\n");
	execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
	return root;
}

function checkpoint(root: string) {
	const read = readContinuityCheckpoint(root, { mode: "adhoc" });
	if (read.status !== "valid") throw new Error(read.status);
	return read.checkpoint;
}

function agreement(root: string, objective: string) {
	const material = { objective, boundaries: { in: ["Export"], out: ["Email"] }, completionCriteria: ["CSV is usable"] };
	const evidence = { kind: "intent" as const, work: "export-contacts", materialKey: createIntentMaterialKey(material), agreementRevision: `agreement-${objective.length}` };
	const dir = join(root, "openspec/changes", evidence.work);
	mkdirSync(dir, { recursive: true });
	writeAgreement(dir, { version: 1, work: evidence.work, change: evidence.work, status: "confirmed", material, materialKey: evidence.materialKey, revision: evidence.agreementRevision, questions: [], fromRequest: true, response: { id: "human-contract", text: objective, source: "interactive" } });
	return evidence;
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("continuity objective setter", () => {
	test("show and both producers share the selected checkpoint before preflight", () => {
		const root = fixture(); const evidence = agreement(root, "Exportar contactos");
		expect(setContinuityObjective(root, { objective: "Exportar contactos", evidence }, "absent").outcome).toBe("set");
		const shown = showContinuityObjective(root); expect(shown.kind).toBe("valid");
		if (shown.kind !== "valid") throw new Error("Missing objective");
		expect(setContinuityObjective(root, { objective: "Revisar exportacion", evidence: { kind: "pi-observed", requestId: "human-next", recordedAt } }, shown.expectedRevision).outcome).toBe("set");
		expect(showContinuityObjective(root)).toMatchObject({ kind: "valid", objective: "Revisar exportacion" });
		expect(existsSync(join(root, "openspec/changes/export-contacts/preflight.json"))).toBeFalse();
		const before = readContinuityCheckpoint(root, { mode: "sdd", change: "export-contacts" });
		expect(initializeSddChange(root, "export-contacts", "off", "standard", "pi").tdd).toBe("off");
		expect(readContinuityCheckpoint(root, { mode: "sdd", change: "export-contacts" })).toEqual(before);
	});

	test("invalid checkpoint metadata cannot make an existing change initialization admissible", () => {
		const root = fixture(); agreement(root, "Exportar contactos");
		writeFileSync(join(root, "openspec/changes/export-contacts/continuity.json"), "invalid");
		expect(() => initializeSddChange(root, "export-contacts", "off", "standard", "pi")).toThrow();
		expect(existsSync(join(root, "openspec/changes/export-contacts/preflight.json"))).toBeFalse();
	});

	test("refresh retries a changed canonical objective after a secondary publisher failure", async () => {
		const root = fixture(); agreement(root, "Exportar contactos");
		const lifecycle = createContinuityHandoffLifecycle(root, { now: () => recordedAt, runtimeAvailable: () => true });
		expect(await lifecycle.refresh()).toBe("refreshed");
		const updated = agreement(root, "Exportar solo contactos filtrados");
		expect(await lifecycle.refresh()).toBe("refreshed");
		expect(showContinuityObjective(root)).toMatchObject({ objective: "Exportar solo contactos filtrados", objectiveEvidence: updated });
	});

	test("keeps a later manual objective until a new canonical agreement supersedes it", async () => {
		const root = fixture(); const original = agreement(root, "Exportar contactos");
		const lifecycle = createContinuityHandoffLifecycle(root, { now: () => recordedAt, runtimeAvailable: () => true });
		await lifecycle.refresh(); const shown = showContinuityObjective(root); if (shown.kind !== "valid") throw new Error("Missing objective");
		await lifecycle.setObjective({ objective: "Revisar el formato CSV", evidence: { kind: "pi-observed", requestId: "manual-review", recordedAt, observedAgreementRevision: "forged" } }, shown.expectedRevision);
		await lifecycle.refresh();
		expect(showContinuityObjective(root)).toMatchObject({ objective: "Revisar el formato CSV", objectiveEvidence: { observedAgreementRevision: original.agreementRevision } });
		const next = agreement(root, "Exportar solo contactos filtrados"); await lifecycle.refresh();
		expect(showContinuityObjective(root)).toMatchObject({ objective: "Exportar solo contactos filtrados", objectiveEvidence: next });
	});

	test("leaving an SDD work never copies its objective into an unrelated ad-hoc checkpoint", async () => {
		const root = fixture(); agreement(root, "Exportar contactos");
		const lifecycle = createContinuityHandoffLifecycle(root, { now: () => recordedAt, runtimeAvailable: () => true });
		await lifecycle.refresh(); mkdirSync(join(root, "openspec/changes/archive"));
		renameSync(join(root, "openspec/changes/export-contacts"), join(root, "openspec/changes/archive/export-contacts"));
		expect(await lifecycle.refresh()).toBe("refreshed");
		expect(showContinuityObjective(root)).toMatchObject({ objective: "Continue the current project task safely.", objectiveEvidence: { kind: "unknown" } });
	});
	test("accepts a literal short objective only through an explicit observed request", () => {
		const root = fixture();
		const result = setContinuityObjective(root, { objective: "Sí", evidence: { kind: "pi-observed", requestId: "human-1", recordedAt } }, "absent");
		expect(result.outcome).toBe("set");
		expect(checkpoint(root)).toMatchObject({ version: 2, objective: "Sí", objectiveEvidence: { kind: "pi-observed", requestId: "human-1", recordedAt } });
	});

	test("uses the observed revision as CAS and never loses a newer objective", () => {
		const root = fixture();
		setContinuityObjective(root, { objective: "Objetivo A", evidence: { kind: "pi-observed", requestId: "human-a", recordedAt } }, "absent");
		const revision = checkpoint(root).revision;
		expect(setContinuityObjective(root, { objective: "Objetivo B", evidence: { kind: "pi-observed", requestId: "human-b", recordedAt } }, revision).outcome).toBe("set");
		const stale = setContinuityObjective(root, { objective: "Objetivo C", evidence: { kind: "pi-observed", requestId: "human-c", recordedAt } }, revision);
		expect(stale.outcome).toBe("conflict"); expect(checkpoint(root).objective).toBe("Objetivo B");
	});

	test("keeps the previous checkpoint on invalid or oversized input", () => {
		const root = fixture();
		setContinuityObjective(root, { objective: "Objetivo seguro", evidence: { kind: "claude-attested", requestId: "request-1", recordedAt } }, "absent");
		for (const objective of ["password=secret", "x".repeat(513)]) {
			const revision = checkpoint(root).revision;
			expect(setContinuityObjective(root, { objective, evidence: { kind: "claude-attested", requestId: "request-2", recordedAt } }, revision).outcome).toBe("invalid");
			expect(checkpoint(root).objective).toBe("Objetivo seguro");
		}
	});

	test("does not create SDD state to satisfy an ad-hoc intent producer", () => {
		const root = fixture();
		const result = setContinuityObjective(root, { objective: "Exportar contactos", evidence: { kind: "intent", work: "export-contacts", materialKey: `sha256:${"a".repeat(64)}`, agreementRevision: "agreement-1" } }, "absent");
		expect(result.outcome).toBe("set");
		expect(existsSync(join(root, "openspec", "changes"))).toBeFalse();
		expect(checkpoint(root)).toMatchObject({ objective: "Exportar contactos", objectiveEvidence: { kind: "intent", work: "export-contacts" } });
	});

	test("writes intent provenance into the selected change checkpoint", () => {
		const root = fixture(); mkdirSync(join(root, "openspec", "changes", "export-contacts"), { recursive: true }); writeFileSync(join(root, "openspec", "changes", "export-contacts", "preflight.json"), "{}\n");
		const result = setContinuityObjective(root, { objective: "Exportar contactos", evidence: { kind: "intent", work: "export-contacts", materialKey: `sha256:${"a".repeat(64)}`, agreementRevision: "agreement-1" } }, "absent");
		expect(result.outcome).toBe("set");
		const read = readContinuityCheckpoint(root, { mode: "sdd", change: "export-contacts" });
		expect(read.status === "valid" && read.checkpoint).toMatchObject({ objective: "Exportar contactos", objectiveEvidence: { kind: "intent", work: "export-contacts" } });
	});
});
