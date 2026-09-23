import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { renderIntentOverlay } from "../ein-pi/agent/lib/sdd-overlay.ts";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import questionCards from "../ein-pi/agent/extensions/ein-question-cards.ts";
import { readIntentDraft } from "../ein-pi/agent/lib/intent-draft-store.ts";

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
questionCards(pi);
initTheme("dark");
const ctx: any = { cwd, hasUI: true, mode: "rpc", sessionManager: { getBranch: () => branch }, ui: {
 select: async (title: string, options: string[]) => { dialogs.push({ title, options }); return choice === "cancel" ? undefined : choice === "custom" ? options.at(-1) : options[0]; },
 input: async () => "Una cuenta con varios papeles; no autorizo entrega Git.",
} };
let seq = 0;
let renders = 0;
for (const handler of handlers.get("session_start") ?? []) await handler({}, ctx);
async function call(name: string, input: any) {
 if (name === "ein_intent" && input.action !== "status") {
  const draft = readIntentDraft(cwd, input.work);
  input = { ...input, expectedRevision: draft.status === "valid" ? draft.draft.revision : "absent" };
 }
 const toolCallId = `pilot-${++seq}`;
 for (const handler of handlers.get("tool_call") ?? []) {
  const result = await handler({ toolName: name, toolCallId, input }, ctx);
  assert(!result?.block, result?.reason);
 }
 let result = await tools.get(name).execute(toolCallId, input, undefined, undefined, ctx);
 for (const handler of handlers.get("tool_result") ?? []) {
  const patch = await handler({ toolName: name, toolCallId, input, ...result, isError: result.isError === true }, ctx);
  if (patch) result = { ...result, ...patch };
 }
 assert(!result.isError, JSON.stringify(result.content));
 if (name === "ask_user_question") {
  const before = JSON.stringify(result);
  const view = new ToolExecutionComponent(name, toolCallId, input, {}, tools.get(name), { requestRender() {} } as any, cwd);
  view.updateResult({ ...result, isError: false });
  for (const width of [32, 80, 120]) for (const expanded of [false, true]) {
   view.setExpanded(expanded);
   const lines = view.render(width);
   const plain = stripVTControlCharacters(lines.join("\n"));
   assert(lines.every((line) => visibleWidth(line) <= width));
   assert(plain.includes("ein · Tu respuesta"));
   assert(!/User has answered|intentResponse|responseId|Recommended|recomendado/.test(plain));
   if (result.details.cancelled) assert(plain.includes("Cuestionario cancelado"));
   else assert(plain.includes(choice === "custom" ? "no autorizo entrega Git" : "Confirmar acuerdo"));
   renders++;
   if (width === 80 && !expanded) console.log(lines.join("\n"));
  }
  assert.equal(JSON.stringify(result), before);
 }
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
 assert.equal(renderIntentOverlay(state.agreement).length, 3);
 assert(!renderIntentOverlay(state.agreement).join("\n").includes("0/1"));
 choice = "custom";
 const answered = await call("ask_user_question", { questions: state.agreement.questionnaire });
 const receipt = JSON.parse(answered.content.at(-1).text).intentResponse;
 state = JSON.parse((await call("ein_intent", { action: "status" })).content[0].text);
 assert.equal(receipt.responseId, state.response.id);
 assert.equal(receipt.status, "received");
 assert.equal(state.response.source, "ask_user_question");
 assert(state.response.text.includes("no autorizo entrega Git"));
 await call("ein_intent", { action: "review", work: "cuentas", responseId: state.response.id,
  decisions: [{ id: "identity", question: "¿Qué identidad?", dependsOn: [], status: "resolved", resolution: state.response.text }],
 });
 state = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert(renderIntentOverlay(state.agreement).join("\n").includes("Revisión final"));
 choice = "cancel";
 await call("ask_user_question", { questions: state.agreement.questionnaire });
 const cancelled = JSON.parse((await call("ein_intent", { action: "status", work: "cuentas" })).content[0].text);
 assert.equal(cancelled.response, undefined); assert.equal(cancelled.agreement.status, "pending");
 choice = "option";
 const final = await call("ask_user_question", { questions: state.agreement.questionnaire });
 const finalReceipt = JSON.parse(final.content.at(-1).text).intentResponse;
 await call("ein_intent", { action: "confirm", work: "cuentas", responseId: finalReceipt.responseId });
 assert(dialogs[0]!.options.length === 3, "Native plugin includes its free-text option");
 console.log(JSON.stringify({ passed: true, renders, checks: ["real plugin RPC dialogs and Pi terminal rendering", "native free text", "observed round provenance", "TODO before scope", "cancel remains pending", "review confirmed through native option"], dialogs }, null, 2));
} finally {
 for (const handler of handlers.get("session_shutdown") ?? []) await handler({}, ctx);
 rmSync(cwd, { recursive: true, force: true });
}
