import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	createContinuityHandoffLifecycle,
	localExecutableAvailable,
	type ContinuityHandoffLifecycle,
} from "../lib/continuity-handoff-lifecycle.ts";

export const HANDOFF_USAGE = "Usage: /ein:handoff status|refresh|clear|to pi|to claude";
const MUTATING_TOOLS = new Set(["write", "edit", "bash", "subagent", "ein_cleaner_improve_apply", "ein_openspec_sync", "ein_openspec_delta_write"]);

type ExtensionDependencies = Readonly<{
	createLifecycle?: (cwd: string) => ContinuityHandoffLifecycle;
}>;

function notify(ctx: Pick<ExtensionContext, "ui" | "hasUI">, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
}
function statusLine(name: "pi" | "claude", result: Awaited<ReturnType<ContinuityHandoffLifecycle["status"]>>["pi"]): string {
	return `${name}=${result.status};blockers=${result.blockers.join(",") || "none"};warnings=${result.warnings.join(",") || "none"}`;
}

export function createEinContinuityExtension(dependencies: ExtensionDependencies = {}): (pi: ExtensionAPI) => void {
	return (pi: ExtensionAPI): void => {
		let lifecycle: ContinuityHandoffLifecycle | null = null;
		let thresholdNotified = false;
		const active = (): ContinuityHandoffLifecycle | null => lifecycle;
		const create = dependencies.createLifecycle ?? ((cwd: string) => createContinuityHandoffLifecycle(cwd, {
			now: () => new Date().toISOString(),
			runtimeAvailable: (provider) => provider === "pi" || localExecutableAvailable("claude"),
		}));

		pi.registerCommand("ein:handoff", {
			description: "Inspect or prepare a provider-neutral continuity handoff.",
			handler: async (args, ctx): Promise<void> => {
				const command = args;
				const current = active(); if (!current) { notify(ctx, "handoff-unavailable", "warning"); return; }
				if (command === "status") {
					const result = await current.status();
					if (result.operation === "busy") { notify(ctx, "handoff-status=busy", "warning"); return; }
					notify(ctx, `checkpoint=${result.checkpoint};freshness=${result.freshness};${statusLine("pi", result.pi)};${statusLine("claude", result.claude)}`);
					return;
				}
				if (command === "refresh") {
					await ctx.waitForIdle(); notify(ctx, `handoff-refresh=${await current.refresh(true)}`); return;
				}
				if (command === "clear") {
					await ctx.waitForIdle(); notify(ctx, `handoff-clear=${await current.clear()}`); return;
				}
				if (command === "to claude") {
					await ctx.waitForIdle(); const prepared = await current.prepare("claude");
					notify(ctx, prepared.ok ? "handoff=external-launch-required;target=claude" : `handoff=blocked;reason=${prepared.reason};blockers=${prepared.blockers.join(",") || "none"}`, prepared.ok ? "warning" : "error");
					return;
				}
				if (command === "to pi") {
					await ctx.waitForIdle(); const prepared = await current.prepare("pi");
					if (!prepared.ok) { notify(ctx, `handoff=blocked;reason=${prepared.reason};blockers=${prepared.blockers.join(",") || "none"}`, "error"); return; }
					const brief = String(prepared.brief.content); current.markPreparedReplacement();
					let replaced = false, result: { cancelled: boolean };
					try {
						result = await ctx.newSession({ withSession: async (freshCtx): Promise<void> => {
							replaced = true;
							try { await freshCtx.sendUserMessage(brief); }
							catch { try { notify(freshCtx, "handoff=kickoff-delivery-failed;target=pi", "error"); } catch { /* Fresh delivery failure is contained. */ } }
						} });
					} catch { if (!replaced) { current.restoreCancelledReplacement(); notify(ctx, "handoff=session-replacement-failed;target=pi", "error"); } return; }
					if (replaced) return;
					if (result.cancelled) { current.restoreCancelledReplacement(); notify(ctx, "handoff=cancelled;target=pi", "warning"); }
					return;
				}
				notify(ctx, HANDOFF_USAGE, "warning");
			},
		});

		pi.on("session_start", (_event, ctx) => { lifecycle = create(ctx.cwd); thresholdNotified = false; });
		pi.on("input", async (event) => {
			if (event.source === "extension") return { action: "continue" as const };
			const current = active(); if (current) { current.captureInput(event.text); await current.refresh(false); }
			return { action: "continue" as const };
		});
		pi.on("tool_result", async (event) => {
			if (MUTATING_TOOLS.has(event.toolName)) await active()?.mutationResult(!event.isError);
		});
		pi.on("agent_settled", async (_event, ctx) => {
			const current = active(); if (!current) return; const outcome = await current.refresh(false);
			const percent = ctx.getContextUsage()?.percent;
			if (!thresholdNotified && typeof percent === "number" && percent >= 85 && outcome === "refreshed") {
				thresholdNotified = true; notify(ctx, "handoff-boundary=saved;commands=/ein:handoff status | /ein:handoff to pi | /ein:handoff to claude", "warning");
			}
		});
		pi.on("session_before_compact", async (event) => { if (event.reason === "threshold" || event.reason === "overflow") await active()?.refresh(false); });
		pi.on("session_shutdown", async () => { const current = active(); lifecycle = null; if (current) await current.shutdown(); });
	};
}

export default createEinContinuityExtension();
