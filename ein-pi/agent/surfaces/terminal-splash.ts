// =============================================================================
// TERMINAL SPLASH — el logo de marca al arrancar la app de terminal
// Mismo gesto que el installer: el logo materializa (░ → ▒ → ▓ → █) de
// izquierda a derecha, la I sella en amarillo, baja la regla y aparece el
// subtítulo. Luego la app monta encima.
//
// Por qué otra implementación y no reutilizar una: la geometría SÍ se comparte
// (`lib/ein-logo.ts`), pero el mecanismo de pintado no puede. El banner de Pi
// escribe en el buffer de la extensión (`b.add(...)`) y el installer es un
// binario aparte que corre antes de que este template exista. Aquí se escribe a
// stdout crudo, antes de que OpenTUI tome la pantalla alterna.
//
// Se toca UNA vez por proceso y nunca en non-TTY / NO_COLOR: ahí sale estático.
// =============================================================================

import { centerInLogo, isIColumn, pickLogo, RULE_CH, type LogoCut } from "../lib/ein-logo.ts";
import { BRAND } from "./terminal-theme.ts";

const SUBTITLE = ".SAMUHLO · PI WORKBENCH";

// Ritmo de la materialización, en ticks de 30 ms.
const SWEEP = 0.45; // retardo por columna
const JITTER = 7; // retardo extra pseudoaleatorio por celda
const SETTLE = 6; // ticks de ruido antes del bloque sólido
const STAMP_HOLD = 3; // ticks que la I se sella en bold
const TICK_MS = 30;
const MAX_MS = 1400; // techo duro: un splash nunca hace esperar

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
const DIM = "\x1b[2m";
const UNDIM = "\x1b[22m";

// Hash determinista por celda: el ruido es estable entre frames.
function cellHash(x: number, y: number): number {
	let h = (x * 374761393 + y * 668265263) | 0;
	h = ((h ^ (h >>> 13)) * 1274126177) | 0;
	return (h ^ (h >>> 16)) >>> 0;
}

function cellDelay(x: number, y: number): number {
	return Math.floor(x * SWEEP) + (cellHash(x, y) % JITTER);
}

function stampTick(width: number): number {
	return Math.floor((width - 1) * SWEEP) + JITTER - 1 + SETTLE + 3;
}

// Una celda en un tick: nada, ruido, bloque asentado o sello amarillo.
function cell(logo: LogoCut, x: number, y: number, ch: string, tick: number, stamp: number): string {
	const age = tick - cellDelay(x, y);
	if (age < 0) return " ";
	if (age < 2) return `${DIM}${FG.structure}░${RESET}${UNDIM}`;
	if (age < 4) return `${FG.structure}▒${RESET}`;
	if (age < SETTLE) return `${DIM}${FG.concrete}▓${RESET}${UNDIM}`;
	if (tick >= stamp && isIColumn(logo, x)) {
		return tick < stamp + STAMP_HOLD
			? `${BOLD}${FG.yellow}${ch}${RESET}${UNBOLD}`
			: `${FG.yellow}${ch}${RESET}`;
	}
	return `${FG.concrete}${ch}${RESET}`;
}

// Render plano y final. Es también el fallback de non-TTY / NO_COLOR.
export function renderSplashStatic(io: SplashIO, subtitle = SUBTITLE): string {
	const logo = pickLogo(io.columns);
	const out: string[] = [];
	if (io.noColor) {
		out.push(...logo.lines);
		out.push(RULE_CH.repeat(logo.width));
		out.push(centerInLogo(subtitle, logo.width));
		return out.join("\n");
	}
	for (const row of logo.lines) {
		let line = "";
		for (let x = 0; x < row.length; x++) {
			const ch = row[x] ?? " ";
			line += ch === " " ? " " : `${isIColumn(logo, x) ? FG.yellow : FG.concrete}${ch}${RESET}`;
		}
		out.push(line);
	}
	out.push(`${FG.structure}${RULE_CH.repeat(logo.width)}${RESET}`);
	out.push(paintSubtitle(subtitle, logo.width));
	return out.join("\n");
}

