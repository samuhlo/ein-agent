// =============================================================================
// TESTS: contrato de tools de los agentes — la allowlist debe EXISTIR
// =============================================================================
// BLINDAJE -> `tools:` en el frontmatter de un agente es una allowlist ESTRICTA
// que pi-subagents pasa al hijo como `--tools`. Si declara un nombre que Pi no
// registra, el hijo escribe un diagnóstico y el padre lo convierte en
// `closeError` AL CERRAR: el run sale ✗ aunque el artefacto esté escrito y
// `ein_sdd_check` lo dé por bueno. Peor: pi-subagents antepone al system prompt
// del hijo "Do not claim tool-dependent work succeeded; report this
// configuration error to the parent", así que el hijo se pelea consigo mismo y
// reintenta. Un typo en esta línea no falla rápido: falla caro y en silencio.
//
// Caso real (jul 2026): los siete agentes SDD declaraban `glob`, que NO es un
// builtin de Pi — el equivalente se llama `find`. scope/map/design salieron ✗
// con los artefactos correctos y ~120k tokens quemados en reintentos.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PI_BUILTIN_TOOLS as PI_CONTRACT_BUILTINS } from "../ein-pi/agent/lib/pi-contract";

const CORE_AGENTS = join(import.meta.dir, "../ein-pi/core/agents");
const EXTENSIONS = join(import.meta.dir, "../ein-pi/agent/extensions");
const orchestrator = readFileSync(
	join(import.meta.dir, "../ein-pi/agent/assets/orchestrator.md"),
	"utf8",
);

// Builtins de Pi: FUENTE ÚNICA en lib/pi-contract.ts, que además se contrasta
// contra la instalación real (tests/pi-contract.test.ts y `ein doctor`). Antes
// este set estaba replicado aquí y en el doctor: tres copias de la misma verdad
// es la duplicación que ya abrió un agujero en la validación de OpenSpec.
const PI_BUILTIN_TOOLS = new Set(PI_CONTRACT_BUILTINS);

// Un entry con `/` o extensión .ts/.js no es un nombre de tool: es la ruta del
// proveedor (pi-args la mueve a `--extension`). Se acepta sin validar el nombre.
function isProviderPath(entry: string): boolean {
	return entry.includes("/") || entry.endsWith(".ts") || entry.endsWith(".js");
}

function agentFiles(): string[] {
	return readdirSync(CORE_AGENTS)
		.filter((f) => f.endsWith(".md"))
		.sort();
}

// Lee la línea `tools:` del frontmatter y la parte en nombres.
function declaredTools(agentFile: string): string[] {
	const raw = readFileSync(join(CORE_AGENTS, agentFile), "utf8");
	const match = raw.match(/^tools:\s*(.+)$/m);
	if (!match?.[1]) return [];
	return match[1]
		.split(",")
		.map((t) => t.trim())
		.filter(Boolean);
}

