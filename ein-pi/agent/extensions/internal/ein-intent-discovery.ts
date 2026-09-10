import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INTENT_INPUT, INTENT_STATE, requireIntent, runIntentDiscovery, type IntentInput, type IntentRequest } from "../../lib/intent-discovery.ts";
import { collectDelegationItems, delegationShapeIsUnrecognized } from "../../lib/delegation-shape.ts";
import { resolveChangesDir } from "../../lib/sdd-routing-core.ts";
import { artifactHasIntentKey, readAgreement } from "../../lib/intent-agreement.ts";
import { isRecord, readExplicitSddChange, readAgentStartNames } from "./ein-pi-event-contracts.ts";
import { sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

export function registerIntentDiscovery(pi: ExtensionAPI, registerEinTool: EinToolRegistrar): void {
	const latestInputs = new Map<string, IntentInput>();
	pi.on("input", (event, ctx) => {
		if ((event.source === "interactive" || event.source === "rpc") && event.text.trim()) {
			const response: IntentInput = { id: randomUUID(), text: event.text, source: event.source };
			latestInputs.set(sddPreflightSessionKey(ctx), response);
			const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === INTENT_STATE);
			if (latest?.type === "custom") {
				const state = latest.data as { status: string; revision: string };
				if (state.status === "pending") pi.appendEntry(INTENT_INPUT, { ...response, revision: state.revision });
			}
		}
		return { action: "continue" };
	});
	pi.on("session_shutdown", (_event, ctx) => { latestInputs.delete(sddPreflightSessionKey(ctx)); });
	pi.on("tool_call", (event, ctx) => {
		try {
			if (event.toolName === "ein_sdd_preflight" && isRecord(event.input) && event.input.create === true) {
				const change = typeof event.input.change === "string" ? event.input.change : undefined;
				requireIntent(ctx, change, change);
			}
			if (event.toolName !== "subagent") return;
			if (delegationShapeIsUnrecognized(event.input)) throw new Error("Intent cannot validate this execution shape; use explicit agent/task calls");
			for (const item of collectDelegationItems(event.input)) {
				if (!item.agent?.startsWith("sdd-")) continue;
				const change = readExplicitSddChange({ task: item.task });
				const work = item.task?.match(/^intent_work:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/m)?.[1];
				const dir = change ? join(resolveChangesDir(ctx.cwd), change) : undefined;
				// Los cambios anteriores con scope siguen siendo reanudables. No se
				// fabrica un acuerdo histórico ni se aplica esa excepción a un scope nuevo.
				if (!work && dir && !existsSync(join(dir, "intent.md")) && existsSync(join(dir, "scope.md"))
					&& !readFileSync(join(dir, "scope.md"), "utf8").includes("intent_key:") && item.agent !== "sdd-scope") continue;
				const agreement = requireIntent(ctx, work ?? change, change);
				const agreedDir = agreement.change ? join(resolveChangesDir(ctx.cwd), agreement.change) : undefined;
				if (agreedDir && ["sdd-tasks", "sdd-apply"].includes(item.agent)) {
					if (!existsSync(join(agreedDir, "design.md"))) throw new Error("Create the agreed design first; run SDD phase by phase so discovery can reopen between phases");
					const design = readFileSync(join(agreedDir, "design.md"), "utf8");
					if (!artifactHasIntentKey(design, agreement.materialKey)) throw new Error("Design does not reference the current intent; update the design before tasks or apply");
				}
			}
		} catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
	});
	pi.on("before_agent_start", (event, ctx) => {
		if (readAgentStartNames(event).length === 0) {
			const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === INTENT_STATE);
			if (latest?.type === "custom") {
				const state = latest.data as { work: string; status: string };
				return { systemPrompt: `${event.systemPrompt}\nIntent session: work=${state.work}, status=${state.status}. Call ein_intent status to recover the agreement and actual response; reopen only material changes.` };
			}
		}
		const change = readExplicitSddChange(event);
		if (!change || !readAgentStartNames(event).some((name) => name.startsWith("sdd-"))) return;
		const record = readAgreement(join(resolveChangesDir(ctx.cwd), change));
		if (record.kind !== "valid" || record.agreement.status !== "confirmed") return;
		return { systemPrompt: `${event.systemPrompt}\n\nRead ${JSON.stringify(join(resolveChangesDir(ctx.cwd), change, "intent.md"))} as the agreed product contract. Preserve its objective, limits and success criteria. Ein binds full phase artifact writes to this agreement; preserve its decisions, never hand-copy control keys. Return blocked with the concrete question if a new product decision is needed; the parent owns discovery.` };
	});
	registerEinTool({
		name: "ein_intent",
		label: "Ein Intent",
		description: "Record the agreed objective/boundaries/completionCriteria before new modifying work. For a complete, authorized current human request with no missing product decisions, record persists that observed request directly; never use it for discussion-only requests, invented choices or an open/cancelled discovery. For ambiguity, propose 1–4 concrete questions, show them and STOP. status returns the observed answer/id; confirm requires that responseId and only answered choices. Refusal, cancellation or unresolved choices need another round. Reuse unchanged agreements. change is SDD-only and must equal work. delegate is only for an explicit current sin preguntas / without questions instruction with recorded assumptions; auto alone is not consent. Put intent_work: <work> in delegated tasks. Read-only work needs no intent.",
		parameters: {
			type: "object", required: ["action", "work"],
			properties: {
				action: { type: "string", enum: ["propose", "status", "confirm", "cancel", "delegate", "record"] },
				work: { type: "string" }, change: { type: "string" }, responseId: { type: "string" },
				reopenReason: { type: "string", description: "New material product decision discovered after agreement, even if the objective is unchanged. Reopens discovery; never use for routine phase transitions." },
				questions: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } },
				material: { type: "object", required: ["objective", "boundaries", "completionCriteria"], properties: {
					objective: { type: "string" },
					boundaries: { type: "object", required: ["in", "out"], properties: { in: { type: "array", items: { type: "string" } }, out: { type: "array", items: { type: "string" } } } },
					completionCriteria: { type: "array", minItems: 1, items: { type: "string" } },
				} },
			},
		} as const,
		async execute(_id, request: IntentRequest, _signal, _update, ctx) {
			try {
				const snapshot = runIntentDiscovery(ctx, request, (type, data) => pi.appendEntry(type, data), latestInputs.get(sddPreflightSessionKey(ctx)));
				const state = snapshot.agreement?.status ?? "absent";
				const instruction = state === "pending"
					? snapshot.response ? "Interpret the observed answer. Confirm only answered decisions, otherwise propose the next round." : "Show the questions below in one plain-text message and STOP. Wait for the user."
					: state === "confirmed" ? `Intent agreed. Use intent_work: ${request.work}. Reopen only material changes.` : "No authorized work; answer or clarify with the user.";
				return { content: [{ type: "text", text: JSON.stringify({ ...snapshot, instruction }) }], details: { ok: true, state, work: request.work } };
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: reason }], details: { ok: false, reason }, isError: true };
			}
		},
	});
}
