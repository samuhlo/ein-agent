import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { registerDelegationResultHook } from "../../ein-pi/agent/extensions/internal/ein-delegation-results.ts";
import { normalizeScoutLaunch, type ScoutTracking } from "../../ein-pi/agent/lib/scout-contract.ts";
import { renderScoutCard, scoutReceipt } from "../../ein-pi/agent/lib/scout-receipt.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "scout-receipt-"));
  roots.push(cwd);
  writeFileSync(join(cwd, "route.ts"), "authorize();\nexportCourse();\n");
  const tracking: ScoutTracking = new Map();
  const handlers = new Map<string, Function>();
  registerDelegationResultHook({ on: (event: string, handler: Function) => handlers.set(event, handler) } as never, tracking);
  const ctx = { cwd, hasUI: false, sessionManager: { getSessionId: () => cwd } };
  function deliver(id: string, payload: unknown, extra: Record<string, unknown> = {}) {
    normalizeScoutLaunch({ agent: "ein-scout", task: "inspect route" }, id, tracking, cwd);
    const details = { results: [{ agent: "ein-scout", task: "inspect route", finalOutput: typeof payload === "string" ? payload : JSON.stringify(payload), sessionFile: "saved-session.jsonl" }], artifacts: { output: "saved-output.txt" }, ...extra };
    const event = { toolName: "subagent", toolCallId: id, isError: false, details, content: [{ type: "text", text: "Done" }] };
    return { event, result: handlers.get("tool_result")!(event, ctx) };
  }
  return { cwd, tracking, handlers, ctx, deliver };
}

const report = () => ({
  version: "ein-scout-report/v1", summary: "The route checks authorization", summaryReferenceIds: ["R1"],
  findings: [{ claim: "The route calls authorize", referenceIds: ["R1"] }],
  references: [{ id: "R1", path: "route.ts", lines: "1", supports: "authorize" }],
  uncertainties: [{ level: "none", statement: "No gaps in this observation" }],
});

test("complete and partial results preserve raw evidence, accepted content, and resumable receipts", () => {
  const { deliver, tracking, handlers, ctx } = fixture();
  const full = deliver("complete", report());
  expect(scoutReceipt(full.result.details)).toMatchObject({ status: "complete", findings: 1, references: 1 });
  expect(full.result.details.results).toEqual(full.event.details.results);
  const partial = report();
  partial.findings.push({ claim: "The helper grants access", referenceIds: ["R2"] });
  partial.references.push({ id: "R2", path: "missing-helper.ts", lines: "1", supports: "grant" });
  const { event, result } = deliver("partial", partial);
  expect(result.isError).toBe(false);
  expect(scoutReceipt(result.details)).toMatchObject({ status: "partial", findings: 1, references: 1 });
  expect(result.details.results).toEqual(event.details.results);
  expect(result.details.artifacts).toEqual(event.details.artifacts);
  expect(result.details.einScoutRunnerContent).toEqual(event.content);
  expect(result.content[1].text).toContain("Recover only material gaps");
  expect(tracking.size).toBe(0);
  const saved = JSON.parse(JSON.stringify({ ...event, ...result }));
  expect(scoutReceipt(saved.details)?.status).toBe("partial");
  expect(JSON.parse(saved.content[0].text).findings).toHaveLength(1);
  normalizeScoutLaunch({ agent: "ein-scout", task: "revalidate saved result" }, "resume", tracking, ctx.cwd);
  const resumed = handlers.get("tool_result")!({ ...saved, toolCallId: "resume" }, ctx);
  expect(resumed.isError).toBe(false);
  expect(scoutReceipt(resumed.details)).toMatchObject({ status: "partial", findings: 1, references: 1 });
  expect(resumed.details.einScoutRunnerContent).toEqual(event.content);
});

test("two rejected reports produce bounded recovery instructions and retain diagnostic artifacts", () => {
  const { deliver, tracking } = fixture();
  deliver("failure-1", "{}");
  const { event, result } = deliver("failure-2", "{}");
  expect(result.isError).toBe(true);
  expect(scoutReceipt(result.details)?.status).toBe("rejected");
  expect(result.content[0].text).toContain("do not launch a third scout or ask the user to repair the harness");
  expect(result.content[0].text).toContain("original authorized roots and remaining budget");
  expect(result.details.results).toEqual(event.details.results);
  expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "retry" }, "third", tracking)).toThrow("twice");
});

