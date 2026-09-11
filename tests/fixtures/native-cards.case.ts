import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { ToolExecutionComponent, initTheme, createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { renderNativeCard, isNativeCardTool } from "../../ein-pi/agent/lib/native-card.ts";
import { installToolCardBridge } from "../../ein-pi/agent/lib/tool-card-renderer-bridge.ts";
import { installMcpRendererBridge } from "../../ein-pi/agent/lib/mcp-renderer-bridge.ts";
import nativeCards from "../../ein-pi/agent/extensions/ein-native-cards.ts";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };
const render = (args: unknown, text: string, error = false, expanded = false) => renderNativeCard({ tool: "bash", args, result: { content: [{ type: "text", text }] }, partial: false, started: true, error, expanded, expandHint: "ctrl+o" }, 120, theme).join("\n");
const owner = { matches: (name: string) => name === "bash", duration: () => undefined, render: renderNativeCard };
const plain = (view: ToolExecutionComponent) => stripVTControlCharacters(view.render(80).join("\n"));

test("native provenance excludes extension overrides", () => {
  expect(isNativeCardTool({ name: "bash", sourceInfo: { source: "builtin" } } as any)).toBe(true);
  expect(isNativeCardTool({ name: "bash", sourceInfo: { source: "npm:other" } } as any)).toBe(false);
});
test("summaries preserve failures and unknown commands without claiming checks passed", () => {
  expect(render({ command: "git branch --show-current" }, "dev\n")).toContain("Rama: dev");
  expect(render({ command: "git status; git push" }, "")).toContain("Ejecutar comando");
  expect(render({ command: "bun test" }, "partial output", true)).toContain("✗");
  expect(render({ command: "env -u DATABASE_URL bun -e 'long script'" }, "password authentication failed\nCommand exited with code 1", true)).toContain("Fallo de autenticación");
  expect(render({ command: "some-command" }, "", true)).not.toContain("Comando completado");
  expect(render({ command: "some-command" }, "Command exited with code 2", true)).toContain("código 2");
});
test("expanded scripts and output are inspectable and recognizable credentials stay redacted", () => {
  const args = { command: "DATABASE_URL=postgres://user:secret@host/db bun script.ts" };
  const before = JSON.stringify(args);
  const text = render(args, "token=private-value", false, true);
  expect(text).toContain("bun script.ts");
  expect(text).not.toContain("user:secret");
  expect(text).not.toContain("private-value");
  expect(JSON.stringify(args)).toBe(before);
});
test("MCP and native owners share one seam through either shutdown order and history reload", () => {
  initTheme("dark");
  const prototype = ToolExecutionComponent.prototype as any;
  const original = prototype.getCallRenderer;
  for (const reverse of [false, true]) {
    const view = new ToolExecutionComponent("bash", "history", { command: "git branch --show-current" }, {}, createBashToolDefinition(process.cwd()), { requestRender() {} } as any, process.cwd());
    view.updateResult({ content: [{ type: "text", text: "dev" }], isError: false });
    const native = installToolCardBridge(prototype, owner)!;
    const shared = prototype.getCallRenderer;
    const mcp = installMcpRendererBridge(prototype, { tools: () => [], duration: () => undefined })!;
    expect(prototype.getCallRenderer).toBe(shared);
    expect(plain(view)).toContain("Rama: dev");
    view.setExpanded(true);
    expect(plain(view)).toContain("git branch");
    (reverse ? native : mcp)();
    (reverse ? mcp : native)();
    expect(prototype.getCallRenderer).toBe(original);
  }
});
test("headless and shutdown preserve native presentation", () => {
  const handlers = new Map<string, Function>();
  const prototype = ToolExecutionComponent.prototype as any;
  const original = prototype.getCallRenderer;
  nativeCards({ on: (name: string, fn: Function) => handlers.set(name, fn), getAllTools: () => [] } as any);
  handlers.get("session_start")!({}, { hasUI: false });
  expect(prototype.getCallRenderer).toBe(original);
  handlers.get("session_start")!({}, { hasUI: true, ui: { notify() {} } });
  handlers.get("session_shutdown")!();
  expect(prototype.getCallRenderer).toBe(original);
});
