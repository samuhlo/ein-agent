import { For, createSignal, onCleanup, type Accessor } from "solid-js";
import { pick } from "../lib/lang.ts";
import { visibleRows, type AppModel } from "../lib/terminal-app.ts";
import {
	blankLine,
	contentLines,
	frameBottom,
	frameDivider,
	frameTop,
	headerLine,
	textLine,
	type ChromeLine,
	type ChromeTone,
} from "./terminal-chrome.ts";
import { BRAND, SIGNAL, SURFACE } from "./terminal-theme.ts";

export type TerminalDashboardViewData = Readonly<{ model: AppModel; width: number; height: number }>;

// Mismos cuatro colores que el banner. `tab` es la única inversión: carbón
// sobre amarillo, el gesto de selección de un menú de 16 bits.
const TONE: Record<ChromeTone, string> = {
	frame: BRAND.yellow,
	tab: SURFACE.plateFg,
	label: BRAND.structure,
	value: BRAND.concrete,
	dim: SURFACE.dim,
	selected: BRAND.yellow,
	key: BRAND.yellow,
	ok: SIGNAL.ok,
	warn: SIGNAL.warn,
	danger: SIGNAL.danger,
};

// El cursor late. Es lo que separa un menú vivo de una lista impresa, y cuesta
// un temporizador. 600 ms: se nota sin distraer al leer.
const BLINK_MS = 600;

function useBlink(): Accessor<boolean> {
	const [on, setOn] = createSignal(true);
	const timer = setInterval(() => setOn((value) => !value), BLINK_MS);
	onCleanup(() => clearInterval(timer));
	return on;
}

export function TerminalDashboardView(props: Readonly<{ view: Accessor<TerminalDashboardViewData> }>) {
	const blink = useBlink();
	const model = () => props.view().model;
	const rows = () => visibleRows(model().view, model().query);
	// El marco se ajusta al terminal, con un tope para que en pantallas muy
	// anchas no quede una caja desmesurada.
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

	// Altura disponible para filas: marco (2) + cabecera (2) + separadores (2)
	// + pie (1). Sin esto el contenido empujaba el borde inferior fuera.
	const CHROME_ROWS = 8;
	const capacity = () => Math.max(1, props.view().height - CHROME_ROWS);

	const lines = (): readonly ChromeLine[] => [
		frameTop(total()),
		headerLine(total(), model().view.title, model().summary.name),
		textLine(total(), `  ${context()}`),
		frameDivider(total()),
		blankLine(total()),
		...contentLines(
			total(),
			rows(),
			model().cursor,
			Math.min(rows().length, capacity()),
			model().view.kind === "config",
			blink(),
		),
		blankLine(total()),
		frameDivider(total()),
		textLine(total(), hint(), model().status ? "warn" : "dim"),
		frameBottom(total()),
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
									{...(cell.tone === "tab" ? { bg: SURFACE.plateBg } : {})}
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
