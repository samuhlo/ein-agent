#!/usr/bin/env bun
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, type Socket } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { stdin, stdout } from "node:process";

import { CONTINUITY_CHECKPOINT_LIMITS } from "../ein-pi/agent/lib/continuity-checkpoint.ts";
import { createContinuityHandoffLifecycle, localExecutableAvailable, type ContinuityHandoffLifecycle } from "../ein-pi/agent/lib/continuity-handoff-lifecycle.ts";
import { runContinueInPty } from "../ein-pi/agent/lib/terminal-continue-transport.ts";
import { resolveEngramDataDir } from "../ein-pi/agent/lib/memory-contract.ts";

const ENDPOINT = "EIN_CONTINUITY_ENDPOINT", TOKEN = "EIN_CONTINUITY_TOKEN";
const USAGE = "usage: /ein:handoff status|to pi|to claude|refresh|clear";
const encoder = new TextEncoder(), CONTROL = /[\u0000-\u001f\u007f]/u;
type Action = "status" | "to-pi" | "to-claude" | "refresh" | "clear";
type Tool = "Write" | "Edit" | "Bash" | "Task";
type Event = { kind: "control"; action: Action } | { kind: "prompt"; text: string } | { kind: "mutation"; tool: Tool; success: boolean } | { kind: "refresh"; boundary: "stop" | "compact-manual" | "compact-auto" } | { kind: "shutdown"; reason: "clear" | "resume" | "logout" | "prompt_input_exit" | "bypass_permissions_disabled" | "other" };
type HookResult = Readonly<{ stdout: string; exitCode: 0 }>;
const FRAME_BYTES = 2_048, IO_MS = 1_000, TERM_MS = 500; let sourceStop: Promise<number> | undefined;

export function parseHandoffPrompt(prompt: string): Action | null {
  const actions: Readonly<Record<string, Action>> = {
    "/ein:handoff status": "status", "/ein:handoff to pi": "to-pi", "/ein:handoff to claude": "to-claude",
    "/ein:handoff refresh": "refresh", "/ein:handoff clear": "clear",
  };
  return actions[prompt] ?? null;
}

function isHandoffAttempt(prompt: string): boolean {
  return prompt.trimStart().toLowerCase().startsWith("/ein:handoff");
}

function boundedCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9:/| _-]{1,192}$/.test(value) ? value : "unavailable";
}

async function sendIpc(event: Event): Promise<string> {
  const path = process.env[ENDPOINT], token = process.env[TOKEN];
  if (!path || !token) return "unavailable";
  return new Promise((resolve) => {
    let output = "", settled = false;
    const finish = (value: string): void => { if (!settled) { settled = true; resolve(boundedCode(value)); } };
    const socket = createConnection(path, () => socket.end(`${JSON.stringify({ v: 1, token, event })}\n`));
    socket.setEncoding("utf8"); socket.on("data", (chunk) => { if (output.length < 256) output += chunk; });
    socket.setTimeout(1_000, () => { socket.destroy(); finish("unavailable"); });
    socket.on("end", () => finish(output.trim())); socket.on("error", () => finish("unavailable"));
  });
}

function block(reason: string): HookResult {
  return { exitCode: 0, stdout: `${JSON.stringify({ decision: "block", reason: boundedCode(reason), suppressOutput: true, hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true } })}\n` };
}

