import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { ToolExecutionComponent, initTheme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { questionReceipt } from "../../ein-pi/agent/lib/question-card.ts";
import questionCards from "../../ein-pi/agent/extensions/ein-question-cards.ts";
import type { McpCard } from "../../ein-pi/agent/lib/mcp-card.ts";

const args = { questions: [{ header: "Progreso", question: "¿Qué progreso?" }] };
const details = { cancelled: false, answers: [{ questionIndex: 0, question: "¿Qué progreso?", kind: "option", answer: "Resumen por anexo (Recommended)" }] };
const output = { content: [{ type: "text", text: 'User has answered your questions: internal receipt {"intentResponse":{"responseId":"secret-id"}}' }], details, isError: false };
const card = (value: unknown, extra: Partial<McpCard> = {}): McpCard => ({ tool: "ask_user_question", args, result: { content: output.content, details: value }, started: true, partial: false, error: false, expanded: false, expandHint: "ctrl+o", ...extra });

test("selection badges are hidden but custom text, notes and partial cancellation survive", () => {
  expect(questionReceipt(card(details))).toEqual(["Resumen por anexo"]);
  const custom = { ...details, answers: [{ ...details.answers[0], kind: "custom", answer: "Mantener (Recommended)", notes: "sin entrega" }], globalNote: "Solo local" };
  expect(questionReceipt(card(custom))).toEqual(["Mantener (Recommended)", "Nota: sin entrega", "Nota general: Solo local"]);
  expect(questionReceipt(card({ ...custom, cancelled: true }))[0]).toBe("Cuestionario cancelado");
  expect(questionReceipt(card({ ...details, error: "no_ui" }))).toEqual(["No se pudo recoger tu respuesta"]);
  expect(questionReceipt(card({}))).toEqual(["No se pudo leer la respuesta"]);
  expect(questionReceipt(card(details, { error: true }))).toEqual(["No se pudo recoger tu respuesta"]);
  expect(questionReceipt(card(details, { partial: true }))).toEqual(["Esperando tu respuesta"]);
});

test("multiple answers retain identity and expanded previews without protocol dumps", () => {
  const multiple = { ...args, questions: [...args.questions, { header: "Entrega", question: "¿Qué entrega?" }] };
  const value = { ...details, answers: [...details.answers, { questionIndex: 1, question: "¿Qué entrega?", kind: "multi", answer: null, selected: ["Local (recomendado)", "Pruebas"], preview: "Detalle elegido" }] };
  expect(questionReceipt(card(value, { args: multiple }))).toEqual(["Progreso: Resumen por anexo", "Entrega: Local, Pruebas"]);
  expect(questionReceipt(card(value, { args: multiple, expanded: true }))).toContain("Detalle elegido");
  for (const empty of [{ kind: "custom", answer: null }, { kind: "custom", answer: "" }, { kind: "multi", answer: null, selected: [] }]) {
    const unanswered = { ...value, answers: [value.answers[0], { ...value.answers[1], ...empty, notes: "Queda pendiente" }] };
    expect(questionReceipt(card(unanswered, { args: multiple }))).toEqual(["Progreso: Resumen por anexo", "Entrega: Sin respuesta", "Nota: Queda pendiente"]);
  }
});

test("real Pi fallback renderer is replaced on live and restored history without altering payloads", () => {
  initTheme("dark");
  const handlers = new Map<string, Function>();
  questionCards({ on: (name: string, fn: Function) => handlers.set(name, fn) } as any);
  const proto = ToolExecutionComponent.prototype as any;
  const original = proto.getResultRenderer;
  const make = () => new ToolExecutionComponent("ask_user_question", "receipt", args, {}, { name: "ask_user_question" } as any, { requestRender() {} } as any, process.cwd());
  const history = make();
  history.updateResult(output as any);
  const before = JSON.stringify(output);
  handlers.get("session_start")!({}, { hasUI: false });
  expect(proto.getResultRenderer).toBe(original);
  handlers.get("session_start")!({}, { hasUI: true, ui: { notify() {} } });
  try {
    const live = make();
    expect(stripVTControlCharacters(live.render(80).join("\n"))).toContain("Esperando tu respuesta");
    live.updateResult(output as any);
    for (const view of [history, live]) for (const width of [24, 40, 80, 120]) for (const expanded of [false, true]) {
      view.setExpanded(expanded);
      const lines = view.render(width);
      const plain = stripVTControlCharacters(lines.join("\n"));
      expect(plain.match(/ein · Tu respuesta/g)?.length).toBe(1);
      expect(plain).toContain("Resumen por anexo");
      expect(plain).not.toMatch(/User has answered|intentResponse|secret-id|Recommended/);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    }
    expect(JSON.stringify(output)).toBe(before);
  } finally { handlers.get("session_shutdown")!(); }
  expect(proto.getResultRenderer).toBe(original);
});
