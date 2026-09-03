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

// V1 conserva la medida histórica. V2 es el contrato vivo: su unidad es el
// grupo que el orquestador delega y no confunde leer, escribir y comprobar.
export const APPLY_PACKET_V2_FORMAT = "apply-packet/v2";

export type ApplyPacketV2Operation = "create" | "modify" | "delete";

export type ApplyPacketV2Step = Readonly<{
	taskId: string;
	path: string;
	operation: ApplyPacketV2Operation;
	intent: string;
}>;

export type ApplyPacketV2Check = Readonly<{
	command: string;
	covers: readonly string[];
}>;

export type ApplyPacketV2Draft = Readonly<{
	format: typeof APPLY_PACKET_V2_FORMAT;
	change: string;
	group: string;
	outcome: string;
	readContext: readonly string[];
	writeAllowlist: readonly string[];
	steps: readonly ApplyPacketV2Step[];
	invariants: readonly string[];
	behaviorSeams: readonly string[];
	checks: readonly ApplyPacketV2Check[];
	stopConditions: readonly string[];
	sources: Readonly<Record<string, string>>;
}>;

export type ApplyPacketV2 = ApplyPacketV2Draft;

export type ApplyPacketV2Validation =
	| Readonly<{ ok: true; level: "executable"; packet: ApplyPacketV2 }>
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

const APPLY_PACKET_V2_SOURCES = ["design.md", "tasks.md"] as const;
const APPLY_PACKET_V2_OPERATIONS = new Set<ApplyPacketV2Operation>(["create", "modify", "delete"]);
const APPLY_PACKET_V2_DENIED_ROOTS = new Set([".git", ".pi", ".atl"]);

function rejectV2(issues: readonly ApplyPacketIssue[]): ApplyPacketV2Validation {
	const level = issues.some((issue) => REJECTED_CODES.has(issue.code)) ? "rejected" : "incomplete";
	return { ok: false, level, issues };
}

function repoRelativePath(value: unknown): value is string {
	if (typeof value !== "string" || value.trim() !== value || value.length === 0) return false;
	if (value.startsWith("/") || value.includes("\\")) return false;
	const segments = value.split("/");
	if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return false;
	return !APPLY_PACKET_V2_DENIED_ROOTS.has(segments[0] ?? "");
}

function pathStrings(issues: ApplyPacketIssue[], field: string, value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const out: string[] = [];
	value.forEach((item, index) => {
		if (typeof item !== "string") {
			issues.push({ code: "malformed", field: `${field}[${index}]`, detail: "la ruta no es texto" });
			return;
		}
		if (!out.includes(item)) out.push(item);
	});
	return out;
}

function checkText(
	issues: ApplyPacketIssue[],
	field: string,
	value: unknown,
	missingCode: ApplyPacketIssueCode = "missing-field",
): string {
	const text = textOf(value).trim();
	if (!text) {
		issues.push({ code: missingCode, field, detail: "campo obligatorio vacío" });
		return "";
	}
	const marker = unresolvedMarker(text);
	if (marker) issues.push({ code: "unresolved-decision", field, detail: `decisión sin resolver: ${marker}` });
	return text;
}

function checkTextList(
	issues: ApplyPacketIssue[],
	field: string,
	value: unknown,
	missingCode: ApplyPacketIssueCode = "missing-field",
): string[] {
	if (!Array.isArray(value) || value.length === 0) {
		issues.push({ code: missingCode, field, detail: "campo obligatorio vacío" });
		return [];
	}
	const out: string[] = [];
	value.forEach((item, index) => {
		const text = checkText(issues, `${field}[${index}]`, item);
		if (text) out.push(text);
	});
	return out;
}

/**
 * [CORE] VALIDAR UN PACKET V2 POR GRUPO
 * ---------------------------------------------------------
 * La lista de escritura solo concede escritura. Los checks son evidencia
 * futura y pueden nombrar tests de solo lectura sin ensanchar ese permiso.
 */
