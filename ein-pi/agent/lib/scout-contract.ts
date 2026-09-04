import { lstatSync, realpathSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
	delegationIncludes,
	delegationWorkflowScript,
} from "./delegation-shape.ts";

export const SCOUT_REPORT_MAX_BYTES = 16_384;
// Dos lanzamientos fuera de contrato en un turno dejan de ser mala suerte.
// RE-APUNTADO: solo cuenta el fallo TOTAL (JSON malformado, schema inválido,
// salida vacía, cero resultados). Un reporte con una cita mala ya no gasta una
// vida: se salva. Ese era el gasto real — dos reportes buenos seguidos cortaban
// la investigación.
export const OFF_CONTRACT_LIMIT = 2;
// El bound de ramas del fan-out vive aquí, no solo en la prosa del orquestador:
// un párrafo es una sugerencia, esto es una garantía (`// 002`).
export const MAX_FANOUT_BRANCHES = 3;

// LOS DOS NIVELES DE VALIDACIÓN (la decisión de diseño de este módulo):
//
//   Coherencia INTERNA -> estricta. Schema, ids únicos, ids conocidos, sin
//     referencias huérfanas. Es determinista, gratis y es responsabilidad del
//     modelo. Falla cerrado.
//   Citas contra DISCO -> tolerante y con procedencia. Es donde el modelo
//     escribe un número a mano y se equivoca. Se recorta lo recortable, se
//     descarta lo irrecuperable, y el resto del reporte llega al padre.
//
// Medido antes de este cambio: dos reportes de 21 y 28 llamadas de herramienta
// descartados enteros porque UNA cita de cada uno se pasaba del final del
// fichero por 2 y por 4 líneas. 19 de 21 referencias eran válidas. MANIFIESTO
// `// 004`: un arnés que impide que el trabajo salga es burocracia.

// El schema del reporte se valida a mano en `parseReport` (abajo). Ya NO se
// inyecta como `outputSchema` al lanzar el scout: forzar el canal estructurado
// del runtime era la fuente de fragilidad — el modelo emite el reporte como su
// mensaje final (texto), y desde ahí se valida, como cualquier otro subagente.
//
// Sin ese schema, un modelo barato emite el JSON en su forma natural más simple
// (uncertainties como strings, references con un `lines` "N-M" en vez de
// startLine/endLine). `parseReport` NORMALIZA esas formas a la canónica en vez
// de rechazarlas: el prompt guía, el parser tolera, y la única validación que se
// mantiene estricta es el oro — que cada cita apunte a un fichero:línea real.

export type ScoutLaunch = Record<string, unknown>;
export type ScoutTracking = Map<string, string>;
type Reference = { id: string; path: string; startLine: number; endLine: number; supports: string };
type Uncertainty = { level: string; statement: string };
type Report = { version: string; summary: string; summaryReferenceIds: string[]; findings: { claim: string; referenceIds: string[] }[]; references: Reference[]; uncertainties: Uncertainty[] };
export type ScoutFanout = { version: "ein-scout-fanout/v1"; branches: { task: string; report: Report }[]; dropped: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// Declared (not an unannotated arrow const) so TypeScript applies never-returning
// control-flow analysis: `if (!guard(x)) fail(...)` then narrows x below.
function fail(message: string): never { throw new Error(`ein-scout contract: ${message}`); }

class ScoutRuntimeUnavailableError extends Error {}

function runtimeUnavailable(message: string): never {
	throw new ScoutRuntimeUnavailableError(`ein-scout runtime unavailable: ${message}`);
}

function scoutName(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.agent === "ein-scout" || (isRecord(input.agent) && input.agent.name === "ein-scout")) return true;
	// pi-subagents >= 0.44: the launch lives inside `workflowScript`.
	return delegationIncludes(input, "ein-scout");
}

function unsupportedForm(input: Record<string, unknown>): boolean {
	if (["chain", "steps", "tasks", "parallel", "background", "resume", "continuation", "parentToolCallId"].some((key) => input[key] !== undefined)) return true;
	return input.foreground === false;
	// RETIRADO: el rechazo del fan-out. Su causa declarada — "el contrato ata UN
	// reporte a una tool call, no sabe de qué hijo es" — dejó de ser cierta: el
	// runtime devuelve un SingleResult por hijo dentro de `details.results[]`,
	// cada uno con `agent`, `task` y `finalOutput` (`sdd-participants.ts:159-172`).
	// La condición de retirada escrita en este mismo fichero se cumplió.
}

