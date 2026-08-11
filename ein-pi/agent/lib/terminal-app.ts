// =============================================================================
// [CORE] EIN TERMINAL APP — model, key handling and rendering
// Pure: no terminal, no filesystem, no process. The driver at the edge owns raw
// mode, redraws and every side effect; everything here is a function of state
// and keystrokes, which is what makes the whole app testable without a TTY.
//
// Shape of the thing: a dashboard is the centre, four views hang off it, and
// every row carries the action it performs. A row that could not do anything is
// not built, so nothing on screen can answer "read-only".
// =============================================================================

import { pick } from "./lang.ts";
import type { RuntimeProvider } from "./runtime-session-adapters.ts";
import {
  center,
  fit,
  padVisible,
  visibleWidth,
  type Palette,
} from "./theme.ts";

export const UNKNOWN_VALUE = pick("desconocido", "unknown");
export const EMPTY_VALUE = "—";

// ─── model ───────────────────────────────────────────────────────────────────

export type ViewKind = "dashboard" | "state" | "config" | "sessions" | "system";

/** What pressing enter on a row does. There is no "nothing" case on purpose. */
export type RowAction =
  | { kind: "open-view"; view: ViewKind }
  | { kind: "launch"; provider: RuntimeProvider; reference?: string }
  | { kind: "session"; provider: RuntimeProvider; reference: string }
  | { kind: "setting"; settingId: string }
  | { kind: "focus-change"; change: string }
  | { kind: "command"; command: readonly string[] }
  | { kind: "fact" }
  | { kind: "quit" };

export type RowTone = "normal" | "muted" | "ok" | "warn" | "danger";

export type Row = Readonly<{
  label: string;
  /**
   * Three states, and the difference matters on screen: the key absent means
   * the row has no value column at all (an action), `undefined` means the fact
   * could not be read, and `""` means it was read and is empty.
   */
  value?: string;
  /** Dim trailing note: what the row decides, or why it cannot act. */
  note?: string;
  /** Decorative glyph, single column by construction. */
  icon?: string;
  /** Direct key on the dashboard; elsewhere absent. */
  key?: string;
  tone?: RowTone;
  action: RowAction;
}>;

export type Section = Readonly<{ title?: string; rows: readonly Row[] }>;

export type View = Readonly<{
  kind: ViewKind;
  title: string;
  /** Where the screen's facts come from, stated once instead of per row. */
  source?: string;
  sections: readonly Section[];
  notes?: readonly string[];
  /** Config view only: the option lists cycling needs. */
  settings?: readonly Setting[];
}>;

/** One project setting the config view can cycle through. */
export type Setting = Readonly<{
  id: string;
  label: string;
  /** Allowed values, in cycling order. */
  options: readonly string[];
  /** `undefined` when the setting could not be read; never guessed. */
  value: string | undefined;
  hint?: string;
  /** Human names per stored token. The file on disk keeps the token. */
  labels?: Readonly<Record<string, string>>;
}>;

export type ProjectSummary = Readonly<{
  name: string;
  root: string;
  branch: string | undefined;
  /** Count of uncommitted changes; `undefined` when git could not be read. */
  dirty: number | undefined;
  change: string | undefined;
  phase: string | undefined;
  next: string | undefined;
  activeChanges: readonly string[];
  blockers: readonly string[];
  sessions: number | undefined;
}>;

export type SessionEntry = Readonly<{
  provider: RuntimeProvider;
  reference: string;
  age: string;
  lastAction: string | undefined;
}>;

export type SessionGap = Readonly<{ provider: RuntimeProvider; reason: string }>;

export type SystemComponent = Readonly<{
  id: string;
  label: string;
  status: string | undefined;
  detail?: string;
  /** Present only when there is something safe and exact to run. */
  command?: readonly string[];
}>;

export type PendingCommand = Readonly<{ command: readonly string[]; label: string }>;

export type AppModel = Readonly<{
  summary: ProjectSummary;
  view: View;
  cursor: number;
  query: string;
  searching: boolean;
  status: string;
  /** A command waiting for its second keystroke. Any other key drops it. */
  pending?: PendingCommand;
}>;

