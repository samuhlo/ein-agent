import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { registerAgentPromptHook } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";
import { readAgreement } from "../ein-pi/agent/lib/intent-agreement.ts";
import { runIntentDiscovery } from "../ein-pi/agent/lib/intent-discovery.ts";
import { readContinuityCheckpoint } from "../ein-pi/agent/lib/continuity-checkpoint-store.ts";
import { setContinuityObjective } from "../ein-pi/agent/lib/continuity-objective.ts";
import { initializeSddChange } from "../ein-pi/agent/lib/sdd-preflight-record.ts";
import { writeSddSummary, writeVerifiedSddSummary } from "../shared/sdd/sdd-summary-write.ts";
import { createAssessCloseReadiness } from "../shared/sdd/sdd-close-readiness.ts";
import { artifactHasIntentKey } from "../shared/sdd/intent-agreement.ts";
import { resolveSddStatus } from "../ein-pi/agent/lib/sdd-router.ts";
import { execFileSync } from "node:child_process";
import { beginVerification, finishVerification, readVerificationFreshness } from "../ein-pi/agent/lib/sdd-verification-runtime.ts";

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
 const propose = (extra = {}) => call({ action: "propose", material, decisions: [{ id: "rows", question: "Which rows?", dependsOn: [], status: "open" }], questions: ["Recomiendo exportar lo filtrado. ¿Eso o todos los registros?"], ...extra });
 const finish = async (extra: any = {}) => {
  const status = JSON.parse((await call({ action: "status", ...extra })).content[0].text);
  const review = await call({ action: "review", responseId: status.response?.id,
   decisions: [{ id: "rows", question: "Which rows?", dependsOn: [], status: "resolved", resolution: status.response?.text }], ...extra });
  if (review.isError) return review;
  input("Sí, ese acuerdo recoge lo que quiero.");
  const reviewed = JSON.parse((await call({ action: "status", ...extra })).content[0].text);
  return call({ action: "confirm", responseId: reviewed.response?.id, ...extra });
 };
 const confirm = async (change?: string, text = "Los filtrados, adelante.") => {
  input(text);
  return finish({ change });
 };
 return { handlers, cwd, branch, ctx, call, finish, input, gate, propose, confirm, inputEvent: (event: object) => handlers.get("input")!(event,ctx), start: (event: object) => handlers.get("before_agent_start")!(event,ctx) };
}

