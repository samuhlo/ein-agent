// =============================================================================
// [CORE] EIN TERMINAL APP — screen model, rendering and key handling
// Pure: no terminal, no filesystem, no process. The driver at the edge owns raw
// mode and redraws; everything here is a function of state and keystrokes, so
// navigation is testable without a TTY.
// =============================================================================

import type { ProjectStateV1 } from "./project-state.ts";

/** Where a row's content came from. Shown so the app never looks authoritative. */
export type RowSource = "openspec" | "git" | "ein.md" | "config" | "session" | "app";

export type Row = Readonly<{
  label: string;
  /** `undefined` means unknown, which is rendered differently from empty. */
  value: string | undefined;
  source: RowSource;
  /** Rows that do nothing yet are still shown; selecting them says so. */
  actionable?: boolean;
}>;

export type Section = Readonly<{ title: string; rows: readonly Row[] }>;

/** One project setting the config view can cycle through. */
export type Setting = Readonly<{
  id: string;
  label: string;
  /** Allowed values, in cycling order. */
  options: readonly string[];
  /** `undefined` when the setting could not be read; never guessed. */
  value: string | undefined;
}>;

export type ScreenKind = "home" | "config" | "sessions";

export type Screen = Readonly<{
  kind: ScreenKind;
  title: string;
  sections: readonly Section[];
  /** Active filter, empty when not searching. */
  query: string;
  searching: boolean;
  cursor: number;
  /** Present on the config view only; the home view has nothing to cycle. */
  settings?: readonly Setting[];
}>;

export const UNKNOWN_VALUE = "unknown";
export const EMPTY_VALUE = "—";

// ─── Screen construction ─────────────────────────────────────────────────────

function gitStatusValue(dirty: boolean | null | undefined): string | undefined {
  return dirty === true ? "dirty" : dirty === false ? "clean" : undefined;
}

/**
 * Builds the home screen from the projected state. Every row declares its
 * source, and a missing fact stays `undefined` so rendering can tell "we do not
 * know" apart from "there is nothing".
 */
export function buildHomeScreen(state: ProjectStateV1): Screen {
  const openspec: Row[] = [
    { label: "Change", value: state.openspec.selectedChange, source: "openspec" },
    { label: "Selection", value: state.openspec.selection, source: "openspec" },
    { label: "Phase", value: state.openspec.phase, source: "openspec" },
    { label: "Next", value: state.openspec.next, source: "openspec" },
    {
      label: "Active changes",
      value: state.openspec.activeChanges.length ? state.openspec.activeChanges.join(", ") : "",
      source: "openspec",
    },
    {
      label: "Blockers",
      value: state.openspec.blockers.length ? state.openspec.blockers.join("; ") : "",
      source: "openspec",
    },
  ];

  const git: Row[] = [
    { label: "Worktree", value: gitStatusValue(state.git.dirty), source: "git" },
    { label: "State ref", value: state.git.stateRef, source: "git" },
  ];

  const verification: Row[] = [
    { label: "Outcome", value: state.verification.effectiveOutcome, source: "openspec" },
    { label: "Freshness", value: state.verification.freshness, source: "openspec" },
  ];

  const project: Row[] = [
    { label: "Root", value: state.identity.repositoryRoot ?? state.identity.cwd, source: "git" },
    { label: "EIN.md", value: state.ein.path, source: "ein.md" },
    { label: "EIN.md revision", value: state.ein.revision, source: "ein.md" },
  ];

  return Object.freeze({
    kind: "home",
    title: "Ein — state",
    query: "",
    searching: false,
    cursor: 0,
    sections: Object.freeze([
      Object.freeze({ title: "Project", rows: Object.freeze(project) }),
      Object.freeze({ title: "OpenSpec", rows: Object.freeze(openspec) }),
      Object.freeze({ title: "Verification", rows: Object.freeze(verification) }),
      Object.freeze({ title: "Git", rows: Object.freeze(git) }),
    ]),
  });
}

/**
 * Config view. Values come from the settings the driver read; the screen never
 * touches disk, so cycling is a pure transition the driver then persists.
 */
