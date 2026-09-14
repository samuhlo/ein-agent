import { expect, test } from "bun:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { setKeybindings, TuiMainScreen, visibleWidth, type Terminal } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { askDeliveryConsent, DeliveryConsent } from "../../ein-pi/agent/lib/delivery-consent.ts";

initTheme("dark");
setKeybindings(new KeybindingsManager());
const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
test("consent stays bounded, scrolls details, and requires an explicit selection", () => {
  let result: boolean | undefined;
  const view = new DeliveryConsent({ title: "¿Autorizar esta entrega Git?", body: Array.from({ length: 45 }, (_, i) => `Detalle ${i + 1}: rama, destino y contenido`).join("\n") }, theme, () => 24, (value) => { result = value; }, () => {});
  for (const width of [32, 40, 60, 80, 120]) {
    const lines = view.render(width);
    expect(lines.length).toBeLessThanOrEqual(24);
    expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
  }
  expect(result).toBeUndefined();
  view.handleInput("\x1b[B");
  expect(view.render(80).join("\n")).toContain("Detalle 2:");
  view.handleInput("\r");
  expect(result).toBe(false);
  const approve = new DeliveryConsent({ title: "Autorizar", body: "Acción: publicar rama" }, theme, () => 24, (value) => { result = value; }, () => {});
  approve.handleInput("\x1b[C"); approve.handleInput("\r"); expect(result).toBe(true);
  approve.handleInput("\x1b"); expect(result).toBe(false);
});

test("both arrow protocols and tab change the choice, cancellation stays the default", () => {
  for (const key of ["\x1b[C", "\x1b[D", "\x1bOC", "\x1bOD", "\x1b[1;1C", "\x1b[1;1D", "\x1b[1;1:1C", "\t", "\x1b[9u"]) {
    let result: boolean | undefined;
    const view = new DeliveryConsent({title:"Entrega",body:"Acción: push"},theme,()=>24,v=>{result=v;},()=>{});
    expect(view.render(80).join("\n")).toContain("[ Cancelar ]");
    view.handleInput(key); expect(view.render(80).join("\n"),JSON.stringify(key)).toContain("[ Autorizar entrega ]");
    view.handleInput("\r"); expect(result).toBe(true);
  }
});

test("narrow terminals retain both choices and the escape hint without crowding the task panel", async () => {
  for (const rows of [14,18,24,40]) for (const width of [32,40,84]) {
    const view=new DeliveryConsent({title:"Entrega",body:"Detalle largo ".repeat(100)},theme,()=>rows,()=>{},()=>{});
    const rendered=view.render(width);
    expect(rendered.length).toBeLessThanOrEqual(rows-2);
    expect(rendered.join("\n")).toContain("Autorizar entrega");
    expect(rendered.join("\n")).toContain("Cancelar");
    expect(rendered.join("\n")).toContain("esc cancelar");
    expect(rendered.every(line=>visibleWidth(line)<=width)).toBe(true);
  }
  let options: unknown;
  await askDeliveryConsent({ui:{custom:async (_factory:unknown,value:unknown)=>{options=value;return false;}}} as never,{title:"Entrega",body:"Push"});
  expect(options).toMatchObject({overlay:true,overlayOptions:{anchor:"center",margin:1}});
});

test("native overlay owns extended key presses, ignores releases and restores editor focus", () => {
  let input = (_data: string) => {};
  const terminal: Terminal = {
    rows: 24, columns: 100, kittyProtocolActive: true,
    start: (onInput) => { input = onInput; }, stop() {}, async drainInput() {}, write() {},
    moveBy() {}, hideCursor() {}, showCursor() {}, clearLine() {}, clearFromCursor() {}, clearScreen() {}, setTitle() {}, setProgress() {},
  };
  const tui = new TuiMainScreen(terminal);
  let typed = ""; let approved: boolean | undefined;
  const taskRows = ["apply 2/7", "3.1 siguiente", "4.1 pendiente"];
  const editor = { render: () => ["Editor", ...taskRows], invalidate() {}, handleInput: (data: string) => { typed += data; } };
  tui.addChild(editor); tui.setFocus(editor); tui.start();
  const view = new DeliveryConsent({title:"Publicación",body:"Rama: dev"}, theme, () => terminal.rows, result => { approved = result; tui.hideOverlay(); }, () => tui.requestRender());
  try {
    tui.showOverlay(view, {width:84,anchor:"center",margin:1});
    input("\x1b[1;1:1C");
    input("\x1b[1;1:3C");
    expect(view.render(84).join("\n")).toContain("[ Autorizar entrega ]");
    expect(typed).toBe(""); expect(editor.render()).toEqual(["Editor", ...taskRows]);
    input("\r"); expect(approved).toBe(true);
    input("x"); expect(typed).toBe("x");
  } finally { tui.stop(); }
});
