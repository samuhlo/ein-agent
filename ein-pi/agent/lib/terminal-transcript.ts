import { stripVTControlCharacters as stripAnsi } from "node:util";

// A label owned by this extension lets the adapter distinguish hidden thinking
// from assistant prose without changing the session or the model's messages.
export const HIDDEN_THINKING_LABEL = "\u2063\u2064";

export function cleanHiddenThinking(lines: string[]): string[] {
  const hidden = lines.map((line) => stripAnsi(line).trim() === HIDDEN_THINKING_LABEL);
  if (!hidden.some(Boolean)) return lines;
  const zones = /\x1b\]133;[ABC]\x07/g;
  const shellZones: string[] = lines.join("").match(zones) ?? [];
  const output = lines.filter((_, index) => !hidden[index]).map((line) => line.replace(zones, ""));
  while (output.length && !stripAnsi(output[0]!).trim()) output.shift();
  if (!output.some((line) => stripAnsi(line).trim())) return [];
  // Keep Pi's normal separator before visible assistant content.
  const result = ["", ...output];
  if (shellZones.includes("\x1b]133;A\x07")) result[0] = "\x1b]133;A\x07";
  result[result.length - 1] = shellZones.filter((zone) => zone !== "\x1b]133;A\x07").join("") + result[result.length - 1];
  return result;
}

export function cleanSubagentHeading(lines: string[], context?: unknown): string[] {
  const visible = lines.map((line, index) => ({ text: stripAnsi(line).trim(), index }))
    .filter(({ text }) => text);
  const call = visible[0];
  const result = visible[1];
  if (!call || !result) return lines;
  const view = context as { toolName?: string; args?: { workflowScript?: unknown; workflowScriptPath?: unknown }; result?: { isError?: boolean; details?: { mode?: string } } } | undefined;
  const workflow = view?.toolName === "subagent" && (typeof view.args?.workflowScript === "string" || typeof view.args?.workflowScriptPath === "string");
  if (workflow && /^subagent workflow(?:\s|$)/.test(call.text)) {
    const summary = view.result?.details?.mode === "workflow"
      ? visible.find(({ text, index }) => index > call.index && /^[✓✗■●◉⏳⟳] workflow(?:\s|$)/u.test(text)) : undefined;
    if (summary) {
      // Retain wrapped lane metadata and diagnostics; the native result owns the title.
      const metadata = lines.slice(call.index, summary.index);
      metadata[0] = metadata[0]!.replace(/\bsubagent\b/, "").replace(/\bworkflow\b/, "");
      return [...lines.slice(0, call.index), lines[summary.index]!, ...metadata, ...lines.slice(summary.index + 1)];
    }
    // A rejected launch is a separate attempt, not a duplicate to erase.
    if (view.result?.isError) return lines.map((line, index) => index === call.index ? line.replace(/\bsubagent\b/, "✗") : line);
  }
  const agent = /^subagent ([\w.-]+)$/.exec(call.text)?.[1];
  if (!agent) return lines;
  const resultAgent = /^[✓✗■●◉⏳⟳] ([\w.-]+)(?:\s|$)/u.exec(result.text)?.[1];
  if (resultAgent !== agent) return lines;
  return lines.filter((_, index) => index !== call.index);
}

type Renderer = { render(width: number): string[] };
const ADAPTER = Symbol.for("ein.terminal-transcript.adapter");
type AdaptedRenderer = Renderer & { [ADAPTER]?: { original: Renderer["render"]; wrapped: Renderer["render"]; users: number } };

// Pi exposes these components but has no tool-renderer override hook. Limit the
// compatibility adapter to rendered rows; execution and persisted data stay native.
export function adaptTranscriptRenderer(prototype: Renderer, clean: (lines: string[], context?: unknown) => string[]): () => void {
  const target = prototype as AdaptedRenderer;
  let state = target[ADAPTER];
  if (!state) {
    const original = target.render;
    const wrapped: Renderer["render"] = function (this: Renderer, width) { return clean(original.call(this, width), this); };
    state = { original, wrapped, users: 0 };
    target[ADAPTER] = state;
    target.render = wrapped;
  }
  state.users++;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (--state.users > 0) return;
    if (target.render === state.wrapped) target.render = state.original;
    delete target[ADAPTER];
  };
}
