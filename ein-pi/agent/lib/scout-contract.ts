import { lstatSync, realpathSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
	delegationIncludes,
	delegationWorkflowScript,
	workflowScriptFansOut,
} from "./delegation-shape.ts";

export const SCOUT_REPORT_MAX_BYTES = 16_384;
// Dos lanzamientos fuera de contrato en un turno dejan de ser mala suerte.
export const OFF_CONTRACT_LIMIT = 2;

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
type Report = { version: string; summary: string; summaryReferenceIds: string[]; findings: { claim: string; referenceIds: string[] }[]; references: { id: string; path: string; startLine: number; endLine: number; supports: string }[]; uncertainties: { level: string; statement: string }[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
// Declared (not an unannotated arrow const) so TypeScript applies never-returning
// control-flow analysis: `if (!guard(x)) fail(...)` then narrows x below.
function fail(message: string): never { throw new Error(`ein-scout contract: ${message}`); }

function scoutName(input: unknown): boolean {
	if (!isRecord(input)) return false;
	if (input.agent === "ein-scout" || (isRecord(input.agent) && input.agent.name === "ein-scout")) return true;
	// pi-subagents >= 0.44: the launch lives inside `workflowScript`.
	return delegationIncludes(input, "ein-scout");
}

function unsupportedForm(input: Record<string, unknown>): boolean {
	if (["chain", "steps", "tasks", "parallel", "background", "resume", "continuation", "parentToolCallId"].some((key) => input[key] !== undefined)) return true;
	if (input.foreground === false) return true;
	// A fan-out workflow yields several children; the contract binds ONE report to
	// one tool call, so it cannot say which child it belongs to.
	const script = delegationWorkflowScript(input);
	return script !== undefined && workflowScriptFansOut(script);
}

/** Normalizes the only scout form the beta can associate with one result. */
export function normalizeScoutLaunch(input: unknown, toolCallId: string, tracking: ScoutTracking): ScoutLaunch | undefined {
	if (!scoutName(input)) return undefined;
	if (!isRecord(input)) fail("invalid invocation");
	if (unsupportedForm(input)) fail("nested, chain, parallel, background, or resume launch is unsupported");
	if (!toolCallId) fail("missing tool call id");
	// R6: reject a concurrent scout launch before it executes, not after it burns a
	// delegation. Same toolCallId is an idempotent re-normalization of the same call,
	// never rejected. Retire when the runtime can bind N concurrent scout reports to
	// N tool call ids (`scoutReportText` requires exactly one result) and a
	// measured run shows scout wall-clock dominating.
	//
	// R8: un resultado fuera de contrato NO libera el turno (ver
	// `acceptTrackedScoutResult`). Sin eso, un lanzamiento que vuelve vacío al
	// instante borraba su entrada y desbloqueaba el siguiente en el mismo turno:
	// medido en producción, tres scouts arrancados y tres reportes tirados. La
	// regla "fuera de contrato dos veces es un incidente de infraestructura" ya
	// existía en la prosa del orquestador; aquí es lo que corta el gasto.
	let offContract = 0;
	for (const [pendingId, status] of tracking) {
		if (status === "pending" && pendingId !== toolCallId) fail("a scout is already pending; scouts run one per turn (sequential fan-out)");
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

// El mismo modelo emite la referencia con un único campo `lines` ("N" o "N-M")
// en vez de `startLine`/`endLine` enteros. Se acepta y se normaliza a la forma
// canónica; los tipos de id/path/supports los revalida `validateReference`
// (regex, cotas, existencia en disco) — el oro no se relaja.
function normalizeReference(value: unknown): { id: unknown; path: unknown; startLine: number; endLine: number; supports: unknown } | null {
	if (!isRecord(value)) return null;
	if ("startLine" in value || "endLine" in value) {
		return closed(value, ["id", "path", "startLine", "endLine", "supports"])
			? { id: value.id, path: value.path, startLine: value.startLine as number, endLine: value.endLine as number, supports: value.supports }
			: null;
	}
	if (closed(value, ["id", "path", "lines", "supports"]) && typeof value.lines === "string") {
		const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(value.lines.trim());
		if (!match) return null;
		const startLine = Number(match[1]);
		const endLine = match[2] ? Number(match[2]) : startLine;
		return { id: value.id, path: value.path, startLine, endLine, supports: value.supports };
	}
	return null;
}

function parseReport(payload: unknown): Report {
	const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
	if (Buffer.byteLength(raw, "utf8") > SCOUT_REPORT_MAX_BYTES) fail("report exceeds 16384 UTF-8 bytes");
	let report: unknown;
	try { report = typeof payload === "string" ? JSON.parse(payload) : payload; } catch { fail("malformed structured report"); }
	if (!isRecord(report) || !closed(report, ["version", "summary", "summaryReferenceIds", "findings", "references", "uncertainties"])) fail("invalid report schema");
	if (report.version !== "ein-scout-report/v1" || !boundedString(report.summary, 2000) || !uniqueStrings(report.summaryReferenceIds, 1, 8) || !Array.isArray(report.findings) || report.findings.length < 1 || report.findings.length > 12 || !Array.isArray(report.references) || report.references.length < 1 || report.references.length > 24 || !Array.isArray(report.uncertainties) || report.uncertainties.length < 1 || report.uncertainties.length > 8) fail("invalid report schema");
	for (const finding of report.findings) if (!isRecord(finding) || !closed(finding, ["claim", "referenceIds"]) || !boundedString(finding.claim, 1000) || !uniqueStrings(finding.referenceIds, 1, 8)) fail("invalid finding");
	const references = report.references.map(normalizeReference);
	if (references.some((reference) => reference === null)) fail("invalid reference");
	const uncertainties = report.uncertainties.map(normalizeUncertainty);
	if (uncertainties.some((uncertainty) => uncertainty === null)) fail("missing or invalid uncertainty");
	return { ...report, references, uncertainties } as Report;
}

function validateReference(root: string, reference: Report["references"][number]): void {
	if (!isRecord(reference) || !closed(reference, ["id", "path", "startLine", "endLine", "supports"]) || !/^R[1-9][0-9]*$/.test(reference.id) || !boundedString(reference.path, 512) || isAbsolute(reference.path) || reference.path.includes("\0") || reference.path.split(/[\\/]/).some((part) => part === "" || part === "." || part === "..") || !Number.isInteger(reference.startLine) || reference.startLine < 1 || !Number.isInteger(reference.endLine) || reference.endLine < reference.startLine || !boundedString(reference.supports, 500)) fail("invalid reference");
	const rootReal = realpathSync(root);
	const candidate = resolve(rootReal, reference.path);
	let actual: string;
	try { if (!lstatSync(candidate).isFile()) fail("reference is not a regular file"); actual = realpathSync(candidate); } catch { fail("missing or unreadable reference"); }
	if (relative(rootReal, actual).startsWith("..") || isAbsolute(relative(rootReal, actual))) fail("reference escapes repository root");
	let lines: string[];
	try { lines = readFileSync(actual, "utf8").split(/\r?\n/); } catch { fail("unreadable reference"); }
	if (reference.endLine > lines.length) fail("reference line range is invalid");
}

export function validateScoutReport(payloads: readonly unknown[], root: string): Report {
	if (payloads.length !== 1) fail(payloads.length === 0 ? "missing structured report" : "multiple structured reports");
	const report = parseReport(payloads[0]);
	const ids = new Set<string>();
	for (const reference of report.references) { if (ids.has(reference.id)) fail("duplicate reference id"); ids.add(reference.id); validateReference(root, reference); }
	const used = new Set([...report.summaryReferenceIds, ...report.findings.flatMap((finding) => finding.referenceIds)]);
	for (const id of used) if (!ids.has(id)) fail("unknown reference id");
	if (used.size !== ids.size) fail("unreferenced reference");
	return report;
}

// Lee el reporte de la SALIDA FINAL del scout (finalOutput), como cualquier
// subagente. Exige exactamente un resultado: el scout corre foreground y único.
//
// El mensaje dice lo OBSERVADO, no la causa. Antes afirmaba "launched async or
// in parallel?" como si lo supiera: era una hipótesis, y cuando el fallo real
// fuese otro mandaba a corregir lo que no estaba roto. Se nombra la forma
// (cuántos resultados llegaron) y se marca como forma, no como diagnóstico.
function scoutReportText(details: unknown): string {
	if (!isRecord(details) || !Array.isArray(details.results)) {
		fail("the runtime returned no results list for this scout call");
	}
	if (details.results.length !== 1) {
		fail(details.results.length === 0
			? "the scout call returned 0 results in this turn — the shape of a launch that did not run foreground; one scout, foreground, per turn"
			: `the scout call returned ${details.results.length} results; one report binds to one tool call, so launch one scout at a time`);
	}
	const result = (details.results as unknown[])[0];
	if (!isRecord(result) || typeof result.finalOutput !== "string" || result.finalOutput.trim().length === 0) {
		fail("scout returned no usable report");
	}
	return result.finalOutput;
}

export function acceptTrackedScoutResult(tracking: ScoutTracking, toolCallId: string, details: unknown, isError: boolean, root: string): Report | undefined {
	if (!tracking.has(toolCallId)) return undefined;
	// Un error del runner es suyo, no del contrato: libera el turno y se pasa el
	// mensaje original tal cual (`isError` lo devuelve sin tocar aguas arriba).
	if (isError) { tracking.delete(toolCallId); return undefined; }
	try {
		const report = validateScoutReport([scoutReportText(details)], root);
		tracking.delete(toolCallId);
		return report;
	} catch (error) {
		// R8: fuera de contrato NO libera el turno. La entrada queda marcada para
		// que el segundo intento fallido corte el tercero antes de que arranque.
		tracking.set(toolCallId, "off-contract");
		throw error;
	}
}
