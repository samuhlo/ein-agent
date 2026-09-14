import { questionnaireBatch, questionnaireAnswer, type IntentQuestion } from "../../lib/intent-questionnaire.ts";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INTENT_INPUT, INTENT_STATE, intentSnapshot, requireIntent, runIntentDiscovery, type IntentInput, type IntentRequest } from "../../lib/intent-discovery.ts";
import { collectDelegationItems, delegationShapeIsUnrecognized, rewriteDelegationTasks } from "../../lib/delegation-shape.ts";
import { readAuthorizedContinuation } from "../../lib/sdd-continuation.ts";
import { resolveChangesDir } from "../../lib/sdd-routing-core.ts";
import { artifactHasIntentKey, readAgreement, intentFrontier } from "../../lib/intent-agreement.ts";
import { isRecord, readExplicitSddChange, readAgentStartNames } from "./ein-pi-event-contracts.ts";
import { sddPreflightSessionKey } from "../../lib/sdd-preflight.ts";
import type { EinToolRegistrar } from "./ein-tool-registration.ts";

export function registerIntentDiscovery(pi: ExtensionAPI, registerEinTool: EinToolRegistrar): void {
	const questionnaires = new Map<string, { session: string; work: string; revision: string; questions: IntentQuestion[] }>();
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
	pi.on("session_shutdown", (_event, ctx) => { latestInputs.delete(sddPreflightSessionKey(ctx));
		for (const [id, pending] of questionnaires) if (pending.session === sddPreflightSessionKey(ctx)) questionnaires.delete(id); });
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "ask_user_question") return;
		const pending = questionnaires.get(event.toolCallId);
		questionnaires.delete(event.toolCallId);
		if (!pending || pending.session !== sddPreflightSessionKey(ctx)) return;
		const current = intentSnapshot(ctx, pending.work);
		if (current.agreement?.status !== "pending" || current.agreement.revision !== pending.revision) return;
		const text = event.isError ? undefined : questionnaireAnswer(pending.questions, event.details);
		const previous = current.response?.source === "ask_user_question" ? current.response.text : undefined;
		pi.appendEntry(INTENT_INPUT, { id: randomUUID(), source: "ask_user_question", revision: pending.revision,
			text: text ? [previous, text].filter(Boolean).join("\n") : "Questionnaire cancelled or unavailable", cancelled: !text });
	});
	pi.on("tool_call", (event, ctx) => {
		try {
			if (event.toolName === "ask_user_question") {
				const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry) => entry.type === "custom" && entry.customType === INTENT_STATE);
				if (latest?.type !== "custom") return;
				const state = latest.data as { work: string };
				const { agreement } = intentSnapshot(ctx, state.work);
				if (agreement?.status !== "pending" || !agreement.questionnaire) return;
				const questions = questionnaireBatch(agreement.questionnaire, event.input);
				if (questions) questionnaires.set(event.toolCallId, { session: sddPreflightSessionKey(ctx), work: agreement.work, revision: agreement.revision, questions });
				return;
			}
			if (event.toolName === "ein_sdd_preflight" && isRecord(event.input) && event.input.create === true) {
				const change = typeof event.input.change === "string" ? event.input.change : undefined;
				requireIntent(ctx, change, change);
			}
			if (event.toolName !== "subagent") return;
			rewriteDelegationTasks(event.input, (agent, task) => {
				const change = readAuthorizedContinuation(ctx, agent, task);
				return change ? `change: ${change}\nintent_work: ${change}\n\n${task}` : task;
			});
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
		description: "Record the agreed objective/boundaries/completionCriteria before new modifying work. For a complete, authorized current human request with no missing product decisions, record persists that observed request directly; never use it for discussion-only requests, invented choices or an open/cancelled discovery. For discovery (including natural-language requests to do intent), load intent-channel first. propose the whole ready frontier in numbered questions with recommendations and retain the WHOLE known decision tree, including deferred questions with their dependsOn prerequisites (decisions: id, question, dependsOn, status open/waiting/resolved, resolution with evidence). Supply questionnaire with concrete alternative options, recommended first; explain the tradeoffs in prose, then call ask_user_question with the returned questionnaire (batches of up to four). The plugin supplies free text. status returns the observed answer/id from chat or the matched questionnaire. Recompute the tree after each answer; use review with the responseId only once ALL branches are resolved. Show the returned final material and wait. confirm requires a NEW responseId to that review; round answers cannot close intent. record is only for complete authorized mechanical work, never an explicit interview. Refusal, cancellation or unresolved choices need another round. Reuse unchanged agreements. change is SDD-only and must equal work. delegate is only for an explicit current sin preguntas / without questions instruction with recorded assumptions; auto alone is not consent. Put intent_work: <work> in delegated tasks. Read-only work needs no intent.",
		parameters: {
			type: "object", required: ["action", "work"],
			properties: {
				action: { type: "string", enum: ["propose", "status", "confirm", "cancel", "delegate", "record", "review"] },
				work: { type: "string" }, change: { type: "string" }, responseId: { type: "string" },
				reopenReason: { type: "string", description: "New material product decision discovered after agreement, even if the objective is unchanged. Reopens discovery; never use for routine phase transitions." },
				decisions: { type: "array", description: "Whole known tree: resolved, ready AND deferred questions. Keep dependent questions as open nodes with dependsOn; questions contains only the ready frontier.", items: { type: "object", required: ["id", "question", "dependsOn", "status"], properties: { id: { type: "string" }, question: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } }, status: { type: "string", enum: ["open", "waiting", "resolved"] }, resolution: { type: "string" } } } },
				questionnaire: { type: "array", items: { type: "object", required: ["question", "header", "options"], properties: {
					question: { type: "string" }, header: { type: "string", maxLength: 16 }, multiSelect: { type: "boolean" },
					options: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", required: ["label", "description"], properties: { label: { type: "string", maxLength: 60 }, description: { type: "string" } } } },
				} } },
				questions: { type: "array", items: { type: "string" } },
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
				const reviewing = snapshot.agreement?.stage === "review";
				let instruction = state === "confirmed"
					? `Intent agreed. Use intent_work: ${request.work}. Reopen only material changes. Continue only within the user's authorized scope; intent alone does not authorize implementation.`
					: "No authorized work; answer or clarify with the user.";
				if (state === "pending") {
					if (snapshot.response) instruction = reviewing
						? "Interpret the final review response. Confirm only explicit agreement with unchanged material; corrections reopen a round."
						: "Interpret the round response and recompute every branch. Propose the next frontier; when all branches resolve, call review with this responseId. Do not confirm a round.";
					else instruction = reviewing
						? "Show the final objective, boundaries, decisions and success criteria, then call ask_user_question with the returned questionnaire. Wait for its result and call status; a fresh answer confirms only this agreement."
						: "Explain the ready questions with alternatives and recommendations in plain language, then call ask_user_question with the returned questionnaire, up to four per call. If unavailable or there are no concrete options, use the same questions in chat and wait. If every branch waits on research, await its facts instead of asking or closing.";
				}
				const frontier = snapshot.agreement?.decisions ? intentFrontier(snapshot.agreement.decisions).map((d) => d.id) : undefined;
				return { content: [{ type: "text", text: JSON.stringify({ ...snapshot, frontier, instruction }) }], details: { ok: true, state, stage: snapshot.agreement?.stage, hasResponse: !!snapshot.response, work: request.work } };
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: reason }], details: { ok: false, reason }, isError: true };
			}
		},
	});
}
