import { constants, closeSync, fstatSync, openSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { operationInputDigest, classifyContinuityTool, validNativeCallRef, type NativeCallRef } from "./continuity-operations.ts";
import { projectBindingFromState, resolveSessionReference, sessionReferenceFor } from "./runtime-session-identity.ts";
import { projectProjectState } from "./project-state.ts";
import { MAX_PROJECT_SESSIONS, scanProjectSessions } from "./sessions.ts";
import { scanClaudeProjectSessions } from "./claude-sessions.ts";

export type ObservedContinuityCall = { ref: NativeCallRef; tool: string; input: unknown; inputDigest: string; terminal: "succeeded" | "failed" | "unavailable"; result?: unknown; nativeOrder?: { call: number; result?: number } };
export type ObservedContinuityEvidence = { ref: string; digest: string; source: "pi" | "claude"; result: unknown; matchesExternalEffect?: boolean };
export type ContinuityRecoveryEvidencePort = {
  readCall(ref: NativeCallRef): ObservedContinuityCall | undefined;
  readEvidence(ref: string, subject?: ObservedContinuityCall): ObservedContinuityEvidence | undefined;
};
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
export function continuityEvidenceRef(ref: NativeCallRef): string { return `${ref.sessionRef}#${encodeURIComponent(ref.toolCallId)}`; }

export function observedCallFromEntries(ref: NativeCallRef, entries: readonly unknown[]): ObservedContinuityCall | undefined {
  if (!validNativeCallRef(ref)) return;
  const calls: { tool: string; input: unknown; order: number }[] = [], results: { failed: boolean; value: unknown; order: number }[] = [];
  for (const [order, entry] of entries.entries()) {
    if (!record(entry)) continue;
    const message = record(entry.message) ? entry.message : entry;
    if (message.role === "toolResult" && message.toolCallId === ref.toolCallId) results.push({ order, failed: message.isError === true, value: { content: Array.isArray(message.content) ? message.content.filter((part) => record(part) && part.type === "text").map((part) => ({ type: "text", text: part.text })) : [] } });
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (!record(block)) continue;
      if (message.role === "assistant" && ["toolCall", "tool_use"].includes(block.type) && block.id === ref.toolCallId && typeof block.name === "string") {
        calls.push({ order, tool: block.name, input: block.type === "toolCall" ? block.arguments : block.input });
      }
      if (message.role === "user" && block.type === "tool_result" && block.tool_use_id === ref.toolCallId) results.push({ order, failed: block.is_error === true, value: block.content });
    }
  }
  if (calls.length !== 1 || results.length > 1) return;
  const call = calls[0]!;
  return { ref, tool: call.tool, input: call.input, inputDigest: operationInputDigest(call.input), nativeOrder: { call: call.order, ...(results.length ? { result: results[0]!.order } : {}) }, terminal: !results.length ? "unavailable" : results[0]!.failed ? "failed" : "succeeded", ...(results.length ? { result: results[0]!.value } : {}) };
}

