#!/usr/bin/env bun
// =============================================================================
// cc-ein SYNC — compilador core → Claude Code (adaptador aislado)
// -----------------------------------------------------------------------------
// Despliega el cerebro de EIN a un CLAUDE_CONFIG_DIR propio (~/.claude-ein) sin
// tocar tu ~/.claude. Fuente única de verdad: `ein-pi/core` (agentes + skills)
// se traducen/copian; lo específico de Claude Code (CLAUDE.md, settings.json,
// hooks) vive en `cc-ein/`. Idempotente: se puede re-ejecutar siempre.
//
//   bun cc-ein/sync.ts            # despliega
//   bun cc-ein/sync.ts --dry      # enseña qué haría, sin escribir
// =============================================================================

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const CORE = join(REPO, "ein-pi", "core");
const CC = import.meta.dir; // cc-ein/
const DEST = process.env.CC_EIN_HOME ?? join(homedir(), ".claude-ein");
const MAIN = join(homedir(), ".claude");
const DRY = process.argv.includes("--dry");

const log = (s: string) => console.log(DRY ? `  [dry] ${s}` : `  ${s}`);

// Pi tool name -> Claude Code tool name. `find` -> Glob (búsqueda de ficheros CC).
// linear_* son tools de un MCP de Linear: se prefijan mcp__linear__ (opt-in Team).
function translateTools(piTools: string): string {
	const map: Record<string, string> = {
		read: "Read", grep: "Grep", find: "Glob",
		edit: "Edit", write: "Write", bash: "Bash",
	};
	const out: string[] = [];
	for (const raw of piTools.split(",").map((t) => t.trim()).filter(Boolean)) {
		if (map[raw]) out.push(map[raw]);
		else if (raw.startsWith("linear_")) out.push(`mcp__linear__${raw}`);
		else out.push(raw); // desconocido: se deja tal cual (best-effort)
	}
	return [...new Set(out)].join(", ");
}

// Nota de adaptador prepended a cada cuerpo: recontextualiza los conceptos de
// runtime de Pi que quedan en la prosa (y que en CC son inertes), sin reescribir
// frases frágiles. La regla "si te bloqueas, status: blocked" SÍ sigue válida.
const CC_NOTE = [
	"> **cc-ein (Claude Code):** corres en Claude Code, no en Pi. El flujo SDD se conduce con `cc-ein-sdd status|check|close` (por Bash). Los conceptos de runtime de Pi que puedan aparecer abajo (`intercom`/asks al supervisor, `acceptance-report`, `pi-subagents`, `.pi/ein/*`, `completionGuard`/`turnBudget`) NO aplican aquí — ignóralos. Sigue vigente: si te bloqueas, devuelve `status: blocked` con la causa concreta. Escribe tu artefacto de fase en `openspec/changes/<change>/`.",
	"",
].join("\n");

// Sustituciones deterministas de tokens DISTINGUIBLES en el cuerpo (no toca
// prosa ambigua). ein_sdd_* -> el CLI real de cc-ein; ein_review_forecast ->
// frase genérica (no hay tool equivalente en CC).
function translateBody(body: string): string {
	return body
		.replaceAll("ein_sdd_status", "cc-ein-sdd status")
		.replaceAll("ein_sdd_check", "cc-ein-sdd check")
		.replaceAll("ein_sdd_close", "cc-ein-sdd close")
		.replaceAll("`ein_review_forecast` tool", "review-size forecast")
		.replaceAll("ein_review_forecast", "the review-size forecast");
}

// Traduce un agente Pi -> agente Claude Code: conserva name/description, traduce
// `tools`, DESCARTA el frontmatter específico de Pi (budget, turnBudget,
// completionGuard, extensions, defaultContext, inheritSkills, timeoutMs,
// toolBudget), prepende la nota de adaptador y traduce los tokens del cuerpo.
function translateAgent(src: string): string {
	const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!m) return src; // sin frontmatter: se deja
	const [, fm, body] = m;
	const get = (k: string) => fm.match(new RegExp(`^${k}:\\s*(.+)$`, "m"))?.[1]?.trim();
	const name = get("name") ?? "agent";
	const description = get("description") ?? "";
	const tools = get("tools");
	const lines = ["---", `name: ${name}`, `description: ${description}`];
	if (tools) lines.push(`tools: ${translateTools(tools)}`);
	lines.push("---");
	return `${lines.join("\n")}\n${CC_NOTE}${translateBody(body)}`;
}

function ensureDir(p: string) {
	if (DRY) return;
	mkdirSync(p, { recursive: true });
}

function write(dest: string, content: string) {
	if (DRY) return;
	writeFileSync(dest, content, "utf8");
}

// ── 1. Estructura + credenciales compartidas ────────────────────────────────
console.log(`\ncc-ein sync → ${DEST}${DRY ? "  (DRY RUN)" : ""}\n`);
ensureDir(DEST);
ensureDir(join(DEST, "agents"));

const cred = join(MAIN, ".credentials.json");
const credLink = join(DEST, ".credentials.json");
if (existsSync(cred)) {
	const already = existsSync(credLink) && (() => { try { return lstatSync(credLink).isSymbolicLink(); } catch { return false; } })();
	if (!already) {
		if (!DRY) { try { rmSync(credLink, { force: true }); } catch {} symlinkSync(cred, credLink); }
		log(`credenciales: symlink → ~/.claude/.credentials.json (login compartido)`);
	} else log(`credenciales: symlink ya presente`);
} else {
	log(`⚠ ~/.claude/.credentials.json no existe: cc-ein pedirá login la 1ª vez`);
}

