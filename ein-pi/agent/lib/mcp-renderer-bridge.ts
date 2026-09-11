import type { ToolInfo, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { renderMcpCard, type McpCardResult } from "./mcp-card.ts";

type CallRenderer = NonNullable<ToolDefinition["renderCall"]>;
type ToolRenderContext = Parameters<CallRenderer>[2];
type ResultRenderer = NonNullable<ToolDefinition["renderResult"]>;
type Host = {
  toolName: string;
  getCallRenderer(): CallRenderer | undefined;
  getResultRenderer(): ResultRenderer | undefined;
  getRenderShell(): "self" | "default";
  render(width: number): string[];
  invalidate(): void;
};
type Owner = { tools(): ToolInfo[]; duration(id: string): number | undefined };
const BRIDGE = Symbol.for("ein.mcp-renderer-bridge");
type Bridge = { owners: Set<Owner>; activate(): void; release(): void };

export function isMcpAdapterTool(tool: ToolInfo): boolean {
  return /^npm:pi-mcp-adapter(?:@|$)/.test(tool.sourceInfo.source)
    || /(?:^|\/)node_modules\/pi-mcp-adapter\//.test(tool.sourceInfo.path.replace(/\\/g, "/"));
}

// Pi has no renderer-only registration API. Keep its three internal dispatch
// getters behind one checked seam; tool execution, expansion and images remain
// owned by Pi. A latest-runtime probe exercises this seam in CI.
export function installMcpRendererBridge(prototype: object, owner: Owner): (() => void) | undefined {
  const host = prototype as Host & { [BRIDGE]?: Bridge };
  if (![host.getCallRenderer, host.getResultRenderer, host.getRenderShell, host.render, host.invalidate].every((value) => typeof value === "function")) return;
  let bridge = host[BRIDGE];
  if (!bridge) {
    const owners = new Set<Owner>();
    const originals = { call: host.getCallRenderer, result: host.getResultRenderer, shell: host.getRenderShell, render: host.render };
    let refreshed = new WeakSet<object>();
    const frames = new WeakMap<object, { result?: McpCardResult }>();
    const findOwner = (name: string) => [...owners].find((candidate) => candidate.tools().some((tool) => tool.name === name && isMcpAdapterTool(tool)));
    const frame = (context: ToolRenderContext) => {
      let value = frames.get(context.state);
      if (!value) { value = {}; frames.set(context.state, value); }
      return value;
    };
    const call: Host["getCallRenderer"] = function (this: Host) {
      const original = originals.call.call(this);
      const selected = findOwner(this.toolName);
      if (!selected || !original) return original;
      const tool = this.toolName;
      return (args, theme, context) => {
        const current = frame(context);
        const component: Component = {
          invalidate() {},
          render(width) {
            if (current.result) return [];
            return renderMcpCard({ tool, args, partial: true, started: context.executionStarted, error: false, expanded: context.expanded, expandHint: keyText("app.tools.expand") }, width, theme);
          },
        };
        return component;
      };
    };
    const result: Host["getResultRenderer"] = function (this: Host) {
      const original = originals.result.call(this);
      const selected = findOwner(this.toolName);
      if (!selected || !original) return original;
      const tool = this.toolName;
      return (output, options, theme, context) => {
        frame(context).result = output;
        return {
          invalidate() {},
          render(width) {
            return renderMcpCard({ tool, args: context.args, result: output, partial: options.isPartial, started: context.executionStarted, error: context.isError, expanded: options.expanded, durationMs: selected.duration(context.toolCallId), expandHint: keyText("app.tools.expand") }, width, theme);
          },
        };
      };
    };
    const shell: Host["getRenderShell"] = function (this: Host) {
      return findOwner(this.toolName) ? "self" : originals.shell.call(this);
    };
    const render: Host["render"] = function (this: Host, width) {
      // Pi rebuilds history before session_start on reload. Refresh its cached
      // render slots once so those already-mounted rows also receive the card.
      if (!refreshed.has(this) && findOwner(this.toolName)) {
        refreshed.add(this);
        this.invalidate();
      }
      return originals.render.call(this, width);
    };
    host.getCallRenderer = call;
    host.getResultRenderer = result;
    host.getRenderShell = shell;
    host.render = render;
    bridge = { owners, activate() {
      if (!owners.size) refreshed = new WeakSet<object>();
      if (host.getCallRenderer === originals.call) host.getCallRenderer = call;
      if (host.getResultRenderer === originals.result) host.getResultRenderer = result;
      if (host.getRenderShell === originals.shell) host.getRenderShell = shell;
      if (host.render === originals.render) host.render = render;
    }, release() {
      if (owners.size) return;
      if (host.getCallRenderer === call) host.getCallRenderer = originals.call;
      if (host.getResultRenderer === result) host.getResultRenderer = originals.result;
      if (host.getRenderShell === shell) host.getRenderShell = originals.shell;
      if (host.render === render) host.render = originals.render;
      // Another extension may still wrap render and restore this layer later.
      // Retain the dormant bridge in that case so reload reuses it, not stacks it.
      if (host.render === originals.render) delete host[BRIDGE];
    } };
    host[BRIDGE] = bridge;
  }
  bridge.activate();
  bridge.owners.add(owner);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    bridge.owners.delete(owner);
    bridge.release();
  };
}
