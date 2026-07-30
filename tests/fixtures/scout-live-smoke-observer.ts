import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScoutLaunch(input: unknown): boolean {
	return isRecord(input) && (
		input.agent === "ein-scout" ||
		(isRecord(input.agent) && input.agent.name === "ein-scout")
	);
}

function observerPath(): string {
	const root = process.env.EIN_SCOUT_SMOKE_ROOT;
	const output = process.env.EIN_SCOUT_SMOKE_OBSERVER_PATH;
	if (!root || !output) throw new Error("scout live smoke observer requires isolated root and output paths");

	const resolvedRoot = resolve(root);
	const resolvedOutput = resolve(output);
	const pathFromRoot = relative(resolvedRoot, resolvedOutput);
	if (pathFromRoot === "" || pathFromRoot === ".." || pathFromRoot.startsWith("../")) {
		throw new Error("scout live smoke observer output must stay beneath the isolated root");
	}
	return resolvedOutput;
}

export default function scoutLiveSmokeObserver(pi: ExtensionAPI): void {
	const output = observerPath();
	const trackedCalls = new Set<string>();
	const observations: { details: unknown; isError: boolean }[] = [];

	pi.on("tool_call", (event) => {
		if (event.toolName === "subagent" && isScoutLaunch(event.input)) {
			trackedCalls.add(event.toolCallId);
		}
	});

	pi.on("tool_result", (event) => {
		if (event.toolName !== "subagent" || !trackedCalls.delete(event.toolCallId)) return;
		// FAIL CLOSED -> El harness valida details; nunca deduce éxito del texto mostrado.
		observations.push({ details: event.details, isError: event.isError });
		writeFileSync(output, JSON.stringify({ observations }));
	});
}
