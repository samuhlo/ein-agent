import { describe, expect, test } from "bun:test";
import { ToolExecutionComponent, initTheme, type ToolInfo } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { renderMcpCard, type McpCard } from "../../ein-pi/agent/lib/mcp-card.ts";
import { installMcpRendererBridge, isMcpAdapterTool } from "../../ein-pi/agent/lib/mcp-renderer-bridge.ts";
import mcpCards from "../../ein-pi/agent/extensions/ein-mcp-cards.ts";

const theme = { fg: (_name: string, text: string) => text, bold: (text: string) => text };
const base: McpCard = { tool: "mcp", args: { tool: "neon_list_projects", server: "neon", args: { search: "planificador" } }, started: true, partial: false, error: false, expanded: false, expandHint: "Ctrl+O" };
const textResult = (text: string, details: unknown = { mode: "call", server: "neon", tool: "list_projects" }) => ({ content: [{ type: "text", text }], details });
const render = (card: Partial<McpCard> = {}, width = 80) => renderMcpCard({ ...base, ...card }, width, theme).join("\n");
const info = (name: string): ToolInfo => ({ name, description: "", parameters: {} as any, sourceInfo: { path: "/tmp/node_modules/pi-mcp-adapter/index.ts", source: "npm:pi-mcp-adapter@latest", scope: "user", origin: "package" } });

