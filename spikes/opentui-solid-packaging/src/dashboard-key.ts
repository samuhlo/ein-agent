import type { KeyEvent } from "@opentui/core";

export type OpenTuiKey = Pick<
  KeyEvent,
  "name" | "sequence" | "ctrl" | "meta" | "shift" | "option" | "eventType"
> & Partial<Pick<KeyEvent, "super" | "hyper">>;

const NAMED_KEYS: Readonly<Record<string, string>> = Object.freeze({
  up: "\u001b[A",
  down: "\u001b[B",
  right: "\u001b[C",
  left: "\u001b[D",
  return: "\r",
  enter: "\r",
  escape: "\u001b",
  backspace: "\u007f",
  tab: "\t",
});

/** Converts one OpenTUI keypress into one controller key, or rejects it. */
export function translateOpenTuiKey(key: OpenTuiKey): string | undefined {
  if (key.eventType === "release" || key.meta || key.option || key.super || key.hyper) return undefined;
  if (key.ctrl) return key.name.toLowerCase() === "c" && !key.shift ? "\u0003" : undefined;

  const named = NAMED_KEYS[key.name.toLowerCase()];
  if (named !== undefined) return key.shift ? undefined : named;
  return key.sequence.length === 1 && key.sequence >= " " ? key.sequence : undefined;
}
