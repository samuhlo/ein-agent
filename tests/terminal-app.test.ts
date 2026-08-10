// =============================================================================
// TESTS: Ein terminal app core (mirror per EIN.md:19)
// Navigation is exercised without a TTY: the core is a function of state and
// keystrokes, so every assertion here is deterministic.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  EMPTY_VALUE,
  KEY_HINTS,
  UNKNOWN_VALUE,
  buildConfigScreen,
  buildHomeScreen,
  buildSessionsScreen,
  buildSystemScreen,
  handleKey,
  nextSettingValue,
  renderScreen,
  visibleRows,
  type Screen,
} from "../ein-pi/agent/lib/terminal-app.ts";
import {
  parseTerminalAppArgs,
  runTerminalApp,
  systemRowsFrom,
} from "../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import { LOGO, LOGO_NARROW, TAGLINE, bannerFinal, bannerFrame, frameCount } from "../ein-pi/agent/lib/banner.ts";
import { resolveEinAgentHome } from "../ein-pi/agent/lib/agent-home.ts";
import { applySetting, readSettings } from "../ein-pi/agent/lib/project-settings.ts";
import {
  lastActionFromSession,
  lastActionFromSessionText,
  sanitizeLabel,
  summarizeSessions,
} from "../ein-pi/agent/lib/session-summary.ts";
import type { ProjectStateV1 } from "../ein-pi/agent/lib/project-state.ts";

const ARROW_DOWN = "\u001b[B";
const ARROW_UP = "\u001b[A";
const ESCAPE = "\u001b";
const BACKSPACE = "\u007f";

function state(overrides: Partial<ProjectStateV1> = {}): ProjectStateV1 {
  return {
    schemaVersion: 1,
    identity: { cwd: "/repo", repositoryRoot: "/repo", quality: "current", reason: "read-success" },
    openspec: {
      activeChanges: ["alpha"],
      selection: "selected",
      selectedChange: "alpha",
      phase: "design",
      next: "tasks",
      artifacts: [],
      blockers: [],
      provenance: {},
      verify: "absent",
      verifyStale: false,
      quality: "current",
      reason: "read-success",
    },
    ein: { path: "EIN.md", revision: "abc1234", curated: {}, auto: { present: true }, quality: "current", reason: "read-success" },
    git: { dirty: false, stateRef: "git-v1:sha256:aa", quality: "current", reason: "read-success" },
    verification: { effectiveOutcome: "absent", freshness: "current", quality: "current", reason: "read-success" },
    runtimes: {},
    ...overrides,
  } as unknown as ProjectStateV1;
}

describe("home screen construction", () => {
  test("every row declares the source it came from", () => {
    const rows = visibleRows(buildHomeScreen(state()));
    expect(rows.length).toBeGreaterThan(0);
    for (const { row } of rows) {
      expect(["openspec", "git", "ein.md", "app"]).toContain(row.source);
    }
  });

  test("an unknown fact renders differently from an empty one", () => {
    const screen = buildHomeScreen(state({
      openspec: { ...state().openspec, phase: undefined, blockers: [] },
    } as Partial<ProjectStateV1>));
    const lines = renderScreen(screen).join("\n");
    expect(lines).toContain(`Phase`);
    expect(lines).toMatch(new RegExp(`Phase\\s+${UNKNOWN_VALUE}`));
    expect(lines).toMatch(new RegExp(`Blockers\\s+${EMPTY_VALUE}`));
  });

  test("the app never invents a value it was not given", () => {
    const screen = buildHomeScreen(state({
      git: { dirty: undefined, quality: "unavailable", reason: "not-inspected" },
    } as unknown as Partial<ProjectStateV1>));
    const worktree = visibleRows(screen).find(({ row }) => row.label === "Worktree");
    expect(worktree?.row.value).toBeUndefined();
  });
});