export function buildConfigScreen(settings: readonly Setting[]): Screen {
  return Object.freeze({
    kind: "config",
    title: "Ein — configuration",
    query: "",
    searching: false,
    cursor: 0,
    settings: Object.freeze([...settings]),
    sections: Object.freeze([
      Object.freeze({
        title: "Project settings",
        rows: Object.freeze(settings.map((setting) => ({
          label: setting.label,
          value: setting.value,
          source: "config" as const,
          actionable: true,
        }))),
      }),
    ]),
  });
}

/** Next value in the cycle; stays put when the current one is unknown. */
export function nextSettingValue(setting: Setting): string | undefined {
  if (setting.options.length === 0) return undefined;
  if (setting.value === undefined) return setting.options[0];
  const index = setting.options.indexOf(setting.value);
  return index === -1 ? setting.options[0] : setting.options[(index + 1) % setting.options.length];
}

export type SessionRow = Readonly<{
  id: string;
  project: string;
  age: string;
  lastAction: string | undefined;
}>;

/**
 * Sessions view. Shows what the human last asked in each session, which is what
 * makes one recognizable; transcripts stay private and are never rendered.
 */
export function buildSessionsScreen(sessions: readonly SessionRow[]): Screen {
  const rows: Row[] = sessions.map((session) => ({
    label: session.age,
    value: session.lastAction,
    source: "session" as const,
  }));
  return Object.freeze({
    kind: "sessions",
    title: "Ein — recent sessions",
    query: "",
    searching: false,
    cursor: 0,
    sections: Object.freeze([
      Object.freeze({
        title: rows.length ? "Recent sessions" : "Recent sessions (none found)",
        rows: Object.freeze(rows),
      }),
    ]),
  });
}

// ─── Filtering and cursor ────────────────────────────────────────────────────

/** Flattened rows the cursor can land on, after the active filter. */
export function visibleRows(screen: Screen): readonly Readonly<{ section: string; row: Row }>[] {
  const needle = screen.query.trim().toLowerCase();
  const flat = screen.sections.flatMap((section) =>
    section.rows.map((row) => ({ section: section.title, row })),
  );
  if (!needle) return flat;
  return flat.filter(({ section, row }) =>
    `${section} ${row.label} ${row.value ?? UNKNOWN_VALUE}`.toLowerCase().includes(needle),
  );
}

function clampCursor(screen: Screen, cursor: number): number {
  const total = visibleRows(screen).length;
  if (total === 0) return 0;
  return Math.min(Math.max(0, cursor), total - 1);
}

// ─── Key handling ────────────────────────────────────────────────────────────

export type AppEffect =
  | { kind: "none" }
  | { kind: "quit" }
  | { kind: "switch-view" }
  /** The driver persists it: writing is I/O and stays at the edge. */
  | { kind: "apply"; settingId: string; value: string }
  | { kind: "status"; message: string };

export type KeyOutcome = Readonly<{ screen: Screen; effect: AppEffect }>;

const ARROW_DOWN = "\u001b[B";
const ARROW_UP = "\u001b[A";
const ENTER = "\r";
const ESCAPE = "\u001b";
const BACKSPACE = "\u007f";
const CTRL_C = "\u0003";
const TAB = "\t";

function withCursor(screen: Screen, cursor: number): Screen {
  return Object.freeze({ ...screen, cursor: clampCursor(screen, cursor) });
}

/**
 * Maps one keystroke to the next screen. Arrows and the LazyVim letters lead to
 * the same place by construction: both funnel into the same cursor moves.
 */
