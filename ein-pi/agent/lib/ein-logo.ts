// =============================================================================
// EIN LOGO — geometría de marca, fuente única del árbol ein-pi
// El banner de arranque de Pi (`extensions/ein-banner.ts`) y el splash de la
// app de terminal (`surfaces/terminal-splash.ts`) pintan el MISMO logo; tenerlo
// dos veces garantizaba que se separasen. El installer conserva su copia a
// propósito: es un binario que corre ANTES de que exista este template.
//
// Sin colores ni escapes ANSI aquí: solo la geometría. Cada superficie pinta
// con su propio mecanismo (secuencias ANSI en Pi, atributos en OpenTUI).
// =============================================================================

// Corte grande: trazos de 4 (54 cols, 10 filas).
export const LOGO_LARGE: readonly string[] = [
	"██████████████      ████████████      ████        ████",
	"██████████████      ████████████      ██████      ████",
	"████                    ████          ███████     ████",
	"████                    ████          ████ ███    ████",
	"██████████              ████          ████  ███   ████",
	"██████████              ████          ████   ███  ████",
	"████                    ████          ████    ███ ████",
	"████                    ████          ████     ███████",
	"██████████████      ████████████      ████      ██████",
	"██████████████      ████████████      ████       █████",
];

// Corte pequeño para terminales estrechos: trazos de 3 (38 cols, 7 filas).
export const LOGO_SMALL: readonly string[] = [
	"██████████    █████████    ███     ███",
	"███              ███       ████    ███",
	"███              ███       █████   ███",
	"███████          ███       ███ ██  ███",
	"███              ███       ███  ██ ███",
	"███              ███       ███   █████",
	"██████████    █████████    ███    ████",
];

// Rango de columnas de la letra I por corte. Es el gesto de marca: la I va en
// amarillo industrial y el resto en concreto. Las columnas de hueco dentro del
// rango son espacios, así que pintarlas es inocuo.
export const I_RANGE = {
	large: { start: 18, end: 33 },
	small: { start: 12, end: 25 },
} as const;

export const RULE_CH = "─";

// El marcador de fila de la placa de specs, común a banner y app.
export const MARKER = "■";

export type LogoCut = Readonly<{
	lines: readonly string[];
	width: number;
	iStart: number;
	iEnd: number;
}>;

function padLines(lines: readonly string[]): { lines: string[]; width: number } {
	const width = Math.max(...lines.map((l) => l.length), 0);
	return { lines: lines.map((l) => l.padEnd(width)), width };
}

// Corte grande si el terminal da de sí (ancho del logo + 2 de respiro);
// pequeño si no. `columns` explícito para poder probarlo sin un TTY.
export function pickLogo(columns: number): LogoCut {
	const largeWidth = Math.max(...LOGO_LARGE.map((l) => l.length));
	const useLarge = columns >= largeWidth + 2;
	const base = padLines(useLarge ? LOGO_LARGE : LOGO_SMALL);
	const range = useLarge ? I_RANGE.large : I_RANGE.small;
	return { lines: base.lines, width: base.width, iStart: range.start, iEnd: range.end };
}

// ¿Esta columna cae en la I? Decide amarillo vs concreto en las dos superficies.
export function isIColumn(logo: LogoCut, x: number): boolean {
	return x >= logo.iStart && x <= logo.iEnd;
}

// Centra una línea en el ancho del logo. Compartido para que el subtítulo y el
// lema queden alineados igual en banner y splash.
export function centerInLogo(text: string, width: number): string {
	const pad = Math.max(0, Math.floor((width - text.length) / 2));
	return " ".repeat(pad) + text;
}