test("runtime exclusions remain unavailable and unrelated subagent results are untouched", () => {
  const { deliver, tracking, handlers, ctx } = fixture();
  const { result } = deliver("excluded", "", { results: [], workflow: { trace: [{ state: "failed", error: "No usable subagent models remain" }] } });
  expect(scoutReceipt(result.details)?.status).toBe("unavailable");
  expect(result.content[0].text).toContain("do not relaunch this turn");
  expect(() => normalizeScoutLaunch({ agent: "ein-scout", task: "retry" }, "retry", tracking)).toThrow("unavailable");
  expect(handlers.get("tool_result")!({ toolName: "subagent", toolCallId: "other", isError: false, details: {}, content: [] }, ctx)).toBeUndefined();
});

test("a malformed envelope retains content-only diagnostics outside accepted evidence", () => {
  const { tracking, handlers, ctx } = fixture();
  normalizeScoutLaunch({ agent: "ein-scout", task: "inspect" }, "content-only", tracking, ctx.cwd);
  const content = [{ type: "text", text: "Stopped; inspect /tmp/scout-original-output.txt. token=private-value" }];
  const result = handlers.get("tool_result")!({ toolName: "subagent", toolCallId: "content-only", isError: false, content }, ctx);
  expect(result.isError).toBe(true);
  expect(scoutReceipt(result.details)?.status).toBe("rejected");
  const saved = JSON.parse(JSON.stringify(result));
  expect(saved.details.einScoutRunnerContent).toEqual(content);
  expect(saved.content[0].text).not.toContain("private-value");
  expect(saved.content[0].text).not.toContain("scout-original-output.txt");
  for (const expanded of [false, true]) {
    const lines = renderScoutCard({ tool: "subagent", args: {}, result: saved, error: true, partial: false, started: true, expanded, expandHint: "ctrl+o" }, 80, { fg: (_color, text) => text, bold: (text) => text });
    expect(lines.join("\n")).toContain("Informe rechazado");
    expect(lines.join("\n")).not.toMatch(/private-value|scout-original-output/);
  }
});

test("real Pi shows evidence acceptance in live and restored results, retaining other subagent renderers", () => {
  initTheme("dark");
  const { deliver, handlers, ctx } = fixture();
  const { result } = deliver("accepted", report());
  const proto = ToolExecutionComponent.prototype as any;
  const original = proto.getResultRenderer;
  const definition = { name: "subagent", renderCall: () => new Text("native call", 0, 0), renderResult: () => new Text("native Done", 0, 0) };
  const make = (agent: string) => new ToolExecutionComponent("subagent", agent, { agent }, {}, definition as any, { requestRender() {} } as any, ctx.cwd);
  const history = make("ein-scout");
  history.updateResult(result);
  handlers.get("session_start")!({}, { ...ctx, hasUI: true, ui: { notify() {} } });
  try {
    const ordinary = make("sdd-map");
    ordinary.updateResult({ content: [{ type: "text", text: "map ready" }], details: {}, isError: false });
    expect(stripVTControlCharacters(ordinary.render(80).join("\n"))).toContain("native Done");
    expect((ordinary as any).getResultRenderer()).toBe(definition.renderResult);
    expect((ordinary as any).getRenderShell()).toBe("default");
    const live = make("ein-scout");
    expect(stripVTControlCharacters(live.render(80).join("\n"))).toContain("native call");
    live.updateResult(result);
    for (const view of [live, history]) for (const width of [24, 40, 80]) for (const expanded of [false, true]) {
      view.setExpanded(expanded);
      const lines = view.render(width);
      const plain = stripVTControlCharacters(lines.join("\n"));
      expect(plain).toContain("Evidencia validada");
      expect(plain).not.toContain("native Done");
      expect(plain).not.toContain("ein-scout-report/v1");
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    }
    const bad = make("ein-scout");
    bad.updateResult(deliver("invalid", "{}").result);
    expect(stripVTControlCharacters(bad.render(80).join("\n"))).toContain("Informe rechazado");
  } finally { handlers.get("session_shutdown")!(); }
  expect(proto.getResultRenderer).toBe(original);
});