/** Normalizes the only scout form the beta can associate with one result. */
export function normalizeScoutLaunch(input: unknown, toolCallId: string, tracking: ScoutTracking): ScoutLaunch | undefined {
	if (!scoutName(input)) return undefined;
	if (!isRecord(input)) fail("invalid invocation");
	if (unsupportedForm(input)) fail("nested, chain, parallel, background, or resume launch is unsupported");
	if (!toolCallId) fail("missing tool call id");
	// RETIRADO: la puerta "un scout pendiente por turno". Con el fan-out validado
	// rama a rama ya no hay ambigüedad que proteger, y de paso muere su riesgo
	// residual: un scout cancelado dejaba un `pending` huérfano que bloqueaba
	// todos los lanzamientos siguientes hasta el final del turno.
	//
	// R8: un resultado fuera de contrato NO libera el turno (ver
	// `acceptTrackedScoutResult`). Sin eso, un lanzamiento que vuelve vacío al
	// instante borraba su entrada y desbloqueaba el siguiente en el mismo turno:
	// medido en producción, tres scouts arrancados y tres reportes tirados. La
	// regla "fuera de contrato dos veces es un incidente de infraestructura" ya
	// existía en la prosa del orquestador; aquí es lo que corta el gasto.
	let offContract = 0;
	for (const [, status] of tracking) {
		if (status === "unavailable") {
			fail("runtime unavailable earlier this turn; do not relaunch scout work until the next user turn");
		}
		if (status === "off-contract") offContract += 1;
	}
	if (offContract >= OFF_CONTRACT_LIMIT) fail("the scout returned off-contract twice this turn; treat it as an infrastructure incident, surface it, and degrade to bounded reads instead of relaunching");
	tracking.set(toolCallId, "pending");
	// `extensions` is not a supported parent-call field. The scout agent's
	// explicit empty frontmatter declaration is the only extension policy.
	const { extensions: _extensions, ...launch } = input;
	void _extensions;
	const contract = {
		context: "fresh",
		maxRuntimeMs: 120_000,
		turnBudget: { maxTurns: 12, graceTurns: 2 },
		toolBudget: { hard: 30, soft: 24, block: "*" },
		acceptance: { level: "none", reason: "Ein validates the scout report through its deterministic local adapter" },
	};
	// Script form: the agent is named inside the script, and top-level `agent` is
	// the runtime's MANAGEMENT target — writing it there would not launch
	// anything. The contract fields still apply as workflow-level defaults.
	// `async: false` is part of the contract, not a preference: workflow scripts
	// start in the background by default, and a backgrounded scout cannot return
	// its report through this tool call.
	if (delegationWorkflowScript(input) !== undefined) {
		return { ...launch, ...contract, async: false };
	}
	return { ...launch, ...contract, agent: "ein-scout", async: false };
}


function uniqueStrings(value: unknown, min: number, max: number): value is string[] {
	return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === "string") && new Set(value).size === value.length;
}
function boundedString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function closed(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value); }

// Un modelo barato (thinking low) emite la incertidumbre como un simple
// `statement` (string), no como `{ level, statement }` — es lo que el prompt le
// pide en lenguaje natural. Se acepta y se marca `material`: el nivel es
// informativo, lo que el parent lee es el texto. La forma objeto sigue valiendo.
function normalizeUncertainty(value: unknown): { level: string; statement: string } | null {
	if (boundedString(value, 500)) return { level: "material", statement: value };
	if (isRecord(value) && closed(value, ["level", "statement"]) && ["none", "low", "material"].includes(String(value.level)) && boundedString(value.statement, 500)) {
		return { level: String(value.level), statement: value.statement as string };
	}
	return null;
}

type NormalizedReference = { id: unknown; path: unknown; startLine: number; endLine: number; supports: unknown };
// `// 002`: devolver `null` en un rechazo tira justo lo que el segundo intento
// necesita para corregirse. `reason` cuesta lo mismo de escribir y convierte un
// fallo mudo en uno corregible (D3).
type NormalizeReferenceResult = { ok: true; value: NormalizedReference } | { ok: false; reason: string };

