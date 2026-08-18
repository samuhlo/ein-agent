import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { clearAgentControlSession, routeAgentControl } from "../ein-pi/agent/lib/agent-controls.ts";
import { deriveContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { readContinuityCheckpoint, writeContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { ensureEinGitignore } from "../ein-pi/agent/lib/gitignore.ts";
import { projectProjectState } from "../ein-pi/agent/lib/project-state.ts";
import { admitSddParticipantCall, clearSddParticipantSession, completeSddParticipantCall, guardSddVerify, participantResultIsUnrecognized, planSddParticipants } from "../ein-pi/agent/lib/sdd-participants.ts";
import { ensureParticipantForeground } from "../ein-pi/agent/lib/sdd-preflight.ts";

const roots: string[] = [];
const sessions = ["off-off", "on-off", "off-on", "on-on", "blocked", "fresh", "once", "project"];

function fixture(session: string, cleaner: boolean, architect: boolean): string {
	const cwd = mkdtempSync(join(tmpdir(), "ein-sdd-participants-"));
	roots.push(cwd);
	mkdirSync(join(cwd, "src"));
	writeFileSync(join(cwd, "src/a.ts"), "export const a = 1;\n");
	ensureEinGitignore(cwd);
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

function terminalDetails(agent: string, task: string, output: string): unknown {
	return { mode: "single", results: [{ agent, task, finalOutput: output }] };
}

function finish(cwd: string, session: string, call: string, agent: "ein-cleaner" | "ein-architect", task: string, output = "status: complete"): void {
	expect(admitSddParticipantCall(cwd, session, call, agent, task)).toBeNull();
	completeSddParticipantCall(cwd, call, false, output, terminalDetails(agent, task, output));
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
		completeSddParticipantCall(cwd, "c", false, "status: complete", terminalDetails("ein-cleaner", cleaner.task, "status: complete"));
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

	test("first post-apply plan freezes acquisition across sessions; effective order still honors each session's own explicit off (Fallo B)", () => {
		const cwd = fixture("project", false, false);
		mkdirSync(join(cwd, ".pi/ein"), { recursive: true });
		writeFileSync(join(cwd, ".pi/ein/agents.json"), JSON.stringify({ agents: {
			cleaner: { enabled: true }, architect: { enabled: false },
		} }));
		clearAgentControlSession("new-project");
		const acquired = planSddParticipants(cwd, "new-project", "change");
		expect(acquired.order).toEqual(["ein-cleaner"]);
		const queried = planSddParticipants(cwd, "project", "change");
		// The durable acquisition (and its `passageId`) stays frozen; but session
		// "project" has its own explicit Cleaner/Architect off (set in `fixture`),
		// so its own query correctly excludes the evidence-less Cleaner from the
		// EFFECTIVE order (`// 003 B-2` regla 2) without touching the durable one.
		expect(queried.passageId).toBe(acquired.passageId);
		expect(queried.order).toEqual([]);
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
			completeSddParticipantCall(crashed, `pending-${output.length}-${failed}`, failed, output, terminalDetails("ein-cleaner", pending.task, output));
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

describe("scope-bounded passage seal", () => {
	// R2/T3: the seal must be bounded to the declared scope, not to the whole tree; an unrelated
	// untracked file anywhere else in the repository must not flip it.
	test("an unrelated untracked file does not invalidate the passage", () => {
		const cwd = fixture("off-off", true, false);
		const first = planSddParticipants(cwd, "off-off", "change");
		writeFileSync(join(cwd, "openspec/changes/change/memory-receipts.jsonl"), "{}\n");
		const second = planSddParticipants(cwd, "off-off", "change");
		expect(second.passageId).toBe(first.passageId);
		expect(admitSddParticipantCall(cwd, "off-off", "call", "ein-cleaner", first.next!.task)).toBeNull();
	});

	// R2/R4/T5: the persisted seal carries the new sdd-scope-v1 prefix, not git-v1.
	test("persisted beforeStateRef carries the sdd-scope-v1 seal format", () => {
		const cwd = fixture("off-off", true, false);
		planSddParticipants(cwd, "off-off", "change");
		const saved = readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" });
		expect(saved.status === "valid" && saved.checkpoint.sddParticipants?.beforeStateRef).toMatch(/^sdd-scope-v1:sha256:[a-f0-9]{64}$/);
	});
});

test("off does not affect explicit direct invocation", () => {
	const cwd = fixture("off-off", false, false);
	const direct = routeAgentControl(cwd, "off-off", "cleaner", "audit src/a.ts");
	expect(direct.kind).toBe("request");
});

describe("disabling a participant mid-passage releases it without dropping evidence (Fallo B)", () => {
	// RED B1: Cleaner completes, then Architect is disabled mid-passage. The
	// passage must release (order shrinks, plan completes, verify unblocks),
	// the passageId must stay stable, and the Cleaner's evidence must survive
	// in the durable checkpoint.
	test("disabling the pending Architect after the Cleaner completes releases the passage", () => {
		const cwd = fixture("on-on", true, true);
		const cleaner = planSddParticipants(cwd, "on-on", "change").next!;
		finish(cwd, "on-on", "b1-cleaner", "ein-cleaner", cleaner.task);
		const beforeOff = planSddParticipants(cwd, "on-on", "change");
		expect(beforeOff.next?.agent).toBe("ein-architect");
		routeAgentControl(cwd, "on-on", "architect", "off");
		const plan = planSddParticipants(cwd, "on-on", "change");
		expect(plan.order).toEqual(["ein-cleaner"]);
		expect(plan.status).toBe("complete");
		expect(plan.passageId).toBe(beforeOff.passageId);
		expect(guardSddVerify(cwd, "on-on", "change")).toBeNull();
		const saved = readContinuityCheckpoint(cwd, { mode: "sdd", change: "change" });
		expect(saved.status === "valid" && saved.checkpoint.sddParticipants?.cleaner?.status).toBe("complete");
	});

	// RED B2 (triangulation): disabling before the agent ever ran, and
	// re-enabling it, must be reversible with a stable passageId.
	test("disabling the Cleaner before it runs excludes it, and re-enabling restores it as next", () => {
		const cwd = fixture("on-on", true, true);
		const initial = planSddParticipants(cwd, "on-on", "change");
		routeAgentControl(cwd, "on-on", "cleaner", "off");
		const disabled = planSddParticipants(cwd, "on-on", "change");
		expect(disabled.order).toEqual(["ein-architect"]);
		expect(disabled.passageId).toBe(initial.passageId);
		routeAgentControl(cwd, "on-on", "cleaner", "on");
		const reenabled = planSddParticipants(cwd, "on-on", "change");
		expect(reenabled.order).toEqual(["ein-cleaner", "ein-architect"]);
		expect(reenabled.passageId).toBe(initial.passageId);
		expect(reenabled.next?.agent).toBe("ein-cleaner");
	});

	// RED B3 (triangulation): a disabled, evidence-less participant's late
	// result must be discarded without re-blocking the passage.
	test("a late blocked result from a just-disabled participant does not re-block the passage", () => {
		const cwd = fixture("on-on", true, true);
		const cleanerTask = planSddParticipants(cwd, "on-on", "change").next!;
		expect(admitSddParticipantCall(cwd, "on-on", "b3-inflight", "ein-cleaner", cleanerTask.task)).toBeNull();
		routeAgentControl(cwd, "on-on", "cleaner", "off");
		completeSddParticipantCall(cwd, "b3-inflight", false, "status: blocked\nreason: audit unavailable", terminalDetails("ein-cleaner", cleanerTask.task, "status: blocked\nreason: audit unavailable"));
		const plan = planSddParticipants(cwd, "on-on", "change");
		expect(plan.order).toEqual(["ein-architect"]);
		expect(plan.status).not.toBe("blocked");
	});
});

describe("apply prompt does not contradict the passage parser (R9/T13)", () => {
	test("sdd-apply.md requires the canonical Files changed section, not a blanket ban on file lists", () => {
		const promptPath = join(import.meta.dir, "../ein-pi/core/agents/sdd-apply.md");
		const prompt = require("node:fs").readFileSync(promptPath, "utf8") as string;
		expect(prompt).toContain("## Files changed");
		expect(prompt).toMatch(/REQUIRED/);
		expect(prompt).not.toMatch(/never a dump of full file lists/);
	});
});

describe("Files changed grammar (SDD_ARTIFACT_GRAMMAR.md)", () => {
	// R9/T12: the doc's canonical example is proven, not just described — it is extracted from the
	// doc and fed to planSddParticipants; the plan must succeed with exactly the declared paths.
	test("the canonical example in the grammar doc is accepted by planSddParticipants", () => {
		const docPath = join(import.meta.dir, "../ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md");
		const doc = require("node:fs").readFileSync(docPath, "utf8") as string;
		const fenced = /```markdown\n([\s\S]*?)```/.exec(doc);
		expect(fenced).not.toBeNull();
		const example = fenced![1]!;
		const declared = [...example.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
		expect(declared).toEqual(["ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md"]);

		const cwd = fixture("off-off", true, false);
		mkdirSync(join(cwd, "ein-pi/core/docs"), { recursive: true });
		writeFileSync(join(cwd, "ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md"), "grammar copy\n");
		writeFileSync(join(cwd, "openspec/changes/change/apply-progress.md"), example);
		const plan = planSddParticipants(cwd, "off-off", "change");
		expect(admitSddParticipantCall(cwd, "off-off", "call", "ein-cleaner", plan.next!.task)).toBeNull();
		expect(plan.next!.task).toContain('"path":"ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md"');
	});
});

// fix-participant-result-registration — Fallo A: el lanzamiento en background
// nunca trae el informe terminal, y borrar el rastreo en el "resultado" del
// lanzamiento permite reintentar en bucle sin protesta. Estos tests son
// SECUENCIA (lanzamiento -> handle sin resultado -> replan), no una llamada
// aislada: una llamada aislada no reproduce el bug (ver design.md D).
describe("fix-participant-result-registration: launch handle does not consume tracking", () => {
	test("RED A1: a launch handle (no terminal payload) leaves the same agent blocked as already running, not ready again", () => {
		const cwd = fixture("off-off", true, false);
		const plan = planSddParticipants(cwd, "off-off", "change");
		expect(admitSddParticipantCall(cwd, "off-off", "launch-1", "ein-cleaner", plan.next!.task)).toBeNull();
		// Forma exacta de un handle de lanzamiento en background: `results` vacío,
		// con `runId`/`asyncId`, sin `finalOutput`. No hay `status:` que leer.
		completeSddParticipantCall(cwd, "launch-1", false, "Async run started: r1 [r1]", { mode: "single", runId: "r1", asyncId: "r1", results: [] });
		const replanned = planSddParticipants(cwd, "off-off", "change");
		expect(replanned.status).toBe("blocked");
		expect(replanned.blocker).toContain("already running");
	});

	test("RED A2: the terminal result for the same toolCallId still completes the passage after a launch handle", () => {
		const cwd = fixture("off-off", true, false);
		const plan = planSddParticipants(cwd, "off-off", "change");
		expect(admitSddParticipantCall(cwd, "off-off", "launch-2", "ein-cleaner", plan.next!.task)).toBeNull();
		completeSddParticipantCall(cwd, "launch-2", false, "Async run started: r2 [r2]", { mode: "single", runId: "r2", asyncId: "r2", results: [] });
		completeSddParticipantCall(cwd, "launch-2", false, "status: complete", terminalDetails("ein-cleaner", plan.next!.task, "status: complete"));
		expect(planSddParticipants(cwd, "off-off", "change").status).toBe("complete");
	});
});

describe("fix-participant-result-registration: ensureParticipantForeground (RED A3, pure)", () => {
	test("forces async:false and foregroundOnly:true on a delegation carrying the participant marker", () => {
		const input: Record<string, unknown> = { agent: "ein-cleaner", task: "[ein-sdd-participant/v1 passage=abc state=def]\ndo it", async: true };
		expect(ensureParticipantForeground(input)).toBe(true);
		expect(input.async).toBe(false);
		expect(input.foregroundOnly).toBe(true);
	});

	test("leaves a non-participant delegation untouched", () => {
		const input: Record<string, unknown> = { agent: "ein-git", task: "commit and push", async: true };
		expect(ensureParticipantForeground(input)).toBe(false);
		expect(input.async).toBe(true);
		expect(input.foregroundOnly).toBeUndefined();
	});

	test("overrides an explicit async:true for a participant workflowScript delegation", () => {
		const input: Record<string, unknown> = {
			workflowScript: 'runs.run("audit", { agent: "ein-cleaner", task: "[ein-sdd-participant/v1 passage=abc state=def]\\ndo it", async: true })',
		};
		expect(ensureParticipantForeground(input)).toBe(true);
		expect(input.async).toBe(false);
		expect(input.foregroundOnly).toBe(true);
	});
});

describe("fix-participant-result-registration: participantResultIsUnrecognized (RED A4, pure)", () => {
	test("true for a subagent launch handle with tracked calls", () => {
		expect(participantResultIsUnrecognized({ toolName: "subagent", details: { mode: "single", runId: "r1", results: [] }, hasTrackedCalls: true })).toBe(true);
	});

	test("true for a subagent_wait result while participant calls are tracked", () => {
		expect(participantResultIsUnrecognized({ toolName: "subagent_wait", details: { mode: "management", results: [], completions: [] }, hasTrackedCalls: true })).toBe(true);
	});

	test("false for a recognized terminal result", () => {
		expect(participantResultIsUnrecognized({ toolName: "subagent", details: { mode: "single", results: [{ agent: "ein-cleaner", task: "t", finalOutput: "status: complete" }] }, hasTrackedCalls: true })).toBe(false);
	});

	test("false when there are no tracked calls at all", () => {
		expect(participantResultIsUnrecognized({ toolName: "subagent", details: { mode: "single", runId: "r1", results: [] }, hasTrackedCalls: false })).toBe(false);
	});
});
