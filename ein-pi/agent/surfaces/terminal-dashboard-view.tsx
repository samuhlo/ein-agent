import { For, createSignal, onCleanup, type Accessor } from "solid-js";
import { pick } from "../lib/lang.ts";
import { visibleRows, type AppModel } from "../lib/terminal-app.ts";
import {
	blankLine,
	contentLines,
	headerLine,
	ruleLine,
	textLine,
	type ChromeLine,
	type ChromeTone,
} from "./terminal-chrome.ts";
import { BRAND, SIGNAL, SURFACE } from "./terminal-theme.ts";

export type TerminalDashboardViewData = Readonly<{ model: AppModel; width: number; height: number }>;

// Mismos cuatro colores que el banner. Ya no hay inversión: el foco es una
// banda de fondo, y la marca es la `i` amarilla del wordmark.
const TONE: Record<ChromeTone, string> = {
	frame: BRAND.structure,
	tab: BRAND.structure,
	label: BRAND.structure,
	value: BRAND.concrete,
	dim: SURFACE.dim,
	selected: BRAND.yellow,
	key: BRAND.yellow,
	ok: SIGNAL.ok,
	warn: SIGNAL.warn,
	danger: SIGNAL.danger,
};

export function TerminalDashboardView(props: Readonly<{ view: Accessor<TerminalDashboardViewData> }>) {
	const model = () => props.view().model;
	const rows = () => visibleRows(model().view, model().query);
	// El ancho útil se ajusta al terminal, con tope para que en pantallas muy
	// anchas la línea no se estire sin fin.
	const total = () => Math.max(40, Math.min(props.view().width - 2, 96));
	const dirty = () => model().summary.dirty === undefined
		? "?"
		: model().summary.dirty === 0
			? pick("limpio", "clean")
			: pick(`${model().summary.dirty} cambios`, `${model().summary.dirty} changed`);
	const context = () => [
		model().summary.name,
		model().summary.branch ?? "detached",
		dirty(),
		model().summary.change ?? pick("sin cambio activo", "no active change"),
	].join(" · ");

	const hint = () => model().searching
		? `${pick("buscar", "find")}: ${model().query}_`
		: model().status || pick(
			"↑/↓ mover   ←/→ cambiar   enter elegir   / buscar   q salir",
			"↑/↓ move   ←/→ change   enter select   / search   q quit",
		);

	// Altura disponible para filas: barra superior (1) + contexto (1) + aire (3)
	// + barra inferior (1). Sin esto el contenido empujaba el pie fuera.
	const CHROME_ROWS = 7;
	const capacity = () => Math.max(1, props.view().height - CHROME_ROWS);

	// Dos barras y el contenido flotando entre ellas (STYLE.md // 002, regla 7).
	const lines = (): readonly ChromeLine[] => [
		headerLine(total(), model().view.title, context()),
		blankLine(total()),
		...contentLines(
			total(),
			rows(),
			model().cursor,
			Math.min(rows().length, capacity()),
			model().view.kind === "config",
		),
		blankLine(total()),
		ruleLine(total()),
		textLine(total(), hint(), model().status ? "warn" : "dim"),
	];

	return (
		<box width="100%" height="100%" flexDirection="column" padding={1} backgroundColor={SURFACE.background}>
			<For each={lines()}>
				{(line) => (
					<box flexDirection="row" flexShrink={0}>
						<For each={line}>
							{(cell) => (
								<text
									flexShrink={0}
									fg={TONE[cell.tone]}
									{...(cell.bg ? { bg: SURFACE.selectedBg } : {})}
								>
									{cell.bold ? <strong>{cell.text}</strong> : cell.text}
								</text>
							)}
						</For>
					</box>
				)}
			</For>
		</box>
	);
}