describe("navigation", () => {
  const home = buildHomeScreen(state());

  test("letters and arrows land on the same row", () => {
    const byLetter = handleKey(handleKey(home, "j").screen, "j").screen;
    const byArrow = handleKey(handleKey(home, ARROW_DOWN).screen, ARROW_DOWN).screen;
    expect(byLetter.cursor).toBe(byArrow.cursor);
    expect(byLetter.cursor).toBe(2);
  });

  test("the cursor never leaves the list", () => {
    let screen: Screen = home;
    for (let index = 0; index < 50; index++) screen = handleKey(screen, "j").screen;
    expect(screen.cursor).toBe(visibleRows(home).length - 1);
    for (let index = 0; index < 50; index++) screen = handleKey(screen, "k").screen;
    expect(screen.cursor).toBe(0);
  });

  test("g and G jump to the ends", () => {
    const bottom = handleKey(home, "G").screen;
    expect(bottom.cursor).toBe(visibleRows(home).length - 1);
    expect(handleKey(bottom, "g").screen.cursor).toBe(0);
  });

  test("q and ctrl+c both quit", () => {
    expect(handleKey(home, "q").effect).toEqual({ kind: "quit" });
    expect(handleKey(home, "\u0003").effect).toEqual({ kind: "quit" });
  });

  test("enter reports the row and its source without mutating anything", () => {
    const outcome = handleKey(home, "\r");
    expect(outcome.screen).toEqual(home);
    expect(outcome.effect).toMatchObject({ kind: "status" });
    if (outcome.effect.kind === "status") expect(outcome.effect.message).toContain("read-only");
  });
});

describe("search", () => {
  const home = buildHomeScreen(state());

  test("f opens search and typing filters the rows", () => {
    let screen = handleKey(home, "f").screen;
    expect(screen.searching).toBe(true);
    for (const key of "phase") screen = handleKey(screen, key).screen;
    const rows = visibleRows(screen);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(({ section, row }) => `${section} ${row.label}`.toLowerCase().includes("phase"))).toBe(true);
  });

  test("/ opens search too", () => {
    expect(handleKey(home, "/").screen.searching).toBe(true);
  });

  test("backspace removes one character", () => {
    let screen = handleKey(home, "f").screen;
    for (const key of "git") screen = handleKey(screen, key).screen;
    expect(screen.query).toBe("git");
    expect(handleKey(screen, BACKSPACE).screen.query).toBe("gi");
  });

  test("escape leaves search and clears the filter", () => {
    let screen = handleKey(home, "f").screen;
    for (const key of "git") screen = handleKey(screen, key).screen;
    screen = handleKey(screen, ESCAPE).screen;
    expect(screen.searching).toBe(false);
    expect(screen.query).toBe("");
    expect(visibleRows(screen).length).toBe(visibleRows(home).length);
  });

  test("enter keeps the filter but leaves typing mode", () => {
    let screen = handleKey(home, "f").screen;
    for (const key of "git") screen = handleKey(screen, key).screen;
    screen = handleKey(screen, "\r").screen;
    expect(screen.searching).toBe(false);
    expect(screen.query).toBe("git");
  });

  test("a filter with no matches says so instead of rendering an empty list", () => {
    let screen = handleKey(home, "f").screen;
    for (const key of "zzzz") screen = handleKey(screen, key).screen;
    expect(visibleRows(screen)).toHaveLength(0);
    expect(renderScreen(screen).join("\n")).toContain("No rows match");
  });

  test("the cursor is clamped when the filter shrinks the list", () => {
    let screen = handleKey(home, "G").screen;
    screen = handleKey(screen, "f").screen;
    for (const key of "phase") screen = handleKey(screen, key).screen;
    expect(screen.cursor).toBeLessThan(visibleRows(screen).length);
  });
});

