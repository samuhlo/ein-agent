// =============================================================================
// [CORE] APPLY PACKET — SCHEMA Y VALIDADOR (`apply-packet/v1`)
//
// Un packet es el encargo cerrado que ejecuta un modelo barato: qué resultado
// debe quedar, qué ficheros puede tocar, qué comando corre, cuándo para y qué
// evidencia deja. Si algo de eso falta o miente, el ejecutor tendría que
// decidir — y un ejecutor que decide es un fallo de la fase anterior.
//
// FAIL CLOSED -> la incertidumbre nunca asciende a "ejecutable". Sin digest
// actual de un artefacto de origen no se puede AFIRMAR frescura, así que se
// trata como obsoleto.
//
// No lee disco, no lanza y no tiene estado. Los digests actuales entran como
// parámetro; el borde de E/S vive fuera.
// =============================================================================

export const APPLY_PACKET_FORMAT = "apply-packet/v1";

// Grafías medidas sobre los 51 `tasks.md` archivados, ya normalizadas. Conjunto
// CERRADO: una etiqueta fuera de aquí es `unknown-grammar`, nunca una invitación
// a adivinar la frontera leyendo el cuerpo del grupo.
//
// Fuera a propósito: `production_forecast:` (estimación de tamaño) y
// `> Test runner:` (qué runner, no qué ficheros). Ninguna de las dos es una
// frontera de escritura.
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

export type ApplyPacketEdit = Readonly<{ path: string; intent: string }>;

export type ApplyPacketDraft = Readonly<{
	format: typeof APPLY_PACKET_FORMAT;
	change: string;
	group: string;
	outcome: string;
	allowedFiles: readonly string[];
	allowedFilesGrammar: readonly string[];
	edits: readonly ApplyPacketEdit[];
	invariants: readonly string[];
	focusedCheck: string;
	stopConditions: readonly string[];
	expectedEvidence: string;
	sources: Readonly<Record<string, string>>;
}>;

export type ApplyPacket = ApplyPacketDraft;

export type ApplyPacketIssueCode =
	| "malformed"
	| "missing-field"
	| "missing-invariant"
	| "missing-stop"
	| "unresolved-decision"
	| "stale-source"
	| "out-of-scope"
	| "unknown-grammar";

export type ApplyPacketIssue = Readonly<{ code: ApplyPacketIssueCode; field: string; detail: string }>;

export type ApplyPacketValidation =
	| Readonly<{ ok: true; level: "executable"; packet: ApplyPacket }>
	| Readonly<{ ok: false; level: "incomplete" | "rejected"; issues: readonly ApplyPacketIssue[] }>;

// Un fallo `rejected` significa que el packet AFIRMA algo falso o pide salir de
// su frontera; `incomplete` es que le falta contenido. Mezclarlos escondería el
// caso peligroso detrás del caso administrativo.
const REJECTED_CODES = new Set<ApplyPacketIssueCode>([
	"malformed",
	"unresolved-decision",
	"stale-source",
	"out-of-scope",
	"unknown-grammar",
]);

// Marcadores de decisión sin resolver. ESTRUCTURALES, no vocabulario: una
// palabra suelta como "decidir" aparece en prosa legítima ("...sin decidir
// nada") y marcaba packets válidos como ambiguos. Un marcador solo cuenta si
// nadie lo escribe por accidente.
const UNRESOLVED_MARKERS: readonly RegExp[] = [
	/\bTBD\b/i,
	/\bTODO\b/,
	/\?{2,}/,
	/<[^<>]+>/,
	/\[(?:decidir|elegir|pendiente)[^\]]*\]/i,
];

// Token con pinta de ruta de fuente. Aquí el regex abierto es correcto: sirve
// para DETECTAR un escape de la frontera, no para concederla. El lookbehind
// evita que un placeholder (`tests/<x>.test.ts`) deje un `.test.ts` suelto.
const FILE_TOKEN_RE = /(?<![\w./-])[\w][\w./-]*\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|rs|java|kt|c|cc|cpp|cs|php|sql|css|scss|less|sh|json|ya?ml|md)\b/g;

const REQUIRED_TEXT_FIELDS = ["outcome", "focusedCheck", "expectedEvidence"] as const;

/**
 * [DATA] NORMALIZAR UNA ETIQUETA DE FRONTERA
 * ---------------------------------------------------------
 * Quita blockquote, viñeta, negrita markdown, dos puntos y caso. Devuelve
 * `null` si la etiqueta no está en el conjunto cerrado.
 */
export function normalizeFilesLabel(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const normalized = raw
		.trim()
		// La negrita se quita ANTES que la viñeta: `- ` y `*` comparten carácter, y
		// el limpiador de viñeta se comía un asterisco de `**Production files:**`.
		.replace(/\*\*/g, "")
		.replace(/^>\s*/, "")
		.replace(/^[-*]\s*/, "")
		.replace(/:\s*$/, "")
		.replace(/\s+/g, " ")
		.toLowerCase();
	return KNOWN_LABELS.has(normalized) ? normalized : null;
}

