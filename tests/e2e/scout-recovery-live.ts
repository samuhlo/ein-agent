import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDelegationResultHook } from "../../ein-pi/agent/extensions/internal/ein-delegation-results.ts";
import scoutChild from "../../ein-pi/agent/extensions/internal/ein-scout-child.ts";
import { normalizeScoutLaunch, validateScoutReport, type ScoutTracking } from "../../ein-pi/agent/lib/scout-contract.ts";
import { buildEinPrompt } from "../../ein-pi/agent/lib/persona.ts";

const root = resolve(import.meta.dir, "../..");
const installed = process.argv.find((arg) => arg.startsWith("--agent-home="))?.slice(13) ?? join(homedir(), ".pi-ein/agent");
const output = mkdtempSync("/tmp/ein-scout-recovery-");
const privateDir = join(output, "private");
const agentDir = join(privateDir, "agent");
const project = join(output, "project");
mkdirSync(privateDir, { mode: 0o700 });
mkdirSync(agentDir, { mode: 0o700 });
mkdirSync(project);
process.on("exit", () => rmSync(privateDir, { recursive: true, force: true }));
console.log(`Pilot artifacts: ${output}`);

const fixture = {
 "docs/plan.md": "# Bloque 07\nFiltrar anexos y exportación por los módulos del curso.\nEl bloque 05 permite cursos completos o parciales.\nEl bloque 06 muestra progreso por permisos.\nEl bloque 08 gestiona centros y queda fuera.\nNo hay autorización de implementación en este ensayo.\n",
 "server/course-scope.ts": "export function selectedModules(course) {\n  return course.mode === 'full'\n    ? course.certificateModules\n    : course.selectedModuleIds;\n}\nexport const scopeIsPerCourse = true;\n",
 "server/export.ts": "import { selectedModules } from './course-scope';\nimport { canAccessCourse } from './auth/course-access';\nexport function exportCourse(user, course) {\n  if (!canAccessCourse(user, course)) throw new Error('Forbidden');\n  return course.documents.filter(doc => selectedModules(course).includes(doc.moduleId));\n}\n",
 "server/auth/course-access.ts": "export function canAccessCourse(user, course) {\n  if (course.ownerId === user.id) return true;\n  return course.teachers.some(teacher =>\n    teacher.id === user.id && teacher.moduleIds.length > 0);\n}\n",
};
for (const [path, content] of Object.entries(fixture)) {
 mkdirSync(dirname(join(project, path)), { recursive: true });
 writeFileSync(join(project, path), content);
}
const helper = "server/auth/course-access.ts";
const firstPaths = ["docs/plan.md", "server/course-scope.ts", "server/export.ts"];
const installedScout = readFileSync(join(installed, "agents/ein-scout.md"), "utf8");
const scoutModelName = /^model:\s*(.+)$/m.exec(installedScout)?.[1]?.trim();
const scoutThinking = /^thinking:\s*(.+)$/m.exec(installedScout)?.[1]?.trim();
assert(scoutModelName && scoutThinking, "Installed scout must declare its model and thinking level");
const settings = JSON.parse(readFileSync(join(installed, "settings.json"), "utf8"));
copyFileSync(join(installed, "auth.json"), join(agentDir, "auth.json"));
for (const [from, to] of [["models.json", "models.json"], ["models-store.json", "catalog.json"]]) {
 if (existsSync(join(installed, from!))) copyFileSync(join(installed, from!), join(agentDir, to!));
}
const runtime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), modelsStorePath: join(agentDir, "catalog.json"), allowModelNetwork: !existsSync(join(agentDir, "catalog.json")) });
const separator = scoutModelName.indexOf("/");
const scoutModel = runtime.getModel(scoutModelName.slice(0, separator), scoutModelName.slice(separator + 1));
const parentModel = runtime.getModel(settings.defaultProvider, settings.defaultModel);
assert(scoutModel && parentModel, "Configured models must be available; no fallback");
const sanitized: Record<string, unknown>[] = [];
let interruptionApplied = false;
const scoutReads: string[] = [];
const parentReads: string[] = [];
const parentPolicyReads: string[] = [];
const reportPath = join(output, "result.json");
function progress(stage: string) {
 writeFileSync(join(output, "progress.json"), JSON.stringify({ stage, scoutModel: scoutModelName, scoutReads, parentReads, parentPolicyReads, transcript: sanitized }, null, 2).replaceAll(project, "<fixture>").replaceAll(root, "<repository>"));
 console.log(`Pilot stage: ${stage}`);
}
const visible = (content: any[]) => content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
function observe(session: any, actor: string) {
 return session.subscribe((event: any) => {
  if (event.type === "tool_execution_start") {
   sanitized.push({ actor, kind: "tool_call", tool: event.toolName, args: event.args });
   if (event.toolName === "read") {
    const path = resolve(project, event.args.path);
    if (actor !== "scout" && path === join(root, "runtime/assets/orchestrator.md")) parentPolicyReads.push("runtime/assets/orchestrator.md");
    else (actor === "scout" ? scoutReads : parentReads).push(relative(project, path));
   }
  }
  if (event.type === "message_end" && event.message.role === "assistant") {
   const text = visible(event.message.content);
   if (text) sanitized.push({ actor, kind: "answer", text });
  }
 });
}
async function prompt(session: any, text: string, allowAbort = false) {
 const timer = setTimeout(() => void session.abort(), 180_000);
 try { await session.prompt(text); } finally { clearTimeout(timer); }
 const last = [...session.messages].reverse().find((message: any) => message.role === "assistant");
 if (last?.stopReason === "error" && !(allowAbort && interruptionApplied)) throw new Error(last.errorMessage ?? "Provider failed");
 if (!allowAbort && last?.stopReason === "aborted") throw new Error("Pilot turn interrupted before completion");
}
const sm = () => SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
const scoutLoader = new DefaultResourceLoader({ cwd: project, agentDir, settingsManager: sm(), noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true,
 extensionFactories: [scoutChild], systemPrompt: readFileSync(join(root, "runtime/agents/ein-scout.md"), "utf8").replace(/^---[\s\S]*?\n---\n/, "") });
