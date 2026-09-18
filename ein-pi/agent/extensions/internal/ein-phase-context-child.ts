import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolve } from "node:path";
import { registerAgentPromptHook } from "./ein-agent-prompt-hook.ts";
import { readAgentTask } from "./ein-pi-event-contracts.ts";
import { finishPhaseRun } from "../../lib/sdd-phase-runtime.ts";
import type { PhaseRunReference, PhaseRunStatus } from "../../lib/sdd-phase-receipt.ts";

// The same role-aware context builder serves foreground and ambient children.
export default function phaseContext(pi: ExtensionAPI): void {
	let reference: PhaseRunReference | undefined;
	pi.on("before_agent_start", (event) => {
		const task = readAgentTask(event);
		const marker = task.match(/^ein_phase_run:[\t ]*(\{[^\r\n]+\})[\t ]*$/m);
		if (!marker) return;
		try {
			const value = JSON.parse(marker[1]!) as PhaseRunReference;
			if (value.version === 1 && typeof value.toolCallId === "string" && typeof value.nonce === "string") reference = value;
		} catch { reference = undefined; }
	});
	pi.on("tool_call", (event, ctx) => {
		if (!["write", "edit"].includes(event.toolName) || typeof (event.input as { path?: unknown }).path !== "string") return;
		const path = resolve(ctx.cwd, (event.input as { path: string }).path);
		if (path.split(/[\\/]/).includes(".phase-runs")) return { block: true, reason: "Phase run sidecars may only be written by ein_sdd_phase_complete." };
	});
	pi.registerTool({
		name: "ein_sdd_phase_complete",
		label: "Complete SDD phase",
		description: "Finalize the bound SDD phase run as complete, partial, or blocked. Identity and paths come only from the parent manifest.",
		parameters: { type: "object", properties: { status: { type: "string", enum: ["complete", "partial", "blocked"] }, reason: { type: "string" } }, required: ["status"] } as const,
		async execute(_id, params: { status: PhaseRunStatus; reason?: string }, _signal, _update, ctx) {
			const result = reference && ["complete", "partial", "blocked"].includes(params?.status)
				? finishPhaseRun({ cwd: ctx.cwd, toolCallId: reference.toolCallId, nonce: reference.nonce, status: params.status, reason: params.reason })
				: { ok: false as const, code: "phase-unbound", reason: "this child has no valid phase run manifest" };
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, isError: !result.ok };
		},
	});
	registerAgentPromptHook(pi);
}