describe("intent answers through ask_user_question", () => {
 const questionnaire = [{ question: "¿Qué filas?", header: "Filas", options: [
  { label: "Filtradas (recomendado)", description: "Respeta la selección visible." },
  { label: "Todas", description: "Ignora el filtro actual." },
 ] }];
 function result(h: ReturnType<typeof harness>, id: string, questions: any[], details: any) {
  h.handlers.get("tool_call")!({ toolName: "ask_user_question", toolCallId: id, input: { questions } }, h.ctx);
  return h.handlers.get("tool_result")!({ toolName: "ask_user_question", toolCallId: id, input: { questions }, details, isError: false, content: [] }, h.ctx);
 }
 test("the selector receipt advances through review and confirmation without status calls", async () => {
  const h = harness(); await h.propose({ questionnaire });
  const received = result(h, "round", questionnaire, { cancelled: false, answers: [{ questionIndex: 0, question: questionnaire[0].question, kind: "option", answer: "Todas" }] });
  const receipt = JSON.parse(received.content.at(-1).text).intentResponse;
  expect(receipt).toMatchObject({ work: "export-csv", status: "received" });
  expect(receipt.responseId).toBe(h.branch.at(-1).data.id);
  expect(receipt.responseText).toBe(h.branch.at(-1).data.text);
  expect((await h.call({ action: "confirm", responseId: receipt.responseId })).isError).toBe(true);
  const review = JSON.parse((await h.call({ action: "review", responseId: receipt.responseId,
   decisions: [{ id: "rows", question: "Which rows?", dependsOn: [], status: "resolved", resolution: "Todas" }] })).content[0].text).agreement;
  const confirmed = result(h, "review", review.questionnaire, { cancelled: false, answers: [{ questionIndex: 0, question: review.questions[0], kind: "option", answer: "Confirmar acuerdo" }] });
  const final = JSON.parse(confirmed.content.at(-1).text).intentResponse;
  expect(final.responseId).not.toBe(receipt.responseId);
  expect((await h.call({ action: "confirm", responseId: final.responseId })).details.state).toBe("confirmed");
 });
 test("selector cancellation and malformed results have distinct receipts without a usable responseId", async () => {
  const h = harness(); await h.propose({ questionnaire });
  for (const [details, status] of [[{ cancelled: true }, "cancelled"], [{ answers: [] }, "unavailable"]]) {
   const received = result(h, String(status), questionnaire, details);
   const receipt = JSON.parse(received.content.at(-1).text).intentResponse;
   expect(receipt.status).toBe(status); expect(receipt.responseId).toBeUndefined();
  }
 });
 test("status without work recovers the session only; mutations still require work", async () => {
  const h = harness();
  expect((await h.call({ action: "status", work: undefined })).isError).toBe(true);
  await h.propose(); h.input("Solo filtrados");
  const recovered = await h.call({ action: "status", work: undefined });
  expect(recovered.details).toMatchObject({ ok: true, work: "export-csv", hasResponse: true });
  expect((await h.call({ action: "cancel", work: undefined })).isError).toBe(true);
  const restored = harness(h.cwd, structuredClone(h.branch));
  expect((await restored.call({ action: "status", work: undefined })).details).toMatchObject({ work: "export-csv", hasResponse: true });
 });
 test("cancelling a later batch preserves earlier answers through resume and the next batch", async () => {
  const h = harness();
  const all = [questionnaire[0], { ...questionnaire[0], question: "¿Qué orden?" }];
  await h.propose({ questionnaire: all });
  result(h, "first", [all[0]], { cancelled: false, answers: [{ questionIndex: 0, question: all[0].question, kind: "option", answer: "Todas" }] });
  result(h, "cancel-second", [all[1]], { cancelled: true });
  const restored = harness(h.cwd, structuredClone(h.branch));
  const recovered = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  expect(recovered.response.text).toContain(all[0].question);
  result(restored, "second", [all[1]], { cancelled: false, answers: [{ questionIndex: 0, question: all[1].question, kind: "custom", answer: "Orden visible" }] });
  const complete = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  expect(complete.response.text).toContain(all[0].question);
  expect(complete.response.text).toContain("Orden visible");
 });
 test("a global note survives cancellation of another batch", async () => {
  const h = harness();
  const all = [questionnaire[0], { ...questionnaire[0], question: "¿Qué orden?" }];
  await h.propose({ questionnaire: all });
  result(h, "note", [all[0]], { cancelled: false, answers: [], globalNote: "Solo backend, sin entrega Git" });
  result(h, "cancel", [all[1]], { cancelled: true });
  const status = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect(status.response.text).toContain("Solo backend, sin entrega Git");
  expect(status.agreement.status).toBe("pending");
 });
 test("free-text refusal and amended selector reviews cannot confirm", async () => {
  const h = harness(); await h.propose({ questionnaire }); h.input("Todas");
  const round = JSON.parse((await h.call({ action: "status" })).content[0].text);
  const review = JSON.parse((await h.call({ action: "review", responseId: round.response.id, decisions: [{ id: "rows", question: "Which rows?", dependsOn: [], status: "resolved", resolution: "Todas" }] })).content[0].text).agreement;
  const q = review.questionnaire[0];
  for (const details of [
   { cancelled: false, answers: [], globalNote: "No confirmo; quiero cambiarlo" },
   { cancelled: false, answers: [{ questionIndex: 0, question: q.question, kind: "custom", answer: "No" }] },
   { cancelled: false, answers: [{ questionIndex: 0, question: q.question, kind: "option", answer: "Confirmar acuerdo", notes: "Pero cambia el alcance" }] },
  ]) {
   const observed = result(h, "review", [q], details);
   const receipt = JSON.parse(observed.content.at(-1).text).intentResponse;
   expect((await h.call({ action: "confirm", responseId: receipt.responseId })).isError).toBe(true);
   expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
  }
 });
 test("structured options and free text become observed answers, never delivery input", async () => {
  const h = harness(); await h.propose({ questionnaire });
  result(h, "q1", questionnaire, { cancelled: false, answers: [{ questionIndex: 0, question: questionnaire[0].question, kind: "custom", answer: "Solo filtradas, sin entrega Git", notes: "No cambies el frontend" }] });
  const status = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect(status.response.source).toBe("ask_user_question"); expect(status.response.text).toContain("sin entrega Git");
  expect(status.response.text).toContain("No cambies el frontend");
  expect((await h.call({ action: "record", material, work: "another" })).isError).toBe(true);
  expect((await h.call({ action: "confirm", responseId: status.response.id })).isError).toBe(true);
  const reviewed = await h.call({ action: "review", responseId: status.response.id, decisions: [{ id: "rows", question: "Which rows?", status: "resolved", dependsOn: [], resolution: status.response.text }] });
  const review = JSON.parse(reviewed.content[0].text).agreement;
  expect(review.questionnaire[0].options.map((o: any) => o.label)).toEqual(["Confirmar acuerdo", "Ajustar acuerdo", "Cancelar"]);
  result(h, "adjust", review.questionnaire, { cancelled: false, answers: [{ questionIndex: 0, question: review.questions[0], kind: "option", answer: "Ajustar acuerdo" }] });
  const adjusted = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect((await h.call({ action: "confirm", responseId: adjusted.response.id })).isError).toBe(true);
  result(h, "q2", review.questionnaire, { cancelled: false, answers: [{ questionIndex: 0, question: review.questions[0], kind: "option", answer: "Confirmar acuerdo" }] });
  const next = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect((await h.call({ action: "confirm", responseId: next.response.id })).details.state).toBe("confirmed");
 });
 test("unrelated, forged, cancelled or stale questionnaires cannot confirm intent", async () => {
  const h = harness(); await h.propose({ questionnaire });
  const details = { cancelled: false, answers: [{ questionIndex: 0, question: questionnaire[0].question, kind: "option", answer: "Todas" }] };
  result(h, "other", [{ ...questionnaire[0], question: "¿TDD?" }], details);
  expect(JSON.parse((await h.call({ action: "status" })).content[0].text).response).toBeUndefined();
  result(h, "bad", questionnaire, { ...details, answers: [{ ...details.answers[0], answer: "invented option" }] });
  expect(JSON.parse((await h.call({ action: "status" })).content[0].text).response).toBeUndefined();
  result(h, "valid", questionnaire, details);
  result(h, "cancel", questionnaire, { ...details, cancelled: true });
  expect(JSON.parse((await h.call({ action: "status" })).content[0].text).response).toBeUndefined();
  h.handlers.get("tool_call")!({ toolName: "ask_user_question", toolCallId: "stale", input: { questions: questionnaire } }, h.ctx);
  await h.propose({ questionnaire: [{ ...questionnaire[0], header: "Nuevo" }] });
  h.handlers.get("tool_result")!({ toolName: "ask_user_question", toolCallId: "stale", details, isError: false }, h.ctx);
  expect(JSON.parse((await h.call({ action: "status" })).content[0].text).response).toBeUndefined();
 });
 test("batches retain earlier replies and resume from the same round", async () => {
  const h = harness(); const all = Array.from({ length: 5 }, (_, i) => ({ ...questionnaire[0], question: `Pregunta ${i}?` }));
  await h.propose({ questionnaire: all });
  for (const [i, q] of all.entries()) result(h, `q${i}`, [q], { cancelled: false, answers: [{ questionIndex: 0, question: q.question, kind: "option", answer: "Todas" }] });
  const restored = harness(h.cwd, structuredClone(h.branch));
  const status = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  for (const q of all) expect(status.response.text).toContain(q.question);
  expect(status.agreement.questionnaire).toHaveLength(5);
 });
});