export async function handleClaudeHook(input: unknown, send: (event: Event) => Promise<string> = sendIpc): Promise<HookResult> {
  try {
    if (!input || typeof input !== "object") return { exitCode: 0, stdout: "" };
    const value = input as Record<string, unknown>, name = value.hook_event_name;
    if (name === "UserPromptSubmit" && typeof value.prompt === "string") {
      const prompt = value.prompt, action = parseHandoffPrompt(prompt);
      if (action) { let reason = "unavailable"; try { reason = await send({ kind: "control", action }); } catch {} return block(reason); }
      if (isHandoffAttempt(prompt)) return block(USAGE);
      if (prompt.length > 0 && encoder.encode(prompt).byteLength <= CONTINUITY_CHECKPOINT_LIMITS.maxObjectiveBytes && !CONTROL.test(prompt)) {
        await send({ kind: "prompt", text: prompt });
      }
    } else if ((name === "PostToolUse" || name === "PostToolUseFailure") && ["Write", "Edit", "Bash", "Task"].includes(String(value.tool_name))) {
      await send({ kind: "mutation", tool: value.tool_name as Tool, success: name === "PostToolUse" });
    } else if (name === "Stop") await send({ kind: "refresh", boundary: "stop" });
    else if (name === "PreCompact") await send({ kind: "refresh", boundary: value.trigger === "manual" ? "compact-manual" : "compact-auto" });
    else if (name === "SessionEnd") await send({ kind: "shutdown", reason: ["clear", "resume", "logout", "prompt_input_exit", "bypass_permissions_disabled"].includes(String(value.reason)) ? value.reason as Extract<Event, { kind: "shutdown" }>["reason"] : "other" });
  } catch {}
  return { exitCode: 0, stdout: "" };
}

function statusCode(status: Awaited<ReturnType<ContinuityHandoffLifecycle["status"]>>): string {
  return `status:${status.operation}|${status.checkpoint}|${status.freshness}|pi-${status.pi.status}|claude-${status.claude.status}`;
}

export function createSupervisorHandler(lifecycle: ContinuityHandoffLifecycle, replace: (target: "pi" | "claude", brief: string) => void, available: () => boolean = () => true): (event: Event) => Promise<string> {
  let ownership: "open" | "preparing" | "committed" = "open";
  return async (event) => {
    if (ownership === "committed") return "replacing";
    if (ownership === "preparing") return "busy";
    if (event.kind === "prompt") { lifecycle.captureInput(event.text); return lifecycle.refresh(); }
    if (event.kind === "mutation") return lifecycle.mutationResult(event.success);
    if (event.kind === "refresh") return lifecycle.refresh();
    if (event.kind === "shutdown") return lifecycle.shutdown();
    if (event.action === "status") return statusCode(await lifecycle.status());
    if (event.action === "refresh") return lifecycle.refresh(true);
    if (event.action === "clear") return lifecycle.clear();
    ownership = "preparing";
    const target = event.action === "to-pi" ? "pi" : "claude", prepared = await lifecycle.prepare(target);
    if (!available()) { ownership = "open"; return "unavailable"; }
    if (!prepared.ok) { ownership = "open"; return prepared.reason; }
    ownership = "committed"; lifecycle.markPreparedReplacement(); replace(target, prepared.brief.content); return "handoff-started";
  };
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function duplicateKey(raw: string): boolean { const seen = new Set<string>(); for (const match of raw.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)) { let key: string; try { key = JSON.parse(`"${match[1]}"`) as string; } catch { return true; } if (seen.has(key)) return true; seen.add(key); } return false; }

