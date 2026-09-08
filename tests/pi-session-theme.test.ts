import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SURFACE } from "../ein-pi/agent/lib/chrome";

// =============================================================================
// LAS SUPERFICIES DERIVADAS DE LA SESIÓN
//
// ANTES esta puerta exigía lo contrario: que toda superficie ordinaria heredara
// el fondo del terminal. El resultado fue que la sesión entera era una sola
// superficie — tu mensaje, la respuesta, la acción que corre y la que falló
// llegaban sobre el mismo negro y con el mismo peso.
//
// Ahora cada emisor lleva su tinte. Lo que NO cambia es el criterio de cuándo
// no teñir: un bloque que se repinta en cada tick (el overlay del cambio, la
// actividad de subagentes) sigue sin fondo, porque una franja que aparece y
// desaparece parte la pantalla. Eso lo guardan sus propios tests.
// =============================================================================

const ESC = String.fromCharCode(27);
const FILL = new RegExp(`${ESC}\\[48;2;[0-9;]+m`);

const TOKENS = [
	"userMessageBg",
	"customMessageBg",
	"toolPendingBg",
	"toolSuccessBg",
	"toolErrorBg",
	"selectedBg",
] as const;

function readTheme(): Record<string, string> {
	// Otros tests de extensión mockean pi-tui de forma global: el tema real se
	// carga en su propio proceso.
	const output = execFileSync("bun", ["-e", `
		import { loadThemeFromPath } from "./node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
		const theme = loadThemeFromPath("./ein-pi/agent/themes/ein.json", "truecolor");
		const tokens = ${JSON.stringify(TOKENS)};
		console.log(JSON.stringify(Object.fromEntries(tokens.map((token) => [token, theme.bg(token, "x")]))));
	`], { cwd: join(import.meta.dir, ".."), encoding: "utf8", timeout: 10_000 });
	return JSON.parse(output) as Record<string, string>;
}

test("cada superficie de la sesión lleva su propio tinte", () => {
	const colors = readTheme();
	for (const token of TOKENS) expect(colors[token], token).toMatch(FILL);
});

test("ninguna comparte tinte con otra: seis emisores, seis superficies", () => {
	const colors = readTheme();
	const fills = TOKENS.map((token) => FILL.exec(colors[token]!)?.[0]);
	expect(new Set(fills).size).toBe(TOKENS.length);
});

// El hex no se elige a ojo: sale de la fórmula que STYLE // 001 documenta,
// `mix(c, α) = 11 + α · (c − 11)` por canal sobre carbón. Si alguien retoca un
// tinte sin rehacer la cuenta, esto lo dice.
test("los tintes semánticos son la mezcla declarada, no un valor a ojo", () => {
	const mix = (hex: string, alpha: number) => {
		const channel = (offset: number) =>
			Math.round(11 + alpha * (Number.parseInt(hex.slice(offset, offset + 2), 16) - 11));
		return { r: channel(1), g: channel(3), b: channel(5) };
	};
	expect(SURFACE.focus).toEqual(mix("#FFCA40", 0.08));
	expect(SURFACE.command).toEqual(mix("#FFCA40", 0.04));
	expect(SURFACE.ok).toEqual(mix("#A3B86C", 0.1));
	expect(SURFACE.failed).toEqual(mix("#D96C5F", 0.1));
});

// La superficie es refuerzo, no el portador del significado: el fondo del
// terminal no es nuestro —el esquema de tema de Pi no expone ninguna clave de
// fondo global—, así que un tinte calculado sobre carbón se ve como un parche
// en cualquier otra base. Por eso la constante vive junto a la gramática que
// dibuja la regla vertical, y no suelta en el JSON.
test("las superficies del código y las del tema no se separan", () => {
	const theme = JSON.parse(
		readFileSync(join(import.meta.dir, "..", "ein-pi/agent/themes/ein.json"), "utf8"),
	) as { vars: Record<string, string> };
	const hex = ({ r, g, b }: { r: number; g: number; b: number }) =>
		`#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
	expect(hex(SURFACE.chrome)).toBe(theme.vars.surface1);
	expect(hex(SURFACE.pending)).toBe(theme.vars.surface2);
	expect(hex(SURFACE.command)).toBe(theme.vars.cmdBg);
	expect(hex(SURFACE.ok)).toBe(theme.vars.okBg);
	expect(hex(SURFACE.failed)).toBe(theme.vars.errorBg);
	expect(hex(SURFACE.focus)).toBe(theme.vars.selectedBg);
});