describe("MCP cards", () => {
  test("pending, success, failure and cancellation have distinct compact states", () => {
    expect(render({ partial: true })).toContain("● neon · Listar proyectos");
    expect(render({ partial: true })).toContain("En curso");
    const result = textResult('{"projects":[{"name":"A"},{"name":"B"}]}');
    expect(render({ result, durationMs: 800 })).toContain("2 proyectos en esta respuesta");
    expect(render({ result, durationMs: 800 })).toContain("0.8 s");
    const failed = render({ result: textResult("Missing org_id\nExpected parameters:\nvery long schema", { error: "tool_error", server: "neon", tool: "list_projects" }) });
    expect(failed).toContain("✗ neon");
    expect(failed).toContain("Missing org_id");
    expect(failed).not.toContain("Expected parameters");
    expect(render({ error: true, result: textResult("Tool execution aborted") })).toContain("Llamada cancelada");
    expect(render({ result: textResult("[]") })).toContain("0 elementos");
    expect(render({ result: { content: [], details: { error: "init_failed", message: "No se pudo conectar" } } })).toContain("No se pudo conectar");
  });

  test("discovery, schemas, scripts and server-qualified calls retain their identity", () => {
    expect(render({ args: { search: "projects", server: "neon" }, result: textResult("raw", { mode: "search", count: 14, matches: [{ tool: "one" }], hasMore: true }) })).toContain("14 herramientas encontradas · 1 en esta página");
    expect(render({ args: { describe: "neon_list_projects" } })).toContain("Consultar esquema");
    expect(render({ tool: "mcpScript", args: { code: "SECRET SCRIPT BODY" } })).toContain("Ejecutar script");
    expect(render({ tool: "mcpScript", args: { code: "SECRET SCRIPT BODY" } })).not.toContain("SECRET SCRIPT BODY");
    expect(render({ tool: "neon_list_projects", args: { project_id: "project-demo" }, result: textResult("[]") })).toContain("neon · Listar proyectos");
    expect(render({ tool: "mcp__neon", args: { tool: "list_projects", args: {} } })).toContain("neon · Listar proyectos");
  });

  test("unknown structures, empty results and partial output never invent a count or success", () => {
    expect(render({ result: textResult('{"a":1,"b":2}') })).toContain("Respuesta estructurada · 2 campos");
    expect(render({ result: { content: [] } })).toContain("Sin contenido");
    expect(render({ partial: true, result: textResult("Done") })).not.toContain("✓");
    expect(render({ result: textResult('[{"data":"' + "x".repeat(20_000) + '"}]') })).toContain("Respuesta estructurada");
  });

  test("previews and expanded details redact credentials without changing tool data", () => {
    const args = { tool: "neon_run_sql", args: { search: "postgresql://user:secret@db/app", password: "swordfish", apiKey: "abcdef", nested: { token: "xyz" } } };
    const result = textResult('Authorization: Bearer abc.def\nDATABASE_URL=postgres://a:b@host/db\nhttps://example.org/file?token=private\n{"password":"hidden value"}');
    const before = JSON.stringify({ args, result });
    for (const expanded of [false, true]) {
      const output = render({ args, result, expanded });
      for (const secret of ["swordfish", "abcdef", "abc.def", "private", "hidden value", "user:secret", "a:b@"]) expect(output).not.toContain(secret);
    }
    expect(JSON.stringify({ args, result })).toBe(before);
    const encodedArgs = { tool: "neon_list_projects", args: JSON.stringify({ password: "encoded-password", nested: { token: "encoded-token" }, note: 'password="inline-secret"' }) };
    const encodedResult = textResult(JSON.stringify({ payload: JSON.stringify({ api_key: "encoded-key" }) }));
    const encoded = render({ args: encodedArgs, result: encodedResult, expanded: true });
    for (const secret of ["encoded-password", "encoded-token", "encoded-key", "inline-secret"]) expect(encoded).not.toContain(secret);
    const displayedArgs = encoded.split("  Argumentos\n")[1]!.split("  Respuesta\n")[0]!;
    expect(JSON.parse(displayedArgs).args.password).toBe("[oculto]");
  });

  test("links, resources and line breaks survive expansion; terminal controls do not", () => {
    const result = { content: [{ type: "text", text: "First\nhttps://example.org/report\n\x1b[2JSecond" }, { type: "image", mimeType: "image/png" }] };
    const output = render({ result, expanded: true });
    expect(output).toContain("https://example.org/report");
    expect(output).toContain("Second");
    expect(output).toContain("[image: image/png]");
    expect(output).not.toContain("\x1b");
    expect(render({ result })).toContain("1 imagen");
    const resources = render({ expanded: true, result: { content: [
      { type: "resource_link", name: "Informe", uri: "https://example.org/resource" },
      { type: "resource", resource: { uri: "file:///report.md", text: "Contenido del recurso" } },
    ] } });
    expect(resources).toContain("https://example.org/resource");
    expect(resources).toContain("file:///report.md");
    expect(resources).toContain("Contenido del recurso");
  });

  test("cards fit narrow terminals and expose expansion without dumping arguments", () => {
    for (const width of [1, 10, 40, 60, 80, 120]) {
      const lines = renderMcpCard({ ...base, result: textResult("x".repeat(2000)) }, width, theme);
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
    }
    expect(render({ result: textResult("OK") })).toContain("Ctrl+O · detalles");
    expect(render({ expanded: true, result: textResult("x".repeat(300_000)) })).toContain("Vista limitada a 256 KiB");
  });
});

