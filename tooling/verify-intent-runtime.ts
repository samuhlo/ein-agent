import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { artifactHasIntentKey, readAgreement } from "../ein-pi/agent/lib/intent-agreement.ts";
import { buildEinPrompt } from "../ein-pi/agent/lib/persona.ts";
import { intentDepthCases } from "./intent-depth-cases.ts";

const skillPath = process.argv.find((arg) => arg.startsWith("--skill="))?.slice("--skill=".length) ?? process.env.EIN_INTENT_PILOT_SKILL ?? new URL("../runtime/skills/local/intent-channel/SKILL.md", import.meta.url).pathname;
const intentSkill = `${readFileSync(skillPath, "utf8")}\nSkill source: ${skillPath}. Resolve reference links relative to that file.`;
const block05 = process.argv.includes("--block05");
const depthCaseName = process.argv.find((arg) => arg.startsWith("--depth="))?.slice("--depth=".length);
if (depthCaseName && !(depthCaseName in intentDepthCases)) throw new Error(`Unknown depth case: ${depthCaseName}`);
const depthCase = depthCaseName ? intentDepthCases[depthCaseName as keyof typeof intentDepthCases] : undefined;
const turnMetrics: { elapsedMs: number; tools: string[] }[] = [];
const questionnairePilot = process.argv.includes("--questionnaire");
let nativeQuestionnaire: any;
let registerNativeQuestionnaire: any;
const nativeQuestionnaireResults: any[] = [];
let nativeQuestionnaireCalls = 0;
const block04 = process.argv.includes("--block04");
const conversationOnly = process.argv.includes("--conversation-only");
const installed = process.env.EIN_INTENT_PILOT_AGENT_HOME ?? join(homedir(), ".pi-ein/agent");
const output = mkdtempSync("/tmp/ein-intent-live-");
console.log(`Pilot artifacts: ${output}`);
const agentDir = join(output, "agent"); mkdirSync(agentDir, { mode: 0o700 });
process.on("exit", () => rmSync(agentDir, { recursive: true, force: true }));
copyFileSync(join(installed, "auth.json"), join(agentDir, "auth.json"));
if (existsSync(join(installed, "models.json"))) copyFileSync(join(installed, "models.json"), join(agentDir, "models.json"));
if (existsSync(join(installed, "models-store.json"))) copyFileSync(join(installed, "models-store.json"), join(agentDir, "catalog.json"));
const settings = JSON.parse(readFileSync(join(installed, "settings.json"), "utf8"));
const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "catalog.json"), allowModelNetwork: !existsSync(join(agentDir, "catalog.json")) });
const model = runtime.getModel(settings.defaultProvider, settings.defaultModel);
assert(model, "Configured parent model unavailable");
const events: unknown[] = [];
let writes = 0;
const cwd = join(output, "project"); mkdirSync(cwd);
writeFileSync(join(cwd, "README.md"), "Prototype: exporting a filtered table to CSV. New behavior needs an agreed product specification.\n");
if (questionnairePilot) {
 const plugin = await import(join(installed, "npm/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts"));
 registerNativeQuestionnaire = plugin.registerAskUserQuestionTool;
}
const extension = (pi: ExtensionAPI) => {
 if (questionnairePilot) registerNativeQuestionnaire({ events: pi.events, registerTool: (spec: any) => { nativeQuestionnaire = spec; } });
 if (questionnairePilot) pi.registerTool({ ...nativeQuestionnaire, execute: async (id: string, params: any, signal: any, update: any, ctx: any) => {
  nativeQuestionnaireCalls++;
  const result = await nativeQuestionnaire.execute(id, params, signal, update, { ...ctx, hasUI: true, mode: "rpc", ui: { select: async () => undefined, input: async () => undefined } });
  nativeQuestionnaireResults.push(result);
  return result;
 } });
 registerIntentDiscovery(pi, (spec) => pi.registerTool(spec));
 pi.registerTool({
  name: "subagent", label: "Design executor", description: "Delegate agreed design to sdd-design. task must include change and intent_work. Produces design.md using a real child model.",
  parameters: { type: "object", required: ["agent", "task"], properties: { agent: { type: "string", enum: ["sdd-design"] }, task: { type: "string" } } } as const,
  async execute(_id, args: { agent: string; task: string }) {
   const change = args.task.match(/(?:change:\s*|intent_work:\s*)([a-z0-9-]+)/)?.[1]; assert(change);
   const childSettings = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
   const childLoader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: childSettings, noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
    systemPrompt: "You are the design executor. Read the agreed intent.md in the supplied change directory. Write only design.md there: objective, in/out scope, acceptance scenarios in Given/When/Then form and the exact intent_key. Do not infer consent or introduce product decisions. No other files. Return a concise result." });
   await childLoader.reload();
   const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: settings.defaultThinkingLevel, settingsManager: childSettings, resourceLoader: childLoader, sessionManager: SessionManager.inMemory(cwd), tools: ["read", "write"] });
   const timer = setTimeout(() => void session.abort(), 120_000);
   try { await session.prompt(`Read openspec/changes/${change}/intent.md and create design.md. ${args.task}`); }
   finally { clearTimeout(timer); session.dispose(); }
   const designPath = join(cwd, "openspec/changes", change, "design.md");
   assert(existsSync(designPath)); writes++;
   return { content: [{ type: "text", text: `Design created: ${designPath}` }], details: {} };
  },
 });
};
const sm = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
const parentSession = SessionManager.inMemory(cwd);
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: sm, extensionFactories: [extension], noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
 systemPromptOverride: depthCase ? () => `${buildEinPrompt("neutral")}\n${intentSkill}\nControlled interview pilot: ${depthCase.facts}` : undefined,
 systemPrompt: block05 ? `${buildEinPrompt("neutral")}\n${intentSkill}\nControlled interview: work/change block05. Supplied project facts: own full/partial courses, optional centre, no artificial course limit, content and evaluations stored per module. Frontend is another agent's job; backend here. Changing selected modules recalculates dates. No policy for removing/restoring module content is agreed. The partial-calendar engine needs an experiment whose result is pending. No scout or experiment tool is exposed in this pilot: do not invent results, keep that fact waiting and continue independent product questions. Only intent is authorized; no SDD/code writes.` : block04 ? `${buildEinPrompt("neutral")}\n${intentSkill}\nThe project roadmap has block 04: teacher/academy accounts, required centre data, roles, context-based entry, role headers, profile collaborations. Blocks 06 and 08 own the full dashboards. No additional product decisions have been agreed. This test exposes no scout; use these supplied facts and ask product decisions. Do not invent implementation facts.` : conversationOnly ? `${buildEinPrompt("neutral")}\n${intentSkill}` : `${buildEinPrompt("neutral")}\n${intentSkill}\nThis controlled pilot exposes only intent and a design executor. Treat the request as SDD with work/change export-csv. After agreement, delegate exactly one sdd-design with change and intent_work markers, then report. Do not run other phases or read full workflow manuals; this pilot ends at the product specification.` });
