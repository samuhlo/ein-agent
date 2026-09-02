// =============================================================================
// [CORE] REGLAS DE FASE DE config.yaml
// Lee la clave `rules:` que el bootstrap escribe en `openspec/config.yaml`.
//
// Existía como decoración: el bootstrap la escribía y NINGÚN consumidor la
// leía, ni siquiera el `test_command`. Escribir configuración que nadie lee es
// exactamente lo que el manifiesto (§ 002) rechaza — un hecho computable que no
// se computa.
//
// El contrato es deliberadamente asimétrico: estas reglas solo pueden RELAJAR
// una comprobación, nunca añadir una. Un proyecto declara `false` cuando esa
// sección no le aporta; nadie declara `true` para apretar, porque el valor por
// defecto ya es estricto. Así la config no puede convertirse en una fuente
// nueva de burocracia (§ 004).
//
// Lector mínimo y acotado a la forma EXACTA que escribe el bootstrap: dos
// niveles de indentación de dos espacios y escalares. No es un parser de YAML y
// no pretende serlo — cualquier cosa que no reconozca se reporta como ausente,
// que degrada al comportamiento estricto por defecto. FAIL CLOSED.
// =============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PhaseRules = Readonly<{
	/** `false` explícito. `undefined` = no declarado → se aplica el default estricto. */
	requireProblemStatement?: boolean;
	requireAcceptanceCriteria?: boolean;
	/** Comando de tests declarado para esa fase, si lo hay. */
	testCommand?: string;
}>;

export type ConfigRules = Readonly<Record<string, PhaseRules>>;

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2 && /^(".*"|'.*')$/s.test(trimmed)) return trimmed.slice(1, -1);
	return trimmed;
}

function stripComment(value: string): string {
	// El bootstrap escribe `key: ""  # vacío: …` para los valores sin rellenar.
	const hash = value.indexOf(" #");
	return hash === -1 ? value : value.slice(0, hash);
}

/**
 * Extrae `rules:` del texto del config. Cualquier forma que el lector no
 * reconozca sale como ausente, nunca como un valor inventado.
 */
export function parseConfigRules(source: string): ConfigRules {
	const lines = source.split("\n");
	const start = lines.findIndex((line) => line === "rules:");
	if (start === -1) return Object.freeze({});

	const out: Record<string, Record<string, unknown>> = {};
	let phase: string | null = null;

	for (const line of lines.slice(start + 1)) {
		// Fin del bloque: la primera línea con contenido en la columna cero.
		if (line.trim() !== "" && !line.startsWith(" ")) break;
		if (line.trim() === "" || line.trim().startsWith("#")) continue;

		const phaseMatch = /^ {2}([a-z0-9-]+):\s*$/.exec(line);
		if (phaseMatch) {
			phase = phaseMatch[1] as string;
			out[phase] ??= {};
			continue;
		}

		const entryMatch = /^ {4}([a-z0-9_]+):\s*(.*)$/.exec(line);
		if (entryMatch && phase) {
			const [, key, raw] = entryMatch;
			const value = unquote(stripComment(raw as string));
			const bucket = out[phase] as Record<string, unknown>;
			if (value === "true" || value === "false") bucket[key as string] = value === "true";
			else if (value !== "") bucket[key as string] = value;
		}
	}

	const rules: Record<string, PhaseRules> = {};
	for (const [name, entry] of Object.entries(out)) {
		rules[name] = Object.freeze({
			...(typeof entry.require_problem_statement === "boolean"
				? { requireProblemStatement: entry.require_problem_statement }
				: {}),
			...(typeof entry.require_acceptance_criteria === "boolean"
				? { requireAcceptanceCriteria: entry.require_acceptance_criteria }
				: {}),
			...(typeof entry.test_command === "string" ? { testCommand: entry.test_command } : {}),
		});
	}
	return Object.freeze(rules);
}

/** Lee las reglas del proyecto. Config ausente o ilegible → sin reglas, o sea estricto. */
export function readConfigRules(cwd: string): ConfigRules {
	const path = join(cwd, "openspec", "config.yaml");
	if (!existsSync(path)) return Object.freeze({});
	try {
		return parseConfigRules(readFileSync(path, "utf8"));
	} catch {
		return Object.freeze({});
	}
}
