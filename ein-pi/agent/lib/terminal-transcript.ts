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

export function cleanSubagentHeading(lines: string[]): string[] {
  const visible = lines.map((line, index) => ({ text: stripAnsi(line).trim(), index }))
    .filter(({ text }) => text);
  const call = visible[0];
  const result = visible[1];
  if (!call || !result) return lines;
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
export function adaptTranscriptRenderer(prototype: Renderer, clean: (lines: string[]) => string[]): () => void {
  const target = prototype as AdaptedRenderer;
  let state = target[ADAPTER];
  if (!state) {
    const original = target.render;
    const wrapped: Renderer["render"] = function (this: Renderer, width) { return clean(original.call(this, width)); };
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