await scoutLoader.reload();
const { session: scout } = await createAgentSession({ cwd: project, agentDir, modelRuntime: runtime, model: scoutModel, thinkingLevel: scoutThinking as any, settingsManager: sm(), resourceLoader: scoutLoader, sessionManager: SessionManager.inMemory(project), tools: ["read", "grep", "find"] });
await scout.bindExtensions({ mode: "rpc", onError: (error) => { throw new Error(String(error)); } });
observe(scout, "scout");
let generated: any;
try {
 await prompt(scout, `RESEARCH PACKET: ¿Qué evidencia hay para el filtrado de exportación del bloque 07 y qué falta comprobar de autorización? Raíces permitidas: ${firstPaths.join(", ")}. Lee los tres archivos. El helper ${helper} está fuera de esta primera consulta; registra esa laguna sin inferir su comportamiento. Solo evidencia, sin implementar ni crear SDD. Límite: 6 lecturas, 6 turnos.`);
 const final = [...scout.messages].reverse().find((message: any) => message.role === "assistant") as any;
 generated = JSON.parse(visible(final.content));
 validateScoutReport([generated], project);
 assert(firstPaths.every((path) => scoutReads.includes(path)), "Scout must actually read all three evidence files");
 assert(!scoutReads.includes(helper), "The missing helper must remain uninspected");
} finally { progress("scout-finished"); scout.dispose(); }

// REGRESIÓN CONTROLADA -> La inyección asegura ejercitar recuperación sin atribuir el fallo al modelo.
const injected = structuredClone(generated);
const firstReference = injected.references[0];
delete firstReference.startLine;
delete firstReference.endLine;
delete firstReference.lineStart;
delete firstReference.lineEnd;
firstReference.lines = "1-2,4-5";
const gapId = "R999";
injected.references.push({ id: gapId, path: helper, lines: "900-901", supports: "Authorization helper behavior remains unverified" });
injected.findings.push({ claim: "Authorization helper has been verified", referenceIds: [gapId] });
injected.uncertainties.push(`Authorization helper ${helper} has not been inspected.`);
const tracking: ScoutTracking = new Map();
let launches = 0;
let savedResult: any;
const extension = (pi: ExtensionAPI) => {
 pi.on("tool_call", (event) => {
  if (event.toolName === "subagent") normalizeScoutLaunch(event.input, event.toolCallId, tracking, project);
 });
 registerDelegationResultHook(pi, tracking);
 pi.registerTool({ name: "subagent", label: "Scout", description: "Run the bounded read-only ein-scout investigation of block07.", parameters: { type: "object", properties: { agent: { type: "string", enum: ["ein-scout"] }, task: { type: "string" } }, required: ["agent", "task"] } as const,
  async execute(_id, args) {
   launches++;
   assert.equal(launches, 1, "A recorded scout result must not relaunch the investigation");
   return { content: [{ type: "text", text: "Controlled delivery of the actual model report with explicitly injected citation errors." }], details: { results: [{ agent: "ein-scout", task: args.task, finalOutput: JSON.stringify(injected) }] } };
  },
 });
};
const parentLoader = new DefaultResourceLoader({ cwd: project, agentDir, settingsManager: sm(), noExtensions: true, noSkills: true, noPromptTemplates: true, noContextFiles: true, extensionFactories: [extension],
 systemPrompt: `${buildEinPrompt("neutral")}\nControlled read-only investigation: supplied files are a local block07 prototype. The parent is authorized to inspect the entire fixture root ${project}, including server/auth/course-access.ts. The scout's initial three-file packet is deliberately narrower than the parent authorization. Only investigate and explain; no implementation or SDD is authorized. The subagent tool delivers a scout investigation; read is available for factual gaps.` });
