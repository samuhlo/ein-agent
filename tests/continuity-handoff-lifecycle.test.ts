import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { deriveContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { readContinuityCheckpoint, writeContinuityCheckpoint, type ContinuityCheckpointLocation } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { projectProjectState, type ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";

const roots: string[] = [], NOW = "2026-08-14T13:00:00Z";
function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "ein-handoff-")); roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root }); execFileSync("git", ["config", "user.email", "fixture@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
	writeFileSync(join(root, ".gitignore"), "/.ein/continuity.json\n"); writeFileSync(join(root, "safe.txt"), "initial\n");
	execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root }); return root;
}
function ports(extra: Record<string, unknown> = {}) { return { now: () => NOW, runtimeAvailable: () => true, processObservation: () => "unknown" as const, ...extra }; }
function checkpoint(root: string, location: ContinuityCheckpointLocation = { mode: "adhoc" }) { const result = readContinuityCheckpoint(root, location); if (result.status !== "valid") throw new Error(result.status); return result.checkpoint; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("continuity handoff lifecycle", () => {
	test("hydrates a valid canonical checkpoint and otherwise uses generic facts", async () => {
		const root = fixture(), first = createContinuityHandoffLifecycle(root, ports()); first.captureInput("Preserve this safe objective."); expect(await first.refresh(true)).toBe("refreshed");
		const hydrated = createContinuityHandoffLifecycle(root, ports()); expect(await hydrated.refresh(true)).toBe("refreshed"); expect(checkpoint(root).objective).toBe("Preserve this safe objective.");
		const other = fixture(); expect(await createContinuityHandoffLifecycle(other, ports()).refresh(true)).toBe("refreshed"); expect(checkpoint(other).objective).toBe("Continue the current project task safely.");
	});

	test("persists safe input but rejects unsafe, secret-like, private, transcript, tool, and over-budget input without fragments", async () => {
		const safe = fixture(), lifecycle = createContinuityHandoffLifecycle(safe, ports()); lifecycle.captureInput("Implement the bounded lifecycle."); await lifecycle.refresh(true); expect(checkpoint(safe).objective).toBe("Implement the bounded lifecycle.");
		for (const value of ["line\ncontrol-canary", "password=secret-canary", "/Users/private-canary/work", "transcript: transcript-canary", "<tool_result>tool-canary</tool_result>", `long-canary-${"x".repeat(600)}`]) {
			const root = fixture(), item = createContinuityHandoffLifecycle(root, ports()); item.captureInput(value); await item.refresh(true); const serialized = JSON.stringify(checkpoint(root)); expect(serialized).not.toContain("canary"); expect(checkpoint(root).objective).toBe("Continue the current project task safely.");
		}
	});

	test("selects ad-hoc and canonical SDD locations", async () => {
		const adhoc = fixture(); await createContinuityHandoffLifecycle(adhoc, ports()).refresh(true); expect(existsSync(join(adhoc, ".ein", "continuity.json"))).toBeTrue();
		const sdd = fixture(); mkdirSync(join(sdd, "openspec", "changes", "safe-change"), { recursive: true });
		const base = projectProjectState({ cwd: sdd });
		const selected = (): ProjectStateV1 => ({ ...base, openspec: { ...base.openspec, quality: "current", reason: "read-success", activeChanges: ["safe-change"], selection: "selected", selectedChange: "safe-change", provenance: "canonical" } });
		expect(await createContinuityHandoffLifecycle(sdd, ports({ projectState: selected })).refresh(true)).toBe("refreshed"); expect(existsSync(join(sdd, "openspec", "changes", "safe-change", "continuity.json"))).toBeTrue();
	});

	test("writes absent and matching checkpoints, retries one CAS conflict, and closes exhausted conflicts", async () => {
		const root = fixture(), normal = createContinuityHandoffLifecycle(root, ports()); expect(await normal.refresh(true)).toBe("refreshed"); expect(await normal.refresh(true)).toBe("refreshed");
		let calls = 0; const once = createContinuityHandoffLifecycle(fixture(), ports({ write: (...args: Parameters<typeof writeContinuityCheckpoint>) => ++calls === 1 ? { ok: false, outcome: "not-published", reason: "conflict" } : writeContinuityCheckpoint(...args) }));
		expect(await once.refresh(true)).toBe("refreshed"); expect(calls).toBe(2);
		calls = 0; const exhausted = createContinuityHandoffLifecycle(fixture(), ports({ write: () => { calls += 1; return { ok: false, outcome: "not-published", reason: "conflict" } as const; } }));
		expect(await exhausted.refresh(true)).toBe("refresh-conflict"); expect(calls).toBe(2);
	});

	test("refresh republishes generic facts without participant fields across a state-ref change", async () => {
		const root = fixture(); mkdirSync(join(root, "openspec/changes/change"), { recursive: true }); let live = projectProjectState({ cwd: root });
		const selected = (_cwd?: string, runtime = live.runtimes): ProjectStateV1 => ({ ...live, runtimes: runtime, openspec: { ...live.openspec, quality: "current", reason: "read-success", activeChanges: ["change"], selection: "selected", selectedChange: "change", provenance: "canonical" } });
		const initial = deriveContinuityCheckpoint(selected(), { capturedAt: NOW, objective: "Keep generic facts.", completed: ["Record the handoff."], nextAction: "Resume the generic lifecycle.", unresolvedDecisions: ["Choose the next safe step."] }); if (!initial.ok) throw new Error(initial.reason);
		expect(writeContinuityCheckpoint(root, { mode: "sdd", change: "change" }, initial.checkpoint, { kind: "absent" }).ok).toBeTrue(); const lifecycle = createContinuityHandoffLifecycle(root, ports({ projectState: selected, processObservation: () => "none" }));
		expect(await lifecycle.refresh(true)).toBe("refreshed"); const first = checkpoint(root, { mode: "sdd", change: "change" }); expect(first).toMatchObject({ objective: "Keep generic facts.", completed: ["Record the handoff."], nextAction: "Resume the generic lifecycle.", unresolvedDecisions: ["Choose the next safe step."] }); expect("sddParticipants" in first).toBeFalse();
		const nextRef = `git-v1:sha256:${"e".repeat(64)}`; live = { ...live, git: { ...live.git, stateRef: nextRef }, verification: { ...live.verification, currentStateRef: nextRef, observedStateRef: nextRef } };
		expect(await lifecycle.refresh(true)).toBe("refreshed"); const saved = checkpoint(root, { mode: "sdd", change: "change" }); expect(saved).toMatchObject({ objective: "Keep generic facts.", completed: ["Record the handoff."], nextAction: "Resume the generic lifecycle.", unresolvedDecisions: ["Choose the next safe step."] }); expect("sddParticipants" in saved).toBeFalse();
	});

	test("refresh conflict rereads the generic checkpoint before retrying", async () => {
		const root = fixture(), base = projectProjectState({ cwd: root });
		const initial = deriveContinuityCheckpoint(base, { capturedAt: NOW, objective: "Preserve generic CAS.", completed: ["Keep the current facts."], nextAction: "Retry the generic refresh.", unresolvedDecisions: [] }); if (!initial.ok) throw new Error(initial.reason);
		expect(writeContinuityCheckpoint(root, { mode: "adhoc" }, initial.checkpoint, { kind: "absent" }).ok).toBeTrue(); let injected = false; const expectations: string[] = [];
		const lifecycle = createContinuityHandoffLifecycle(root, ports({ write: (...args: Parameters<typeof writeContinuityCheckpoint>) => {
			expectations.push(args[3].kind === "revision" ? args[3].revision : "absent");
			if (injected) return writeContinuityCheckpoint(...args); injected = true;
			const current = checkpoint(root), newer = deriveContinuityCheckpoint(base, { capturedAt: NOW, objective: "Concurrent generic update.", completed: ["Keep the newer facts."], nextAction: "Continue the concurrent refresh.", unresolvedDecisions: [] });
			if (!newer.ok || !writeContinuityCheckpoint(root, { mode: "adhoc" }, newer.checkpoint, { kind: "revision", revision: current.revision }).ok) throw new Error("injection failed");
			return { ok: false, outcome: "not-published", reason: "conflict" };
		} }));
		expect(await lifecycle.refresh(true)).toBe("refreshed"); expect(expectations).toHaveLength(2); expect(expectations[0]).toBe(initial.checkpoint.revision); expect(expectations[1]).not.toBe(expectations[0]);
		const saved = checkpoint(root); expect(saved).toMatchObject({ objective: "Preserve generic CAS.", completed: ["Keep the current facts."], nextAction: "Retry the generic refresh." }); expect("sddParticipants" in saved).toBeFalse();
	});

	test("bounds concurrent automatic refresh pressure to one active and one coalesced pending operation", async () => {
		const root = fixture(); let writes = 0, states = 0;
		const lifecycle = createContinuityHandoffLifecycle(root, ports({ projectState: () => { states += 1; return projectProjectState({ cwd: root }); }, write: (...args: Parameters<typeof writeContinuityCheckpoint>) => { writes += 1; return writeContinuityCheckpoint(...args); } })); states = 0;
		const requests = Array.from({ length: 100 }, () => lifecycle.refresh(false)); expect(await lifecycle.refresh(true)).toBe("busy"); expect((await lifecycle.status()).operation).toBe("busy"); const results = await Promise.all(requests); expect(results.every((result) => result === "refreshed")).toBeTrue(); expect(writes).toBe(2); expect(states).toBe(2);
	});

	test("shutdown is terminal under pressure, drains one active slot, and drops pending and future work", async () => {
		const root = fixture(); let release!: () => void, entered!: () => void, states = 0, writes = 0; const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; });
		const lifecycle = createContinuityHandoffLifecycle(root, ports({ operationGate: async () => { entered(); await gate; }, projectState: () => { states += 1; return projectProjectState({ cwd: root }); }, write: (...args: Parameters<typeof writeContinuityCheckpoint>) => { writes += 1; return writeContinuityCheckpoint(...args); } })); states = 0;
		const active = lifecycle.refresh(false); await started; const queued = Array.from({ length: 50 }, () => lifecycle.refresh(false)); let settled = false; const shutdown = lifecycle.shutdown().then((result) => { settled = true; return result; }); await Promise.resolve(); expect(settled).toBeFalse(); release();
		expect(await active).toBe("disposed"); expect((await Promise.all(queued)).every((result) => result === "disposed")).toBeTrue(); expect(await shutdown).toBe("disposed"); expect({ states, writes }).toEqual({ states: 0, writes: 0 });
		expect(await lifecycle.refresh(false)).toBe("disposed"); expect(await lifecycle.refresh(true)).toBe("disposed"); expect(await lifecycle.clear()).toBe("disposed"); expect((await lifecycle.prepare("pi")).ok).toBeFalse(); expect((await lifecycle.status()).operation).toBe("disposed"); expect({ states, writes }).toEqual({ states: 0, writes: 0 });
		const handoffRoot = fixture(), handoff = createContinuityHandoffLifecycle(handoffRoot, ports({ processObservation: () => "none" })); expect((await handoff.prepare("pi")).ok).toBeTrue(); const revision = checkpoint(handoffRoot).revision; handoff.markPreparedReplacement(); expect(await handoff.shutdown()).toBe("disposed"); expect(checkpoint(handoffRoot).revision).toBe(revision);
	});

	test("shared busy and disposed results are deeply immutable and cannot poison later callers", async () => {
		const root = fixture(); let release!: () => void, entered!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }), started = new Promise<void>((resolve) => { entered = resolve; }); const lifecycle = createContinuityHandoffLifecycle(root, ports({ operationGate: async () => { entered(); await gate; } }));
		const active = lifecycle.refresh(false); await started; const busy = await lifecycle.status(); expect(Object.isFrozen(busy.pi)).toBeTrue(); expect(Object.isFrozen(busy.pi.blockers)).toBeTrue(); expect(() => (busy.pi.blockers as unknown as string[]).push("poison")).toThrow(); const shutdown = lifecycle.shutdown(); release(); await active; await shutdown;
		const disposed = await lifecycle.status(), prepared = await lifecycle.prepare("pi"); expect(Object.isFrozen(disposed.pi.warnings)).toBeTrue(); expect(() => (disposed.pi.warnings as unknown as string[]).push("poison")).toThrow(); if (!prepared.ok) { expect(Object.isFrozen(prepared.blockers)).toBeTrue(); expect(() => (prepared.blockers as unknown as string[]).push("poison")).toThrow(); } expect((await lifecycle.status()).pi.blockers).toEqual(["audit-failed"]);
	});

	test("rejects stale checkpoint facts during hydration and republishes only generic facts", async () => {
		const root = fixture(), before = projectProjectState({ cwd: root });
		const stale = deriveContinuityCheckpoint(before, { capturedAt: NOW, objective: "STALE-OBJECTIVE-CANARY", completed: ["STALE-COMPLETED-CANARY"], nextAction: "STALE-NEXT-CANARY", unresolvedDecisions: ["STALE-DECISION-CANARY"] }); if (!stale.ok) throw new Error(stale.reason);
		expect(writeContinuityCheckpoint(root, { mode: "adhoc" }, stale.checkpoint, { kind: "absent" }).ok).toBeTrue(); writeFileSync(join(root, "safe.txt"), "changed after checkpoint\n");
		const lifecycle = createContinuityHandoffLifecycle(root, ports()); expect(await lifecycle.refresh(true)).toBe("refreshed"); const saved = JSON.stringify(checkpoint(root)); expect(saved).not.toContain("CANARY"); expect(checkpoint(root).objective).toBe("Continue the current project task safely.");
	});

	test("successful mutations refresh while uncertainty suppresses automatic boundaries until explicit refresh", async () => {
		const root = fixture(); let writes = 0; const lifecycle = createContinuityHandoffLifecycle(root, ports({ write: (...args: Parameters<typeof writeContinuityCheckpoint>) => { writes += 1; return writeContinuityCheckpoint(...args); } }));
		expect(await lifecycle.mutationResult(true)).toBe("refreshed"); expect(writes).toBe(1); expect(await lifecycle.mutationResult(false)).toBe("mutation-uncertain");
		expect(await lifecycle.refresh(false)).toBe("mutation-uncertain"); const blocked = await lifecycle.prepare("pi"); expect(blocked.ok).toBeFalse(); if (!blocked.ok) expect(blocked.reason).toBe("mutation-uncertain"); expect(writes).toBe(1); expect(await lifecycle.refresh(true)).toBe("refreshed"); expect(writes).toBe(2);
	});

	test("a new lifecycle blocks on a live stateRef mismatch after an uncheckpointed partial mutation", async () => {
		const root = fixture(), first = createContinuityHandoffLifecycle(root, ports()); await first.refresh(true); await first.mutationResult(false); writeFileSync(join(root, "safe.txt"), "partial mutation\n");
		const fresh = createContinuityHandoffLifecycle(root, ports()); const result = await fresh.status(); expect(result.pi.status).toBe("blocked"); expect(result.pi.blockers).toContain("checkpoint-state-ref-mismatch");
	});

	test("reports both target classifications, explicit runtime quality, and default process warning", async () => {
		const root = fixture(), lifecycle = createContinuityHandoffLifecycle(root, ports({ runtimeAvailable: (provider: string) => provider === "pi" })); await lifecycle.refresh(true); const result = await lifecycle.status();
		expect(result.pi.status).toBe("ready-with-warnings"); expect(result.pi.warnings).toContain("process-unknown"); expect(result.claude.blockers).toContain("target-runtime-unavailable");
	});

	test("prepares exact WU4 metadata, blocks without a brief, and clears only the canonical checkpoint", async () => {
		const root = fixture(), lifecycle = createContinuityHandoffLifecycle(root, ports({ processObservation: () => "none" })); const prepared = await lifecycle.prepare("claude"); expect(prepared.ok).toBeTrue(); if (prepared.ok) expect(prepared.brief).toMatchObject({ format: "continuity-resume-brief/v1", target: "claude", byteLength: prepared.brief.content.length });
		await lifecycle.mutationResult(false); const blocked = await lifecycle.prepare("pi"); expect(blocked.ok).toBeFalse(); expect("brief" in blocked).toBeFalse(); await lifecycle.refresh(true);
		writeFileSync(join(root, ".ein", "sibling"), "keep"); expect(await lifecycle.clear()).toBe("cleared"); expect(readFileSync(join(root, ".ein", "sibling"), "utf8")).toBe("keep"); expect((await lifecycle.status()).checkpoint).toBe("absent");
	});
});