export function isProductionLabel(raw: unknown): boolean {
	const normalized = normalizeFilesLabel(raw);
	return normalized !== null && PRODUCTION_FILES_LABELS.includes(normalized);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function listOf(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

function unresolvedMarker(text: string): string | null {
	for (const marker of UNRESOLVED_MARKERS) {
		const hit = marker.exec(text);
		if (hit) return hit[0];
	}
	return null;
}

function fileTokens(text: string): string[] {
	return [...text.matchAll(FILE_TOKEN_RE)].map((match) => match[0]);
}

function reject(issues: readonly ApplyPacketIssue[]): ApplyPacketValidation {
	const level = issues.some((issue) => REJECTED_CODES.has(issue.code)) ? "rejected" : "incomplete";
	return { ok: false, level, issues };
}

/**
 * [CORE] VALIDAR UN PACKET CONTRA LOS DIGESTS VIVOS
 * ---------------------------------------------------------
 * `currentSources` son los digests de los artefactos de origen tal como están
 * AHORA. Devuelve `ok: true` solo si el packet es ejecutable sin decidir nada.
 */
export function validateApplyPacket(
	draft: unknown,
	currentSources: Readonly<Record<string, string>>,
): ApplyPacketValidation {
	if (!isRecord(draft)) {
		return reject([{ code: "malformed", field: "packet", detail: "el packet no es un objeto" }]);
	}
	if (draft.format !== APPLY_PACKET_FORMAT) {
		return reject([
			{ code: "malformed", field: "format", detail: `formato no soportado: ${JSON.stringify(draft.format)}` },
		]);
	}

	const issues: ApplyPacketIssue[] = [];
	const allowedFiles = listOf(draft.allowedFiles).filter((path): path is string => typeof path === "string");

	for (const field of REQUIRED_TEXT_FIELDS) {
		if (!textOf(draft[field]).trim()) {
			issues.push({ code: "missing-field", field, detail: "campo obligatorio vacío" });
		}
	}
	if (allowedFiles.length === 0) {
		issues.push({ code: "missing-field", field: "allowedFiles", detail: "campo obligatorio vacío" });
	}
	if (listOf(draft.invariants).length === 0) {
		issues.push({ code: "missing-invariant", field: "invariants", detail: "un packet sin invariante no se puede verificar" });
	}
	if (listOf(draft.stopConditions).length === 0) {
		issues.push({ code: "missing-stop", field: "stopConditions", detail: "un packet sin condición de parada no falla en claro" });
	}

	const grammars = listOf(draft.allowedFilesGrammar);
	const unknownLabel = grammars.find((label) => !normalizeFilesLabel(label));
	if (grammars.length === 0 || unknownLabel !== undefined) {
		issues.push({
			code: "unknown-grammar",
			field: "allowedFilesGrammar",
			detail: grammars.length === 0
				? "el packet no declara con qué etiqueta se leyó su frontera"
				: `etiqueta fuera del conjunto cerrado: ${JSON.stringify(unknownLabel)}`,
		});
	}

	// Decisiones pendientes: se revisa TODO campo de texto, no solo el outcome.
	// Un marcador en el comando enfocado es igual de ejecutable que uno en la
	// descripción: nada.
	for (const field of [...REQUIRED_TEXT_FIELDS, "group"] as const) {
		const marker = unresolvedMarker(textOf(draft[field]));
		if (marker) {
			issues.push({ code: "unresolved-decision", field, detail: `decisión sin resolver: ${marker}` });
		}
	}

	// FAIL CLOSED -> un artefacto de origen sin digest actual no se puede
	// declarar fresco. Un mapa de digests ausente o basura invalida todos.
	const live = isRecord(currentSources) ? currentSources : {};
	const declared = isRecord(draft.sources) ? draft.sources : {};
	for (const [artifact, digest] of Object.entries(declared)) {
		if (live[artifact] !== digest) {
			issues.push({
				code: "stale-source",
				field: `sources.${artifact}`,
				detail: live[artifact] === undefined ? "sin digest actual con el que comparar" : "el artefacto cambió desde que se compiló el packet",
			});
		}
	}
	if (Object.keys(declared).length === 0) {
		issues.push({ code: "missing-field", field: "sources", detail: "campo obligatorio vacío" });
	}

	const allowed = new Set(allowedFiles);
	listOf(draft.edits).forEach((edit, index) => {
		const path = isRecord(edit) ? textOf(edit.path) : "";
		if (!allowed.has(path)) {
			issues.push({ code: "out-of-scope", field: `edits[${index}].path`, detail: `${path || "(sin ruta)"} no está en allowedFiles` });
		}
	});

	for (const token of fileTokens(textOf(draft.focusedCheck))) {
		if (!allowed.has(token)) {
			issues.push({ code: "out-of-scope", field: "focusedCheck", detail: `${token} no está en allowedFiles` });
		}
	}

	if (issues.length > 0) return reject(issues);
	return { ok: true, level: "executable", packet: draft as unknown as ApplyPacket };
}
