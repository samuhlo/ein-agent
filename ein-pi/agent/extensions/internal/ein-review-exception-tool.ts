import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { recordReviewException } from "../../lib/review-exception.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

export function registerReviewExceptionTool(registerEinTool: EinToolRegistrar): void {
	registerEinTool({
		name: "ein_review_exception",
		label: "Review exception",
		description: "Record an existing human choice for one over-budget PR from this session. Requires a matching committed full-diff forecast followed by the user's single-PR exception answer. Binds the unchanged commit and diff to later push and PR checks; never prompts or invents consent.",
		parameters: { type: "object", properties: { base: { type: "string", description: "Exact PR base ref, e.g. origin/dev." } }, required: ["base"] } as const,
		async execute(_id, params: { base: string }, _signal, _onUpdate, ctx: ExtensionContext) {
			const sessionFile = ctx.sessionManager.getSessionFile();
			const result = sessionFile
				? recordReviewException(ctx.cwd, params.base, sessionFile)
				: { ok: false as const, reason: "session evidence unavailable" };
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
