import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { artifactHasIntentKey, readAgreement } from "../ein-pi/agent/lib/intent-agreement.ts";
import { buildEinPrompt } from "../ein-pi/agent/lib/persona.ts";

const root = resolve(import.meta.dir, "..");
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
const extension = (pi: ExtensionAPI) => {
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
const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: sm, extensionFactories: [extension], noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
 systemPrompt: `${buildEinPrompt("neutral")}\nThis controlled pilot exposes only intent and a design executor. Treat the request as SDD with work/change export-csv. After agreement, delegate exactly one sdd-design with change and intent_work markers, then report. Do not run other phases or read full workflow manuals; this pilot ends at the product specification.` });
await loader.reload();
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: settings.defaultThinkingLevel, settingsManager: sm, resourceLoader: loader, sessionManager: SessionManager.inMemory(cwd), tools: ["ein_intent", "subagent", "read"] });
await session.bindExtensions({ mode: "rpc", onError: (error) => { throw new Error(String(error)); } });
session.subscribe((event) => { if (["tool_execution_start", "tool_execution_end", "message_end"].includes(event.type)) events.push(event); });
async function turn(text: string) {
 const timer = setTimeout(() => void session.abort(), 180_000);
 try { await session.prompt(text); }
 finally { clearTimeout(timer); writeFileSync(join(output, "events.json"), JSON.stringify(events, null, 2)); }
 const last = [...session.messages].reverse().find((message) => message.role === "assistant");
 const answer = last && "content" in last ? (last.content as any[]).filter((part) => part.type === "text").map((part) => part.text).join("\n") : "";
 console.log(JSON.stringify({ turn: text, answer, writes }));
 return answer;
}
try {
 const first = await turn("Quiero añadir exportación CSV a la tabla de contactos, la única del prototipo. Usa SDD en modo auto.");
 assert.match(first, /[?¿]/); assert.equal(writes, 0); assert.equal(existsSync(join(cwd, "openspec")), false);
 const second = await turn("Todas las filas filtradas (no solo la página) y en el orden visible. Columnas: nombre y correo. Sin exportar datos ocultos. CSV genérico con comas y UTF-8, no específico de Excel. Usa convenciones CSV estándar para escapar valores. Con eso puedes elaborar las specs.");
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
} finally { session.dispose(); }
