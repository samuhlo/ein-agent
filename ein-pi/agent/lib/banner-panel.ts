// =============================================================================
// BANNER PANEL — el estado del arranque, sin marco
// Cabecera con el wordmark, secciones `// NNN.` y filas etiqueta/valor en
// columna. Antes era una ventana de 16 bits: marco doble, pestañas invertidas
// y líneas de puntos que llevaban cada etiqueta hasta su valor.
//
// Los puntos no eran adorno — sostenían la rejilla que alinea HEAD/LOCAL con el
// resto. Pero esa rejilla la da la COLUMNA sola: `padEnd(LABEL_W)` alinea igual
// sin pintar nada, y el aire separa mejor que un borde (STYLE.md // 002).
//
// Módulo PURO: entra data + tick, salen celdas. Sin fs, sin ANSI, sin Pi. Por
// eso se puede previsualizar y testear sin arrancar un terminal — que es como
// se cazó que el restyle anterior se había comido los iconos de las filas.
// =============================================================================

export type PanelTone = "frame" | "label" | "value" | "dim" | "accent";
export type PanelCell = Readonly<{ text: string; tone: PanelTone; bold?: boolean }>;
export type PanelLine = readonly PanelCell[];

// `note` ocupa el ancho entero sin etiqueta ni puntos: es una ayuda, no un dato
// con valor a la derecha. Sin esto la linea de comandos salia recortada porque
// pagaba el ancho de etiqueta y el recorrido de puntos de un campo normal.
export type PanelField = Readonly<{ label: string; value: string; trail?: string; note?: boolean }>;
export type PanelChip = Readonly<{ text: string; on: boolean }>;

// Una columna de la rejilla. Toma campos planos: `trail` y `note` piden el ancho
// entero del panel, y aqui solo hay media.
export type PanelColumn = Readonly<{ title: string; fields: readonly PanelField[] }>;

export type PanelSection =
	| Readonly<{ kind: "fields"; title: string; fields: readonly PanelField[] }>
	| Readonly<{ kind: "grid"; columns: readonly [PanelColumn, PanelColumn] }>
	| Readonly<{ kind: "chips"; label: string; chips: readonly PanelChip[] }>
	| Readonly<{ kind: "loose"; fields: readonly PanelField[] }>;

export type PanelData = Readonly<{
	title: string;
	right: string;
	sections: readonly PanelSection[];
}>;

export const PANEL_W = 62;
const INNER_W = PANEL_W - 4;
const LABEL_W = 13;

// LA REJILLA. Ni SISTEMA ni SESION pasan de media placa, asi que apiladas
// desperdiciaban la otra mitad en cada fila. Media columna exacta: las dos
// mitades tienen que sumar PANEL_W o el panel se abre por la derecha.
const GRID_W = PANEL_W >> 1;
/** Lo que le queda a un valor de la rejilla tras la sangría de etiqueta. */
export const GRID_VALUE_W = GRID_W - LABEL_W;

// Ritmo. Un menú de 16 bits abre RÁPIDO: las filas caen a un tick de distancia
// (30 ms) y eso es justo lo que produce la cascada.
export const PANEL_FRAME_TICKS = 6;
export const PANEL_ROW_TICKS = 1;
export const PANEL_LEADER_TICKS = 4;

const RULE = "─";
const CHIP_ON = "◆", CHIP_OFF = "◇";

function fit(value: string, width: number): string {
	return value.replace(/\s+/g, " ").trim().slice(0, Math.max(0, width));
}

// Filas planas del panel. Se aplanan las secciones para que la animación pueda
// escalonarlas por índice sin conocer su estructura.
type GridCell =
	| Readonly<{ kind: "tab"; text: string }>
	| Readonly<{ kind: "field"; label: string; value: string }>
	| null;

type Row =
	| Readonly<{ kind: "tab"; text: string }>
	| Readonly<{ kind: "field"; label: string; value: string; trail: string }>
	| Readonly<{ kind: "note"; text: string }>
	| Readonly<{ kind: "chips"; label: string; chips: readonly PanelChip[] }>
	| Readonly<{ kind: "grid"; left: GridCell; right: GridCell }>
	| Readonly<{ kind: "blank" }>
	| Readonly<{ kind: "divider" }>;

/**
 * Las dos columnas se emiten fila a fila, no bloque tras bloque: la animacion
 * escalona por indice de fila y tiene que ver la rejilla como filas normales.
 * La columna corta se queda en blanco por abajo.
 */
function gridRows(columns: readonly [PanelColumn, PanelColumn]): Row[] {
	const [left, right] = columns;
	const cell = (item: PanelField | undefined): GridCell =>
		item ? { kind: "field", label: item.label, value: fit(item.value, GRID_VALUE_W) } : null;

	const rows: Row[] = [{
		kind: "grid",
		left: { kind: "tab", text: left.title },
		right: { kind: "tab", text: right.title },
	}];
	const height = Math.max(left.fields.length, right.fields.length);
	for (let index = 0; index < height; index += 1) {
		rows.push({ kind: "grid", left: cell(left.fields[index]), right: cell(right.fields[index]) });
	}
	return rows;
}