await parentLoader.reload();
const sessionsDir = join(privateDir, "sessions");
mkdirSync(sessionsDir);
const manager = SessionManager.create(project, sessionsDir);
const parentOptions = { cwd: project, agentDir, modelRuntime: runtime, model: parentModel, thinkingLevel: settings.defaultThinkingLevel, settingsManager: sm(), resourceLoader: parentLoader, tools: ["subagent", "read"] };
const { session: parent } = await createAgentSession({ ...parentOptions, sessionManager: manager });
await parent.bindExtensions({ mode: "rpc", onError: (error) => { throw new Error(String(error)); } });
observe(parent, "parent-before-interruption");
parent.subscribe((event: any) => {
 if (event.type === "message_end" && event.message.role === "toolResult" && event.message.toolName === "subagent") {
  savedResult = structuredClone(event.message);
  sanitized.push({ actor: "production-hook", kind: "validated_result", content: savedResult.content, receipt: savedResult.details?.einScoutEvidence });
  interruptionApplied = true;
  progress("saved-result-interruption");
  void parent.abort();
 }
});
try {
 await prompt(parent, "Investiga el bloque 07 con ein-scout: plan, alcance del curso y endpoint de exportación. Explica qué está comprobado y resuelve la laguna de autorización si hace falta. No implementes.", true);
 assert(savedResult && !savedResult.isError, "Updated production hook must deliver usable partial evidence");
 assert(savedResult.details?.einScoutEvidence, "Validated evidence receipt must survive in the tool result");
 assert.equal(savedResult.details.einScoutEvidence.status, "partial");
 const accepted = JSON.parse(savedResult.content[0].text);
 assert(!accepted.findings.some((finding: any) => finding.claim === "Authorization helper has been verified"), "The injected unsupported claim must be dropped");
 for (const [startLine, endLine] of [[1, 2], [4, 5]]) assert(accepted.references.some((reference: any) => reference.path === firstReference.path && reference.startLine === startLine && reference.endLine === endLine), "Each discontinuous range must survive independently");
} finally { progress("parent-before-resume-finished"); parent.dispose(); }
const sessionFile = manager.getSessionFile();
assert(sessionFile && existsSync(sessionFile), "Tool result must be saved before interruption");
const restored = SessionManager.open(sessionFile, sessionsDir, project);
assert(restored.buildSessionContext().messages.some((message: any) => message.role === "toolResult" && message.toolName === "subagent"), "Resume must contain the actual saved result");
const { session: resumed } = await createAgentSession({ ...parentOptions, sessionManager: restored });
await resumed.bindExtensions({ mode: "rpc", onError: (error) => { throw new Error(String(error)); } });
observe(resumed, "parent-resumed");
try {
 await prompt(resumed, "Continúa desde donde se interrumpió y explícame el resultado de la investigación.");
 assert.equal(launches, 1);
 assert.deepEqual(parentReads, [helper], "Follow-up must inspect only the missing helper, not repeat accepted investigation");
 assert(!existsSync(join(project, "openspec")), "Read-only recovery must not start SDD");
 const actualPaths = readdirSync(project, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => relative(project, join(entry.parentPath, entry.name))).sort();
 assert.deepEqual(actualPaths, Object.keys(fixture).sort(), "No extra project files may be written");
 for (const [path, content] of Object.entries(fixture)) assert.equal(readFileSync(join(project, path), "utf8"), content);
 const result = { passed: true, scoutModel: scoutModelName, parentModel: `${settings.defaultProvider}/${settings.defaultModel}`, scoutReads, parentReads, launches, generatedReport: generated, injectedRegression: { multiRange: "1-2,4-5", unsupportedReference: { path: helper, lines: "900-901" }, unsupportedClaim: "Authorization helper has been verified" }, accepted: { content: savedResult.content, receipt: savedResult.details.einScoutEvidence }, transcript: sanitized, limitations: "Real configured scout and parent model with actual SDK reads and production result hook. Subagent dispatch is a controlled SDK tool delivering the earlier generated report with injected citation errors; this is not the live pi-subagents launcher. The interruption is a deliberate abort AFTER persisted tool_result, followed by SessionManager.open; it does not simulate or repair a provider WebSocket failure. Raw sessions and credentials are deleted; only visible messages, reports and tool calls remain." };
 writeFileSync(reportPath, JSON.stringify({ ...result, parentPolicyReads }, null, 2).replaceAll(project, "<fixture>").replaceAll(root, "<repository>"));
 console.log(`PASS scout recovery: ${reportPath}`);
} finally { progress("resume-finished"); resumed.dispose(); }