// Nombres que registran las extensiones de Ein (`pi.registerTool({ name: … })`).
// El hijo hereda las extensiones globales, así que estos nombres SÍ existen en
// su runtime aunque no sean builtins.
function registeredExtensionTools(): Set<string> {
	const names = new Set<string>();
	for (const file of readdirSync(EXTENSIONS).filter((f) => f.endsWith(".ts"))) {
		const src = readFileSync(join(EXTENSIONS, file), "utf8");
		for (const m of src.matchAll(
			/registerTool\(\s*\{[\s\S]{0,200}?name:\s*"([a-z0-9_]+)"/g,
		)) {
			if (m[1]) names.add(m[1]);
		}
	}
	return names;
}

describe("contrato de tools de los agentes", () => {
	test("`glob` no es un builtin de Pi (ancla de regresión)", () => {
		// El bug original en una línea: si esto se cae, alguien volvió a creer
		// que Pi tiene `glob`. No lo tiene. Es `find`.
		expect(PI_BUILTIN_TOOLS.has("glob")).toBe(false);
		expect(PI_BUILTIN_TOOLS.has("find")).toBe(true);
	});

	test("hay agentes que auditar", () => {
		expect(agentFiles().length).toBeGreaterThanOrEqual(7);
	});

	test("toda tool declarada existe (builtin, extensión o ruta de proveedor)", () => {
		const extensionTools = registeredExtensionTools();
		const unknown: string[] = [];
		for (const file of agentFiles()) {
			for (const tool of declaredTools(file)) {
				if (isProviderPath(tool)) continue;
				if (PI_BUILTIN_TOOLS.has(tool)) continue;
				if (extensionTools.has(tool)) continue;
				unknown.push(`${file}: ${tool}`);
			}
		}
		// Mensaje explícito: el fallo tiene que decir QUÉ tool y en qué agente,
		// porque el síntoma en producción (un ✗ con el artefacto correcto) no lo dice.
		expect(unknown).toEqual([]);
	});

	test("ningún agente declara `glob`", () => {
		const offenders = agentFiles().filter((f) =>
			declaredTools(f).includes("glob"),
		);
		expect(offenders).toEqual([]);
	});

	test("ein-scout es una allowlist portátil de investigación sin capacidades de mutación", () => {
		const scout = readFileSync(join(CORE_AGENTS, "ein-scout.md"), "utf8");
		expect(declaredTools("ein-scout.md")).toEqual(["read", "grep", "find"]);
		// `extensions:` con valor VACÍO (no `[]`): pi-subagents parsea este campo
		// con parseFrontmatterList (split por comas/saltos), no como JSON. El
		// literal `[]` se convertía en el token `["[]"]` → `--extension []` →
		// crash de arranque. Vacío define el campo (dispara `--no-extensions`) y
		// parsea a lista vacía. Ver tests/agent-frontmatter-json.test.ts.
		expect(scout).toMatch(/^extensions:\s*$/m);
		expect(scout).not.toMatch(/^tools:.*(?:MCP|provider)/m);
		expect(scout).toMatch(/^defaultContext:\s*fresh$/m);
		expect(scout).toMatch(/^inheritProjectContext:\s*false$/m);
		expect(scout).toMatch(/^inheritSkills:\s*false$/m);
		expect(scout).toMatch(/^timeoutMs:\s*120000$/m);
		// pi-subagents hace JSON.parse de estos campos (agents.ts:1378/1401), así
		// que DEBEN ser JSON válido: claves con comillas. El formato con claves sin
		// comillas tumbaba el arranque de todo subagente (regresión v0.24.0).
		expect(scout).toMatch(/^turnBudget:\s*\{ "maxTurns": 12, "graceTurns": 2 \}$/m);
		expect(scout).toMatch(/^toolBudget:\s*\{ "hard": 30, "soft": 24, "block": "\*" \}$/m);
		expect(() => JSON.parse(scout.match(/^turnBudget:\s*(.+)$/m)![1])).not.toThrow();
		expect(() => JSON.parse(scout.match(/^toolBudget:\s*(.+)$/m)![1])).not.toThrow();
		for (const forbidden of ["bash", "write", "edit", "subagent", "delivery", "MCP", "provider"]) {
			expect(declaredTools("ein-scout.md")).not.toContain(forbidden);
		}
		expect(scout).toMatch(/no authority to design architecture, choose a solution, implement work/i);
		expect(scout).toMatch(/references/i);
		expect(scout).toMatch(/uncertainties/i);
	});

	test("la tabla del orchestrator coincide con el frontmatter real", () => {
		// La tabla es lo que el modelo LEE. Si enseña `glob` mientras el agente
		// declara `find`, el orquestador redacta tasks pidiendo una tool que no
		// existe. Las dos fuentes se validan la una contra la otra.
		const mismatches: string[] = [];
		for (const file of agentFiles()) {
			const agent = file.replace(/\.md$/, "");
			const row = orchestrator.match(
				new RegExp(`^\\|\\s*\`${agent}\`\\s*\\|([^|]+)\\|`, "m"),
			);
			if (!row?.[1]) continue; // no todos los agentes salen en la tabla
			// Una celda con `*` o paréntesis resume a propósito (ein-linear lista
			// 13 tools como `linear_* (issues, …)`). Se exime del match literal:
			// lo que importa es que no documente una tool inexistente.
			if (/[*(]/.test(row[1])) continue;
			const documented = row[1]
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
			const actual = declaredTools(file);
			if (documented.join(",") !== actual.join(",")) {
				mismatches.push(
					`${agent}: tabla=[${documented.join(", ")}] frontmatter=[${actual.join(", ")}]`,
				);
			}
		}
		expect(mismatches).toEqual([]);
	});
});
