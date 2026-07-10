// =============================================================================
// GITIGNORE
// Mantiene un bloque marcado e idempotente en el .gitignore del proyecto con el
// estado de runtime que Ein/Pi dejan en el directorio de trabajo. Una sola
// fuente de verdad: el session_start de ein-ai y el registro de skills delegan
// aquí. Módulo puro (solo builtins de Node) para no acoplar a paquetes en tests.
//
// Lo que ignoramos:
//   .pi/ein/       → toda la config y estado de Ein (lang/tdd/persona/atl/...).
//   .piagents/     → scratch de sesión del binario de Pi; no es código nuestro.
//   .pi-subagents/ → artefactos de runs de subagentes (outputs de fase en
//                    sandbox antes de promocionarse a openspec/changes/). Scratch.
// NOTA: openspec/changes/ NO se ignora — es el board SDD y se versiona.
// =============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BLOCK_START = "# === Ein / Pi runtime (auto-gestionado, no editar) ===";
const BLOCK_END = "# === fin Ein / Pi runtime ===";

// Entradas gestionadas, en orden estable.
const ENTRIES = [".pi/ein/", ".piagents/", ".pi-subagents/"];

// Restos de versiones previas que migramos al bloque nuevo: antes Ein escribía
// `.atl/` bajo un header propio, y `.atl/` ahora vive dentro de `.pi/ein/`.
const LEGACY_HEADER = "# Local Pi runtime state";
const LEGACY_ENTRIES = new Set([".atl/"]);

export function gitignoreBlock(): string {
	return [BLOCK_START, ...ENTRIES, BLOCK_END].join("\n");
}

// Escribe/actualiza el bloque gestionado. Best-effort: nunca rompe la sesión por
// el .gitignore. No toca el fichero si ya está al día (sin churn de mtime).
export function ensureEinGitignore(cwd: string): void {
	const giPath = join(cwd, ".gitignore");
	try {
		const existing = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
		const next = upsertBlock(existing);
		if (next === null) return;
		writeFileSync(giPath, next, "utf8");
	} catch {
		// best-effort
	}
}

// Devuelve el contenido actualizado, o null si ya estaba presente e idéntico.
// Exportada para tests.
export function upsertBlock(existing: string): string | null {
	const block = gitignoreBlock();
	const cleaned = stripLegacy(existing.split("\n"));

	const startIdx = cleaned.findIndex((l) => l.trim() === BLOCK_START);
	if (startIdx === -1) {
		// No hay bloque gestionado: anexar al final preservando lo previo.
		const base = cleaned.join("\n").trimEnd();
		const rebuilt = base ? `${base}\n\n${block}\n` : `${block}\n`;
		return rebuilt === existing ? null : rebuilt;
	}

	// Hay bloque: reemplazar desde el inicio hasta el marcador de fin (o, si es
	// un bloque sin fin, hasta la última entrada gestionada contigua).
	let endIdx = cleaned.findIndex(
		(l, i) => i >= startIdx && l.trim() === BLOCK_END,
	);
	if (endIdx === -1) {
		endIdx = startIdx;
		while (endIdx + 1 < cleaned.length && isManagedEntry(cleaned[endIdx + 1])) {
			endIdx++;
		}
	}
	const before = cleaned.slice(0, startIdx);
	const after = cleaned.slice(endIdx + 1);
	const rebuilt = `${[...before, block, ...after].join("\n").trimEnd()}\n`;
	return rebuilt === existing ? null : rebuilt;
}

function isManagedEntry(line: string): boolean {
	const t = line.trim();
	return ENTRIES.includes(t) || LEGACY_ENTRIES.has(t);
}

// Elimina restos del bloque legacy (header `# Local Pi runtime state` + `.atl/`),
// preservando cualquier otra línea del usuario.
function stripLegacy(lines: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === LEGACY_HEADER) {
			// Saltar el header y las entradas legacy contiguas inmediatas.
			while (i + 1 < lines.length && LEGACY_ENTRIES.has(lines[i + 1].trim())) {
				i++;
			}
			continue;
		}
		out.push(lines[i]);
	}
	return out;
}
