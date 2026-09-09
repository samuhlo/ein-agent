import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { readAgreement } from "../ein-pi/agent/lib/intent-agreement.ts";
import { initializeSddChange } from "../ein-pi/agent/lib/sdd-preflight-record.ts";
import { writeSddSummary, writeVerifiedSddSummary } from "../shared/sdd/sdd-summary-write.ts";
import { createAssessCloseReadiness } from "../shared/sdd/sdd-close-readiness.ts";
import { artifactHasIntentKey } from "../shared/sdd/intent-agreement.ts";
import { resolveSddStatus } from "../ein-pi/agent/lib/sdd-router.ts";

const sandboxes: string[] = [];
afterEach(() => { for (const path of sandboxes.splice(0)) rmSync(path, { recursive: true, force: true }); });
const material = { objective: "Exportar resultados filtrados", boundaries: { in: ["CSV de resultados visibles"], out: ["Exportar toda la base"] }, completionCriteria: ["El CSV conserva el filtro activo"] };
function harness(cwd = mkdtempSync(join(tmpdir(), "ein-intent-")), branch: any[] = []) {
 sandboxes.push(cwd);
 const handlers = new Map<string, Function>();
 let spec: any;
 const pi = { on: (event: string, handler: Function) => handlers.set(event, handler), appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }) };
 registerIntentDiscovery(pi as never, ((tool: any) => { spec = tool; }) as never);
 const ctx = { cwd, sessionManager: { getBranch: () => branch } };
 const call = async (args: object) => spec.execute("call", { work: "export-csv", ...args }, undefined, undefined, ctx);
 const input = (text: string, source = "interactive") => handlers.get("input")!({ text, source }, ctx);
 const gate = (input: object, toolName = "subagent") => handlers.get("tool_call")!({ toolName, input }, ctx);
 const propose = (extra = {}) => call({ action: "propose", material, questions: ["Recomiendo exportar lo filtrado. ¿Eso o todos los registros?"], ...extra });
 const confirm = async (change?: string, text = "Los filtrados, adelante.") => {
  input(text);
  const status = JSON.parse((await call({ action: "status", change })).content[0].text);
  return call({ action: "confirm", change, responseId: status.response?.id });
 };
 return { cwd, branch, ctx, call, input, gate, propose, confirm, inputEvent: (event: object) => handlers.get("input")!(event,ctx), start: (event: object) => handlers.get("before_agent_start")!(event,ctx) };
}

