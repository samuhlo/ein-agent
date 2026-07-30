import { lstatSync, realpathSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const SCOUT_REPORT_MAX_BYTES = 16_384;

export const SCOUT_REPORT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["version", "summary", "summaryReferenceIds", "findings", "references", "uncertainties"],
	properties: {
		version: { const: "ein-scout-report/v1" },
		summary: { type: "string", minLength: 1, maxLength: 2000 },
		summaryReferenceIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" }, uniqueItems: true },
		findings: {
			type: "array", minItems: 1, maxItems: 12,
			items: { type: "object", additionalProperties: false, required: ["claim", "referenceIds"], properties: { claim: { type: "string", minLength: 1, maxLength: 1000 }, referenceIds: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "string" } } } },
		},
		references: {
			type: "array", minItems: 1, maxItems: 24,
			items: { type: "object", additionalProperties: false, required: ["id", "path", "startLine", "endLine", "supports"], properties: { id: { type: "string", pattern: "^R[1-9][0-9]*$" }, path: { type: "string", minLength: 1, maxLength: 512 }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 }, supports: { type: "string", minLength: 1, maxLength: 500 } } },
		},
		uncertainties: {
			type: "array", minItems: 1, maxItems: 8,
			items: { type: "object", additionalProperties: false, required: ["level", "statement"], properties: { level: { enum: ["none", "low", "material"] }, statement: { type: "string", minLength: 1, maxLength: 500 } } },
		},
	},
} as const;

export type ScoutLaunch = Record<string, unknown>;
export type ScoutTracking = Map<string, string>;
type Report = { version: string; summary: string; summaryReferenceIds: string[]; findings: { claim: string; referenceIds: string[] }[]; references: { id: string; path: string; startLine: number; endLine: number; supports: string }[]; uncertainties: { level: string; statement: string }[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const fail = (message: string): never => { throw new Error(`ein-scout contract: ${message}`); };

function scoutName(input: unknown): boolean {
	return isRecord(input) && (input.agent === "ein-scout" || (isRecord(input.agent) && input.agent.name === "ein-scout"));
}

function unsupportedForm(input: Record<string, unknown>): boolean {
	return ["chain", "steps", "tasks", "parallel", "background", "resume", "continuation", "parentToolCallId"].some((key) => input[key] !== undefined)
		|| input.foreground === false;
}

/** Normalizes the only scout form the beta can associate with one result. */
export function normalizeScoutLaunch(input: unknown, toolCallId: string, tracking: ScoutTracking): ScoutLaunch | undefined {
	if (!scoutName(input)) return undefined;
	if (!isRecord(input)) fail("invalid invocation");
	if (unsupportedForm(input)) fail("nested, chain, parallel, background, or resume launch is unsupported");
	if (!toolCallId) fail("missing tool call id");
	tracking.set(toolCallId, "pending");
	// `extensions` is not a supported parent-call field. The scout agent's
	// explicit empty frontmatter declaration is the only extension policy.
	const { extensions: _extensions, ...launch } = input;
	void _extensions;
	return {
		...launch,
		agent: "ein-scout",
		context: "fresh",
		maxRuntimeMs: 120_000,
		turnBudget: { maxTurns: 12, graceTurns: 2 },
		toolBudget: { hard: 30, soft: 24, block: "*" },
		outputSchema: SCOUT_REPORT_SCHEMA,
		acceptance: { level: "none", reason: "Ein validates the scout report through its deterministic local adapter" },
	};
}


function uniqueStrings(value: unknown, min: number, max: number): value is string[] {
	return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => typeof item === "string") && new Set(value).size === value.length;
}
function boundedString(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max; }
function closed(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value); }

function parseReport(payload: unknown): Report {
	const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
	if (Buffer.byteLength(raw, "utf8") > SCOUT_REPORT_MAX_BYTES) fail("report exceeds 16384 UTF-8 bytes");
	let report: unknown;
	try { report = typeof payload === "string" ? JSON.parse(payload) : payload; } catch { fail("malformed structured report"); }
	if (!isRecord(report) || !closed(report, ["version", "summary", "summaryReferenceIds", "findings", "references", "uncertainties"])) fail("invalid report schema");
	if (report.version !== "ein-scout-report/v1" || !boundedString(report.summary, 2000) || !uniqueStrings(report.summaryReferenceIds, 1, 8) || !Array.isArray(report.findings) || report.findings.length < 1 || report.findings.length > 12 || !Array.isArray(report.references) || report.references.length < 1 || report.references.length > 24 || !Array.isArray(report.uncertainties) || report.uncertainties.length < 1 || report.uncertainties.length > 8) fail("invalid report schema");
	for (const finding of report.findings) if (!isRecord(finding) || !closed(finding, ["claim", "referenceIds"]) || !boundedString(finding.claim, 1000) || !uniqueStrings(finding.referenceIds, 1, 8)) fail("invalid finding");
	for (const uncertainty of report.uncertainties) if (!isRecord(uncertainty) || !closed(uncertainty, ["level", "statement"]) || !["none", "low", "material"].includes(String(uncertainty.level)) || !boundedString(uncertainty.statement, 500)) fail("missing or invalid uncertainty");
	return report as Report;
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

function directStructuredOutput(details: unknown): unknown {
	if (!isRecord(details) || details.mode !== "single" || !Array.isArray(details.results) || details.results.length !== 1) {
		fail("missing structured report");
	}
	const result = details.results[0];
	if (!isRecord(result) || result.structuredOutputFailed === true || !("structuredOutput" in result) || result.structuredOutput === undefined) {
		fail("missing structured report");
	}
	return result.structuredOutput;
}

export function acceptTrackedScoutResult(tracking: ScoutTracking, toolCallId: string, details: unknown, isError: boolean, root: string): Report | undefined {
	if (!tracking.has(toolCallId)) return undefined;
	tracking.delete(toolCallId);
	if (isError) return undefined;
	return validateScoutReport([directStructuredOutput(details)], root);
}
