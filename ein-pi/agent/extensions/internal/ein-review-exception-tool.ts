import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordReviewException, resolveReviewTarget } from "../../lib/review-exception.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

export function registerReviewExceptionTool(registerEinTool: EinToolRegistrar): void {
	registerEinTool({
		name: "ein_review_exception",
		label: "Review exception",
		description: "Record an existing human one-PR choice for the delivery worktree and exact base. Requires a matching committed full-diff forecast followed by a real selector answer or explicit user message. Binds the unchanged commit and diff to push/PR checks; never asks again or invents consent.",
		parameters: { type: "object", properties: { base: { type: "string", description: "Exact PR base ref, e.g. origin/dev." }, worktree: { type: "string", description: "Absolute root of the delivery worktree; defaults to the current repo." } }, required: ["base"] } as const,
		async execute(_id, params: { base: string; worktree?: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const sessionFile = ctx.sessionManager.getSessionFile();
			let result: ReturnType<typeof recordReviewException>;
			try { result = sessionFile
				? recordReviewException(resolveReviewTarget(ctx.cwd, params.worktree), params.base, sessionFile)
				: { ok: false, reason: "session evidence unavailable" }; }
			catch { result = { ok: false, reason: "delivery worktree is unavailable or belongs to another repository" }; }
			return {
				content: [{ type: "text", text: result.ok
					? `Review exception recorded for ${result.receipt.headOid}: ${result.receipt.production} production lines, ${result.receipt.productionBytes} bytes.`
					: `Review exception unavailable: ${result.reason}` }],
				details: result.ok
					? { ok: true, headOid: result.receipt.headOid, production: result.receipt.production, productionBytes: result.receipt.productionBytes }
					: result,
				isError: !result.ok,
			};
		},
	});
}
