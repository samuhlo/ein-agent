import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createAgentSession, DefaultResourceLoader, initTheme, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

// Piloto opt-in: usa el modelo ya configurado para verify y credenciales locales; solo modifica una fixture.
const packageRoot = resolve(process.argv[2] ?? "");
const payload = resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: bun tooling/verify-acceptance-runtime.ts <pi-subagents> <extracted template>");
const installed = join(homedir(), ".pi-ein/agent");
const scratch = mkdtempSync(join(tmpdir(), "ein-acceptance-live-"));
const home = join(scratch, "agent"); const project = join(scratch, "project");
mkdirSync(join(home, "agents"), { recursive: true }); mkdirSync(project);
const installedDefinition = readFileSync(join(installed, "agents/sdd-verify.md"), "utf8");
const definition = readFileSync(join(payload, "agents/sdd-verify.md"), "utf8");
const modelName = /^model: (.+)$/m.exec(installedDefinition)![1]!;
const thinking = /^thinking: (.+)$/m.exec(installedDefinition)![1]!;
const providers = /^subagentOnlyExtensions: (.+)$/m.exec(definition)![1]!.split(",").map((p) => resolve(payload, "agents", p.trim()));
let agent = definition.replace(/^subagentOnlyExtensions: .+$/m, `subagentOnlyExtensions: ${providers.join(", ")}`);
agent = agent.replace(/^---\n/, `---\nmodel: ${modelName}\nthinking: ${thinking}\nextensions: ${providers.join(", ")}\n`);
writeFileSync(join(home, "agents/sdd-verify.md"), agent);
for (const [source, target] of [["auth.json", "auth.json"], ["models.json", "models.json"], ["models-store.json", "catalog.json"]]) {
  if (existsSync(join(installed, source!))) copyFileSync(join(installed, source!), join(home, target!));
}
process.on("exit", () => { rmSync(join(home, "auth.json"), { force: true }); });
process.env.PI_CODING_AGENT_DIR = home;
process.env.EIN_PI_AGENT_HOME = home;
const [provider, ...modelParts] = modelName.split("/");
const modelId = modelParts.join("/");
writeFileSync(join(home, "settings.json"), JSON.stringify({ defaultProvider: provider, defaultModel: modelId, defaultThinkingLevel: thinking, subagents: { disableBuiltins: true }, packages: [], retry: { enabled: false } }));
import { readSddCompletionEvidence } from "../shared/sdd/sdd-routing-core.ts";
writeFileSync(join(project,"math.ts"),"export function add(a: number, b: number) { return a + b; }\n");
const positive='import {test,expect} from "bun:test"; import {add} from "./math"; test("R1 positive addition",()=>expect(add(2,3)).toBe(5));\n';
writeFileSync(join(project,"math.test.ts"),positive);
writeFileSync(join(project,"package.json"),'{"type":"module","scripts":{"test":"bun test"}}');
const dir=join(project,"openspec/changes/acceptance-probe");mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"design.md"),"# Design\nR1: add positive integers correctly; an executable positive test is mandatory.\nR2: add negative integers correctly; an executable negative test is mandatory.\nOnly these two behaviors are in scope. No decimals, overflow, types/build checks or external systems are required. Run bun test math.test.ts.\n");
writeFileSync(join(dir,"tasks.md"),"status: ready\n## Addition\n- [x] 1.1 R1 positive addition\n  - behavior: R1 positive addition\n  - verify: bun test math.test.ts\n- [x] 1.2 R2 negative addition\n  - behavior: R2 negative addition\n  - verify: bun test math.test.ts\n");
writeFileSync(join(dir,"apply-progress.md"),"status: complete\n## Files changed\n`math.ts`\n`math.test.ts`\n## Behavior seam | Final focused command\n| R1 positive addition | bun test math.test.ts |\n| R2 negative addition | bun test math.test.ts |\n");
writeFileSync(join(dir,"preflight.json"),'{"version":1,"tdd":"off","decidedBy":"pi"}');
for(const args of [["init","-q"],["-c","user.name=Fixture","-c","user.email=fixture@example.com","commit","--allow-empty","-qm","fixture"]]) assert.equal(Bun.spawnSync(["git",...args],{cwd:project}).exitCode,0);
initTheme("dark");
const runtime=await ModelRuntime.create({authPath:join(home,"auth.json"),modelsPath:join(home,"models.json"),modelsStorePath:join(home,"catalog.json"),allowModelNetwork:!existsSync(join(home,"catalog.json"))});
const model=runtime.getModel(provider!,modelId);assert(model);
const settingsManager=SettingsManager.inMemory({retry:{enabled:false}});
const loader=new DefaultResourceLoader({cwd:project,agentDir:home,settingsManager,noExtensions:true,noSkills:true,noContextFiles:true,noPromptTemplates:true,additionalExtensionPaths:[join(packageRoot,"index.ts")]});
await loader.reload();assert.deepEqual(loader.getExtensions().errors,[]);
const {session}=await createAgentSession({cwd:project,agentDir:home,modelRuntime:runtime,model,settingsManager,resourceLoader:loader,sessionManager:SessionManager.create(project,join(home,"sessions")),tools:["subagent","read","grep","find","write","edit","bash","ls"]});
await session.bindExtensions({mode:"print"});
console.log(`Acceptance pilot: ${scratch}; configured verifier: ${modelName}:${thinking}`);
try {
 const tool=session.agent.state.tools.find(t=>t.name==="subagent");assert(tool);
 const task="change: acceptance-probe\nIndependently verify the current code and tests against openspec/changes/acceptance-probe/design.md and tasks.md. This legacy fixture has no intent.md; the complete acceptance is in design.md. TDD off. Inspect actual assertions and run the required command. No source/test changes, new requirements, external operations or implementation. Write verify-report.md with your current verdict, coverage, exact evidence and any precise missing requirement. Skills none (plain Bun fixture).";
 const verify=async(id:string)=>{const before=["math.ts","math.test.ts"].map(name=>readFileSync(join(project,name),"utf8"));const result=await tool.execute(id,{agent:"sdd-verify",task,async:false,context:"fresh",timeoutMs:180000,acceptance:{level:"none",reason:"The verification report is the result being evaluated"}});writeFileSync(join(scratch,`${id}.json`),JSON.stringify(result,null,2));assert.deepEqual(["math.ts","math.test.ts"].map(name=>readFileSync(join(project,name),"utf8")),before);return readSddCompletionEvidence(project,"acceptance-probe").verify;};
 assert.equal(await verify("missing-case"),"fail");
 const first=readFileSync(join(dir,"verify-report.md"),"utf8");assert(/R2|negative|negativ/i.test(first));copyFileSync(join(dir,"verify-report.md"),join(scratch,"missing-case-report.md"));
 writeFileSync(join(project,"math.test.ts"),positive+'test("R2 negative addition",()=>expect(add(-2,-3)).toBe(-5));\n');
 assert.equal(await verify("covered-case"),"pass");
 copyFileSync(join(dir,"verify-report.md"),join(scratch,"covered-case-report.md"));
 console.log("ACCEPTANCE_PASS: green tests with a required case missing failed acceptance; the unchanged contract passed after that case was added.");
} finally {session.dispose();}