describe("native MCP renderer bridge", () => {
  test("only MCP adapter provenance is eligible", () => {
    expect(isMcpAdapterTool(info("neon_list_projects"))).toBe(true);
    expect(isMcpAdapterTool({ ...info("mcp"), sourceInfo: { ...info("mcp").sourceInfo, source: "npm:other", path: "/plugins/other/index.ts" } })).toBe(false);
    expect(installMcpRendererBridge({}, { tools: () => [], duration: () => undefined })).toBeUndefined();
  });

  test("the same native row updates, expands and replays without duplicate titles or execution changes", () => {
    initTheme("dark");
    const release = installMcpRendererBridge(ToolExecutionComponent.prototype, { tools: () => [info("mcp")], duration: () => 800 });
    expect(release).toBeFunction();
    try {
      const tool = { name: "mcp", label: "MCP", description: "", parameters: {}, renderCall: () => new Text("native call", 0, 0), renderResult: () => new Text("native result", 0, 0), execute: () => { throw new Error("must not execute"); } };
      const originalExecute = tool.execute;
      const create = () => new ToolExecutionComponent("mcp", "call-1", base.args, {}, tool as any, { requestRender() {} } as any, process.cwd());
      const view = create();
      expect(stripVTControlCharacters(view.render(80).join("\n"))).toContain("Preparando llamada");
      view.markExecutionStarted();
      expect(stripVTControlCharacters(view.render(80).join("\n"))).toContain("En curso");
      const result = { ...textResult('{"projects":[1,2]}'), isError: false };
      view.updateResult(result);
      const compact = stripVTControlCharacters(view.render(80).join("\n"));
      expect(compact.match(/Listar proyectos/g)).toHaveLength(1);
      expect(compact).not.toContain("native call");
      view.setExpanded(true);
      expect(stripVTControlCharacters(view.render(80).join("\n"))).toContain("Respuesta");
      view.setExpanded(false);
      const replay = create(); replay.updateResult(result);
      expect(replay.render(80)).toEqual(view.render(80));
      expect(tool.execute).toBe(originalExecute);
      const native = new ToolExecutionComponent("other", "call-2", {}, {}, { ...tool, name: "other" } as any, { requestRender() {} } as any, process.cwd());
      expect(stripVTControlCharacters(native.render(80).join("\n"))).toContain("native call");
    } finally { release?.(); }
  });

  test("reload cleanup is idempotent and independent registrations do not stack", () => {
    const prototype = ToolExecutionComponent.prototype as any;
    const original = prototype.getCallRenderer;
    const owner = () => ({ tools: () => [info("mcp")], duration: () => undefined });
    const first = installMcpRendererBridge(prototype, owner())!;
    const wrapped = prototype.getCallRenderer;
    const second = installMcpRendererBridge(prototype, owner())!;
    expect(prototype.getCallRenderer).toBe(wrapped);
    first(); first();
    expect(prototype.getCallRenderer).toBe(wrapped);
    second();
    expect(prototype.getCallRenderer).toBe(original);
  });

  test("history mounted before session_start is restyled on its next render", () => {
    const tool = { name: "mcp", label: "mcp", description: "", parameters: {}, renderCall: () => new Text("native call", 0, 0), renderResult: () => new Text("native result", 0, 0) };
    const view = new ToolExecutionComponent("mcp", "history", base.args, {}, tool as any, { requestRender() {} } as any, process.cwd());
    view.updateResult({ ...textResult("[]"), isError: false });
    expect(stripVTControlCharacters(view.render(80).join("\n"))).toContain("native result");
    const release = installMcpRendererBridge(ToolExecutionComponent.prototype, { tools: () => [info("mcp")], duration: () => undefined })!;
    try {
      const output = stripVTControlCharacters(view.render(80).join("\n"));
      expect(output).toContain("Listar proyectos");
      expect(output).not.toContain("native result");
      expect(output).not.toContain("0.8 s");
    } finally { release(); }
  });

  test("an outer transcript adapter can shut down later without accumulating MCP layers", () => {
    const prototype = ToolExecutionComponent.prototype;
    const native = prototype.render;
    const owner = () => ({ tools: () => [info("mcp")], duration: () => undefined });
    const first = installMcpRendererBridge(prototype, owner())!;
    const mcp = prototype.render;
    prototype.render = function (width) { return mcp.call(this, width); };
    first();
    prototype.render = mcp;
    const second = installMcpRendererBridge(prototype, owner())!;
    expect(prototype.render).toBe(mcp);
    second();
    expect(prototype.render).toBe(native);
  });

  test("headless sessions install no renderer and live timings are bounded to the session", () => {
    const handlers = new Map<string, Function>();
    const prototype = ToolExecutionComponent.prototype as any;
    const original = prototype.getCallRenderer;
    mcpCards({ on: (name: string, handler: Function) => handlers.set(name, handler), getAllTools: () => [info("mcp")] } as any);
    handlers.get("session_start")!({}, { hasUI: false });
    expect(prototype.getCallRenderer).toBe(original);
    handlers.get("session_start")!({}, { hasUI: true, ui: { notify() {} } });
    handlers.get("tool_execution_start")!({ toolName: "mcp", toolCallId: "one" }, { hasUI: true });
    handlers.get("tool_execution_end")!({ toolCallId: "one" });
    handlers.get("session_shutdown")!();
    expect(prototype.getCallRenderer).toBe(original);
  });
});