describe("rendering", () => {
  test("the key hints are always present", () => {
    expect(renderScreen(buildHomeScreen(state())).join("\n")).toContain(KEY_HINTS);
  });

  test("the cursor marks exactly one row", () => {
    const lines = renderScreen(buildHomeScreen(state()));
    expect(lines.filter((line) => line.startsWith("> "))).toHaveLength(1);
  });

  test("output is plain text: no escape sequences", () => {
    const lines = renderScreen(handleKey(buildHomeScreen(state()), "f").screen);
    expect(lines.join("\n")).not.toMatch(/\u001b\[/);
  });
});

describe("terminal driver", () => {
  const homeFor = () => buildHomeScreen(state());

  function fakeIO(isTTY: boolean) {
    const written: string[] = [];
    let cleared = 0;
    let raw: boolean | undefined;
    let press: ((key: string) => void) | undefined;
    const io = {
      write: (text: string) => { written.push(text); },
      isTTY,
      clear: () => { cleared += 1; },
      setRawMode: (value: boolean) => { raw = value; },
      onKey: isTTY
        ? (handler: (key: string) => void) => { press = handler; return () => { press = undefined; }; }
        : undefined,
    };
    return {
      io,
      written,
      get cleared() { return cleared; },
      get raw() { return raw; },
      get listening() { return press !== undefined; },
      press: (key: string) => press?.(key),
    };
  }

  test("--help explains usage and exits 0", async () => {
    const harness = fakeIO(false);
    expect(await runTerminalApp({ argv: ["--help"], cwd: "/repo", io: harness.io, project: homeFor })).toBe(0);
    expect(harness.written.join("")).toContain("Usage: ein");
  });

  test("an unknown argument is a usage error, not a crash", async () => {
    const harness = fakeIO(false);
    expect(await runTerminalApp({ argv: ["--nope"], cwd: "/repo", io: harness.io, project: homeFor })).toBe(2);
  });

  test("--project without a value is a usage error", async () => {
    expect(parseTerminalAppArgs(["--project"], "/repo")).toMatchObject({ kind: "usage" });
    expect(parseTerminalAppArgs(["--project", "/other"], "/repo")).toMatchObject({ kind: "run", cwd: "/other" });
  });

  test("without a TTY it paints once, declares itself static and never clears", async () => {
    const harness = fakeIO(false);
    expect(await runTerminalApp({ argv: ["--no-intro"], cwd: "/repo", io: harness.io, project: homeFor })).toBe(0);
    const output = harness.written.join("");
    expect(output).toContain("Non-interactive: static view");
    expect(output).toContain("Phase");
    expect(harness.cleared).toBe(0);
    expect(harness.raw).toBeUndefined();
  });

  test("--once stays static even on a TTY", async () => {
    const harness = fakeIO(true);
    expect(await runTerminalApp({ argv: ["--once"], cwd: "/repo", io: harness.io, project: homeFor })).toBe(0);
    expect(harness.listening).toBe(false);
    expect(harness.cleared).toBe(0);
  });

  test("interactive mode enters raw, redraws on keys and restores on quit", async () => {
    const harness = fakeIO(true);
    const run = runTerminalApp({ argv: ["--no-intro"], cwd: "/repo", io: harness.io, project: homeFor });
    expect(harness.raw).toBe(true);
    const paintsAfterStart = harness.cleared;
    harness.press("j");
    expect(harness.cleared).toBe(paintsAfterStart + 1);
    harness.press("q");
    expect(await run).toBe(0);
    expect(harness.raw).toBe(false);
    expect(harness.listening).toBe(false);
  });

  test("enter surfaces the row status without leaving the app", async () => {
    const harness = fakeIO(true);
    const run = runTerminalApp({ argv: ["--no-intro"], cwd: "/repo", io: harness.io, project: homeFor });
    harness.press("\r");
    expect(harness.written.join("")).toContain("read-only");
    harness.press("q");
    expect(await run).toBe(0);
  });
});

describe("configuration view", () => {
  const settings = [
    { id: "mode", label: "Work mode", options: ["solo", "team"] as const, value: "solo" },
    { id: "tdd", label: "Strict TDD", options: ["auto", "strict", "ask", "off"] as const, value: "auto" },
    { id: "broken", label: "Unreadable", options: ["a", "b"] as const, value: undefined },
  ];
  const config = () => buildConfigScreen(settings);

  test("every setting declares the config source and its current value", () => {
    const lines = renderScreen(config()).join("\n");
    expect(lines).toContain("Work mode");
    expect(lines).toContain("[config]");
    expect(lines).toMatch(/Unreadable\s+unknown/);
  });

  test("enter cycles to the next option and asks the driver to persist it", () => {
    const outcome = handleKey(config(), "\r");
    expect(outcome.effect).toEqual({ kind: "apply", settingId: "mode", value: "team" });
  });

  test("space cycles too", () => {
    expect(handleKey(config(), " ").effect).toEqual({ kind: "apply", settingId: "mode", value: "team" });
  });

  test("cycling wraps around the end of the list", () => {
    expect(nextSettingValue({ id: "tdd", label: "T", options: ["auto", "strict"], value: "strict" })).toBe("auto");
  });

  test("an unreadable setting starts at the first option instead of guessing", () => {
    expect(nextSettingValue({ id: "x", label: "X", options: ["a", "b"], value: undefined })).toBe("a");
  });

  test("a setting with no options is never applied", () => {
    const screen = buildConfigScreen([{ id: "empty", label: "Empty", options: [], value: undefined }]);
    expect(handleKey(screen, "\r").effect).toMatchObject({ kind: "status" });
  });

  test("the config view never mutates the screen itself", () => {
    const before = config();
    expect(handleKey(before, "\r").screen).toEqual(before);
  });

  test("tab and c both ask to switch view", () => {
    expect(handleKey(config(), "\t").effect).toEqual({ kind: "switch-view" });
    expect(handleKey(buildHomeScreen(state()), "c").effect).toEqual({ kind: "switch-view" });
  });

  test("the hints name the next view in the cycle", () => {
    expect(renderScreen(config()).join("\n")).toContain("tab sessions");
    expect(renderScreen(buildHomeScreen(state())).join("\n")).toContain("tab config");
    expect(renderScreen(buildSessionsScreen([])).join("\n")).toContain("tab system");
  });
});

describe("settings catalogue", () => {
  test("an unreadable setting is reported unknown, not defaulted", () => {
    const settings = readSettings("/repo", [
      { id: "boom", label: "Boom", options: ["a"], read: () => { throw new Error("nope"); }, write: () => {} },
    ]);
    expect(settings[0]?.value).toBeUndefined();
  });

  test("applying refuses an unknown id", () => {
    let written = false;
    const definitions = [
      { id: "mode", label: "M", options: ["solo"], read: () => "solo", write: () => { written = true; } },
    ];
    expect(applySetting("/repo", "nope", "solo", definitions)).toBe(false);
    expect(written).toBe(false);
  });

  test("applying refuses a value outside the declared options", () => {
    let written = false;
    const definitions = [
      { id: "mode", label: "M", options: ["solo", "team"], read: () => "solo", write: () => { written = true; } },
    ];
    expect(applySetting("/repo", "mode", "chaos", definitions)).toBe(false);
    expect(written).toBe(false);
  });

  test("a declared value reaches its owner", () => {
    const calls: Array<[string, string]> = [];
    const definitions = [
      { id: "mode", label: "M", options: ["solo", "team"], read: () => "solo", write: (cwd: string, value: string) => { calls.push([cwd, value]); } },
    ];
    expect(applySetting("/repo", "mode", "team", definitions)).toBe(true);
    expect(calls).toEqual([["/repo", "team"]]);
  });
});

describe("driver configuration flow", () => {
  function harnessIO() {
    const written: string[] = [];
    let press: ((key: string) => void) | undefined;
    return {
      io: {
        write: (text: string) => { written.push(text); },
        isTTY: true,
        clear: () => {},
        setRawMode: () => {},
        onKey: (handler: (key: string) => void) => { press = handler; return () => { press = undefined; }; },
      },
      written,
      press: (key: string) => press?.(key),
    };
  }

  test("tab reaches the config view and enter persists through the injected owner", async () => {
    const applied: Array<[string, string]> = [];
    let stored = "solo";
    const harness = harnessIO();
    const run = runTerminalApp({
      argv: ["--no-intro"],
      cwd: "/repo",
      io: harness.io,
      project: () => buildHomeScreen(state()),
      settings: {
        read: () => [{ id: "mode", label: "Work mode", options: ["solo", "team"], value: stored }],
        apply: (_cwd, id, value) => { applied.push([id, value]); stored = value; return true; },
      },
    });
    harness.press("\t");
    expect(harness.written.join("")).toContain("Work mode");
    harness.press("\r");
    expect(applied).toEqual([["mode", "team"]]);
    // Re-read after writing: the view shows disk, not the intent.
    expect(harness.written.join("")).toContain("team");
    harness.press("q");
    expect(await run).toBe(0);
  });

  test("a refused write is reported and leaves the value alone", async () => {
    const harness = harnessIO();
    const run = runTerminalApp({
      argv: ["--no-intro"],
      cwd: "/repo",
      io: harness.io,
      project: () => buildHomeScreen(state()),
      settings: {
        read: () => [{ id: "mode", label: "Work mode", options: ["solo", "team"], value: "solo" }],
        apply: () => false,
      },
    });
    harness.press("\t");
    harness.press("\r");
    expect(harness.written.join("")).toContain("refused");
    harness.press("q");
    expect(await run).toBe(0);
  });
});

describe("settings write failures", () => {
  test("a write that throws is refused, not propagated", () => {
    const definitions = [
      { id: "mode", label: "M", options: ["solo", "team"], read: () => "solo", write: () => { throw new Error("EROFS"); } },
    ];
    expect(applySetting("/repo", "mode", "team", definitions)).toBe(false);
  });
});

describe("session summaries", () => {
  const line = (role: string, text: string) =>
    JSON.stringify({ type: "message", message: { role, content: [{ type: "text", text }] } });

  test("the last user message becomes the label", () => {
    const text = [line("user", "primera"), line("assistant", "respuesta"), line("user", "segunda")].join("\n");
    expect(lastActionFromSessionText(text)).toBe("segunda");
  });

  test("assistant turns and tool output never become the label", () => {
    const text = [line("user", "lo mio"), line("assistant", "lo suyo"), line("toolResult", "salida")].join("\n");
    expect(lastActionFromSessionText(text)).toBe("lo mio");
  });

  test("a transcript with no user message yields unknown", () => {
    expect(lastActionFromSessionText(line("assistant", "solo yo"))).toBeUndefined();
  });

  test("a chunk that starts mid-record ignores its truncated first line", () => {
    const truncated = `role":"user","content":[{"type":"text","text":"basura"}]}}\n${line("user", "buena")}`;
    expect(lastActionFromSessionText(truncated, true)).toBe("buena");
  });

  test("control characters and newlines collapse into one line", () => {
    expect(sanitizeLabel("uno dos\ntres\t cuatro")).toBe("uno dos tres cuatro");
  });

  test("a long label is truncated with an ellipsis", () => {
    const label = sanitizeLabel("x".repeat(200));
    expect(label.length).toBeLessThanOrEqual(72);
    expect(label.endsWith("…")).toBe(true);
  });

  test("the scan walks backwards and stops at the first match", () => {
    const reads: Array<[number, number]> = [];
    const tail = line("user", "reciente");
    const filler = "z".repeat(300);
    const body = `${line("user", "vieja")}\n${filler}\n${tail}`;
    const reader = {
      size: () => body.length,
      chunk: (_path: string, start: number, length: number) => {
        reads.push([start, length]);
        return body.slice(start, start + length);
      },
    };
    expect(lastActionFromSession("/s.jsonl", reader, { chunkBytes: 100, maxScanBytes: 1000 })).toBe("reciente");
    expect(reads).toHaveLength(1);
  });

  test("the scan gives up at the cap instead of reading the whole file", () => {
    const body = `${line("user", "muy vieja")}\n${"z".repeat(5000)}`;
    const reads: number[] = [];
    const reader = {
      size: () => body.length,
      chunk: (_path: string, start: number, length: number) => { reads.push(length); return body.slice(start, start + length); },
    };
    expect(lastActionFromSession("/s.jsonl", reader, { chunkBytes: 100, maxScanBytes: 300 })).toBeUndefined();
    expect(reads.reduce((total, value) => total + value, 0)).toBe(300);
  });

  test("an unreadable session is listed with an unknown action, not dropped", () => {
    const summaries = summarizeSessions(
      [{ project: "p", id: "abc", ageMs: 1000, cwd: "/repo", path: "/missing.jsonl" }],
      { size: () => undefined, chunk: () => undefined },
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.lastAction).toBeUndefined();
  });

  test("the sessions view renders the phrase and declares the source", () => {
    const screen = buildSessionsScreen([
      { id: "a", project: "p", age: "5h", lastAction: "hice algo" },
      { id: "b", project: "p", age: "7h", lastAction: undefined },
    ]);
    const lines = renderScreen(screen).join("\n");
    expect(lines).toContain("hice algo");
    expect(lines).toContain("[session]");
    expect(lines).toMatch(/7h\s+unknown/);
  });

  test("no sessions says so instead of showing an empty list", () => {
    expect(renderScreen(buildSessionsScreen([])).join("\n")).toContain("none found");
  });

  test("tab from sessions returns to state", async () => {
    const written: string[] = [];
    let press: ((key: string) => void) | undefined;
    const io = {
      write: (text: string) => { written.push(text); },
      isTTY: true,
      clear: () => {},
      setRawMode: () => {},
      onKey: (handler: (key: string) => void) => { press = handler; return () => { press = undefined; }; },
    };
    const run = runTerminalApp({
      argv: ["--no-intro"],
      cwd: "/repo",
      io,
      project: () => buildHomeScreen(state()),
      settings: { read: () => [], apply: () => true },
      sessions: () => [{ id: "a", project: "p", age: "5h", lastAction: "algo" }],
      system: () => [{ label: "Ein", status: "current" }],
    });
    press?.("\t");
    press?.("\t");
    expect(written.join("")).toContain("recent sessions");
    press?.("\t");
    expect(written.join("")).toContain("Ein — system");
    press?.("\t");
    expect(written.join("")).toContain("Ein — state");
    press?.("q");
    expect(await run).toBe(0);
  });
});

describe("banner", () => {
  test("the sweep starts empty and ends solid", () => {
    const first = bannerFrame(0, 100).join("");
    expect(first.trim()).toBe("");
    const last = bannerFrame(frameCount(100), 100);
    expect(last.join("\n")).toBe(LOGO.map((line) => line.trimEnd()).join("\n"));
  });

  test("the dither edge advances with the frame index", () => {
    const early = bannerFrame(6, 100).join("").length;
    const later = bannerFrame(20, 100).join("").length;
    expect(later).toBeGreaterThan(early);
  });

  test("a narrow terminal gets the narrow logo", () => {
    expect(bannerFrame(frameCount(40), 40).length).toBe(LOGO_NARROW.length);
    expect(bannerFrame(frameCount(100), 100).length).toBe(LOGO.length);
  });

  test("the settled banner carries the tagline", () => {
    expect(bannerFinal(100).join("\n")).toContain(TAGLINE);
  });

  test("frames never emit escape sequences: the look comes from block density", () => {
    expect(bannerFrame(12, 100).join("\n")).not.toMatch(//);
  });

  test("--no-intro skips the animation entirely", async () => {
    const frames: string[] = [];
    let press: ((key: string) => void) | undefined;
    const io = {
      write: (text: string) => { frames.push(text); },
      isTTY: true,
      clear: () => {},
      setRawMode: () => {},
      sleep: async () => {},
      onKey: (handler: (key: string) => void) => { press = handler; return () => { press = undefined; }; },
    };
    const run = runTerminalApp({
      argv: ["--no-intro"], cwd: "/repo", io,
      project: () => buildHomeScreen(state()),
      settings: { read: () => [], apply: () => true },
      sessions: () => [],
      system: () => [],
    });
    expect(frames.join("")).not.toContain(TAGLINE);
    press?.("q");
    expect(await run).toBe(0);
  });

  test("the intro plays before the first screen and is bounded", async () => {
    const sleeps: number[] = [];
    let press: ((key: string) => void) | undefined;
    const written: string[] = [];
    const io = {
      write: (text: string) => { written.push(text); },
      isTTY: true,
      columns: 100,
      clear: () => {},
      setRawMode: () => {},
      sleep: async (ms: number) => { sleeps.push(ms); },
      onKey: (handler: (key: string) => void) => { press = handler; return () => { press = undefined; }; },
    };
    const run = runTerminalApp({
      argv: [], cwd: "/repo", io,
      project: () => buildHomeScreen(state()),
      settings: { read: () => [], apply: () => true },
      sessions: () => [],
      system: () => [],
    });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(written.join("")).toContain(TAGLINE);
    // Bounded: one sleep per drawn frame plus the settle pause.
    expect(sleeps.length).toBeLessThanOrEqual(frameCount(100));
    press?.("q");
    expect(await run).toBe(0);
  });
});

describe("isolated agent home", () => {
  const probe = (env: Record<string, string | undefined>, existing: string[]) => ({
    env,
    home: "/home/tester",
    exists: (path: string) => existing.includes(path),
  });

  test("an explicit environment wins over discovery", () => {
    expect(resolveEinAgentHome(probe({ EIN_PI_AGENT_HOME: "/declared" }, ["/home/tester/.pi-ein/agent"])))
      .toBe("/declared");
  });

  test("the isolated home is found when no launcher declared one", () => {
    expect(resolveEinAgentHome(probe({}, ["/home/tester/.pi-ein/agent"])))
      .toBe("/home/tester/.pi-ein/agent");
  });

  test("vanilla ~/.pi/agent is never assumed: those sessions are not Ein's", () => {
    expect(resolveEinAgentHome(probe({}, ["/home/tester/.pi/agent"]))).toBeUndefined();
  });
});

describe("system view", () => {
  test("an available update names the component and its exact command", () => {
    const rows = systemRowsFrom([
      { source: "ein", status: "update-available", reason: "newer-release", freshness: "current" },
    ]);
    const ein = rows.find((row) => row.label === "Ein");
    expect(ein?.status).toBe("update available");
    expect(ein?.command).toBe("ein-install update");
  });

  test("a component with no evidence is unknown, not healthy", () => {
    const rows = systemRowsFrom([]);
    expect(rows.find((row) => row.label === "Ein")?.status).toBeUndefined();
  });

  test("diagnostics are offered as a command, never run by the app", () => {
    const diagnostics = systemRowsFrom([]).find((row) => row.label === "Diagnostics");
    expect(diagnostics?.command).toBe("ein-install doctor");
  });

  test("the view renders the command inline and declares its source", () => {
    const lines = renderScreen(buildSystemScreen([
      { label: "Ein", status: "update available", command: "ein-install update" },
      { label: "Pi binary", status: undefined },
    ])).join("\n");
    expect(lines).toContain("run `ein-install update`");
    expect(lines).toContain("[system]");
    expect(lines).toMatch(/Pi binary\s+unknown/);
  });
});
