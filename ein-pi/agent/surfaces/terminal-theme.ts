// =============================================================================
// TERMINAL THEME — la app de terminal, en la marca
// Antes la TUI iba por libre: fondo azul #0d1118, textos azul-gris y acentos
// turquesa/morado. Nada de eso existe en la marca. Aquí se pinta con los cuatro
// colores de `brand.json` (carbón, concreto, estructura, amarillo industrial),
// los mismos que el banner de Pi y el installer.
//
// Regla de la paleta: el amarillo es ACENTO, no decoración — marca lo activo,
// lo seleccionado y la I del logo. El semáforo (ok/warn/danger) es la única
// excepción admitida, porque comunica estado, no marca.
//
// Módulo puro: solo strings. Sin OpenTUI, sin fs — testeable de un tirón.
// =============================================================================

import type { Row, RowTone } from "../lib/terminal-app.ts";
import { MARKER } from "../lib/ein-logo.ts";

// Paleta plana. Duplica los valores de brand.json a propósito: OpenTUI quiere
// hex y el cargador de marca devuelve RGB, y esta superficie no debe depender
// del fs para pintarse.
export const BRAND = {
	carbon: "#0C0011",
	concrete: "#FAF3F0",
	structure: "#737373",
	yellow: "#FFCA40",
} as const;

// Derivados mínimos, todos dentro de la familia: no son colores nuevos, son el
// mismo carbón/estructura a otra luz para separar planos sin romper la marca.
export const SURFACE = {
	// Fondo de la app: carbón. Es la base de la marca, no un azul de dev-tool.
	background: BRAND.carbon,
	// Regla estructural y bordes.
	rule: "#3A3540",
	// Texto secundario: estructura, un punto más apagado sobre carbón.
	dim: "#8A8A8A",
	// Placa de marca: texto carbón sobre amarillo (igual que el tag de versión
	// del banner de Pi).
	plateBg: BRAND.yellow,
	plateFg: BRAND.carbon,
} as const;

// Semáforo. Única concesión fuera de los cuatro colores, y solo para estado.
export const SIGNAL = {
	ok: BRAND.concrete,
	warn: BRAND.yellow,
	danger: "#E5484D",
} as const;

export type LineTone = RowTone | "selected" | "section" | "rule" | "plate";

export const TONE_COLOR: Record<LineTone, string> = {
	normal: BRAND.concrete,
	muted: SURFACE.dim,
	ok: SIGNAL.ok,
	warn: SIGNAL.warn,
	danger: SIGNAL.danger,
	selected: BRAND.yellow,
	section: BRAND.structure,
	rule: SURFACE.rule,
	plate: SURFACE.plateFg,
};

// Marcadores. Sustituyen a la distinción por color de Pi (turquesa) y Claude
// (morado): la marca no tiene dos acentos que gastar en eso, y un marcador
// sobrevive a un terminal sin color, que un tinte no.
export const MARK = {
	// Disponible / accionable.
	active: MARKER, // ■
	// Presente pero sin nada que retomar.
	idle: "□",
	// Aviso y fallo, dentro del semáforo.
	warn: "▲",
	danger: "✕",
} as const;

// FALLBACK, no sustituto: las filas del dashboard traen su propio `icon` del
// modelo (`◆` Pi, `◇` Claude, `▪` estado…) y ese manda, porque dice qué es la
// fila. `rowMark` solo pinta las que no lo traen — y ahí el marcador sale del
// TONO y de si es accionable, nunca del proveedor.
export function rowMark(row: Row): string {
	if (row.tone === "danger") return MARK.danger;
	if (row.tone === "warn") return MARK.warn;
	if (row.tone === "muted") return MARK.idle;
	return isActionable(row) ? MARK.active : MARK.idle;
}

function isActionable(row: Row): boolean {
	const kind = row.action.kind;
	return kind === "launch" || kind === "continue" || kind === "session";
}

// El color de una fila: seleccionada manda; si no, su tono.
export function rowColor(row: Row, selected: boolean): string {
	if (selected) return TONE_COLOR.selected;
	return TONE_COLOR[row.tone ?? "normal"];
}

// La regla estructural que separa cabecera y pie, al ancho disponible.
export function rule(width: number): string {
	return "─".repeat(Math.max(0, width));
}
