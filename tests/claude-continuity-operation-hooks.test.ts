import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleClaudeHook, createSupervisorHandler, listenIpc, parseIpcFrame } from "../ein-cc/continuity-runner.ts";
import { createContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { readContinuityOperations } from "../ein-pi/agent/lib/continuity-operation-store.ts";
import { operationInputDigest } from "../ein-pi/agent/lib/continuity-operations.ts";
import { sessionReferenceFor } from "../ein-pi/agent/lib/runtime-session-identity.ts";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));
function fixture() { const cwd = mkdtempSync(join(tmpdir(), "ein-claude-operation-")); roots.push(cwd); execFileSync("git", ["init", "-q"], { cwd }); return cwd; }
const operation = { runtime: "claude" as const, tool: "Bash", inputDigest: operationInputDigest({ command: "bun test" }), nativeCallRef: { sessionRef: sessionReferenceFor("claude", "native-session"), toolCallId: "call-1" }, effectScope: "external-or-unknown" as const };

test("version 2 only admits bounded native operation identities; v1 controls still work", () => {
  const valid = { v: 2, token: "secret", event: { kind: "operation-start", operation } };
  expect(parseIpcFrame(JSON.stringify(valid), "secret").ok).toBe(true);
  for (const patch of [{ v: 1 }, { v: "2" }, { token: "other" }, { event: { ...valid.event, operation: { ...operation, input: "secret command" } } }]) expect(parseIpcFrame(JSON.stringify({ ...valid, ...patch }), "secret").ok).toBe(false);
  expect(parseIpcFrame(JSON.stringify({ v: 1, token: "secret", event: { kind: "control", action: "status" } }), "secret").ok).toBe(true);
});

test("native hook subprocess publishes before allow and preserves failure across supervisor restart", async () => {
  const cwd = fixture(), lifecycle = createContinuityHandoffLifecycle(cwd, { now: () => new Date().toISOString(), runtimeAvailable: () => true });
  const path = join(cwd, "ipc.sock"), token = "fixture-token";
  const ipc = await listenIpc(path, token, createSupervisorHandler(lifecycle, () => {}));
  const hook = async (hook_event_name: string) => {
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "../ein-cc/continuity-runner.ts"), "hook"], {
      cwd, env: { ...process.env, EIN_CONTINUITY_ENDPOINT: path, EIN_CONTINUITY_TOKEN: token }, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    });
    proc.stdin.write(JSON.stringify({ hook_event_name, session_id: "native-session", tool_use_id: "call-1", tool_name: "Bash", tool_input: { command: "bun test" } })); proc.stdin.end();
    const output = await new Response(proc.stdout).text(); expect(await proc.exited).toBe(0); return output;
  };
  try {
    expect(await hook("PreToolUse")).toBe("");
    expect(readContinuityOperations(cwd)).toMatchObject({ status: "valid", journal: { operations: [{ status: "running", inputDigest: operation.inputDigest }] } });
    expect(await hook("PostToolUseFailure")).toBe("");
  } finally { await ipc.close(); await lifecycle.shutdown(); }
  const restarted = createContinuityHandoffLifecycle(cwd, { now: () => new Date().toISOString(), runtimeAvailable: () => true });
  expect(await restarted.refresh(true)).toBe("mutation-uncertain");
  expect(await restarted.prepare("pi")).toMatchObject({ ok: false, reason: "mutation-uncertain" });
});

test("failed start denies execution, reads remain untracked, and Task success is not terminal proof", async () => {
  const events: any[] = [], send = async (event: any) => { events.push(event); return "unavailable"; };
  const base = { hook_event_name: "PreToolUse", session_id: "native-session", tool_use_id: "x", tool_name: "Bash", tool_input: { command: "bun test" } };
  expect(JSON.parse((await handleClaudeHook(base, send)).stdout).hookSpecificOutput.permissionDecision).toBe("deny");
  expect(events.map((e) => e.kind)).toEqual(["operation-start", "operation-denied"]);
  events.length = 0;
  expect((await handleClaudeHook({ ...base, tool_input: { command: "git diff --check" } }, send)).stdout).toBe(""); expect(events).toEqual([]);
  await handleClaudeHook({ ...base, hook_event_name: "PostToolUse", tool_name: "Task" }, async (event) => { events.push(event); return "operation-recorded"; });
  expect(events[0].outcome).toBe("unavailable");
});

test("the real Claude guard and start hook correlate the current admission in either order", async () => {
  for (const guardFirst of [false, true]) {
    const cwd = fixture(), life = createContinuityHandoffLifecycle(cwd, { now: () => new Date().toISOString(), runtimeAvailable: () => true });
    const path = join(cwd, "guard.sock"), token = "guard-test";
    const ipc = await listenIpc(path, token, createSupervisorHandler(life, () => {}));
    const payload = { hook_event_name: "PreToolUse", session_id: "native-session", tool_use_id: `denied-${guardFirst}`, tool_name: "Bash", tool_input: { command: "git push --force origin main" } };
    const run = async (guard: boolean) => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, guard ? "../ein-cc/sdd-cli/cli.ts" : "../ein-cc/continuity-runner.ts"), guard ? "guard" : "hook"], { cwd, env: { ...process.env, EIN_CONTINUITY_ENDPOINT: path, EIN_CONTINUITY_TOKEN: token }, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
      child.stdin.write(JSON.stringify(payload)); child.stdin.end();
      const stdout = await new Response(child.stdout).text(); expect(await child.exited).toBe(0); return stdout;
    };
    try {
      if (guardFirst) { expect(JSON.parse(await run(true)).hookSpecificOutput.permissionDecision).toBe("deny"); await run(false); }
      else { expect(await run(false)).toBe(""); expect(JSON.parse(await run(true)).hookSpecificOutput.permissionDecision).toBe("deny"); }
      expect(readContinuityOperations(cwd)).toMatchObject({ status: "valid", journal: { operations: [{ status: "settled", outcome: "not-started" }] } });
    } finally { await ipc.close(); await life.shutdown(); }
  }
});
