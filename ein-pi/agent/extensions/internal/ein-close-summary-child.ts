import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { writeVerifiedSddSummary } from "../../lib/sdd-summary-write.ts";

export default function closeSummary(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ein_sdd_summary", label: "Close summary",
		description: "Write summary.md from narrative and exact commands in the fresh passing verify report. Generates required metadata and verify markers; returns errors before the phase finishes. Does not archive or bypass close checks.",
		parameters: { type: "object", properties: { change: { type: "string" }, content: { type: "string" }, commands: { type: "array", items: { type: "string" }, minItems: 1 } }, required: ["change", "content", "commands"] } as const,
		async execute(_id, params: { change: string; content: string; commands: string[] }, _signal, _update, ctx: ExtensionContext) {
			const result = writeVerifiedSddSummary({ cwd: ctx.cwd, ...params });
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, isError: !result.ok };
		},
	});
}
