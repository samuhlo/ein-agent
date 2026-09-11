import { expect, test } from "bun:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { setKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { DeliveryConsent } from "../../ein-pi/agent/lib/delivery-consent.ts";

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
  view.handleInput("\x1b[C"); view.handleInput("\r");
  expect(result).toBe(false);
  const approve = new DeliveryConsent({ title: "Autorizar", body: "Acción: publicar rama" }, theme, () => 24, (value) => { result = value; }, () => {});
  approve.handleInput("\r"); expect(result).toBe(true);
  approve.handleInput("\x1b"); expect(result).toBe(false);
});