export const RUNTIME_LABEL: Readonly<Record<RuntimeProvider, string>> = {
  pi: "Pi",
  claude: "Claude Code",
};

/**
 * Geometric glyphs only. Nerd-font icons read better but measure two columns in
 * some terminals and one in others, which silently breaks every centred line.
 */
const ICON = {
  sessions: "▸",
  pi: "◆",
  claude: "◇",
  state: "▪",
  config: "○",
  system: "▴",
  quit: "✕",
} as const;

/**
 * Direct keys on the dashboard. None of them may collide with a global motion
 * (`j k g G f h l q`) — a hotkey that also means "jump to top" is a hotkey that
 * works everywhere except where the user is looking. Pinned by a test.
 */
export const DASHBOARD_KEYS = {
  sessions: "s",
  pi: "p",
  claude: "c",
  state: "e",
  config: "o",
  system: "u",
  quit: "q",
} as const;

/** Keys the app answers itself, before any view gets a say. */
export const RESERVED_KEYS: readonly string[] = ["j", "k", "g", "G", "f", "h", "l", "r", "/"];

// ─── views ───────────────────────────────────────────────────────────────────

export function buildDashboard(summary: ProjectSummary): View {
  const rows: Row[] = [
    {
      label: pick("Continuar una sesión", "Continue a session"),
      icon: ICON.sessions,
      key: DASHBOARD_KEYS.sessions,
      action: { kind: "open-view", view: "sessions" },
    },
    {
      label: pick("Arrancar Pi", "Start Pi"),
      icon: ICON.pi,
      key: DASHBOARD_KEYS.pi,
      action: { kind: "launch", provider: "pi" },
    },
    {
      label: pick("Arrancar Claude Code", "Start Claude Code"),
      icon: ICON.claude,
      key: DASHBOARD_KEYS.claude,
      action: { kind: "launch", provider: "claude" },
    },
    {
      label: pick("Estado del proyecto", "Project state"),
      icon: ICON.state,
      key: DASHBOARD_KEYS.state,
      action: { kind: "open-view", view: "state" },
    },
    {
      label: pick("Configuración", "Configuration"),
      icon: ICON.config,
      key: DASHBOARD_KEYS.config,
      action: { kind: "open-view", view: "config" },
    },
    {
      label: pick("Sistema y actualizaciones", "System and updates"),
      icon: ICON.system,
      key: DASHBOARD_KEYS.system,
      action: { kind: "open-view", view: "system" },
    },
    {
      label: pick("Salir", "Quit"),
      icon: ICON.quit,
      key: DASHBOARD_KEYS.quit,
      action: { kind: "quit" },
    },
  ];
  return Object.freeze({
    kind: "dashboard",
    title: "Ein",
    sections: Object.freeze([Object.freeze({ rows: Object.freeze(rows) })]),
  });
}

function dirtyValue(dirty: number | undefined): string | undefined {
  if (dirty === undefined) return undefined;
  return dirty === 0
    ? pick("limpio", "clean")
    : pick(`${dirty} sin confirmar`, `${dirty} uncommitted`);
}

