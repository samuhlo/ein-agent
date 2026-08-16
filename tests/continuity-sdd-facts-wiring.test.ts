import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { projectProjectState, type ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";
import type { SddChangeStatus } from "../ein-pi/agent/lib/sdd-router.ts";

const CHANGE = "populate-continuity-facts";
const GENERIC_NEXT = "Inspect current project state and continue from a verified boundary.";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-sdd-facts-")); roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	writeFileSync(join(root, ".gitignore"), "/.ein/continuity.json\n");
	writeFileSync(join(root, "safe.txt"), "initial\n");
	execFileSync("git", ["add", "."], { cwd: root });
	execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
	mkdirSync(join(root, "openspec", "changes", CHANGE), { recursive: true });
	return root;
}

function sddState(root: string): () => ProjectStateV1 {
	const base = projectProjectState({ cwd: root });
	return () => ({ ...base, openspec: { ...base.openspec, quality: "current", reason: "read-success", activeChanges: [CHANGE], selection: "selected", selectedChange: CHANGE, provenance: "canonical" } });
}

const stubStatus = (): SddChangeStatus => ({
	change: CHANGE,
	nextRecommended: "apply",
	blocked: ["verify-stale"],
	tasks: {
		present: true, status: "ready", blockedBy: null,
		items: [{ id: "1.1", title: "Derive the facts", done: true }, { id: "1.2", title: "Wire the port", done: false }],
		nextPending: { id: "1.2", title: "Wire the port", done: false },
		counts: { pending: 1, ready: 1, blocked: 0, done: 1 }, problems: [],
	},
} as unknown as SddChangeStatus);

function stored(root: string) {
	const result = readContinuityCheckpoint(root, { mode: "sdd", change: CHANGE });
	if (result.status !== "valid") throw new Error(result.status);
	return result.checkpoint;
}

describe("continuity checkpoint carries SDD progress", () => {
	test("an active change replaces the generic placeholders with facts from disk", async () => {
		const root = fixture();
		const lifecycle = createContinuityHandoffLifecycle(root, {
			now: () => "2026-08-16T10:00:00Z", runtimeAvailable: () => true, processObservation: () => "unknown",
			projectState: sddState(root), sddStatus: stubStatus,
		});
		expect(await lifecycle.refresh(true)).toBe("refreshed");

		const checkpoint = stored(root);
		expect(checkpoint.completed).toEqual(["Derive the facts"]);
		expect(checkpoint.nextAction).toBe(`Resume SDD change ${CHANGE} at pending task 1.2: Wire the port`);
		expect(checkpoint.unresolvedDecisions).toEqual(["verify-stale"]);
	});

	// Fail-closed: una lectura rota nunca inventa progreso, vuelve al genérico.
	test("a failing status read degrades to the generic facts", async () => {
		const root = fixture();
		const lifecycle = createContinuityHandoffLifecycle(root, {
			now: () => "2026-08-16T10:00:00Z", runtimeAvailable: () => true, processObservation: () => "unknown",
			projectState: sddState(root), sddStatus: () => { throw new Error("unreadable"); },
		});
		expect(await lifecycle.refresh(true)).toBe("refreshed");

		const checkpoint = stored(root);
		expect(checkpoint.completed).toEqual([]);
		expect(checkpoint.nextAction).toBe(GENERIC_NEXT);
	});
});
