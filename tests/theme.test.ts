// =============================================================================
// TERMINAL THEME
// Colour is a property of the destination, not of the text. The renderer always
// asks the palette for a style; a palette built without colour returns the text
// untouched, so a pipe never receives escape sequences it did not ask for.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  BRAND,
  center,
  createPalette,
  fit,
  padVisible,
  shouldUseColor,
  stripAnsi,
  visibleWidth,
} from "../ein-pi/agent/lib/theme.ts";

const ESC = "\u001b";

describe("deciding whether to paint", () => {
  test("a tty with no objection gets colour", () => {
    expect(shouldUseColor({ isTTY: true, env: {} })).toBe(true);
  });

  test("NO_COLOR wins over everything", () => {
    expect(shouldUseColor({ isTTY: true, env: { NO_COLOR: "1" } })).toBe(false);
    expect(shouldUseColor({ isTTY: true, env: { NO_COLOR: "1", FORCE_COLOR: "1" } })).toBe(false);
  });

  test("a pipe gets no colour unless it insists", () => {
    expect(shouldUseColor({ isTTY: false, env: {} })).toBe(false);
    expect(shouldUseColor({ isTTY: false, env: { FORCE_COLOR: "1" } })).toBe(true);
  });

  test("TERM=dumb is not a terminal that can be painted", () => {
    expect(shouldUseColor({ isTTY: true, env: { TERM: "dumb" } })).toBe(false);
  });
});

describe("the palette", () => {
  const colour = createPalette(true);
  const plain = createPalette(false);

  test("brand yellow is what the accent paints with", () => {
    expect(colour.accent("x")).toContain(ESC);
    expect(stripAnsi(colour.accent("x"))).toBe("x");
    expect(BRAND.yellow).toBe("#FFCA40");
  });

  test("every style is a no-op without colour", () => {
    for (const style of ["accent", "text", "muted", "key", "title", "danger", "ok"] as const) {
      expect(plain[style]("hola")).toBe("hola");
    }
  });

  test("styles close what they open", () => {
    expect(colour.muted("x").endsWith(`${ESC}[0m`)).toBe(true);
  });

  test("empty text is never wrapped in escapes", () => {
    expect(colour.accent("")).toBe("");
  });
});

describe("measuring what the eye sees", () => {
  test("escape sequences take no columns", () => {
    const painted = createPalette(true).accent("hola");
    expect(painted.length).toBeGreaterThan(4);
    expect(visibleWidth(painted)).toBe(4);
  });

  test("stripAnsi leaves the text alone", () => {
    expect(stripAnsi(`${ESC}[38;2;255;202;64mhola${ESC}[0m`)).toBe("hola");
  });

  test("padding counts visible columns, not bytes", () => {
    const painted = createPalette(true).accent("ab");
    expect(visibleWidth(padVisible(painted, 6))).toBe(6);
  });

  test("centring counts visible columns too", () => {
    const painted = createPalette(true).accent("ab");
    expect(visibleWidth(center(painted, 10))).toBe(10 - 4);
  });
});

describe("fitting into the width available", () => {
  test("text that fits is untouched", () => {
    expect(fit("hola", 10)).toBe("hola");
  });

  test("text that does not fit is cut and marked", () => {
    expect(fit("abcdefghij", 5)).toBe("abcd…");
  });

  test("a width of one still says something", () => {
    expect(fit("abcdef", 1)).toBe("…");
  });

  test("a non-positive width yields nothing rather than throwing", () => {
    expect(fit("abcdef", 0)).toBe("");
  });

  test("painted text keeps its colour when it fits", () => {
    const painted = createPalette(true).accent("ab");
    expect(fit(painted, 10)).toBe(painted);
  });

  test("painted text that overflows is cut without leaving an open escape", () => {
    const painted = createPalette(true).accent("abcdefghij");
    const cut = fit(painted, 5);
    expect(visibleWidth(cut)).toBe(5);
    expect(cut.endsWith(`${ESC}[0m`)).toBe(true);
  });
});
