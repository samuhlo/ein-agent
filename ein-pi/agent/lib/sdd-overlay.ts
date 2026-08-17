// =============================================================================
// [CORE] OVERLAY DEL CAMBIO ACTIVO
// Convierte el estado SDD en las líneas de un widget vivo sobre el editor: qué
// cambio, con qué carril, en qué fase, y la lista de tareas con su progreso.
//
// POR QUÉ PROPIO Y NO UN PAQUETE -> el panel de tareas de terceros reconstruye
// su estado del HISTORIAL DE CONVERSACIÓN (`replayFromBranch`) y no toca disco.
// Sería una segunda fuente de verdad sobre lo mismo, que es exactamente lo que
// el manifiesto (§ 005) evita: el estado del cambio vive en disco. Este módulo
// PROYECTA `tasks.md` a través de `sdd-router` y no tiene forma de escribir
// nada — la garantía es estructural, no una promesa.
//
// Puro a propósito: recibe el estado y la paleta, devuelve líneas. Sin UI, sin
// disco, sin API de Pi. Así el aspecto exacto se puede fijar en un test, que es
// lo que impide que una interfaz se degrade sin que nadie lo note.
// =============================================================================

import type { SddChangeStatus, SddTaskItem } from "./sdd-router.ts";
import { createPalette, fit, visibleWidth, type Palette } from "./theme.ts";

export type OverlayOptions = Readonly<{
	/** Ancho útil del terminal. Por debajo de 40 el overlay se calla. */
	width?: number;
	/** Altura MÁXIMA del widget, cabecera incluida. Es el sitio que le cedes en
	 *  pantalla, que es lo que de verdad cuesta aquí. */
	maxLines?: number;
	/** Plegado: solo la cabecera. */
	collapsed?: boolean;
	palette?: Palette;
}>;

export const OVERLAY_KEY = "ein-sdd";
const DEFAULT_WIDTH = 72;
const DEFAULT_MAX_LINES = 8;
/** Por debajo de esto no cabe nada legible; mejor no robar líneas. */
const MIN_WIDTH = 40;

const GLYPH = Object.freeze({ done: "✓", current: "▸", pending: " ", header: "■" });

/**
 * Elige qué tareas se muestran cuando no caben todas. Se conservan la actual y
 * las siguientes: lo hecho ya no informa de nada, y verlo desaparecer es la
 * señal de que avanzas.
 */
export function selectVisibleTasks(
	items: readonly SddTaskItem[],
	currentId: string | null,
	maxRows: number,
): { visible: readonly SddTaskItem[]; hiddenDone: number } {
	if (maxRows <= 0 || items.length === 0) return { visible: [], hiddenDone: 0 };
	if (items.length <= maxRows) return { visible: items, hiddenDone: 0 };

	const currentIndex = currentId ? items.findIndex((item) => item.id === currentId) : -1;
	// Sin tarea actual (todo hecho, o nada empezado) se muestra la cola.
	const anchor = currentIndex >= 0 ? currentIndex : Math.max(0, items.length - maxRows);
	const start = Math.min(anchor, Math.max(0, items.length - maxRows));
	const visible = items.slice(start, start + maxRows);
	return { visible, hiddenDone: items.slice(0, start).filter((item) => item.done).length };
}

function taskRow(item: SddTaskItem, current: boolean, width: number, palette: Palette): string {
	const glyph = item.done ? GLYPH.done : current ? GLYPH.current : GLYPH.pending;
	const paint = item.done ? palette.muted : current ? palette.accent : palette.text;
	// El id se pinta siempre apagado: es referencia, no contenido.
	const label = fit(item.title, Math.max(8, width - 10));
	return `  ${paint(glyph)} ${palette.muted(fit(item.id, 4))} ${paint(label)}`;
}

/**
 * Las líneas del overlay. Vacío cuando no hay nada que enseñar — un widget que
 * ocupa sitio sin decir nada es peor que ninguno.
 */
export function renderSddOverlay(
	status: SddChangeStatus,
	options: OverlayOptions = {},
): readonly string[] {
	const width = options.width ?? DEFAULT_WIDTH;
	if (!status.change || width < MIN_WIDTH) return [];

	const palette = options.palette ?? createPalette(false);
	const items = status.tasks.items;
	const done = status.tasks.counts.done;
	const progress = items.length > 0 ? `${done}/${items.length}` : status.nextRecommended;

	const left = `${palette.accent(GLYPH.header)} ${palette.title("CAMBIO")}  ${palette.text(fit(status.change, 28))}`;
	const meta = palette.muted(`${status.lane} · ${status.currentPhase}`);
	const right = palette.accent(progress);
	// La cabecera es una sola línea: nombre a la izquierda, progreso a la derecha.
	const headLeft = `${left}  ${meta}`;
	const pad = Math.max(1, width - visibleWidth(headLeft) - visibleWidth(right));
	const header = `${headLeft}${" ".repeat(pad)}${right}`;

	if (options.collapsed || items.length === 0) return [header];

	const currentId = status.tasks.nextPending?.id ?? null;
	const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_LINES);
	// La cabecera siempre ocupa una. Lo que queda son filas de tarea, salvo que
	// haya que gastar una en decir cuántas se ocultaron — y ese resumen solo
	// cabe si deja sitio para al menos una tarea. Si no cabe, no se pone: el
	// tope de altura manda sobre el detalle.
	const rowSpace = maxLines - 1;
	const summaryFits = items.length > rowSpace && rowSpace >= 2;
	const { visible, hiddenDone } = selectVisibleTasks(
		items,
		currentId,
		summaryFits ? rowSpace - 1 : rowSpace,
	);
	const rows = visible.map((item) => taskRow(item, item.id === currentId, width, palette));

	if (summaryFits && hiddenDone > 0) {
		const word = hiddenDone === 1 ? "completada" : "completadas";
		rows.unshift(`  ${palette.muted(`… ${hiddenDone} ${word}`)}`);
	}
	return [header, ...rows];
}

/** Ancho visible de la línea más larga. Para pruebas de encaje. */
export function overlayWidth(lines: readonly string[]): number {
	return lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
}
