import { For, type Accessor } from "solid-js";
import { visibleRows, type AppModel, type Row } from "../../../ein-pi/agent/lib/terminal-app.ts";

export type DashboardViewData = Readonly<{
  model: AppModel;
  width: number;
  height: number;
}>;

type CandidateLine = Readonly<{ text: string; tone: Row["tone"] | "selected" | "section" }>;

function rowText(row: Row): string {
  const key = row.key ? `[${row.key}] ` : "";
  const icon = row.icon ? `${row.icon} ` : "";
  const value = "value" in row ? `  ${row.value ?? "unknown"}` : "";
  return `${key}${icon}${row.label}${value}`;
}

/** Generic row renderer shared by every controller view. */
export function CandidateRows(props: CandidateRowsProps) {
  const lines = (): readonly CandidateLine[] => {
    const result: CandidateLine[] = [];
    const maximum = props.maxRows ?? props.rows.length;
    const start = Math.min(
      Math.max(0, props.cursor - Math.floor(maximum / 2)),
      Math.max(0, props.rows.length - maximum),
    );
    const shown = props.rows.slice(start, start + maximum);
    let previousSection: string | undefined;
    for (const [offset, { section, row }] of shown.entries()) {
      const index = start + offset;
      if (section && section !== previousSection) result.push({ text: section, tone: "section" });
      result.push({ text: `${index === props.cursor ? "> " : "  "}${rowText(row)}`, tone: index === props.cursor ? "selected" : row.tone });
      if (index === props.cursor && row.note) result.push({ text: `    ${row.note}`, tone: "section" });
      previousSection = section;
    }
    return result;
  };
  return (
    <box flexDirection="column" flexGrow={1}>
      <For each={lines()}>
        {(line) => (
          <text flexShrink={0} fg={line.tone === "selected" ? "#f5c76b" : line.tone === "danger" ? "#ff6b6b" : line.tone === "section" ? "#7f8ea3" : "#d7dee8"}>
            {line.text}
          </text>
        )}
      </For>
    </box>
  );
}

type CandidateRowsProps = Readonly<{
  rows: ReturnType<typeof visibleRows>;
  cursor: number;
  maxRows?: number;
}>;

export function DashboardCandidate(props: Readonly<{ view: Accessor<DashboardViewData> }>) {
  const model = () => props.view().model;
  const rows = () => visibleRows(model().view, model().query);
  const wide = () => props.view().width >= 72;

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor="#10141c">
      <box flexDirection="column" marginBottom={1}>
        <text flexShrink={0} fg="#f5c76b"><strong>EIN</strong> / {model().view.title}</text>
        <text flexShrink={0} fg="#7f8ea3">
          {wide()
            ? `${model().summary.name}  ${model().summary.branch ?? "detached"}  |  ${model().summary.change ?? "No active change"}  |  ${model().summary.next ?? `${model().summary.sessions ?? 0} previous sessions`}`
            : `${model().summary.name}  ${model().summary.branch ?? "detached"}`}
        </text>
      </box>
      <CandidateRows
        rows={rows()}
        cursor={model().cursor}
        maxRows={wide() ? undefined : Math.max(1, props.view().height - 6)}
      />
      <text flexShrink={0} fg={model().status || model().searching ? "#78dce8" : "#566274"}>
        {model().searching
          ? `find: ${model().query}`
          : model().status || (wide() ? "j/k or arrows  enter select  tab views  q quit" : "j/k move  enter select  q quit")}
      </text>
    </box>
  );
}