// El punto inicial en amarillo y el resto en estructura — el mismo gesto que el
// subtítulo del installer. Se construye carácter a carácter en vez de con un
// `replace`, que dependía de que el primer "." de la cadena fuese el del sello.
function paintSubtitle(subtitle: string, width: number): string {
	const pad = " ".repeat(Math.max(0, Math.floor((width - subtitle.length) / 2)));
	const head = subtitle.startsWith(".")
		? `${BOLD}${FG.yellow}.${RESET}${UNBOLD}`
		: "";
	const tail = subtitle.slice(head ? 1 : 0);
	return `${pad}${head}${FG.structure}${tail}${RESET}`;
}

function frame(logo: LogoCut, tick: number, stamp: number, subtitle: string): string[] {
	const out: string[] = [];
	for (let y = 0; y < logo.lines.length; y++) {
		const rowStr = logo.lines[y] ?? "";
		let line = "";
		for (let x = 0; x < rowStr.length; x++) {
			const ch = rowStr[x] ?? " ";
			line += ch === " " ? " " : cell(logo, x, y, ch, tick, stamp);
		}
		out.push(line);
	}
	// Regla: se abre desde el centro una vez sellada la I.
	const ruleStart = stamp + STAMP_HOLD - 1;
	if (tick < ruleStart) {
		out.push(" ".repeat(logo.width));
	} else {
		const progress = Math.min(1, (tick - ruleStart) / 6);
		const half = Math.floor((logo.width / 2) * progress);
		const center = Math.floor(logo.width / 2);
		let line = "";
		for (let x = 0; x < logo.width; x++) {
			line += Math.abs(x - center) <= half ? `${FG.structure}${RULE_CH}${RESET}` : " ";
		}
		out.push(line);
	}
	// Subtítulo: typewriter, tras la regla.
	const subStart = ruleStart + 4;
	const reveal = tick < subStart ? -1 : Math.floor((tick - subStart) * 2);
	const centered = centerInLogo(subtitle, logo.width);
	let sub = "";
	for (let i = 0; i < centered.length; i++) {
		const ch = centered[i] ?? " ";
		const visibleIndex = i - (centered.length - subtitle.length);
		if (ch === " " || visibleIndex > reveal) {
			sub += " ";
			continue;
		}
		sub += ch === "." && visibleIndex === 0
			? `${BOLD}${FG.yellow}.${RESET}${UNBOLD}`
			: `${FG.structure}${ch}${RESET}`;
	}
	out.push(sub);
	return out;
}

// NOISE KILL -> se anima una sola vez por proceso. Un resume de la app (que
// vuelve a montar el renderer) no debe replayear el logo.
let played = false;

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
	const subtitle = splashSubtitle(version);
	if (played || !io.isTTY || io.noColor) {
		if (!played) io.write(`${renderSplashStatic(io, subtitle)}\n`);
		played = true;
		return;
	}
	played = true;

	const logo = pickLogo(io.columns);
	const stamp = stampTick(logo.width);
	const rows = logo.lines.length + 2; // logo + regla + subtítulo
	const finish = stamp + STAMP_HOLD + 12;

	io.write("\x1b[?25l"); // ocultar cursor: evita parpadeo en el repintado
	io.write("\n".repeat(rows));

	await new Promise<void>((resolve) => {
		let tick = 0;
		const startedAt = Date.now();
		const timer = setInterval(() => {
			tick++;
			if (tick > finish || Date.now() - startedAt > MAX_MS) {
				clearInterval(timer);
				io.write(`\x1b[${rows}A`);
				io.write(`${renderSplashStatic(io, subtitle)}\n`);
				io.write("\x1b[?25h"); // restaurar cursor
				resolve();
				return;
			}
			io.write(`\x1b[${rows}A`);
			io.write(`${frame(logo, tick, stamp, subtitle).join("\n")}\n`);
		}, TICK_MS);
	});
}
