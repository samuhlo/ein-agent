// =============================================================================
// EIN TERMINAL APP — pure core
// The app is a function of state and keystrokes, so every one of these presses a
// key and reads what came back without opening a terminal. What they pin is not
// that the code does what the code says, but that the app can be worked from:
// every row leads somewhere, and nothing answers "read-only".
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  DASHBOARD_KEYS,
  RESERVED_KEYS,
  buildConfigView,
  buildDashboard,
  buildSessionsView,
  buildStateView,
  buildSystemView,
  handleKey,
  initialModel,
  nextSettingValue,
  previousSettingValue,
  renderApp,
  selectedRow,
  splitKeys,
  visibleRows,
  type AppModel,
  type ProjectSummary,
  type Setting,
  type SystemComponent,
  type View,
} from "../ein-pi/agent/lib/terminal-app.ts";
import { createPalette, stripAnsi } from "../ein-pi/agent/lib/theme.ts";

const SUMMARY: ProjectSummary = {
  name: "ein-agent",
  root: "/work/ein-agent",
  branch: "main",
  dirty: 3,
  change: "terminal-app-rework",
  phase: "apply",
  next: "verify",
  activeChanges: ["terminal-app-rework"],
  blockers: [],
  sessions: 4,
};

const SETTINGS: readonly Setting[] = [
  { id: "mode", label: "Modo de trabajo", options: ["solo", "team"], value: "solo" },
  { id: "tdd", label: "TDD estricto", options: ["auto", "strict"], value: undefined },
  { id: "empty", label: "Sin valores", options: [], value: undefined },
];

const SESSIONS = [
  { provider: "pi" as const, reference: "pi:v1:sha256:a", age: "2h", lastAction: "arregla el instalador" },
  { provider: "claude" as const, reference: "claude:v1:sha256:b", age: "1d", lastAction: undefined },
];

const COMPONENTS: readonly SystemComponent[] = [
  { id: "ein", label: "Ein", status: "update-available", detail: "v0.50.2", command: ["ein-install", "update"] },
  { id: "claude", label: "Claude Code", status: "unknown", detail: undefined },
];

function model(view: View): AppModel {
  return { ...initialModel(SUMMARY, view), cursor: 0 };
}

function press(start: AppModel, ...keys: string[]): { model: AppModel; effects: unknown[] } {
  let current = start;
  const effects: unknown[] = [];
  for (const key of keys) {
    const outcome = handleKey(current, key);
    current = outcome.model;
    effects.push(outcome.effect);
  }
  return { model: current, effects };
}

const ARROW_DOWN = "\u001b[B";
const ARROW_UP = "\u001b[A";
const ARROW_RIGHT = "\u001b[C";
const ARROW_LEFT = "\u001b[D";
const ENTER = "\r";
const ESCAPE = "\u001b";

const dashboard = () => model(buildDashboard(SUMMARY));
const sessions = () => model(buildSessionsView(SESSIONS, []));
const config = () => model(buildConfigView(SETTINGS));
const state = () => model(buildStateView(SUMMARY));
const system = () => model(buildSystemView(COMPONENTS));

const ALL_VIEWS = () => [dashboard(), sessions(), config(), state(), system()];

// ─── the promise the whole change exists to keep ─────────────────────────────

describe("every row leads somewhere", () => {
  test("no view answers a keypress with read-only", () => {
    for (const start of ALL_VIEWS()) {
      const total = visibleRows(start.view, start.query).length;
      for (let index = 0; index < total; index++) {
        const at = { ...start, cursor: index };
        const outcome = handleKey(at, ENTER);
        const message = outcome.effect.kind === "status" ? outcome.effect.message : "";
        expect(message.toLowerCase()).not.toContain("read-only");
        expect(message.toLowerCase()).not.toContain("solo lectura");
      }
    }
  });

  test("every row declares an action", () => {
    for (const start of ALL_VIEWS()) {
      for (const { row } of visibleRows(start.view, "")) {
        expect(row.action).toBeDefined();
      }
    }
  });

  test("enter on a fact shows the whole value, which is what a cut row hides", () => {
    const long = "/work/ein-agent/a/very/long/path/that/will/not/fit/on/one/line";
    const view = buildStateView({ ...SUMMARY, root: long });
    const at = { ...model(view), cursor: visibleRows(view, "").findIndex(({ row }) => row.value === long) };
    const outcome = handleKey(at, ENTER);
    expect(outcome.effect).toMatchObject({ kind: "status" });
    if (outcome.effect.kind === "status") expect(outcome.effect.message).toContain(long);
  });
});

