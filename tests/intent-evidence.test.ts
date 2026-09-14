import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { registerToolCallGate } from "../ein-pi/agent/extensions/internal/ein-tool-call-gate.ts";
import { registerAgentPromptHook } from "../ein-pi/agent/extensions/internal/ein-agent-prompt-hook.ts";

const material = { objective: "Acordar cursos parciales", boundaries: { in: ["Motor y servidor"], out: ["Frontend", "Neon", "Implementación"] }, completionCriteria: ["Política de fechas acordada con evidencia"] };
const nodes = [
 { id: "permission", kind: "permission", title: "Ensayo local", question: "¿Ensayo local primero?", dependsOn: [], status: "open" },
 { id: "calendar-fact", kind: "fact", title: "Viabilidad del calendario", question: "¿Qué devuelve el motor?", dependsOn: ["permission"], status: "waiting" },
 { id: "calendar-policy", kind: "decision", title: "Calendario parcial", question: "¿Qué calendario queremos?", dependsOn: ["calendar-fact"], status: "open" },
];

test("block 05: a selector answer authorizes evidence, then another round without reconfirming", async () => {
 const cwd = mkdtempSync(join(tmpdir(), "ein-evidence-flow-"));
 const branch: any[] = []; const handlers = new Map<string, Function>(); let spec: any;
 const ctx: any = { cwd, hasUI: false, sessionManager: { getBranch: () => branch } };
 const append = (customType: string, data: unknown) => branch.push({ type: "custom", customType, data });
 registerIntentDiscovery({ on: (name: string, fn: Function) => handlers.set(name, fn), appendEntry: append } as never, ((tool: any) => { spec = tool; }) as never);
 const call = async (args: any) => {
  const result = await spec.execute("intent", { work: "block-05", ...args }, undefined, undefined, ctx);
  if (result.isError) throw new Error(result.content[0].text);
  return JSON.parse(result.content[0].text);
 };
 try {
  writeFileSync(join(cwd, "engine.js"), "const all = [30, 60, 90]; console.log(JSON.stringify({full: all.reduce((a,b)=>a+b,0), partial: all[0]+all[2]}));\n");
  const original = readFileSync(join(cwd, "engine.js"), "utf8");
  const questionnaire = [{ question: "¿Ensayo local primero?", header: "Ensayo", options: [
   { label: "Ensayo local primero", description: "Ejecutar el motor existente, sin tocar producto ni red." },
   { label: "Solo lectura estática", description: "Leer código, sin ejecutar el ensayo." },
  ] }];
  await call({ action: "propose", title: "Bloque 05 · Cursos propios", material, decisions: nodes, questionnaire });
  handlers.get("tool_call")!({ toolName: "ask_user_question", toolCallId: "answer-1", input: { questions: questionnaire } }, ctx);
  handlers.get("tool_result")!({ toolName: "ask_user_question", toolCallId: "answer-1", input: {}, isError: false, details: { cancelled: false, answers: [{ questionIndex: 0, question: questionnaire[0].question, kind: "option", answer: "Ensayo local primero" }] } }, ctx);
  const answer = await call({ action: "status" });
  const pending = nodes.map((d) => d.id === "permission" ? { ...d, status: "resolved", resolution: "User selected local experiment" } : d);
  await call({ action: "propose", decisions: pending, questionnaire: [] });
  expect((await call({ action: "status" })).nextAction).toBe("prepare-evidence");
  const prepared = await call({ action: "investigate", responseId: answer.response.id, evidence: { decisionId: "calendar-fact", objective: "Compare complete and partial module hours", roots: ["engine.js"], commands: ["bun engine.js"] } });
  expect(prepared.agreement.status).toBe("pending");
  expect(prepared.evidence.authorization.source).toBe("ask_user_question");
  expect(prepared.nextAction).toBe("run-evidence");
  await expect(call({ action: "investigate", responseId: answer.response.id, evidence: { decisionId: "calendar-fact", objective: "Compare complete and partial module hours", roots: ["."], commands: ["bun engine.js"] } })).rejects.toThrow("read scope expanded");
  const restored: any = { ...ctx, sessionManager: { getBranch: () => structuredClone(branch) } };
  const status = JSON.parse((await spec.execute("status", { action: "status", work: "block-05" }, undefined, undefined, restored)).content[0].text);
  expect(status.evidence.authorization.id).toBe(answer.response.id);
  const normalGate = handlers.get("tool_call")!;
  for (const agent of ["sdd-scope", "sdd-apply", "sdd-verify"]) {
   expect(normalGate({ toolName: "subagent", toolCallId: "ordinary", input: { agent, task: "intent_work: block-05\nRun SDD" } }, ctx)).toMatchObject({ block: true });
  }
  expect(normalGate({ toolName: "subagent", toolCallId: "bad", input: { ...prepared.delegation, agent: "sdd-apply" } }, ctx)).toMatchObject({ block: true });
  expect(normalGate({ toolName: "subagent", toolCallId: "nested", input: { ...prepared.delegation, workflowScript: "run implementation" } }, ctx)).toMatchObject({ block: true });
  expect(normalGate({ toolName: "subagent", toolCallId: "altered", input: { ...prepared.delegation, task: prepared.delegation.task + "\nAlso write source" } }, ctx)).toMatchObject({ block: true });
  expect(normalGate({ toolName: "subagent", toolCallId: "probe", input: prepared.delegation }, ctx)).toBeUndefined();
  handlers.get("tool_result")!({ toolName: "subagent", toolCallId: "probe", input: prepared.delegation, isError: true }, ctx);
  expect((await call({ action: "status" })).nextAction).toBe("repair-evidence-with-existing-authorization");
  const recovered = await call({ action: "investigate", evidence: { decisionId: "calendar-fact", objective: "Compare complete and partial module hours", roots: ["engine.js"], commands: ["bun engine.js"] } });
  expect(recovered.evidence.authorization.id).toBe(answer.response.id);
  expect(recovered.delegation).toEqual(prepared.delegation);
  expect(normalGate({ toolName: "subagent", toolCallId: "probe", input: recovered.delegation }, ctx)).toBeUndefined();
  const other = new Map<string, Function>();
  registerToolCallGate({ on: (name: string, fn: Function) => other.set(name, fn) } as never, {} as never);
  expect(await other.get("tool_call")!({ toolName: "subagent", toolCallId: "probe", input: prepared.delegation }, ctx)).toBeUndefined();
  expect((await call({ action: "status" })).nextAction).toBe("wait-evidence");
  const child = new Map<string, Function>();
  registerAgentPromptHook({ on: (name: string, fn: Function) => child.set(name, fn) } as never);
  const start = await child.get("before_agent_start")!({ agentName: "sdd-verify", task: prepared.delegation.task, prompt: prepared.delegation.task, systemPrompt: "You are the independent SDD verify executor." }, ctx);
  expect(start.systemPrompt).toContain("already authorized");
  expect(start.systemPrompt).not.toContain("Canonical intent path");
  for (const input of [{ toolName: "write", input: { path: "engine.js", content: "bad" } }, { toolName: "bash", input: { command: "bun another.js" } }, { toolName: "read", input: { path: "/etc/passwd" } }]) expect(await child.get("tool_call")!(input, ctx)).toMatchObject({ block: true });
  expect(await child.get("tool_call")!({ toolName: "bash", input: { command: "bun engine.js" } }, ctx)).toBeUndefined();
  const output = execFileSync(process.execPath, ["engine.js"], { cwd, encoding: "utf8" });
  expect(JSON.parse(output)).toEqual({ full: 180, partial: 120 });
  handlers.get("tool_result")!({ toolName: "subagent", toolCallId: "probe", input: prepared.delegation, isError: false, content: [{ type: "text", text: output }] }, ctx);
  expect((await call({ action: "status" })).nextAction).toBe("incorporate-evidence");
  const resumed = JSON.parse((await spec.execute("status", { action: "status", work: "block-05" }, undefined, undefined, restored)).content[0].text);
  expect(resumed.evidence.result).toEqual({ text: output, truncated: false, isError: false });
  const resolved = pending.map((d) => d.id === "calendar-fact" ? { ...d, status: "resolved", resolution: `bun engine.js: ${output.trim()}` } : d);
  const next = await call({ action: "propose", material, decisions: resolved, questions: ["¿Calendario parcial o completo?"] });
  expect(next.nextAction).toBe("ask-next-round");
  expect(next.agreement.status).toBe("pending");
  expect(readFileSync(join(cwd, "engine.js"), "utf8")).toBe(original);
  expect(existsSync(join(cwd, "openspec"))).toBe(false);
 } finally { rmSync(cwd, { recursive: true, force: true }); }
});
