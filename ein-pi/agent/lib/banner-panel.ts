// =============================================================================
// BANNER PANEL — la ventana de estado del arranque, estilo 16 bits
// Marco doble, pestañas de sección invertidas (carbón sobre amarillo, como la
// selección de un menú de SNES) y líneas de puntos que llevan cada etiqueta
// hasta su valor.
//
// Los puntos no son adorno. TODO cuelga de una sola rejilla, así que
// HEAD/LOCAL/UPSTREAM quedan alineados con el resto: antes las filas de git se
// pintaban aparte, con su propio ancho de etiqueta, y nunca cuadraban.
//
// Módulo PURO: entra data + tick, salen celdas. Sin fs, sin ANSI, sin Pi. Por
// eso se puede previsualizar y testear sin arrancar un terminal — que es como
// se cazó que el restyle anterior se había comido los iconos de las filas.
// =============================================================================

export type PanelTone = "frame" | "label" | "value" | "plate" | "dim" | "accent";
export type PanelCell = Readonly<{ text: string; tone: PanelTone; bold?: boolean }>;
export type PanelLine = readonly PanelCell[];

// `note` ocupa el ancho entero sin etiqueta ni puntos: es una ayuda, no un dato
// con valor a la derecha. Sin esto la linea de comandos salia recortada porque
// pagaba el ancho de etiqueta y el recorrido de puntos de un campo normal.
export type PanelField = Readonly<{ label: string; value: string; trail?: string; note?: boolean }>;
export type PanelChip = Readonly<{ text: string; on: boolean }>;

export type PanelSection =
	| Readonly<{ kind: "fields"; title: string; fields: readonly PanelField[] }>
	| Readonly<{ kind: "chips"; label: string; chips: readonly PanelChip[] }>
	| Readonly<{ kind: "loose"; fields: readonly PanelField[] }>;

export type PanelData = Readonly<{
	plate: string;
	right: string;
	sections: readonly PanelSection[];
}>;

export const PANEL_W = 62;
const INNER_W = PANEL_W - 4;
const LABEL_W = 13;

// Ritmo. Un menú de 16 bits abre RÁPIDO: las filas caen a un tick de distancia
// (30 ms) y eso es justo lo que produce la cascada.
export const PANEL_FRAME_TICKS = 6;
export const PANEL_ROW_TICKS = 1;
export const PANEL_LEADER_TICKS = 4;

const TOP_L = "╔", TOP_R = "╗", BOT_L = "╚", BOT_R = "╝";
const H = "═", V = "║", SEP_L = "╟", SEP_R = "╢", SEP = "─";
const DOT = "·", RULE = "┄";
const CHIP_ON = "◆", CHIP_OFF = "◇";

function fit(value: string, width: number): string {
	return value.replace(/\s+/g, " ").trim().slice(0, Math.max(0, width));
}

// Filas planas del panel. Se aplanan las secciones para que la animación pueda
// escalonarlas por índice sin conocer su estructura.
type Row =
	| Readonly<{ kind: "tab"; text: string }>
	| Readonly<{ kind: "field"; label: string; value: string; trail: string }>
	| Readonly<{ kind: "note"; text: string }>
	| Readonly<{ kind: "chips"; label: string; chips: readonly PanelChip[] }>
	| Readonly<{ kind: "blank" }>
	| Readonly<{ kind: "divider" }>;

