import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createAgentSession, DefaultResourceLoader, initTheme, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

// Piloto opt-in: usa el modelo ya configurado para apply y credenciales locales; solo modifica una fixture.
const packageRoot = resolve(process.argv[2] ?? "");
const payload = resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: bun tooling/verify-participant-runtime.ts <pi-subagents> <extracted template>");
const installed = join(homedir(), ".pi-ein/agent");
const scratch = mkdtempSync(join(tmpdir(), "ein-participant-live-"));
const home = join(scratch, "agent"); const project = join(scratch, "project");
mkdirSync(join(home, "agents"), { recursive: true }); mkdirSync(project);
const definition = readFileSync(join(installed, "agents/ein-cleaner.md"), "utf8");
const modelName = /^model: (.+)$/m.exec(definition)![1]!;
const thinking = /^thinking: (.+)$/m.exec(definition)![1]!;
const providers = /^subagentOnlyExtensions: (.+)$/m.exec(definition)![1]!.split(",").map((p) => resolve(payload, "agents", p.trim()));
let agent = definition.replace(/^subagentOnlyExtensions: .+$/m, `subagentOnlyExtensions: ${providers.join(", ")}`);
agent = agent.replace(/^---\n/, `---\nextensions: ${providers.join(", ")}\n`);
writeFileSync(join(home, "agents/ein-cleaner.md"), agent);
for (const [source, target] of [["auth.json", "auth.json"], ["models.json", "models.json"], ["models-store.json", "catalog.json"]]) {
  if (existsSync(join(installed, source!))) copyFileSync(join(installed, source!), join(home, target!));
}
process.on("exit", () => { rmSync(join(home, "auth.json"), { force: true }); });
process.env.PI_CODING_AGENT_DIR = home;
process.env.EIN_PI_AGENT_HOME = home;
const [provider, ...modelParts] = modelName.split("/");
const modelId = modelParts.join("/");
writeFileSync(join(home, "settings.json"), JSON.stringify({ defaultProvider: provider, defaultModel: modelId, defaultThinkingLevel: thinking, subagents: { disableBuiltins: true }, packages: [], retry: { enabled: false } }));
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";
import { registerDelegationResultHook } from "../ein-pi/agent/extensions/internal/ein-delegation-results.ts";
import { routeAgentControl } from "../ein-pi/agent/lib/agent-controls.ts";
import { planSddParticipants, readSddAdvisoryStatus } from "../ein-pi/agent/lib/sdd-participants.ts";
mkdirSync(join(project,"src")); const source="export const value = 1;\n"; writeFileSync(join(project,"src/value.ts"),source);
const dir=join(project,"openspec/changes/probe");mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"tasks.md"),"status: ready\n- [x] 1.1 Done\n");
writeFileSync(join(dir,"apply-progress.md"),"status: complete\n## Files changed\n`src/value.ts`\n");
for(const args of [["init","-q"],["-c","user.name=Fixture","-c","user.email=fixture@example.com","commit","--allow-empty","-qm","fixture"]]) assert.equal(Bun.spawnSync(["git",...args],{cwd:project}).exitCode,0);
initTheme("dark");
const runtime=await ModelRuntime.create({authPath:join(home,"auth.json"),modelsPath:join(home,"models.json"),modelsStorePath:join(home,"catalog.json"),allowModelNetwork:!existsSync(join(home,"catalog.json"))});
const model=runtime.getModel(provider!,modelId);assert(model);
const settingsManager=SettingsManager.inMemory({retry:{enabled:false}});
const loader=new DefaultResourceLoader({cwd:project,agentDir:home,settingsManager,noExtensions:true,noSkills:true,noContextFiles:true,noPromptTemplates:true,additionalExtensionPaths:[join(packageRoot,"index.ts")],extensionFactories:[pi=>{
 const scoutTracking=new Map();const results=registerDelegationResultHook(pi,scoutTracking);registerToolCallGate(pi,{scoutTracking,rememberPhaseRun:results.rememberPhaseRun});
}]});
await loader.reload();assert.deepEqual(loader.getExtensions().errors,[]);
const manager=SessionManager.create(project,join(home,"sessions"));
const {session}=await createAgentSession({cwd:project,agentDir:home,modelRuntime:runtime,model,settingsManager,resourceLoader:loader,sessionManager:manager,tools:["subagent","read","grep","find","write","edit","bash","ls"]});
await session.bindExtensions({mode:"print"});
const sessionKey=manager.getSessionFile()!;routeAgentControl(project,sessionKey,"cleaner","on");routeAgentControl(project,sessionKey,"architect","off");
const plan=planSddParticipants(project,sessionKey,"probe");assert.equal(plan.status,"ready");
console.log(`Participant pilot: ${scratch}; configured model: ${modelName}:${thinking}`);
try {
 const args={agent:"ein-cleaner",task:plan.next!.taskRef+"\n\nRead-only audit. No Improve or source changes. Return your actual findings and limitations.",async:true,timeoutMs:180000,acceptance:{level:"none",reason:"Advisory audit, not independent acceptance"}};
 const toolCall={type:"toolCall" as const,id:"participant-pilot",name:"subagent",arguments:args};
 const gate=await session.agent.beforeToolCall!({toolCall,args} as never);assert(!(gate as {block?:boolean})?.block,JSON.stringify(gate));
 assert.equal(args.async,false);assert(args.task.includes("Exact selectors:"));
 const tool=session.agent.state.tools.find(t=>t.name==="subagent");assert(tool);
 const result=await tool.execute(toolCall.id,args);
 writeFileSync(join(scratch,"result.json"),JSON.stringify(result,null,2));
 await session.agent.afterToolCall!({toolCall,args,result,isError:false} as never);
 const status=readSddAdvisoryStatus(project,sessionKey,"probe");assert.equal(status?.status,"complete",JSON.stringify(status));
 assert.equal(readFileSync(join(project,"src/value.ts"),"utf8"),source);
 console.log("PARTICIPANT_PASS: short reference expanded, native report registered, source unchanged; independent acceptance remains separate.");
} finally {session.dispose();}
