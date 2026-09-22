import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContinuityOperationRuntime } from "../ein-pi/agent/lib/continuity-operation-runtime.ts";
import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { operationId, operationInputDigest } from "../ein-pi/agent/lib/continuity-operations.ts";
import { sessionReferenceFor } from "../ein-pi/agent/lib/runtime-session-identity.ts";
import { createContinuityRecoveryEvidence, continuityEvidenceRef } from "../ein-pi/agent/lib/continuity-recovery-evidence.ts";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "ein-operation-recovery-")); roots.push(cwd);
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd });
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }));
  const callRef = { sessionRef: sessionReferenceFor("pi", "fixture"), toolCallId: "run-tests" };
  const input = { command: "bun test" };
  const start = { runtime: "pi" as const, nativeCallRef: callRef, tool: "bash", inputDigest: operationInputDigest(input), effectScope: "external-or-unknown" as const };
  const entries = [{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "private-thought" }, { type: "toolCall", id: callRef.toolCallId, name: "bash", arguments: input }] } },
    { type: "message", message: { role: "toolResult", toolCallId: callRef.toolCallId, isError: true, content: [{ type: "text", text: "1 failed" }] } }];
  const evidence = createContinuityRecoveryEvidence(cwd, { sessionId: () => "fixture", entries: () => entries });
  const runtime = createContinuityOperationRuntime(cwd, { evidence });
  const id = operationId("pi", callRef);
  return { cwd, runtime, start, id, callRef, evidence };
}

test("restart, refresh, clear and unrelated success never erase an uncertain native operation", async () => {
  const { cwd, runtime, start, id } = fixture();
  expect(runtime.begin(start).ok).toBe(true); expect(runtime.finish(start, "failed").ok).toBe(true);
  const other = { ...start, nativeCallRef: { ...start.nativeCallRef, toolCallId: "other" } };
  expect(runtime.begin(other).ok).toBe(true); expect(runtime.finish(other, "succeeded").ok).toBe(true);
  const life = createContinuityHandoffLifecycle(cwd, { now: () => new Date().toISOString(), runtimeAvailable: () => true });
  expect(await life.refresh(true)).toBe("mutation-uncertain"); await life.clear();
  expect(await life.prepare("claude")).toMatchObject({ ok: false, reason: "mutation-uncertain" });
  expect((await life.status()).claude.blockers).toContain("mutation-uncertain");
  expect(runtime.inspect(id).ok).toBe(true);
});

test("local recovery uses the real call, scoped files and a current token, not a successful refresh", () => {
  const { cwd, runtime, start, id, callRef } = fixture(); runtime.begin(start); runtime.finish(start, "failed");
  const view = runtime.inspect(id); if (!view.ok) throw new Error(view.reason);
  expect(JSON.stringify(view)).not.toContain("private-thought");
  const assessment = { kind: "local-attested" as const, summary: "Inspected the local test script and its failure.", callRef, evidenceRefs: [], evidencePaths: ["package.json"] };
  writeFileSync(join(cwd, "changed.txt"), "changed after inspection");
  expect(runtime.resolve(id, view.value.token, assessment, "pi-coordinator")).toMatchObject({ ok: false, reason: "inspection-stale" });
  const fresh = runtime.inspect(id); if (!fresh.ok) throw new Error(fresh.reason);
  expect(runtime.resolve(id, fresh.value.token, { ...assessment, callRef: { ...callRef, toolCallId: "borrowed" } }, "pi-coordinator").ok).toBe(false);
  expect(runtime.resolve(id, fresh.value.token, assessment, "pi-coordinator")).toMatchObject({ ok: true, value: { outcome: "recovered", recovery: { kind: "local-attested", source: "pi-coordinator" } } });
  expect(createContinuityOperationRuntime(cwd).uncertain()).toBe(false);
  const persisted = readFileSync(join(cwd, ".ein/continuity-operations.json"), "utf8");
  expect(persisted).not.toContain("bun test"); expect(persisted).not.toContain("private-thought");
});

test("native call missing or external evidence unavailable cannot settle uncertainty", () => {
  const { runtime, start, id, callRef } = fixture(); runtime.begin(start); runtime.finish(start, "unavailable");
  const view = runtime.inspect(id); if (!view.ok) throw new Error(view.reason);
  const assessment = { kind: "external-observed" as const, summary: "Remote side effect", callRef, evidenceRefs: [], evidencePaths: [] };
  expect(runtime.resolve(id, view.value.token, assessment, "pi-coordinator")).toMatchObject({ ok: false, reason: "external-proof-required" });
  expect(runtime.resolve(id, view.value.token, { ...assessment, evidenceRefs: ["invented"] }, "pi-coordinator").ok).toBe(false);
  expect(runtime.uncertain()).toBe(true);
});

