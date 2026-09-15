import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createEinToolRegistrar } from "./ein-tool-registration.ts";
import { registerCommandEvidence } from "./ein-command-evidence-child.ts";
import { updateSddTaskProgress } from "../../lib/sdd-task-progress.ts";
import { normalizeApplyProgressWrite, reconcileApplyProgressPath } from "../../lib/sdd-apply-progress.ts";

export default function applyProgress(pi: ExtensionAPI): void {
	const evidence = registerCommandEvidence(pi);
	const unavailable = () => !pi.getActiveTools().includes("ein_sdd_task_progress");
	const unavailableReason = "Apply progress provider loaded but ein_sdd_task_progress is not active. Correct the child tool allowlist before implementation; do not reconcile checkboxes manually.";
	pi.on("tool_call", (event, ctx) => {
		if (unavailable()) return { block: true, reason: unavailableReason };
		if (event.toolName === "write" && typeof event.input.path === "string" && typeof event.input.content === "string") {
			event.input.content = normalizeApplyProgressWrite(ctx.cwd, event.input.path, event.input.content);
		}
	});
	pi.on("tool_result", (event, ctx) => {
		if (event.isError || (event.toolName !== "write" && event.toolName !== "edit")) return;
		if (typeof event.input.path === "string") reconcileApplyProgressPath(ctx.cwd, event.input.path);
	});
	pi.on("before_agent_start", (event) => {
		if (unavailable()) return { systemPrompt: `${event.systemPrompt}

${unavailableReason}` };
		return { systemPrompt: `${event.systemPrompt}

Task progress capability checked by Ein: ein_sdd_task_progress is active in this child. Use it for start/complete transitions with the exact task ID. Its absence must never be inferred without a failed call. This availability check is not evidence that a task passed verification.` };
	});
	const registerEinTool = createEinToolRegistrar(pi);
	registerEinTool({
		name: "ein_sdd_task_progress", label: "Task progress",
		description: "Own the tasks.md started marker and checkbox. Call start before work and complete before the next assigned task; do not also edit the checklist. Completed tasks are never restarted. Progress is not independent verification.",
		parameters: { type: "object", properties: { change: { type: "string" }, task: { type: "string", description: "Exact checkbox ID from tasks.md, e.g. 1.1 or 001. Do not include the group number/title, a slash, or a path." }, action: { type: "string", enum: ["start", "complete"] } }, required: ["change", "task", "action"] } as const,
		async execute(_id, params: { change: string; task: string; action: "start" | "complete" }, _signal, _update, ctx: ExtensionContext) {
			const result = updateSddTaskProgress(ctx.cwd, params.change, params.task, params.action);
			return { content: [{ type: "text", text: `${params.task}: ${params.action} · tasks.md updated · ${result.counts.done}/${result.items.length} implementation reported; independent acceptance not established by this count.\n${evidence(ctx)}` }], details: { ...result, change: params.change, task: params.task, action: params.action } };
		},
	});
}
