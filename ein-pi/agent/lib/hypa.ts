// =============================================================================
// [CORE] HYPA WRAP
// Compresión determinista de salida de comandos vía Hypa (binario externo).
// Ein NO usa la extensión pi-hypa: envuelve él mismo el tool `bash` para
// controlar el orden (guardrails sobre el comando ORIGINAL primero) y para
// soportar el stack Bun, que los reducers de Hypa no reconocen de fábrica.
//
// FORGE -> `bunx vitest` → `vitest` (Hypa matchea por regex ^(npx|pnpm)?...,
// no acepta bunx). Al quitar el prefijo se inyecta ./node_modules/.bin en el
// PATH externo para que el binario local resuelva sin romper el anchor.
//
// FAIL CLOSED -> solo se envuelve un allowlist de tools con reducer real y
// que terminan; cualquier operador de shell, comilla, o marca de streaming/
// interactivo (dev, serve, --watch, logs, -f, -it) desactiva el wrap. El
// genérico se deja crudo a propósito: de eso ya se encarga context-mode.
// Módulo puro en su núcleo (build/normalize) para testear sin spawns.
// =============================================================================

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// auto = detección de stack (on en toolchains verbosos no-Bun, off en Bun puro).
// on/off fuerzan. No hay "ask": el onboarding es quien pregunta; Hypa es estable
// por proyecto, un ask por sesión solo sería ruido.
export type HypaMode = "auto" | "on" | "off";

export const HYPA_OPTIONS: readonly HypaMode[] = ["auto", "on", "off"];

const DEFAULT_HYPA: HypaMode = "auto";

// Tools con reducer semántico en Hypa que terminan (no streaming). Cabeza del
// comando ya normalizado. git se restringe aparte a subcomandos de lectura.
const REDUCER_HEADS = new Set([
	"git",
	"vitest", "jest", "eslint", "biome", "oxlint",
	"pytest", "mocha", "playwright",
	"dotnet", "cargo", "go", "gradle", "mvn",
	"terraform", "tofu",
]);

// Subcomandos de git con reducer y sin editor/interacción. `commit` abriría
// editor; `push`/`pull` son entrega, no lectura → fuera.
const GIT_READ_SUBCMDS = new Set(["diff", "status", "log", "show"]);

// Binarios node que se invocan vía bunx/bun y viven en ./node_modules/.bin.
const LOCAL_BIN_TOOLS = new Set([
	"vitest", "jest", "eslint", "biome", "oxlint", "playwright", "mocha",
]);

const BUN_PREFIX = /^(?:bunx|bun\s+x|bun\s+run)\s+/;

