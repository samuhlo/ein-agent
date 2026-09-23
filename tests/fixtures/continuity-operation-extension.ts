import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import continuity from "../../ein-pi/agent/extensions/ein-continuity.ts";
import { observeContinuityGuard } from "../../ein-pi/agent/lib/continuity-operation-adapter.ts";

export default function fixture(pi: ExtensionAPI) {
  const guard = () => pi.on("tool_call", observeContinuityGuard((event) => {
    if (event.toolName === "write" && (event.input as any).content === "deny") return { block: true, reason: "fixture-denied" };
    if (event.toolName === "subagent") Object.assign(event.input, { async: false, toolBudget: { hard: 12 }, task: `${(event.input as any).task}\nphase budget` });
  }, "fixture-guard"));
  if (process.env.EIN_OPERATION_GUARD_FIRST === "1") guard();
  continuity(pi);
  if (process.env.EIN_OPERATION_GUARD_FIRST !== "1") guard();
  pi.registerTool({ name: "subagent", label: "fixture", description: "fixture", parameters: { type: "object", properties: {} } as never,
    async execute() { return { content: [{ type: "text" as const, text: "done" }], details: { mode: "single", results: [{ agent: "sdd-apply", task: "[prompt redacted]", exitCode: 0, finalOutput: "status: complete\nfixture" }] } }; } });
}
