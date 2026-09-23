import { expect, test } from "bun:test";
import { streamSimple } from "../../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js";
import * as piAi from "@earendil-works/pi-ai";
import type { Model } from "@earendil-works/pi-ai";

test("native provider stops an unanswered request and does not multiply HTTP retries", async () => {
 let requests=0;
 const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch(){requests++;return new Promise<Response>(()=>{});}});
 try {
  const model:Model<"openai-completions">={id:"fixture",name:"fixture",api:"openai-completions",provider:"openai",baseUrl:`http://127.0.0.1:${server.port}/v1`,reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000,maxTokens:10};
  const context={messages:[{role:"user" as const,content:"fixture",timestamp:Date.now()}]};
  // Pi 0.87 requires the branded transcript returned by its public normalizer.
  const transcript="normalizeContext" in piAi && typeof piAi.normalizeContext==="function" ? piAi.normalizeContext(context) : context;
  const result=await streamSimple(model,transcript as Parameters<typeof streamSimple>[1],{apiKey:"fixture-only",timeoutMs:500,maxRetries:0}).result();
  expect(result.stopReason).toBe("error");expect(result.errorMessage).toMatch(/timed? out|timeout/i);expect(requests).toBe(1);
 } finally {await server.stop(true);}
},5000);

test("the real agent retries a provider failure once rather than multiplying retry layers", async () => {
 const { ModelRuntime, SettingsManager, DefaultResourceLoader, SessionManager, createAgentSession } = await import("@earendil-works/pi-coding-agent");
 const { mkdtempSync,readFileSync,rmSync }=await import("node:fs");const {join}=await import("node:path");const {tmpdir}=await import("node:os");
 const home=mkdtempSync(join(tmpdir(),"ein-retry-native-"));let requests=0;
 const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch(){requests++;return Response.json({error:{message:"temporary server error",type:"server_error"}},{status:500});}});
 let session:Awaited<ReturnType<typeof createAgentSession>>["session"]|undefined;
 try {
  const template=JSON.parse(readFileSync(join(import.meta.dir,"../../ein-pi/agent/settings.json"),"utf8"));
  const runtime=await ModelRuntime.create({authPath:join(home,"auth.json"),modelsPath:null,modelsStorePath:join(home,"catalog.json"),refreshOnCreate:false,allowModelNetwork:false});
  runtime.registerProvider("fixture",{api:"openai-completions",baseUrl:`http://127.0.0.1:${server.port}/v1`,apiKey:"fixture-only",models:[{id:"fixture",name:"fixture",reasoning:false,input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000,maxTokens:10}]});
  const model=runtime.getModel("fixture","fixture");expect(model).toBeDefined();
  const settingsManager=SettingsManager.inMemory({...template,retry:{...template.retry,baseDelayMs:1},packages:[],extensions:[]});
  expect(settingsManager.getHttpIdleTimeoutMs()).toBe(120000);
  expect(settingsManager.getProviderRetrySettings().maxRetries).toBe(0);
  expect(settingsManager.getRetrySettings().maxRetries).toBe(1);
  const loader=new DefaultResourceLoader({cwd:home,agentDir:home,settingsManager,noExtensions:true,noSkills:true,noContextFiles:true,noPromptTemplates:true});await loader.reload();
  ({session}=await createAgentSession({cwd:home,agentDir:home,modelRuntime:runtime,model,settingsManager,resourceLoader:loader,sessionManager:SessionManager.inMemory(home),tools:[]}));
  await session.prompt("fixture");expect(requests).toBe(2);
 } finally {session?.dispose();await server.stop(true);rmSync(home,{recursive:true,force:true});}
},10000);
