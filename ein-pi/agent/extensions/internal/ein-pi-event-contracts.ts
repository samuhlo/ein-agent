// =============================================================================
// EIN PI EVENT CONTRACTS
// Interprets the small, explicit subset of Pi event envelopes that Ein uses.
// Unknown or ambiguous participant results degrade to unavailable evidence.
// =============================================================================

import {
	SDD_AGENT_NAMES,
	SDD_AGENT_NAME_SET,
} from "../../lib/model-config.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_PI_PARTICIPANT_OUTPUT_BYTES = 1024 * 1024;

export type PiParticipantTerminal = Readonly<{
	status: "complete" | "blocked" | "unavailable";
	reason?: string;
}>;

function participantTerminalUnavailable(reason: string): PiParticipantTerminal {
	return { status: "unavailable", reason };
}

export function recognizePiParticipantTerminal(input: {
	toolName: unknown;
	isError: unknown;
	details: unknown;
	agent: string;
	task: string;
}): PiParticipantTerminal {
	if (input.toolName !== "subagent") {
		return participantTerminalUnavailable("unsupported participant delivery");
	}
	if (input.isError !== false) {
		return participantTerminalUnavailable("participant transport failed");
	}
	if (!isRecord(input.details) ||
		(input.details.mode !== "single" && input.details.mode !== "workflow") ||
		!Array.isArray(input.details.results) ||
		input.details.results.length !== 1) {
		return participantTerminalUnavailable("participant terminal result is missing or ambiguous");
	}
	const child = input.details.results[0];
	if (!isRecord(child) || child.agent !== input.agent || child.task !== input.task ||
		typeof child.finalOutput !== "string" || child.finalOutput.trim().length === 0) {
		return participantTerminalUnavailable("participant terminal child identity or output is missing");
	}
	if (Buffer.byteLength(child.finalOutput, "utf8") > MAX_PI_PARTICIPANT_OUTPUT_BYTES) {
		return participantTerminalUnavailable("participant terminal output exceeds the bounded limit");
	}
	const statusLines = child.finalOutput
		.split(/\r?\n/u)
		.filter((line) => /^\s*status\s*:/u.test(line));
	if (statusLines.length !== 1) {
		return participantTerminalUnavailable("participant terminal status is missing or ambiguous");
	}
	const status = /^\s*status\s*:\s*(complete|blocked|unavailable)\s*$/u.exec(statusLines[0]!);
	if (!status) {
		return participantTerminalUnavailable("participant terminal status is unsupported or ambiguous");
	}
	if (status[1] === "blocked") {
		const reason = child.finalOutput
			.split(/\r?\n/u)
			.find((line) => /^\s*reason\s*:\s*\S/u.test(line))
			?.replace(/^\s*reason\s*:\s*/u, "")
			.trim();
		return { status: "blocked", ...(reason ? { reason } : {}) };
	}
	return { status: status[1] as "complete" | "unavailable" };
}

function readStringPath(value: unknown, path: string[]): string | undefined {
	let current = value;
	for (const key of path) {
		if (!isRecord(current)) return undefined;
		current = current[key];
	}
	return typeof current === "string" ? current : undefined;
}

export function readAgentStartNames(event: unknown): string[] {
	return [
		readStringPath(event, ["agentName"]),
		readStringPath(event, ["agent"]),
		readStringPath(event, ["name"]),
		readStringPath(event, ["agent", "name"]),
		readStringPath(event, ["subagent", "name"]),
	]
		.filter((value): value is string => value !== undefined)
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

export function isSddAgentStartEvent(event: unknown): boolean {
	const candidates = readAgentStartNames(event);
	if (candidates.some((value) => SDD_AGENT_NAME_SET.has(value))) return true;
	const systemPrompt = readStringPath(event, ["systemPrompt"]) ?? "";
	return SDD_AGENT_NAMES.some((name) => {
		const phase = name.replace(/^sdd-/, "");
		return new RegExp(`\\bSDD ${phase} executor\\b`, "i").test(systemPrompt);
	});
}

export function isNamedAgentStartEvent(event: unknown): boolean {
	return readAgentStartNames(event).length > 0;
}

export function readAgentTask(event: unknown): string {
	const candidates = [
		readStringPath(event, ["task"]),
		readStringPath(event, ["prompt"]),
		readStringPath(event, ["userPrompt"]),
		readStringPath(event, ["input", "task"]),
		readStringPath(event, ["input", "prompt"]),
		readStringPath(event, ["message"]),
	].filter(
		(value): value is string => typeof value === "string" && value.trim().length > 0,
	);
	return candidates.length > 0
		? candidates.join("\n")
		: readStringPath(event, ["systemPrompt"]) ?? "";
}

export function readExplicitSddChange(event: unknown): string | undefined {
	const direct = [
		readStringPath(event, ["change"]),
		readStringPath(event, ["input", "change"]),
	].find((value) => value !== undefined);
	if (direct && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(direct)) return direct;
	const match = /(?:openspec\/changes\/|\bchange\s*[:=]\s*)([a-z0-9]+(?:-[a-z0-9]+)*)\b/i.exec(
		readAgentTask(event),
	);
	return match?.[1];
}