await loader.reload();
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: settings.defaultThinkingLevel, settingsManager: sm, resourceLoader: loader, sessionManager: parentSession, tools: ["ein_intent", ...(depthCase ? [] : ["subagent"]), "read", ...(questionnairePilot ? ["ask_user_question"] : [])] });
await session.bindExtensions({ mode: "rpc", onError: (error) => { throw new Error(String(error)); } });
session.subscribe((event) => { if (["tool_execution_start", "tool_execution_end", "message_end"].includes(event.type)) events.push(event); });
async function turn(text: string) {
 const started = performance.now(); const firstEvent = events.length;
 const timer = setTimeout(() => void session.abort(), 180_000);
 try { await session.prompt(text); }
 finally { clearTimeout(timer); writeFileSync(join(output, "events.json"), JSON.stringify(events, null, 2)); }
 const last = [...session.messages].reverse().find((message) => message.role === "assistant");
 if (last && "stopReason" in last && last.stopReason === "error") throw new Error("errorMessage" in last ? String(last.errorMessage) : "Provider failed during intent pilot");
 const answer = last && "content" in last ? (last.content as any[]).filter((part) => part.type === "text").map((part) => part.text).join("\n") : "";
 turnMetrics.push({ elapsedMs: Math.round(performance.now() - started), tools: (events.slice(firstEvent) as any[]).filter((e) => e.type === "tool_execution_start").map((e) => e.toolName) });
 console.log(JSON.stringify({ turn: text, answer, writes }));
 return answer;
}
try {
 if (depthCase) {
  const transcript = [];
  for (const prompt of depthCase.turns) {
   const answer = await turn(prompt);
   const latest = [...parentSession.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery") as any;
   const state = latest?.data;
   transcript.push({ prompt, answer, state });
   assert.equal(writes, 0);
   if (depthCaseName !== "mechanical") {
    assert.equal(state?.status, "pending", "Incomplete answers must keep intent pending");
    assert.equal(state?.stage, "round", "Do not review unresolved product choices");
    assert.equal(existsSync(join(cwd, "openspec")), false, "Interview creates no SDD files");
   }
  }
  const actions = (events as any[]).filter((event) => event.type === "tool_execution_start" && event.toolName === "ein_intent").map((event) => event.args?.action);
  if (depthCaseName === "mechanical") {
   assert(actions.includes("record"), "Fully specified mechanical work should be recorded");
   assert(!actions.some((action) => ["propose", "review", "confirm"].includes(action)), "Do not invent interview rounds for mechanical work");
  }
  writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, kind: "intent-depth", depthCaseName, skillPath, model: `${settings.defaultProvider}/${settings.defaultModel}`, turnMetrics, actions, transcript, limitations: "Controlled supplied facts, text answers, no scout or native selector. Review actual questions and decision provenance; invariants alone do not establish interview quality. Mechanical case records intent only; no implementation is exposed." }, null, 2));
  console.log(`PASS depth ${depthCaseName} ${output}`);
 } else if (block05) {
  const latest = () => [...parentSession.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery") as any;
  const first = await turn("Vamos con el intent del bloque 05 de cursos propios. Solo quiero acordarlo, no implementar.");
  assert.equal(latest()?.data.status, "pending");
  const second = await turn("Al retirar un módulo, conservar su contenido para recuperarlo si vuelve al mismo curso. Las demás decisiones siguen abiertas y el ensayo aún está pendiente.");
  assert.equal(latest()?.data.status, "pending");
  const third = await turn("Antes de elegir nada más: explícame qué consecuencias tiene recuperar contenido después de cambiar el calendario. No estoy confirmando ni eligiendo una política nueva.");
  assert.equal(latest()?.data.status, "pending");
  assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
  writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, kind: "controlled-prompt-comparison", skillPath, model: `${settings.defaultProvider}/${settings.defaultModel}`, turnMetrics, first, second, third, decisions: latest()?.data.decisions, checks: ["partial answer leaves intent open", "pending evidence does not become agreement", "explanation does not confirm", "no SDD writes"], limitations: "Supplied facts; no real scout or engine experiment. Interview quality requires reviewing the actual questions; timing is not end-to-end production latency." }, null, 2));
  console.log(`PASS block05 ${output}`);
 } else if (block04) {
  const first = await turn("Nos toca el bloque 04 creo de los cambios. Vamos a hacer el intent. Solo quiero acordarlo, no implementar.");
  if (!questionnairePilot) assert.match(first, /[?¿]/);
  let state = [...parentSession.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery");
  assert(state?.type === "custom");
  const initial = state.data as any;
  assert.equal(initial.status, "pending"); assert.equal(initial.stage, "round");
  assert(initial.decisions?.length >= 2, "An interview must expose distinct product decisions");
  assert(initial.decisions.some((d: any) => d.status === "open" && d.dependsOn.length > 0), "Entry/header choices depend on unresolved identity/context decisions");
  assert(initial.questions.length >= 2, "Do not replace the ready frontier with a blanket scope approval");
  if (questionnairePilot) {
   const askIndex = (events as any[]).findIndex((e) => e.type === "tool_execution_start" && e.toolName === "ask_user_question");
   assert((events as any[]).slice(0, askIndex).some((e) => e.type === "message_end" && e.message?.role === "assistant" && e.message.content?.some((part: any) => part.type === "text" && part.text.length > 100 && /[?¿]/.test(part.text))), "Explain the decisions in prose before the native selector");
   assert.equal(nativeQuestionnaireCalls, 1, "Use the native selector and respect its cancellation");
   assert.equal(nativeQuestionnaireResults[0]?.details?.cancelled, true);
   assert(!nativeQuestionnaireResults[0]?.details?.error && !nativeQuestionnaireResults[0]?.isError, "Cancellation must come from the native UI, not a plugin error");
   assert(initial.questionnaire?.length >= 2, "Author concrete alternatives for the frontier");
   assert(initial.questionnaire.every((q: any) => q.options.length >= 2 && q.options.length <= 4));
   assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
   writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, model: `${settings.defaultProvider}/${settings.defaultModel}`, checks: ["model supplies concrete alternatives", "real native questionnaire called", "cancellation keeps intent pending", "no SDD/code writes"], first }, null, 2));
   console.log(`PASS questionnaire ${output}`);
   process.exitCode = 0;
  } else {
  const second = await turn("Una misma persona puede enseñar y gestionar centros con la misma cuenta. Puede colaborar con varios centros. Eso sí lo tengo claro; las otras decisiones todavía no las he tomado.");
  assert.match(second, /[?¿]/);
  state = [...parentSession.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery");
  assert(state?.type === "custom" && (state.data as any).status === "pending");
  const next = (state.data as any).decisions;
  assert(initial.decisions.every((d: any) => next.some((n: any) => n.id === d.id)), "Earlier branches survive the partial answer");
  assert(next.filter((d: any) => d.status === "resolved").length > initial.decisions.filter((d: any) => d.status === "resolved").length, "The answer resolves decisions, not just prose");
  assert(next.some((d: any) => d.status === "open" && d.dependsOn.length), "Dependent decisions remain pending");
  assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
  await turn("Antes de responder: explícame qué diferencia hay entre recordar el contexto y recordar un papel. No estoy eligiendo ni confirmando.");
  assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
  writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, model: `${settings.defaultProvider}/${settings.defaultModel}`, checks: ["natural-language intent starts a product interview", "several concrete decisions", "partial answer opens dependent questions", "explanation is not confirmation", "intent-only creates no SDD or code"], first, second }, null, 2));
  console.log(`PASS block04 ${output}`);
  }
 } else if (conversationOnly) {
  const hasState = () => parentSession.getBranch().some((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery");
  const received = (text: string) => session.messages.some((message) => message.role === "user" && (typeof message.content === "string" ? message.content === text : message.content.some((part) => part.type === "text" && part.text === text)));
  for (const text of ["Hola, ¿podemos hablar un momento?", "Estoy pensando en cambiar la exportación CSV, pero todavía no quiero empezar ningún cambio. Ayúdame a pensar qué conviene tener en cuenta."]) {
   const answer = await turn(text);
   assert(received(text), "The ordinary user message must reach the model verbatim");
   assert(answer.trim(), "The orchestrator must answer the conversation");
   assert.equal(hasState(), false, "Conversation must not automatically propose intent");
   assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
  }
  await turn("Ahora sí: quiero desarrollar exportación CSV para la tabla de contactos. Empecemos acordando el alcance; usa SDD en modo auto.");
  assert.equal(hasState(), true, "The orchestrator should initiate intent once actual work is requested");
  const explanation = "Antes de elegir, explícame la diferencia entre exportar las filas filtradas y exportarlas todas. Esto es una pregunta, todavía no estoy eligiendo ni confirmando.";
  const answer = await turn(explanation);
  assert(received(explanation), "A pending intent must not consume further conversation");
  assert.match(answer, /filtrad|filter/i); assert.match(answer, /todas|todos|all/i);
  const latest = [...parentSession.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === "ein:intent-discovery");
  assert(latest?.type === "custom" && (latest.data as { status: string }).status === "pending");
  assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
  writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, model: `${settings.defaultProvider}/${settings.defaultModel}`, regression: "PR #365", checks: ["greeting reaches parent", "exploratory conversation creates no intent", "parent starts intent for actual work", "conversation while intent is pending remains available", "explanation is not confirmation"] }, null, 2));
  console.log(`PASS conversation ${output}`);
 } else {
 const first = await turn("Quiero añadir exportación CSV a la tabla de contactos, la única del prototipo. Usa SDD en modo auto.");
 assert.match(first, /[?¿]/); assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
 const second = await turn("Todas las filas filtradas (no solo la página) y en el orden visible. Columnas: nombre y correo. Sin exportar datos ocultos. CSV genérico con comas y UTF-8, no específico de Excel. Usa convenciones CSV estándar para escapar valores. Con eso puedes elaborar las specs.");
 await turn("Sí, el acuerdo final recoge exactamente lo que quiero. Puedes elaborar las specs, sin implementar código.");
 const agreement = readAgreement(join(cwd, "openspec/changes/export-csv"));
 assert.equal(agreement.kind, "valid"); if (agreement.kind !== "valid") throw new Error("Missing agreement");
 assert.equal(agreement.agreement.status, "confirmed"); assert.equal(writes, 1);
 const design = readFileSync(join(cwd, "openspec/changes/export-csv/design.md"), "utf8");
 assert(artifactHasIntentKey(design, agreement.agreement.materialKey));
 assert.match(design, /filter|filtrad/i); assert.match(design, /order|orden/i); assert.match(design, /hidden|ocult/i);
 const third = await turn("Cambio de idea: también quiero permitir exportar todas las filas, pero no tengo claro cómo debería elegirse.");
 assert.match(third, /[?¿]/); assert.equal(writes, 1);
 const pending = readAgreement(join(cwd, "openspec/changes/export-csv"));
 assert.equal(pending.kind === "valid" && pending.agreement.status, "pending");
 await turn("Cancela este cambio de alcance; no implementes nada más.");
 assert.equal(writes, 1);
 const cancelled = readAgreement(join(cwd, "openspec/changes/export-csv"));
 assert.equal(cancelled.kind === "valid" && cancelled.agreement.status, "cancelled");
 writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, model: `${settings.defaultProvider}/${settings.defaultModel}`, checks: ["auto asks before state", "real answer closes intent", "real model writes aligned specs", "scope change reopens discovery", "cancellation stops"], specification: design, second }, null, 2));
 console.log(`PASS ${output}`);
 }
} finally { session.dispose(); }
