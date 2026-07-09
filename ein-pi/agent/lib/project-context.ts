// =============================================================================
// PROJECT CONTEXT (EIN.md)
// "Cerebro" del proyecto: un fichero versionado en la raíz (EIN.md) que da
// verdad de base a Ein —stack, comandos, arquitectura, convenciones— para que
// los ejecutores baratos no quemen tokens re-descubriéndolo cada run.
//
// Dos zonas, para no pudrirse:
//   - CURADA  → la escribe el humano; Ein nunca la pisa al refrescar.
//   - AUTO    → entre marcadores; /ein:init la regenera (comandos + estructura)
//               y estampa rev (SHA git) + fecha para detectar deriva.
//
// Módulo puro (solo builtins de Node) para no acoplar a paquetes en tests.
// =============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type Lang, pick, pickFor, readChatLang } from "./lang.ts";

const AUTO_START = "<!-- ein:auto:start — generado por /ein:init, no editar a mano -->";
const AUTO_END = "<!-- ein:auto:end -->";
const STAMP_PREFIX = "<!-- ein:init";

// Directorios de raíz que nunca listamos en la estructura (ruido/regenerable).
const IGNORED_DIRS = new Set([
	"node_modules", ".git", "dist", "build", ".next", ".nuxt", ".output",
	"coverage", ".cache", ".turbo", "target", ".pi", ".piagents", ".atl",
	".vscode", ".idea", "vendor", "__pycache__",
]);

export function einMdPath(cwd: string): string {
	return join(cwd, "EIN.md");
}

export type EinMdInfo = {
	exists: boolean;
	content: string;
	rev?: string;
};

export function readEinMd(cwd: string): EinMdInfo {
	const path = einMdPath(cwd);
	if (!existsSync(path)) return { exists: false, content: "" };
	try {
		const content = readFileSync(path, "utf8");
		return { exists: true, content, rev: parseStampRev(content) };
	} catch {
		return { exists: false, content: "" };
	}
}

// ─── Inyección de contexto al prompt ─────────────────────────────────────────

// Bloque que se añade al systemPrompt (parent + fases SDD). Vacío si no hay
// EIN.md, para no inyectar ruido en proyectos que no lo usan.
export function einContextDirective(cwd: string): string {
	const info = readEinMd(cwd);
	if (!info.exists || !info.content.trim()) return "";
	const intro = pick(
		"El repo trae un `EIN.md` curado. Úsalo como verdad de base para stack, comandos, arquitectura y convenciones en vez de re-deducirlos. Si alguna vez contradice al código, fíate del código y señala la deriva.",
		"The repo ships a curated `EIN.md`. Use it as ground truth for stack, commands, architecture and conventions instead of re-deriving them. If it ever conflicts with the code, trust the code and flag the drift.",
	);
	const title = pick("## Contexto de proyecto — EIN.md", "## Project context — EIN.md");
	return `${title}\n\n${intro}\n\n${info.content.trim()}`;
}

// ─── Generación / refresco ───────────────────────────────────────────────────

// Crea o refresca EIN.md. Devuelve si se creó de cero o se refrescó.
export function writeEinMd(cwd: string): { created: boolean; path: string } {
	const path = einMdPath(cwd);
	const lang = readChatLang();
	const auto = renderAutoBlock(cwd, lang);
	const stamp = renderStamp(cwd);

	if (!existsSync(path)) {
		writeFileSync(path, scaffold(cwd, lang, stamp, auto), "utf8");
		return { created: true, path };
	}

	const existing = readFileSync(path, "utf8");
	const withStamp = replaceStamp(existing, stamp);
	const next = replaceAutoBlock(withStamp, auto);
	writeFileSync(path, next, "utf8");
	return { created: false, path };
}

export async function handleInitCommand(ctx: ExtensionContext): Promise<void> {
	const { created, path } = writeEinMd(ctx.cwd);
	const head = created
		? pick(`EIN.md creado: ${path}`, `EIN.md created: ${path}`)
		: pick(`EIN.md refrescado: ${path}`, `EIN.md refreshed: ${path}`);
	ctx.ui.notify(
		[
			head,
			pick(
				"Zona AUTO (comandos + estructura) regenerada. Rellena a mano las secciones curadas (Overview, Arquitectura, Convenciones): Ein no las toca.",
				"AUTO zone (commands + structure) regenerated. Fill the curated sections (Overview, Architecture, Conventions) by hand: Ein won't touch them.",
			),
			pick(
				"Se inyecta a partir de la próxima sesión/subagente.",
				"It gets injected from the next session/subagent onwards.",
			),
		].join("\n"),
		"info",
	);
}

