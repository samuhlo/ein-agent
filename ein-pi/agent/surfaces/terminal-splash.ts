// =============================================================================
// TERMINAL SPLASH — la marca mientras la app arranca
// Una fila: el wordmark con la `i` en amarillo, y debajo el subtítulo con la
// versión. Se escribe a stdout crudo, antes de que OpenTUI tome la pantalla
// alterna, y la app monta encima.
//
// ANTES esto materializaba un logo de bloque de 54x10 celda a celda (░ → ▒ → ▓
// → █) con la I sellando en amarillo al final. Se retira: era un SEGUNDO
// alfabeto para una marca que en todas las demás superficies se escribe `ein`,
// y el dashboard que monta justo después ya abre con ese mismo wordmark en su
// barra superior. La pantalla decía lo mismo dos veces, con distinta letra.
//
// El gesto de marca —un solo elemento amarillo sobre neutro— sobrevive entero:
// no necesitaba 540 celdas para ocurrir.
//
// Se pinta UNA vez por proceso, y sin animación: un splash existe para tapar el
// hueco del arranque, no para cobrarlo en tiempo.
// =============================================================================

import { BRAND, BRAND_SUBTITLE } from "./terminal-theme.ts";
import { placaRows, TV_WIDTH, type TvCut, type TvTone } from "../lib/ein-tv.ts";

const SUBTITLE = BRAND_SUBTITLE;

export type SplashIO = Readonly<{
	write: (text: string) => void;
	columns: number;
	isTTY: boolean;
	noColor: boolean;
}>;

export function productionSplashIO(): SplashIO {
	return {
		write: (text) => process.stdout.write(text),
		columns: process.stdout.columns ?? 80,
		isTTY: Boolean(process.stdout.isTTY),
		noColor: Boolean(process.env.NO_COLOR),
	};
}

function hexToTriplet(hex: string): string {
	const n = Number.parseInt(hex.replace("#", ""), 16);
	return `${(n >> 16) & 0xff};${(n >> 8) & 0xff};${n & 0xff}`;
}

const FG = {
	concrete: `\x1b[38;2;${hexToTriplet(BRAND.concrete)}m`,
	structure: `\x1b[38;2;${hexToTriplet(BRAND.structure)}m`,
	yellow: `\x1b[38;2;${hexToTriplet(BRAND.yellow)}m`,
} as const;

// Tres tonos de plástico para el volumen del mueble. Es la única concesión
// fuera de los cuatro colores de marca, y va aquí y no en `brand.json` porque
// no son colores del producto: son el material de un objeto dibujado.
const TONE: Readonly<Record<TvTone, string>> = Object.freeze({
	edge: "\x1b[38;2;138;129;117m",
	body: "\x1b[38;2;110;103;92m",
	shadow: "\x1b[38;2;74;68;58m",
	knob: "\x1b[38;2;196;183;158m",
	screen: FG.concrete,
	accent: FG.yellow,
	danger: "\x1b[38;2;217;108;95m",
	dim: "\x1b[38;2;90;90;90m",
	label: FG.structure,
});
const RESET = "\x1b[39m";
const BOLD = "\x1b[1m";
const UNBOLD = "\x1b[22m";

const INDENT = "  ";

let played = false;

/**
 * El corte más grande que quepa. Un televisor cortado por la derecha no es un
 * televisor, así que se baja de corte antes que recortar.
 */
function cutFor(columns: number): TvCut {
	const room = columns - INDENT.length * 2;
	if (room >= TV_WIDTH.cabinet) return "cabinet";
	if (room >= TV_WIDTH.compact) return "compact";
	return "minimal";
}

/** Render plano y final. Es también el fallback de non-TTY / NO_COLOR. */
export function renderSplashStatic(io: SplashIO, subtitle = SUBTITLE): string {
	// La marca en placa: el lema al costado del mueble, no debajo. Es la misma
	// composición que el banner de Pi y la portada de `ein` — el aparato se
	// dibuja igual en las tres puertas del producto.
	const rows = placaRows({
		cut: cutFor(io.columns),
		subtitle,
		width: io.columns - INDENT.length * 2,
	}).map((row) =>
		row
			.map((span) => (io.noColor ? span.text : `${TONE[span.tone]}${span.text}${RESET}`))
			.join(""),
	);
	return ["", ...rows.map((row) => `${INDENT}${row}`), ""].join("\n");
}

export function resetSplashForTests(): void {
	played = false;
}

// El subtítulo lleva la versión instalada, igual que el banner del installer.
// Si no se puede leer, se cae al subtítulo pelado: nunca inventa una cifra.
export function splashSubtitle(version?: string): string {
	return version ? `${SUBTITLE} · ${version}` : SUBTITLE;
}

export async function playSplash(
	io: SplashIO = productionSplashIO(),
	version?: string,
): Promise<void> {
	if (played) return;
	played = true;
	io.write(`${renderSplashStatic(io, splashSubtitle(version))}\n`);
}
