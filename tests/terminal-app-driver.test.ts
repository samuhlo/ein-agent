// =============================================================================
// EIN TERMINAL APP — driver
// The edge: raw mode, redraws, and every side effect the pure core only asks
// for. Exercised through injected seams, so none of this opens a terminal,
// touches disk, or spawns anything.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
  INSTALLER_COMMAND,
  INSTALLER_VERBS,
  parseTerminalAppArgs,
  runTerminalApp,
  systemComponentsFrom,
  type TerminalAppIO,
  type TerminalAppOptions,
} from "../ein-pi/agent/surfaces/terminal-app-entrypoint.ts";
import { stripAnsi } from "../ein-pi/agent/lib/theme.ts";
import { DASHBOARD_KEYS, type ProjectSummary } from "../ein-pi/agent/lib/terminal-app.ts";

const ENTER = "\r";
const ESCAPE = "\u001b";

const SUMMARY: ProjectSummary = {
  name: "ein-agent",
  root: "/work/ein-agent",
  branch: "main",
  dirty: 0,
  change: "terminal-app-rework",
  phase: "apply",
  next: "verify",
  activeChanges: ["terminal-app-rework"],
  blockers: [],
  sessions: 2,
};

type Harness = {
  io: TerminalAppIO;
  written: string[];
  raw: boolean[];
  clears: number;
  altScreen: boolean[];
  send: (key: string) => void;
  listening: () => boolean;
};

function harness(options: { isTTY?: boolean; columns?: number; keys?: boolean } = {}): Harness {
  const written: string[] = [];
  const raw: boolean[] = [];
  const altScreen: boolean[] = [];
  let handler: ((key: string) => void) | undefined;
  let clears = 0;
  const io: TerminalAppIO = {
    write: (text) => { written.push(text); },
    isTTY: options.isTTY ?? true,
    columns: options.columns ?? 100,
    rows: 40,
    env: { NO_COLOR: "1" },
    setRawMode: (value) => { raw.push(value); },
    clear: () => { clears++; },
    setAltScreen: (value) => { altScreen.push(value); },
    sleep: async () => undefined,
    ...(options.keys === false ? {} : {
      onKey: (fn: (key: string) => void) => {
        handler = fn;
        return () => { handler = undefined; };
      },
    }),
  };
  return {
    io,
    written,
    raw,
    get clears() { return clears; },
    altScreen,
    send: (key) => handler?.(key),
    listening: () => handler !== undefined,
  } as Harness;
}

function seams(overrides: Partial<TerminalAppOptions> = {}): TerminalAppOptions {
  return {
    argv: ["--no-intro"],
    cwd: "/work/ein-agent",
    io: harness().io,
    summary: () => SUMMARY,
    settings: {
      read: () => [{ id: "mode", label: "Modo", options: ["solo", "team"], value: "solo" }],
      apply: () => true,
    },
    sessions: () => ({ entries: [], unavailable: [] }),
    system: () => [],
    runtime: { launch: async () => ({ kind: "exited", code: 0 }) },
    run: async () => 0,
    ...overrides,
  };
}

function output(written: string[]): string {
  return stripAnsi(written.join(""));
}

