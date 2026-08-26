// =============================================================================
// EIN TV — la marca, fuente única del árbol ein-pi
// Un televisor de tubo con una terminal dentro. El objeto es la marca; lo que
// hay en la pantalla es solo lo que está emitiendo.
//
// POR QUÉ UN OBJETO Y NO UNAS LETRAS -> dibujar una letra con bloques es
// pelearse con una rejilla de 2×4 píxeles: sale roma, y el fallo se ve porque
// todo el mundo sabe cómo es una E. Un televisor son cuatro rectángulos y dos
// ruedas — se reconoce aunque la silueta sea aproximada. Y de paso las letras de
// dentro son TEXTO, no dibujo, así que no hay letterform que falle.
//
// La antena y las patas solo las lleva `full`, y ninguna superficie lo elige ya:
// el mueble solo es un rectángulo, así que todas sus filas miden lo mismo y el
// centrado por fila deja de descolocarlo.
//
// Sin colores ni escapes ANSI aquí: solo la geometría y qué tono lleva cada
// tramo. Cada superficie pinta con su mecanismo (secuencias ANSI en Pi,
// atributos en OpenTUI, spans en el instalador).
// =============================================================================

/** Tramo de una fila: el texto y con qué tono se pinta. */
export type TvTone = "edge" | "body" | "shadow" | "knob" | "screen" | "accent" | "danger" | "dim" | "label";
export type TvSpan = Readonly<{ text: string; tone: TvTone }>;
export type TvRow = readonly TvSpan[];

/** Cortes. Cada uno pierde una pieza; ninguno es el anterior encogido. */
export type TvCut = "full" | "cabinet" | "compact" | "minimal";

/** Qué emite la pantalla. El aparato no cambia. */
export type TvSignal = "idle" | "working" | "static" | "standby";

export type TvOptions = Readonly<{
	cut?: TvCut;
	signal?: TvSignal;
	/** Lo que se lee dentro con `working`: dos líneas como mucho. */
	lines?: readonly string[];
	/** Fotograma de la nieve, para animarla desde fuera. */
	tick?: number;
}>;

const s = (text: string, tone: TvTone): TvSpan => ({ text, tone });

/** Ancho interior del cristal por corte, para centrar lo que se emite. */
const SCREEN_W: Readonly<Record<TvCut, number>> = Object.freeze({
	full: 22,
	cabinet: 22,
	compact: 10,
	minimal: 12,
});

export const TV_WIDTH: Readonly<Record<TvCut, number>> = Object.freeze({
	full: 30,
	cabinet: 30,
	compact: 16,
	minimal: 14,
});

/**
 * LA PLACA. El aire entre el mueble y la marca, y en qué fila del mueble se
 * apoya cada línea. No son «arriba y abajo» genéricos: cada corte tiene su
 * altura, y el texto tiene que caer contra la pantalla, no contra los bordes.
 * Vive aquí y no en cada superficie porque es geometría del aparato.
 */
export const BAND_GUTTER = 3;
export const BAND_ANCHORS: Readonly<Record<TvCut, { subtitle: number; versions: number }>> = Object.freeze({
	full: { subtitle: 6, versions: 8 },
	cabinet: { subtitle: 2, versions: 4 },
	compact: { subtitle: 1, versions: 3 },
	minimal: { subtitle: 0, versions: 2 },
});

function center(text: string, width: number): string {
	const cut = text.length > width ? text.slice(0, width) : text;
	const left = Math.max(0, Math.floor((width - cut.length) / 2));
	return " ".repeat(left) + cut + " ".repeat(Math.max(0, width - left - cut.length));
}

/** La palabra `ein` con la `i` en acento, más el cursor. El gesto de marca. */
function wordmarkSpans(width: number): TvSpan[] {
	const mark = "ein▏";
	const left = Math.max(0, Math.floor((width - mark.length) / 2));
	const right = Math.max(0, width - left - mark.length);
	return [
		s(" ".repeat(left), "screen"),
		s("e", "screen"),
		s("i", "accent"),
		s("n", "screen"),
		s("▏", "accent"),
		s(" ".repeat(right), "screen"),
	];
}

// Nieve: dos tramas que se alternan. Con tres densidades basta — el ojo
// completa el ruido, y dos fotogramas ya leen como estática.
const SNOW = Object.freeze([
	Object.freeze(["░▒█░ ▓░▒▓█ ░▓▒ ░█▒▓░ ", "▒░▓█ ░▒█▓░ █▓░ ▒░█▓▒ ", "▓█░▒ █░▓▒░ ▒▓█ ░▓▒█░ "]),
	Object.freeze(["▓█░▒ ░▓█▒░ ▒█░ ▓░▒█▓ ", "█▓▒░ ▓█░▒▓ ░▒█ ▓▒░█░ ", "░▒▓█ ▒▓░█▓ ░█▒ ▓█░▒▓ "]),
]);

