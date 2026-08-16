import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearAgentControlSession, routeAgentControl } from "../ein-pi/agent/lib/agent-controls.ts";
import { deriveContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { readContinuityCheckpoint, writeContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { projectProjectState } from "../ein-pi/agent/lib/project-state.ts";
import { admitSddParticipantCall, clearSddParticipantSession, completeSddParticipantCall, guardSddVerify, planSddParticipants } from "../ein-pi/agent/lib/sdd-participants.ts";

const roots: string[] = [];
const sessions = ["off-off", "on-off", "off-on", "on-on", "blocked", "fresh", "once", "project"];

function fixture(session: string, cleaner: boolean, architect: boolean): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-sdd-participants-"));
	roots.push(cwd);
	mkdirSync(join(cwd, "src"));
	writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
	writeFileSync(join(cwd, ".gitignore"), "openspec/changes/*/continuity.json\n");
	execFileSync("git", ["init", "-q"], { cwd });
	execFileSync("git", ["add", "src/a.ts"], { cwd });
	execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd });
	const change = join(cwd, "openspec/changes/change");
	mkdirSync(change, { recursive: true });
	writeFileSync(join(change, "tasks.md"), "status: ready\n- [x] 1. done\n");
	writeFileSync(join(change, "apply-progress.md"), "status: complete\n\n## Files changed\n\n- `src/a.ts`\n");
	routeAgentControl(cwd, session, "cleaner", cleaner ? "on" : "off");
	routeAgentControl(cwd, session, "architect", architect ? "on" : "off");
	const checkpoint = deriveContinuityCheckpoint(projectProjectState({ cwd }), { capturedAt: "2026-08-15T10:00:00Z", objective: "Test participants.", completed: [], nextAction: "Plan participants.", unresolvedDecisions: [] });
	if (!checkpoint.ok || checkpoint.checkpoint.mode !== "sdd" || !writeContinuityCheckpoint(cwd, { mode: "sdd", change: "change" }, checkpoint.checkpoint, { kind: "absent" }).ok) throw new Error("checkpoint fixture failed");
	return cwd;
}

