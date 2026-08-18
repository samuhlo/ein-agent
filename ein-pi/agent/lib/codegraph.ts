// =============================================================================
// [CORE] CODEGRAPH
// Grafo de código determinista (colbymchenry/codegraph) por la ruta CLI-over-
// bash: los agentes llaman `codegraph explore` en vez de reconstruir call
// paths con docenas de grep/read. Sin MCP a propósito — el interop con
// pi-mcp-adapter cuelga; el CLI da los mismos payloads medidos (-38% mediana,
// -85% en ficheros grandes) sin adapter ni daemon.
//
// FAIL CLOSED -> la directiva solo se inyecta si hay binario Y el proyecto
// está indexado (.codegraph/). Sin cualquiera de los dos: cero líneas de
// prompt, los agentes exploran como siempre. Forzar la directiva sin índice
// seguiría siendo mentirle al modelo, y eso no cambia.
//
// Modos: on (default) | off. `on` NO fuerza la directiva: declara que este
// proyecto quiere el grafo, y cuando falta el índice Ein OFRECE crearlo en vez
// de callarse. El modo antiguo `auto` significaba "solo si ya está indexado",
// que en un proyecto que nunca lo arrancó era un no permanente sin salida; se
// lee como `on` para no romper la config existente. Calcado de tdd.ts/hypa.ts.
// =============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type CodegraphMode = "on" | "off";

export const CODEGRAPH_OPTIONS: readonly CodegraphMode[] = ["on", "off"];

const DEFAULT_CODEGRAPH: CodegraphMode = "on";

// Valor heredado de la config anterior. Significaba lo mismo que `on` menos la
// oferta de inicializar, así que se lee como `on` y se reescribe al guardar.
const LEGACY_ON = "auto";

// ─── Resolución de binario e índice ──────────────────────────────────────────

// Rutas donde npm-global/mise/installer dejan el CLI. CODEGRAPH_BIN manda.
export function resolveCodegraphBin(): string | undefined {
	const explicit = process.env.CODEGRAPH_BIN;
	if (explicit && existsSync(explicit)) return explicit;
	const candidates = [
		join(homedir(), ".local", "share", "mise", "shims", "codegraph"),
		join(homedir(), ".local", "bin", "codegraph"),
		join(homedir(), ".bun", "bin", "codegraph"),
	];
	return candidates.find((path) => existsSync(path));
}

export function projectIndexed(cwd: string): boolean {
	return existsSync(join(cwd, ".codegraph"));
}

// ¿Directiva activa en este proyecto? bin + índice + modo ≠ off.
export function resolveCodegraphEnabled(cwd: string): boolean {
	if (readCodegraphMode(cwd) === "off") return false;
	return resolveCodegraphBin() !== undefined && projectIndexed(cwd);
}

// ─── Config por proyecto (.pi/ein/codegraph.json) ────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown): CodegraphMode | undefined {
	if (typeof value !== "string") return undefined;
	const token = value.trim().toLowerCase();
	if (token === LEGACY_ON) return "on";
	return (CODEGRAPH_OPTIONS as readonly string[]).includes(token)
		? (token as CodegraphMode)
		: undefined;
}

export function codegraphConfigPath(cwd: string): string {
	return join(cwd, ".pi", "ein", "codegraph.json");
}

export function readCodegraphMode(cwd: string): CodegraphMode {
	const path = codegraphConfigPath(cwd);
	if (!existsSync(path)) return DEFAULT_CODEGRAPH;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (isRecord(parsed)) return normalizeMode(parsed.mode) ?? DEFAULT_CODEGRAPH;
	} catch {
		// fichero ausente o roto → default
	}
	return DEFAULT_CODEGRAPH;
}

export function writeCodegraphMode(cwd: string, mode: CodegraphMode): void {
	writeCodegraphConfig(cwd, mode, codegraphInitPrompted(cwd));
}