describe("intent discovery through the registered Pi tool and hooks", () => {
 test("a complete request can be recorded with observed provenance, never a fake or extension response", async () => {
  const h = harness();
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  h.input("Export the filtered rows", "extension");
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  const request = "Export the filtered rows as CSV, preserve filter and do not export hidden columns. Implement it.";
  h.input(request, "rpc");
  expect((await h.call({ action: "record", material, change: "export-csv" })).details.state).toBe("confirmed");
  const stored = readAgreement(join(h.cwd, "openspec/changes/export-csv"));
  expect(stored.kind).toBe("valid");
  if (stored.kind !== "valid") return;
  expect(stored.agreement).toMatchObject({ fromRequest: true, questions: [], response: { text: request, source: "rpc" } });
  expect((await h.call({ action: "record", material: { ...material, objective: "Different work" }, change: "export-csv" })).isError).toBe(true);
 });
 test("record cannot bypass pending or cancelled discovery", async () => {
  const h = harness(); h.input("Build an export"); await h.propose();
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  await h.call({ action: "cancel" }); h.input("Some other text");
  expect((await h.call({ action: "record", material })).isError).toBe(true);
 });
 test("read-only input reaches the model unchanged and creates no project state", () => {
  const h = harness();
  expect(h.input("Explícame export.ts")).toEqual({ action: "continue" });
  expect(h.gate({ agent: "ein-scout", task: "Read export.ts" })).toBeUndefined();
  expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
  expect(h.branch).toHaveLength(0);
 });
 for (const count of [0, 1, 2]) {
  test(`PR #365: all input reaches the parent with ${count} existing changes, including while intent is pending`, async () => {
   const h=harness();
   for(let n=0;n<count;n++) mkdirSync(join(h.cwd,"openspec/changes",`existing-${n}`),{recursive:true});
   for(const [text,source] of [["hola","interactive"],["gracias","rpc"],["Arregla esto","interactive"],["Estoy pensando en cambiarlo, pero solo quiero hablar de alternativas","interactive"],["continuity-resume-brief/v1\ncontexto","extension"]]) {
    const event=Object.freeze({type:"input",text,source,streamingBehavior:"followUp",images:[]});
    const before=JSON.stringify(event);
    expect(h.inputEvent(event)).toEqual({action:"continue"});
    expect(JSON.stringify(event)).toBe(before);
    expect(h.branch).toHaveLength(0);
   }
   await h.propose();
   const event=Object.freeze({type:"input",source:"interactive",text:"Antes de responder, explícame las alternativas. No estoy confirmando."});
   const before=JSON.stringify(event);
   expect(h.inputEvent(event)).toEqual({action:"continue"});expect(JSON.stringify(event)).toBe(before);
   const state=JSON.parse((await h.call({action:"status"})).content[0].text);
   expect(state.agreement.status).toBe("pending");expect(state.response.text).toBe(event.text);
   expect(h.branch.filter(entry=>entry.customType==="ein:intent-discovery")).toHaveLength(1);
   expect(existsSync(join(h.cwd,"openspec/changes/export-csv"))).toBe(false);
  });
 }
 test("new small work and explicit SDD cannot launch without an agreement", () => {
  const h = harness();
  for (const agent of ["sdd-scope", "sdd-design", "sdd-apply"]) expect(h.gate({ agent, task: "Implement export" })).toMatchObject({ block: true });
  expect(h.gate({ change: "export-csv", create: true, tdd: "off", lane: "micro" }, "ein_sdd_preflight")).toMatchObject({ block: true });
 });
 test("one question stays pending; model confirmation and extension answers cannot satisfy it", async () => {
  const h = harness();
  const pending = await h.propose();
  expect(pending.details.state).toBe("pending");
  expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
  expect((await h.call({ action: "confirm", responseId: "invented" })).isError).toBe(true);
  h.input("Sí", "extension");
  expect((await h.call({ action: "confirm", responseId: "invented" })).isError).toBe(true);
  expect(h.gate({ agent: "sdd-apply", task: "intent_work: export-csv\nImplement" })).toMatchObject({ block: true });
 });
 test("auto cannot waive discovery; an explicit current human opt-out can", async () => {
  const h = harness(); h.input("Usa modo auto");
  expect((await h.call({ action: "delegate", material })).isError).toBe(true);
  h.input("Resuélvelo tú sin preguntas.", "extension");
  expect((await h.call({ action: "delegate", material })).isError).toBe(true);
  h.input("Resuélvelo tú sin preguntas.");
  expect((await h.call({ action: "delegate", material })).details.state).toBe("confirmed");
  expect(h.gate({ agent: "sdd-apply", task: "intent_work: export-csv" })).toBeUndefined();
  h.input("Otro cambio distinto");
  expect((await h.call({ action: "delegate", work: "otro", material })).isError).toBe(true);
 });
 test("mentioning or negating the opt-out is not an instruction to skip discovery", async () => {
  const h = harness();
  for (const text of ["No quiero que trabajes sin preguntas", "Explica qué significa sin preguntas", 'El fichero dice "sin preguntas"']) {
   h.input(text); expect((await h.call({ action: "delegate", material })).isError).toBe(true);
  }
 });
 test("retrying the same pending proposal preserves the observed answer", async () => {
  const h=harness();await h.propose();h.input("Lo filtrado");
  const before=JSON.parse((await h.call({action:"status"})).content[0].text);
  const after=JSON.parse((await h.propose()).content[0].text);
  expect(after.agreement.revision).toBe(before.agreement.revision);
  expect(after.response.id).toBe(before.response.id);
 });
 test("deleting intent.md cannot downgrade managed work to the legacy exception", async () => {
  const h=harness();await h.propose({change:"export-csv"});await h.confirm("export-csv");
  const dir=join(h.cwd,"openspec/changes/export-csv"); const record=readAgreement(dir);if(record.kind!=="valid")throw new Error("fixture");
  writeFileSync(join(dir,"scope.md"),`intent_key: ${record.agreement.materialKey}\nScope`);rmSync(join(dir,"intent.md"));
  expect(h.gate({agent:"sdd-design",task:"intent_work: export-csv"})).toMatchObject({block:true});
  expect(harness(h.cwd).gate({agent:"sdd-design",task:"change: export-csv"})).toMatchObject({block:true});
  expect(resolveSddStatus(h.cwd,"export-csv").intent?.state).toBe("invalid");
 });
 test("a new round retains earlier answers in the canonical agreement", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); h.input("Solo lo filtrado");
  await h.propose({ change: "export-csv", questions: ["¿Conservar el orden visible?"], material });
  await h.confirm("export-csv", "Sí, conserva el orden");
  const stored=readAgreement(join(h.cwd,"openspec/changes/export-csv"));
  expect(stored.kind === "valid" && stored.agreement.history?.[0]?.response.text).toBe("Solo lo filtrado");
 });
 test("a reply is bound to the active round and cannot settle two pending works", async () => {
  const h=harness(); await h.propose();
  await h.propose({work:"another-work"}); h.input("Sí");
  const other=JSON.parse((await h.call({action:"status",work:"another-work"})).content[0].text);
  expect((await h.call({action:"confirm",responseId:other.response.id})).isError).toBe(true);
  expect((await h.call({action:"confirm",work:"another-work",responseId:other.response.id})).details.state).toBe("confirmed");
 });
 test("a legacy intent is preserved until the user answers the adoption round", async () => {
  const h=harness(); const dir=join(h.cwd,"openspec/changes/export-csv"); mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,"intent.md"),"Legacy decisions: filtered rows only");
  await h.propose({change:"export-csv"});
  expect(readFileSync(join(dir,"intent.md"),"utf8")).toBe("Legacy decisions: filtered rows only");
  expect((await h.confirm("export-csv")).details.state).toBe("confirmed");
  expect(readAgreement(dir).kind).toBe("valid");
 });
 test("a real answer authorizes bounded ad-hoc work without OpenSpec files", async () => {
  const h = harness(); await h.propose();
  expect((await h.confirm()).details.state).toBe("confirmed");
  expect(h.gate({ agent: "sdd-apply", task: "intent_work: export-csv\nImplement export.ts" })).toBeUndefined();
  expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
 });
 test("RPC replies work and the full response survives in canonical intent", async () => {
  const h = harness(); await h.propose({ change: "export-csv" });
  h.input("Solo filtrados; conserva también el orden.", "rpc");
  const state = JSON.parse((await h.call({ action: "status", change: "export-csv" })).content[0].text);
  const updated = { ...material, completionCriteria: [...material.completionCriteria, "Conserva el orden visible"] };
  expect((await h.call({ action: "confirm", change: "export-csv", responseId: state.response.id, material: updated })).details.state).toBe("confirmed");
  const stored = readAgreement(join(h.cwd, "openspec/changes/export-csv"));
  expect(stored.kind).toBe("valid");
  if (stored.kind === "valid") expect(stored.agreement.response).toMatchObject({ text: "Solo filtrados; conserva también el orden.", source: "rpc" });
  expect(h.gate({ change: "export-csv", create: true }, "ein_sdd_preflight")).toBeUndefined();
  expect(initializeSddChange(h.cwd, "export-csv", "off", "standard", "pi").tdd).toBe("off");
 });
 test("a new product decision can reopen unchanged material without losing the original answer", async () => {
  const h=harness();await h.propose({change:"export-csv"});await h.confirm("export-csv");
  expect((await h.propose({change:"export-csv",reopenReason:"Map found a choice between visible and export-specific headings",questions:["¿Qué cabeceras usamos?"]})).details.state).toBe("pending");
  const stored=readAgreement(join(h.cwd,"openspec/changes/export-csv"));
  expect(stored.kind === "valid" && stored.agreement.history?.[0]?.response.text).toBe("Los filtrados, adelante.");
  expect(h.gate({agent:"sdd-design",task:"change: export-csv"})).toMatchObject({block:true});
 });
 test("a legacy .sdd root keeps intent and preflight in the same change directory", async () => {
  const h=harness();mkdirSync(join(h.cwd,".sdd/changes"),{recursive:true});
  await h.propose({change:"export-csv"});expect((await h.confirm("export-csv")).details.state).toBe("confirmed");
  expect(initializeSddChange(h.cwd,"export-csv","off","micro","pi").changeDir).toBe(realpathSync(join(h.cwd,".sdd/changes/export-csv")));
  expect(h.gate({agent:"sdd-scope",task:"change: export-csv"})).toBeUndefined();
  expect(h.start({agentName:"sdd-scope",task:"change: export-csv",systemPrompt:"phase"}).systemPrompt).toContain(".sdd/changes/export-csv/intent.md");
  expect(existsSync(join(h.cwd,"openspec/changes"))).toBe(false);
  expect(writeSddSummary({cwd:h.cwd,change:"export-csv",content:"Legacy-root summary"}).ok).toBe(true);
  expect(readFileSync(join(h.cwd,".sdd/changes/export-csv/summary.md"),"utf8")).toBe("Legacy-root summary");
 });
 test("same material is adopted after a fresh session without another question", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  const restored = harness(h.cwd);
  expect((await restored.propose({ change: "export-csv" })).details.state).toBe("confirmed");
  expect(restored.gate({ agent: "sdd-scope", task: "change: export-csv\nintent_work: export-csv" })).toBeUndefined();
 });
 test("pending round and observed answer survive reopening the same session", async () => {
  const h = harness(); await h.propose(); h.input("Lo filtrado");
  const restored = harness(h.cwd, structuredClone(h.branch));
  const status = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  expect(status.response.text).toBe("Lo filtrado");
  expect((await restored.call({ action: "confirm", responseId: status.response.id })).details.state).toBe("confirmed");
 });
 test("new material invalidates agreement across sessions and needs a new answer", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  await h.propose({ change: "export-csv", material: { ...material, objective: "Exportar todos los resultados" } });
  expect(h.gate({ agent: "sdd-scope", task: "change: export-csv" })).toMatchObject({ block: true });
  expect(harness(h.cwd).gate({ agent: "sdd-design", task: "change: export-csv" })).toMatchObject({ block: true });
  expect(resolveSddStatus(h.cwd, "export-csv").blocked.join(" ")).toContain("Intent pendiente");
  expect((await h.call({ action: "confirm", change: "export-csv", responseId: "old" })).isError).toBe(true);
 });
 test("cancellation never permits execution or creates a new change", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); h.input("Cancela");
  expect((await h.call({ action: "cancel", change: "export-csv" })).details.state).toBe("cancelled");
  expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
  expect(h.gate({ agent: "sdd-scope", task: "change: export-csv" })).toMatchObject({ block: true });
 });
 test("another work cannot reuse this answer or its material", async () => {
  const h = harness(); await h.propose(); await h.confirm();
  expect(h.gate({ agent: "sdd-apply", task: "intent_work: other-work\nImplement" })).toMatchObject({ block: true });
  expect((await h.propose({ change: "other-work" })).isError).toBe(true);
 });
 test("all supported delegation containers enforce intent before running", () => {
  const h = harness();
  for (const input of [{ chain: [{ agent: "sdd-scope", task: "change: new-work" }] }, { tasks: [{ agent: "sdd-apply", task: "Implement" }] }, { workflowScript: 'await runs.run("scope", {agent:"sdd-scope", task:"change: new-work"})' }]) expect(h.gate(input)).toMatchObject({ block: true });
  expect(h.gate({ action: "status", id: "existing" })).toBeUndefined();
 });
 test("a historical scoped change remains resumable without inventing approval", () => {
  const h = harness(); const dir = join(h.cwd, "openspec/changes/legacy"); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "scope.md"), "Existing scope");
  expect(h.gate({ agent: "sdd-design", task: "change: legacy" })).toBeUndefined();
  expect(h.gate({ agent: "sdd-scope", task: "change: legacy" })).toMatchObject({ block: true });
 });
 test("a Windows CRLF checkout preserves the same canonical agreement", async () => {
  const h=harness();await h.propose({change:"export-csv"});await h.confirm("export-csv");
  const dir=join(h.cwd,"openspec/changes/export-csv"),path=join(dir,"intent.md");
  const before=readAgreement(dir);writeFileSync(path,readFileSync(path,"utf8").replaceAll("\n","\r\n"));
  expect(readAgreement(dir)).toEqual(before);
 });
 test("modified prose invalidates its machine record and blocks execution", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  const path = join(h.cwd, "openspec/changes/export-csv/intent.md");
  writeFileSync(path, readFileSync(path, "utf8").replace("Exportar resultados filtrados", "Exportar secretos"));
  expect(readAgreement(join(h.cwd, "openspec/changes/export-csv")).kind).toBe("invalid");
  expect(h.gate({ agent: "sdd-scope", task: "change: export-csv" })).toMatchObject({ block: true });
 });
 test("design without the current agreement cannot reach apply", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  const dir = join(h.cwd, "openspec/changes/export-csv"); writeFileSync(join(dir, "design.md"), "Old design");
  expect(h.gate({ agent: "sdd-apply", task: "change: export-csv" })).toMatchObject({ block: true });
  const stored = readAgreement(dir); if (stored.kind !== "valid") throw new Error("invalid fixture");
  writeFileSync(join(dir, "design.md"), `intent_key: ${stored.agreement.materialKey}\nExport filtered rows`);
  expect(h.gate({ agent: "sdd-apply", task: "change: export-csv" })).toBeUndefined();
 });
 test("omitting change cannot bypass the persisted agreement or design binding", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  expect(h.gate({ agent: "sdd-apply", task: "intent_work: export-csv" })).toMatchObject({ block: true });
  const second = harness(h.cwd);
  await second.propose({ change: "export-csv", material: { ...material, objective: "Otra conducta" } });
  expect(h.gate({ agent: "sdd-design", task: "intent_work: export-csv" })).toMatchObject({ block: true });
 });
 test("router returns the first artifact from the previous agreement", async () => {
  const h = harness(); await h.propose({ change: "export-csv" }); await h.confirm("export-csv");
  const dir = join(h.cwd, "openspec/changes/export-csv");
  const initial = readAgreement(dir); if(initial.kind !== "valid") throw new Error("fixture");
  for (const name of ["scope.md", "map.md", "design.md"]) writeFileSync(join(dir,name), `intent_key: ${initial.agreement.materialKey}\nExisting ${name}\n`);
  await h.propose({ change: "export-csv", material: { ...material, objective: "Exportar con orden nuevo" } }); await h.confirm("export-csv");
  expect(resolveSddStatus(h.cwd,"export-csv").nextRecommended).toBe("scope");
  const updated=readAgreement(dir); if(updated.kind !== "valid") throw new Error("fixture");
  writeFileSync(join(dir,"scope.md"),`intent_key: ${updated.agreement.materialKey}\nUpdated scope\n`);
  expect(resolveSddStatus(h.cwd,"export-csv").nextRecommended).toBe("map");
 });
 test("Markdown presentation of the key is accepted, duplicate or old keys are not", () => {
  const key="sha256:"+"a".repeat(64);
  expect(artifactHasIntentKey(`- intent_key: \`${key}\``,key)).toBe(true);
  expect(artifactHasIntentKey(`intent_key: ${key}\nintent_key: ${key}`,key)).toBe(false);
  expect(artifactHasIntentKey(`intent_key: ${key}extra`,key)).toBe(false);
 });
 test("the deterministic summary keeps the same agreement through close", async () => {
  const h=harness(); await h.propose({change:"export-csv"}); await h.confirm("export-csv");
  const dir=join(h.cwd,"openspec/changes/export-csv");const agreement=readAgreement(dir);if(agreement.kind!=="valid")throw new Error("fixture");
  const marker=`intent_key: ${agreement.agreement.materialKey}\n`;
  for(const [file,content] of Object.entries({"scope.md":"## Spec delta declaration\nspec_delta: none\nspec_delta_reason: Test only\n", "map.md":"scope_status: valid\n", "design.md":"Filtered rows only\n", "tasks.md":"## Group\n- [x] Task done\n", "apply-progress.md":"status: complete\n", "verify-report.md":"status: pass\nExecuted: bun test\n"})) writeFileSync(join(dir,file),marker+content);
  const result=writeVerifiedSddSummary({cwd:h.cwd,change:"export-csv",content:"## Resultado\nObjetivo verificado.",commands:["bun test"]});
  expect(result.ok).toBe(true);
  expect(artifactHasIntentKey(readFileSync(join(dir,"summary.md"),"utf8"),agreement.agreement.materialKey)).toBe(true);
  expect(resolveSddStatus(h.cwd,"export-csv").intent).toEqual({state:"confirmed",materialKey:agreement.agreement.materialKey});
  expect(createAssessCloseReadiness({resolveSddStatus})(h.cwd,"export-csv").blockers.map(b=>b.code)).not.toContain("intent-stale");
 });
 test("close readiness cannot archive pending or stale intent", async () => {
  const h=harness(); await h.propose({change:"export-csv"}); await h.confirm("export-csv");
  const dir=join(h.cwd,"openspec/changes/export-csv"); writeFileSync(join(dir,"scope.md"),"Old scope");
  const assess=createAssessCloseReadiness({resolveSddStatus});
  expect(assess(h.cwd,"export-csv").blockers.map(b=>b.code)).toContain("intent-stale");
  await h.propose({change:"export-csv",material:{...material,objective:"Otra conducta"}});
  expect(assess(h.cwd,"export-csv").blockers.map(b=>b.code)).toContain("intent-unresolved");
 });
 test("symlinked change roots cannot write outside the project", async () => {
  const h = harness(); const outside = mkdtempSync(join(tmpdir(), "ein-intent-outside-")); sandboxes.push(outside);
  symlinkSync(outside, join(h.cwd, "openspec"));
  expect((await h.propose({ change: "export-csv" })).isError).toBe(true);
  expect(existsSync(join(outside, "changes"))).toBe(false);
 });
});
