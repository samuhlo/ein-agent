import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerIntentDiscovery } from "../ein-pi/agent/extensions/internal/ein-intent-discovery.ts";
import { readIntentDraft } from "../shared/sdd/intent-draft-store.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const material = { objective: "Exportar filas filtradas", boundaries: { in: ["CSV"], out: ["Filas ocultas"] }, completionCriteria: ["Respeta filtro y columnas"] };
const rows = { id: "rows", question: "¿Qué filas?", dependsOn: [], status: "open" };
const columns = { id: "columns", question: "¿Qué columnas?", dependsOn: ["rows"], status: "open" };
function project() { const root = mkdtempSync(join(tmpdir(), "intent-relay-")); roots.push(root); return root; }
function pi(root: string) {
  const events = new Map<string, Function>(); const branch: any[] = []; let tool: any;
  registerIntentDiscovery({ on: (name: string, handler: Function) => events.set(name, handler), appendEntry: (customType: string, data: unknown) => branch.push({ type: "custom", customType, data }) } as never, ((value: any) => { tool = value; }) as never);
  const ctx: any = { cwd: root, hasUI: false, sessionManager: { getBranch: () => branch, getSessionId: () => "test-session" } };
  return {
    events, ctx, branch,
    input: (text: string) => events.get("input")!({ source: "rpc", text }, ctx),
    call: async (request: object) => { const result = await tool.execute("intent", { work: "export", ...request }, undefined, undefined, ctx); if (result.isError) throw new Error(result.content[0].text); return JSON.parse(result.content[0].text); },
    start: () => events.get("session_start")!({}, ctx),
  };
}
function cli(root: string, action: string, input?: unknown) {
  const result = Bun.spawnSync([process.execPath, join(import.meta.dir, "../ein-cc/sdd-cli/cli.ts"), "intent", "export", action], { cwd: root, stdin: input === undefined ? undefined : Buffer.from(JSON.stringify(input)), stdout: "pipe", stderr: "pipe" });
  const text = result.stdout.toString() + result.stderr.toString();
  return { code: result.exitCode, text, value: () => JSON.parse(text) };
}

test("real Pi handlers and Claude CLI preserve two rounds and require a new final-review answer", async () => {
  const root = project(); const origin = pi(root);
  const proposed = await origin.call({ action: "propose", expectedRevision: "absent", material, questions: [rows.question], decisions: [rows, columns] });
  origin.input("Solo filas filtradas");
  const shown = cli(root, "draft-show"); expect(shown.code, shown.text).toBe(0);
  const first = shown.value();
  expect(first.response).toMatchObject({ text: "Solo filas filtradas", source: "rpc" });
  const persistedId = first.response.id;
  expect(existsSync(join(root, "openspec"))).toBe(false);
  const stale = cli(root, "draft-answer", { expectedRevision: proposed.draftRevision, roundRevision: first.agreement.revision, text: "Respuesta concurrente" });
  expect(stale.code).toBe(1);
  expect(stale.value().unpublishedResponse).toMatchObject({ text: "Respuesta concurrente", source: "claude-coordinator" });
  expect(cli(root, "draft-show").value().response.id).toBe(persistedId);
  const rowResolved = { ...rows, status: "resolved", resolution: "Solo filas filtradas" };
  const second = cli(root, "draft-propose", { expectedRevision: first.draftRevision, questions: [columns.question], decisions: [rowResolved, columns] });
  expect(second.code, second.text).toBe(0);
  const round = second.value();
  expect(round.agreement.history[0].response.id).toBe(persistedId);
  const answered = cli(root, "draft-answer", { expectedRevision: round.draftRevision, roundRevision: round.agreement.revision, text: "Solo las visibles", source: "rpc" });
  expect(answered.code, answered.text).toBe(0);
  const answer = answered.value(); expect(answer.response.source).toBe("claude-coordinator");
  const reviewed = cli(root, "draft-review", { expectedRevision: answer.draftRevision, roundRevision: answer.agreement.revision, responseId: answer.response.id,
    decisions: [rowResolved, { ...columns, status: "resolved", resolution: "Columnas visibles" }] });
  expect(reviewed.code, reviewed.text).toBe(0);
  const review = reviewed.value();
  expect(cli(root, "draft-confirm", { expectedRevision: review.draftRevision, roundRevision: review.agreement.revision, responseId: answer.response.id, confirmed: true }).code).toBe(1);
  const resumed = pi(root); resumed.start();
  expect((await resumed.call({ action: "status" })).agreement.stage).toBe("review");
  const questions = review.agreement.questionnaire;
  expect(resumed.events.get("tool_call")!({ toolName: "ask_user_question", toolCallId: "final-selector", input: { questions } }, resumed.ctx)).toBeUndefined();
  const afterCrash = pi(root); afterCrash.start();
  const receipt = afterCrash.events.get("tool_result")!({ toolName: "ask_user_question", toolCallId: "final-selector", isError: false, content: [], details: { cancelled: false, answers: [{ questionIndex: 0, question: questions[0].question, kind: "option", answer: "Confirmar acuerdo" }] } }, afterCrash.ctx);
  const response = JSON.parse(receipt.content.at(-1).text).intentResponse;
  const complete = await afterCrash.call({ action: "confirm", expectedRevision: response.draftRevision, responseId: response.responseId });
  expect(complete.agreement.status).toBe("confirmed");
  expect(complete.agreement.history.map((h: any) => h.response.source)).toEqual(["rpc", "claude-coordinator"]);
  expect(complete.agreement.response.source).toBe("ask_user_question");
  expect(existsSync(join(root, "openspec"))).toBe(false);
});

test("record cannot skip an open draft and read-only CLI does not initialize files", async () => {
  const root = project();
  expect(cli(root, "draft-show").value()).toEqual({ status: "absent" });
  expect(existsSync(join(root, ".ein"))).toBe(false);
  const origin = pi(root);
  await origin.call({ action: "propose", expectedRevision: "absent", material, decisions: [rows], questions: [rows.question] });
  const saved = readIntentDraft(root, "export");
  expect(cli(root, "record", { material, questions: [], response: "Sí", confirmed: true }).code).toBe(1);
  expect(readIntentDraft(root, "export")).toEqual(saved);
  const path = join(root, ".ein/intent-drafts/export.json");
  const bytes = readFileSync(path, "utf8");
  cli(root, "draft-show"); expect(readFileSync(path, "utf8")).toBe(bytes);
});

test("a reply stays with this session's explicit work when another session changes the checkpoint objective", async () => {
  const root = project(); const first = pi(root); const second = pi(root);
  await first.call({ action: "propose", work: "first", expectedRevision: "absent", material, decisions: [rows], questions: [rows.question] });
  await second.call({ action: "propose", work: "second", expectedRevision: "absent", material, decisions: [rows], questions: [rows.question] });
  first.input("Only first work");
  expect(readIntentDraft(root, "first")).toMatchObject({ status: "valid", draft: { response: { text: "Only first work" } } });
  const other = readIntentDraft(root, "second");
  expect(other.status === "valid" && other.draft.response).toBeUndefined();
});
