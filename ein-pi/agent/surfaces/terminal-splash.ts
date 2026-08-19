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

import { BRAND } from "./terminal-theme.ts";

const SUBTITLE = ".samuhlo · pi workbench";

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
const RESET = "\x1b[39m";
const BOLD = "\x1b[1m";
const UNBOLD = "\x1b[22m";

const INDENT = "  ";

let played = false;

/** El wordmark con tracking: la escala de display de las mismas letras. */
function wordmark(noColor: boolean): string {
	if (noColor) return "e   i   n";
	return `${BOLD}${FG.concrete}e${RESET}   ${FG.yellow}i${RESET}   ${FG.concrete}n${RESET}${UNBOLD}`;
}

/** Render plano y final. Es también el fallback de non-TTY / NO_COLOR. */
export function renderSplashStatic(io: SplashIO, subtitle = SUBTITLE): string {
	const tag = io.noColor ? subtitle : `${FG.structure}${subtitle}${RESET}`;
	return ["", `${INDENT}${wordmark(io.noColor)}`, `${INDENT}${tag}`, ""].join("\n");
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