export function parseIpcFrame(raw: string, token: string): Readonly<{ ok: true; event: Event }> | Readonly<{ ok: false; code: "unavailable" | "invalid-frame" }> {
  if (encoder.encode(raw).byteLength > FRAME_BYTES) return { ok: false, code: "invalid-frame" };
  let frame: unknown; try { frame = JSON.parse(raw); } catch { return { ok: false, code: "invalid-frame" }; }
  if (!record(frame) || typeof frame.token !== "string") return { ok: false, code: "unavailable" };
  const supplied = Buffer.from(frame.token), expected = Buffer.from(token);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return { ok: false, code: "unavailable" };
  if (duplicateKey(raw) || !exact(frame, ["v", "token", "event"]) || frame.v !== 1 || !record(frame.event)) return { ok: false, code: "invalid-frame" };
  const event = frame.event, kind = event.kind;
  if (kind === "control" && exact(event, ["kind", "action"]) && ["status", "to-pi", "to-claude", "refresh", "clear"].includes(String(event.action))) return { ok: true, event: event as Event };
  if (kind === "prompt" && exact(event, ["kind", "text"]) && typeof event.text === "string" && event.text.length > 0 && encoder.encode(event.text).byteLength <= CONTINUITY_CHECKPOINT_LIMITS.maxObjectiveBytes && !CONTROL.test(event.text)) return { ok: true, event: event as Event };
  if (kind === "mutation" && exact(event, ["kind", "tool", "success"]) && ["Write", "Edit", "Bash", "Task"].includes(String(event.tool)) && typeof event.success === "boolean") return { ok: true, event: event as Event };
  if (kind === "refresh" && exact(event, ["kind", "boundary"]) && ["stop", "compact-manual", "compact-auto"].includes(String(event.boundary))) return { ok: true, event: event as Event };
  if (kind === "shutdown" && exact(event, ["kind", "reason"]) && ["clear", "resume", "logout", "prompt_input_exit", "bypass_permissions_disabled", "other"].includes(String(event.reason))) return { ok: true, event: event as Event };
  return { ok: false, code: "invalid-frame" };
}

export async function listenIpc(path: string, token: string, handler: (event: Event) => Promise<string>, deadline = IO_MS): Promise<Readonly<{ close: () => Promise<void> }>> {
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, (socket) => { sockets.add(socket); let size = 0, chunks: Buffer[] = [];
    socket.setTimeout(deadline, () => socket.destroy()); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    socket.on("data", (chunk: Buffer) => { size += chunk.byteLength; if (size > FRAME_BYTES) { chunks = []; socket.destroy(); } else chunks.push(chunk); });
    socket.on("end", async () => { const parsed = parseIpcFrame(Buffer.concat(chunks).toString("utf8"), token); if (!parsed.ok) return socket.end(parsed.code); try { socket.end(boundedCode(await handler(parsed.event))); } catch { socket.end("unavailable"); } });
  });
  await new Promise<void>((resolve, reject) => server.listen(path, resolve).once("error", reject)); chmodSync(path, 0o600);
  let closing: Promise<void> | undefined;
  return { close: () => closing ??= (async () => { const stopped = new Promise<void>((resolve) => server.close(() => resolve())); for (const socket of sockets) socket.destroy(); await Promise.race([stopped, new Promise<void>((resolve) => setTimeout(resolve, deadline))]); rmSync(path, { force: true }); })() };
}

type SourceChild = Readonly<{ exitCode: number | null; exited: Promise<number>; kill: (signal: NodeJS.Signals) => void }>;
async function exitedWithin(child: SourceChild, delay: number): Promise<boolean> { if (child.exitCode !== null) return true; let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([child.exited.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), delay); })]); } finally { if (timer) clearTimeout(timer); } }
/** Process ownership deadlines never stand in for provider input readiness. */
export async function terminateSource(child: SourceChild, grace = TERM_MS): Promise<boolean> { if (child.exitCode !== null) return true; child.kill("SIGTERM"); if (await exitedWithin(child, grace)) return true; child.kill("SIGKILL"); return exitedWithin(child, grace); }

async function runSource(argv: readonly string[], env: NodeJS.ProcessEnv, setChild: (child: ReturnType<typeof Bun.spawn>) => void): Promise<number> {
  let terminal: Bun.Terminal;
  const forward = (chunk: Buffer | string): void => { terminal.write(chunk); };
  terminal = new Bun.Terminal({ cols: stdout.columns || 80, rows: stdout.rows || 24, data: (_terminal, bytes) => { stdout.write(bytes); } });
  stdin.setRawMode?.(true); stdin.resume(); stdin.on("data", forward);
  try { const child = Bun.spawn(["claude", ...argv], { cwd: process.cwd(), env, terminal }); setChild(child); return await (sourceStop ? Promise.race([child.exited, sourceStop]) : child.exited); }
  finally { stdin.off("data", forward); stdin.setRawMode?.(false); stdin.pause(); terminal.close(); }
}

