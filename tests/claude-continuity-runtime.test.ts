import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSupervisorHandler, handleClaudeHook, listenIpc, parseHandoffPrompt, parseIpcFrame, terminateSource } from "../cc-ein/continuity-runner.ts";
import type { ContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";

const ROOT = join(import.meta.dir, "..");
const COMMAND = readFileSync(join(ROOT, "cc-ein", "commands", "ein", "handoff.md"), "utf8");
const RUNNER = readFileSync(join(ROOT, "cc-ein", "continuity-runner.ts"), "utf8");
const SYNC = readFileSync(join(ROOT, "cc-ein", "sync.ts"), "utf8");
const RESUME_BRIEF = readFileSync(join(ROOT, "ein-pi", "agent", "lib", "continuity-resume-brief.ts"), "utf8");

function hook(name: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { hook_event_name: name, session_id: "PRIVATE-ID", transcript_path: "/private/transcript", ...extra };
}

describe("Claude native continuity hook", () => {
  test("accepts only the five exact controls", () => {
    expect(parseHandoffPrompt("/ein:handoff status")).toBe("status");
    expect(parseHandoffPrompt("/ein:handoff to pi")).toBe("to-pi");
    expect(parseHandoffPrompt("/ein:handoff to claude")).toBe("to-claude");
    expect(parseHandoffPrompt("/ein:handoff refresh")).toBe("refresh");
    expect(parseHandoffPrompt("/ein:handoff clear")).toBe("clear");
    for (const malformed of [" /ein:handoff status", "/ein:handoff status ", "/ein:handoff  status", "/EIN:handoff status", "/ein:handoff to PI", "/ein:handoff to gemini", "/ein:handoff status now", "/ein:handoffx status", "/ein:handoff\tstatus"]) expect(parseHandoffPrompt(malformed)).toBeNull();
  });

  test("blocks controls before model forwarding with only bounded results", async () => {
    const sent: unknown[] = [];
    const valid = await handleClaudeHook(hook("UserPromptSubmit", { prompt: "/ein:handoff status" }), async (event) => { sent.push(event); return "status:complete|present|current|pi-ready|claude-ready"; });
    const parsed = JSON.parse(valid.stdout) as Record<string, unknown>;
    expect(sent).toEqual([{ kind: "control", action: "status" }]);
    expect(parsed).toMatchObject({ decision: "block", suppressOutput: true });
    expect(valid.stdout).not.toContain("PRIVATE-ID");
    expect((parsed.reason as string).length).toBeLessThan(193);
    for (const prompt of [" /ein:handoff status", "/ein:handoff unknown PRIVATE-RAW", "/ein:handoffx status"]) {
      const malformed = await handleClaudeHook(hook("UserPromptSubmit", { prompt }), async () => "RAW-SUPERVISOR PRIVATE-ID");
      expect(malformed.stdout).toContain('"decision":"block"');
      expect(malformed.stdout).toContain("usage: /ein:handoff");
      expect(malformed.stdout).not.toContain("PRIVATE-RAW");
    }
    const unavailable = await handleClaudeHook(hook("UserPromptSubmit", { prompt: "/ein:handoff clear" }), async () => { throw new Error("PRIVATE-ID raw failure"); });
    expect(unavailable.stdout).toContain('"reason":"unavailable"');
  });

  test("ordinary prompts and automatic lifecycle failures remain fail-open", async () => {
    const sent: unknown[] = [];
    const normal = await handleClaudeHook(hook("UserPromptSubmit", { prompt: "continue safely" }), async (event) => { sent.push(event); throw new Error("offline"); });
    expect(normal).toEqual({ exitCode: 0, stdout: "" });
    expect(sent).toEqual([{ kind: "prompt", text: "continue safely" }]);
    await handleClaudeHook(hook("UserPromptSubmit", { prompt: "x".repeat(513) }), async (event) => { sent.push(event); return "refreshed"; });
    expect(sent).toHaveLength(1);
  });

  test("projects only supported lifecycle facts and never raw hook fields", async () => {
    const sent: unknown[] = [], send = async (event: unknown): Promise<string> => { sent.push(event); return "refreshed"; };
    await handleClaudeHook(hook("PostToolUse", { tool_name: "Write", tool_input: { secret: true }, tool_response: "raw" }), send);
    await handleClaudeHook(hook("PostToolUseFailure", { tool_name: "Task", error: "raw" }), send);
    await handleClaudeHook(hook("Stop"), send); await handleClaudeHook(hook("PreCompact", { trigger: "manual" }), send); await handleClaudeHook(hook("SessionEnd", { reason: "logout" }), send);
    expect(sent).toEqual([{ kind: "mutation", tool: "Write", success: true }, { kind: "mutation", tool: "Task", success: false }, { kind: "refresh", boundary: "stop" }, { kind: "refresh", boundary: "compact-manual" }, { kind: "shutdown", reason: "logout" }]);
    expect(JSON.stringify(sent)).not.toMatch(/PRIVATE-ID|transcript|secret|raw/);
  });
});

describe("Claude continuity supervisor", () => {
  test("rejects every authenticated malformed or oversized frame before dispatch", async () => {
    const token = "a".repeat(64), valid = { v: 1, token };
    const malformed = ["{}", JSON.stringify({ ...valid, event: { kind: "unknown" } }), JSON.stringify({ ...valid, extra: true, event: { kind: "control", action: "to-pi" } }), JSON.stringify({ ...valid, event: { kind: "control", action: 1 } }), JSON.stringify({ ...valid, event: { kind: "mutation", tool: "Read", success: true } }), JSON.stringify({ ...valid, event: { kind: "shutdown", reason: "private" } }), JSON.stringify({ ...valid, v: 2, event: { kind: "control", action: "to-pi" } }), `{"v":1,"token":"${token}","event":{"kind":"control","action":"to-pi","action":"to-claude"}}`, JSON.stringify({ ...valid, event: { kind: "prompt", text: "x".repeat(2_100) } })];
    let effects = 0;
    for (const raw of malformed) { const parsed = parseIpcFrame(raw, token); expect(parsed.ok).toBe(false); if (parsed.ok) effects++; expect(JSON.stringify(parsed)).not.toMatch(/private|to-claude/); }
    expect(effects).toBe(0); expect(parseIpcFrame(JSON.stringify({ ...valid, event: { kind: "control", action: "to-pi" } }), token).ok).toBe(true);
  });

  test("bounds half-open and oversized connections and removes the socket idempotently", async () => {
    const root = mkdtempSync(join(tmpdir(), "ein-ipc-")), path = join(root, "control.sock"); let effects = 0;
    const ipc = await listenIpc(path, "b".repeat(64), async () => { effects++; return "raw PRIVATE"; }, 25);
    const oversized = createConnection(path); await new Promise<void>((resolve) => oversized.once("connect", () => { oversized.write(Buffer.alloc(3_000)); oversized.once("close", resolve); }));
    const halfOpen = createConnection(path); await new Promise<void>((resolve) => halfOpen.once("connect", resolve));
    const halfClosed = new Promise<void>((resolve) => halfOpen.once("close", resolve)); await ipc.close(); await ipc.close(); await halfClosed; expect(halfOpen.destroyed).toBe(true); expect(existsSync(path)).toBe(false); expect(effects).toBe(0); rmSync(root, { recursive: true, force: true });
  });

  test("hands off only successful WU5 briefs to fresh Pi or Claude", async () => {
    for (const target of ["pi", "claude"] as const) {
      const calls: unknown[] = [];
      const lifecycle = { captureInput: () => {}, refresh: async () => "refreshed", mutationResult: async () => "refreshed", status: async () => ({ operation: "complete", checkpoint: "present", freshness: "current", pi: { status: "ready", blockers: [], warnings: [] }, claude: { status: "ready", blockers: [], warnings: [] } }), prepare: async () => ({ ok: true, brief: { content: "PRIVATE-BRIEF" } }), clear: async () => "cleared", markPreparedReplacement: () => calls.push("marked"), restoreCancelledReplacement: () => {}, shutdown: async () => "refreshed" } as unknown as ContinuityHandoffLifecycle;
      const handler = createSupervisorHandler(lifecycle, (received, brief) => calls.push(["replace", received, brief]));
      expect(await handler({ kind: "control", action: target === "pi" ? "to-pi" : "to-claude" })).toBe("handoff-started");
      expect(calls).toEqual(["marked", ["replace", target, "PRIVATE-BRIEF"]]);
    }
    expect(RUNNER).toContain('["claude", ...argv]');
    expect(RUNNER).toContain("provider: replacement.target, brief: replacement.brief, env: cleanEnv");
    expect(RUNNER).not.toContain("EIN_CONTINUITY_BRIEF");
    let release!: () => void, prepares = 0; const gate = new Promise<void>((resolve) => { release = resolve; });
    const lifecycle = { captureInput: () => {}, refresh: async () => "refreshed", mutationResult: async () => "refreshed", status: async () => ({}), prepare: async () => { prepares++; await gate; return { ok: true, brief: { content: "FIRST" } }; }, clear: async () => "cleared", markPreparedReplacement: () => {}, restoreCancelledReplacement: () => {}, shutdown: async () => "refreshed" } as unknown as ContinuityHandoffLifecycle;
    const replacements: unknown[] = [], handler = createSupervisorHandler(lifecycle, (target, brief) => replacements.push([target, brief])); const first = handler({ kind: "control", action: "to-pi" });
    expect(await handler({ kind: "control", action: "to-claude" })).toBe("busy"); release(); expect(await first).toBe("handoff-started"); expect(await handler({ kind: "control", action: "to-claude" })).toBe("replacing"); expect(prepares).toBe(1); expect(replacements).toEqual([["pi", "FIRST"]]);
  });

  test("escalates termination once and never authorizes an unproven replacement", async () => {
    const fake = (proven: boolean) => { let code: number | null = null, exit!: (code: number) => void; const signals: string[] = [], exited = new Promise<number>((resolve) => { exit = resolve; }); return { child: { get exitCode() { return code; }, exited, kill: (signal: NodeJS.Signals) => { signals.push(signal); if (proven && signal === "SIGKILL") { code = 0; exit(0); } } }, signals }; };
    const proven = fake(true); expect(await terminateSource(proven.child, 5)).toBe(true); expect(proven.signals).toEqual(["SIGTERM", "SIGKILL"]);
    const unproven = fake(false); let launches = 0; if (await terminateSource(unproven.child, 5)) launches++; expect(launches).toBe(0); expect(unproven.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  test("static command is discovery-only with no shell or model side effect", () => {
    expect(COMMAND).not.toContain("!`"); expect(COMMAND).not.toMatch(/\$ARGUMENTS|Bash\(|execute|run the helper/i);
    expect(COMMAND).toContain("UserPromptSubmit hook");
    for (const name of ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure", "Stop", "PreCompact", "SessionEnd"]) expect(SYNC).toContain(`${name}:`);
    expect(RUNNER).toContain("await lifecycle.shutdown()");
		expect(RESUME_BRIEF).not.toMatch(/sddParticipants|participant\s+(?:work|execution)/i);
		expect(RESUME_BRIEF).not.toMatch(/execute participant|participant execution/i);
  });

  test("runs real PTY Claude-to-fresh-provider handoffs and native-exit fallback", async () => {
    const root = mkdtempSync(join(tmpdir(), "ein-claude-continuity-")), bin = join(root, "bin"), runner = join(ROOT, "cc-ein", "continuity-runner.ts");
    mkdirSync(bin);
    const stub = `#!/usr/bin/env bun
import { basename } from "node:path";
const runner = process.env.EIN_TEST_RUNNER!;
if (process.env.EIN_TEST_MODE === "exit") { console.log("SOURCE-EXIT"); process.exit(7); }
if (process.env.EIN_TEST_MODE === "signal") { console.log("SOCKET:" + process.env.EIN_CONTINUITY_ENDPOINT); process.on("SIGTERM", () => console.log("SOURCE-TERM")); await new Promise(() => {}); }
if (process.env.EIN_CONTINUITY_ENDPOINT) {
  if (process.env.EIN_TEST_MODE === "resist-handoff") process.on("SIGTERM", () => console.log("SOURCE-TERM"));
  console.log("SOURCEARGV:" + JSON.stringify(process.argv.slice(2)));
  const prompt = "/ein:handoff to " + process.env.EIN_TEST_TARGET;
  const hook = Bun.spawn([process.execPath, runner, "hook"], { stdin: "pipe", stdout: "inherit", stderr: "inherit", env: process.env });
  hook.stdin.write(JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt })); hook.stdin.end(); await hook.exited; setInterval(() => {}, 1000);
} else {
  console.log("DEST:" + basename(process.argv[1]!) + ":" + JSON.stringify(process.argv.slice(2)) + ":IPC=" + Boolean(process.env.EIN_CONTINUITY_ENDPOINT) + ":CC=" + (process.env.CLAUDE_CONFIG_DIR ?? "none") + ":PI=" + (process.env.EIN_PI_AGENT_HOME ?? "none") + ":ENGRAM=" + (process.env.ENGRAM_DATA_DIR ?? "none"));
  process.stdin.on("data", () => process.exit(0)); process.stdin.resume(); process.stdout.write("\\u001b[?2004h");
}`;
    for (const provider of ["pi", "claude"]) { const path = join(bin, provider); writeFileSync(path, stub); chmodSync(path, 0o755); }
    const execute = async (mode: "handoff" | "resist-handoff" | "signal" | "exit", target = "pi"): Promise<{ code: number; output: string }> => {
      let output = ""; const terminal = new Bun.Terminal({ data: (_terminal, bytes) => { output += new TextDecoder().decode(bytes); } });
      const child = Bun.spawn([process.execPath, runner, "supervise", "-c", "--resume", "hook"], { cwd: ROOT, env: { ...process.env, HOME: root, CLAUDE_CONFIG_DIR: join(root, "claude-config"), EIN_PI_AGENT_HOME: join(root, "pi-agent"), ENGRAM_DATA_DIR: "/hostile/source", PATH: `${bin}:${process.env.PATH ?? ""}`, EIN_TEST_RUNNER: runner, EIN_TEST_MODE: mode, EIN_TEST_TARGET: target }, terminal });
      const signalTimer = mode === "signal" ? setInterval(() => { if (output.includes("SOCKET:")) { clearInterval(signalTimer); child.kill("SIGTERM"); } }, 5) : undefined; let timer: ReturnType<typeof setTimeout> | undefined;
      try { const code = await Promise.race([child.exited, new Promise<number>((_, reject) => { timer = setTimeout(() => reject(new Error(output)), 4000); })]); return { code, output }; }
      finally { if (timer) clearTimeout(timer); if (signalTimer) clearInterval(signalTimer); if (child.exitCode === null) child.kill(); terminal.close(); }
    };
    try {
      for (const target of ["pi", "claude"]) { const result = await execute("handoff", target); if (result.code !== 0) throw new Error(result.output); expect(result.output).toContain('SOURCEARGV:["-c","--resume","hook"]'); expect(result.output).toContain(`DEST:${target}:[]:IPC=false`); expect(result.output).toContain(target === "pi" ? `:CC=none:PI=${join(root, "pi-agent")}:ENGRAM=${join(root, ".engram-ein")}` : `:CC=${join(root, "claude-config")}:PI=none:ENGRAM=${join(root, ".engram-ein")}`); expect(result.output).not.toContain("/hostile/source"); expect(result.output).not.toContain("PRIVATE-BRIEF"); }
      const resistant = await execute("resist-handoff"); expect(resistant.code).toBe(0); expect(resistant.output.split("SOURCE-TERM")).toHaveLength(2); expect(resistant.output.split("DEST:pi")).toHaveLength(2);
      const signalled = await execute("signal"); expect(signalled.code).toBe(143); const socket = signalled.output.match(/SOCKET:([^\r\n]+)/)?.[1]; expect(socket && existsSync(socket)).toBe(false); expect(signalled.output).not.toContain("DEST:");
      expect(await execute("exit")).toMatchObject({ code: 7 });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 12_000);
});