// El mismo modelo emite la referencia con un único campo `lines` ("N" o "N-M"),
// con `lineStart`/`lineEnd` en vez de enteros `startLine`/`endLine`, o con
// `quote` en vez de `supports`. Las tres se aceptan y se normalizan a la forma
// canónica; los tipos de id/path/supports los revalida `checkReference` (regex,
// cotas, existencia en disco) — el oro no se relaja aquí, solo se lee la forma.
//
// Mezclar dos formas de rango, o `quote` junto a `supports`, es AMBIGÜEDAD:
// el modelo escribió dos verdades distintas y elegir una en silencio sería
// fabricar contenido (D3). Se rechaza nombrando ambas claves en conflicto.
function normalizeReference(value: unknown): NormalizeReferenceResult {
	if (!isRecord(value)) return { ok: false, reason: "not an object" };

	const hasStartEnd = "startLine" in value || "endLine" in value;
	const hasLines = "lines" in value;
	const hasLineStartEnd = "lineStart" in value || "lineEnd" in value;
	const rangeForms = [hasStartEnd, hasLines, hasLineStartEnd].filter(Boolean).length;
	if (rangeForms > 1) {
		const present = [
			hasStartEnd ? "startLine/endLine" : null,
			hasLines ? "lines" : null,
			hasLineStartEnd ? "lineStart/lineEnd" : null,
		].filter((form): form is string => form !== null);
		return { ok: false, reason: `"${present[0]}" and "${present[1]}" are both present; keep only one range form` };
	}

	let startLine: number;
	let endLine: number;
	if (hasStartEnd) {
		if (!("startLine" in value)) return { ok: false, reason: `missing "startLine"` };
		if (!("endLine" in value)) return { ok: false, reason: `missing "endLine"` };
		startLine = value.startLine as number;
		endLine = value.endLine as number;
	} else if (hasLineStartEnd) {
		if (!("lineStart" in value)) return { ok: false, reason: `missing "lineStart"` };
		if (!("lineEnd" in value)) return { ok: false, reason: `missing "lineEnd"` };
		startLine = value.lineStart as number;
		endLine = value.lineEnd as number;
	} else if (hasLines) {
		if (typeof value.lines !== "string") return { ok: false, reason: `"lines" must be a string` };
		const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(value.lines.trim());
		if (!match) return { ok: false, reason: `"lines" is not a valid line range` };
		startLine = Number(match[1]);
		endLine = match[2] ? Number(match[2]) : startLine;
	} else {
		return { ok: false, reason: "no recognized line range form" };
	}

	const hasQuote = "quote" in value;
	const hasSupports = "supports" in value;
	if (hasQuote && hasSupports) return { ok: false, reason: `"quote" and "supports" are both present; keep only "supports"` };
	const supports = hasQuote ? value.quote : value.supports;

	const rangeKeys = hasStartEnd ? ["startLine", "endLine"] : hasLineStartEnd ? ["lineStart", "lineEnd"] : ["lines"];
	const supportsKey = hasQuote ? "quote" : "supports";
	if (!closed(value, ["id", "path", ...rangeKeys, supportsKey])) return { ok: false, reason: "unexpected key in reference" };

	return { ok: true, value: { id: value.id, path: value.path, startLine, endLine, supports } };
}

const CANONICAL_ROOT_KEYS = ["version", "summary", "summaryReferenceIds", "findings", "references", "uncertainties"] as const;

