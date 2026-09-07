import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { updateSddTaskProgress } from "../../lib/sdd-task-progress.ts";

export default function applyProgress(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ein_sdd_task_progress", label: "Task progress",
		description: "Persist one task transition in tasks.md immediately. Start before working; complete before starting the next task. Completed tasks are never restarted. This records execution progress, not independent verification.",
		parameters: { type: "object", properties: { change: { type: "string" }, task: { type: "string" }, action: { type: "string", enum: ["start", "complete"] } }, required: ["change", "task", "action"] } as const,
		async execute(_id, params: { change: string; task: string; action: "start" | "complete" }, _signal, _update, ctx: ExtensionContext) {
			const result = updateSddTaskProgress(ctx.cwd, params.change, params.task, params.action);
			return { content: [{ type: "text", text: `${params.task}: ${params.action} · ${result.counts.done}/${result.items.length}` }], details: result };
		},
	});
}
