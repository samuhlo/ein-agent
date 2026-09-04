// =============================================================================
// [CORE] FRONTERA DECLARADA DE UN GRUPO DE tasks.md
//
// `oversizedGroupWarnings` contaba ficheros barriendo el CUERPO entero del
// grupo (incluidas rutas de `read:` y prosa de `why:`/`architecture:`/
// `avoid:`), así que avisaba por contexto de lectura, no por permiso de
// escritura. Este módulo extrae solo lo que el grupo DECLARA que va a tocar:
// las etiquetas de frontera del conjunto cerrado (v1) y las etiquetas `edit:`
// por tarea (v2).
//
// GUARD -> `shared/` no puede importar de `ein-pi/` (la dirección es
// `ein-pi → shared`), así que el vocabulario de etiquetas v1 se DUPLICA aquí
// en vez de importarse de `ein-pi/agent/lib/apply-packet.ts`. La duplicación
// se ata con un test de paridad de conjuntos (`tests/apply-packet.test.ts`):
// si el conjunto cerrado crece en `ein-pi`, ese test se pone rojo.
// =============================================================================

// Espejo de `PRODUCTION_FILES_LABELS` / `TEST_FILES_LABELS`
// (`ein-pi/agent/lib/apply-packet.ts:26-49`). Atado por test de paridad.
export const PRODUCTION_FILES_LABELS: readonly string[] = [
	"production files",
	"production files (apply touches)",
	"production paths",
	"production-files",
	"production_files",
	"production allowlist",
	"production/doc paths",
	"production",
];

export const TEST_FILES_LABELS: readonly string[] = [
	"test files",
	"test files (apply touches)",
	"test/fixture files (apply touches)",
	"test paths",
	"test allowlist",
	"test_files",
	"focused tests",
	"focused test",
	"tests",
];

const KNOWN_LABELS = new Set([...PRODUCTION_FILES_LABELS, ...TEST_FILES_LABELS]);

// Espejo de `normalizeFilesLabel` (`apply-packet.ts:174-187`).
function normalizeFilesLabel(raw: string): string | null {
	const normalized = raw
		.trim()
		.replace(/\*\*/g, "")
		.replace(/^>\s*/, "")
		.replace(/^[-*]\s*/, "")
		.replace(/:\s*$/, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
	return KNOWN_LABELS.has(normalized) ? normalized : null;
}

// Espejo de `LABEL_CANDIDATE_RE` / `FIELD_RE` (`apply-packet-compile.ts:67,72`).
const LABEL_CANDIDATE_RE = /^\s*((?:>\s*)?(?:[-*]\s*)?(?:\*\*)?[A-Za-z][\w/ ()-]*:(?:\*\*)?)\s*(.*)$/;
const FIELD_RE = /^\s*-\s*([a-z_/ ]+)\s*:\s*(.*)$/i;

// Espejo de `pathsOf` (`apply-packet-compile.ts:136-141`): prefiere lo que va
// entre backticks; descarta prosa con espacios.
function pathsOf(value: string): string[] {
	if (/^\s*(none|ninguno)\b/i.test(value)) return [];
	const ticked = [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
	const raw = ticked.length > 0 ? ticked : value.split(/[,;]/).map((chunk) => chunk.trim());
	return raw.filter((path) => path.length > 0 && !/\s/.test(path));
}

// Etiquetas v1 del conjunto cerrado, en TODO el cuerpo del grupo (frontera de
// grupo + de cada tarea): se cuenta el grupo COMPLETO a propósito, a
// diferencia de `frontierOf` en el compilador de packets (que acota al
// preámbulo para no colar la frontera de una tarea en su hermana).
function v1LabeledPaths(body: string): string[] {
	const out: string[] = [];
	for (const line of body.split("\n")) {
		const match = line.match(LABEL_CANDIDATE_RE);
		if (!match) continue;
		if (!normalizeFilesLabel(match[1])) continue;
		out.push(...pathsOf(match[2]));
	}
	return out;
}

// De un `edit:` solo la PRIMERA celda es ruta (`ruta | operación | intención`,
// espejo de `parseV2Edit`, `apply-packet-compile.ts:246-263`). La celda de
// intención suele citar otras rutas en prosa: contarlas repetiría en pequeño
// el bug que este módulo existe para cerrar.
function editPaths(body: string): string[] {
	const out: string[] = [];
	for (const line of body.split("\n")) {
		const match = line.match(FIELD_RE);
		if (!match) continue;
		if (match[1].trim().toLowerCase() !== "edit") continue;
		const firstCell = match[2].split("|")[0] ?? "";
		out.push(...pathsOf(firstCell));
	}
	return out;
}

// Superficie de escritura DECLARADA por un grupo: etiquetas v1 reconocidas +
// `edit:` v2, sin filtrar aún por producción. El filtro de producción se
// aplica por RUTA (no por etiqueta): un test listado bajo `production files:`
// no cuenta, y un `.ts` mal listado bajo `test files:` sí describe escritura
// de producción real.
export function extractDeclaredFrontierPaths(body: string): string[] {
	return [...new Set([...v1LabeledPaths(body), ...editPaths(body)])];
}
