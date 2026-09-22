import { withEinCommandSurfaces } from "../lib/command-surface.ts";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	createContinuityHandoffLifecycle,
	localExecutableAvailable,
	type ContinuityHandoffLifecycle,
} from "../lib/continuity-handoff-lifecycle.ts";
import { showContinuityObjective, type ContinuityObjectiveResult } from "../lib/continuity-objective.ts";
import { piContinuityOperation, continuityToolOutcome } from "../lib/continuity-operation-adapter.ts";
import { createContinuityRecoveryEvidence } from "../lib/continuity-recovery-evidence.ts";
import type { OperationStart, RecoveryAssessment } from "../lib/continuity-operation-runtime.ts";
import { redactMcpText } from "../lib/mcp-card.ts";

export const HANDOFF_USAGE = "Usage: /ein:handoff status|refresh|clear|to pi|to claude";
const REQUEST_ENTRY = "ein:continuity-objective-request";

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
		pi = withEinCommandSurfaces(pi, "ein-continuity");
		let lifecycle: ContinuityHandoffLifecycle | null = null;
		let observedRequestId: string | null = null;
		let thresholdNotified = false;
		let nativeContext: ExtensionContext | undefined;
		const calls = new Map<string, OperationStart>();
		const active = (): ContinuityHandoffLifecycle | null => lifecycle;
		const create = dependencies.createLifecycle ?? ((cwd: string) => createContinuityHandoffLifecycle(cwd, {
			now: () => new Date().toISOString(),
			runtimeAvailable: (provider) => provider === "pi" || localExecutableAvailable("claude"),
			recoveryEvidence: createContinuityRecoveryEvidence(cwd, { sessionId: () => nativeContext?.sessionManager.getSessionId(), entries: () => nativeContext?.sessionManager.getBranch() ?? [] }),
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

		pi.registerTool({
			name: "ein_continuity_objective",
			label: "Continuity objective",
			description: "Show the current objective and expectedRevision with action=show. Set the semantic objective from the latest real human request when recognizing a new task or objective correction; ordinary replies never replace it automatically.",
			parameters: { type: "object", properties: {
				action: { type: "string", enum: ["show", "set"] },
				objective: { type: "string" }, expectedRevision: { type: "string", description: "The checkpoint revision returned by status/show, or absent." },
			} } as const,
			async execute(_id, params: { action?: "show" | "set"; objective?: string; expectedRevision?: string }, _signal, _onUpdate, ctx) {
				if (params.action === "show") {
					const view = showContinuityObjective(ctx.cwd);
					return { content: [{ type: "text" as const, text: JSON.stringify(view) }], details: view, isError: view.kind === "unavailable" };
				}
				const current = active();
				let result: ContinuityObjectiveResult;
				if (!current || !observedRequestId) {
					result = { outcome: "unavailable", reason: !current ? "lifecycle-unavailable" : "human-request-unavailable" };
					return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result, isError: true };
				}
				if (typeof params.objective !== "string" || typeof params.expectedRevision !== "string") {
					result = { outcome: "invalid", reason: "objective-and-revision-required" };
					return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result, isError: true };
				}
				result = await current.setObjective({ objective: params.objective, evidence: {
					kind: "pi-observed", requestId: observedRequestId, recordedAt: new Date().toISOString(),
				} }, params.expectedRevision);
				return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: result, isError: result.outcome !== "set" && result.outcome !== "unchanged" };
			},
		});

		pi.on("session_start", (_event, ctx) => {
			nativeContext = ctx; calls.clear();
			lifecycle = create(ctx.cwd); thresholdNotified = false;
			const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === REQUEST_ENTRY);
			const data = latest?.type === "custom" ? latest.data as { id?: unknown } : undefined;
			observedRequestId = typeof data?.id === "string" ? data.id : null;
		});
		pi.on("input", async (event) => {
			if (event.source === "extension") return { action: "continue" as const };
			if ((event.source === "interactive" || event.source === "rpc") && event.text.trim()) {
				observedRequestId = randomUUID();
				pi.appendEntry(REQUEST_ENTRY, { id: observedRequestId });
			}
			const current = active(); if (current) { current.captureInput(event.text); await current.refresh(false); }
			return { action: "continue" as const };
		});
		pi.on("tool_call", (event, ctx) => {
			try {
				const input = piContinuityOperation(event, ctx); if (!input) return;
				const current = active(); if (!current) return { block: true, reason: "continuity-operation-unavailable" };
				const result = current.beginOperation(input);
				if (!result.ok) { current.recordAdmissionDenied(input, "continuity-start-failed"); return { block: true, reason: `continuity-operation:${result.reason}` }; }
				calls.set(event.toolCallId, input);
			} catch { return { block: true, reason: "continuity-operation-identity-unavailable" }; }
		});
		pi.on("tool_result", async (event, ctx) => {
			try {
				const input = calls.get(event.toolCallId) ?? piContinuityOperation(event, ctx); if (!input) return;
				const outcome = continuityToolOutcome({ toolName: event.toolName, input: event.input, isError: event.isError, details: event.details, content: event.content });
				const result = active()?.finishOperation(input, outcome); calls.delete(event.toolCallId);
				if (result && !result.ok) notify(ctx, `continuity-operation:${result.reason}`, "warning");
			} catch { await active()?.mutationResult(false); }
		});
		pi.registerTool({
			name: "ein_continuity_recover", label: "Ein Recuperar operación", description: "Inspect an uncertain operation and explicitly resolve it against its native call and existing evidence. Does not retry tools or authorize new effects.",
			parameters: { type: "object", required: ["action"], properties: { action: { type: "string", enum: ["inspect", "resolve"] }, id: { type: "string", description: "Omit on inspect to list unresolved operation IDs." }, token: { type: "string" }, assessment: { type: "object", required: ["kind", "summary", "callRef", "evidenceRefs", "evidencePaths"], properties: {
				kind: { type: "string", enum: ["local-attested", "external-observed"] }, summary: { type: "string" }, callRef: { type: "object", required: ["sessionRef", "toolCallId"], properties: { sessionRef: { type: "string" }, toolCallId: { type: "string" } } }, evidenceRefs: { type: "array", items: { type: "string" } }, evidencePaths: { type: "array", items: { type: "string" } },
			} } } } as never,
			async execute(_id, params: { action: string; id?: string; token?: string; assessment?: RecoveryAssessment }) {
				const current = active();
				const result = !current ? { ok: false, reason: "lifecycle-unavailable" }
					: params.action === "inspect" ? params.id ? current.inspectOperation(params.id) : current.listOperations()
					: params.action === "resolve" && params.id && params.token && params.assessment ? current.resolveOperation(params.id, params.token, params.assessment, "pi-coordinator")
					: { ok: false, reason: "recovery-input-required" };
				return { content: [{ type: "text" as const, text: redactMcpText(JSON.stringify(result)) }], details: result, isError: !result.ok };
			},
		});
		pi.on("agent_settled", async (_event, ctx) => {
			const current = active(); if (!current) return; const outcome = await current.refresh(false);
			const percent = ctx.getContextUsage()?.percent;
			if (!thresholdNotified && typeof percent === "number" && percent >= 85 && outcome === "refreshed") {
				thresholdNotified = true; notify(ctx, "handoff-boundary=saved;commands=/ein:handoff status | /ein:handoff to pi | /ein:handoff to claude", "warning");
			}
		});
		pi.on("session_before_compact", async (event) => { if (event.reason === "threshold" || event.reason === "overflow") await active()?.refresh(false); });
		pi.on("session_shutdown", async () => { const current = active(); lifecycle = null; observedRequestId = null; if (current) await current.shutdown(); });
	};
}

export default createEinContinuityExtension();
