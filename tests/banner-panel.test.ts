// =============================================================================
// TESTS: el panel de estado del banner (estilo 16 bits)
// La queja concreta que originó el rediseño: HEAD/LOCAL/UPSTREAM nunca estaban
// alineados, porque las filas de git se pintaban aparte de la placa y con su
// propio ancho de etiqueta. El panel las mete en la MISMA rejilla, y eso es lo
// que fijan estos tests — junto a que la animación abra y cierre entera.
// =============================================================================

import { describe, expect, test } from "bun:test";
import {
	PANEL_W,
	composeColumns,
	composedWidth,
	lineWidth,
	panelDuration,
	panelRows,
	renderPanel,
	type PanelData,
} from "../ein-pi/agent/lib/banner-panel";

const data: PanelData = {
	plate: " EIN v0.60.1 ",
	right: "PI v0.84.1",
	sections: [
		{ kind: "fields", title: "SISTEMA", fields: [
			{ label: "AGENTES", value: "12" },
			{ label: "MCP", value: "3 srv" } ] },
		{ kind: "chips", label: "ACTIVO", chips: [
			{ text: "hypa", on: true },
			{ text: "architect", on: false } ] },
		{ kind: "fields", title: "REPO", fields: [
			{ label: "PROYECTO", value: "~/dev/ein-agent" },
			{ label: "HEAD", value: "main" },
			{ label: "LOCAL", value: "limpio" },
			{ label: "UPSTREAM", value: "al dia con origin/main" } ] },
		{ kind: "loose", fields: [
			{ label: "RECIENTES", value: "ein-agent", trail: "hace 2 h" },
			{ label: "", value: "pi -c continuar", note: true } ] },
	],
};

const plain = (tick: number): string[] =>
	renderPanel(data, tick).map((line) => line.map((cell) => cell.text).join(""));

describe("panel de estado", () => {
	// EL test del rediseño. Antes esto era imposible: git iba por libre.
	test("todas las filas miden lo mismo — el marco cierra en columna", () => {
		const lines = plain(panelDuration(data));
		expect(lines.length).toBeGreaterThan(10);
		for (const line of lines) expect([...line].length).toBe(PANEL_W);
	});

	test("git y el resto comparten rejilla: los valores arrancan en la misma columna", () => {
		const lines = plain(panelDuration(data));
		const columnOf = (label: string) => {
			const line = lines.find((item) => item.includes(label));
			expect(line).toBeDefined();
			// El valor empieza tras el último punto de la línea de puntos.
			return line!.lastIndexOf("·");
		};
		// Distintas secciones, misma rejilla: todas las etiquetas ocupan el mismo
		// ancho, así que el recorrido de puntos arranca donde mismo.
		for (const label of ["AGENTES", "HEAD", "LOCAL", "UPSTREAM", "PROYECTO"]) {
			const line = lines.find((item) => item.includes(label))!;
			expect(line.indexOf("·")).toBe(15);
		}
		expect(columnOf("HEAD")).toBeGreaterThan(0);
	});

	test("abre por fases: marco, cabecera y filas en cascada", () => {
		expect(renderPanel(data, 0)).toHaveLength(0);
		// A mitad del barrido solo existe el borde superior, aún sin esquina.
		const opening = plain(3);
		expect(opening).toHaveLength(1);
		expect(opening[0]!.startsWith("╔")).toBe(true);
		expect(opening[0]!.endsWith("╗")).toBe(false);
		// Con el marco cerrado ya hay cabecera, pero no todas las filas.
		const mid = plain(8);
		expect(mid.length).toBeGreaterThan(2);
		expect(mid.length).toBeLessThan(plain(panelDuration(data)).length);
	});

	test("el marco solo cierra cuando la última fila ha terminado", () => {
		const total = panelDuration(data);
		expect(plain(total).at(-1)!.startsWith("╚")).toBe(true);
		expect(plain(total - 3).at(-1)!.startsWith("╚")).toBe(false);
	});

	test("una nota ocupa el ancho entero: sin etiqueta y sin puntos", () => {
		const line = plain(panelDuration(data)).find((item) => item.includes("pi -c continuar"))!;
		expect(line).not.toContain("·");
		// Pegada al borde, no sangrada al ancho de etiqueta.
		expect(line.indexOf("pi -c")).toBe(2);
	});

	test("lo apagado se muestra en hueco, no desaparece", () => {
		const line = plain(panelDuration(data)).find((item) => item.includes("ACTIVO"))!;
		expect(line).toContain("◆ hypa");
		expect(line).toContain("◇ architect");
	});

	test("un valor demasiado largo se recorta y NO desborda el marco", () => {
		const wide: PanelData = { ...data, sections: [{ kind: "fields", title: "X", fields: [
			{ label: "LARGO", value: "x".repeat(400) }] }] };
		for (const line of renderPanel(wide, panelDuration(wide)).map((l) => l.map((c) => c.text).join(""))) {
			expect([...line].length).toBe(PANEL_W);
		}
	});

	test("panelRows separa secciones con un hueco y no abre con uno", () => {
		const rows = panelRows(data);
		expect(rows[0]!.kind).toBe("tab");
		expect(rows.filter((row) => row.kind === "blank").length).toBe(data.sections.length - 1);
	});
});

// =============================================================================
// El logo NO debe moverse cuando aparece el panel. Antes el centrado se
// calculaba solo sobre lo dibujado, asi que al abrir la caja el EIN saltaba a
// la izquierda: eso era el "barrido" que lo recolocaba.
// =============================================================================
describe("composicion en dos columnas", () => {
	type C = { text: string };
	const logo: C[][] = [[{ text: "X".repeat(54) }], [{ text: "Y".repeat(20) }]];
	const pad = (width: number): C => ({ text: " ".repeat(width) });

	test("toda linea mide el ancho compuesto, con panel o sin el", () => {
		const total = composedWidth(54);
		for (const right of [[], [[{ text: "P".repeat(PANEL_W) }]]]) {
			for (const line of composeColumns<C, C>(logo, 54, right, pad)) {
				expect(lineWidth(line)).toBe(total);
			}
		}
	});

	test("la columna izquierda arranca en la misma columna en todos los casos", () => {
		const withPanel = composeColumns<C, C>(logo, 54, [[{ text: "P".repeat(PANEL_W) }]], pad);
		const without = composeColumns<C, C>(logo, 54, [], pad);
		expect(lineWidth(withPanel[0]!)).toBe(lineWidth(without[0]!));
	});

	test("la columna corta se centra en vertical", () => {
		const right = Array.from({ length: 10 }, () => [{ text: "P".repeat(PANEL_W) }]);
		const composed = composeColumns<C, C>(logo, 54, right, pad);
		expect(composed).toHaveLength(10);
		// El logo (2 filas) cae en el centro de las 10, no pegado arriba.
		const first = composed.findIndex((line) => line[0]!.text.startsWith("X"));
		expect(first).toBe(4);
	});
});