describe("decision-tree rounds and final review", () => {
 const tree = [
  { id: "identity", question: "¿Una identidad con varios papeles?", dependsOn: [], status: "open" },
  { id: "entry", question: "¿Qué contexto abre al entrar?", dependsOn: ["identity"], status: "open" },
  { id: "facts", question: "Comprobar los datos obligatorios del centro", dependsOn: [], status: "waiting" },
 ];
 test("answering the first frontier cannot confirm the whole block or create SDD", async () => {
  const h = harness();
  await h.propose({ change: "export-csv", decisions: tree }); h.input("Una identidad con varios papeles");
  const state = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect((await h.call({ action: "confirm", responseId: state.response.id })).isError).toBe(true);
  const partial = tree.map((d) => d.id === "identity" ? { ...d, status: "resolved", resolution: state.response.text } : d);
  expect((await h.call({ action: "review", responseId: state.response.id, decisions: partial })).isError).toBe(true);
  expect((await h.call({ action: "review", responseId: state.response.id, decisions: [partial[0]] })).isError).toBe(true);
  expect((await h.propose({ decisions: [partial[0]] })).isError).toBe(true);
  expect(h.gate({ agent: "sdd-scope", task: "intent_work: export-csv" })).toMatchObject({ block: true });
  expect(existsSync(join(h.cwd, "openspec"))).toBe(false);
 });
 test("a fresh response is required for the exact final material, including after resume", async () => {
  const h = harness(); await h.propose(); h.input("Solo filtrados");
  const state = JSON.parse((await h.call({ action: "status" })).content[0].text);
  const decisions = [{ id: "rows", question: "Which rows?", dependsOn: [], status: "resolved", resolution: "User: solo filtrados" }];
  expect((await h.call({ action: "review", responseId: state.response.id, decisions })).details.state).toBe("pending");
  expect((await h.call({ action: "confirm", responseId: state.response.id })).isError).toBe(true);
  const restored = harness(h.cwd, structuredClone(h.branch)); restored.input("Sí, ese es el acuerdo");
  const review = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  expect(review.agreement.stage).toBe("review");
  expect((await restored.call({ action: "confirm", responseId: review.response.id, material: { ...material, objective: "Export everything" } })).isError).toBe(true);
  expect((await restored.call({ action: "confirm", responseId: review.response.id })).details.state).toBe("confirmed");
 });
 test("a temporarily empty frontier preserves waiting research instead of closing", async () => {
  const h = harness();
  const decisions = [
   { id: "facts", question: "Read centre validation", status: "waiting", dependsOn: [] },
   { id: "required", question: "Which extra fields?", status: "open", dependsOn: ["facts"] },
  ];
  const result = await h.propose({ questions: [], decisions });
  const pending = JSON.parse(result.content[0].text);
  expect(pending.frontier).toEqual([]); expect(pending.agreement.status).toBe("pending");
  h.input("Sigue investigando");
  expect((await h.call({ action: "record", material, decisions })).isError).toBe(true);
  const status = JSON.parse((await h.call({ action: "status" })).content[0].text);
  expect((await h.call({ action: "review", responseId: status.response.id })).isError).toBe(true);
 });
 test("research completion can reach review without inventing an extra human round", async () => {
  const h = harness(); await h.propose(); h.input("Solo filtrados");
  const answer = JSON.parse((await h.call({ action: "status" })).content[0].text).response;
  const decisions = [
   { id: "rows", question: "Which rows?", dependsOn: [], status: "resolved", resolution: answer.text },
   { id: "facts", question: "Read export constraints", dependsOn: [], status: "waiting" },
  ];
  await h.propose({ questions: [], decisions });
  const complete = decisions.map((d) => ({ ...d, status: "resolved", resolution: d.resolution ?? "export.ts:10 supports filtered rows" }));
  const review = await h.call({ action: "review", decisions: complete, responseId: answer.id });
  expect(review.details.state).toBe("pending");
  const revision = JSON.parse(review.content[0].text).agreement.revision;
  expect(JSON.parse((await h.call({ action: "review", decisions: complete, responseId: answer.id })).content[0].text).agreement.revision).toBe(revision);
  expect((await h.call({ action: "confirm", responseId: answer.id })).isError).toBe(true);
 });
 test("more than four independent questions form one round; malformed trees do not", async () => {
  const h = harness();
  const decisions = Array.from({ length: 6 }, (_, n) => ({ id: `q${n}`, question: `Decision ${n}?`, dependsOn: [], status: "open" }));
  expect((await h.propose({ decisions, questions: decisions.map((d) => d.question) })).details.state).toBe("pending");
  const cyclic = decisions.map((d, n) => ({ ...d, dependsOn: [`q${(n + 1) % 6}`] }));
  expect((await h.propose({ decisions: cyclic })).isError).toBe(true);
  expect((await h.propose({ decisions: [decisions[0], decisions[0]] })).isError).toBe(true);
 });
});

