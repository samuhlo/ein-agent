import {
	DOMAIN_ID_PATTERN,
	OPEN_SPEC_FORMAT,
	type OpenSpecDocument,
	type OpenSpecScenario,
} from "./openspec-spec-contract";

export const OPEN_SPEC_DELTA_FORMAT = "openspec-delta/v1";

export type OpenSpecDeltaOperation =
	| { kind: "ADDED" | "MODIFIED"; scenario: OpenSpecScenario }
	| { kind: "REMOVED"; scenarioId: string; reason: string };

export interface OpenSpecDeltaDocument {
	domain: string;
	operations: readonly OpenSpecDeltaOperation[];
}

export interface OpenSpecParseError {
	code: string;
	line: number;
	message: string;
}

export type OpenSpecParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; errors: readonly OpenSpecParseError[] };

interface ScenarioParse {
	scenario: OpenSpecScenario;
	next: number;
}

const SCENARIO_FIELDS = ["title", "requirement", "Given", "When", "Then"] as const;
const DELTA_OPERATIONS = ["ADDED", "MODIFIED", "REMOVED"] as const;

function failure(code: string, line: number, message: string): OpenSpecParseResult<never> {
	return { ok: false, errors: [{ code, line, message }] };
}

function linesOf(source: string): string[] {
	return source.replace(/\r\n/g, "\n").split("\n");
}

function parseHeader(
	lines: readonly string[],
	title: string,
	format: string,
): OpenSpecParseResult<{ domain: string; next: number }> {
	if (lines[0] !== title) return failure("invalid-header", 1, `expected ${title}`);
	if (lines[1] !== `format: ${format}`) return failure("invalid-format", 2, `expected format: ${format}`);
	const domain = lines[2]?.match(/^domain: (.+)$/)?.[1];
	if (!domain || !DOMAIN_ID_PATTERN.test(domain)) {
		return failure("invalid-domain", 3, "domain must be a kebab-case identifier");
	}
	if (lines[3] !== "") return failure("invalid-header", 4, "expected one blank line after domain");
	return { ok: true, value: { domain, next: 4 } };
}

function parseScenario(lines: readonly string[], start: number, heading: string): OpenSpecParseResult<ScenarioParse> {
	const id = lines[start]?.match(new RegExp(`^${heading}: (${DOMAIN_ID_PATTERN.source.slice(1, -1)})$`))?.[1];
	if (!id) return failure("invalid-scenario-id", start + 1, "scenario ID must be a kebab-case identifier");
	const values: Record<string, string> = {};

	for (let offset = 0; offset < SCENARIO_FIELDS.length; offset += 1) {
		const field = SCENARIO_FIELDS[offset];
		const line = lines[start + offset + 1];
		const prefix = `${field}: `;
		if (!line?.startsWith(prefix) || line.slice(prefix.length).trim().length === 0) {
			return failure("invalid-scenario-field", start + offset + 2, `expected non-empty ${field}`);
		}
		values[field] = line.slice(prefix.length);
	}
	if (!/^The system (?:MUST|SHOULD|MAY) .+$/u.test(values.requirement)) {
		return failure("invalid-requirement", start + 3, "requirement must use The system MUST, SHOULD, or MAY");
	}
	return {
		ok: true,
		value: {
			scenario: {
				id,
				title: values.title,
				requirement: values.requirement,
				given: values.Given,
				when: values.When,
				then: values.Then,
			},
			next: start + SCENARIO_FIELDS.length + 1,
		},
	};
}