// ─── Plantilla ───────────────────────────────────────────────────────────────

// Siembra del índice: una línea por dir de nivel raíz con hueco a describir.
// Semilla determinista; las descripciones las rellena el modelo/tú (curado).
function indexSeed(cwd: string, lang: Lang): string[] {
	const describe = pickFor(lang, "_(describe)_", "_(describe)_");
	const dirs = topLevelDirs(cwd);
	if (dirs.length === 0) return [pickFor(lang, "_(sin subdirectorios)_", "_(no subdirectories)_")];
	return dirs.map((d) => `- \`${d}/\` — ${describe}`);
}

function scaffold(cwd: string, lang: Lang, stamp: string, auto: string): string {
	const L = (es: string, en: string) => pickFor(lang, es, en);
	const pending = L("_(pendiente)_", "_(pending)_");
	return [
		"# EIN.md",
		"",
		stamp,
		L(
			"> Contexto de proyecto para Ein. La zona AUTO la regenera `/ein:init`; la zona curada es tuya (Ein no la pisa).",
			"> Project context for Ein. The AUTO zone is regenerated by `/ein:init`; the curated zone is yours (Ein won't overwrite it).",
		),
		"",
		L("## Overview", "## Overview"),
		L(
			"<!-- CURADA — 2-3 líneas: qué es el proyecto y para quién. -->",
			"<!-- CURATED — 2-3 lines: what the project is and for whom. -->",
		),
		pending,
		"",
		L("## Arquitectura", "## Architecture"),
		L(
			"<!-- CURADA — estilo (p.ej. screaming architecture) y dónde viven las features. -->",
			"<!-- CURATED — style (e.g. screaming architecture) and where features live. -->",
		),
		pending,
		"",
		L("## Convenciones", "## Conventions"),
		L(
			"<!-- CURADA — naming y patrones específicos de ESTE repo. -->",
			"<!-- CURATED — naming and patterns specific to THIS repo. -->",
		),
		pending,
		"",
		L("## Índice", "## Index"),
		L(
			"<!-- SEMI-CURADA — una línea por carpeta/pieza: qué es. Ein la siembra; el modelo/tú la mantenéis al crecer el proyecto. -->",
			"<!-- SEMI-CURATED — one line per folder/piece: what it is. Ein seeds it; you/the model keep it as the project grows. -->",
		),
		...indexSeed(cwd, lang),
		"",
		auto,
		"",
	].join("\n");
}

function renderAutoBlock(cwd: string, lang: Lang): string {
	const L = (es: string, en: string) => pickFor(lang, es, en);
	const lines: string[] = [AUTO_START, ""];

	lines.push(L("## Comandos", "## Commands"), "");
	const cmds = detectCommands(cwd);
	if (cmds.length) {
		lines.push(`| ${L("Acción", "Action")} | ${L("Comando", "Command")} |`, "|---|---|");
		for (const [action, cmd] of cmds) lines.push(`| ${action} | \`${cmd}\` |`);
	} else {
		lines.push(L("_No detectados automáticamente._", "_Not auto-detected._"));
	}
	lines.push("");

	lines.push(L("## Estructura", "## Structure"), "");
	const dirs = topLevelDirs(cwd);
	if (dirs.length) {
		for (const d of dirs) lines.push(`- \`${d}/\``);
	} else {
		lines.push(L("_Sin subdirectorios relevantes._", "_No relevant subdirectories._"));
	}
	lines.push("");

	lines.push(L("## Docs", "## Docs"), "");
	const docs = detectDocs(cwd);
	if (docs.length) {
		for (const [label, path] of docs) lines.push(`- [${label}](${path})`);
	} else {
		lines.push(L("_Sin docs detectados._", "_No docs detected._"));
	}

	lines.push("", AUTO_END);
	return lines.join("\n");
}

// ─── Detección determinista ──────────────────────────────────────────────────

type PkgManager = { run: string; install: string };

function detectPackageManager(cwd: string): PkgManager | null {
	if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb")))
		return { run: "bun run", install: "bun install" };
	if (existsSync(join(cwd, "pnpm-lock.yaml")))
		return { run: "pnpm", install: "pnpm install" };
	if (existsSync(join(cwd, "yarn.lock")))
		return { run: "yarn", install: "yarn install" };
	if (existsSync(join(cwd, "package-lock.json")))
		return { run: "npm run", install: "npm install" };
	if (existsSync(join(cwd, "package.json")))
		return { run: "npm run", install: "npm install" };
	return null;
}

