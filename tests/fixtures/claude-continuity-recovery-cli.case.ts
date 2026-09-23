import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createContinuityOperationRuntime } from "../../ein-pi/agent/lib/continuity-operation-runtime.ts";
import { operationId, operationInputDigest } from "../../ein-pi/agent/lib/continuity-operations.ts";
import { sessionReferenceFor } from "../../ein-pi/agent/lib/runtime-session-identity.ts";

test("CLI recovers a Pi native call from its isolated session without a running supervisor or SDD", () => {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "ein-recovery-cli-"))), cwd = join(base, "project"), agentHome = join(base, "agent"), sessions = join(agentHome, "sessions", "project");
  mkdirSync(cwd); mkdirSync(sessions, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd }); execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"], { cwd });
  writeFileSync(join(cwd, "package.json"), '{"scripts":{"test":"bun test"}}');
  const manager = SessionManager.create(cwd, sessions), input = { command: "bun test" };
  manager.appendMessage({ role: "user", content: "Run the local tests", timestamp: Date.now() } as any);
  manager.appendMessage({ role: "assistant", content: [{ type: "thinking", thinking: "never disclose this reasoning" }, { type: "toolCall", id: "failed-test", name: "bash", arguments: input }] } as any);
  manager.appendMessage({ role: "toolResult", toolCallId: "failed-test", toolName: "bash", content: [{ type: "text", text: "1 test failed" }], isError: true, timestamp: Date.now() } as any);
  const ref = { sessionRef: sessionReferenceFor("pi", manager.getSessionId()), toolCallId: "failed-test" };
  const runtime = createContinuityOperationRuntime(cwd), start = { runtime: "pi" as const, tool: "bash", inputDigest: operationInputDigest(input), nativeCallRef: ref, effectScope: "external-or-unknown" as const };
  const cli = (args: string[], json?: unknown) => Bun.spawnSync([process.execPath, join(import.meta.dir, "../../ein-cc/sdd-cli/cli.ts"), "continuity", ...args], { cwd, env: { ...process.env, EIN_PI_AGENT_HOME: agentHome }, stdin: json === undefined ? undefined : Buffer.from(JSON.stringify(json)) });
  try {
    runtime.begin(start); runtime.finish(start, "failed");
    const id = operationId("pi", ref), inspected = cli(["inspect", id]); expect(inspected.exitCode).toBe(0);
    const view = JSON.parse(inspected.stdout.toString()); expect(view.value.call.inputDigest).toBe(start.inputDigest); expect(inspected.stdout.toString()).not.toContain("never disclose");
    // CAS -> Tracking the CLI itself must not stale an inspection of another operation.
    const control = { ...start, nativeCallRef: { ...ref, toolCallId: "inspect-cli" } };
    runtime.begin(control); runtime.finish(control, "succeeded");
    const resolved = cli(["resolve", id], { token: view.value.token, assessment: { kind: "local-attested", summary: "Reviewed local package test script and failure", callRef: ref, evidenceRefs: [], evidencePaths: ["package.json"] } });
    expect(resolved.exitCode).toBe(0); expect(JSON.parse(resolved.stdout.toString()).value.recovery.source).toBe("claude-coordinator");
    expect(runtime.uncertain()).toBe(false); expect(existsSync(join(cwd, "openspec"))).toBe(false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
