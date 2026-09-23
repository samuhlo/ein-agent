import { evidenceTask, readEvidenceTask, INTENT_EVIDENCE } from "../../lib/intent-evidence.ts";
import { observeContinuityGuard } from "../../lib/continuity-operation-adapter.ts";
import { questionnaireBatch, questionnaireAnswer, retainOtherQuestionnaireAnswers, type IntentQuestion } from "../../lib/intent-questionnaire.ts";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INTENT_INPUT, INTENT_STATE, intentSnapshot, legacyIntentSnapshot, selectIntentDraft, migrateLegacyIntentDraft, bindIntentQuestionnaire, observeIntentResponse, observeIntentEvidence, validateEvidenceDelegation, nextIntentAction, requireIntent, runIntentDiscovery, type IntentInput, type IntentRequest } from "../../lib/intent-discovery.ts";
import { createIntentDraftRuntime } from "../../lib/intent-draft-runtime.ts";
import { readIntentDraft } from "../../lib/intent-draft-store.ts";
import { showContinuityObjective } from "../../lib/continuity-objective.ts";
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
	const selectedWorks = new Map<string, string>();
	function selectedWork(ctx: ExtensionContext, explicit?: string): string | undefined {
		if (explicit) return explicit;
		const selected = selectedWorks.get(sddPreflightSessionKey(ctx));
		if (selected) return selected;
		const objective = showContinuityObjective(ctx.cwd);
		const evidence = objective.kind === "valid" ? objective.objectiveEvidence : undefined;
		const selection = selectIntentDraft(ctx, undefined, evidence && (evidence.kind === "intent" || evidence.kind === "intent-draft") ? evidence.work : undefined);
		if (selection.ambiguous) throw new Error(`Intent selection is ambiguous: ${selection.ambiguous.join(", ")}`);
		if (selection.work) return selection.work;
		const latest = [...ctx.sessionManager.getBranch()].reverse().find((entry: any) => entry.type === "custom" && entry.customType === INTENT_STATE) as { data?: { work?: string } } | undefined;
		return latest?.data?.work;
	}
	function hydrate(ctx: ExtensionContext, work: string): void {
		const stored = readIntentDraft(ctx.cwd, work);
		if (stored.status === "absent" && legacyIntentSnapshot(ctx, work).agreement) migrateLegacyIntentDraft(ctx, work, createIntentDraftRuntime(ctx.cwd, { mutating: true }));
		const snapshot = intentSnapshot(ctx, work);
		if (snapshot.agreement && JSON.stringify(legacyIntentSnapshot(ctx, work).agreement) !== JSON.stringify(snapshot.agreement)) pi.appendEntry(INTENT_STATE, snapshot.agreement);
		const response = stored.status === "valid" ? stored.draft.response : snapshot.response;
		if (response && legacyIntentSnapshot(ctx, work).response?.id !== response.id) pi.appendEntry(INTENT_INPUT, response);
	}
	pi.on("session_start", (_event, ctx) => {
		try { const work = selectedWork(ctx); if (work) hydrate(ctx, work); }
		catch (error) { if (ctx.hasUI) ctx.ui.notify(String(error), "warning"); }
	});
	pi.on("input", (event, ctx) => {
		if ((event.source === "interactive" || event.source === "rpc") && event.text.trim()) {
			const response: IntentInput = { id: randomUUID(), text: event.text, source: event.source };
			latestInputs.set(sddPreflightSessionKey(ctx), response);
			try {
				const work = selectedWork(ctx);
				if (work) {
					hydrate(ctx, work);
					const current = intentSnapshot(ctx, work);
					if (current.agreement?.status === "pending" && !current.response && current.draftRevision) {
						observeIntentResponse(ctx, work, current.draftRevision, current.agreement.revision, response, createIntentDraftRuntime(ctx.cwd, { mutating: true }));
						pi.appendEntry(INTENT_INPUT, { ...response, revision: current.agreement.revision });
					}
				}
			} catch (error) { pi.appendEntry("ein:intent-unpublished-response", { response, reason: String(error) }); }
		}
		return { action: "continue" };
	});
	pi.on("session_shutdown", (_event, ctx) => { latestInputs.delete(sddPreflightSessionKey(ctx)); selectedWorks.delete(sddPreflightSessionKey(ctx));
		for (const [id, pending] of questionnaires) if (pending.session === sddPreflightSessionKey(ctx)) questionnaires.delete(id); });
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName === "subagent" && typeof event.input?.task === "string") {
			let packet;
			try { packet = readEvidenceTask(event.input.task); } catch { return; }
			if (packet) {
				const current = intentSnapshot(ctx, packet.work).evidence;
				if (current?.toolCallId === event.toolCallId) {
					const text = (event.content ?? []).flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
					const snapshot = intentSnapshot(ctx, packet.work);
					const observed = { ...current, state: event.isError ? "blocked" as const : "returned" as const, result: { text: text.slice(0, 6000), truncated: text.length > 6000, isError: event.isError } };
					try {
						observeIntentEvidence(ctx, packet.work, snapshot.draftRevision!, snapshot.agreement!.revision, observed, createIntentDraftRuntime(ctx.cwd, { mutating: true }));
						pi.appendEntry(INTENT_EVIDENCE, observed);
					} catch (error) { pi.appendEntry("ein:intent-unpublished-evidence", { evidence: observed, reason: String(error) }); }
				}
			}
			return;
		}
		if (event.toolName !== "ask_user_question") return;
		let pending = questionnaires.get(event.toolCallId);
		if (!pending) {
			try {
				const work = selectedWork(ctx);
				const binding = work ? intentSnapshot(ctx, work).questionnaireBindings?.find((item) => item.toolCallId === event.toolCallId) : undefined;
				if (work && binding) pending = { session: sddPreflightSessionKey(ctx), work, revision: binding.revision, questions: binding.questions };
			} catch { return; }
		}
		questionnaires.delete(event.toolCallId);
		if (!pending || pending.session !== sddPreflightSessionKey(ctx)) return;
		const current = intentSnapshot(ctx, pending.work);
		if (current.agreement?.status !== "pending" || current.agreement.revision !== pending.revision) return;
		const text = event.isError ? undefined : questionnaireAnswer(pending.questions, event.details);
		const previous = current.response?.source === "ask_user_question" ? current.response.text : undefined;
		const retained = !text && current.agreement.stage !== "review" ? retainOtherQuestionnaireAnswers(previous, pending.questions) : undefined;
		const response = { id: randomUUID(), source: "ask_user_question" as const, revision: pending.revision,
			text: text ? [previous, text].filter(Boolean).join("\n") : retained ?? "Questionnaire cancelled or unavailable", cancelled: !text && !retained };
		try {
			observeIntentResponse(ctx, pending.work, current.draftRevision!, pending.revision, response, createIntentDraftRuntime(ctx.cwd, { mutating: true }), event.toolCallId);
			pi.appendEntry(INTENT_INPUT, response);
		} catch (error) {
			pi.appendEntry("ein:intent-unpublished-response", { work: pending.work, response, reason: String(error) });
			return { content: [...(event.content ?? []), { type: "text" as const, text: `Intent response not published: ${String(error)}. The original response remains in this session; reload the draft before retrying.` }] };
		}
		// El recibo usa exactamente la respuesta persistida; nunca fabrica consentimiento.
		return { content: [...(event.content ?? []), { type: "text" as const, text: JSON.stringify({ intentResponse: {
			work: pending.work, revision: pending.revision, draftRevision: intentSnapshot(ctx, pending.work).draftRevision, responseId: text ? response.id : undefined, responseText: text ? response.text : undefined,
			status: text ? "received" : event.details && isRecord(event.details) && event.details.cancelled === true ? "cancelled" : "unavailable",
			instruction: text ? "Use this responseId directly. Incorporate only answered decisions, explore their consequences and ask the next ready frontier. Review only when no material assumptions remain; confirm requires a fresh final-review answer. status is for recovery, not required after this receipt."
				: "No answer recorded for this call. Recover with status or ask in chat; do not infer agreement.",
		} }) }] };
	});
	pi.on("tool_call", observeContinuityGuard((event, ctx) => {
		try {
			if (event.toolName === "ask_user_question") {
				const work = selectedWork(ctx); if (!work) return;
				hydrate(ctx, work);
				const current = intentSnapshot(ctx, work);
				const { agreement } = current;
				if (agreement?.status !== "pending" || !agreement.questionnaire) return;
				const questions = questionnaireBatch(agreement.questionnaire, event.input);
				if (questions) {
					bindIntentQuestionnaire(ctx, work, current.draftRevision!, event.toolCallId, questions, createIntentDraftRuntime(ctx.cwd, { mutating: true }));
					questionnaires.set(event.toolCallId, { session: sddPreflightSessionKey(ctx), work: agreement.work, revision: agreement.revision, questions });
				}
				return;
			}
			if (event.toolName === "ein_sdd_preflight" && isRecord(event.input) && event.input.create === true) {
				const change = typeof event.input.change === "string" ? event.input.change : undefined;
				requireIntent(ctx, change, change);
			}
			if (event.toolName !== "subagent") return;
			const evidence = validateEvidenceDelegation(ctx, event.input);
			if (evidence) {
				if (evidence.state === "returned") return { block: true, reason: "Evidence already returned; incorporate it into the next intent round instead of repeating the experiment" };
				if (evidence.state === "running") return { block: true, reason: "Evidence outcome unavailable: recover the existing toolCallId result; do not relaunch the experiment" };
				const snapshot = intentSnapshot(ctx, evidence.work);
				const running = { ...evidence, state: "running" as const, toolCallId: event.toolCallId };
				observeIntentEvidence(ctx, evidence.work, snapshot.draftRevision!, snapshot.agreement!.revision, running, createIntentDraftRuntime(ctx.cwd, { mutating: true }));
				pi.appendEntry(INTENT_EVIDENCE, running);
				return;
			}
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
					&& readIntentDraft(ctx.cwd, change!).status === "absent" && !readFileSync(join(dir, "scope.md"), "utf8").includes("intent_key:") && item.agent !== "sdd-scope") continue;
				const agreement = requireIntent(ctx, work ?? change, change);
				const agreedDir = agreement.change ? join(resolveChangesDir(ctx.cwd), agreement.change) : undefined;
				if (agreedDir && ["sdd-tasks", "sdd-apply"].includes(item.agent)) {
					if (!existsSync(join(agreedDir, "design.md"))) throw new Error("Create the agreed design first; run SDD phase by phase so discovery can reopen between phases");
					const design = readFileSync(join(agreedDir, "design.md"), "utf8");
					if (!artifactHasIntentKey(design, agreement.materialKey)) throw new Error("Design does not reference the current intent; update the design before tasks or apply");
				}
			}
		} catch (error) { return { block: true, reason: error instanceof Error ? error.message : String(error) }; }
	}, "intent-discovery"));
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
		description: "Persist product intent; load intent-channel for interviews. propose retains the whole known decision tree (including deferred dependsOn nodes) and returns the ready questionnaire. Explain its tradeoffs, then use ask_user_question; its intentResponse receipt supplies the observed responseId directly. status recovers after resume or missing receipts; work may be omitted only for status. Incorporate answers and explore consequences before review; confirm requires a fresh explicit answer to that final review. record is only for complete authorized mechanical requests, never an interview or pending agreement. delegate requires explicit human instructions to decide without questions; auto is not consent. investigate prepares a bounded local evidence delegation for a waiting fact using existing authorization, exact commands and roots; follow references/pi-protocol.md. No SDD phases before agreement. Pass intent_work: <work> to executors. Read-only work needs no intent.",
		parameters: {
			type: "object", required: ["action"],
			properties: {
				action: { type: "string", enum: ["propose", "status", "confirm", "cancel", "delegate", "record", "review", "investigate", "recover"] },
				title: { type: "string", description: "Short human label, e.g. Bloque 05 · Cursos propios" },
				evidence: { type: "object", required: ["decisionId", "objective", "roots", "commands"], properties: {
					decisionId: { type: "string" }, objective: { type: "string" }, roots: { type: "array", items: { type: "string" } }, commands: { type: "array", items: { type: "string" } },
				} },
				work: { type: "string", description: "Required except status, which can recover the latest work in this session." }, change: { type: "string" }, responseId: { type: "string" },
				expectedRevision: { type: "string", description: "Required for mutations: draftRevision returned by status/receipt, or absent for a new work." },
				reopenReason: { type: "string", description: "New material product decision discovered after agreement, even if the objective is unchanged. Reopens discovery; never use for routine phase transitions." },
				decisions: { type: "array", description: "Whole known tree: resolved, ready AND deferred questions. Keep dependent questions as open nodes with dependsOn; questions contains only the ready frontier.", items: { type: "object", required: ["id", "question", "dependsOn", "status"], properties: { kind: { type: "string", enum: ["decision", "fact", "permission"] }, title: { type: "string" }, id: { type: "string" }, question: { type: "string" }, dependsOn: { type: "array", items: { type: "string" } }, status: { type: "string", enum: ["open", "waiting", "resolved"] }, resolution: { type: "string" } } } },
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
		async execute(_id, input: Omit<IntentRequest, "work"> & { work?: string }, _signal, _update, ctx) {
			try {
				const work = input.work ?? (input.action === "status" ? selectedWork(ctx) : undefined);
				if (!work) throw new Error("Provide work; status can omit it only when this session already has an intent agreement");
				hydrate(ctx, work);
				const request: IntentRequest = { ...input, work };
				const snapshot = runIntentDiscovery(ctx, request, (type, data) => pi.appendEntry(type, data), latestInputs.get(sddPreflightSessionKey(ctx)), createIntentDraftRuntime(ctx.cwd, { mutating: request.action !== "status" }));
				if (input.work) selectedWorks.set(sddPreflightSessionKey(ctx), work);
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
						? "Show the final objective, boundaries, decisions and success criteria, then call ask_user_question with the returned questionnaire. Use the intentResponse receipt from its result; a fresh answer confirms only this agreement."
						: "Explain the ready questions with alternatives and recommendations in plain language, then call ask_user_question with the returned questionnaire, up to four per call. If unavailable or there are no concrete options, use the same questions in chat and wait. If every branch waits on research, await its facts instead of asking or closing.";
				}
				const nextAction = nextIntentAction(snapshot);
				if (nextAction === "recover-publication") instruction = "Use ein_intent recover with this work and draftRevision; preserve the already observed agreement. Do not overwrite a conflicting canonical record.";
				if (nextAction === "archived") instruction = "This intent is archived history and grants no new execution authority. A new work needs an explicit proposal/revision.";
				if (nextAction === "recover-evidence-result") instruction = "Evidence outcome unavailable. Recover the recorded toolCallId result or artifact; do not rerun the experiment or claim it passed.";
				const delegation = snapshot.evidence && snapshot.evidence.state === "ready" ? {
					agent: "sdd-verify", task: evidenceTask(snapshot.evidence), context: "fresh", async: false, maxRuntimeMs: 120000,
					acceptance: { level: "none", reason: "Diagnostic evidence for pending intent, not verification of an implementation" },
				} : undefined;
				if (["prepare-evidence", "run-evidence", "repair-evidence-with-existing-authorization"].includes(nextAction)) instruction = "The product intent is still open. Reuse the investigation authorization already in response/history. Prepare investigate or run its exact delegation; do not ask permission again for the same bounded experiment, do not confirm product intent or start an SDD phase. Scout reads static facts; investigate runs the local experiment.";
				if (nextAction === "incorporate-evidence") instruction = "Interpret the saved experiment result (if truncated, recover its full toolCallId output before concluding). Record supported facts and their command evidence in propose, leave unsupported facts open, and ask the newly ready decisions with ask_user_question in this turn. No extra user continue or authorization is needed.";
				const frontier = snapshot.agreement?.decisions ? intentFrontier(snapshot.agreement.decisions).map((d) => d.id) : undefined;
				return { content: [{ type: "text", text: JSON.stringify({ ...snapshot, frontier, nextAction, delegation, instruction }) }], details: { ok: true, state, nextAction, stage: snapshot.agreement?.stage, hasResponse: !!snapshot.response, work: request.work } };
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: reason }], details: { ok: false, reason }, isError: true };
			}
		},
	});
}
