// =============================================================================
// TESTS: el frontmatter de los agentes debe sobrevivir a los DOS parsers de
// pi-subagents. Cada campo se parsea distinto y cada uno tiene su trampa.
// =============================================================================
// pi-subagents (`src/agents/agents.ts`) parsea el frontmatter de dos formas
// según el campo:
//
//   1. `JSON.parse` sobre el string crudo — `turnBudget`, `toolBudget`
//      (agents.ts:1378/1401). Un objeto con claves SIN comillas (`{ maxTurns: 12 }`)
//      NO es JSON válido → "Expected property name or '}' ..." → cae el arranque.
//      (Regresión v0.24.0, PR #55.)
//
//   2. `parseFrontmatterList` — `tools`, `extensions`, `defaultReads`,
//      `fallbackModels`, `skillPath`, `subagentOnlyExtensions` (agents.ts:1333-1391).
//      Hace split por comas/saltos; NO entiende sintaxis de array. `extensions: []`
//      se parsea como el token literal `["[]"]` → `--extension []` → el launcher
//      intenta cargar una extensión en `<cwd>/[]` → cae el arranque de CUALQUIER
//      subagente (se enumera el registro entero). (Regresión v0.24.1→, PR de este fix.)
//      Para "sin extensiones" el campo debe ir DEFINIDO pero VACÍO (`extensions:`),
//      no `[]`: así dispara `--no-extensions` sin token basura.
//
// Estas dos roturas llegaron a producción porque ningún test ejercitaba el
// parseo real del frontmatter. No importamos pi-subagents (no está en CI):
// reproducimos su algoritmo exacto. Si el paquete cambia su parser, actualiza
// estas réplicas.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CORE_AGENTS = join(import.meta.dir, "../ein-pi/core/agents");

// Campos que pi-subagents pasa por JSON.parse (agents.ts:1378/1401).
const JSON_FIELDS = ["turnBudget", "toolBudget"];
// Campos que pasa por parseFrontmatterList (agents.ts:1333-1391).
const LIST_FIELDS = ["tools", "extensions", "defaultReads", "fallbackModels", "skillPath", "subagentOnlyExtensions"];

function agentFiles(): string[] {
	return readdirSync(CORE_AGENTS).filter((f) => f.endsWith(".md")).sort();
}

// Réplica EXACTA de parseFrontmatter (pi-subagents src/agents/frontmatter.ts):
// clave → string cruda, con el deferral de valores vacíos / bloques indentados.
function parseFrontmatter(content: string): Record<string, string> {
	const fm: Record<string, string> = {};
	const n = content.replace(/\r\n/g, "\n");
	if (!n.startsWith("---")) return fm;
	const end = n.indexOf("\n---", 3);
	if (end === -1) return fm;
	const lines = n.slice(4, end).split("\n");
	let key: string | null = null;
	let blk: string[] | null = null;
	let ind: number | null = null;
	let folded = false;
	const flush = () => {
		if (key !== null && blk !== null) {
			fm[key] = folded ? blk.join("\n").trim() : blk.join("\n");
			key = null; blk = null; ind = null; folded = false;
		}
	};
	for (const line of lines) {
		const indent = line.search(/\S|$/);
		const t = line.trim();
		if (key !== null && blk !== null && (indent > (ind ?? 0) || (folded && t === ""))) { blk.push(line); continue; }
		flush();
		const m = line.match(/^([\w-]+):\s*(.*)$/);
		if (m?.[1] !== undefined) {
			const rv = m[2].trim();
			const q = (rv.startsWith('"') && rv.endsWith('"')) || (rv.startsWith("'") && rv.endsWith("'"));
			const v = q ? rv.slice(1, -1) : rv;
			const f = !q && (rv === ">" || rv === ">-");
			if (v === "" || f) { key = m[1]; blk = []; ind = indent; folded = f; }
			else fm[m[1]] = v;
		}
	}
	flush();
	return fm;
}

// Réplica EXACTA de parseFrontmatterList (pi-subagents src/agents/frontmatter.ts).
function parseFrontmatterList(raw: string | undefined): string[] | undefined {
	if (raw === undefined) return undefined;
	return raw
		.split("\n")
		.flatMap((line) => {
			const value = line.trim();
			const listItem = value.match(/^-\s+(.+)$/);
			return (listItem?.[1] ?? value).split(",");
		})
		.map((value) => value.trim())
		.filter(Boolean);
}

describe("frontmatter de agentes — sobrevive a los dos parsers de pi-subagents", () => {
	for (const file of agentFiles()) {
		const fm = parseFrontmatter(readFileSync(join(CORE_AGENTS, file), "utf8"));

		test(`${file}: campos JSON (turnBudget/toolBudget) son JSON de objeto válido`, () => {
			for (const field of JSON_FIELDS) {
				if (fm[field] === undefined) continue;
				const value = fm[field];
				let parsed: unknown;
				expect(() => { parsed = JSON.parse(value); }, `${file} → ${field}: ${value}`).not.toThrow();
				expect(parsed && typeof parsed === "object" && !Array.isArray(parsed), `${file} → ${field} debe ser objeto`).toBe(true);
			}
		});

		test(`${file}: campos de lista no llevan sintaxis de array/objeto (parseFrontmatterList)`, () => {
			for (const field of LIST_FIELDS) {
				if (fm[field] === undefined) continue;
				for (const token of parseFrontmatterList(fm[field]) ?? []) {
					// Un token con []{} es sintaxis de array/objeto que este parser NO
					// entiende: se cuela como path/tool literal (p.ej. `--extension []`).
					expect(/[[\]{}]/.test(token), `${file} → ${field}: token inválido "${token}"`).toBe(false);
				}
			}
		});
	}

	test("ein-scout: extensions DEFINIDO y vacío (dispara --no-extensions sin token basura)", () => {
		const fm = parseFrontmatter(readFileSync(join(CORE_AGENTS, "ein-scout.md"), "utf8"));
		// Definido (clave presente) → pi-subagents pone disableAmbientExtensions=true.
		expect(Object.hasOwn(fm, "extensions")).toBe(true);
		// Y parsea a lista vacía → sin `--extension []`.
		expect(parseFrontmatterList(fm.extensions)).toEqual([]);
	});

	test("ein-scout: turnBudget y toolBudget siguen siendo JSON válido (regresión v0.24.0)", () => {
		const fm = parseFrontmatter(readFileSync(join(CORE_AGENTS, "ein-scout.md"), "utf8"));
		expect(JSON.parse(fm.turnBudget)).toEqual({ maxTurns: 12, graceTurns: 2 });
		expect(JSON.parse(fm.toolBudget)).toEqual({ hard: 30, soft: 24, block: "*" });
	});
});
