import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { delegationIncludes } from "../../ein-pi/agent/lib/delegation-shape";

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
	// Mapa, no Set -> el tool_result necesita recuperar el input de su propia
	// llamada para sembrar el tracking con normalizeScoutLaunch en el smoke.
	const trackedCalls = new Map<string, unknown>();
	const observations: { toolCallId: string; input: unknown; details: unknown; isError: boolean }[] = [];

	pi.on("tool_call", (event) => {
		// Misma forma que reconoce el contrato -> delegationIncludes es la
		// función compartida que también usa scoutName en scout-contract.ts.
		if (event.toolName === "subagent" && delegationIncludes(event.input, "ein-scout")) {
			trackedCalls.set(event.toolCallId, event.input);
		}
	});

	pi.on("tool_result", (event) => {
		if (event.toolName !== "subagent" || !trackedCalls.has(event.toolCallId)) return;
		const input = trackedCalls.get(event.toolCallId);
		trackedCalls.delete(event.toolCallId);
		// FAIL CLOSED -> El harness valida details; nunca deduce éxito del texto mostrado.
		observations.push({ toolCallId: event.toolCallId, input, details: event.details, isError: event.isError });
		writeFileSync(output, JSON.stringify({ observations }));
	});
}
