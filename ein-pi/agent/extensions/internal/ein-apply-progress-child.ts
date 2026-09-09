import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommandEvidence } from "./ein-command-evidence-child.ts";
import { updateSddTaskProgress } from "../../lib/sdd-task-progress.ts";

export default function applyProgress(pi: ExtensionAPI): void {
	const evidence = registerCommandEvidence(pi);
	pi.registerTool({
		name: "ein_sdd_task_progress", label: "Task progress",
		description: "Own the tasks.md started marker and checkbox. Call start before work and complete before the next assigned task; do not also edit the checklist. Completed tasks are never restarted. Progress is not independent verification.",
		parameters: { type: "object", properties: { change: { type: "string" }, task: { type: "string", description: "Exact checkbox ID from tasks.md, e.g. 1.1 or 001. Do not include the group number/title, a slash, or a path." }, action: { type: "string", enum: ["start", "complete"] } }, required: ["change", "task", "action"] } as const,
		async execute(_id, params: { change: string; task: string; action: "start" | "complete" }, _signal, _update, ctx: ExtensionContext) {
			const result = updateSddTaskProgress(ctx.cwd, params.change, params.task, params.action);
			return { content: [{ type: "text", text: `${params.task}: ${params.action} · tasks.md updated · ${result.counts.done}/${result.items.length}\n${evidence(ctx)}` }], details: result };
		},
	});
}
