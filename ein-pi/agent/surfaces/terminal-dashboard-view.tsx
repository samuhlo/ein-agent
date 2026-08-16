import { For, type Accessor } from "solid-js";
import { pick } from "../lib/lang.ts";
import { visibleRows, type AppModel, type Row, type VisibleRow } from "../lib/terminal-app.ts";
import { BRAND, SURFACE, TONE_COLOR, rowColor, rowMark, rule, type LineTone } from "./terminal-theme.ts";

export type TerminalDashboardViewData = Readonly<{ model: AppModel; width: number; height: number }>;
type DashboardLine = Readonly<{ text: string; tone: LineTone }>;

// Fila: marcador de marca + tecla + etiqueta + valor alineado. El valor se
// alinea a columna fija en ancho grande para que la lista se lea como la placa
// de specs del banner, no como texto corrido.
const VALUE_COLUMN = 30;

// El glifo lo pone el MODELO (`ICON` en terminal-app.ts): `◆` Pi, `◇` Claude,
// `▪` estado, `○` config… Dice QUÉ es la fila, que es más información que un
// marcador uniforme, y ya está elegido para medir una columna en cualquier
// terminal. `rowMark` solo cubre las filas que no traen icono propio.
function rowText(row: Row, wide: boolean): string {
  const key = row.key ? `[${row.key}] ` : "";
  const head = `${row.icon ?? rowMark(row)} ${key}${row.label}`;
  if (!("value" in row)) return head;
  const value = row.value ?? "unknown";
  return wide ? `${head.padEnd(VALUE_COLUMN)}${value}` : `${head}  ${value}`;
}

function dashboardLines(
  rows: readonly VisibleRow[],
  cursor: number,
  maximum: number,
  showAllNotes: boolean,
  wide: boolean,
): readonly DashboardLine[] {
  const result: DashboardLine[] = [];
  const start = Math.min(Math.max(0, cursor - Math.floor(maximum / 2)), Math.max(0, rows.length - maximum));
  let previousSection: string | undefined;
  for (const [offset, { section, row }] of rows.slice(start, start + maximum).entries()) {
    const index = start + offset;
    // Sección en versalitas: la marca escribe los rótulos en mayúsculas.
    if (section && section !== previousSection) {
      if (result.length > 0) result.push({ text: "", tone: "section" });
      result.push({ text: section.toUpperCase(), tone: "section" });
    }
    const selected = index === cursor;
    result.push({
      text: `${selected ? "▸ " : "  "}${rowText(row, wide)}`,
      tone: selected ? "selected" : (row.tone ?? "normal"),
    });
    if ((showAllNotes || selected) && row.note) result.push({ text: `    ${row.note}`, tone: "muted" });
    previousSection = section;
  }
  return result;
}

export function TerminalDashboardView(props: Readonly<{ view: Accessor<TerminalDashboardViewData> }>) {
  const model = () => props.view().model;
  const rows = () => visibleRows(model().view, model().query);
  const wide = () => props.view().width >= 76;
  const innerWidth = () => Math.max(10, props.view().width - 4);
  const dirty = () => model().summary.dirty === undefined
    ? "?"
    : model().summary.dirty === 0
      ? pick("limpio", "clean")
      : pick(`${model().summary.dirty} cambios`, `${model().summary.dirty} changed`);
  const statusColor = () => /not available|no está disponible|could not|no se pudo/i.test(model().status)
    ? TONE_COLOR.warn
    : TONE_COLOR.normal;

  return (
    <box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor={SURFACE.background}>
      {/* Cabecera: placa de marca (carbón sobre amarillo, como el tag de versión
          del banner de Pi) + el título de la vista, y debajo el contexto del
          proyecto en gris estructura. */}
      <box flexDirection="row" flexShrink={0}>
        <text flexShrink={0} bg={SURFACE.plateBg} fg={SURFACE.plateFg}><strong> EIN </strong></text>
        <text flexShrink={0} fg={BRAND.concrete}>{`  ${model().view.title.toUpperCase()}`}</text>
      </box>
      <text flexShrink={0} fg={BRAND.structure}>
        {wide()
          ? `${model().summary.name}  ·  ${model().summary.branch ?? "detached"}  ·  ${dirty()}  ·  ${model().summary.change ?? pick("sin cambio activo", "no active change")}`
          : `${model().summary.name} · ${model().summary.branch ?? "detached"} · ${dirty()}`}
      </text>
      <text flexShrink={0} fg={SURFACE.rule}>{rule(innerWidth())}</text>

      <box flexDirection="column" flexGrow={1} marginTop={1}>
        <For each={dashboardLines(
          rows(),
          model().cursor,
          wide() ? rows().length : Math.max(1, Math.floor((props.view().height - 10) / (model().view.kind === "config" ? 2 : 1))),
          model().view.kind === "config",
          wide(),
        )}>
          {(line) => <text flexShrink={0} fg={TONE_COLOR[line.tone]}>{line.text}</text>}
        </For>
      </box>

      <text flexShrink={0} fg={SURFACE.rule}>{rule(innerWidth())}</text>
      <text flexShrink={0} fg={model().status || model().searching ? statusColor() : SURFACE.dim}>
        {model().searching
          ? `${pick("buscar", "find")}: ${model().query}_`
          : model().status || (wide()
            ? pick("↑/↓ mover   ←/→ cambiar   enter elegir   / buscar   q salir", "↑/↓ move   ←/→ change   enter select   / search   q quit")
            : pick("j/k mover  h/l cambiar  enter  q", "j/k move  h/l change  enter  q"))}
      </text>
    </box>
  );
}