export async function runClaudeContinuity(argv: readonly string[]): Promise<number> {
  const root = mkdtempSync(join(tmpdir(), "cc-ein-continuity-")), path = join(root, "control.sock"), token = randomBytes(32).toString("hex");
  let child: ReturnType<typeof Bun.spawn> | undefined, replacement: { target: "pi" | "claude"; brief: string } | undefined, termination: Promise<boolean> | undefined, interrupted = false, accepting = true;
  const lifecycle = createContinuityHandoffLifecycle(process.cwd(), { now: () => new Date().toISOString(), runtimeAvailable: localExecutableAvailable, processObservation: () => child?.exitCode === null ? "active" : "none" });
  let stopSource!: (code: number) => void; const stopped = new Promise<number>((resolve) => { stopSource = resolve; }); sourceStop = stopped;
  const handler = createSupervisorHandler(lifecycle, (target, brief) => { replacement = { target, brief }; termination = terminateSource(child!).then((ok) => { if (!ok) { child?.unref(); stopSource(70); } return ok; }); }, () => accepting);
  const ipc = await listenIpc(path, token, handler);
  const env: NodeJS.ProcessEnv = { ...process.env, [ENDPOINT]: path, [TOKEN]: token }; delete env.ENGRAM_DATA_DIR;
  const sourceEngram = resolveEngramDataDir("claude", env); if (sourceEngram) env.ENGRAM_DATA_DIR = sourceEngram;
  try {
    const onSignal = (code: number): void => { if (interrupted) return; interrupted = true; termination ??= terminateSource(child!).then((ok) => { if (!ok) child?.unref(); return ok; }); stopSource(code); }, onInt = (): void => onSignal(130), onTerm = (): void => onSignal(143); process.once("SIGINT", onInt); process.once("SIGTERM", onTerm);
    let code: number; try { code = await runSource(argv, env, (value) => { child = value; }); }
    finally { process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); accepting = false; }
    await lifecycle.shutdown();
    if (!replacement || interrupted) return code;
    if (!await termination) { lifecycle.restoreCancelledReplacement(); replacement = undefined; return 70; }
    await ipc.close();
    const cleanEnv = { ...process.env }; delete cleanEnv[ENDPOINT]; delete cleanEnv[TOKEN]; delete cleanEnv.ENGRAM_DATA_DIR;
    const destinationEngram = resolveEngramDataDir(replacement.target, cleanEnv); if (destinationEngram) cleanEnv.ENGRAM_DATA_DIR = destinationEngram;
    if (replacement.target === "pi") { delete cleanEnv.CLAUDE_CONFIG_DIR; cleanEnv.EIN_PI_AGENT_HOME ||= join(cleanEnv.HOME ?? "", ".pi-ein", "agent"); } else delete cleanEnv.EIN_PI_AGENT_HOME;
    const outcome = await runContinueInPty({ cwd: process.cwd(), provider: replacement.target, brief: replacement.brief, env: cleanEnv });
    return outcome.kind === "exited" ? outcome.code : 69;
  } finally { if (child?.exitCode === null && !termination) termination = terminateSource(child); await termination; await ipc.close(); rmSync(root, { recursive: true, force: true }); replacement = undefined; sourceStop = undefined; }
}

if (import.meta.main) {
  if (process.argv[2] === "hook") { const reader = Bun.stdin.stream().getReader(), chunks: Uint8Array[] = []; let size = 0, parsed: unknown; while (size <= 65_536) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; chunks.push(next.value); } if (size <= 65_536) try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {} else await reader.cancel(); const result = await handleClaudeHook(parsed); if (result.stdout) stdout.write(result.stdout); }
  else if (process.argv[2] === "supervise") process.exitCode = await runClaudeContinuity(process.argv.slice(3));
  else process.exitCode = 69;
}
