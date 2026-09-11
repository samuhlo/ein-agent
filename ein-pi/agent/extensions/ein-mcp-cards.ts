import { ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installMcpRendererBridge, isMcpAdapterTool } from "../lib/mcp-renderer-bridge.ts";

export default function mcpCards(pi: ExtensionAPI): void {
  const timings = new Map<string, { start: number; end?: number }>();
  let release: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    timings.clear();
    if (!ctx.hasUI || release) return;
    release = installMcpRendererBridge(ToolExecutionComponent.prototype, {
      tools: () => pi.getAllTools(),
      duration: (id) => { const timing = timings.get(id); return timing?.end === undefined ? undefined : timing.end - timing.start; },
    });
    if (!release) ctx.ui.notify("Esta versión de Pi no admite las tarjetas MCP de Ein; se mantiene la presentación nativa.", "warning");
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (!ctx.hasUI || !pi.getAllTools().some((tool) => tool.name === event.toolName && isMcpAdapterTool(tool))) return;
    timings.set(event.toolCallId, { start: performance.now() });
    if (timings.size > 1000) timings.delete(timings.keys().next().value!);
  });
  pi.on("tool_execution_end", (event) => {
    const timing = timings.get(event.toolCallId);
    if (timing) timing.end = performance.now();
  });
  pi.on("session_shutdown", () => { release?.(); release = undefined; timings.clear(); });
}
