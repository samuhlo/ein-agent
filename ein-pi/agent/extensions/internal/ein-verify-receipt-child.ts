import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";

import { beginVerification, finishVerification } from "../../lib/sdd-verification-runtime.ts";
import { isSafeChangeName, resolveChangesDir } from "../../lib/sdd-routing-core.ts";
import { resolveSddStatus } from "../../lib/sdd-router.ts";

type Params = { action: "begin" | "finish"; change: string; token?: string; content?: string };

export default function verificationReceipt(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ein_sdd_verification",
		label: "SDD verification receipt",
		description: "Begin verification before checks or finish it with the complete report. The tool binds the report to the Git-enumerated project surface and current SDD decisions; agents never write receipt/session files directly.",
		parameters: {
			type: "object",
			properties: {
				action: { type: "string", enum: ["begin", "finish"] },
				change: { type: "string" },
				token: { type: "string" },
				content: { type: "string" },
			},
			required: ["action", "change"],
		} as const,
		async execute(_id, params: Params, _signal, _update, ctx: ExtensionContext) {
			if (!params || (params.action !== "begin" && params.action !== "finish") || !isSafeChangeName(params.change)) {
				const result = { ok: false, code: "invalid-arguments", reason: "action and a safe change name are required" };
				return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, isError: true };
			}
			const request = { cwd: ctx.cwd, changePath: join(resolveChangesDir(ctx.cwd), params.change) };
			if (params.action === "begin") {
				const specState = resolveSddStatus(ctx.cwd, params.change).specState;
				if (specState === "pending" || specState === "conflict") {
					const result = { ok: false, code: "spec-not-synchronized", reason: "Synchronize or resolve the OpenSpec delta before final verification checks." };
					return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, isError: true };
				}
			}
			const result = params.action === "begin"
				? beginVerification(request)
				: typeof params.token === "string" && typeof params.content === "string"
					? finishVerification({ ...request, token: params.token, content: params.content })
					: { ok: false as const, code: "invalid-arguments", reason: "finish requires token and content" };
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result, isError: !result.ok };
		},
	});
}
