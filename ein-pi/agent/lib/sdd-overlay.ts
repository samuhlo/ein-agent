// =============================================================================
// [CORE] OVERLAY DEL CAMBIO ACTIVO
// Convierte el estado SDD en las líneas de un widget vivo sobre el editor: qué
// cambio, por dónde va el CARRIL COMPLETO de fases, y qué toca ahora.
//
// POR QUÉ EL RAÍL -> antes esto solo proyectaba `tasks.md`. Cuando la última
// tarea se marcaba, el widget se quedaba enseñando `7/7` y callado: cierto e
// inútil, porque aún faltaban `verify` y `close`. Una pantalla que dibuja «todo
// hecho» sobre un cambio a medias incumple el manifiesto (§ 006: honesta). El
// dato que faltaba YA estaba calculado — `LANE_PHASES` y `present` — así que
// esto es puro renderizado sobre estado existente: sin herramienta nueva, sin
// agente, sin gasto de modelo (§ 002).
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

import { GLYPH, band, joinMeta } from "./chrome.ts";
import { LANE_PHASES } from "./sdd-lane.ts";
import type { SddChangeStatus, SddPhase, SddTaskItem } from "./sdd-router.ts";
import { createPalette, fit, padVisible, visibleWidth, type Palette } from "./theme.ts";

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
const INDENT = "  ";

/** Qué hace cada fase, en una frase. Para cuando el raíl sustituye a la lista. */
const PHASE_WORK: Readonly<Record<SddPhase, string>> = Object.freeze({
	scope: "acotar el cambio",
	map: "mapear el terreno",
	design: "decidir el mecanismo",
	tasks: "descomponer en grupos",
	apply: "escribir el código",
	verify: "re-ejecutar la suite y publicar el informe",
	close: "archivar el cambio y apartar el plan",
});

export type PhaseState = "done" | "current" | "pending" | "unknown" | "failed";

/**
 * Estado de cada fase del carril. `verify` es el único que puede salir
 * DESCONOCIDO o FALLIDO, y son cosas distintas:
 *
 * - DESCONOCIDO: un informe obsoleto o ilegible no es un aprobado, y fingir que
 *   lo es sería ascender una incertidumbre a estado bueno (§ 002, fail-closed).
 * - FALLIDO: el informe se leyó y dice que no pasó. No es incertidumbre, es un
 *   suspenso, y durante un tiempo se pintó igual que un aprobado porque el
 *   `fail` caía por el hueco hasta la rama de "artefacto presente = fase hecha".
 */
export function phaseStates(status: SddChangeStatus): readonly { phase: SddPhase; state: PhaseState }[] {
	const phases = LANE_PHASES[status.lane] ?? LANE_PHASES.standard;
	const current = status.nextRecommended;
	return phases.map((phase) => {
		if (phase === "verify" && status.present?.verify) {
			if (status.verifyStale || status.verify === "unknown") return { phase, state: "unknown" as const };
			if (status.verify === "fail") return { phase, state: "failed" as const };
		}
		if (phase === current) return { phase, state: "current" as const };
		if (status.present?.[phase]) return { phase, state: "done" as const };
		return { phase, state: "pending" as const };
	});
}

function railLine(status: SddChangeStatus, width: number, palette: Palette): string | null {
	const cells = phaseStates(status).map(({ phase, state }) => {
		if (state === "current") return `${palette.accent(GLYPH.focus)} ${palette.text(phase)}`;
		if (state === "done") return palette.muted(`${phase} ${GLYPH.done}`);
		if (state === "unknown") return palette.danger(`${GLYPH.unknown} ${phase}`);
		if (state === "failed") return palette.danger(`${GLYPH.failed} ${phase}`);
		return palette.muted(phase);
	});
	const line = `${INDENT}${INDENT}${cells.join("   ")}`;
	// Si el carril no cabe, no se recorta: media fase pintada miente sobre por
	// dónde va el cambio. Se retira entero y la cabecera sigue diciendo la fase.
	return visibleWidth(line) <= width ? line : null;
}

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

/**
 * Fila de bloque: la regla vertical agrupa sin encerrar, y la fila con foco se
 * distingue por una BANDA de fondo, no por un borde (STYLE.md // 002).
 */