export function buildStateView(summary: ProjectSummary): View {
  const project: Row[] = [
    { label: pick("Proyecto", "Project"), value: summary.name, action: { kind: "fact" } },
    { label: pick("Ruta", "Path"), value: summary.root, action: { kind: "fact" } },
    { label: pick("Rama", "Branch"), value: summary.branch, action: { kind: "fact" } },
    {
      label: pick("Árbol de trabajo", "Worktree"),
      value: dirtyValue(summary.dirty),
      tone: summary.dirty ? "warn" : "normal",
      action: { kind: "fact" },
    },
  ];

  const sdd: Row[] = [
    { label: pick("Cambio en curso", "Change in progress"), value: summary.change, action: { kind: "fact" } },
    { label: pick("Fase", "Phase"), value: summary.phase, action: { kind: "fact" } },
    { label: pick("Siguiente paso", "Next step"), value: summary.next, action: { kind: "fact" } },
    {
      label: pick("Bloqueos", "Blockers"),
      value: summary.blockers.length ? summary.blockers.join(" · ") : "",
      tone: summary.blockers.length ? "danger" : "normal",
      action: { kind: "fact" },
    },
  ];

  const changes: Row[] = summary.activeChanges.map((change) => ({
    label: change,
    value: change === summary.change ? pick("en curso", "in progress") : "",
    note: pick("enter enfoca este cambio", "enter focuses this change"),
    action: { kind: "focus-change", change },
  }));

  const sections: Section[] = [
    { title: pick("PROYECTO", "PROJECT"), rows: Object.freeze(project) },
    { title: "SDD", rows: Object.freeze(sdd) },
  ];
  if (changes.length) {
    sections.push({ title: pick("CAMBIOS ABIERTOS", "OPEN CHANGES"), rows: Object.freeze(changes) });
  }

  return Object.freeze({
    kind: "state",
    title: pick("Estado", "State"),
    source: pick("openspec + git", "openspec + git"),
    sections: Object.freeze(sections),
  });
}

function settingText(setting: Setting, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return setting.labels?.[value] ?? value;
}

export function buildConfigView(settings: readonly Setting[]): View {
  const rows: Row[] = settings.map((setting) => {
    // The whole cycle is spelled out on the selected row: otherwise the only
    // way to learn a setting's options is to press enter until they repeat.
    const cycle = setting.options.map((option) => settingText(setting, option)).join(" · ");
    return {
      label: setting.label,
      value: settingText(setting, setting.value),
      note: setting.hint ? `${cycle} — ${setting.hint}` : cycle,
      action: { kind: "setting", settingId: setting.id },
    };
  });
  return Object.freeze({
    kind: "config",
    title: pick("Configuración", "Configuration"),
    source: pick("ajustes del proyecto", "project settings"),
    settings: Object.freeze([...settings]),
    notes: Object.freeze([
      pick(
        "Cada cambio se escribe en el fichero que ya posee ese ajuste.",
        "Each change is written by whichever module already owns that setting.",
      ),
    ]),
    sections: Object.freeze([Object.freeze({ rows: Object.freeze(rows) })]),
  });
}

export function buildSessionsView(
  sessions: readonly SessionEntry[],
  gaps: readonly SessionGap[],
): View {
  const rows: Row[] = sessions.map((session) => ({
    label: `${RUNTIME_LABEL[session.provider]}  ${session.age}`,
    icon: session.provider === "pi" ? ICON.pi : ICON.claude,
    value: session.lastAction,
    action: { kind: "session", provider: session.provider, reference: session.reference },
  }));

  const start: Row[] = [
    {
      label: pick("Nueva sesión de Pi", "New Pi session"),
      icon: ICON.pi,
      action: { kind: "launch", provider: "pi" },
    },
    {
      label: pick("Nueva sesión de Claude Code", "New Claude Code session"),
      icon: ICON.claude,
      action: { kind: "launch", provider: "claude" },
    },
  ];

  const notes = gaps.map((gap) =>
    pick(
      `${RUNTIME_LABEL[gap.provider]}: sin store legible en esta máquina.`,
      `${RUNTIME_LABEL[gap.provider]}: no readable store on this machine.`,
    ),
  );

  const sections: Section[] = [];
  if (rows.length) {
    sections.push({ title: pick("RECIENTES", "RECENT"), rows: Object.freeze(rows) });
  }
  sections.push({ title: pick("EMPEZAR", "START"), rows: Object.freeze(start) });

  return Object.freeze({
    kind: "sessions",
    title: pick("Sesiones", "Sessions"),
    source: pick("stores de Pi y Claude Code", "Pi and Claude Code stores"),
    notes: Object.freeze(
      rows.length
        ? notes
        : [...notes, pick("Ninguna sesión previa en este proyecto.", "No previous session in this project.")],
    ),
    sections: Object.freeze(sections),
  });
}

function componentTone(status: string | undefined): RowTone {
  if (status === "update-available") return "warn";
  if (status === "current") return "ok";
  return "normal";
}