// NOISE KILL -> operadores de shell y comillas rompen el `-c "..."`; se dejan
// crudos antes que arriesgar un quoting inválido o partir la semántica.
const UNSAFE_SHELL = /[|<>`"]|\$\(|&&|\|\||;/;

// HARD STOP -> marcas de comando que no termina o pide TTY. Bufferearlas cuelga
// (dev server, follow de logs, watch, shell interactiva).
const INTERACTIVE_MARKER =
	/(?:^|\s)(?:--watch|-w|--ui|--follow|-f|-it|dev|serve|start|watch|attach|--inspect)(?:\s|$)/;

// ─── Normalización de prefijo Bun ────────────────────────────────────────────

export interface Normalized {
	command: string;
	// ¿Se quitó un prefijo bun y la cabeza es un binario local? → inyectar PATH.
	injectLocalBin: boolean;
}

export function normalizeBunPrefix(command: string): Normalized {
	const trimmed = command.trim();
	const match = trimmed.match(BUN_PREFIX);
	if (!match) return { command: trimmed, injectLocalBin: false };

	const rest = trimmed.slice(match[0].length).trim();
	const head = rest.split(/\s+/)[0] ?? "";
	// `bun run lint` (script de package.json) no se toca: "lint" no es un tool.
	if (!REDUCER_HEADS.has(head)) return { command: trimmed, injectLocalBin: false };

	return { command: rest, injectLocalBin: LOCAL_BIN_TOOLS.has(head) };
}

// ─── Decisión de envoltura ───────────────────────────────────────────────────

function isReducerTarget(command: string): boolean {
	const tokens = command.split(/\s+/);
	const head = tokens[0] ?? "";
	if (!REDUCER_HEADS.has(head)) return false;
	// GUARD -> git solo en lectura (diff/status/log/show); el resto abre editor
	// o es entrega, sin valor de compresión.
	if (head === "git") return GIT_READ_SUBCMDS.has(tokens[1] ?? "");
	return true;
}

// Construye el comando envuelto en Hypa, o null si no procede tocarlo.
// FAIL CLOSED en cada duda: cualquier condición rara → null (crudo).
export function buildHypaCommand(
	original: string,
	hypaBin: string,
): string | null {
	const trimmed = original.trim();
	if (trimmed === "") return null;
	if (UNSAFE_SHELL.test(trimmed)) return null;
	if (INTERACTIVE_MARKER.test(trimmed)) return null;

	const { command, injectLocalBin } = normalizeBunPrefix(trimmed);
	if (!isReducerTarget(command)) return null;

	const wrapped = `${hypaBin} -c "${command}"`;
	return injectLocalBin
		? `env PATH="./node_modules/.bin:$PATH" ${wrapped}`
		: wrapped;
}

// ─── Resolución del binario ──────────────────────────────────────────────────

// Rutas donde el installer/mise dejan hypa. Se prefiere HYPA_BIN explícito.
export function resolveHypaBin(): string | undefined {
	const explicit = process.env.HYPA_BIN;
	if (explicit && existsSync(explicit)) return explicit;
	const candidates = [
		join(homedir(), ".local", "share", "mise", "shims", "hypa"),
		join(homedir(), ".local", "bin", "hypa"),
	];
	return candidates.find((path) => existsSync(path));
}

// ─── Detección de stack (modo auto) ──────────────────────────────────────────

// Toolchains verbosos NO-Bun donde los reducers de Hypa ganan de verdad
// (90-100% menos ruido). En Bun puro el output ya es terso → no aporta.
const STACK_FILES = new Set([
	"pom.xml", "go.mod", "Cargo.toml", "pyproject.toml", "requirements.txt",
	"Chart.yaml", "Dockerfile",
]);
const STACK_EXTS = [".csproj", ".sln", ".tf"];

// FORGE -> escanea el nivel raíz del proyecto buscando marcas de stack verboso.
// Determinista (solo existencia de ficheros), sin heurística difusa.
export function detectStackWantsHypa(cwd: string): boolean {
	let entries: string[];
	try {
		entries = readdirSync(cwd);
	} catch {
		return false;
	}
	for (const name of entries) {
		if (STACK_FILES.has(name)) return true;
		if (name.startsWith("build.gradle")) return true;
		if (STACK_EXTS.some((ext) => name.endsWith(ext))) return true;
	}
	return false;
}

// ¿Debe envolverse en este proyecto? Resuelve el modo a un booleano.
export function resolveHypaEnabled(cwd: string): boolean {
	switch (readHypaMode(cwd)) {
		case "on":
			return true;
		case "off":
			return false;
		default:
			return detectStackWantsHypa(cwd);
	}
}

// ─── Config por proyecto (.pi/ein/hypa.json) ─────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHypa(value: unknown): HypaMode | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	return (HYPA_OPTIONS as readonly string[]).includes(token)
		? (token as HypaMode)
		: undefined;
}

export function hypaConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "hypa.json");
}

export function readHypaMode(cwd: string): HypaMode {
	const path = hypaConfigPath(cwd);
	if (!existsSync(path)) return DEFAULT_HYPA;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed)) return normalizeHypa(parsed.mode) ?? DEFAULT_HYPA;
	} catch {
		// fichero ausente o roto → default
	}
	return DEFAULT_HYPA;
}

export function writeHypaMode(cwd: string, mode: HypaMode): void {
	const path = hypaConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
}

// Envoltura efectiva: muta el input del tool bash in-place (contrato de Pi:
// "To modify arguments, mutate event.input in place"). No-op si Hypa está off,
// sin binario, o el comando no es envolvible.
export function maybeWrapBashInput(
	input: { command: string },
	cwd: string,
): void {
	if (!resolveHypaEnabled(cwd)) return;
	const bin = resolveHypaBin();
	if (!bin) return;
	const wrapped = buildHypaCommand(input.command, bin);
	if (wrapped) input.command = wrapped;
}

// ─── Comando /ein:hypa ───────────────────────────────────────────────────────

const HYPA_LABEL: Record<HypaMode, string> = {
	auto: "auto — detecta stack (on en dotnet/gradle/tf…, off en Bun puro)",
	on: "on — envuelve siempre tools con reducer (git/vitest/eslint…)",
	off: "off — bash crudo (context-mode sigue capando la salida)",
};

export async function handleHypaCommand(ctx: ExtensionContext): Promise<void> {
	const current = readHypaMode(ctx.cwd);
	const bin = resolveHypaBin();
	const items: string[] = HYPA_OPTIONS.map((m) => HYPA_LABEL[m]);
	const picked = await ctx.ui.select(
		`Compresión Hypa (actual: ${current})`,
		items,
	);
	// CORTE -> select cancelado (undefined) no cambia nada.
	if (picked === undefined) return;
	const mode = HYPA_OPTIONS[items.indexOf(picked)];
	if (!mode) return;
	writeHypaMode(ctx.cwd, mode);
	const enabled = resolveHypaEnabled(ctx.cwd);
	ctx.ui.notify(
		[
			`Hypa: ${mode}${mode === "auto" ? ` (este proyecto → ${enabled ? "on" : "off"})` : ""}`,
			bin
				? `Binario: ${bin}`
				: "BLINDAJE -> hypa no encontrado en PATH; el wrap queda inerte hasta instalarlo.",
			enabled
				? "Se envuelven solo tools con reducer real; streaming/interactivo/genérico quedan crudos."
				: "Los comandos pasan sin tocar.",
			`Config: ${hypaConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre sesión nueva para que tome efecto.",
		].join("\n"),
		"info",
	);
}