// Devuelve pares [acción, comando] a partir de package.json scripts (orden
// canónico) y, si no hay node, de otros ecosistemas comunes.
function detectCommands(cwd: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	const pm = detectPackageManager(cwd);
	if (pm) {
		out.push(["install", pm.install]);
		const scripts = readScripts(cwd);
		const order = ["dev", "start", "build", "test", "lint", "typecheck", "check", "format"];
		const seen = new Set<string>();
		for (const name of order) {
			if (scripts[name] !== undefined) {
				out.push([name, `${pm.run} ${name}`]);
				seen.add(name);
			}
		}
		// Cualquier otro script no canónico, al final (cota de ruido: máx 6).
		for (const name of Object.keys(scripts)) {
			if (seen.has(name)) continue;
			if (out.length >= 12) break;
			out.push([name, `${pm.run} ${name}`]);
		}
		return out;
	}
	if (existsSync(join(cwd, "Cargo.toml")))
		return [["build", "cargo build"], ["test", "cargo test"], ["run", "cargo run"]];
	if (existsSync(join(cwd, "go.mod")))
		return [["build", "go build ./..."], ["test", "go test ./..."]];
	if (existsSync(join(cwd, "deno.json")) || existsSync(join(cwd, "deno.jsonc")))
		return [["test", "deno test"], ["run", "deno task start"]];
	return out;
}

function readScripts(cwd: string): Record<string, string> {
	try {
		const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
			scripts?: Record<string, string>;
		};
		return pkg.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
	} catch {
		return {};
	}
}

function topLevelDirs(cwd: string): string[] {
	try {
		return readdirSync(cwd, { withFileTypes: true })
			.filter((e) => e.isDirectory() && !e.name.startsWith(".") && !IGNORED_DIRS.has(e.name))
			.map((e) => e.name)
			.sort();
	} catch {
		return [];
	}
}

// Docs para enlazar en el índice: canónicos en raíz + ficheros de docs/.
function detectDocs(cwd: string): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const name of ["README.md", "CHANGELOG.md", "CONTRIBUTING.md", "ARCHITECTURE.md"]) {
		if (existsSync(join(cwd, name))) out.push([name.replace(/\.md$/, ""), name]);
	}
	const docsDir = join(cwd, "docs");
	try {
		if (existsSync(docsDir)) {
			for (const name of readdirSync(docsDir).sort()) {
				if (!name.endsWith(".md") || out.length >= 12) continue;
				out.push([`docs/${name}`, `docs/${name}`]);
			}
		}
	} catch {
		// docs/ ilegible → se omite
	}
	return out;
}

// ─── Sello de frescura ───────────────────────────────────────────────────────

function renderStamp(cwd: string): string {
	const rev = gitShortSha(cwd) ?? "—";
	const date = new Date().toISOString().slice(0, 10);
	return `${STAMP_PREFIX} rev=${rev} generado=${date} · refresca con /ein:init -->`;
}

function parseStampRev(content: string): string | undefined {
	const m = content.match(/<!-- ein:init rev=(\S+)/);
	return m ? m[1] : undefined;
}

function replaceStamp(content: string, stamp: string): string {
	if (content.includes(STAMP_PREFIX)) {
		return content.replace(/<!-- ein:init[^>]*-->/, stamp);
	}
	// Sin sello (EIN.md hecho a mano): insertarlo tras el primer encabezado.
	const lines = content.split("\n");
	const idx = lines.findIndex((l) => l.startsWith("# "));
	if (idx === -1) return `${stamp}\n${content}`;
	lines.splice(idx + 1, 0, "", stamp);
	return lines.join("\n");
}

function replaceAutoBlock(content: string, auto: string): string {
	const start = content.indexOf(AUTO_START);
	const end = content.indexOf(AUTO_END);
	if (start !== -1 && end !== -1 && end > start) {
		const before = content.slice(0, start);
		const after = content.slice(end + AUTO_END.length);
		return `${before}${auto}${after}`;
	}
	// No hay zona AUTO (EIN.md manual): anexar al final.
	return `${content.trimEnd()}\n\n${auto}\n`;
}

// rev corto de git; undefined si no hay repo o git falla.
function gitShortSha(cwd: string): string | undefined {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim() || undefined;
	} catch {
		return undefined;
	}
}

// Cuántos commits atrás quedó el sello (para el check de frescura del doctor).
// undefined si no hay sello, no hay repo, o el SHA ya no existe.
export function einMdCommitsBehind(cwd: string): number | undefined {
	const info = readEinMd(cwd);
	if (!info.exists || !info.rev || info.rev === "—") return undefined;
	try {
		const out = execFileSync("git", ["rev-list", "--count", `${info.rev}..HEAD`], {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		const n = Number(out);
		return Number.isFinite(n) ? n : undefined;
	} catch {
		return undefined;
	}
}