export function createContinuityRecoveryEvidence(cwd: string, current?: { sessionId(): string | undefined; entries(): readonly unknown[] }): ContinuityRecoveryEvidencePort {
  const readCall = (ref: NativeCallRef): ObservedContinuityCall | undefined => {
    try {
      if (!validNativeCallRef(ref)) return;
      const sessionId = current?.sessionId();
      if (sessionId && sessionReferenceFor("pi", sessionId) === ref.sessionRef) return observedCallFromEntries(ref, current!.entries());
      const provider = ref.sessionRef.startsWith("pi:") ? "pi" : "claude";
      const binding = projectBindingFromState(projectProjectState({ cwd }));
      const id = resolveSessionReference(provider, binding, ref.sessionRef); if (!id) return;
      const scope = { cwd: binding.cwd, repositoryRoot: binding.repositoryRoot };
      const scan = provider === "pi" ? scanProjectSessions(scope, MAX_PROJECT_SESSIONS) : scanClaudeProjectSessions(scope, MAX_PROJECT_SESSIONS);
      const session = scan.matches.find((item) => item.id === id); if (!session) return;
      const fd = openSync(session.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      try {
        const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 64 * 1024 * 1024) return;
        // PROVENANCE -> Only matching tool records leave the native transcript boundary.
        const entries = readFileSync(fd, "utf8").split("\n").map((line) => { if (!line.includes(JSON.stringify(ref.toolCallId))) return; try { return JSON.parse(line); } catch { return; } });
        return observedCallFromEntries(ref, entries);
      } finally { closeSync(fd); }
    } catch { return; }
  };
  return { readCall, readEvidence(value, subject) {
    const separator = value.indexOf("#"); if (separator < 0) return;
    let toolCallId: string; try { toolCallId = decodeURIComponent(value.slice(separator + 1)); } catch { return; }
    const ref = { sessionRef: value.slice(0, separator), toolCallId }, call = readCall(ref);
    if (!call || call.terminal !== "succeeded") return;
    const matchesExternalEffect = subject ? matchingGitReadback(subject, call) : false;
    if (!matchesExternalEffect && classifyContinuityTool(call.tool, call.input) !== "read") return;
    return { ref: value, digest: operationInputDigest(call.result), source: ref.sessionRef.startsWith("pi:") ? "pi" : "claude", result: call.result, matchesExternalEffect };
  } };
}

function matchingGitReadback(subject: ObservedContinuityCall, readback: ObservedContinuityCall): boolean {
  if (subject.ref.sessionRef !== readback.ref.sessionRef || !subject.nativeOrder || !readback.nativeOrder || readback.nativeOrder.call <= (subject.nativeOrder.result ?? subject.nativeOrder.call)) return false;
  if (!["bash", "Bash"].includes(subject.tool) || !["bash", "Bash"].includes(readback.tool) || !record(subject.input) || !record(readback.input)) return false;
  const push = /^git push ([A-Za-z0-9_.:/@-]+) ([a-f0-9]{40}|[a-f0-9]{64}):(refs\/heads\/[A-Za-z0-9_./-]+)$/.exec(subject.input.command);
  if (!push || readback.input.command !== `git ls-remote --exit-code ${push[1]} ${push[3]}`) return false;
  // IDENTITY -> A mutable remote alias cannot prove that push and read-back reached the same repository.
  if (!/^(?:https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_./-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9_./-]+)$/.test(push[1]!)) return false;
  const result = record(readback.result) ? readback.result.content : readback.result;
  const output = typeof result === "string" ? result : Array.isArray(result) ? result.filter((part) => record(part) && part.type === "text").map((part) => part.text).join("\n") : "";
  return output.trim() === `${push[2]}\t${push[3]}`;
}

export function requiresExternalContinuityProof(call: ObservedContinuityCall): boolean {
  if (!["bash", "Bash"].includes(call.tool) || !record(call.input) || typeof call.input.command !== "string") return false;
  // UNCERTAINTY -> Flags, wrappers and compound commands cannot turn an identifiable remote effect into local proof.
  const command = call.input.command.replace(/\\\r?\n/g, " ");
  return /\bgit\b[\s\S]*\bpush\b/i.test(command)
    || /\bgh\b[\s\S]*\b(?:pr|release|issue)\s+(?:create|merge|edit)\b/i.test(command)
    || /\b(?:curl|wget)\b/i.test(command);
}

export function continuityEvidenceFile(cwd: string, path: string): { path: string; digest: string } {
  const root = realpathSync(cwd), target = resolve(root, path), delta = relative(root, target);
  if (!delta || isAbsolute(delta) || delta === ".." || delta.startsWith("../")) throw new Error("evidence-path-outside-project");
  const actual = realpathSync(target), actualDelta = relative(root, actual);
  if (actual !== target || isAbsolute(actualDelta) || actualDelta === ".." || actualDelta.startsWith("../")) throw new Error("unsafe-evidence-path");
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd); if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("evidence-file-unavailable");
    return { path: delta, digest: operationInputDigest(readFileSync(fd).toString("base64")) };
  } finally { closeSync(fd); }
}