// D1: la normalización de forma vive AQUÍ, delante de `closed`, no dentro de
// él. `closed` es el cierre — la única garantía de que ninguna clave que nadie
// mira sobrevive hasta el JSON que se entrega al padre. Relajarlo para aceptar
// alias abriría exactamente esa fuga; normalizar antes mantiene una sola
// definición de "reporte canónico" y deja el cierre intacto.
function canonicalizeReport(report: Record<string, unknown>): Record<string, unknown> {
	const canonical: Record<string, unknown> = { ...report };

	// Alias de raíz: un modelo barato nombra la versión `schema`. Renombrar es
	// tolerar la forma; aceptar `schema` y `version` a la vez con valores
	// distintos sería elegir en silencio cuál de las dos verdades del modelo
	// vale, y eso es fabricar contenido (D3) — se rechaza nombrando ambas.
	if ("schema" in canonical) {
		if ("version" in canonical) fail(`invalid report schema: "schema" and "version" are both present; keep only "version"`);
		canonical.version = canonical.schema;
		delete canonical.schema;
	}

	for (const key of CANONICAL_ROOT_KEYS) if (!(key in canonical)) fail(`invalid report schema: missing "${key}"`);
	for (const key of Object.keys(canonical)) if (!(CANONICAL_ROOT_KEYS as readonly string[]).includes(key)) fail(`invalid report schema: unexpected key "${key}"`);

	// D4: la clave AUSENTE sigue siendo olvido y muere arriba en `missing
	// "uncertainties"`. El array PRESENTE pero vacío es otra cosa: el scout miró
	// y no encontró nada material, y esa afirmación necesita quedar escrita —
	// una lista vacía aguas abajo se lee igual que "este campo no aplica",
	// perdiendo el trabajo que el scout sí hizo. Se normaliza aquí, antes de la
	// cota `length >= 1` de `parseReport`, que se queda intacta sobre el objeto
	// ya normalizado.
	if (Array.isArray(canonical.uncertainties) && canonical.uncertainties.length === 0) {
		canonical.uncertainties = [{ level: "none", statement: "el scout declaró explícitamente que no hay incertidumbre material" }];
	}

	// Cada finding se RECONSTRUYE, no se valida in situ: es lo único que
	// garantiza que un `id` decorativo (o cualquier otra clave) no sobreviva
	// por un spread más adelante. El `id` se descarta sin inspeccionar su
	// valor porque no tiene destino — el tipo `Report` no le da sitio y ningún
	// `referenceIds` lo apunta; validar un dato que se tira es ceremonia.
	// Cualquier OTRA clave sobrante sí se rechaza, nombrada.
	if (Array.isArray(canonical.findings)) {
		canonical.findings = canonical.findings.map((finding) => {
			if (!isRecord(finding)) return finding;
			const { id: _id, claim, referenceIds, ...rest } = finding;
			void _id;
			const extra = Object.keys(rest);
			if (extra.length > 0) fail(`invalid finding: unexpected key "${extra[0]}"`);
			return { claim, referenceIds };
		});
	}

	return canonical;
}

function parseReport(payload: unknown): Report {
	const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
	if (Buffer.byteLength(raw, "utf8") > SCOUT_REPORT_MAX_BYTES) fail("report exceeds 16384 UTF-8 bytes");
	let report: unknown;
	try { report = typeof payload === "string" ? JSON.parse(payload) : payload; } catch { fail("malformed structured report"); }
	if (!isRecord(report)) fail("invalid report schema");
	const canonical = canonicalizeReport(report);
	if (!closed(canonical, CANONICAL_ROOT_KEYS as unknown as string[])) fail("invalid report schema");
	if (canonical.version !== "ein-scout-report/v1" || !boundedString(canonical.summary, 2000) || !uniqueStrings(canonical.summaryReferenceIds, 1, 8) || !Array.isArray(canonical.findings) || canonical.findings.length < 1 || canonical.findings.length > 12 || !Array.isArray(canonical.references) || canonical.references.length < 1 || canonical.references.length > 24 || !Array.isArray(canonical.uncertainties) || canonical.uncertainties.length < 1 || canonical.uncertainties.length > 8) fail("invalid report schema");
	for (const finding of canonical.findings) if (!isRecord(finding) || !boundedString(finding.claim, 1000) || !uniqueStrings(finding.referenceIds, 1, 8)) fail("invalid finding");
	const rawReferences = canonical.references;
	// R3: el rechazo nombra la referencia (por id, cuando lo trae) y su causa
	// concreta, en vez del "invalid reference" mudo de antes — un mensaje sin
	// nombre solo permite relanzar a ciegas.
	const references: NormalizedReference[] = [];
	for (let index = 0; index < rawReferences.length; index += 1) {
		const normalized = normalizeReference(rawReferences[index]);
		if (!normalized.ok) {
			const raw = rawReferences[index];
			const id = isRecord(raw) && typeof raw.id === "string" ? raw.id : "?";
			fail(`invalid reference ${id}: ${normalized.reason}`);
		}
		references.push(normalized.value);
	}
	const uncertainties = canonical.uncertainties.map(normalizeUncertainty);
	if (uncertainties.some((uncertainty) => uncertainty === null)) fail("missing or invalid uncertainty");
	return { ...canonical, references, uncertainties } as Report;
}