function setChangedFiles(cwd: string, paths: readonly string[]): void {
	writeFileSync(join(cwd, "openspec/changes/change/apply-progress.md"), `status: complete\n\n## Files changed\n\n${paths.map((path) => `- \`${path}\``).join("\n")}\n`);
}

function finish(cwd: string, session: string, call: string, agent: "ein-cleaner" | "ein-architect", task: string, output = "status: complete"): void {
	expect(admitSddParticipantCall(cwd, session, call, agent, task)).toBeNull();
	completeSddParticipantCall(cwd, call, false, output);
}

afterEach(() => {
	for (const session of sessions) { clearAgentControlSession(session); clearSddParticipantSession(session); }
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("automatic SDD participant sequence", () => {
	for (const [session, cleaner, architect, order] of [
		["off-off", false, false, []], ["on-off", true, false, ["ein-cleaner"]],
		["off-on", false, true, ["ein-architect"]], ["on-on", true, true, ["ein-cleaner", "ein-architect"]],
	] as const) test(`${session} has exact order`, () => {
		const cwd = fixture(session, cleaner, architect);
		let plan = planSddParticipants(cwd, session, "change");
		expect(plan.order).toEqual(order);
		for (const [index, agent] of order.entries()) {
			expect(plan.next?.agent).toBe(agent);
			finish(cwd, session, `${session}-${index}`, agent, plan.next!.task);
			plan = planSddParticipants(cwd, session, "change");
		}
		expect(plan.status).toBe("complete");
		expect(guardSddVerify(cwd, session, "change")).toBeNull();
	});

	test("blocked participant prevents verify", () => {
		const cwd = fixture("blocked", true, true);
		const plan = planSddParticipants(cwd, "blocked", "change");
		finish(cwd, "blocked", "b", "ein-cleaner", plan.next!.task, "status: blocked\nreason: audit unavailable");
		expect(guardSddVerify(cwd, "blocked", "change")).toContain("ein-cleaner did not complete");
	});

	test("blocked Architect prevents verify after Cleaner completes", () => {
		const cwd = fixture("blocked", true, true);
		const cleaner = planSddParticipants(cwd, "blocked", "change").next!;
		finish(cwd, "blocked", "bc", "ein-cleaner", cleaner.task);
		const architect = planSddParticipants(cwd, "blocked", "change").next!;
		finish(cwd, "blocked", "ba", "ein-architect", architect.task, "status: incomplete");
		expect(guardSddVerify(cwd, "blocked", "change")).toContain("pending");
	});

	test("Architect receives fresh post-Cleaner state and stale handoffs reject", () => {
		const cwd = fixture("fresh", true, true);
		const cleaner = planSddParticipants(cwd, "fresh", "change").next!;
		expect(admitSddParticipantCall(cwd, "fresh", "c", "ein-cleaner", cleaner.task)).toBeNull();
		writeFileSync(join(cwd, "src/a.ts"), "export const a = 2;\n");
		completeSddParticipantCall(cwd, "c", false, "status: complete");
		const architect = planSddParticipants(cwd, "fresh", "change").next!;
		expect(planSddParticipants(cwd, "fresh", "change").passageId).toBe(cleaner.task.match(/passage=([a-f0-9]+)/)![1]!);
		expect(architect.task).not.toContain(cleaner.task.match(/state=([^\]\s]+)/)![1]!);
		expect(admitSddParticipantCall(cwd, "fresh", "stale", "ein-architect", cleaner.task.replace("ein-cleaner", "ein-architect"))).not.toBeNull();
		finish(cwd, "fresh", "a", "ein-architect", architect.task);
	});

	test("a participant runs at most once per apply passage", () => {
		const cwd = fixture("once", true, true);
		const cleaner = planSddParticipants(cwd, "once", "change").next!;
		finish(cwd, "once", "first", "ein-cleaner", cleaner.task);
		expect(admitSddParticipantCall(cwd, "once", "retry", "ein-cleaner", cleaner.task)).toContain("expected ein-architect");
	});

	test("unchanged state reuses the same passage for pending and completed resume", () => {
		const cwd = fixture("once", true, false);
		const first = planSddParticipants(cwd, "once", "change");
		const resumed = planSddParticipants(cwd, "once", "change");
		expect(resumed.passageId).toBe(first.passageId);
		expect(resumed.next?.task).toBe(first.next?.task);
		finish(cwd, "once", "same", "ein-cleaner", resumed.next!.task);
		const completed = planSddParticipants(cwd, "once", "change");
		expect(completed).toMatchObject({ status: "complete", passageId: first.passageId });
	});

	test("mutation after completion creates a fresh generation and blocks stale verify", () => {
		const cwd = fixture("once", true, false);
		const first = planSddParticipants(cwd, "once", "change");
		finish(cwd, "once", "complete", "ein-cleaner", first.next!.task);
		expect(guardSddVerify(cwd, "once", "change")).toBeNull();
		writeFileSync(join(cwd, "src/a.ts"), "export const a = 3;\n");
		const next = planSddParticipants(cwd, "once", "change");
		expect(next.passageId).not.toBe(first.passageId);
		expect(next.next?.agent).toBe("ein-cleaner");
		expect(guardSddVerify(cwd, "once", "change")).toContain("pending");
	});

	test("unchanged apply text with new source state cannot collide", () => {
		const cwd = fixture("once", false, true);
		const first = planSddParticipants(cwd, "once", "change");
		writeFileSync(join(cwd, "src/a.ts"), "export const a = 4;\n");
		const next = planSddParticipants(cwd, "once", "change");
		expect(next.passageId).not.toBe(first.passageId);
		expect(next.next?.task).not.toBe(first.next?.task);
	});

	test("first post-apply plan freezes order across sessions", () => {
		const cwd = fixture("project", false, false);
		mkdirSync(join(cwd, ".pi/ein"), { recursive: true });
		writeFileSync(join(cwd, ".pi/ein/agents.json"), JSON.stringify({ agents: {
			cleaner: { enabled: true }, architect: { enabled: false },
		} }));
		clearAgentControlSession("new-project");
		expect(planSddParticipants(cwd, "new-project", "change").order).toEqual(["ein-cleaner"]);
		expect(planSddParticipants(cwd, "project", "change").order).toEqual(["ein-cleaner"]);
	});

	test("restart hydrates durable completion while crash and failed or ambiguous calls remain pending", () => {
		const cwd = fixture("once", true, false), first = planSddParticipants(cwd, "once", "change");
		finish(cwd, "once", "complete-restart", "ein-cleaner", first.next!.task); clearSddParticipantSession("once");
		expect(planSddParticipants(cwd, "new-session", "change")).toMatchObject({ status: "complete", passageId: first.passageId });
		const crashed = fixture("fresh", true, false), task = planSddParticipants(crashed, "fresh", "change").next!;
		expect(admitSddParticipantCall(crashed, "fresh", "crash", "ein-cleaner", task.task)).toBeNull(); clearSddParticipantSession("fresh");
		expect(planSddParticipants(crashed, "new-session", "change").next?.agent).toBe("ein-cleaner");
		for (const [failed, output] of [[true, "status: complete"], [false, "status: complete\nstatus: blocked"], [false, "status: incomplete"]] as const) {
			const pending = planSddParticipants(crashed, "new-session", "change").next!;
			expect(admitSddParticipantCall(crashed, "new-session", `pending-${output.length}-${failed}`, "ein-cleaner", pending.task)).toBeNull();
			completeSddParticipantCall(crashed, `pending-${output.length}-${failed}`, failed, output);
			expect(guardSddVerify(crashed, "new-session", "change")).toContain("pending");
		}
	});

	test("fails honestly without a current checkpoint and opens a new passage for changed apply bytes", () => {
		const missing = fixture("once", true, false); rmSync(join(missing, "openspec/changes/change/continuity.json"));
		expect(() => planSddParticipants(missing, "once", "change")).toThrow("no valid current SDD continuity checkpoint");
		const cwd = fixture("fresh", true, false), first = planSddParticipants(cwd, "fresh", "change");
		writeFileSync(join(cwd, "src/b.ts"), "export const b = 1;\n"); setChangedFiles(cwd, ["src/a.ts", "src/b.ts"]);
		const next = planSddParticipants(cwd, "fresh", "change"); expect(next.passageId).not.toBe(first.passageId);
		const saved = readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" }); expect(saved.status === "valid" && saved.checkpoint.version).toBe(2);
	});
});

describe("changed-file scope admission", () => {
	test("accepts a valid list and orders selectors deterministically", () => {
		const cwd = fixture("off-off", true, false);
		writeFileSync(join(cwd, "src/b.ts"), "export const b = 1;\n");
		setChangedFiles(cwd, ["src/b.ts", "src/a.ts"]);
		expect(planSddParticipants(cwd, "off-off", "change").next?.task).toContain('[{"kind":"file","path":"src/a.ts"},{"kind":"file","path":"src/b.ts"}]');
	});

	for (const [label, path, reason] of [
		["noncanonical", "src/../src/a.ts", "noncanonical"],
		["restricted", ".git/config", "restricted"],
		["missing", "src/missing.ts", "missing"],
		["duplicate", "src/a.ts", "duplicate"],
	] as const) test(`blocks the whole list for one valid plus one ${label} path`, () => {
		const cwd = fixture("off-off", true, false);
		setChangedFiles(cwd, ["src/a.ts", path]);
		expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow(reason);
	});

	test("blocks symlink components and non-directory parents while admitting a normal nested file", () => {
		const cwd = fixture("off-off", true, false);
		const outside = mkdtempSync(join(tmpdir(), "ein-sdd-outside-")); roots.push(outside); mkdirSync(join(outside, "deep")); writeFileSync(join(outside, "deep/a.ts"), "outside\n");
		symlinkSync("a.ts", join(cwd, "src/link.ts"));
		setChangedFiles(cwd, ["src/a.ts", "src/link.ts"]);
		expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow("symlink");
		symlinkSync(join(outside, "deep"), join(cwd, "src/linked")); setChangedFiles(cwd, ["src/linked/a.ts"]); expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow("symlink component");
		mkdirSync(join(cwd, "src/one/two"), { recursive: true }); symlinkSync(join(outside, "deep"), join(cwd, "src/one/two/linked")); setChangedFiles(cwd, ["src/one/two/linked/a.ts"]); expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow("symlink component");
		setChangedFiles(cwd, ["src/a.ts/child.ts"]); expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow("parent is not a real directory");
		setChangedFiles(cwd, ["src/a.ts", "src"]);
		expect(() => planSddParticipants(cwd, "off-off", "change")).toThrow("not a regular file");
		mkdirSync(join(cwd, "src/normal/deep"), { recursive: true }); writeFileSync(join(cwd, "src/normal/deep/a.ts"), "normal\n"); setChangedFiles(cwd, ["src/normal/deep/a.ts"]); expect(planSddParticipants(cwd, "off-off", "change").next?.task).toContain('"path":"src/normal/deep/a.ts"');
	});
});

test("off does not affect explicit direct invocation", () => {
	const cwd = fixture("off-off", false, false);
	const direct = routeAgentControl(cwd, "off-off", "cleaner", "audit src/a.ts");
	expect(direct.kind).toBe("request");
});