/**
 * Una mitad de la rejilla, rellenada o recortada a `GRID_W`. Ese ajuste final es
 * lo que sostiene la invariante del panel: dos mitades exactas suman PANEL_W
 * pase lo que pase con la etiqueta o el valor.
 */
function gridCells(cell: GridCell, progress: number, nextSection: () => number): PanelCell[] {
	const out: PanelCell[] = [];

	if (cell?.kind === "tab") {
		const full = `// ${String(nextSection()).padStart(3, "0")}. ${cell.text.toLowerCase()}`;
		const shown = full.slice(0, Math.max(1, Math.ceil(full.length * progress)));
		out.push({ text: shown.slice(0, 2), tone: "accent" });
		if (shown.length > 2) out.push({ text: shown.slice(2), tone: "label" });
	} else if (cell?.kind === "field") {
		out.push({ text: cell.label.padEnd(LABEL_W), tone: cell.label ? "label" : "value" });
		if (progress >= 1) out.push({ text: cell.value, tone: "value" });
	}

	let width = out.reduce((total, item) => total + [...item.text].length, 0);
	while (width > GRID_W) {
		const last = out.pop();
		if (!last) break;
		const keep = [...last.text].slice(0, [...last.text].length - (width - GRID_W));
		if (keep.length) out.push({ ...last, text: keep.join("") });
		width = out.reduce((total, item) => total + [...item.text].length, 0);
	}
	if (width < GRID_W) out.push({ text: " ".repeat(GRID_W - width), tone: "value" });
	return out;
}

export function panelRows(data: PanelData): readonly Row[] {
	const rows: Row[] = [];
	for (const [index, section] of data.sections.entries()) {
		if (index > 0) rows.push({ kind: "blank" });
		if (section.kind === "chips") {
			rows.push({ kind: "chips", label: section.label, chips: section.chips });
			continue;
		}
		if (section.kind === "grid") {
			rows.push(...gridRows(section.columns));
			continue;
		}
		if (section.kind === "fields") rows.push({ kind: "tab", text: section.title });
		else rows.push({ kind: "divider" });
		for (const item of section.fields) {
			if (item.note) {
				const text = fit(item.value, INNER_W);
				if (text) rows.push({ kind: "note", text });
				continue;
			}
			const trail = item.trail ?? "";
			const value = fit(item.value, INNER_W - LABEL_W - (trail ? trail.length + 1 : 0) - 2);
			if (value) rows.push({ kind: "field", label: item.label, value, trail });
		}
	}
	return rows;
}

