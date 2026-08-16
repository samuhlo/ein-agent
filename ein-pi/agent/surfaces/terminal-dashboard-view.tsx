import { For, type Accessor } from "solid-js";
import { pick } from "../lib/lang.ts";
import { visibleRows, type AppModel, type Row, type VisibleRow } from "../lib/terminal-app.ts";

export type TerminalDashboardViewData = Readonly<{ model: AppModel; width: number; height: number }>;
type LineTone = Row["tone"] | "selected" | "section" | "pi" | "claude";
type DashboardLine = Readonly<{ text: string; tone: LineTone }>;

const COLORS: Record<Exclude<LineTone, undefined>, string> = {
  normal: "#d7dee8", muted: "#69778b", ok: "#78d69c", warn: "#f5c76b", danger: "#ff6b6b",
  selected: "#ffffff", section: "#7f8ea3", pi: "#55d6be", claude: "#bf9cff",
};

function providerTone(row: Row): LineTone {
  if (row.action.kind === "launch" || row.action.kind === "continue" || row.action.kind === "session") {
    return row.action.provider;
  }
  return row.tone;
}

function rowText(row: Row): string {
  const key = row.key ? `[${row.key}] ` : "";
  const icon = row.icon ? `${row.icon} ` : "";
  const value = "value" in row ? `  ${row.value ?? "unknown"}` : "";
  return `${key}${icon}${row.label}${value}`;
}

function dashboardLines(rows: readonly VisibleRow[], cursor: number, maximum: number, showAllNotes: boolean): readonly DashboardLine[] {
  const result: DashboardLine[] = [];
  const start = Math.min(Math.max(0, cursor - Math.floor(maximum / 2)), Math.max(0, rows.length - maximum));
  let previousSection: string | undefined;
  for (const [offset, { section, row }] of rows.slice(start, start + maximum).entries()) {
    const index = start + offset;
    if (section && section !== previousSection) result.push({ text: section, tone: "section" });
    result.push({ text: `${index === cursor ? "▸ " : "  "}${rowText(row)}`, tone: index === cursor ? "selected" : providerTone(row) });
    if ((showAllNotes || index === cursor) && row.note) result.push({ text: `    ${row.note}`, tone: "muted" });
    previousSection = section;
  }
  return result;
}

export function TerminalDashboardView(props: Readonly<{ view: Accessor<TerminalDashboardViewData> }>) {
  const model = () => props.view().model;
  const rows = () => visibleRows(model().view, model().query);
  const wide = () => props.view().width >= 76;
  const dirty = () => model().summary.dirty === undefined
    ? "?"
    : model().summary.dirty === 0
      ? pick("limpio", "clean")
      : pick(`${model().summary.dirty} cambios`, `${model().summary.dirty} changed`);
  const statusColor = () => /not available|no está disponible|could not|no se pudo/i.test(model().status) ? COLORS.warn : "#78dce8";

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor="#0d1118">
      <box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="#344154" paddingLeft={1} paddingRight={1}>
        <text flexShrink={0} fg="#f5c76b"><strong>EIN</strong>  ·  {model().view.title}</text>
        <text flexShrink={0} fg="#8b98aa">
          {wide()
            ? `${model().summary.name}  ·  ${model().summary.branch ?? "detached"}  ·  ${dirty()}  ·  ${model().summary.change ?? pick("Sin cambio activo", "No active change")}`
            : `${model().summary.name} · ${model().summary.branch ?? "detached"} · ${dirty()}`}
        </text>
      </box>
      <box flexDirection="column" flexGrow={1} paddingLeft={1}>
        <For each={dashboardLines(
          rows(),
          model().cursor,
          wide() ? rows().length : Math.max(1, Math.floor((props.view().height - 8) / (model().view.kind === "config" ? 2 : 1))),
          model().view.kind === "config",
        )}>
          {(line) => <text flexShrink={0} fg={COLORS[line.tone ?? "normal"]}>{line.text}</text>}
        </For>
      </box>
      <text flexShrink={0} fg={model().status || model().searching ? statusColor() : COLORS.muted}>
        {model().searching
          ? `${pick("buscar", "find")}: ${model().query}_`
          : model().status || (wide()
            ? pick("↑/↓ o j/k mover  ←/→ o h/l cambiar  enter elegir  / buscar  q salir", "↑/↓ or j/k move  ←/→ or h/l change  enter select  / search  q quit")
            : pick("j/k mover  h/l cambiar  enter  q salir", "j/k move  h/l change  enter  q quit"))}
      </text>
    </box>
  );
}
