// =============================================================================
// EIN TV — vista previa en el terminal de verdad
// La marca es un dibujo de caracteres, así que lo único que decide si funciona
// es cómo la pinta TU fuente. Esto la saca por stdout con los colores reales.
//
//   bun ein-pi/agent/lib/ein-tv-preview.ts
//
// Lo que hay que mirar: que `╭╮╰╯` cierren las esquinas sin hueco, que `◉` no
// salga como un cuadro vacío, que `▤` se distinga del fondo, y que no aparezca
// una raya entre filas (interlineado holgado parte el dibujo por la mitad).
// =============================================================================

import { renderTv, tvRowWidth, type TvCut, type TvSignal, type TvTone } from "./ein-tv.ts";

const RESET = "\u001b[0m";

// Tres tonos de plástico para el volumen, más la paleta de marca. Es la técnica
// del arte ANSI: el volumen sale del color, no de la forma.
const TONE: Readonly<Record<TvTone, string>> = Object.freeze({
	edge: "\u001b[38;2;138;129;117m",
	body: "\u001b[38;2;110;103;92m",
	shadow: "\u001b[38;2;74;68;58m",
	knob: "\u001b[38;2;196;183;158m",
	screen: "\u001b[38;2;250;243;240m",
	accent: "\u001b[38;2;255;202;64m",
	danger: "\u001b[38;2;217;108;95m",
	dim: "\u001b[38;2;90;90;90m",
	label: "\u001b[38;2;115;115;115m",
});

const colour = !process.env.NO_COLOR && process.stdout.isTTY !== false;

function paint(cut: TvCut, signal: TvSignal, lines?: readonly string[], tick = 0): string {
	return renderTv({ cut, signal, lines, tick })
		.map((row) =>
			row
				.map((span) => (colour ? `${TONE[span.tone]}${span.text}${RESET}` : span.text))
				.join(""),
		)
		.join("\n");
}

function label(text: string, width: number): string {
	const dim = colour ? TONE.dim : "";
	const end = colour ? RESET : "";
	return `${dim}${text}${end}`.padEnd(width + (colour ? dim.length + end.length : 0));
}

function block(title: string, body: string): void {
	process.stdout.write(`\n  ${label(title, 0)}\n\n`);
	for (const line of body.split("\n")) process.stdout.write(`  ${line}\n`);
}

process.stdout.write("\n");
block("completo · 30x15", paint("full", "idle"));
block("mueble · 30x8", paint("cabinet", "idle"));
block("compacto · 16x7", paint("compact", "idle"));
block("minimo · 14x3", paint("minimal", "idle"));
block("emitiendo", paint("cabinet", "working", ["update-astro-docs", "▸ apply · 3/7"]));
block("sin senal · fotograma 0", paint("cabinet", "static", undefined, 0));
block("sin senal · fotograma 1", paint("cabinet", "static", undefined, 1));
block("en espera", paint("cabinet", "standby"));

const widths = (["full", "cabinet", "compact", "minimal"] as const)
	.map((cut) => `${cut} ${Math.max(...renderTv({ cut }).map(tvRowWidth))}`)
	.join("  ·  ");
process.stdout.write(`\n  ${label(`anchos medidos: ${widths}`, 0)}\n\n`);