// ─── dashboard ───────────────────────────────────────────────────────────────

describe("the dashboard", () => {
  test("it offers the four things the launcher exists for", () => {
    const rows = visibleRows(buildDashboard(SUMMARY), "").map(({ row }) => row.action.kind);
    expect(rows).toContain("open-view");
    expect(rows).toContain("launch");
    expect(rows).toContain("quit");
  });

  test("every entry has a distinct hotkey", () => {
    const keys = visibleRows(buildDashboard(SUMMARY), "").map(({ row }) => row.key);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("no hotkey collides with a global motion", () => {
    for (const key of Object.values(DASHBOARD_KEYS)) {
      expect(RESERVED_KEYS).not.toContain(key);
    }
  });

  test("every hotkey reaches its own row", () => {
    const rows = visibleRows(buildDashboard(SUMMARY), "");
    for (const { row } of rows) {
      const outcome = handleKey(dashboard(), row.key!);
      expect(outcome.effect.kind).not.toBe("none");
    }
  });

  test("a hotkey acts without moving the cursor there first", () => {
    const { effects } = press(dashboard(), DASHBOARD_KEYS.config);
    expect(effects[0]).toMatchObject({ kind: "open", view: "config" });
  });

  test("p and c start each runtime", () => {
    expect(press(dashboard(), DASHBOARD_KEYS.pi).effects[0]).toMatchObject({ kind: "launch", provider: "pi" });
    expect(press(dashboard(), DASHBOARD_KEYS.claude).effects[0]).toMatchObject({ kind: "launch", provider: "claude" });
  });

  test("q quits from anywhere", () => {
    for (const start of ALL_VIEWS()) {
      expect(press(start, "q").effects[0]).toMatchObject({ kind: "quit" });
      expect(press(start, "\u0003").effects[0]).toMatchObject({ kind: "quit" });
    }
  });
});

// ─── navigation ──────────────────────────────────────────────────────────────

describe("navigation", () => {
  test("letters and arrows land on the same row", () => {
    expect(press(sessions(), "j").model.cursor).toBe(press(sessions(), ARROW_DOWN).model.cursor);
    expect(press(sessions(), "j", "k").model.cursor).toBe(press(sessions(), ARROW_DOWN, ARROW_UP).model.cursor);
  });

  test("the cursor never leaves the list", () => {
    expect(press(sessions(), "k", "k", "k").model.cursor).toBe(0);
    const last = visibleRows(sessions().view, "").length - 1;
    expect(press(sessions(), ...Array(20).fill("j")).model.cursor).toBe(last);
  });

  test("g and G jump to the ends", () => {
    expect(press(sessions(), "G").model.cursor).toBe(visibleRows(sessions().view, "").length - 1);
    expect(press(sessions(), "G", "g").model.cursor).toBe(0);
  });

  test("esc returns to the dashboard from any view", () => {
    for (const start of [sessions(), config(), state(), system()]) {
      expect(press(start, ESCAPE).effects[0]).toMatchObject({ kind: "open", view: "dashboard" });
    }
  });

  test("esc on the dashboard does not quit by accident", () => {
    expect(press(dashboard(), ESCAPE).effects[0]).toMatchObject({ kind: "none" });
  });

  test("tab still cycles the views for fingers that learned it", () => {
    expect(press(dashboard(), "\t").effects[0]).toMatchObject({ kind: "open" });
  });
});

// ─── search ──────────────────────────────────────────────────────────────────

describe("search", () => {
  test("f filters the rows and / does the same", () => {
    const filtered = press(config(), "f", "m", "o", "d").model;
    expect(visibleRows(filtered.view, filtered.query)).toHaveLength(1);
    expect(press(config(), "/", "m").model.searching).toBe(true);
  });

  test("backspace removes one character", () => {
    expect(press(config(), "f", "m", "o", "\u007f").model.query).toBe("m");
  });

  test("escape leaves search and clears the filter", () => {
    const cleared = press(config(), "f", "m", ESCAPE).model;
    expect(cleared.searching).toBe(false);
    expect(cleared.query).toBe("");
  });

  test("enter keeps the filter but leaves typing mode", () => {
    const kept = press(config(), "f", "m", ENTER).model;
    expect(kept.searching).toBe(false);
    expect(kept.query).toBe("m");
  });

  test("the cursor is clamped when the filter shrinks the list", () => {
    const filtered = press(config(), "G", "f", "m", "o", "d").model;
    expect(filtered.cursor).toBe(0);
  });

  test("a filter that matches nothing says so instead of an empty list", () => {
    const empty = press(config(), "f", "z", "z", "z").model;
    const painted = stripAnsi(renderApp(empty, { columns: 80, palette: createPalette(false) }).join("\n"));
    expect(painted).toContain("Ningún resultado");
  });
});

// ─── configuration ───────────────────────────────────────────────────────────

describe("configuration", () => {
  const cycleValue = (keys: string[]) => {
    const outcome = press(config(), ...keys);
    return outcome.effects.at(-1);
  };

  test("enter cycles to the next value and asks the driver to persist it", () => {
    expect(cycleValue([ENTER])).toMatchObject({ kind: "apply-setting", settingId: "mode", value: "team" });
  });

  test("space and the right arrow cycle forward too", () => {
    expect(cycleValue([" "])).toMatchObject({ value: "team" });
    expect(cycleValue([ARROW_RIGHT])).toMatchObject({ value: "team" });
    expect(cycleValue(["l"])).toMatchObject({ value: "team" });
  });

  test("the left arrow cycles backwards, which a long option list needs", () => {
    expect(cycleValue([ARROW_LEFT])).toMatchObject({ value: "team" });
    expect(previousSettingValue(SETTINGS[0]!)).toBe("team");
    expect(previousSettingValue({ id: "x", label: "x", options: ["a", "b", "c"], value: "c" })).toBe("b");
  });

  test("an unreadable setting starts at the first option instead of guessing", () => {
    expect(nextSettingValue(SETTINGS[1]!)).toBe("auto");
  });

  test("a setting with nothing to cycle says so and changes nothing", () => {
    const at = { ...config(), cursor: 2 };
    const outcome = handleKey(at, ENTER);
    expect(outcome.effect.kind).toBe("status");
  });

  test("cycling wraps around the end of the list", () => {
    expect(nextSettingValue({ id: "x", label: "x", options: ["a", "b"], value: "b" })).toBe("a");
  });

  test("the view never mutates a value itself: writing is the driver's", () => {
    const before = config();
    const after = handleKey(before, ENTER).model;
    expect(after.view.sections).toEqual(before.view.sections);
  });
});

// ─── sessions ────────────────────────────────────────────────────────────────

describe("sessions", () => {
  test("both runtimes appear in one list", () => {
    const rows = visibleRows(buildSessionsView(SESSIONS, []), "");
    expect(rows.map(({ row }) => row.action.kind).filter((kind) => kind === "session")).toHaveLength(2);
  });

  test("enter resumes that session on its own runtime", () => {
    const outcome = handleKey(sessions(), ENTER);
    expect(outcome.effect).toMatchObject({ kind: "launch", provider: "pi", reference: "pi:v1:sha256:a" });
  });

  test("a session whose phrase could not be read is still listed", () => {
    const rendered = stripAnsi(renderApp(sessions(), { columns: 90, palette: createPalette(false) }).join("\n"));
    expect(rendered).toContain("1d");
  });

  test("a runtime with no store is declared, never shown as empty", () => {
    const view = buildSessionsView([], [{ provider: "claude", reason: "no-store" }]);
    const rendered = stripAnsi(renderApp(model(view), { columns: 90, palette: createPalette(false) }).join("\n"));
    expect(rendered).toContain("Claude Code");
    expect(rendered.toLowerCase()).toContain("sin store");
  });

  test("with nothing to resume it still offers to start something", () => {
    const rows = visibleRows(buildSessionsView([], []), "");
    expect(rows.map(({ row }) => row.action.kind)).toContain("launch");
  });
});

// ─── project state ───────────────────────────────────────────────────────────

describe("project state", () => {
  test("it names branch, uncommitted work, change, phase and next step", () => {
    const rendered = stripAnsi(renderApp(state(), { columns: 100, palette: createPalette(false) }).join("\n"));
    for (const fact of ["main", "terminal-app-rework", "apply", "verify"]) {
      expect(rendered).toContain(fact);
    }
  });

  test("enter on an open change focuses it", () => {
    const view = buildStateView({ ...SUMMARY, activeChanges: ["a-change", "b-change"] });
    const index = visibleRows(view, "").findIndex(({ row }) => row.action.kind === "focus-change");
    const outcome = handleKey({ ...model(view), cursor: index }, ENTER);
    expect(outcome.effect).toMatchObject({ kind: "focus-change" });
  });

  test("an unknown fact is rendered as unknown, never as empty", () => {
    const unknown = buildStateView({ ...SUMMARY, branch: undefined, dirty: undefined });
    const rendered = stripAnsi(renderApp(model(unknown), { columns: 100, palette: createPalette(false) }).join("\n"));
    expect(rendered).toContain("desconocido");
  });

  test("a clean worktree reads as clean, not as zero", () => {
    const clean = buildStateView({ ...SUMMARY, dirty: 0 });
    const rendered = stripAnsi(renderApp(model(clean), { columns: 100, palette: createPalette(false) }).join("\n"));
    expect(rendered).toContain("limpio");
  });
});

// ─── system ──────────────────────────────────────────────────────────────────

describe("system", () => {
  test("one press asks for confirmation and runs nothing", () => {
    const outcome = handleKey(system(), ENTER);
    expect(outcome.effect.kind).toBe("status");
    expect(outcome.model.pending?.command).toEqual(["ein-install", "update"]);
    const shown = stripAnsi(renderApp(outcome.model, { columns: 100, palette: createPalette(false) }).join("\n"));
    expect(shown).toContain("ein-install update");
  });

  test("a second press runs exactly the declared command", () => {
    const { effects } = press(system(), ENTER, ENTER);
    expect(effects[1]).toMatchObject({ kind: "run", command: ["ein-install", "update"] });
  });

  test("any other key cancels the confirmation", () => {
    const { model: after, effects } = press(system(), ENTER, "j");
    expect(after.pending).toBeUndefined();
    expect(effects[1]).not.toMatchObject({ kind: "run" });
  });

  test("a component with no command is not offered as runnable", () => {
    const at = { ...system(), cursor: 1 };
    const outcome = handleKey(at, ENTER);
    expect(outcome.effect.kind).toBe("status");
    expect(outcome.model.pending).toBeUndefined();
  });

  test("moving away clears a pending confirmation", () => {
    expect(press(system(), ENTER, ARROW_DOWN).model.pending).toBeUndefined();
  });
});

// ─── rendering ───────────────────────────────────────────────────────────────

describe("rendering", () => {
  const plain = (m: AppModel, columns = 100) =>
    renderApp(m, { columns, palette: createPalette(false) }).join("\n");
  const painted = (m: AppModel, columns = 100) =>
    renderApp(m, { columns, palette: createPalette(true) }).join("\n");

  test("without colour there is not a single escape sequence", () => {
    for (const start of ALL_VIEWS()) {
      expect(plain(start)).not.toContain("\u001b");
    }
  });

  test("with colour the brand yellow is actually used", () => {
    expect(painted(dashboard())).toContain("\u001b[38;2;255;202;64m");
  });

  test("no line overflows the terminal width", () => {
    for (const columns of [40, 60, 80, 120]) {
      for (const start of ALL_VIEWS()) {
        for (const line of renderApp(start, { columns, palette: createPalette(true) })) {
          expect(stripAnsi(line).length).toBeLessThanOrEqual(columns);
        }
      }
    }
  });

  test("the source of a screen is stated once, not tagged onto every row", () => {
    const rendered = plain(state());
    expect(rendered).not.toContain("[openspec]");
    expect(rendered).not.toContain("[git]");
    expect(rendered.match(/openspec/gi)?.length ?? 0).toBeLessThanOrEqual(2);
  });

  test("exactly one row is marked as selected", () => {
    for (const start of ALL_VIEWS()) {
      const lines = renderApp(start, { columns: 90, palette: createPalette(false) });
      expect(lines.filter((line) => line.includes("▌")).length).toBe(1);
    }
  });

  test("every view says where you are and how to get back", () => {
    for (const start of [sessions(), config(), state(), system()]) {
      const rendered = plain(start);
      expect(rendered).toContain("esc");
    }
  });

  test("the hints belong to the view, not to a single fixed string", () => {
    expect(plain(config())).toContain("cambiar");
    expect(plain(sessions())).toContain("reanudar");
  });

  test("the status message is shown when there is one", () => {
    const outcome = handleKey(system(), ENTER);
    expect(plain(outcome.model)).toContain("ein-install update");
  });

  test("a terminal that reports no width still paints something", () => {
    // `script` and some CI pty wrappers report 0 columns; a width of 0 cut
    // every line to nothing and the screen went blank, which reads as a crash.
    for (const columns of [0, -5, Number.NaN]) {
      for (const start of ALL_VIEWS()) {
        const lines = renderApp(start, { columns, palette: createPalette(false) });
        expect(lines.join("").trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("a very narrow terminal still renders something readable", () => {
    const lines = renderApp(dashboard(), { columns: 30, palette: createPalette(false) });
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join("\n")).toContain("Ein");
  });
});

// ─── keys arriving in blocks ─────────────────────────────────────────────────

describe("splitting a terminal read into keys", () => {
  test("a single key is one key", () => {
    expect(splitKeys("j")).toEqual(["j"]);
  });

  test("a block of keys is not one giant key", () => {
    expect(splitKeys("sjjq")).toEqual(["s", "j", "j", "q"]);
  });

  test("an escape sequence survives the split whole", () => {
    expect(splitKeys(`${ARROW_DOWN}${ARROW_UP}j`)).toEqual([ARROW_DOWN, ARROW_UP, "j"]);
  });

  test("a bare escape is its own key", () => {
    expect(splitKeys(`${ESCAPE}o`)).toEqual([ESCAPE, "o"]);
    expect(splitKeys(ESCAPE)).toEqual([ESCAPE]);
  });

  test("function keys and tilde sequences stay together", () => {
    expect(splitKeys("OP[3~")).toEqual(["OP", "[3~"]);
  });

  test("an accented character is one key, not two broken halves", () => {
    expect(splitKeys("configuración")).toContain("ó");
    expect(splitKeys("ñ")).toEqual(["ñ"]);
  });

  test("a block of keys drives the app the same as pressing them one by one", () => {
    const block = press(dashboard(), ...splitKeys(`${DASHBOARD_KEYS.config}jj`));
    const single = press(dashboard(), DASHBOARD_KEYS.config, "j", "j");
    expect(block.model.cursor).toBe(single.model.cursor);
  });
});

// ─── the selection helper the driver relies on ───────────────────────────────

describe("selection", () => {
  test("selectedRow follows the cursor through a filter", () => {
    const filtered = press(config(), "f", "t", "d", "d").model;
    expect(selectedRow(filtered)?.label).toContain("TDD");
  });

  test("selectedRow is undefined when nothing matches", () => {
    const empty = press(config(), "f", "z", "z").model;
    expect(selectedRow(empty)).toBeUndefined();
  });

  test("enter with nothing selected says so instead of throwing", () => {
    const empty = press(config(), "f", "z", "z", ENTER).model;
    expect(handleKey(empty, ENTER).effect.kind).toBe("status");
  });
});