export function panelRows(data: PanelData): readonly Row[] {
	const rows: Row[] = [];
	for (const [index, section] of data.sections.entries()) {
		if (index > 0) rows.push({ kind: "blank" });
		if (section.kind === "chips") {
			rows.push({ kind: "chips", label: section.label, chips: section.chips });
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
	const drawn = Math.min(PANEL_W, Math.round(PANEL_W * framePhase));

	// Borde superior: barre de izquierda a derecha.
	const top: PanelCell[] = [{ text: TOP_L, tone: "frame" }];
	top.push({ text: H.repeat(Math.max(0, drawn - 2)), tone: "frame" });
	if (drawn >= PANEL_W) top.push({ text: TOP_R, tone: "frame" });
	lines.push(top);
	if (framePhase < 1) return lines;

	// Cabecera: placa invertida + versión de Pi a la derecha.
	const gap = Math.max(1, INNER_W - data.plate.length - data.right.length);
	lines.push([
		{ text: `${V} `, tone: "frame" },
		{ text: data.plate, tone: "plate", bold: true },
		{ text: " ".repeat(gap), tone: "value" },
		{ text: data.right, tone: "label" },
		{ text: ` ${V}`, tone: "frame" },
	]);
	lines.push([
		{ text: SEP_L, tone: "frame" },
		{ text: SEP.repeat(PANEL_W - 2), tone: "label" },
		{ text: SEP_R, tone: "frame" },
	]);

	const rowProgress = (index: number): number =>
		clamp01((tick - PANEL_FRAME_TICKS - index * PANEL_ROW_TICKS) / PANEL_LEADER_TICKS);

	for (const [index, row] of rows.entries()) {
		const progress = rowProgress(index);
		if (progress <= 0) continue;
		const cells: PanelCell[] = [{ text: `${V} `, tone: "frame" }];

		if (row.kind === "blank") {
			cells.push({ text: " ".repeat(INNER_W), tone: "value" });
		} else if (row.kind === "divider") {
			cells.push({ text: RULE.repeat(INNER_W), tone: "dim" });
		} else if (row.kind === "note") {
			const shown = row.text.slice(0, Math.ceil(row.text.length * progress));
			cells.push({ text: shown, tone: "dim" });
			cells.push({ text: " ".repeat(Math.max(0, INNER_W - shown.length)), tone: "value" });
		} else if (row.kind === "tab") {
			// La pestaña crece de izquierda a derecha al abrirse.
			const full = ` ${row.text} `;
			const shown = full.slice(0, Math.max(1, Math.ceil(full.length * progress)));
			cells.push({ text: shown, tone: "plate", bold: true });
			cells.push({ text: " ".repeat(Math.max(0, INNER_W - shown.length)), tone: "value" });
		} else if (row.kind === "chips") {
			cells.push({ text: row.label.padEnd(LABEL_W), tone: "label" });
			let used = LABEL_W;
			for (const chip of row.chips) {
				const piece = `${CHIP_ON} ${chip.text}  `;
				if (used + piece.length > INNER_W) break;
				cells.push({ text: `${chip.on ? CHIP_ON : CHIP_OFF} `, tone: chip.on ? "accent" : "dim" });
				cells.push({ text: `${chip.text}  `, tone: chip.on ? "value" : "dim" });
				used += piece.length;
			}
			cells.push({ text: " ".repeat(Math.max(0, INNER_W - used)), tone: "value" });
		} else {
			// Campo: etiqueta, puntos que corren, y el valor soltándose al final.
			cells.push({ text: row.label.padEnd(LABEL_W), tone: row.label ? "label" : "value" });
			// El sufijo solo reserva su separador cuando EXISTE. Contarlo siempre
			// dejaba las filas sin sufijo una columna cortas, y el marco no
			// cerraba en vertical: el mismo descuadre que hacia que HEAD/LOCAL no
			// alinearan con el resto.
			const tail = row.trail ? row.trail.length + 1 : 0;
			const span = Math.max(0, INNER_W - LABEL_W - row.value.length - tail - 1);
			const filled = Math.round(span * progress);
			cells.push({ text: DOT.repeat(filled), tone: "dim" });
			cells.push({ text: " ".repeat(span - filled), tone: "value" });
			if (progress >= 1) {
				cells.push({ text: ` ${row.value}`, tone: "value" });
				if (row.trail) cells.push({ text: ` ${row.trail}`, tone: "label" });
			} else {
				cells.push({ text: " ".repeat(row.value.length + tail + 1), tone: "value" });
			}
		}

		cells.push({ text: ` ${V}`, tone: "frame" });
		lines.push(cells);
	}

	// Cierre: solo cuando la última fila ha terminado de abrir.
	if (rows.length && rowProgress(rows.length - 1) >= 1) {
		lines.push([
			{ text: BOT_L, tone: "frame" },
			{ text: H.repeat(PANEL_W - 2), tone: "frame" },
			{ text: BOT_R, tone: "frame" },
		]);
	}
	return lines;
}