function writeCodegraphConfig(cwd: string, mode: CodegraphMode, prompted: boolean): void {
	const path = codegraphConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode, ...(prompted ? { prompted: true } : {}) }, null, 2)}\n`);
}

// ─── Inicialización del índice ───────────────────────────────────────────────

export type CodegraphInitOutcome =
	| { ok: true; alreadyIndexed: boolean }
	| { ok: false; reason: "no-binary" | "no-index-created" | "failed"; detail: string };

/** Ejecutor inyectable: los tests no lanzan procesos. */
export type CommandRunner = (bin: string, args: readonly string[], cwd: string) => { code: number; output: string };

const defaultRunner: CommandRunner = (bin, args, cwd) => {
	try {
		const output = execFileSync(bin, [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		return { code: 0, output };
	} catch (error) {
		const shaped = error as { status?: number; stdout?: string; stderr?: string; message?: string };
		return { code: shaped.status ?? 1, output: `${shaped.stdout ?? ""}${shaped.stderr ?? ""}${shaped.message ?? ""}` };
	}
};

/**
 * Crea el índice del proyecto. NUNCA en silencio: el llamante pregunta antes.
 *
 * El código de salida NO basta como evidencia. Medido contra la CLI 1.5.0: en
 * un directorio sin ficheros indexables dice "No files found to index" y sale
 * con 0. Así que el éxito se comprueba mirando si `.codegraph/` existe después,
 * que es el hecho que de verdad importa.
 *
 * Reejecutarlo sobre un proyecto ya indexado es inofensivo: la CLI no
 * reconstruye, responde en ~50 ms remitiendo a `codegraph index`.
 */
export function initializeCodegraph(
	cwd: string,
	run: CommandRunner = defaultRunner,
	// Inyectable porque `resolveCodegraphBin` cae a rutas del sistema y no se
	// puede forzar a "no hay" desde fuera: en una máquina con codegraph
	// instalado, la rama "sin binario" quedaría sin probar.
	findBin: () => string | undefined = resolveCodegraphBin,
): CodegraphInitOutcome {
	const bin = findBin();
	if (!bin) return { ok: false, reason: "no-binary", detail: "no hay binario de codegraph en el PATH" };
	if (projectIndexed(cwd)) return { ok: true, alreadyIndexed: true };

	const result = run(bin, ["init", cwd], cwd);
	if (!projectIndexed(cwd)) {
		// Salida 0 sin índice = el caso "No files found to index". No es un fallo
		// del comando, es que aquí no hay nada que indexar; se dice tal cual.
		const reason = result.code === 0 ? "no-index-created" : "failed";
		return { ok: false, reason, detail: result.output.trim().slice(0, 400) || `salida ${result.code}` };
	}
	return { ok: true, alreadyIndexed: false };
}

/**
 * ¿Toca ofrecer la inicialización? Solo con intención declarada (`on`), binario
 * disponible, sin índice y sin haber preguntado ya en este proyecto.
 */
export function shouldOfferCodegraphInit(
	cwd: string,
	findBin: () => string | undefined = resolveCodegraphBin,
): boolean {
	if (readCodegraphMode(cwd) === "off") return false;
	if (codegraphInitPrompted(cwd)) return false;
	return findBin() !== undefined && !projectIndexed(cwd);
}

/** Preguntar una vez por proyecto. Un aviso que se repite cada sesión es ruido. */
export function codegraphInitPrompted(cwd: string): boolean {
	const path = codegraphConfigPath(cwd);
	if (!existsSync(path)) return false;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		return isRecord(parsed) && parsed.prompted === true;
	} catch {
		return false;
	}
}

export function markCodegraphInitPrompted(cwd: string): void {
	writeCodegraphConfig(cwd, readCodegraphMode(cwd), true);
}

// ─── Directiva de prompt ─────────────────────────────────────────────────────

// Doctrina destilada de las instructions del propio server MCP de codegraph
// (verificadas en el spike): explore ANTES de grep/read, resultados
// Read-equivalentes, no re-verificar con grep, respetar el banner de staleness.
export function codegraphDirective(cwd: string): string {
	if (!resolveCodegraphEnabled(cwd)) return "";
	return `## Codegraph (pre-indexed code knowledge graph — ACTIVE in this project)

This project is indexed by codegraph (deterministic AST graph of every symbol, call edge, and file; reads are sub-millisecond; the index lags writes by ~1s). Use it via bash INSTEAD of grep/read exploration loops:

