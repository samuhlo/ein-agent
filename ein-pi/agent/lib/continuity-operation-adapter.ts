import type { ExtensionContext, ToolCallEvent, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { classifyContinuityTool, operationInputDigest } from "./continuity-operations.ts";
import { createContinuityOperationRuntime, type OperationStart } from "./continuity-operation-runtime.ts";
import { sessionReferenceFor } from "./runtime-session-identity.ts";
import { recognizePiParticipantTerminal } from "../extensions/internal/ein-pi-event-contracts.ts";
import { collectDelegationItems } from "./delegation-shape.ts";
import { observedCallFromEntries } from "./continuity-recovery-evidence.ts";
import { admitDelegation } from "./delegation-admission.ts";
import { normalizeScoutLaunch } from "./scout-contract.ts";
import { listDiscoverableAgents } from "./model-config.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function admittedReadOnlyScout(input: unknown, toolCallId: string, cwd: string): boolean {
  try {
    const admitted = admitDelegation(input);
    if (admitted.kind !== "execution" || !admitted.items.every((item) => item.agent === "ein-scout")) return false;
    if (!normalizeScoutLaunch(input, toolCallId, new Map(), cwd)) return false;
    const options = input as Record<string, unknown>, target = resolve(cwd, typeof options.cwd === "string" ? options.cwd : ".");
    if (admitted.items.some((item) => typeof item.cwd === "string" && resolve(target, item.cwd) !== target)) return false;
    const agent = listDiscoverableAgents(target).find((item) => item.name === "ein-scout"); if (!agent?.filePath) return false;
    if (options.agentScope === "user" && agent.source === "project" || options.agentScope === "project" && agent.source !== "project") return false;
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(agent.filePath, "utf8"))?.[1];
    const tools = /^tools:\s*([^\r\n]+)$/m.exec(frontmatter ?? "")?.[1]?.split(",").map((item) => item.trim());
    return !!tools?.length && tools.every((tool) => ["read", "grep", "find"].includes(tool));
  } catch { return false; }
}

const identities = new WeakMap<object, OperationStart | null>();
export function piContinuityOperation(event: Pick<ToolCallEvent, "toolName" | "toolCallId" | "input">, ctx: Pick<ExtensionContext, "sessionManager" | "cwd">): OperationStart | undefined {
  if (identities.has(event)) return identities.get(event) ?? undefined;
  const effect = classifyContinuityTool(event.toolName, event.input);
  if (effect === "read" || effect === "uncovered") { identities.set(event, null); return; }
  const sessionId = ctx.sessionManager?.getSessionId?.(); if (!sessionId || !event.toolCallId) throw new Error("native-call-identity-unavailable");
  const nativeCallRef = { sessionRef: sessionReferenceFor("pi", sessionId), toolCallId: event.toolCallId };
  const native = observedCallFromEntries(nativeCallRef, ctx.sessionManager.getBranch());
  if (event.toolName === "subagent" && admittedReadOnlyScout(native?.input ?? event.input, event.toolCallId, ctx.cwd)) { identities.set(event, null); return; }
  const input: OperationStart = { runtime: "pi", tool: event.toolName, inputDigest: native?.inputDigest ?? operationInputDigest(event.input), nativeCallRef, effectScope: "external-or-unknown" };
  identities.set(event, input); return input;
}
export function observeContinuityGuard(handler: (event: ToolCallEvent, ctx: ExtensionContext) => ToolCallEventResult | void | Promise<ToolCallEventResult | void>, guardId: string) {
  return (event: ToolCallEvent, ctx: ExtensionContext): ToolCallEventResult | void | Promise<ToolCallEventResult | void> => {
    let input: OperationStart | undefined;
    try { input = piContinuityOperation(event, ctx); } catch { /* The mutation observer blocks launches without native identity. */ }
    const observe = (result: ToolCallEventResult | void) => {
      if (result?.block && input) createContinuityOperationRuntime(ctx.cwd).denied(input, guardId);
      return result;
    };
    const result = handler(event, ctx);
    return result instanceof Promise ? result.then(observe) : observe(result);
  };
}
export function continuityToolOutcome(event: { toolName: string; isError: boolean; input?: unknown; details?: unknown; content?: unknown }): "succeeded" | "failed" | "unavailable" {
  if (event.isError) return "failed";
  if (event.toolName !== "subagent") return "succeeded";
  const items = collectDelegationItems(event.input);
  if (items.length !== 1 || !items[0]?.agent || !items[0].task) return "unavailable";
  const terminal = recognizePiParticipantTerminal({ ...event, details: event.details, agent: items[0].agent, task: items[0].task, callMatched: true });
  return terminal.status === "complete" ? "succeeded" : "unavailable";
}