export function parseOpenSpec(source: string): OpenSpecParseResult<OpenSpecDocument> {
	const lines = linesOf(source);
	const header = parseHeader(lines, "# OpenSpec Specification", OPEN_SPEC_FORMAT);
	if (!header.ok) return header;

	const scenarios: OpenSpecScenario[] = [];
	const seen = new Set<string>();
	let index = header.value.next;
	while (index < lines.length && !(index === lines.length - 1 && lines[index] === "")) {
		const parsed = parseScenario(lines, index, "## Scenario");
		if (!parsed.ok) return parsed;
		if (seen.has(parsed.value.scenario.id)) {
			return failure("duplicate-scenario-id", index + 1, `duplicate scenario ID: ${parsed.value.scenario.id}`);
		}
		seen.add(parsed.value.scenario.id);
		scenarios.push(parsed.value.scenario);
		index = parsed.value.next;
		if (index >= lines.length || (index === lines.length - 1 && lines[index] === "")) break;
		if (lines[index] !== "") return failure("unexpected-content", index + 1, "expected one blank line between scenarios");
		index += 1;
	}
	return { ok: true, value: { domain: header.value.domain, scenarios } };
}

export function parseOpenSpecDelta(source: string): OpenSpecParseResult<OpenSpecDeltaDocument> {
	const lines = linesOf(source);
	const header = parseHeader(lines, "# OpenSpec Delta", OPEN_SPEC_DELTA_FORMAT);
	if (!header.ok) return header;

	const operations: OpenSpecDeltaOperation[] = [];
	const seenIds = new Set<string>();
	const seenSections = new Set<string>();
	let lastSection = -1;
	let index = header.value.next;
	while (index < lines.length && !(index === lines.length - 1 && lines[index] === "")) {
		const section = lines[index]?.match(/^## ([A-Z]+)$/)?.[1];
		if (!section || !DELTA_OPERATIONS.includes(section as (typeof DELTA_OPERATIONS)[number])) {
			return failure("invalid-operation", index + 1, "operation must be ADDED, MODIFIED, or REMOVED");
		}
		const sectionIndex = DELTA_OPERATIONS.indexOf(section as (typeof DELTA_OPERATIONS)[number]);
		if (seenSections.has(section) || sectionIndex <= lastSection) {
			return failure("invalid-operation-order", index + 1, "operations must appear once in ADDED, MODIFIED, REMOVED order");
		}
		seenSections.add(section);
		lastSection = sectionIndex;
		index += 1;
		let count = 0;
		while (index < lines.length && !lines[index]?.startsWith("## ")) {
			if (section === "REMOVED") {
				const id = lines[index]?.match(/^### Scenario: ([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1];
				const reason = lines[index + 1]?.match(/^reason: (.+)$/)?.[1];
				if (!id) return failure("invalid-scenario-id", index + 1, "scenario ID must be a kebab-case identifier");
				if (!reason?.trim()) return failure("invalid-removal-reason", index + 2, "expected non-empty reason");
				if (seenIds.has(id)) return failure("duplicate-scenario-id", index + 1, `duplicate scenario ID: ${id}`);
				seenIds.add(id);
				operations.push({ kind: "REMOVED", scenarioId: id, reason });
				index += 2;
			} else {
				const parsed = parseScenario(lines, index, "### Scenario");
				if (!parsed.ok) return parsed;
				if (seenIds.has(parsed.value.scenario.id)) return failure("duplicate-scenario-id", index + 1, `duplicate scenario ID: ${parsed.value.scenario.id}`);
				seenIds.add(parsed.value.scenario.id);
				operations.push({ kind: section, scenario: parsed.value.scenario });
				index = parsed.value.next;
			}
			count += 1;
			if (index >= lines.length || (index === lines.length - 1 && lines[index] === "")) break;
			if (lines[index] !== "") return failure("unexpected-content", index + 1, "expected one blank line between delta entries");
			index += 1;
			if (index >= lines.length || (index === lines.length - 1 && lines[index] === "")) break;
		}
		if (count === 0) return failure("empty-operation", index + 1, `${section} must contain a scenario`);
	}
	if (operations.length === 0) return failure("empty-delta", 5, "delta must contain at least one operation");
	return { ok: true, value: { domain: header.value.domain, operations } };
}
