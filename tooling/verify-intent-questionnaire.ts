import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { renderIntentOverlay } from "../ein-pi/agent/lib/sdd-overlay.ts";

const home = process.env.EIN_INTENT_PILOT_AGENT_HOME ?? join(homedir(), ".pi-ein/agent");
const plugin = await import(pathToFileURL(join(home, "npm/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts")).href);
const cwd = mkdtempSync(join(tmpdir(), "ein-intent-questionnaire-"));
const handlers = new Map<string, Function[]>();
const tools = new Map<string, any>();
const branch: any[] = [];
const dialogs: { title: string; options: string[] }[] = [];
let choice: "option" | "custom" | "cancel" = "option";
const pi: any = {
 on: (name: string, handler: Function) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
 events: { emit: () => {} },
 registerTool: (spec: any) => tools.set(spec.name, spec),
 appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }),
};
registerIntentDiscovery(pi, (spec) => pi.registerTool(spec));
plugin.registerAskUserQuestionTool(pi);
const ctx: any = { cwd, hasUI: true, mode: "rpc", sessionManager: { getBranch: () => branch }, ui: {
 select: async (title: string, options: string[]) => { dialogs.push({ title, options }); return choice === "cancel" ? undefined : choice === "custom" ? options.at(-1) : options[0]; },
 input: async () => "Una cuenta con varios papeles; no autorizo entrega Git.",
} };
let seq = 0;
async function call(name: string, input: any) {
 const toolCallId = `pilot-${++seq}`;
 for (const handler of handlers.get("tool_call") ?? []) {
  const result = await handler({ toolName: name, toolCallId, input }, ctx);
  assert(!result?.block, result?.reason);
 }
 const result = await tools.get(name).execute(toolCallId, input, undefined, undefined, ctx);
 for (const handler of handlers.get("tool_result") ?? []) await handler({ toolName: name, toolCallId, input, ...result, isError: result.isError === true }, ctx);
 assert(!result.isError, JSON.stringify(result.content));
 return result;
}
const material = { objective: "Acordar cuentas", boundaries: { in: ["Identidad y papeles"], out: ["Frontend y entrega Git"] }, completionCriteria: ["Identidad acordada"] };
try {
 await call("ein_intent", { action: "propose", work: "cuentas", material,
  decisions: [{ id: "identity", question: "¿Qué identidad?", dependsOn: [], status: "open" }],
  questionnaire: [{ question: "¿Qué identidad?", header: "Identidad", options: [
   { label: "Una cuenta (recomendado)", description: "Una persona con varios papeles." },
   { label: "Cuentas separadas", description: "Un alta independiente por papel." },
  ] }],
 });
 let state = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert(renderIntentOverlay(state.agreement).join("\n").includes("0/1 decisiones"));
 choice = "custom";
 await call("ask_user_question", { questions: state.agreement.questionnaire });
 state = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert.equal(state.response.source, "ask_user_question");
 assert(state.response.text.includes("no autorizo entrega Git"));
 await call("ein_intent", { action: "review", work: "cuentas", responseId: state.response.id,
  decisions: [{ id: "identity", question: "¿Qué identidad?", dependsOn: [], status: "resolved", resolution: state.response.text }],
 });
 state = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert(renderIntentOverlay(state.agreement).join("\n").includes("revisión final"));
 choice = "cancel";
 await call("ask_user_question", { questions: state.agreement.questionnaire });
 const cancelled = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert.equal(cancelled.response, undefined); assert.equal(cancelled.agreement.status, "pending");
 choice = "option";
 await call("ask_user_question", { questions: state.agreement.questionnaire });
 state = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 await call("ein_intent", { action: "confirm", work: "cuentas", responseId: state.response.id });
 assert(dialogs[0]!.options.length === 3, "Native plugin includes its free-text option");
 console.log(JSON.stringify({ passed: true, checks: ["real plugin RPC dialogs", "native free text", "observed round provenance", "TODO before scope", "cancel remains pending", "review confirmed through native option"], dialogs }, null, 2));
} finally { rmSync(cwd, { recursive: true, force: true }); }
