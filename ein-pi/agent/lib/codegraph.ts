// =============================================================================
// [CORE] CODEGRAPH
// Grafo de código determinista (colbymchenry/codegraph) por la ruta CLI-over-
// bash: los agentes llaman `codegraph explore` en vez de reconstruir call
// paths con docenas de grep/read. Sin MCP a propósito — el interop con
// pi-mcp-adapter cuelga (ver docs/codegraph-spike-plan.md // 008); el CLI da
// los mismos payloads medidos (-38% mediana, -85% en ficheros grandes) sin
// adapter ni daemon.
//
// FAIL CLOSED -> la directiva solo se inyecta si hay binario Y el proyecto
// está indexado (.codegraph/). Sin cualquiera de los dos: cero líneas de
// prompt, los agentes exploran como siempre. Modos: auto (default) | off.
// No hay "on" a la fuerza: forzar la directiva sin índice sería mentirle al
// modelo. Calcado del patrón de tdd.ts/hypa.ts.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export type CodegraphMode = "auto" | "off";

export const CODEGRAPH_OPTIONS: readonly CodegraphMode[] = ["auto", "off"];

const DEFAULT_CODEGRAPH: CodegraphMode = "auto";

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
	const path = codegraphConfigPath(cwd);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ mode }, null, 2)}\n`);
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
		"auto — directiva activa si hay binario + índice (.codegraph/)",
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
	const enabled = resolveCodegraphEnabled(ctx.cwd);
	ctx.ui.notify(
		[
			`Codegraph: ${mode} (este proyecto → ${enabled ? "activo" : "inactivo"})`,
			bin
				? `Binario: ${bin}`
				: "Sin binario: npm i -g @colbymchenry/codegraph (y `codegraph telemetry off`).",
			indexed
				? "Índice presente (.codegraph/)."
				: "Sin índice: ejecuta `codegraph init` en la raíz del proyecto.",
			`Config: ${codegraphConfigPath(ctx.cwd)}`,
			"Reinicia Pi o abre sesión nueva para que tome efecto.",
		].join("\n"),
		"info",
	);
}