- \`codegraph explore "<natural-language question or symbol/file names>"\` — ONE call returns the verbatim, line-numbered source of the relevant symbols grouped by file (Read-equivalent, safe to Edit from) PLUS the call path among them and a blast-radius summary. Use it for "how does X work", "what calls X", "the flow from X to Y", or before editing a symbol you can name.
- \`codegraph callers <symbol>\` / \`codegraph callees <symbol>\` — surgical caller/callee lists.

Rules:
- Reach for codegraph BEFORE any grep/read exploration of indexed source. One explore usually replaces a dozen reads — a manual grep+read loop repeats work the index already did and costs more.
- Treat returned source as already-Read; do NOT re-verify codegraph results with grep.
- If output starts with a staleness banner ("⚠️ … edited since the last index sync"), Read those specific files directly; everything else stays trustworthy.
- Codegraph indexes SOURCE. Configs, docs, and non-indexed files still go through read/grep as usual. It does not replace the compiler or the test suite.`;
}

// ─── Comando /ein:codegraph ──────────────────────────────────────────────────

export async function handleCodegraphCommand(
	ctx: ExtensionContext,
): Promise<void> {
	const current = readCodegraphMode(ctx.cwd);
	const bin = resolveCodegraphBin();
	const indexed = projectIndexed(ctx.cwd);
	const items: string[] = [
		"on — usa el grafo; si falta el índice, Ein ofrece crearlo",
		"off — nunca; los agentes exploran con grep/read",
	];
	const picked = await ctx.ui.select(
		`Codegraph (actual: ${current} · binario: ${bin ? "sí" : "NO"} · índice: ${indexed ? "sí" : "NO"})`,
		items,
	);
	// CORTE -> select cancelado no cambia nada.
	if (picked === undefined) return;
	const mode = CODEGRAPH_OPTIONS[items.indexOf(picked)];
	if (!mode) return;
	writeCodegraphMode(ctx.cwd, mode);

	// La oferta va aquí, no antes: elegir `on` en un proyecto sin índice es
	// justo el punto donde antes te quedabas sin salida.
	if (mode === "on" && bin && !indexed) await offerCodegraphInit(ctx);

	const enabled = resolveCodegraphEnabled(ctx.cwd);
	ctx.ui.notify(
		[
			`Codegraph: ${mode} (este proyecto → ${enabled ? "activo" : "inactivo"})`,
			bin
				? `Binario: ${bin}`
				: "Sin binario: npm i -g @colbymchenry/codegraph (y `codegraph telemetry off`).",
			`Config: ${codegraphConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre sesión nueva para que tome efecto.",
		].join("\n"),
		"info",
	);
}

/**
 * Pregunta y, si aceptas, indexa. Se marca como preguntado pase lo que pase:
 * un aviso que reaparece cada sesión deja de ser una oferta y pasa a ser ruido.
 */
export async function offerCodegraphInit(ctx: ExtensionContext): Promise<void> {
	markCodegraphInitPrompted(ctx.cwd);
	const accepted = await ctx.ui.select(
		"Este proyecto no tiene grafo de código. Indexarlo tarda segundos y ahorra exploración a cada agente. ¿Lo creo ahora?",
		["sí — crear el índice", "ahora no"],
	);
	if (accepted === undefined || accepted.startsWith("ahora no")) return;

	const outcome = initializeCodegraph(ctx.cwd);
	if (outcome.ok) {
		ctx.ui.notify(
			outcome.alreadyIndexed
				? "Codegraph: el índice ya existía."
				: "Codegraph: índice creado. Los agentes ya pueden usar `codegraph explore`.",
			"info",
		);
		return;
	}
	const reason =
		outcome.reason === "no-binary"
			? "no hay binario de codegraph en el PATH"
			: outcome.reason === "no-index-created"
				? "el comando terminó pero no dejó índice (¿hay código indexable en esta raíz?)"
				: "el comando falló";
	ctx.ui.notify(`Codegraph: no se pudo indexar — ${reason}.\n${outcome.detail}`, "warning");
}
