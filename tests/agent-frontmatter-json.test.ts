// =============================================================================
// TESTS: los valores objeto/array inline del frontmatter deben ser JSON VÁLIDO
// =============================================================================
// pi-subagents parsea ciertos campos del frontmatter con `JSON.parse` sobre el
// string crudo (agents.ts: `JSON.parse(frontmatter.turnBudget)` y
// `JSON.parse(frontmatter.toolBudget)`). Un valor estilo objeto JS con claves
// SIN comillas —`{ maxTurns: 12 }`— NO es JSON válido y revienta el arranque:
//
//   Expected property name or '}' in JSON at position 2 (line 1 column 3)
//
// Y como al lanzar CUALQUIER subagente pi-subagents enumera el registro entero,
// un agente con frontmatter malo tumba el arranque de TODOS (p.ej. sdd-scope).
//
// Caso real (jul 2026, v0.24.0): `ein-scout.md` traía
//   turnBudget: { maxTurns: 12, graceTurns: 2 }
//   toolBudget: { hard: 30, soft: 24, block: "*" }
// con claves sin comillas. Los tests de model-config usaban un fixture de scout
// SIN esos campos, así que el fallo llegó a producción sin que saltara nada.
// Este test cierra ese hueco: mira los ficheros REALES.
// =============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CORE_AGENTS = join(import.meta.dir, "../ein-pi/core/agents");

function agentFiles(): string[] {
	return readdirSync(CORE_AGENTS)
		.filter((f) => f.endsWith(".md"))
		.sort();
}

// Bloque de frontmatter entre el primer par de `---`.
function frontmatter(raw: string): string {
	const match = raw.match(/^---\n([\s\S]*?)\n---/);
	return match?.[1] ?? "";
}

// Líneas cuyo valor es un objeto/array inline (`clave: { ... }` o `clave: [ ... ]`).
// Ese es exactamente el shape que pi-subagents pasa a JSON.parse.
function inlineStructuredValues(fm: string): Array<{ key: string; value: string }> {
	const out: Array<{ key: string; value: string }> = [];
	for (const line of fm.split("\n")) {
		const m = line.match(/^([A-Za-z0-9_]+):\s*([{[].*[}\]])\s*$/);
		if (m?.[1] && m[2]) out.push({ key: m[1], value: m[2] });
	}
	return out;
}

describe("frontmatter de agentes — valores inline objeto/array son JSON válido", () => {
	for (const file of agentFiles()) {
		const raw = readFileSync(join(CORE_AGENTS, file), "utf8");
		const values = inlineStructuredValues(frontmatter(raw));

		test(`${file}: cada valor inline parsea como JSON (como hace pi-subagents)`, () => {
			for (const { key, value } of values) {
				// Reproduce agents.ts: JSON.parse(frontmatter.<campo>). Con claves
				// sin comillas esto lanza y tumba el arranque del subagente.
				expect(() => JSON.parse(value), `${file} → ${key}: ${value}`).not.toThrow();
			}
		});
	}

	test("ein-scout declara turnBudget y toolBudget como JSON válido (regresión v0.24.0)", () => {
		const fm = frontmatter(readFileSync(join(CORE_AGENTS, "ein-scout.md"), "utf8"));
		const byKey = new Map(inlineStructuredValues(fm).map((v) => [v.key, v.value]));
		expect(byKey.has("turnBudget")).toBe(true);
		expect(byKey.has("toolBudget")).toBe(true);
		expect(JSON.parse(byKey.get("turnBudget")!)).toEqual({ maxTurns: 12, graceTurns: 2 });
		expect(JSON.parse(byKey.get("toolBudget")!)).toEqual({ hard: 30, soft: 24, block: "*" });
	});
});