function componentValue(component: SystemComponent): string | undefined {
  if (component.status === undefined) return undefined;
  const label =
    component.status === "update-available"
      ? pick("actualización disponible", "update available")
      : component.status === "current"
        ? pick("al día", "up to date")
        : component.status;
  return component.detail ? `${label} · ${component.detail}` : label;
}

export function buildSystemView(components: readonly SystemComponent[]): View {
  const rows: Row[] = components.map((component) => ({
    label: component.label,
    value: componentValue(component),
    note: component.command
      ? pick(`enter ejecuta \`${component.command.join(" ")}\``, `enter runs \`${component.command.join(" ")}\``)
      : undefined,
    tone: componentTone(component.status),
    action: component.command ? { kind: "command", command: component.command } : { kind: "fact" },
  }));
  return Object.freeze({
    kind: "system",
    title: pick("Sistema", "System"),
    source: pick("sondas de versión", "version probes"),
    sections: Object.freeze([Object.freeze({ rows: Object.freeze(rows) })]),
  });
}

export function initialModel(summary: ProjectSummary, view = buildDashboard(summary)): AppModel {
  return Object.freeze({ summary, view, cursor: 0, query: "", searching: false, status: "" });
}

// ─── setting cycling ─────────────────────────────────────────────────────────

function stepSetting(setting: Setting, step: number): string | undefined {
  if (setting.options.length === 0) return undefined;
  if (setting.value === undefined) return setting.options[0];
  const index = setting.options.indexOf(setting.value);
  if (index === -1) return setting.options[0];
  const size = setting.options.length;
  return setting.options[(index + step + size) % size];
}

/** Next value in the cycle; an unreadable setting starts at the first option. */
export function nextSettingValue(setting: Setting): string | undefined {
  return stepSetting(setting, 1);
}

export function previousSettingValue(setting: Setting): string | undefined {
  return stepSetting(setting, -1);
}

// ─── filtering and cursor ────────────────────────────────────────────────────

export type VisibleRow = Readonly<{ section: string | undefined; row: Row }>;

/** Flattened rows the cursor can land on, after the active filter. */
export function visibleRows(view: View, query: string): readonly VisibleRow[] {
  const needle = query.trim().toLowerCase();
  const flat = view.sections.flatMap((section) =>
    section.rows.map((row) => ({ section: section.title, row })),
  );
  if (!needle) return flat;
  return flat.filter(({ section, row }) =>
    `${section ?? ""} ${row.label} ${row.value ?? UNKNOWN_VALUE} ${row.note ?? ""}`
      .toLowerCase()
      .includes(needle),
  );
}

export function selectedRow(model: AppModel): Row | undefined {
  return visibleRows(model.view, model.query)[model.cursor]?.row;
}

function clampCursor(view: View, query: string, cursor: number): number {
  const total = visibleRows(view, query).length;
  if (total === 0) return 0;
  return Math.min(Math.max(0, cursor), total - 1);
}

// ─── key handling ────────────────────────────────────────────────────────────

export type AppEffect =
  | { kind: "none" }
  | { kind: "quit" }
  | { kind: "open"; view: ViewKind }
  /** Hands the terminal over; the driver leaves raw mode first. */
  | { kind: "launch"; provider: RuntimeProvider; reference?: string }
  /** The driver persists it: writing is I/O and stays at the edge. */
  | { kind: "apply-setting"; settingId: string; value: string }
  | { kind: "focus-change"; change: string }
  /** Confirmed twice, and only ever a command the app itself declared. */
  | { kind: "run"; command: readonly string[] }
  /** Rebuild the current view in place: evidence arrives after the first paint. */
  | { kind: "refresh" }
  | { kind: "status"; message: string };

export type KeyOutcome = Readonly<{ model: AppModel; effect: AppEffect }>;

const ARROW_DOWN = "\u001b[B";
const ARROW_UP = "\u001b[A";
const ARROW_RIGHT = "\u001b[C";
const ARROW_LEFT = "\u001b[D";
const ENTER = "\r";
const NEWLINE = "\n";
const ESCAPE = "\u001b";
const BACKSPACE = "\u007f";
const CTRL_C = "\u0003";
const TAB = "\t";

