import { setContinuityObjective, showContinuityObjective } from "../../shared/ports/continuity.ts";

export const OBJECTIVE_HELP = `ein-cc-sdd objective show
ein-cc-sdd objective set < objective.json
set requires exactly: {"objective":"...","expectedRevision":"absent|sha256:...","requestId":"...","requestText":"literal human request"}`;

type ObjectiveInput = { objective: string; expectedRevision: string; requestId: string; requestText: string };

export function runObjectiveCommand(cwd: string, args: readonly string[], raw = ""): { text: string; exitCode: 0 | 1 } {
	try {
		const [action = "show"] = args;
		if (args.length > 1 || !["show", "set"].includes(action)) throw new Error(OBJECTIVE_HELP);
		if (action === "show") return { text: JSON.stringify(showContinuityObjective(cwd)), exitCode: 0 };
		if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Objective input exceeds 64 KiB");
		const input: ObjectiveInput = JSON.parse(raw);
		if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "expectedRevision,objective,requestId,requestText"
			|| [input.objective, input.expectedRevision, input.requestId, input.requestText].some((value) => typeof value !== "string" || !value.trim())) {
			throw new Error("Invalid objective attestation");
		}
		const result = setContinuityObjective(cwd, { objective: input.objective, evidence: {
			kind: "claude-attested", requestId: input.requestId, recordedAt: new Date().toISOString(),
		} }, input.expectedRevision);
		return { text: JSON.stringify(result), exitCode: result.outcome === "set" || result.outcome === "unchanged" ? 0 : 1 };
	} catch (error) {
		return { text: error instanceof Error ? error.message : String(error), exitCode: 1 };
	}
}