export function validateApplyPacketV2(
	draft: unknown,
	currentSources: Readonly<Record<string, string>>,
): ApplyPacketV2Validation {
	if (!isRecord(draft)) {
		return rejectV2([{ code: "malformed", field: "packet", detail: "el packet no es un objeto" }]);
	}
	if (draft.format !== APPLY_PACKET_V2_FORMAT) {
		return rejectV2([{
			code: "malformed",
			field: "format",
			detail: `formato no soportado: ${JSON.stringify(draft.format)}`,
		}]);
	}

	const issues: ApplyPacketIssue[] = [];
	checkText(issues, "change", draft.change);
	checkText(issues, "group", draft.group);
	checkText(issues, "outcome", draft.outcome);
	checkTextList(issues, "invariants", draft.invariants, "missing-invariant");
	const behaviorSeams = checkTextList(issues, "behaviorSeams", draft.behaviorSeams);
	checkTextList(issues, "stopConditions", draft.stopConditions, "missing-stop");

	const readContext = pathStrings(issues, "readContext", draft.readContext);
	const writeAllowlist = pathStrings(issues, "writeAllowlist", draft.writeAllowlist);
	if (!Array.isArray(draft.readContext) || draft.readContext.length === 0)
		issues.push({ code: "missing-field", field: "readContext", detail: "campo obligatorio vacío" });
	if (!Array.isArray(draft.writeAllowlist) || draft.writeAllowlist.length === 0)
		issues.push({ code: "missing-field", field: "writeAllowlist", detail: "campo obligatorio vacío" });

	for (const [field, paths] of [["readContext", readContext], ["writeAllowlist", writeAllowlist]] as const) {
		paths.forEach((path, index) => {
			if (!repoRelativePath(path)) {
				issues.push({ code: "out-of-scope", field: `${field}[${index}]`, detail: `${path} no es una ruta relativa segura` });
			}
		});
	}

	const readable = new Set(readContext);
	const writable = new Set(writeAllowlist);
	writeAllowlist.forEach((path, index) => {
		if (!readable.has(path)) {
			issues.push({ code: "out-of-scope", field: `writeAllowlist[${index}]`, detail: `${path} no está en readContext` });
		}
	});

	const stepPaths = new Set<string>();
	if (!Array.isArray(draft.steps) || draft.steps.length === 0) {
		issues.push({ code: "missing-field", field: "steps", detail: "un packet sin pasos deja la implementación al ejecutor" });
	} else {
		draft.steps.forEach((candidate, index) => {
			if (!isRecord(candidate)) {
				issues.push({ code: "malformed", field: `steps[${index}]`, detail: "el paso no es un objeto" });
				return;
			}
			checkText(issues, `steps[${index}].taskId`, candidate.taskId);
			const path = textOf(candidate.path);
			if (!repoRelativePath(path)) {
				issues.push({ code: "out-of-scope", field: `steps[${index}].path`, detail: `${path || "(sin ruta)"} no es una ruta relativa segura` });
			} else if (!writable.has(path)) {
				issues.push({ code: "out-of-scope", field: `steps[${index}].path`, detail: `${path} no está en writeAllowlist` });
			} else {
				stepPaths.add(path);
			}
			if (!APPLY_PACKET_V2_OPERATIONS.has(candidate.operation as ApplyPacketV2Operation)) {
				issues.push({ code: "malformed", field: `steps[${index}].operation`, detail: "operación desconocida" });
			}
			checkText(issues, `steps[${index}].intent`, candidate.intent);
		});
	}
	writeAllowlist.forEach((path, index) => {
		if (!stepPaths.has(path)) {
			issues.push({ code: "missing-field", field: `writeAllowlist[${index}]`, detail: `${path} no tiene un paso asociado` });
		}
	});

	const covered = new Set<string>();
	if (!Array.isArray(draft.checks) || draft.checks.length === 0) {
		issues.push({ code: "missing-field", field: "checks", detail: "campo obligatorio vacío" });
	} else {
		draft.checks.forEach((candidate, index) => {
			if (!isRecord(candidate)) {
				issues.push({ code: "malformed", field: `checks[${index}]`, detail: "el check no es un objeto" });
				return;
			}
			checkText(issues, `checks[${index}].command`, candidate.command);
			const covers = checkTextList(issues, `checks[${index}].covers`, candidate.covers);
			for (const seam of covers) {
				if (!behaviorSeams.includes(seam)) {
					issues.push({ code: "out-of-scope", field: `checks[${index}].covers`, detail: `${seam} no está en behaviorSeams` });
				} else {
					covered.add(seam);
				}
			}
		});
	}
	behaviorSeams.forEach((seam, index) => {
		if (!covered.has(seam)) {
			issues.push({ code: "missing-field", field: `behaviorSeams[${index}]`, detail: "ningún check cubre este comportamiento" });
		}
	});

	// Un source extra parece inocuo, pero haría que dos productores discreparan
	// sobre qué artefactos dan identidad al mismo packet. El conjunto es exacto.
	const declared = isRecord(draft.sources) ? draft.sources : {};
	const live = isRecord(currentSources) ? currentSources : {};
	for (const source of APPLY_PACKET_V2_SOURCES) {
		const digest = textOf(declared[source]).trim();
		if (!digest) {
			issues.push({ code: "missing-field", field: `sources.${source}`, detail: "digest obligatorio ausente" });
		} else if (live[source] !== digest) {
			issues.push({ code: "stale-source", field: `sources.${source}`, detail: live[source] === undefined ? "sin digest actual" : "el artefacto cambió" });
		}
	}
	for (const source of Object.keys(declared)) {
		if (!(APPLY_PACKET_V2_SOURCES as readonly string[]).includes(source)) {
			issues.push({ code: "out-of-scope", field: `sources.${source}`, detail: "fuente fuera del conjunto v2" });
		}
	}

	if (issues.length > 0) return rejectV2(issues);
	return { ok: true, level: "executable", packet: draft as unknown as ApplyPacketV2 };
}