export function handleKey(screen: Screen, key: string): KeyOutcome {
  const none: AppEffect = { kind: "none" };

  if (screen.searching) {
    if (key === ESCAPE) {
      return { screen: withCursor(Object.freeze({ ...screen, searching: false, query: "" }), screen.cursor), effect: none };
    }
    if (key === ENTER) {
      return { screen: Object.freeze({ ...screen, searching: false }), effect: none };
    }
    if (key === BACKSPACE) {
      const query = screen.query.slice(0, -1);
      return { screen: withCursor(Object.freeze({ ...screen, query }), screen.cursor), effect: none };
    }
    if (key === CTRL_C) return { screen, effect: { kind: "quit" } };
    // Printable characters extend the query; control sequences are ignored.
    if (key.length === 1 && key >= " ") {
      const query = screen.query + key;
      return { screen: withCursor(Object.freeze({ ...screen, query }), screen.cursor), effect: none };
    }
    return { screen, effect: none };
  }

  if (key === "q" || key === CTRL_C) return { screen, effect: { kind: "quit" } };
  if (key === TAB || key === "c") return { screen, effect: { kind: "switch-view" } };
  if (key === "f" || key === "/") {
    return { screen: Object.freeze({ ...screen, searching: true, query: "" }), effect: none };
  }
  if (key === "j" || key === ARROW_DOWN) return { screen: withCursor(screen, screen.cursor + 1), effect: none };
  if (key === "k" || key === ARROW_UP) return { screen: withCursor(screen, screen.cursor - 1), effect: none };
  if (key === "g") return { screen: withCursor(screen, 0), effect: none };
  if (key === "G") return { screen: withCursor(screen, visibleRows(screen).length - 1), effect: none };
  if (key === ESCAPE && screen.query) {
    return { screen: withCursor(Object.freeze({ ...screen, query: "" }), screen.cursor), effect: none };
  }
  if (key === ENTER || key === " ") {
    const selected = visibleRows(screen)[screen.cursor];
    if (!selected) return { screen, effect: { kind: "status", message: "Nothing selected" } };
    if (screen.kind === "config") {
      const setting = screen.settings?.find((item) => item.label === selected.row.label);
      const value = setting ? nextSettingValue(setting) : undefined;
      if (!setting || value === undefined) {
        return { screen, effect: { kind: "status", message: `${selected.row.label} — no values to cycle` } };
      }
      return { screen, effect: { kind: "apply", settingId: setting.id, value } };
    }
    // Read-only in this slice: selecting states what the row is, never mutates.
    return {
      screen,
      effect: { kind: "status", message: `${selected.row.label} — read-only in this view (source: ${selected.row.source})` },
    };
  }
  return { screen, effect: none };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export const KEY_HINTS = "j/k or ↑/↓ move · f search · enter inspect · tab config · q quit";
export const CONFIG_KEY_HINTS = "j/k or ↑/↓ move · f search · enter/space cycle · tab sessions · q quit";
export const SESSIONS_KEY_HINTS = "j/k or ↑/↓ move · f search · tab state · q quit";

function hintsFor(kind: ScreenKind): string {
  if (kind === "config") return CONFIG_KEY_HINTS;
  return kind === "sessions" ? SESSIONS_KEY_HINTS : KEY_HINTS;
}

function renderValue(row: Row): string {
  if (row.value === undefined) return UNKNOWN_VALUE;
  return row.value === "" ? EMPTY_VALUE : row.value;
}

/**
 * Renders the screen as plain lines. No cursor addressing or colour: the driver
 * decides how to paint them, and a dumb terminal still gets readable output.
 */
export function renderScreen(screen: Screen): readonly string[] {
  const rows = visibleRows(screen);
  const lines: string[] = [screen.title, ""];

  if (screen.searching || screen.query) {
    lines.push(`Search: ${screen.query}${screen.searching ? "_" : ""}`, "");
  }

  if (rows.length === 0) {
    // An active filter that matches nothing is a different fact from a view
    // that has nothing to show; saying "no match" when nothing was searched
    // sends the reader looking for a filter that is not there.
    const empty = screen.query.trim()
      ? "No rows match the search."
      : screen.sections.map((section) => section.title).join(" · ") || "Nothing to show.";
    lines.push(empty, "", hintsFor(screen.kind));
    return Object.freeze(lines);
  }

  const width = Math.max(...rows.map(({ row }) => row.label.length));
  let currentSection = "";
  rows.forEach(({ section, row }, index) => {
    if (section !== currentSection) {
      if (currentSection) lines.push("");
      lines.push(`${section}`);
      currentSection = section;
    }
    const marker = index === screen.cursor ? ">" : " ";
    lines.push(`${marker} ${row.label.padEnd(width)}  ${renderValue(row)}  [${row.source}]`);
  });

  lines.push("", hintsFor(screen.kind));
  return Object.freeze(lines);
}
