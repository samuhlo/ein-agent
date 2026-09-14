import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";
import { registerAgentPromptHook } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { buildEinPrompt } from "../ein-pi/agent/lib/persona.ts";
import { readEvidenceTask } from "../ein-pi/agent/lib/intent-evidence.ts";

const installed = process.env.EIN_INTENT_PILOT_AGENT_HOME ?? join(homedir(), ".pi-ein/agent");
const output = mkdtempSync(join(tmpdir(), "ein-evidence-live-"));
const agentDir = join(output, "agent"), cwd = join(output, "project");
mkdirSync(agentDir, { mode: 0o700 }); mkdirSync(cwd);
process.on("exit", () => rmSync(agentDir, { recursive: true, force: true }));
for (const [source, target] of [["auth.json", "auth.json"], ["models.json", "models.json"], ["models-store.json", "catalog.json"]]) {
 if (existsSync(join(installed, source!))) copyFileSync(join(installed, source!), join(agentDir, target!));
}
const settings = JSON.parse(readFileSync(join(installed, "settings.json"), "utf8"));
const verifySource = readFileSync(join(installed, "agents/sdd-verify.md"), "utf8");
const verifyName = verifySource.match(/^model:\s*(.+)$/m)![1]!.trim();
const verifyThinking = verifySource.match(/^thinking:\s*(.+)$/m)![1]!.trim();
const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "catalog.json"), allowModelNetwork: false });
const parentModel = runtime.getModel(settings.defaultProvider, settings.defaultModel);
const slash = verifyName.indexOf("/");
const verifyModel = runtime.getModel(verifyName.slice(0, slash), verifyName.slice(slash + 1));
assert(parentModel && verifyModel, "Configured parent/verify models must be available");
const fixture = "const modules = [30,60,90]; console.log(JSON.stringify({fullHours: modules.reduce((a,b)=>a+b,0), partialHours: modules[0]+modules[2], selected: [0,2]}));\n";
writeFileSync(join(cwd, "engine.js"), fixture);
const plugin = await import(join(installed, "npm/node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts"));
const skill = readFileSync(new URL("../runtime/skills/local/intent-channel/SKILL.md", import.meta.url), "utf8");
const events: any[] = [], questionnaires: any[] = [], childEvents: any[] = [];
let children = 0;
const manager = SessionManager.inMemory(cwd);
const extension = (pi: ExtensionAPI) => {
 registerIntentDiscovery(pi, (spec) => pi.registerTool(spec));
 registerToolCallGate(pi, {} as never);
 let ask: any;
 plugin.registerAskUserQuestionTool({ events: pi.events, registerTool: (spec: any) => { ask = spec; } });
 pi.registerTool({ ...ask, execute: async (id: string, params: any, signal: any, update: any, ctx: any) => {
  questionnaires.push(params);
  // First question authorizes the local experiment; subsequent product/review
  // questions receive the first offered choice. This host never invents a receipt.
  return ask.execute(id, params, signal, update, { ...ctx, hasUI: true, mode: "rpc", ui: { select: async (_title: string, options: string[]) => options[0], input: async () => "" } });
 } });
 pi.registerTool({ name: "subagent", label: "Subagent", description: "Run the exact evidence delegation from ein_intent investigate with the configured sdd-verify executor.",
  parameters: { type: "object", required: ["agent", "task", "async", "context"], properties: { agent: { type: "string", enum: ["sdd-verify"] }, task: { type: "string" }, async: { type: "boolean" }, context: { type: "string" }, maxRuntimeMs: { type: "number" }, acceptance: { type: "object", properties: { level: { type: "string" }, reason: { type: "string" } } } } } as const,
  async execute(_id, args: any) {
   assert(readEvidenceTask(args.task));
   assert.equal(questionnaires.length, 1, "No repeated permission or technical-mode question before the authorized probe"); children++;
   const sm = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
   const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: sm, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true,
    systemPrompt: "You are the independent SDD verify executor.", extensionFactories: [(child) => registerAgentPromptHook(child)] });
   await loader.reload();
   const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: verifyModel, thinkingLevel: verifyThinking as any, settingsManager: sm, resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), tools: ["read", "grep", "find", "bash", "write", "edit"] });
   session.subscribe((event) => { if (["tool_execution_start", "tool_execution_end", "message_end"].includes(event.type)) childEvents.push(event); });
   const timer = setTimeout(() => void session.abort(), 120_000);
   try {
    await session.prompt(args.task);
    const last = [...session.messages].reverse().find((m) => m.role === "assistant") as any;
    assert(last?.stopReason !== "error", last?.errorMessage);
    const result = last?.content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
    assert(result?.trim());
    return { content: [{ type: "text", text: result }], details: { completed: true } };
   } finally { clearTimeout(timer); session.dispose(); }
  },
 });
};
const sm = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: sm, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, extensionFactories: [extension],
 systemPrompt: `${buildEinPrompt("neutral")}
${skill}\nFixture context: engine.js is the complete existing local engine probe, no imports, network or credentials. Run it with bun engine.js if a local experiment is authorized; it reports actual full/partial hours. No implementation is requested. First ask whether to run the local probe, then after its result ask which product calendar policy to adopt and finally review the agreement. Do not prescribe the product policy before obtaining evidence. This test exposes only intent, the real questionnaire and a bounded evidence executor.` });
await loader.reload();
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model: parentModel, thinkingLevel: settings.defaultThinkingLevel, settingsManager: sm, resourceLoader: loader, sessionManager: manager, tools: ["ein_intent", "ask_user_question", "subagent", "read"] });
await session.bindExtensions({ mode: "rpc", onError: (e) => { throw new Error(String(e)); } });
session.subscribe((event) => { if (["tool_execution_start", "tool_execution_end", "message_end"].includes(event.type)) events.push(event); if (event.type === "tool_execution_start") console.log(`Parent: ${event.toolName}`); writeFileSync(join(output, "events.json"), JSON.stringify({ events, childEvents })); });
console.log(`Evidence pilot: ${output}`);
const timer = setTimeout(() => void session.abort(), 600_000);
try {
 await session.prompt("Vamos con el intent del bloque 05: cursos parciales. Primero acordemos si hacemos el ensayo local del motor para obtener evidencia; después decidimos el calendario. Solo quiero acordarlo, sin implementar ni usar red o bases de datos.");
 const last = [...session.messages].reverse().find((m) => m.role === "assistant") as any;
 assert(last?.stopReason !== "error", last?.errorMessage);
 assert.equal(children, 1, "One authorized local experiment, no repeated execution");
 assert(questionnaires.length >= 3, "Probe authorization, subsequent product question and final review");
 const states = manager.getBranch().filter((e) => e.type === "custom" && e.customType === "ein:intent-discovery").map((e: any) => e.data);
 assert.equal(states.at(-1)?.status, "confirmed", "The same turn reaches final agreement after later questions");
 assert(childEvents.some((e) => e.type === "tool_execution_start" && e.toolName === "bash" && e.args.command === "bun engine.js"), "The real child must run the experiment");
 assert.equal(readFileSync(join(cwd, "engine.js"), "utf8"), fixture);
 assert(!existsSync(join(cwd, "openspec/changes", states.at(-1).work, "scope.md")));
 writeFileSync(join(output, "result.json"), JSON.stringify({ passed: true, parentModel: `${settings.defaultProvider}/${settings.defaultModel}`, verifyModel: verifyName, questionnaires, states, checks: ["observed selector authorization", "real configured child executes local probe", "dependent product question follows evidence", "final review in the same turn", "product unchanged, no SDD phase"] }, null, 2));
 console.log(`PASS ${output}`);
} finally {
 clearTimeout(timer); writeFileSync(join(output, "events.json"), JSON.stringify({ events, childEvents }, null, 2)); session.dispose();
}