/** Las filas del cristal, según lo que se esté emitiendo. */
function screenRows(options: TvOptions, cut: TvCut, height: number): TvRow[] {
	const width = SCREEN_W[cut];
	const blank = (): TvRow => [s(" ".repeat(width), "screen")];
	const signal = options.signal ?? "idle";

	if (signal === "standby") return Array.from({ length: height }, blank);

	if (signal === "static") {
		const frame = SNOW[(options.tick ?? 0) % SNOW.length] ?? SNOW[0]!;
		return Array.from({ length: height }, (_unused, index): TvRow => [
			s((frame[index % frame.length] ?? "").slice(0, width).padEnd(width), "dim"),
		]);
	}

	if (signal === "working") {
		const lines = (options.lines ?? []).slice(0, Math.max(0, height - 1));
		const rows: TvRow[] = [];
		const pad = Math.max(0, height - lines.length - 1);
		const top = Math.floor(pad / 2);
		for (let index = 0; index < top; index += 1) rows.push(blank());
		for (const line of lines) rows.push([s(center(line, width), "screen")]);
		while (rows.length < height) rows.push(blank());
		return rows.slice(0, height);
	}

	// idle: el wordmark centrado en vertical.
	const rows: TvRow[] = [];
	const middle = Math.floor((height - 1) / 2);
	for (let index = 0; index < height; index += 1) {
		rows.push(index === middle ? wordmarkSpans(width) : blank());
	}
	return rows;
}

/**
 * El aparato entero, fila a fila. `standby` apaga el mueble: el piloto es lo
 * único que queda encendido, que es lo que hace un televisor real.
 */
export function renderTv(options: TvOptions = {}): readonly TvRow[] {
	const cut = options.cut ?? "full";
	const signal = options.signal ?? "idle";
	const off = signal === "standby";
	const edge: TvTone = off ? "shadow" : "edge";
	const bezel: TvTone = off ? "shadow" : "shadow";
	const knob: TvTone = off ? "shadow" : "knob";
	const power: TvTone = signal === "static" ? "danger" : signal === "working" ? "accent" : off ? "danger" : "knob";

	if (cut === "minimal") {
		return [
			[s("╭────────────╮", edge)],
			[s("│", edge), ...wordmarkSpans(12), s("│", edge)],
			[s("╰─", edge), s("◉", power), s("──────", edge), s("▤▤", bezel), s("──╯", edge)],
		];
	}

	if (cut === "compact") {
		const glass = screenRows(options, cut, 1);
		return [
			[s("╭──────────────╮", edge)],
			[s("│ ", edge), s("╭──────────╮", bezel), s(" │", edge)],
			[s("│ ", edge), s("│", bezel), ...(glass[0] ?? []), s("│", bezel), s(" │", edge)],
			[s("│ ", edge), s("╰──────────╯", bezel), s(" │", edge)],
			[s("│ ", edge), s("◉", power), s(" ", edge), s("◉", knob), s("    ", edge), s("▤▤▤▤", bezel), s("  │", edge)],
			[s("╰──────────────╯", edge)],
		];
	}

	const glass = screenRows(options, cut, 3);
	const cabinet: TvRow[] = [
		[s("╭────────────────────────────╮", edge)],
		[s("│  ", edge), s("╭──────────────────────╮", bezel), s("  │", edge)],
		...glass.map((row): TvRow => [s("│  ", edge), s("│", bezel), ...row, s("│", bezel), s("  │", edge)]),
		[s("│  ", edge), s("╰──────────────────────╯", bezel), s("  │", edge)],
		[s("│   ", edge), s("◉", power), s("    ", edge), s("◉", knob), s("         ", edge), s("▤▤▤▤▤▤▤", bezel), s("   │", edge)],
		[s("╰────────────────────────────╯", edge)],
	];

	if (cut === "cabinet") return cabinet;

	return [
		[s("    ╲                    ╱", bezel)],
		[s("     ╲                  ╱", bezel)],
		[s("      ╲                ╱", bezel)],
		[s("       ╲              ╱", bezel)],
		...cabinet,
		[s("     ▀▀▀              ▀▀▀", bezel)],
	];
}

export type PlacaOptions = Readonly<{
	cut?: TvCut;
	/** Lo que se lee a la altura de la pantalla. */
	subtitle: string;
	/** Lo que se lee bajo el subtítulo. Vacío = no se dibuja esa línea. */
	tag?: string;
	/** Columnas disponibles. Si no dan, la marca se apila en vez de recortarse. */
	width: number;
}>;

/**
 * LA PLACA: el mueble a la izquierda y el texto de marca a su costado.
 *
 * Vive aquí, con el aparato, y no en cada superficie: el banner de Pi, la
 * portada de `ein` y el instalador dibujan la MISMA marca, y tres copias de la
 * misma composición son tres sitios donde puede divergir.
 *
 * Si el ancho no da para mueble + aire + el texto más largo, la marca se APILA.
 * Un televisor cortado por la derecha no es un televisor, y un lema recortado
 * tampoco es un lema: lo que cede es la composición, nunca la marca.
 */
export function placaRows(options: PlacaOptions): readonly TvRow[] {
	const cut = options.cut ?? "cabinet";
	const art = renderTv({ cut });
	const artWidth = Math.max(...art.map(tvRowWidth));
	const tag = options.tag ?? "";
	const textWidth = Math.max([...options.subtitle].length, [...tag].length);
	const anchors = BAND_ANCHORS[cut];

	if (artWidth + BAND_GUTTER + textWidth > options.width) {
		const stacked: TvRow[] = [...art, [s("", "screen")], [s(options.subtitle, "label")]];
		if (tag) stacked.push([s(tag, "label")]);
		return stacked;
	}

	const gutter = s(" ".repeat(BAND_GUTTER), "screen");
	return art.map((row, index): TvRow => {
		if (index === anchors.subtitle) return [...row, gutter, s(options.subtitle, "label")];
		if (tag && index === anchors.versions) return [...row, gutter, s(tag, "label")];
		return row;
	});
}

/** Ancho visible de una fila, para centrar el aparato en su superficie. */
export function tvRowWidth(row: TvRow): number {
	return row.reduce((total, span) => total + [...span.text].length, 0);
}
