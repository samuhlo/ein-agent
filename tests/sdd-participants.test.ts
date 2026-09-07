import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearAgentControlSession, routeAgentControl } from "../ein-pi/agent/lib/agent-controls.ts";
import { CLEANER_AUDIT_LIMITS } from "../ein-pi/agent/lib/cleaner-audit-evidence.ts";
import { deriveContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { readContinuityCheckpoint, writeContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { ensureEinGitignore } from "../ein-pi/agent/lib/gitignore.ts";
import { collectDelegationItems } from "../ein-pi/agent/lib/delegation-shape.ts";
import { projectProjectState } from "../ein-pi/agent/lib/project-state.ts";
import {
	admitSddParticipantCall,
	clearSddParticipantSession,
	completeSddParticipantCall,
	planSddParticipants,
	type SddParticipantTerminal,
} from "../ein-pi/agent/lib/sdd-participants.ts";

const roots: string[] = [];
const sessions = new Set<string>();

function fixture(session: string, cleaner: boolean, architect: boolean): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-sdd-participants-"));
	roots.push(cwd);
	sessions.add(session);
	mkdirSync(join(cwd, "src"));
	writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
	ensureEinGitignore(cwd);
	execFileSync("git", ["init", "-q"], { cwd });
	execFileSync("git", ["add", "src/a.ts"], { cwd });
	execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd });
	const change = join(cwd, "openspec/changes/change");
	mkdirSync(change, { recursive: true });
	writeFileSync(join(change, "scope.md"), "scope\n");
	writeFileSync(join(change, "map.md"), "map\n");
	writeFileSync(join(change, "design.md"), "design\n");
	writeFileSync(join(change, "tasks.md"), "status: ready\nblocked_by: none\n- [x] 1. done\n");
	writeFileSync(join(change, "apply-progress.md"), "status: complete\n\n## Files changed\n\n- `src/a.ts`\n");
	routeAgentControl(cwd, session, "cleaner", cleaner ? "on" : "off");
	routeAgentControl(cwd, session, "architect", architect ? "on" : "off");
	return cwd;
}

