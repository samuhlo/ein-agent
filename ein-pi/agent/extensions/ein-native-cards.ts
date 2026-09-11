import { ToolExecutionComponent, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isNativeCardTool, renderNativeCard } from "../lib/native-card.ts";
import { installToolCardBridge } from "../lib/tool-card-renderer-bridge.ts";

export default function nativeCards(pi: ExtensionAPI): void {
  const timings = new Map<string, { start: number; end?: number }>();
  const matches = (name: string) => pi.getAllTools().some((tool) => tool.name === name && isNativeCardTool(tool));
  let release: (() => void) | undefined;
  pi.on("session_start", (_event, ctx) => {
    timings.clear();
    if (!ctx.hasUI || release) return;
    release = installToolCardBridge(ToolExecutionComponent.prototype, {
      matches, render: renderNativeCard,
      duration: (id) => { const timing = timings.get(id); return timing?.end === undefined ? undefined : timing.end - timing.start; },
    });
    if (!release) ctx.ui.notify("Esta versión de Pi no admite las tarjetas de herramientas de Ein; se mantiene la presentación nativa.", "warning");
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (!ctx.hasUI || !matches(event.toolName)) return;
    timings.set(event.toolCallId, { start: performance.now() });
    if (timings.size > 1000) timings.delete(timings.keys().next().value!);
  });
  pi.on("tool_execution_end", (event) => {
    const timing = timings.get(event.toolCallId);
    if (timing) timing.end = performance.now();
  });
  pi.on("session_shutdown", () => { release?.(); release = undefined; timings.clear(); });
}