// ── 2. CLAUDE.md (cerebro del parent, adaptado a CC) ─────────────────────────
const brain = readFileSync(join(CC, "CLAUDE.md"), "utf8");
write(join(DEST, "CLAUDE.md"), brain);
log(`CLAUDE.md desplegado (${brain.split("\n").length} líneas)`);

// ── 3. settings.json + hook PreToolUse (guard) con ruta ABSOLUTA ─────────────
// Inyectamos el hook aquí (no en el fichero estático) para bakear la ruta real
// del binario: así resuelve aunque el hook no herede el PATH del launcher.
const settingsObj = JSON.parse(readFileSync(join(CC, "settings.json"), "utf8")) as Record<string, unknown>;
const guardBin = join(DEST, "bin", "cc-ein-sdd");
settingsObj.hooks = {
	PreToolUse: [
		{
			matcher: "Bash",
			hooks: [{ type: "command", command: `"${guardBin}" guard`, timeout: 10 }],
		},
	],
};
write(join(DEST, "settings.json"), `${JSON.stringify(settingsObj, null, 2)}\n`);
log(`settings.json desplegado (+ hook PreToolUse Bash → cc-ein-sdd guard)`);

// ── 4. Agentes: traducidos desde el core canónico ───────────────────────────
let nAgents = 0;
for (const file of readdirSync(join(CORE, "agents")).filter((f) => f.endsWith(".md"))) {
	const src = readFileSync(join(CORE, "agents", file), "utf8");
	write(join(DEST, "agents", file), translateAgent(src));
	nAgents += 1;
}
log(`agentes traducidos Pi→CC: ${nAgents}`);

// ── 5. Skills: copiadas del core (local + downloaded) ────────────────────────
const skillsSrc = join(CORE, "skills");
const skillsDest = join(DEST, "skills");
if (existsSync(skillsSrc)) {
	if (!DRY) {
		rmSync(skillsDest, { recursive: true, force: true });
		for (const group of ["local", "downloaded"]) {
			const g = join(skillsSrc, group);
			if (existsSync(g)) cpSync(g, join(skillsDest), { recursive: true });
		}
	}
	const n = ["local", "downloaded"].reduce((acc, g) => {
		const p = join(skillsSrc, g);
		return acc + (existsSync(p) ? readdirSync(p).filter((d) => existsSync(join(p, d, "SKILL.md"))).length : 0);
	}, 0);
	log(`skills copiadas: ~${n} (local + downloaded, aplanadas en skills/)`);
}

// ── 6. CLI SDD determinista → binario standalone en bin/ ────────────────────
// Reusa el core TS puro (sdd-router/guardrails/close). El binario NO depende del
// repo ein-agent en runtime: los agentes lo llaman por Bash (bin/ va en el PATH
// que fija el launcher). Requiere `bun` para compilar (solo en sync, no en uso).
const binDir = join(DEST, "bin");
ensureDir(binDir);
if (!DRY) {
	try {
		execFileSync("bun", ["build", "--compile", join(CC, "sdd-cli", "cli.ts"), "--outfile", join(binDir, "cc-ein-sdd")], { stdio: "ignore" });
		log(`CLI SDD compilado → bin/cc-ein-sdd (standalone; status|check|close)`);
	} catch (e) {
		log(`⚠ no se pudo compilar cc-ein-sdd (¿falta bun?): ${e instanceof Error ? e.message : e}`);
	}
} else log(`CLI SDD se compilaría → bin/cc-ein-sdd`);

// ── 7. MCP: Context7 (docs on-demand) + Engram (memoria, si está) ───────────
// Se configuran a scope USER en el .claude.json aislado (global a cc-ein, no por
// proyecto). Idempotente: remove + add. La key de Context7 NO se bakea aquí —
// va por env (el launcher la exporta), así el config queda sin secretos.
function mcpUser(name: string, argv: string[], env: Record<string, string> = {}): void {
	if (DRY) { log(`MCP se configuraría (scope user): ${name}`); return; }
	const base = { ...process.env, CLAUDE_CONFIG_DIR: DEST };
	try { execFileSync("claude", ["mcp", "remove", "-s", "user", name], { env: base, stdio: "ignore" }); } catch { /* no existía */ }
	const envFlags = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
	try {
		execFileSync("claude", ["mcp", "add", "-s", "user", name, ...envFlags, "--", ...argv], { env: base, stdio: "ignore" });
		log(`MCP configurado (scope user): ${name}`);
	} catch (e) {
		log(`⚠ MCP ${name} no configurado (¿falta claude en PATH?): ${e instanceof Error ? e.message : e}`);
	}
}

mcpUser("context7", ["bunx", "--bun", "@upstash/context7-mcp"]);

// Engram es opcional: solo si el binario está en el sistema. Data dir propio
// (~/.engram-cc-ein) para no cruzarse con la memoria de Pi. Cámbialo a
// ~/.engram-pi si prefieres compartir memoria entre ediciones de Ein.
let engramBin = "";
try { engramBin = execFileSync("which", ["engram"], { encoding: "utf8" }).trim(); } catch { /* no está */ }
if (engramBin) {
	mcpUser("engram", [engramBin, "mcp", "--tools=agent"], { ENGRAM_DATA_DIR: join(homedir(), ".engram-cc-ein") });
} else {
	log(`engram no encontrado en PATH: memoria opcional omitida`);
}

console.log(`\n✓ cc-ein ${DRY ? "(dry) " : ""}listo. Lanza con:  cc-ein\n`);