function setChangedFiles(cwd: string, paths: readonly string[]): void {
	writeFileSync(join(cwd, "openspec/changes/change/apply-progress.md"), `status: complete\n\n## Files changed\n\n${paths.map((path) => `- \`${path}\``).join("\n")}\n`);
}

function continuityPath(cwd: string): string {
	return join(cwd, "openspec/changes/change/continuity.json");
}

function finish(
	cwd: string,
	session: string,
	callId: string,
	agent: "ein-cleaner" | "ein-architect",
	task: string,
	result: SddParticipantTerminal = { status: "complete" },
): void {
	expect(admitSddParticipantCall(cwd, session, callId, agent, task)).toBeNull();
	expect(completeSddParticipantCall(cwd, session, callId, result)).toMatchObject({ ok: true });
}

function makeFiles(cwd: string, prefix: string, count: number, body = "x"): string[] {
	return Array.from({ length: count }, (_, index) => {
		const path = `src/${prefix}-${String(index).padStart(2, "0")}.ts`;
		writeFileSync(join(cwd, path), body);
		return path;
	});
}

afterEach(() => {
	for (const session of sessions) clearSddParticipantSession(session);
	sessions.clear();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ephemeral participant coordinator", () => {
	test("starts fresh after cleanup and never creates continuity.json", () => {
		const cwd = fixture("fresh", true, false);
		const first = planSddParticipants(cwd, "fresh", "change");
		expect(first.status).toBe("ready");
		expect(first.next?.agent).toBe("ein-cleaner");
		finish(cwd, "fresh", "first", "ein-cleaner", first.next!.task);
		expect(planSddParticipants(cwd, "fresh", "change").status).toBe("complete");
		expect(readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" }).status).not.toBe("valid");
		expect(() => readFileSync(continuityPath(cwd))).toThrow();

		clearSddParticipantSession("fresh");
		const restarted = planSddParticipants(cwd, "fresh", "change");
		expect(restarted.status).toBe("ready");
		expect(restarted.next?.agent).toBe("ein-cleaner");
		expect(restarted.next?.task).toContain(`slice=${restarted.slices[0]!.id}`);
	});

	test("leaves existing generic continuity bytes and revision untouched", () => {
		const cwd = fixture("continuity-independent", true, false);
		const derived = deriveContinuityCheckpoint(projectProjectState({ cwd }), {
			capturedAt: "2026-08-15T10:00:00Z",
			objective: "Keep generic continuity independent.",
			completed: [],
			nextAction: "Plan participants.",
			unresolvedDecisions: [],
		});
		expect(derived.ok).toBe(true);
		if (!derived.ok) return;
		expect(writeContinuityCheckpoint(cwd, { mode: "sdd", change: "change" }, derived.checkpoint, { kind: "absent" }).ok).toBe(true);
		const before = readFileSync(continuityPath(cwd));
		const beforeCheckpoint = readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" });
		expect(planSddParticipants(cwd, "continuity-independent", "change").status).toBe("ready");
		expect(readFileSync(continuityPath(cwd)).equals(before)).toBe(true);
		const afterCheckpoint = readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" });
		expect(afterCheckpoint).toEqual(beforeCheckpoint);
	});

	test("sorts the complete scope into contiguous exact-once bounded slices", () => {
		const cwd = fixture("slicing", true, false);
		const paths = makeFiles(cwd, "slice", CLEANER_AUDIT_LIMITS.maxFiles + 1);
		setChangedFiles(cwd, [...paths].reverse());
		const plan = planSddParticipants(cwd, "slicing", "change");
		const covered = plan.slices.flatMap((slice) => slice.paths);
		expect(covered).toEqual([...paths].sort());
		expect(new Set(covered).size).toBe(paths.length);
		expect(plan.slices.map((slice) => slice.fileCount)).toEqual([CLEANER_AUDIT_LIMITS.maxFiles, 1]);
		expect(plan.slices.every((slice) => slice.fileCount <= CLEANER_AUDIT_LIMITS.maxFiles && slice.sourceBytes <= CLEANER_AUDIT_LIMITS.maxSourceBytes)).toBe(true);
		expect(plan.slices[0]?.start).toBe(0);
		expect(plan.slices[1]?.start).toBe(plan.slices[0]!.end);

		clearSddParticipantSession("slicing");
		setChangedFiles(cwd, paths);
		expect(planSddParticipants(cwd, "slicing", "change").slices).toEqual(plan.slices);
	});

	test("uses raw UTF-8 bytes and keeps exact byte boundaries", () => {
		const cwd = fixture("bytes", true, false);
		const exact = "😀".repeat(CLEANER_AUDIT_LIMITS.maxSourceBytes / 4);
		writeFileSync(join(cwd, "src/exact.ts"), exact);
		writeFileSync(join(cwd, "src/next.ts"), "y");
		setChangedFiles(cwd, ["src/next.ts", "src/exact.ts"]);
		const plan = planSddParticipants(cwd, "bytes", "change");
		expect(plan.slices.map((slice) => slice.sourceBytes)).toEqual([CLEANER_AUDIT_LIMITS.maxSourceBytes, 1]);
		expect(plan.slices.flatMap((slice) => slice.paths)).toEqual(["src/exact.ts", "src/next.ts"]);
	});

	test("returns unavailable for one impossible file without offering a partial Cleaner task", () => {
		const cwd = fixture("impossible", true, false);
		const impossible = "src/impossible.ts";
		writeFileSync(join(cwd, impossible), "x".repeat(CLEANER_AUDIT_LIMITS.maxSourceBytes + 1));
		setChangedFiles(cwd, ["src/a.ts", impossible]);
		const plan = planSddParticipants(cwd, "impossible", "change");
		expect(plan.status).toBe("unavailable");
		expect(plan.next).toBeUndefined();
		expect(plan.planningBlockers).toEqual([expect.objectContaining({ code: "oversized-file", paths: [impossible] })]);
		expect([...plan.slices.flatMap((slice) => slice.paths), ...plan.planningBlockers.flatMap((blocker) => blocker.paths)].sort()).toEqual(["src/a.ts", impossible].sort());
	});

	test("handles a deleted changed-file as an unavailable whole-run plan", () => {
		const cwd = fixture("deleted-changed-file", true, false);
		const deleted = "src/deleted.ts";
		writeFileSync(join(cwd, deleted), "export const deleted = true;\n");
		setChangedFiles(cwd, [deleted, "src/a.ts"]);
		rmSync(join(cwd, deleted));

		const plan = planSddParticipants(cwd, "deleted-changed-file", "change");
		expect(plan.status).toBe("unavailable");
		expect(plan.next).toBeUndefined();
		expect(plan.planningBlockers).toEqual([
			expect.objectContaining({
				code: "scope-unavailable",
				paths: [deleted],
				reason: expect.stringContaining(`changed-file path is missing: ${deleted}`),
			}),
		]);
		expect(plan.slices.flatMap((slice) => slice.paths)).toEqual(["src/a.ts"]);
		expect(plan.slices.flatMap((slice) => slice.paths)).not.toContain(deleted);
	});

	test("keeps deleted paths out of lexical bounded slices across the full declared scope", () => {
		const cwd = fixture("deleted-boundaries", true, false);
		const inspectable = makeFiles(cwd, "slice", CLEANER_AUDIT_LIMITS.maxFiles + 2);
		const deleted = ["src/aaa-deleted.ts", "src/slice-15-deleted.ts", "src/zzz-deleted.ts"];
		for (const path of deleted) writeFileSync(join(cwd, path), "export const deleted = true;\n");
		setChangedFiles(cwd, [...inspectable, ...deleted].reverse());
		for (const path of deleted) rmSync(join(cwd, path));

		const plan = planSddParticipants(cwd, "deleted-boundaries", "change");
		const covered = plan.slices.flatMap((slice) => slice.paths);
		const blockerPaths = plan.planningBlockers.flatMap((blocker) => blocker.paths);
		expect(plan.status).toBe("unavailable");
		expect(plan.next).toBeUndefined();
		expect(covered).toEqual([...inspectable].sort());
		expect(new Set(covered).size).toBe(inspectable.length);
		expect(blockerPaths.filter((path) => deleted.includes(path)).sort()).toEqual([...deleted].sort());
		expect(new Set(blockerPaths.filter((path) => deleted.includes(path))).size).toBe(deleted.length);
		expect(covered.some((path) => deleted.includes(path))).toBe(false);
		expect(plan.slices.map((slice) => slice.fileCount)).toEqual([CLEANER_AUDIT_LIMITS.maxFiles, 2]);
		expect(plan.slices.every((slice) => slice.fileCount <= CLEANER_AUDIT_LIMITS.maxFiles && slice.sourceBytes <= CLEANER_AUDIT_LIMITS.maxSourceBytes)).toBe(true);
		expect(plan.slices.slice(1).every((slice, index) => slice.start === plan.slices[index]!.end)).toBe(true);
	});

	test("returns unavailable for non-UTF-8 source instead of filtering it", () => {
		const cwd = fixture("binary", true, false);
		const impossible = "src/binary.ts";
		writeFileSync(join(cwd, impossible), Buffer.from([0xff, 0xfe, 0x00]));
		setChangedFiles(cwd, ["src/a.ts", impossible]);
		const plan = planSddParticipants(cwd, "binary", "change");
		expect(plan.status).toBe("unavailable");
		expect(plan.next).toBeUndefined();
		expect(plan.planningBlockers).toEqual([expect.objectContaining({ code: "non-utf8-source", paths: [impossible] })]);
	});

	test("runs one foreground identity at a time and keeps Cleaner before Architect", () => {
		const cwd = fixture("ordered", true, true);
		const paths = makeFiles(cwd, "ordered", CLEANER_AUDIT_LIMITS.maxFiles + 1);
		setChangedFiles(cwd, paths);
		let plan = planSddParticipants(cwd, "ordered", "change");
		expect(plan.order).toEqual(["ein-cleaner", "ein-architect"]);
		expect(plan.next?.agent).toBe("ein-cleaner");
		expect(plan.next?.task).toContain("foreground-only");
	const firstTask = plan.next!.task;
		expect(admitSddParticipantCall(cwd, "ordered", "in-flight", "ein-cleaner", firstTask)).toBeNull();
		expect(admitSddParticipantCall(cwd, "ordered", "second", "ein-cleaner", firstTask)).toContain("already in flight");
	plan = planSddParticipants(cwd, "ordered", "change");
	expect(plan.status).toBe("ready");
	expect(plan.next?.task).toBe(firstTask);
	expect(completeSddParticipantCall(cwd, "ordered", "in-flight", { status: "complete" })).toMatchObject({ ok: true });
	plan = planSddParticipants(cwd, "ordered", "change");
	expect(plan.next?.agent).toBe("ein-cleaner");
	expect(plan.next?.task).toContain(`slice=${plan.slices[1]!.id}`);
	finish(cwd, "ordered", "second-slice", "ein-cleaner", plan.next!.task);
	plan = planSddParticipants(cwd, "ordered", "change");
	expect(plan.next?.agent).toBe("ein-architect");
	finish(cwd, "ordered", "architect", "ein-architect", plan.next!.task);
	expect(planSddParticipants(cwd, "ordered", "change").status).toBe("complete");
	});

	test("accepts only identity-bound terminal results and maps uncertainty to unavailable", () => {
		const cwd = fixture("honest", true, true);
		const initial = planSddParticipants(cwd, "honest", "change");
		expect(admitSddParticipantCall(cwd, "honest", "missing", "ein-cleaner", initial.next!.task)).toBeNull();
		expect(completeSddParticipantCall(cwd, "honest", "other-call", { status: "complete" })).toMatchObject({ ok: false });
		expect(planSddParticipants(cwd, "honest", "change").next?.agent).toBe("ein-cleaner");
		expect(completeSddParticipantCall(cwd, "honest", "missing", {} as SddParticipantTerminal)).toMatchObject({ ok: true, status: "unavailable" });
		expect(planSddParticipants(cwd, "honest", "change")).toMatchObject({ status: "unavailable", blocker: expect.stringContaining("missing") });

		clearSddParticipantSession("honest");
		const blocked = planSddParticipants(cwd, "honest", "change");
		finish(cwd, "honest", "blocked", "ein-cleaner", blocked.next!.task, { status: "blocked", reason: "explicit audit finding" });
		expect(planSddParticipants(cwd, "honest", "change")).toMatchObject({ status: "blocked", blocker: expect.stringContaining("explicit") });
	});

	test("advances the source seal only at accepted Cleaner completion and rejects later drift", () => {
		const cwd = fixture("seals", true, true);
		const first = planSddParticipants(cwd, "seals", "change");
		const sealA = first.next!.task.match(/state=([^\]]+)/)?.[1];
		expect(sealA).toMatch(/^sdd-scope-v1:sha256:/);
		expect(admitSddParticipantCall(cwd, "seals", "cleaner", "ein-cleaner", first.next!.task)).toBeNull();
		writeFileSync(join(cwd, "src/a.ts"), "export const a = 2;\n");
		expect(completeSddParticipantCall(cwd, "seals", "cleaner", { status: "complete" })).toMatchObject({ ok: true });
		const afterMutation = planSddParticipants(cwd, "seals", "change");
		const sealB = afterMutation.next?.task.match(/state=([^\]]+)/)?.[1];
		expect(sealB).toMatch(/^sdd-scope-v1:sha256:/);
		expect(sealB).not.toBe(sealA);
		expect(afterMutation.next?.agent).toBe("ein-architect");

		writeFileSync(join(cwd, "src/a.ts"), "export const a = 3;\n");
		expect(planSddParticipants(cwd, "seals", "change")).toMatchObject({ status: "unavailable", blocker: expect.stringContaining("drifted") });
	});

	test("admits a transported task with parent constraints but rejects changes to its scope", () => {
		const cwd = fixture("transport", true, true);
		const plan = planSddParticipants(cwd, "transport", "change");
		const original = plan.next!.task;
		const input = { workflowScript: `runs.run("audit", {agent: "ein-cleaner", task: ${JSON.stringify(original + "\n\nParent authority: audit only; do not mutate source.")}})` };
		const task = collectDelegationItems(input)[0]!.task!;
		expect(admitSddParticipantCall(cwd, "transport", "tampered", "ein-cleaner", task.replace("src/a.ts", "src/other.ts"))).toContain("task contract");
		expect(admitSddParticipantCall(cwd, "transport", "valid", "ein-cleaner", task)).toBeNull();
		expect(completeSddParticipantCall(cwd, "transport", "valid", { status: "complete" }).ok).toBe(true);
		expect(planSddParticipants(cwd, "transport", "change").next?.agent).toBe("ein-architect");
	});

	test("disabled participants are not invented and explicit completion is honest", () => {
		const cwd = fixture("none", false, false);
		expect(planSddParticipants(cwd, "none", "change")).toMatchObject({ status: "complete", order: [] });
		const architectOnly = fixture("architect-only", false, true);
		const plan = planSddParticipants(architectOnly, "architect-only", "change");
		expect(plan.next?.agent).toBe("ein-architect");
	});
});
