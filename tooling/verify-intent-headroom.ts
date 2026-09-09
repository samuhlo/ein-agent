import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";

const candidate = process.argv[2];
if (!candidate) throw new Error("Usage: bun tooling/verify-intent-headroom.ts <headroom worktree>");
const path = join(resolve(candidate), "ein-pi/agent/extensions/ein-headroom.ts");
const { createHeadroomExtension } = await import(pathToFileURL(path).href);
const material = { objective: "Preservar las decisiones", boundaries: { in: ["Intent y specs"] , out: ["Cambios de proveedor"] }, completionCriteria: ["La respuesta humana llega completa"] };
for (const order of ["intent-first", "headroom-first"]) {
 const cwd=mkdtempSync("/tmp/ein-intent-headroom-");
 const hooks = new Map<string, Function[]>(); const registered = new Map<string, any>(); const branch: any[]=[];
 const pi = { on: (name: string, fn: Function) => hooks.set(name,[...(hooks.get(name)??[]),fn]), registerTool: (tool: any) => registered.set(tool.name,tool), registerCommand: () => {}, getActiveTools: () => ["read","ein_intent","subagent"], appendEntry: (customType: string,data: unknown) => branch.push({type:"custom",customType,data}) };
 const ctx={cwd,hasUI:false,sessionManager:{getBranch:()=>branch,getSessionId:()=>order},signal:new AbortController().signal};
 const ours=()=>registerIntentDiscovery(pi as never, (tool)=>pi.registerTool(tool));
 const theirs=()=>createHeadroomExtension({mode:"on",endpoint:"http://127.0.0.1:8787",timeoutMs:50})(pi);
 if(order==="intent-first"){ours();theirs();} else {theirs();ours();}
 async function emit(name:string,event:any){for(const hook of hooks.get(name)??[]){const result=await hook(event,ctx);if(result?.block)return result;if(result?.content) event.content=result.content;}}
 async function call(args:any){const result=await registered.get("ein_intent").execute("test",{work:"agreement",...args},undefined,undefined,ctx);const original=JSON.stringify(result.content);await emit("tool_result",{toolName:"ein_intent",input:args,...result,isError:false});assert.equal(JSON.stringify(result.content),original);return result;}
 try {
  await call({action:"propose",material,questions:["¿Conservar todas las decisiones?"]});
  assert.equal((await emit("tool_call",{toolName:"subagent",input:{agent:"sdd-apply",task:"intent_work: agreement"}}))?.block,true);
  await emit("input",{source:"rpc",text:"Sí. Conserva el objetivo, los límites y todos los criterios."});
  const snapshot=JSON.parse((await call({action:"status"})).content[0].text);
  assert.equal(snapshot.response.text,"Sí. Conserva el objetivo, los límites y todos los criterios.");
  assert.equal((await call({action:"confirm",responseId:snapshot.response.id})).details.state,"confirmed");
  assert.equal(await emit("tool_call",{toolName:"subagent",input:{agent:"sdd-apply",task:"intent_work: agreement"}}),undefined);
  for(const toolName of ["ein_intent","read","subagent"]){const content=[{type:"text",text:JSON.stringify(Array.from({length:1000},(_,i)=>({decision:i,value:"preserve"})))}]; const event={toolName,input:{command:"data"},content,isError:false}; await emit("tool_result",event);assert.deepEqual(event.content,content);}
  console.log(`PASS ${order}: pending gate, exact reply, confirmation and protected outputs`);
 } finally {rmSync(cwd,{recursive:true,force:true});}
}
console.log(JSON.stringify({candidate:resolve(candidate),extensionSha256:createHash("sha256").update(readFileSync(path)).digest("hex"),librarySha256:createHash("sha256").update(readFileSync(join(resolve(candidate),"ein-pi/agent/lib/headroom.ts"))).digest("hex")}));
