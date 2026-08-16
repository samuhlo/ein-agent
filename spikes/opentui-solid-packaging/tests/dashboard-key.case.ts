import { describe, expect, test } from "bun:test";
import type { OpenTuiKey } from "../../../ein-pi/agent/surfaces/terminal-dashboard-key.ts";
import { translateOpenTuiKey } from "../../../ein-pi/agent/surfaces/terminal-dashboard-key.ts";

function key(name: string, sequence = name, patch: Partial<OpenTuiKey> = {}): OpenTuiKey {
  return {
    name,
    sequence,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    eventType: "press",
    ...patch,
  };
}

describe("OpenTUI key translation", () => {
  test("maps controller vocabulary once", () => {
    expect([
      key("up"), key("down"), key("left"), key("right"),
      key("enter", "\r"), key("escape", "\u001b"), key("backspace", "\u007f"), key("tab", "\t"),
      key("c", "\u0003", { ctrl: true }),
      ...["j", "k", "q", "s", "p", "c", "e", "o", "u", "r", "f", "/", "g", "G", "h", "l"].map((value) => key(value)),
    ].map(translateOpenTuiKey)).toEqual([
      "\u001b[A", "\u001b[B", "\u001b[D", "\u001b[C",
      "\r", "\u001b", "\u007f", "\t", "\u0003",
      "j", "k", "q", "s", "p", "c", "e", "o", "u", "r", "f", "/", "g", "G", "h", "l",
    ]);
  });

  test("rejects releases and unsupported modifier combinations", () => {
    expect([
      key("j", "j", { meta: true }),
      key("j", "j", { ctrl: true }),
      key("up", "\u001b[A", { shift: true }),
      key("q", "q", { eventType: "release" }),
      key("c", "c", { ctrl: true, option: true }),
    ].map(translateOpenTuiKey)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});