/**
 * Splits one read from the terminal into individual keys.
 *
 * A terminal usually delivers one key per read, but not always: pasting, a
 * fast typist, or input arriving through a pipe all deliver several at once,
 * and treating that block as a single key makes the app look frozen. Escape
 * sequences must survive the split whole, or every arrow becomes three keys.
 */
export function splitKeys(chunk: string): readonly string[] {
  const keys: string[] = [];
  let index = 0;
  while (index < chunk.length) {
    if (chunk[index] === ESCAPE) {
      const sequence = /^(?:\[[0-9;?]*[A-Za-z~]|O[A-Za-z])/.exec(chunk.slice(index + 1));
      if (sequence) {
        keys.push(ESCAPE + sequence[0]);
        index += sequence[0].length + 1;
        continue;
      }
      keys.push(ESCAPE);
      index += 1;
      continue;
    }
    // Code point, not code unit: an accented character typed into the search
    // box must not arrive as two broken halves.
    const codePoint = String.fromCodePoint(chunk.codePointAt(index)!);
    keys.push(codePoint);
    index += codePoint.length;
  }
  return keys;
}

const VIEW_CYCLE: readonly ViewKind[] = ["dashboard", "sessions", "state", "config", "system"];

function nextView(kind: ViewKind): ViewKind {
  const index = VIEW_CYCLE.indexOf(kind);
  return VIEW_CYCLE[(index + 1) % VIEW_CYCLE.length] ?? "dashboard";
}

function withModel(model: AppModel, patch: Partial<AppModel>): AppModel {
  const merged = { ...model, ...patch };
  return Object.freeze({ ...merged, cursor: clampCursor(merged.view, merged.query, merged.cursor) });
}

function moved(model: AppModel, cursor: number): KeyOutcome {
  // Any movement invalidates a confirmation: the command it named belonged to
  // the row the cursor was on.
  return { model: withModel(model, { cursor, pending: undefined, status: "" }), effect: { kind: "none" } };
}

function statusOutcome(model: AppModel, message: string): KeyOutcome {
  return { model: withModel(model, { status: message, pending: undefined }), effect: { kind: "status", message } };
}

function cycleSetting(model: AppModel, row: Row, step: 1 | -1): KeyOutcome {
  const action = row.action;
  if (action.kind !== "setting") return { model, effect: { kind: "none" } };
  const setting = model.view.settings?.find((item) => item.id === action.settingId);
  const value = setting ? (step === 1 ? nextSettingValue(setting) : previousSettingValue(setting)) : undefined;
  if (!setting || value === undefined) {
    return statusOutcome(model, pick(`${row.label} — sin valores que rotar`, `${row.label} — no values to cycle`));
  }
  return {
    model: withModel(model, { pending: undefined, status: "" }),
    effect: { kind: "apply-setting", settingId: setting.id, value },
  };
}

function activate(model: AppModel, row: Row): KeyOutcome {
  switch (row.action.kind) {
    case "quit":
      return { model, effect: { kind: "quit" } };
    case "open-view":
      return { model, effect: { kind: "open", view: row.action.view } };
    case "launch":
      return { model, effect: { kind: "launch", provider: row.action.provider } };
    case "session":
      return {
        model,
        effect: { kind: "launch", provider: row.action.provider, reference: row.action.reference },
      };
    case "setting":
      return cycleSetting(model, row, 1);
    case "focus-change":
      return { model, effect: { kind: "focus-change", change: row.action.change } };
    case "command": {
      const command = row.action.command;
      const literal = command.join(" ");
      // Confirmation is two presses of the same key, so nothing runs by the
      // momentum of scrolling a list.
      const message = pick(
        `enter otra vez para ejecutar \`${literal}\``,
        `press enter again to run \`${literal}\``,
      );
      return {
        model: withModel(model, { pending: { command, label: literal }, status: message }),
        effect: { kind: "status", message },
      };
    }
    case "fact": {
      const value = row.value === undefined ? UNKNOWN_VALUE : row.value || EMPTY_VALUE;
      return statusOutcome(model, `${row.label}: ${value}`);
    }
  }
}

/**
 * One keystroke to the next model. Arrows and the LazyVim letters funnel into
 * the same moves by construction, so neither habit is second class.
 */
export function handleKey(model: AppModel, key: string): KeyOutcome {
  const none: AppEffect = { kind: "none" };

  if (model.searching) {
    if (key === ESCAPE) {
      return { model: withModel(model, { searching: false, query: "", status: "" }), effect: none };
    }
    if (key === ENTER || key === NEWLINE) {
      return { model: withModel(model, { searching: false }), effect: none };
    }
    if (key === BACKSPACE) {
      return { model: withModel(model, { query: model.query.slice(0, -1) }), effect: none };
    }
    if (key === CTRL_C) return { model, effect: { kind: "quit" } };
    // Printable characters extend the query; control sequences are ignored.
    if (key.length === 1 && key >= " ") {
      return { model: withModel(model, { query: model.query + key }), effect: none };
    }
    return { model, effect: none };
  }

  if (key === CTRL_C) return { model, effect: { kind: "quit" } };

  // A pending confirmation owns the next keystroke entirely: enter runs it and
  // anything else drops it, so no key can both cancel and mean something else.
  if (model.pending) {
    const pending = model.pending;
    const cleared = withModel(model, { pending: undefined, status: "" });
    if (key === ENTER || key === NEWLINE) {
      return { model: cleared, effect: { kind: "run", command: pending.command } };
    }
    const message = pick("Cancelado.", "Cancelled.");
    return { model: withModel(cleared, { status: message }), effect: { kind: "status", message } };
  }

  if (key === "q") return { model, effect: { kind: "quit" } };
  if (key === "f" || key === "/") {
    return { model: withModel(model, { searching: true, query: "", status: "" }), effect: none };
  }
  if (key === ESCAPE) {
    if (model.query) return { model: withModel(model, { query: "", status: "" }), effect: none };
    if (model.view.kind === "dashboard") return { model, effect: none };
    return { model, effect: { kind: "open", view: "dashboard" } };
  }
  if (key === TAB) return { model, effect: { kind: "open", view: nextView(model.view.kind) } };
  if (key === "r") return { model: withModel(model, { status: "" }), effect: { kind: "refresh" } };
  if (key === "j" || key === ARROW_DOWN) return moved(model, model.cursor + 1);
  if (key === "k" || key === ARROW_UP) return moved(model, model.cursor - 1);
  if (key === "g") return moved(model, 0);
  if (key === "G") return moved(model, visibleRows(model.view, model.query).length - 1);

  const row = selectedRow(model);

  if (key === ARROW_RIGHT || key === "l" || key === ARROW_LEFT || key === "h") {
    if (!row || row.action.kind !== "setting") return { model, effect: none };
    return cycleSetting(model, row, key === ARROW_LEFT || key === "h" ? -1 : 1);
  }

  // Dashboard hotkeys act on their own row, wherever the cursor happens to be.
  if (model.view.kind === "dashboard" && key.length === 1) {
    const target = visibleRows(model.view, model.query).find(({ row: candidate }) => candidate.key === key);
    if (target) return activate(model, target.row);
  }

  if (key === ENTER || key === NEWLINE || key === " ") {
    if (!row) return statusOutcome(model, pick("Nada seleccionado", "Nothing selected"));
    return activate(model, row);
  }
  return { model, effect: none };
}

// ─── rendering ───────────────────────────────────────────────────────────────

export type RenderOptions = Readonly<{
  columns: number;
  palette: Palette;
  /** Already sized by the driver; absent when there is no room for it. */
  banner?: readonly string[];
  tagline?: string;
  /** Footer line of the dashboard: versions, counts. */
  footer?: string;
}>;

const MAX_CONTENT = 96;
const MARGIN = 2;
/**
 * Floor for the usable width. Some terminals report 0 columns — `script`, some
 * CI pty wrappers — and a width of 0 cuts every line to nothing, which paints a
 * blank screen and looks exactly like a crash.
 */
export const MIN_COLUMNS = 24;

function usableColumns(columns: number): number {
  return Number.isFinite(columns) && columns >= MIN_COLUMNS ? Math.floor(columns) : MIN_COLUMNS;
}

function contentWidth(columns: number): number {
  return Math.max(20, Math.min(usableColumns(columns) - MARGIN * 2, MAX_CONTENT));
}

const HINTS: Readonly<Record<ViewKind, string>> = {
  dashboard: pick(
    "j/k mover · enter elegir · letra directa · f buscar · q salir",
    "j/k move · enter select · direct letter · f search · q quit",
  ),
  sessions: pick(
    "j/k mover · enter reanudar · r recargar · f buscar · esc volver",
    "j/k move · enter resume · r reload · f search · esc back",
  ),
  config: pick(
    "j/k mover · enter/→ cambiar · ← anterior · f buscar · esc volver",
    "j/k move · enter/→ change · ← previous · f search · esc back",
  ),
  state: pick(
    "j/k mover · enter ver o enfocar · r recargar · f buscar · esc volver",
    "j/k move · enter inspect or focus · r reload · f search · esc back",
  ),
  system: pick(
    "j/k mover · enter ejecutar (confirma) · r recargar · esc volver",
    "j/k move · enter run (confirms) · r reload · esc back",
  ),
};

function toneOf(palette: Palette, tone: RowTone | undefined): (text: string) => string {
  if (tone === "ok") return palette.ok;
  if (tone === "warn") return palette.accent;
  if (tone === "danger") return palette.danger;
  if (tone === "muted") return palette.muted;
  return palette.text;
}

function renderDashboard(model: AppModel, options: RenderOptions): string[] {
  const { palette, columns } = options;
  const lines: string[] = [""];

  for (const line of options.banner ?? []) {
    lines.push(center(palette.accent(line), columns));
  }
  // A terminal too narrow for the logo still gets the name: the screen has to
  // say which program it is.
  if (!options.banner?.length) lines.push(center(palette.title(model.view.title), columns));
  lines.push("");
  if (options.tagline) lines.push(center(palette.muted(options.tagline), columns));

  const rows = visibleRows(model.view, model.query);
  const labelWidth = Math.max(...rows.map(({ row }) => visibleWidth(row.label)), 1);
  // The menu is one block, centred as a whole: centring each line separately
  // would ragged-edge the hotkey column that makes the layout readable.
  const blockWidth = Math.min(2 + 2 + labelWidth + 4 + 1, contentWidth(columns));
  const left = Math.max(0, Math.floor((columns - blockWidth) / 2));
  const pad = " ".repeat(left);

  // Centred on the screen rather than on the menu block: the context line is
  // usually wider than the menu, and clipping it to the menu hides the phase.
  const context = summaryLine(model.summary);
  if (context) {
    lines.push("", center(palette.muted(fit(context, contentWidth(columns))), columns));
  }
  lines.push("");

  rows.forEach(({ row }, index) => {
    const selected = index === model.cursor;
    const icon = palette.muted(row.icon ?? " ");
    const label = selected ? palette.selected(row.label) : palette.text(row.label);
    const spacing = blockWidth - 2 - 2 - visibleWidth(row.label) - 1;
    const gap = " ".repeat(Math.max(1, spacing));
    const marker = selected ? palette.accent("▌") : " ";
    lines.push(fit(`${pad}${marker} ${icon}  ${label}${gap}${palette.key(row.key ?? "")}`, columns));
  });

  lines.push("");
  if (options.footer) lines.push(center(palette.muted(fit(options.footer, contentWidth(columns))), columns));
  lines.push(center(palette.muted(fit(statusOrHints(model), contentWidth(columns))), columns));
  return lines;
}

function summaryLine(summary: ProjectSummary): string {
  const parts = [summary.name];
  if (summary.branch) parts.push(summary.branch);
  const dirty = dirtyValue(summary.dirty);
  if (dirty) parts.push(dirty);
  if (summary.change) {
    // Only show the arrow when the next phase is a different one; "apply →
    // apply" reads like a loop rather than like "you are mid-apply".
    const phase = summary.next && summary.next !== summary.phase
      ? `${summary.phase} → ${summary.next}`
      : summary.phase;
    parts.push(phase ? `${summary.change} · ${phase}` : summary.change);
  }
  return parts.join("  ·  ");
}

function statusOrHints(model: AppModel): string {
  if (model.searching) return `${pick("Buscar", "Search")}: ${model.query}_`;
  if (model.status) return model.status;
  if (model.query) return `${pick("Filtro", "Filter")}: ${model.query}`;
  return HINTS[model.view.kind];
}

function renderRow(
  row: Row,
  selected: boolean,
  options: RenderOptions,
  labelWidth: number,
  iconColumn: boolean,
): string {
  const { palette } = options;
  const width = contentWidth(options.columns);
  const marker = selected ? palette.accent("▌") : " ";
  // One shared icon column, or none: mixing them ragged-edges the labels of a
  // list where only some rows carry a glyph.
  const icon = iconColumn ? `${palette.muted(row.icon ?? " ")} ` : "";
  const label = padVisible(selected ? palette.selected(row.label) : palette.text(row.label), labelWidth);
  const valueWidth = Math.max(8, width - labelWidth - 3);
  const painted = "value" in row
    ? toneOf(palette, row.tone)(fit(row.value === undefined ? UNKNOWN_VALUE : row.value || EMPTY_VALUE, valueWidth))
    : "";
  const line = `${marker} ${icon}${label}  ${painted}`.trimEnd();
  if (!selected || !row.note) return fit(line, options.columns);
  return fit(`${line}  ${palette.muted(row.note)}`, options.columns);
}

function renderView(model: AppModel, options: RenderOptions): string[] {
  const { palette, columns } = options;
  const width = contentWidth(columns);
  const margin = " ".repeat(MARGIN);
  const lines: string[] = [""];

  const heading = `${palette.title("EIN")} ${palette.muted("·")} ${palette.text(model.view.title)}`;
  const source = model.view.source ? palette.muted(`  ${model.view.source}`) : "";
  lines.push(margin + fit(heading + source, width));
  lines.push(margin + palette.muted("─".repeat(width)));

  for (const note of model.view.notes ?? []) {
    lines.push(margin + palette.muted(fit(note, width)));
  }
  if (model.view.notes?.length) lines.push("");

  const rows = visibleRows(model.view, model.query);
  if (rows.length === 0) {
    lines.push(
      margin +
        palette.muted(
          model.query.trim()
            ? pick("Ningún resultado para ese filtro.", "No match for that filter.")
            : pick("Nada que mostrar aquí.", "Nothing to show here."),
        ),
    );
  } else {
    const labelWidth = Math.min(
      Math.max(...rows.map(({ row }) => visibleWidth(row.label))),
      Math.floor(width * 0.45),
    );
    const iconColumn = rows.some(({ row }) => row.icon !== undefined);
    let currentSection: string | undefined;
    let first = true;
    rows.forEach(({ section, row }, index) => {
      if (first || section !== currentSection) {
        if (!first) lines.push("");
        if (section) lines.push(margin + palette.muted(section));
        currentSection = section;
        first = false;
      }
      lines.push(margin + renderRow(row, index === model.cursor, options, labelWidth, iconColumn));
    });
  }

  lines.push("");
  lines.push(margin + palette.muted("─".repeat(width)));
  const footer = statusOrHints(model);
  lines.push(margin + (model.status ? palette.accent(fit(footer, width)) : palette.muted(fit(footer, width))));
  return lines;
}

/**
 * The whole screen as lines. The driver decides where they go and whether the
 * palette paints; a dumb terminal gets the same layout without a single escape.
 */
export function renderApp(model: AppModel, options: RenderOptions): readonly string[] {
  const columns = usableColumns(options.columns);
  const sized = { ...options, columns };
  const lines = model.view.kind === "dashboard"
    ? renderDashboard(model, sized)
    : renderView(model, sized);
  return Object.freeze(lines.map((line) => fit(line, columns)));
}