describe("intent discovery through the registered Pi tool and hooks", () => {
 test("a complete request can be recorded with observed provenance, never a fake or extension response", async () => {
  const h = harness();
	setContinuityObjective(h.cwd, { objective: "Objetivo anterior", evidence: { kind: "pi-observed", requestId: "previous-request", recordedAt: "2026-09-22T12:00:00Z" } }, "absent");
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  h.input("Export the filtered rows", "extension");
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  const request = "Export the filtered rows as CSV, preserve filter and do not export hidden columns. Implement it.";
  h.input(request, "rpc");
  expect((await h.call({ action: "record", material, questions: ["Which columns?"] })).isError).toBe(true);
  expect(existsSync(join(h.cwd, "openspec/changes/export-csv"))).toBe(false);
  expect((await h.call({ action: "record", material, change: "export-csv" })).details.state).toBe("confirmed");
  const stored = readAgreement(join(h.cwd, "openspec/changes/export-csv"));
  expect(stored.kind).toBe("valid");
  if (stored.kind !== "valid") return;
  expect(stored.agreement).toMatchObject({ fromRequest: true, questions: [], response: { text: request, source: "rpc" } });
	const continuity = readContinuityCheckpoint(h.cwd, { mode: "sdd", change: "export-csv" });
	expect(continuity.status === "valid" && continuity.checkpoint).toMatchObject({ objective: material.objective, objectiveEvidence: { kind: "intent", work: "export-csv", materialKey: stored.agreement.materialKey, agreementRevision: stored.agreement.revision } });
  expect((await h.call({ action: "record", material: { ...material, objective: "Different work" }, change: "export-csv" })).isError).toBe(true);
 });
	test("keeps a published agreement and exposes a warning when continuity cannot be updated", () => {
		const h = harness();
		const latest = { id: "request-1", text: "Exporta los resultados", source: "interactive" as const };
		const snapshot = runIntentDiscovery(h.ctx as never, { action: "record", work: "export-csv", change: "export-csv", material }, (type, data) => h.branch.push({ type: "custom", customType: type, data }), latest,
			() => ({ outcome: "unavailable", reason: "io" }));
		expect(snapshot.agreement?.status).toBe("confirmed"); expect(snapshot.continuityWarning).toBe("continuity-objective-unavailable:io");
		expect(readAgreement(join(h.cwd, "openspec/changes/export-csv")).kind).toBe("valid");
	});
 test("record cannot bypass pending or cancelled discovery", async () => {
  const h = harness(); h.input("Build an export"); await h.propose();
  expect((await h.call({ action: "record", material })).isError).toBe(true);
  await h.call({ action: "cancel" }); h.input("Some other text");
  expect((await h.call({ action: "record", material })).isError).toBe(true);
 });
 test("a phase binds its own full output, never old artifacts, and stops if the agreement changes", async () => {
  const h = harness(); h.input("Implement the specified filtered CSV export");
  await h.call({ action: "record", change: "export-csv", material });
  const handlers = new Map<string, Function>();
  registerAgentPromptHook({ on: (name: string, fn: Function) => handlers.set(name, fn) } as never);
  const event = { systemPrompt: "You are the independent SDD verify executor.", prompt: "intent_work: export-csv\nVerify openspec/changes/export-csv/" };
  await handlers.get("before_agent_start")!(event, h.ctx);
  const directory = join(h.cwd, "openspec/changes/export-csv");
  const stored = readAgreement(directory); if (stored.kind !== "valid") throw new Error("fixture agreement absent");
  const write = { toolName: "write", input: { path: "openspec/changes/export-csv/verify-report.md", content: "status: pass\nbehavior_coverage: verified\nintent_key: typo\n\nChecked behavior.\nintent_key: typo\n" } };
  expect(await handlers.get("tool_call")!(write, h.ctx)).toBeUndefined();
  expect(artifactHasIntentKey(write.input.content, stored.agreement.materialKey)).toBe(true);
  expect(write.input.content).toStartWith("status: pass\nbehavior_coverage: verified\n");
  expect(write.input.content).toContain("Checked behavior.");
  const other = { toolName: "write", input: { path: "openspec/changes/export-csv/design.md", content: "intent_key: old\nOld design" } };
  await handlers.get("tool_call")!(other, h.ctx);
  expect(other.input.content).toBe("intent_key: old\nOld design");
  const partial = { toolName: "edit", input: { path: write.input.path, oldText: "x", newText: "y" } };
  expect(await handlers.get("tool_call")!(partial, h.ctx)).toBeUndefined();
  expect(partial.input).not.toHaveProperty("content");
  await h.propose({ change: "export-csv", reopenReason: "New product choice" });
  expect(await handlers.get("tool_call")!(write, h.ctx)).toMatchObject({ block: true });
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
  expect((await h.finish({work:"another-work"})).details.state).toBe("confirmed");
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
  expect((await h.finish({ change: "export-csv", material: updated })).details.state).toBe("confirmed");
  const stored = readAgreement(join(h.cwd, "openspec/changes/export-csv"));
  expect(stored.kind).toBe("valid");
  if (stored.kind === "valid") expect(stored.agreement.history?.[0]?.response).toMatchObject({ text: "Solo filtrados; conserva también el orden.", source: "rpc" });
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
  expect((await restored.call({ action: "status", change: "export-csv" })).details.state).toBe("confirmed");
  expect(restored.gate({ agent: "sdd-scope", task: "change: export-csv\nintent_work: export-csv" })).toBeUndefined();
 });
 test("pending round and observed answer survive reopening the same session", async () => {
  const h = harness(); await h.propose(); h.input("Lo filtrado");
  const restored = harness(h.cwd, structuredClone(h.branch));
  const status = JSON.parse((await restored.call({ action: "status" })).content[0].text);
  expect(status.response.text).toBe("Lo filtrado");
  expect((await restored.finish()).details.state).toBe("confirmed");
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
  execFileSync("git",["init","-q"],{cwd:h.cwd});
  const begun=beginVerification({cwd:h.cwd,changePath:dir});if(!begun.ok)throw new Error(begun.reason);
  const finished=finishVerification({cwd:h.cwd,changePath:dir,token:begun.value.token,content:marker+"status: pass\nExecuted: bun test\n"});if(!finished.ok)throw new Error(finished.reason);
  const result=writeVerifiedSddSummary({cwd:h.cwd,change:"export-csv",content:"## Resultado\nObjetivo verificado.",commands:["bun test"],readVerification:(cwd,changePath)=>readVerificationFreshness({cwd,changePath})});
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

test("verification continuation reuses the confirmed session change without another intent request", async () => {
 const h=harness();h.input("Implement the filtered CSV export");await h.call({action:"record",change:"export-csv",material});
 const task={agent:"sdd-verify",task:"Repeat independent verification of the agreed work."};
 expect(h.gate(task)).toBeUndefined();
 expect(task.task).toStartWith("change: export-csv\nintent_work: export-csv\n");
 expect(task.task).toEndWith("Repeat independent verification of the agreed work.");
 expect(h.gate({agent:"sdd-scope",task:"Start new work"})).toMatchObject({block:true});
 const other={agent:"sdd-verify",task:"change: another-change\nVerify that other change"};
 expect(h.gate(other)).toMatchObject({block:true});expect(other.task).toStartWith("change: another-change");
 await h.call({action:"cancel",change:"export-csv"});
 expect(h.gate({agent:"sdd-verify",task:"Continue verification"})).toMatchObject({block:true});
});

test("phase context names the canonical intent path and per-change TDD decision", async () => {
 const h=harness();h.input("Implement the specified export");await h.call({action:"record",change:"export-csv",material});
 const dir=join(h.cwd,"openspec/changes/export-csv");
 writeFileSync(join(dir,"preflight.json"),JSON.stringify({version:1,tdd:"off",decidedBy:"pi"}));
 const handlers=new Map<string,Function>();registerAgentPromptHook({on:(name:string,fn:Function)=>handlers.set(name,fn)} as never);
 const result=await handlers.get("before_agent_start")!({systemPrompt:"You are the independent SDD verify executor.",prompt:"intent_work: export-csv\nVerify the current change."},h.ctx);
 expect(result.systemPrompt).toContain(join(dir,"intent.md"));
 expect(result.systemPrompt).toContain("Strict TDD: OFF");
 expect(existsSync(join(h.cwd,"intent.md"))).toBe(false);
});
