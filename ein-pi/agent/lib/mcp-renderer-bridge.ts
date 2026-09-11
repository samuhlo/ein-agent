import type { ToolInfo } from "@earendil-works/pi-coding-agent";
import { renderMcpCard } from "./mcp-card.ts";
import { installToolCardBridge } from "./tool-card-renderer-bridge.ts";

export function isMcpAdapterTool(tool: ToolInfo): boolean {
  return /^npm:pi-mcp-adapter(?:@|$)/.test(tool.sourceInfo.source)
    || /(?:^|\/)node_modules\/pi-mcp-adapter\//.test(tool.sourceInfo.path.replace(/\\/g, "/"));
}

export function installMcpRendererBridge(prototype: object, owner: { tools(): ToolInfo[]; duration(id: string): number | undefined }): (() => void) | undefined {
  return installToolCardBridge(prototype, {
    matches: (name) => owner.tools().some((tool) => tool.name === name && isMcpAdapterTool(tool)),
    duration: owner.duration, render: renderMcpCard,
  });
}