// R2. El mensaje dice QUÉ cita falla. Antes era "reference line range is
// invalid" y nada más: el segundo intento no tenía forma de corregir lo que
// nadie nombraba, así que falló idéntico al primero.
function cite(reference: Reference): string {
	return `${reference.id} ${reference.path} ${reference.startLine}-${reference.endLine}`;
}

// El `split` deja un elemento vacío final cuando el fichero acaba en salto de
// línea. Contarlo inflaría el fichero en una línea y el recorte apuntaría a una
// línea que no existe.
function lineCount(lines: string[]): number {
	return lines.length > 1 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

type ReferenceCheck = { ok: true; reference: Reference } | { ok: false; reason: string };

function checkReference(root: string, reference: Reference): ReferenceCheck {
	const shape = isRecord(reference) && closed(reference, ["id", "path", "startLine", "endLine", "supports"]) && /^R[1-9][0-9]*$/.test(reference.id) && boundedString(reference.path, 512) && !isAbsolute(reference.path) && !reference.path.includes("\0") && !reference.path.split(/[\\/]/).some((part) => part === "" || part === "." || part === "..") && Number.isInteger(reference.startLine) && reference.startLine >= 1 && Number.isInteger(reference.endLine) && reference.endLine >= reference.startLine && boundedString(reference.supports, 500);
	if (!shape) return { ok: false, reason: `${isRecord(reference) && typeof reference.id === "string" ? reference.id : "?"}: invalid reference shape` };

	const rootReal = realpathSync(root);
	const candidate = resolve(rootReal, reference.path);
	let actual: string;
	try {
		if (!lstatSync(candidate).isFile()) return { ok: false, reason: `${cite(reference)}: not a regular file` };
		actual = realpathSync(candidate);
	} catch { return { ok: false, reason: `${cite(reference)}: missing or unreadable` }; }
	if (relative(rootReal, actual).startsWith("..") || isAbsolute(relative(rootReal, actual))) return { ok: false, reason: `${cite(reference)}: escapes the repository root` };

	let lines: string[];
	try { lines = readFileSync(actual, "utf8").split(/\r?\n/); } catch { return { ok: false, reason: `${cite(reference)}: unreadable` }; }
	const last = lineCount(lines);
	// R1. Un `startLine` fuera del fichero no es un redondeo: no hay nada que
	// recortar y la cita no apunta a ninguna evidencia.
	if (reference.startLine > last) return { ok: false, reason: `${cite(reference)}: startLine ${reference.startLine} is past the last line (${last})` };
	// El final SÍ se recorta. Es el fallo medido: `1-105` sobre un fichero de 101
	// líneas es "el fichero entero" con el final redondeado, no una cita falsa.
	return { ok: true, reference: reference.endLine > last ? { ...reference, endLine: last } : reference };
}

export function validateScoutReport(payloads: readonly unknown[], root: string): Report {
	if (payloads.length !== 1) fail(payloads.length === 0 ? "missing structured report" : "multiple structured reports");
	const report = parseReport(payloads[0]);

	// NIVEL 1 — coherencia interna: estricta, determinista, del modelo.
	const ids = new Set<string>();
	for (const reference of report.references) { if (ids.has(reference.id)) fail("duplicate reference id"); ids.add(reference.id); }
	const used = new Set([...report.summaryReferenceIds, ...report.findings.flatMap((finding) => finding.referenceIds)]);
	for (const id of used) if (!ids.has(id)) fail("unknown reference id");
	if (used.size !== ids.size) fail("unreferenced reference");

	// NIVEL 2 — citas contra disco: se recorta, se descarta, se declara.
	const kept: Reference[] = [];
	const dropped: string[] = [];
	for (const reference of report.references) {
		const checked = checkReference(root, reference);
		if (checked.ok) kept.push(checked.reference);
		else dropped.push(checked.reason);
	}
	if (dropped.length === 0) return { ...report, references: kept };

	const live = new Set(kept.map((reference) => reference.id));
	const findings = report.findings
		.map((finding) => ({ ...finding, referenceIds: finding.referenceIds.filter((id) => live.has(id)) }))
		.filter((finding) => finding.referenceIds.length > 0);
	const summaryReferenceIds = report.summaryReferenceIds.filter((id) => live.has(id));
	// NO se podan "huérfanas sobrevenidas": no existen. Un finding solo cae
	// cuando TODAS sus referencias mueren, así que ninguna referencia viva puede
	// quedarse sin usar por el descarte de un finding, y las del summary
	// sobreviven al filtro. Se comprobó con un test que resultó imposible de
	// poner en rojo; el filtro que lo implementaba era código muerto.
	const references = kept;

	if (references.length === 0 || findings.length === 0 || summaryReferenceIds.length === 0) {
		fail(`no valid evidence survived reference validation — ${dropped.join("; ")}`);
	}
	return {
		...report,
		summaryReferenceIds,
		findings,
		references,
		// El descarte viaja con procedencia (`// 002`): no se esconde, se declara.
		// El tope de 8 incertidumbres vale para el reporte de ENTRADA, que valida
		// al modelo; la salida es enriquecimiento de Ein y no puede quedar muda
		// por una cota ajena.
		uncertainties: [...report.uncertainties, ...dropped.map((reason) => ({ level: "material", statement: `referencia descartada — ${reason}` }))],
	};
}

// Lee el reporte de la SALIDA FINAL del scout (finalOutput), como cualquier
// subagente. Una rama por resultado: el runtime devuelve un SingleResult por
// hijo, así que un fan-out son N reportes identificables dentro de UNA tool call.
//
// El mensaje dice lo OBSERVADO, no la causa. Antes afirmaba "launched async or
// in parallel?" como si lo supiera: era una hipótesis, y cuando el fallo real
// fuese otro mandaba a corregir lo que no estaba roto.
type Branch = { task: string; finalOutput: string; runtimeUncertainties: Uncertainty[] };

function turnBudgetSoftNote(maxTurns: number, graceTurns: number, requestedAtTurn: number): string {
	return `Turn budget wrap-up was requested after ${requestedAtTurn} assistant turn${requestedAtTurn === 1 ? "" : "s"} (soft limit ${maxTurns}, grace ${graceTurns}). Process-mode live steering is unavailable, so the child was warned at launch to wrap up by this budget. Output may be partial.`;
}

function branchOutput(result: unknown): Pick<Branch, "finalOutput" | "runtimeUncertainties"> {
	const finalOutput = isRecord(result) && typeof result.finalOutput === "string" ? result.finalOutput : "";
	if (!isRecord(result) || result.exitCode !== 0 || result.wrapUpRequested !== true || !isRecord(result.turnBudget)) {
		return { finalOutput, runtimeUncertainties: [] };
	}
	const budget = result.turnBudget;
	const maxTurns = budget.maxTurns;
	const graceTurns = budget.graceTurns;
	const requestedAtTurn = budget.wrapUpRequestedAtTurn ?? budget.turnCount;
	if (
		budget.outcome !== "wrap-up-requested"
		|| !Number.isInteger(maxTurns) || Number(maxTurns) < 1
		|| !Number.isInteger(graceTurns) || Number(graceTurns) < 0
		|| !Number.isInteger(requestedAtTurn) || Number(requestedAtTurn) < 1
	) {
		return { finalOutput, runtimeUncertainties: [] };
	}
	const note = turnBudgetSoftNote(Number(maxTurns), Number(graceTurns), Number(requestedAtTurn));
	const prefix = `${note}\n\n`;
	if (!finalOutput.startsWith(prefix)) return { finalOutput, runtimeUncertainties: [] };

	// Caso observado desde pi-subagents 0.57.0: el runner mezcla una nota
	// de presentación con el payload de máquina aunque la rama haya terminado
	// con exitCode 0. No se busca JSON heurísticamente: solo se retira la cadena
	// exacta reconstruida desde sus metadatos estructurados. Retirar este bloque
	// cuando la versión latest ya mantenga la nota fuera de finalOutput y la
	// sonda de runtime pruebe esa semántica.
	return {
		finalOutput: finalOutput.slice(prefix.length),
		runtimeUncertainties: [{
			level: "material",
			statement: `el runner pidió cierre en el turno ${requestedAtTurn} (límite ${maxTurns}, gracia ${graceTurns}); la salida puede ser parcial`,
		}],
	};
}

function workflowRuntimeErrors(details: unknown): string[] {
	if (!isRecord(details) || !isRecord(details.workflow)) return [];
	const errors: string[] = [];
	const add = (value: unknown): void => {
		if (typeof value !== "string" || value.trim().length === 0) return;
		const normalized = value.trim();
		let bounded = normalized;
		if (Buffer.byteLength(bounded, "utf8") > 512) {
			bounded = normalized.slice(0, 400);
			while (Buffer.byteLength(`${bounded}…`, "utf8") > 512) bounded = bounded.slice(0, -1);
			bounded = `${bounded}…`;
		}
		if (!errors.includes(bounded) && errors.length < MAX_FANOUT_BRANCHES) errors.push(bounded);
	};
	if (isRecord(details.workflow.value)) {
		for (const branch of Object.values(details.workflow.value)) {
			if (isRecord(branch)) add(branch.error);
		}
	}
	if (Array.isArray(details.workflow.trace)) {
		for (const event of details.workflow.trace) {
			if (isRecord(event) && event.state === "failed") add(event.error);
		}
	}
	return errors;
}

function scoutBranches(details: unknown): Branch[] {
	if (!isRecord(details) || !Array.isArray(details.results)) {
		fail("the runtime returned no results list for this scout call");
	}
	if (details.results.length === 0) {
		const errors = workflowRuntimeErrors(details);
		if (errors.length > 0) {
			const excluded = errors.some((error) => error.includes("No usable subagent models remain"));
			runtimeUnavailable(
				`${errors.join("; ")}${excluded ? " Choose another model for ein-scout in /ein:models or wait for the cached exclusion to expire;" : ""} do not retry this turn`,
			);
		}
		fail("the scout call returned 0 results in this turn; no verified runtime cause was provided");
	}
	if (details.results.length > MAX_FANOUT_BRANCHES) {
		fail(`a read-only scout fan-out carries at most ${MAX_FANOUT_BRANCHES} branches; this call returned ${details.results.length}`);
	}
	return (details.results as unknown[]).map((result, index) => ({
		task: isRecord(result) && typeof result.task === "string" && result.task.length > 0 ? result.task : `branch ${index + 1}`,
		...branchOutput(result),
	}));
}

function validateBranch(branch: Branch, root: string): Report {
	const report = validateScoutReport([branch.finalOutput], root);
	return branch.runtimeUncertainties.length === 0
		? report
		: { ...report, uncertainties: [...report.uncertainties, ...branch.runtimeUncertainties] };
}

// Cada rama se valida por su cuenta: una rama fuera de contrato no arrastra a
// sus hermanas. Es la diferencia entre perder un ángulo y perder la
// investigación entera.
function validateBranches(branches: Branch[], root: string): ScoutFanout {
	const accepted: ScoutFanout["branches"] = [];
	const dropped: string[] = [];
	for (const branch of branches) {
		if (branch.finalOutput.trim().length === 0) { dropped.push(`${branch.task}: returned no usable report`); continue; }
		try { accepted.push({ task: branch.task, report: validateBranch(branch, root) }); }
		catch (error) { dropped.push(`${branch.task}: ${error instanceof Error ? error.message : "off-contract"}`); }
	}
	if (accepted.length === 0) fail(`every scout branch returned off-contract — ${dropped.join("; ")}`);
	return { version: "ein-scout-fanout/v1", branches: accepted, dropped };
}

export function acceptTrackedScoutResult(tracking: ScoutTracking, toolCallId: string, details: unknown, isError: boolean, root: string): Report | ScoutFanout | undefined {
	if (!tracking.has(toolCallId)) return undefined;
	// Un error del runner es suyo, no del contrato: libera el turno y se pasa el
	// mensaje original tal cual (`isError` lo devuelve sin tocar aguas arriba).
	if (isError) { tracking.delete(toolCallId); return undefined; }
	try {
		const branches = scoutBranches(details);
		// Un solo resultado devuelve el reporte pelado, byte por byte como antes:
		// es el caso mayoritario y no se rompe por añadir el fan-out.
		const accepted = branches.length === 1
			? validateBranch(branches[0]!, root)
			: validateBranches(branches, root);
		tracking.delete(toolCallId);
		return accepted;
	} catch (error) {
		if (error instanceof ScoutRuntimeUnavailableError) {
			tracking.set(toolCallId, "unavailable");
			throw error;
		}
		// R8: fuera de contrato NO libera el turno. La entrada queda marcada para
		// que el segundo intento fallido corte el tercero antes de que arranque.
		tracking.set(toolCallId, "off-contract");
		throw error;
	}
}