function blockRow(
	key: string,
	title: string,
	state: "done" | "current" | "pending",
	width: number,
	palette: Palette,
): string {
	const bar = state === "current" ? palette.accent(GLYPH.rule) : palette.muted(GLYPH.rule);
	const mark = state === "done" ? palette.muted(GLYPH.done) : " ";
	const paint = state === "current" ? palette.text : palette.muted;
	const head = padVisible(palette.muted(fit(key, 6)), 7);
	const label = fit(title, Math.max(8, width - 16));
	const body = `${INDENT}${bar} ${mark} ${head}${paint(label)}`;
	if (state !== "current") return body;
	// El `▸` se ancla a la derecha, dentro de la banda.
	const pad = Math.max(1, width - visibleWidth(body) - 1);
	return band(`${body}${" ".repeat(pad)}${palette.accent(GLYPH.focus)}`, width, palette.enabled);
}

/** Las fases que aún faltan, cuando la lista de tareas ya no informa de nada. */
function remainingPhaseRows(
	status: SddChangeStatus,
	rowSpace: number,
	width: number,
	palette: Palette,
): readonly string[] {
	return phaseStates(status)
		.filter((entry) => entry.state !== "done")
		.slice(0, Math.max(0, rowSpace))
		.map(({ phase, state }) =>
			blockRow(phase, PHASE_WORK[phase], state === "pending" ? "pending" : "current", width, palette),
		);
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
	if (width < MIN_WIDTH) return [];

	// Hay trabajo abierto, solo que sin elegir. Callarse lo haría indistinguible
	// de un repo limpio, que es la otra mitad de la misma mentira.
	if (!status.change && status.selection?.kind === "ambiguous") {
		const palette = options.palette ?? createPalette(false);
		const names = status.selection.candidates.join(", ");
		const label = `${status.selection.candidates.length} cambios sin elegir`;
		return [`${INDENT}${palette.text(fit(label, Math.max(12, width - 4)))}`,
			`${INDENT}${palette.muted(fit(names, Math.max(12, width - 4)))}`];
	}
	if (!status.change) return [];

	const palette = options.palette ?? createPalette(false);
	const items = status.tasks.items;
	const done = status.tasks.counts.done;
	const progress = items.length > 0 ? `${done}/${items.length}` : "";

	// Cabecera: el cambio a la izquierda, dónde está a la derecha. Sin marco,
	// sin placa y sin `■`: el aire y el apagado hacen la jerarquía.
	const left = palette.text(fit(status.change, Math.max(12, width - 32)));
	const right = joinMeta([status.lane, String(status.nextRecommended), progress], palette);
	const pad = Math.max(1, width - visibleWidth(left) - visibleWidth(right) - INDENT.length);
	const header = `${INDENT}${left}${" ".repeat(pad)}${right}`;

	if (options.collapsed) return [header];

	const maxLines = Math.max(1, options.maxLines ?? DEFAULT_MAX_LINES);
	const lines: string[] = [header];

	const rail = maxLines >= 2 ? railLine(status, width, palette) : null;
	if (rail) lines.push(rail);

	const rowSpace = maxLines - lines.length;
	if (rowSpace <= 0) return lines;

	const currentId = status.tasks.nextPending?.id ?? null;
	// Sin tareas pendientes la lista ya no informa: el widget pasa a enseñar las
	// FASES que faltan. Es el arreglo — antes se quedaba mudo en `7/7`.
	if (items.length === 0 || currentId === null) {
		return [...lines, ...remainingPhaseRows(status, rowSpace, width, palette)];
	}

	// La cabecera y el raíl ya ocupan lo suyo. Lo que queda son filas de tarea,
	// salvo que haya que gastar una en decir cuántas se ocultaron — y ese resumen
	// solo cabe si deja sitio para al menos una tarea.
	const summaryFits = items.length > rowSpace && rowSpace >= 2;
	const { visible, hiddenDone } = selectVisibleTasks(
		items,
		currentId,
		summaryFits ? rowSpace - 1 : rowSpace,
	);
	const rows = visible.map((item) =>
		blockRow(item.id, item.title, item.done ? "done" : item.id === currentId ? "current" : "pending", width, palette),
	);

	if (summaryFits && hiddenDone > 0) {
		const word = hiddenDone === 1 ? "completada" : "completadas";
		rows.unshift(`${INDENT}${palette.muted(`… ${hiddenDone} ${word}`)}`);
	}
	return [...lines, ...rows];
}

/** Ancho visible de la línea más larga. Para pruebas de encaje. */
export function overlayWidth(lines: readonly string[]): number {
	return lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
}
