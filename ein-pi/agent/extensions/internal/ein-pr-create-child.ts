import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readArtifactLang } from "../../lib/lang.ts";
import { publishPr } from "../../lib/pr-publication.ts";
import type { PrArtifactInput } from "../../lib/pr-artifact.ts";

export default function prCreateChild(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ein_pr_create", label: "Create reviewed PR",
		description: "Create a PR in Samu's title/body format from concrete facts. Checks the exact committed diff, review exception, and remote branch before publication. GitHub issues are optional; never create one here.",
		parameters: { type: "object", required: ["base", "head", "title", "intent", "changes", "mechanism", "verification", "risks"], properties: {
			base: { type: "string" }, head: { type: "string" }, badge: { type: "string", description: "Optional title badge such as FEAT, FIX or F5; otherwise derived from the branch." },
			title: { type: "string" }, intent: { type: "string" }, changes: { type: "array", items: { type: "string" } },
			mechanism: { type: "string", description: "Explain how the actual code works, not just which files changed." },
			verification: { type: "array", items: { type: "string" }, description: "Exact checks and outcomes already observed; mark unrun checks as such." },
			risks: { type: "array", items: { type: "string" } }, issue: { type: "string", description: "Optional existing GitHub issue (#N) or Linear ID; do not invent one." },
		} } as const,
		async execute(_id, params: Omit<PrArtifactInput, "exception">, _signal, _update, ctx) {
			const result = publishPr(ctx.cwd, params, readArtifactLang(ctx.cwd));
			return { content: [{ type: "text", text: result.ok ? `PR creada: ${result.url} · ${result.title}` : `${result.reason}${result.createdUrl ? ` · ${result.createdUrl}` : ""}` }], details: result, isError: !result.ok };
		},
	});
}
