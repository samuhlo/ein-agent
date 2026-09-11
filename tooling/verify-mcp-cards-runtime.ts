import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { initTheme, ToolExecutionComponent, type ToolDefinition, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { setCapabilities, setKeybindings, visibleWidth } from "@earendil-works/pi-tui";
import { KeybindingsManager } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js";
import { loadThemeFromPath, setThemeInstance } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { installMcpRendererBridge } from "../ein-pi/agent/lib/mcp-renderer-bridge.ts";

const packageRoot = process.argv[2];
if (!packageRoot) throw new Error("Usage: bun tooling/verify-mcp-cards-runtime.ts <pi-mcp-adapter directory> [snapshots.json]");
const native = await import(pathToFileURL(join(resolve(packageRoot), "tool-result-renderer.ts")).href);
const options = native.resolveMcpToolRenderOptions();
initTheme("dark");
setKeybindings(new KeybindingsManager());
setThemeInstance(loadThemeFromPath(join(import.meta.dir, "../ein-pi/agent/themes/ein.json"), "truecolor"));
const tools = ["mcp", "neon_list_projects", "mcpScript", "mcp__neon"].map((name): ToolInfo => ({ name, description: "", parameters: {} as any, sourceInfo: { path: join(resolve(packageRoot), "index.ts"), source: "npm:pi-mcp-adapter@latest", scope: "user", origin: "package" } }));
const release = installMcpRendererBridge(ToolExecutionComponent.prototype, { tools: () => tools, duration: () => 800 });
assert(release, "Pi renderer seam changed");
const snapshots: { mode: string; state: string; width: number; expanded: boolean; lines: string[] }[] = [];
try {
  for (const mode of ["search", "describe", "call", "direct", "script", "namespace"]) {
    const name = mode === "script" ? "mcpScript" : mode === "direct" ? "neon_list_projects" : mode === "namespace" ? "mcp__neon" : "mcp";
    const args = mode === "search" ? { search: "projects", server: "neon" }
      : mode === "describe" ? { describe: "neon_list_projects", server: "neon" }
      : mode === "script" ? { code: 'return await mcp.call("neon_list_projects", { org_id: "org-demo" });' }
      : mode === "direct" ? { search: "planificador", org_id: "org-demo" }
      : { tool: "neon_list_projects", args: { search: "planificador", org_id: "org-demo" }, ...(mode === "namespace" ? {} : { server: "neon" }) };
    const tool: ToolDefinition = {
      name, label: name, description: "", parameters: {} as any,
      execute: async () => { throw new Error("Rendering must not execute MCP calls"); },
      renderShell: mode === "script" ? "default" : "self",
      renderCall: mode === "direct" ? native.createMcpDirectToolCallRenderer(name, options) : mode === "script" ? native.createMcpScriptToolCallRenderer(options) : native.createMcpProxyToolCallRenderer(options),
      renderResult: native.createMcpToolResultRenderer(options),
    };
    for (const state of ["pending", "running", "completed", "failed", "cancelled", "empty"]) {
      const view = new ToolExecutionComponent(name, "fixture", args, {}, tool, { requestRender() {} } as any, process.cwd());
      if (state !== "pending") view.markExecutionStarted();
      const error = state === "failed" || state === "cancelled";
      if (state !== "pending") view.updateResult({ content: [{ type: "text", text: state === "failed" ? "Missing org_id\nExpected parameters:\norg_id (string)" : state === "cancelled" ? "Tool execution aborted" : state === "empty" ? "[]" : '{"projects":[{"name":"planificador"},{"name":"demo"}]}' }], details: { mode: "call", server: "neon", tool: "list_projects", ...(error ? { error: state === "cancelled" ? "aborted" : "tool_error" } : {}) }, isError: error }, state === "running");
      for (const width of [40, 60, 80, 120]) for (const expanded of [false, true]) {
        view.setExpanded(expanded);
        const lines = view.render(width);
        const plain = lines.map(stripVTControlCharacters);
        assert(lines.every((line) => visibleWidth(line) <= width), "card overflow");
        assert.equal(plain.filter((line) => /^[●✓✗■] /.test(line)).length, 1, "one heading per execution");
        if (!expanded) {
          assert(lines.length <= 5, "collapsed card must stay compact");
          assert(!plain.join("\n").includes("Expected parameters"), "errors must stay collapsed");
        }
        snapshots.push({ mode, state, width, expanded, lines });
      }
    }
  }

  // Pi still owns binary image rendering; the card replaces only its text slots.
  setCapabilities({ images: "kitty", trueColor: true, hyperlinks: true });
  const tool = { name: "mcp", label: "mcp", description: "", parameters: {}, renderShell: "self", renderCall: native.createMcpProxyToolCallRenderer(options), renderResult: native.createMcpToolResultRenderer(options) };
  const image = new ToolExecutionComponent("mcp", "image", { tool: "get_image" }, {}, tool as any, { requestRender() {} } as any, process.cwd());
  image.updateResult({ content: [{ type: "image", mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=" }], details: { mode: "call", server: "images", tool: "get_image" }, isError: false });
  assert(image.render(80).join("\n").includes("\x1b_G"), "native Kitty image delivery must survive");
  image.setShowImages(false);
  assert(!image.render(80).join("\n").includes("\x1b_G"), "native hide-images control must survive");
} finally { release(); }
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(snapshots, null, 2));
console.log(`MCP cards: ${snapshots.length} native renders passed; proxy, discovery, schemas, direct, script, namespace, states, widths, expansion and Kitty images verified.`);
console.log(snapshots.find((snapshot) => snapshot.mode === "call" && snapshot.state === "completed" && snapshot.width === 80 && !snapshot.expanded)!.lines.map(stripVTControlCharacters).join("\n"));