/** Lets the pending handover settle without a timer. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("arguments", () => {
  test("--help explains usage and exits 0", async () => {
    const h = harness();
    expect(await runTerminalApp(seams({ argv: ["--help"], io: h.io }))).toBe(0);
    expect(output(h.written)).toContain("ein");
  });

  test("an unknown argument is a usage error, not a crash", async () => {
    const h = harness();
    expect(await runTerminalApp(seams({ argv: ["--wat"], io: h.io }))).toBe(2);
  });

  test("--project without a value is a usage error", () => {
    expect(parseTerminalAppArgs(["--project"], "/work")).toMatchObject({ kind: "usage" });
  });

  test("--project selects the root the app works on", () => {
    expect(parseTerminalAppArgs(["--project", "/other"], "/work")).toMatchObject({ cwd: "/other" });
  });

  test("every old installer verb is redirected instead of opening the app", async () => {
    for (const verb of INSTALLER_VERBS) {
      const h = harness();
      expect(await runTerminalApp(seams({ argv: [verb], io: h.io }))).toBe(2);
      expect(output(h.written)).toContain(`${INSTALLER_COMMAND} ${verb}`);
    }
  });

  test("a verb-looking flag is not mistaken for an installer verb", () => {
    expect(parseTerminalAppArgs(["--update"], "/work").kind).toBe("usage");
  });
});

describe("without an interactive terminal", () => {
  test("it paints once, says it is static and never clears", async () => {
    const h = harness({ isTTY: false });
    expect(await runTerminalApp(seams({ io: h.io }))).toBe(0);
    expect(h.clears).toBe(0);
    expect(h.raw).toHaveLength(0);
    expect(output(h.written)).toContain("ein-agent");
  });

  test("no escape sequence reaches a pipe", async () => {
    const h = harness({ isTTY: false });
    await runTerminalApp(seams({ io: h.io }));
    expect(h.written.join("")).not.toContain("\u001b");
  });

  test("--once stays static even on a terminal", async () => {
    const h = harness();
    expect(await runTerminalApp(seams({ argv: ["--once"], io: h.io }))).toBe(0);
    expect(h.raw).toHaveLength(0);
  });

  test("a terminal that cannot deliver keys degrades instead of hanging", async () => {
    const h = harness({ keys: false });
    expect(await runTerminalApp(seams({ io: h.io }))).toBe(0);
  });
});

describe("the interactive loop", () => {
  test("it takes the alternate screen and gives it back on quit", async () => {
    const h = harness();
    const run = runTerminalApp(seams({ io: h.io }));
    h.send("q");
    expect(await run).toBe(0);
    expect(h.altScreen).toEqual([true, false]);
    expect(h.raw).toEqual([true, false]);
    expect(h.listening()).toBe(false);
  });

  test("a key redraws the screen", async () => {
    const h = harness();
    const run = runTerminalApp(seams({ io: h.io }));
    const before = h.written.length;
    h.send("j");
    expect(h.written.length).toBeGreaterThan(before);
    h.send("q");
    await run;
  });

  test("r rebuilds the view in place, keeping the cursor", async () => {
    let status = "unknown";
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      // Update probes finish after the first paint; the view has to be able to
      // pick that up without leaving and coming back.
      system: () => [
        { id: "ein", label: "Ein", status: undefined },
        { id: "binary", label: "Pi", status },
      ],
    }));
    h.send(DASHBOARD_KEYS.system);
    h.send("j");
    status = "update-available";
    h.send("r");
    const frames = output(h.written).split("EIN · Sistema");
    expect(frames.at(-1)).toContain("actualización disponible");
    // The cursor stayed on the row the user had selected, not back at the top.
    expect(frames.at(-1)).toContain("▌ Pi");
    h.send("q");
    await run;
  });

  test("opening a view and coming back both paint", async () => {
    const h = harness();
    const run = runTerminalApp(seams({ io: h.io }));
    h.send(DASHBOARD_KEYS.config);
    expect(output(h.written)).toContain("Modo");
    h.send(ESCAPE);
    h.send("q");
    await run;
  });
});

describe("configuration writes through its owner", () => {
  test("a change is persisted and the screen re-reads from disk", async () => {
    const applied: string[] = [];
    let value = "solo";
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      settings: {
        read: () => [{ id: "mode", label: "Modo", options: ["solo", "team"], value }],
        apply: (_cwd, id, next) => { applied.push(`${id}=${next}`); value = next; return true; },
      },
    }));
    h.send(DASHBOARD_KEYS.config);
    h.send(ENTER);
    expect(applied).toEqual(["mode=team"]);
    expect(output(h.written)).toContain("team");
    h.send("q");
    await run;
  });

  test("a refused write is reported and leaves the value alone", async () => {
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      settings: {
        read: () => [{ id: "mode", label: "Modo", options: ["solo", "team"], value: "solo" }],
        apply: () => false,
      },
    }));
    h.send(DASHBOARD_KEYS.config);
    h.send(ENTER);
    expect(output(h.written).toLowerCase()).toContain("no se pudo");
    h.send("q");
    await run;
  });
});

describe("handing the terminal to a runtime", () => {
  test("launching leaves raw mode, stops listening and exits with the runtime's code", async () => {
    const h = harness();
    const launched: unknown[] = [];
    const run = runTerminalApp(seams({
      io: h.io,
      runtime: {
        launch: async (provider, reference) => {
          launched.push({ provider, reference });
          return { kind: "exited", code: 7 };
        },
      },
    }));
    h.send(DASHBOARD_KEYS.pi);
    expect(await run).toBe(7);
    expect(launched).toEqual([{ provider: "pi", reference: undefined }]);
    // Taken once and given back once: asking a terminal for a state it is
    // already in leaks escape sequences into whatever runs next.
    expect(h.altScreen).toEqual([true, false]);
    expect(h.raw).toEqual([true, false]);
  });

  test("resuming passes the reference of the chosen session", async () => {
    const launched: unknown[] = [];
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      sessions: () => ({
        entries: [{ provider: "claude", reference: "claude:v1:sha256:x", modifiedAtMs: 1, age: "2h", lastAction: "seguir" }],
        unavailable: [],
      }),
      runtime: {
        launch: async (provider, reference) => {
          launched.push({ provider, reference });
          return { kind: "exited", code: 0 };
        },
      },
    }));
    h.send(DASHBOARD_KEYS.sessions);
    h.send(ENTER);
    expect(await run).toBe(0);
    expect(launched).toEqual([{ provider: "claude", reference: "claude:v1:sha256:x" }]);
  });

  test("a runtime that is not installed is named, and the app stays alive", async () => {
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      runtime: { launch: async () => ({ kind: "unavailable", reason: "executable-unavailable" }) },
    }));
    h.send(DASHBOARD_KEYS.pi);
    // The handover is asynchronous: the app comes back on the next turn of the
    // loop, not inside the keypress.
    await tick();
    const shown = output(h.written).toLowerCase();
    expect(shown).toContain("pi no está disponible");
    expect(shown).toContain("executable-unavailable");
    expect(h.listening()).toBe(true);
    // Given back for the runtime, taken again when it turned out not to exist.
    expect(h.altScreen).toEqual([true, false, true]);
    h.send("q");
    expect(await run).toBe(0);
  });

  test("a launch that throws does not hang the app", async () => {
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      runtime: { launch: async () => { throw new Error("boom"); } },
    }));
    h.send(DASHBOARD_KEYS.pi);
    expect(await run).toBe(1);
  });
});

describe("running a system command", () => {
  test("it runs only after a confirmation, and runs the declared command", async () => {
    const ran: string[][] = [];
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      system: () => [
        { id: "ein", label: "Ein", status: "update-available", command: ["ein-install", "update"] },
      ],
      run: async (command) => { ran.push([...command]); return 0; },
    }));
    h.send(DASHBOARD_KEYS.system);
    h.send(ENTER);
    expect(ran).toHaveLength(0);
    h.send(ENTER);
    expect(await run).toBe(0);
    expect(ran).toEqual([["ein-install", "update"]]);
  });

  test("cancelling runs nothing", async () => {
    const ran: string[][] = [];
    const h = harness();
    const run = runTerminalApp(seams({
      io: h.io,
      system: () => [
        { id: "ein", label: "Ein", status: "update-available", command: ["ein-install", "update"] },
      ],
      run: async (command) => { ran.push([...command]); return 0; },
    }));
    h.send(DASHBOARD_KEYS.system);
    h.send(ENTER);
    h.send("j");
    expect(ran).toHaveLength(0);
    h.send("q");
    expect(await run).toBe(0);
  });
});

describe("the system component list", () => {
  const observations = [
    { source: "ein", status: "update-available", freshness: "current" },
    { source: "binary", status: "current", freshness: "current" },
  ];

  test("an available update names the component and its exact command", () => {
    const components = systemComponentsFrom(observations, { engramInstalled: true });
    const ein = components.find((component) => component.id === "ein");
    expect(ein?.status).toBe("update-available");
    expect(ein?.command).toEqual(["ein-install", "update"]);
  });

  test("a component with no evidence is unknown, never healthy", () => {
    const claude = systemComponentsFrom(observations, { engramInstalled: true })
      .find((component) => component.id === "claude");
    expect(claude?.status).toBeUndefined();
  });

  test("a component that is up to date offers nothing to run", () => {
    const binary = systemComponentsFrom(observations, { engramInstalled: true })
      .find((component) => component.id === "binary");
    expect(binary?.command).toBeUndefined();
  });

  test("diagnostics are offered as a command the user confirms", () => {
    const diagnostics = systemComponentsFrom([], { engramInstalled: true })
      .find((component) => component.id === "doctor");
    expect(diagnostics?.command).toEqual(["ein-install", "doctor"]);
  });

  test("Engram is reported as the component it is, not as a project switch", () => {
    expect(systemComponentsFrom([], { engramInstalled: false }).find((c) => c.id === "engram")?.status)
      .toBe("no instalado");
    expect(systemComponentsFrom([], { engramInstalled: true }).find((c) => c.id === "engram")?.command)
      .toBeUndefined();
  });

  test("every command is a literal argv, never a shell string", () => {
    for (const component of systemComponentsFrom(observations, { engramInstalled: true })) {
      for (const argument of component.command ?? []) {
        expect(argument).not.toContain(" ");
        expect(argument).not.toContain(";");
      }
    }
  });
});