test("the writer rechecks inspection evidence under its publication lock", () => {
  const { cwd, runtime, start, id, callRef, evidence } = fixture(); runtime.begin(start); runtime.finish(start, "failed");
  const view = runtime.inspect(id); if (!view.ok) throw new Error(view.reason);
  const racing = createContinuityOperationRuntime(cwd, { evidence, beforeRecoveryPublish() { writeFileSync(join(cwd, "package.json"), '{"scripts":{"test":"changed"}}'); } });
  expect(racing.resolve(id, view.value.token, { kind: "local-attested", summary: "Inspected local test evidence", callRef, evidenceRefs: [], evidencePaths: ["package.json"] }, "pi-coordinator")).toMatchObject({ ok: false, reason: "inspection-stale" });
  expect(runtime.uncertain()).toBe(true);
});

test("running survives process replacement; denied-before-begin never reopens; mismatched IDs conflict", () => {
  const { cwd, runtime, start } = fixture();
  runtime.begin(start); expect(createContinuityOperationRuntime(cwd).uncertain()).toBe(true);
  expect(runtime.denied(start, "command-policy").ok).toBe(true);
  expect(runtime.begin(start).ok).toBe(true); expect(runtime.uncertain()).toBe(false);
  expect(runtime.finish(start, "failed").ok).toBe(true); expect(runtime.uncertain()).toBe(false);
  expect(runtime.begin({ ...start, inputDigest: operationInputDigest({ command: "other" }) }).ok).toBe(false);
});

test("external recovery binds literal destination, branch and SHA; aliases and borrowed read-back never suffice", () => {
  const { cwd } = fixture(), sha = "a".repeat(40), remote = "https://github.com/fixture/repo.git", branch = "refs/heads/feature";
  for (const destination of [remote, "origin"]) {
    const sessionId = `external-${destination}`, ref = { sessionRef: sessionReferenceFor("pi", sessionId), toolCallId: "push" };
    const input = { command: `git push ${destination} ${sha}:${branch}` }, entries: any[] = [];
    const add = (id: string, command: string, text: string, failed = false) => {
      entries.push({ message: { role: "assistant", content: [{ type: "toolCall", id, name: "bash", arguments: { command } }] } });
      entries.push({ message: { role: "toolResult", toolCallId: id, isError: failed, content: [{ type: "text", text }] } });
    };
    add("push", input.command, "connection lost", true);
    add("readback", `git ls-remote --exit-code ${destination} ${branch}`, `${sha}\t${branch}`);
    add("borrowed", `git ls-remote --exit-code https://github.com/fixture/other.git ${branch}`, `${sha}\t${branch}`);
    add("wrong-sha", `git ls-remote --exit-code ${destination} ${branch}`, `${"b".repeat(40)}\t${branch}`);
    add("wrong-ref", `git ls-remote --exit-code ${destination} refs/heads/other`, `${sha}\trefs/heads/other`);
    const runtime = createContinuityOperationRuntime(cwd, { evidence: createContinuityRecoveryEvidence(cwd, { sessionId: () => sessionId, entries: () => entries }) });
    const start = { runtime: "pi" as const, tool: "bash", inputDigest: operationInputDigest(input), nativeCallRef: ref, effectScope: "external-or-unknown" as const };
    runtime.begin(start); runtime.finish(start, "failed");
    const id = operationId("pi", ref), view = runtime.inspect(id); if (!view.ok) throw new Error(view.reason);
    const assessment = { kind: "external-observed" as const, summary: "Observed the requested remote branch and commit", callRef: ref, evidenceRefs: [], evidencePaths: [] };
    expect(runtime.resolve(id, view.value.token, { ...assessment, kind: "local-attested", evidencePaths: ["package.json"] }, "pi-coordinator")).toMatchObject({ ok: false, reason: "external-proof-required" });
    for (const toolCallId of ["borrowed", "wrong-sha", "wrong-ref"]) expect(runtime.resolve(id, view.value.token, { ...assessment, evidenceRefs: [continuityEvidenceRef({ ...ref, toolCallId })] }, "pi-coordinator").ok).toBe(false);
    const result = runtime.resolve(id, view.value.token, { ...assessment, evidenceRefs: [continuityEvidenceRef({ ...ref, toolCallId: "readback" })] }, "pi-coordinator");
    expect(result.ok).toBe(destination === remote);
  }
});