/** Ticks totales que necesita el panel para abrir del todo. */
export function panelDuration(data: PanelData): number {
	return PANEL_FRAME_TICKS + panelRows(data).length * PANEL_ROW_TICKS + PANEL_LEADER_TICKS;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Panel en un tick dado. `tick` es relativo al arranque del panel: 0 es el
 * primer fotograma del marco. Devuelve las líneas ya compuestas.
 */
export function renderPanel(data: PanelData, tick: number): readonly PanelLine[] {
	const rows = panelRows(data);
	const framePhase = clamp01(tick / PANEL_FRAME_TICKS);
	if (framePhase <= 0) return [];

	const lines: PanelCell[][] = [];

	// Cabecera: wordmark con la `i` en amarillo, el título de la vista y el
	// contexto a la derecha. Sin placa invertida y sin bordes que cerrar.
	const head: PanelCell[] = [
		{ text: "e", tone: "value" },
		{ text: "i", tone: "accent" },
		{ text: "n", tone: "value" },
		{ text: `   ${data.title}`, tone: "label" },
	];
	const used = head.reduce((total, cell) => total + [...cell.text].length, 0);
	const gap = Math.max(1, PANEL_W - used - data.right.length);
	head.push({ text: " ".repeat(gap), tone: "value" });
	head.push({ text: data.right, tone: "dim" });
	lines.push(head);
	if (framePhase < 1) return lines;

	const rowProgress = (index: number): number =>
		clamp01((tick - PANEL_FRAME_TICKS - index * PANEL_ROW_TICKS) / PANEL_LEADER_TICKS);

	let sectionIndex = 0;
	for (const [index, row] of rows.entries()) {
		const progress = rowProgress(index);
		if (progress <= 0) continue;
		const cells: PanelCell[] = [];

		if (row.kind === "blank") {
			cells.push({ text: " ".repeat(PANEL_W), tone: "value" });
		} else if (row.kind === "divider") {
			cells.push({ text: RULE.repeat(PANEL_W), tone: "dim" });
		} else if (row.kind === "note") {
			const shown = row.text.slice(0, Math.ceil(row.text.length * progress));
			cells.push({ text: shown, tone: "dim" });
			cells.push({ text: " ".repeat(Math.max(0, PANEL_W - shown.length)), tone: "value" });
		} else if (row.kind === "tab") {
			// Título de sección: `// NNN. sección`, con el `//` en acento. Crece de
			// izquierda a derecha al abrirse, como el resto de la cascada.
			const full = `// ${String(sectionIndex).padStart(3, "0")}. ${row.text.toLowerCase()}`;
			sectionIndex += 1;
			const shown = full.slice(0, Math.max(1, Math.ceil(full.length * progress)));
			cells.push({ text: shown.slice(0, 2), tone: "accent" });
			if (shown.length > 2) cells.push({ text: shown.slice(2), tone: "label" });
			cells.push({ text: " ".repeat(Math.max(0, PANEL_W - shown.length)), tone: "value" });
		} else if (row.kind === "grid") {
			// Izquierda antes que derecha: es lo que da `// 000.` y `// 001.` en el
			// orden en que se leen.
			cells.push(...gridCells(row.left, progress, () => sectionIndex++));
			cells.push(...gridCells(row.right, progress, () => sectionIndex++));
		} else if (row.kind === "chips") {
			cells.push({ text: row.label.padEnd(LABEL_W), tone: "label" });
			let width = LABEL_W;
			for (const chip of row.chips) {
				const piece = `${CHIP_ON} ${chip.text}  `;
				if (width + piece.length > PANEL_W) break;
				cells.push({ text: `${chip.on ? CHIP_ON : CHIP_OFF} `, tone: chip.on ? "accent" : "dim" });
				cells.push({ text: `${chip.text}  `, tone: chip.on ? "value" : "dim" });
				width += piece.length;
			}
			cells.push({ text: " ".repeat(Math.max(0, PANEL_W - width)), tone: "value" });
		} else {
			// Campo: etiqueta y valor en columna. Los puntos que llevaban la
			// etiqueta hasta su valor eran una rejilla dibujada a mano; la sangría
			// fija alinea igual sin pintar nada.
			cells.push({ text: row.label.padEnd(LABEL_W), tone: row.label ? "label" : "value" });
			const tail = row.trail ? row.trail.length + 1 : 0;
			const room = Math.max(0, PANEL_W - LABEL_W - tail);
			if (progress >= 1) {
				const value = row.value.slice(0, room);
				cells.push({ text: value, tone: "value" });
				if (row.trail) cells.push({ text: ` ${row.trail}`, tone: "label" });
				cells.push({ text: " ".repeat(Math.max(0, room - value.length)), tone: "value" });
			} else {
				cells.push({ text: " ".repeat(room + tail), tone: "value" });
			}
		}

		lines.push(cells);
	}

	return lines;
}

// -----------------------------------------------------------------------------
// COMPOSICION EN COLUMNAS
// El banner era una torre: logo (13 filas) + panel (28) = 41, y el modo completo
// solo exige 30 filas de terminal, asi que se salia por abajo. En paralelo la
// altura es el maximo de las dos, no la suma, y ademas aprovecha el ancho.
// -----------------------------------------------------------------------------

// Generico sobre la celda: la columna izquierda la construye el banner con sus
// propios colores (el ruido del logo no cabe en los tonos del panel), asi que
// aqui solo se exige que la celda tenga texto.
export type WidthCell = Readonly<{ text: string }>;

export function lineWidth(line: readonly WidthCell[]): number {
	let total = 0;
	for (const cell of line) total += [...cell.text].length;
	return total;
}

/**
 * Pega dos bloques lado a lado. La columna izquierda se rellena hasta
 * `leftWidth` para que la derecha arranque siempre en la misma columna, aunque
 * la izquierda aun se este dibujando (la animacion produce lineas cortas).
 */
export function composeColumns<L extends WidthCell, R extends WidthCell>(
	left: readonly (readonly L[])[],
	leftWidth: number,
	right: readonly (readonly R[])[],
	pad: (width: number) => L | R,
	gutter = 3,
): readonly (readonly (L | R)[])[] {
	const height = Math.max(left.length, right.length);
	// La columna corta se centra en vertical. Con el logo arriba del todo, el
	// panel dejaba trece filas muertas debajo y la composicion quedaba coja.
	const offset = Math.max(0, Math.floor((height - left.length) / 2));
	const out: (L | R)[][] = [];
	for (let index = 0; index < height; index++) {
		const leftLine = left[index - offset] ?? [];
		const rightLine = right[index] ?? [];
		const gap = Math.max(0, leftWidth - lineWidth(leftLine)) + gutter;
		const cells: (L | R)[] = [...leftLine, pad(gap)];
		if (rightLine.length) cells.push(...rightLine);
		// Toda linea se rellena hasta el ancho compuesto TOTAL, aunque la columna
		// derecha aun no exista. Sin esto el centrado se calculaba solo sobre lo
		// dibujado y el logo saltaba de sitio en cuanto aparecia el panel.
		const missing = composedWidth(leftWidth, gutter) - lineWidth(cells);
		if (missing > 0) cells.push(pad(missing));
		out.push(cells);
	}
	return out;
}

/** Ancho total que ocuparia el banner en dos columnas. */
export function composedWidth(leftWidth: number, gutter = 3): number {
	return leftWidth + gutter + PANEL_W;
}
