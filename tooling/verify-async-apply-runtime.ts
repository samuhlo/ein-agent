import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { createAgentSession, DefaultResourceLoader, initTheme, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

// Piloto opt-in: usa el modelo ya configurado para apply y credenciales locales; solo modifica una fixture.
const packageRoot = resolve(process.argv[2] ?? "");
const payload = resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) throw new Error("Usage: bun tooling/verify-async-apply-runtime.ts <pi-subagents> <extracted template>");
const installed = join(homedir(), ".pi-ein/agent");
const scratch = mkdtempSync(join(tmpdir(), "ein-async-apply-"));
const home = join(scratch, "agent"); const project = join(scratch, "project");
mkdirSync(join(home, "agents"), { recursive: true }); mkdirSync(project);
const definition = readFileSync(join(installed, "agents/sdd-apply.md"), "utf8");
const modelName = /^model: (.+)$/m.exec(definition)![1]!;
const thinking = /^thinking: (.+)$/m.exec(definition)![1]!;
const providers = /^subagentOnlyExtensions: (.+)$/m.exec(definition)![1]!.split(",").map((p) => resolve(payload, "agents", p.trim()));
let agent = definition.replace(/^subagentOnlyExtensions: .+$/m, `subagentOnlyExtensions: ${providers.join(", ")}`);
agent = agent.replace(/^---\n/, `---\nextensions: ${providers.join(", ")}\n`);
writeFileSync(join(home, "agents/sdd-apply.md"), agent);
for (const [source, target] of [["auth.json", "auth.json"], ["models.json", "models.json"], ["models-store.json", "catalog.json"]]) {
  if (existsSync(join(installed, source!))) copyFileSync(join(installed, source!), join(home, target!));
}
process.on("exit", () => { rmSync(join(home, "auth.json"), { force: true }); });
process.env.PI_CODING_AGENT_DIR = home;
process.env.EIN_PI_AGENT_HOME = home;
const [provider, ...modelParts] = modelName.split("/");
const modelId = modelParts.join("/");
writeFileSync(join(home, "settings.json"), JSON.stringify({ defaultProvider: provider, defaultModel: modelId, defaultThinkingLevel: thinking, subagents: { disableBuiltins: true }, packages: [], retry: { enabled: false } }));
writeFileSync(join(project, "value.ts"), "export const value = 1;\n");
writeFileSync(join(project, "value.test.ts"), 'import {expect,test} from "bun:test"; import {value} from "./value"; test("value is corrected",()=>expect(value).toBe(2));\n');
const dir = join(project, "openspec/changes/progress-probe"); mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "tasks.md"), "status: ready\nblocked_by: none\n## One group\n- [ ] 1.1 Correct value to 2\n  - edit: `value.ts` | modify | change the exported value to 2\n  - verify: bun test value.test.ts\n");
writeFileSync(join(dir, "design.md"), "# Design\nSet exported value to 2. Preserve the test. No other product changes.\n");
writeFileSync(join(dir, "preflight.json"), '{"version":1,"tdd":"off","lane":"micro","decidedBy":"pi"}');
for (const args of [["init", "-q"], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-qm", "fixture"]]) {
  assert.equal(Bun.spawnSync(["git", ...args], { cwd: project }).exitCode, 0);
}
initTheme("dark");
const runtime = await ModelRuntime.create({ authPath: join(home, "auth.json"), modelsPath: join(home, "models.json"), modelsStorePath: join(home, "catalog.json"), allowModelNetwork: !existsSync(join(home, "catalog.json")) });
const model = runtime.getModel(provider!, modelId); assert(model, "Configured apply model unavailable");
const settingsManager = SettingsManager.inMemory({ subagents: { disableBuiltins: true }, retry: { enabled: false } } as never);
const loader = new DefaultResourceLoader({ cwd: project, agentDir: home, settingsManager, noExtensions: true, noSkills: true, noContextFiles: true, noPromptTemplates: true, additionalExtensionPaths: [join(packageRoot, "index.ts")] });
await loader.reload(); assert.deepEqual(loader.getExtensions().errors, []);
const {session} = await createAgentSession({ cwd: project, agentDir: home, modelRuntime: runtime, model, settingsManager, resourceLoader: loader, sessionManager: SessionManager.create(project, join(home, "sessions")), tools: ["subagent", "read", "grep", "find", "write", "edit", "bash", "ls"] });
await session.bindExtensions({mode:"print"});
const tool = session.agent.state.tools.find(t=>t.name==="subagent"); assert(tool);
console.log(`Async pilot: ${scratch}; configured model: ${modelName}:${thinking}`);
try {
 const launched = await tool.execute("launch", {agent:"sdd-apply", async:true, timeoutMs:180000, agentScope:"user", acceptance:{level:"none",reason:"SDD verification remains separate; this pilot independently runs the fixture test"}, task:"Apply ONLY task 1.1 in openspec/changes/progress-probe/tasks.md. Work already authorized, TDD off, skills none (plain Bun fixture). Use ein_sdd_task_progress to start, edit value.ts from 1 to 2, run bun test value.test.ts, then complete with the exact ID 1.1. Never edit tasks.md yourself. Write concise apply-progress.md evidence and finish. No commits, push, database or other changes."});
 writeFileSync(join(scratch,"launch.json"),JSON.stringify(launched,null,2));
 const info=launched.details as {asyncDir:string;runId:string};
 console.log(`Run: ${info.runId}`);
 let completed=false;
 const until=Date.now()+210000;
 while(Date.now()<until) {
  await new Promise(r=>setTimeout(r,2000));
  const statusPath=join(info.asyncDir,"status.json");
  const status=existsSync(statusPath)?JSON.parse(readFileSync(statusPath,"utf8")):{};
  if(status.state==="failed") throw new Error(status.error ?? "Async run failed");
  if(["completed","complete"].includes(status.state)) {
   assert(readFileSync(join(dir,"tasks.md"),"utf8").includes("- [x] 1.1"));
   assert(existsSync(join(dir,"apply-progress.md")));
   const transcript=readFileSync(join(home,"sessions/subagent-artifacts",`${info.runId}_sdd-apply_transcript.jsonl`),"utf8");
   const calls=transcript.split("\n").filter(Boolean).flatMap(line=>{const e=JSON.parse(line);return (e.message??e).content??[];}).filter(b=>b.type==="toolCall"&&b.name==="ein_sdd_task_progress");
   assert.deepEqual(calls.map(b=>b.arguments.action),["start","complete"]);
   completed=true;
   assert.equal(Bun.spawnSync([process.execPath,"test","value.test.ts"],{cwd:project}).exitCode,0);
   console.log("ASYNC_APPLY_PASS: real background child started/completed progress, corrected source and passed its test.");
   break;
  }
 }
 assert(completed,"Async child did not finish successfully; inspect pilot artifacts");
} finally {session.dispose();}
