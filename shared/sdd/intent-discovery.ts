import { evidenceFor, prepareEvidence, evidenceTask, evidenceReadAllowed, readEvidenceTask, EVIDENCE_MARKER, INTENT_EVIDENCE, type EvidencePlan, type IntentEvidence } from "./intent-evidence.ts";
import type { IntentQuestion } from "./intent-questionnaire.ts";
import { createIntentMaterialKey, normalizeIntentMaterial, type IntentMaterial } from "./sdd-intent-preflight.ts";
import { readAgreement, validateAgreement, type IntentAgreement, validateIntentDecisions, type IntentDecision } from "./intent-agreement.ts";
import { readIntentDraft, listIntentDrafts, publishIntentDraft, transactIntentDraft, IntentDraftError, intentCanonicalDirectory, recoverIntentDraft } from "./intent-draft-store.ts";
import { isSafeDraftWork, questionnaireFingerprint, type IntentDraftV1, type IntentRuntimePorts, type IntentQuestionnaireBinding } from "./intent-draft.ts";
import { readIntentAdmission } from "./intent-admission.ts";

export const INTENT_STATE = "ein:intent-discovery";
export const INTENT_INPUT = "ein:intent-response";
export type IntentContext = { cwd: string; sessionManager: { getBranch(): readonly unknown[] } };
export type IntentInput = { id: string; text: string; source: "interactive" | "rpc" | "ask_user_question" | "claude-coordinator"; cancelled?: boolean; revision?: string };
export type IntentRequest = {
	action: "propose" | "status" | "confirm" | "cancel" | "delegate" | "record" | "review" | "investigate" | "recover";
	evidence?: EvidencePlan;
	title?: string;
	decisions?: IntentDecision[];
	work: string;
	change?: string;
	material?: IntentMaterial;
	questions?: string[];
	questionnaire?: IntentQuestion[];
	responseId?: string;
	expectedRevision?: string;
	reopenReason?: string;
};
type Entry = { type?: string; customType?: string; data?: unknown };
export type Snapshot = { agreement?: IntentAgreement; response?: IntentInput; evidence?: IntentEvidence; continuityWarning?: string; draftRevision?: string; publication?: IntentDraftV1["publication"]; questionnaireBindings?: IntentQuestionnaireBinding[]; admission?: { admitted: boolean; reason?: string } };

function entries(ctx: IntentContext): Entry[] {
	return ctx.sessionManager.getBranch() as Entry[];
}

export function legacyIntentSnapshot(ctx: IntentContext, work: string): Snapshot {
	let agreement: IntentAgreement | undefined;
	let response: IntentInput | undefined;
	for (const entry of entries(ctx)) {
		if (entry.type !== "custom") continue;
		if (entry.customType === INTENT_STATE && (entry.data as IntentAgreement)?.work === work) {
			agreement = validateAgreement(entry.data);
			response = undefined;
		} else if (agreement?.status === "pending" && entry.customType === INTENT_INPUT) {
			if ((entry.data as { revision?: string })?.revision === agreement.revision) response = (entry.data as IntentInput).cancelled ? undefined : entry.data as IntentInput;
		}
	}
	return { agreement, response, evidence: evidenceFor(entries(ctx), work) };
}

export function snapshotFromDraft(draft: IntentDraftV1, root?: string): Snapshot {
	const admission = root ? readIntentAdmission({ root, work: draft.work, changeDir: intentCanonicalDirectory(root, draft.work), requiresCanonical: Boolean(draft.agreement.change) }) : undefined;
	return { agreement: draft.agreement, response: draft.response?.cancelled ? undefined : draft.response, evidence: draft.evidence,
		draftRevision: draft.revision, publication: draft.publication, questionnaireBindings: draft.questionnaireBindings, ...(admission ? { admission: { admitted: admission.admitted, reason: admission.reason } } : {}) };
}
export function intentSnapshot(ctx: IntentContext, work: string): Snapshot {
	const draft = readIntentDraft(ctx.cwd, work);
	if (draft.status === "invalid") throw new IntentDraftError("invalid", draft.reason);
	return draft.status === "valid" ? snapshotFromDraft(draft.draft, ctx.cwd) : legacyIntentSnapshot(ctx, work);
}

function changeDirectory(cwd: string, change: string, create = false): string {
	return intentCanonicalDirectory(cwd, change, create);
}

export function discoveryAgreement(ctx: IntentContext, work: string, change?: string): Snapshot {
	const session = intentSnapshot(ctx, work);
	if (session.draftRevision) return session;
	if (!change && session.agreement?.change) return discoveryAgreement(ctx, work, session.agreement.change);
	if (!change) {
		const canonical = readAgreement(intentCanonicalDirectory(ctx.cwd, work));
		return canonical.kind === "valid" ? { agreement: canonical.agreement } : session;
	}
	const stored = readAgreement(changeDirectory(ctx.cwd, change));
	if (stored.kind === "invalid") {
		if (session.agreement?.status === "pending") return session;
		throw new Error("intent.md is invalid or legacy; review its content with the user before replacing it");
	}
	if (stored.kind === "valid") {
		if (stored.agreement.work !== work || stored.agreement.change !== change) throw new Error("Intent belongs to another change");
		if (session.agreement?.revision === stored.agreement.revision) return session;
		return { agreement: stored.agreement };
	}
	if (session.agreement?.change && session.agreement.status === "confirmed") throw new Error("The canonical intent.md is missing; recover the agreement before continuing");
	return session;
}

export function runIntentDiscovery(
	ctx: IntentContext,
	request: IntentRequest,
	append: (type: string, data: unknown) => void,
	latestInput?: IntentInput,
	ports?: IntentRuntimePorts,
): Snapshot {
	if (!isSafeDraftWork(request.work) || (request.change !== undefined && request.change !== request.work)) throw new Error("Use a bounded work name; for SDD, work and change must match");
	let previous: Snapshot;
	try { previous = discoveryAgreement(ctx, request.work, request.change); }
	catch (error) {
		if (error instanceof IntentDraftError) throw error;
		// Un intent antiguo se conserva; la nueva conversación permite adoptarlo
		// solo después de obtener una respuesta, nunca por mera presencia.
		if (request.action !== "propose") throw error;
		const pending = intentSnapshot(ctx, request.work);
		previous = pending.agreement?.status === "pending" ? pending : {};
	}
	if (request.action !== "status" && (!ports || !request.expectedRevision)) throw new IntentDraftError("invalid", "Intent mutation requires expectedRevision and runtime ports");
	if (previous.publication?.state === "archived" && !["status", "recover"].includes(request.action) && !(request.action === "propose" && request.reopenReason?.trim())) throw new Error("Archived intent requires an explicit new proposal with reopenReason");
	if (request.action !== "status" && request.expectedRevision !== (previous.draftRevision ?? "absent")) throw new IntentDraftError("conflict", "Intent draft changed; reload its revision without discarding the answer");
	if (request.action === "recover") {
		const recovered = recoverIntentDraft(ctx.cwd, request.work, request.expectedRevision!, ports!);
		if (!recovered.ok) throw new IntentDraftError(recovered.code, recovered.reason);
		append(INTENT_STATE, recovered.draft.agreement);
		return snapshotFromDraft(recovered.draft);
	}
	request = { ...request, material: request.material ?? (request.action === "propose" ? previous.agreement?.material : undefined), questions: request.questionnaire?.map((q) => q.question) ?? request.questions, questionnaire: request.questionnaire?.length ? request.questionnaire : undefined, change: request.change ?? previous.agreement?.change };
	if (request.action === "investigate") {
		if (!previous.agreement || !request.evidence) throw new Error("Prepare the bounded evidence plan for the pending intent");
		const responses = [previous.response, previous.agreement.response, ...(previous.agreement.history ?? []).map((round) => round.response), latestInput];
		const saved = previous.evidence;
		const response = request.responseId ? responses.find((r) => r?.id === request.responseId) : previous.response ?? (saved?.decisionId === request.evidence.decisionId ? saved.authorization : undefined) ?? latestInput;
		const evidence = prepareEvidence(previous.agreement, request.evidence, response, saved, ports!.newId);
		if (evidence.roots.some((root) => !evidenceReadAllowed(ctx.cwd, root, [ctx.cwd]))) throw new Error("Evidence read roots must exist inside the current project");
		const stored = observeIntentEvidence(ctx, request.work, request.expectedRevision!, previous.agreement.revision, evidence, ports!);
		append(INTENT_EVIDENCE, evidence);
		return stored;
	}
	if (request.action === "status") {
		return previous;
	}
	const publish = (agreement: IntentAgreement) => {
		validateAgreement(agreement);
		const result = publishIntentDraft(ctx.cwd, { schemaVersion: 1, work: agreement.work, agreement,
			...(agreement.status === "cancelled" && previous.response ? { response: { ...previous.response, revision: agreement.revision } } : {}),
			evidence: previous.evidence, questionnaireBindings: [], publication: { state: "none" } }, request.expectedRevision!, ports!);
		if (!result.ok) throw new IntentDraftError(result.code, result.reason);
		append(INTENT_STATE, agreement);
		let continuityWarning: string | undefined;
		if (agreement.status !== "cancelled") {
			try {
				const objective = ports!.publishObjective({ objective: agreement.material.objective, kind: agreement.status === "confirmed" ? "intent" : "intent-draft",
					work: agreement.work, materialKey: agreement.materialKey, agreementRevision: agreement.revision });
				if (objective.status === "warning") continuityWarning = objective.code;
			} catch { continuityWarning = "continuity-objective-unavailable"; }
		}
		return { ...snapshotFromDraft(result.draft), ...(continuityWarning ? { continuityWarning } : {}) };
	};
	if (request.action === "record") {
		if (!latestInput || !request.material) throw new Error("Record requires the current observed human request and complete material");
		if (request.questions?.length || request.decisions?.length) throw new Error("Decision trees and unanswered questions require propose; record cannot settle them");
		if (previous.agreement && previous.agreement.status !== "confirmed") throw new Error("An open or cancelled discovery cannot be bypassed with record; resolve it with the observed answer");
		const material = normalizeIntentMaterial(request.material);
		const materialKey = createIntentMaterialKey(material);
		if (previous.agreement?.materialKey === materialKey && previous.agreement.change === request.change) return previous;
		if (previous.agreement?.response?.id === latestInput.id) throw new Error("Changed material needs a new observed human request or a discovery round");
		return publish({ version: 1, work: request.work, change: request.change, status: "confirmed", material, materialKey,
			questions: [], fromRequest: true, response: latestInput, history: previous.agreement ? [
				...(previous.agreement.history ?? []), { questions: previous.agreement.questions, response: previous.agreement.response! },
			] : [], revision: ports!.newId() });
	}
	if (request.action === "delegate") {
		const explicit = /^(?:(?:resu[eé]lvelo t[uú]|hazlo|decide t[uú]|adelante|contin[uú]a)[,;:]?\s+)?(?:sin preguntas|sin preguntarme|no me preguntes|without questions|don['’]t ask me|do not ask me)[.!]?$/i;
		if (!latestInput || !latestInput.text.split(/\r?\n/).some((line) => explicit.test(line.trim()))) {
			throw new Error("Skipping questions requires an explicit no-questions instruction in the current human input; auto alone is not consent");
		}
		if (!request.material) throw new Error("Record the delegated objective, boundaries and completion criteria");
		const material = normalizeIntentMaterial(request.material);
		return publish({ version: 1, work: request.work, change: request.change, status: "confirmed", material,
			materialKey: createIntentMaterialKey(material), questions: [], delegated: true, response: latestInput, revision: ports!.newId() });
	}
	if (request.action === "propose") {
		if (!request.material || !request.questions || !request.decisions) throw new Error("Propose the objective, boundaries, completion criteria the whole known decision tree (including deferred branches), and the ready frontier questions");
		if (request.decisions) {
			validateIntentDecisions(request.decisions);
			if (previous.agreement?.decisions?.some((old) => !request.decisions!.some((d) => d.id === old.id))) throw new Error("Preserve earlier branches; resolve discarded decisions explicitly");
		}
		const material = normalizeIntentMaterial(request.material);
		const materialKey = createIntentMaterialKey(material);
		if (previous.agreement?.status === "confirmed" && previous.agreement.materialKey === materialKey
			&& previous.agreement.change === request.change && !request.reopenReason?.trim()
			&& (!request.decisions || JSON.stringify(request.decisions) === JSON.stringify(previous.agreement.decisions))) return previous;
		if (previous.agreement?.status === "pending" && previous.agreement.materialKey === materialKey
			&& previous.agreement.change === request.change && JSON.stringify(previous.agreement.decisions) === JSON.stringify(request.decisions)
			&& JSON.stringify(previous.agreement.questionnaire) === JSON.stringify(request.questionnaire)
			&& previous.agreement.stage === "round" && JSON.stringify(previous.agreement.questions) === JSON.stringify(request.questions)) return previous;
		const history = [...(previous.agreement?.history ?? [])];
		const response = previous.response ?? previous.agreement?.response;
		if (response && previous.agreement && history.at(-1)?.response.id !== response.id) history.push({ questions: previous.agreement.questions, response });
		return publish({ version: 1, work: request.work, change: request.change, status: "pending", material,
			materialKey, title: request.title ?? previous.agreement?.title, stage: "round", decisions: request.decisions ?? previous.agreement?.decisions, questions: request.questions, questionnaire: request.questionnaire, reopenReason: request.reopenReason?.trim(), history, revision: ports!.newId() });
	}
	if (!previous.agreement) throw new Error("Propose the intent before resolving it");
	if (request.action === "cancel") return publish({ ...previous.agreement, status: "cancelled" });
	if (request.action === "review") {
		const decisions = request.decisions ?? previous.agreement.decisions;
		validateIntentDecisions(decisions!);
		if (decisions!.some((d) => d.status !== "resolved")) throw new Error("Resolve every open or waiting branch before final review");
		if (previous.agreement.decisions?.some((old) => !decisions!.some((d) => d.id === old.id))) throw new Error("Preserve every decision branch in the final review");
		if (previous.agreement.stage === "review" && previous.agreement.history?.at(-1)?.response.id === request.responseId
			&& JSON.stringify(decisions) === JSON.stringify(previous.agreement.decisions)
			&& (!request.material || createIntentMaterialKey(normalizeIntentMaterial(request.material)) === previous.agreement.materialKey)) return previous;
		const roundResponse = previous.response ?? (previous.agreement.questions.length === 0 ? previous.agreement.history?.at(-1)?.response : undefined);
		if (!roundResponse || roundResponse.id !== request.responseId) throw new Error("Review needs the observed round responseId");
		const material = request.material ? normalizeIntentMaterial(request.material) : previous.agreement.material;
		return publish({ ...previous.agreement, status: "pending", stage: "review", decisions,
			material, materialKey: createIntentMaterialKey(material), questions: ["¿Este acuerdo recoge lo que quieres conseguir?"],
			questionnaire: [{ question: "¿Este acuerdo recoge lo que quieres conseguir?", header: "Acuerdo", options: [
				{ label: "Confirmar acuerdo", description: "Recoge lo que quiero; conserva el alcance autorizado." },
				{ label: "Ajustar acuerdo", description: "Quiero corregir o precisar algo antes de confirmarlo." },
				{ label: "Cancelar", description: "Detener este trabajo sin empezar su ejecución." },
			] }],
			history: previous.response ? [...(previous.agreement.history ?? []), { questions: previous.agreement.questions, response: previous.response }] : previous.agreement.history,
			response: undefined, revision: ports!.newId() });
	}
	if (request.action !== "confirm") throw new Error("Unknown intent action");
	if (previous.agreement.status === "confirmed") return previous;
	if (previous.agreement.status !== "pending" || !previous.response || previous.response.id !== request.responseId) {
		throw new Error("Wait for a real user response after the question; call status to obtain its responseId. Model declarations and extension messages do not confirm intent.");
	}
	if (previous.response.source === "ask_user_question" && previous.agreement.stage === "review") {
		const replies = previous.response.text.split("\n").map((line) => JSON.parse(line));
		const reply = replies.at(-1);
		const last = reply?.answers?.at(-1);
		if (last?.answer !== "Confirmar acuerdo" || last?.notes || reply?.globalNote) {
			throw new Error("The selector review needs Confirmar acuerdo without amendments. Incorporate free text or notes into the agreement and review again; never infer confirmation from a negative or empty answer.");
		}
	}
	if (previous.agreement.stage !== "review") throw new Error("A round answer does not close intent. Recompute the tree and use review before final confirmation.");
	if (request.material && createIntentMaterialKey(normalizeIntentMaterial(request.material)) !== previous.agreement.materialKey) throw new Error("Changed material requires a new review and a fresh human response");
	const material = request.material ? normalizeIntentMaterial(request.material) : previous.agreement.material;
	return publish({ ...previous.agreement, status: "confirmed", material,
		materialKey: createIntentMaterialKey(material), response: previous.response });
}

export function requireIntent(ctx: IntentContext, work?: string, change?: string): IntentAgreement {
	if (!work) throw new Error("Select the optional intent interview work before reading its agreement");
	const { agreement } = discoveryAgreement(ctx, work, change);
	const admission = readIntentAdmission({ root: ctx.cwd, work, changeDir: changeDirectory(ctx.cwd, change ?? work), requiresCanonical: Boolean(agreement?.change) });
	if (!admission.admitted && admission.state !== "absent") throw new Error(admission.reason ?? "Intent pending; recover or resolve the saved draft");
	if (agreement?.status !== "confirmed") throw new Error("Intent pending: ask the user and wait for their response before scoping, designing or implementing; auto does not skip discovery");
	return agreement;
}

export function validateEvidenceDelegation(ctx: IntentContext, input: unknown): IntentEvidence | undefined {
 const request = input as { agent?: string; task?: string; async?: boolean; context?: string; model?: unknown; cwd?: unknown; output?: unknown; outputMode?: unknown; chain?: unknown; tasks?: unknown };
 if (!request || typeof request.task !== "string" || !request.task.includes(EVIDENCE_MARKER)) return;
 const packet = readEvidenceTask(request.task)!;
 const current = intentSnapshot(ctx, packet.work);
 const stored = current.evidence;
 if (Object.keys(request).some((key) => !["agent", "task", "async", "context", "maxRuntimeMs", "acceptance"].includes(key))
  || request.agent !== "sdd-verify" || request.async !== false || request.context !== "fresh" || request.model !== undefined || request.cwd !== undefined || request.output !== undefined || request.outputMode !== undefined || request.chain || request.tasks
  || !stored || evidenceTask(stored) !== request.task || stored.id !== packet.id
  || current.agreement?.status !== "pending" || current.agreement.materialKey !== stored.materialKey
  || !current.agreement.decisions?.some((d) => d.id === stored.decisionId && d.status === "waiting")) {
  throw new Error("Use the exact sdd-verify evidence delegation returned by ein_intent investigate; product SDD remains pending");
 }
 return stored;
}

export function nextIntentAction(snapshot: Snapshot): string {
 if (snapshot.publication?.state === "archived") return "archived";
 if (snapshot.publication?.state === "archiving") return "recover-publication";
 if (snapshot.agreement?.status === "confirmed" && snapshot.admission?.admitted === false) return "recover-publication";
 if (snapshot.publication && ["promoting", "invalidating"].includes(snapshot.publication.state)) return "recover-publication";
 const agreement = snapshot.agreement;
 if (!agreement) return "start";
 if (agreement.status === "cancelled") return "cancelled";
 if (agreement.status === "confirmed") return "continue-authorized-work";
 if (snapshot.response) return "incorporate-answer";
 if (agreement.stage === "review") return "ask-final-review";
 const decisions = agreement.decisions ?? [];
 const ready = decisions.filter((d) => d.status === "open" && d.kind !== "fact" && d.dependsOn.every((id) => decisions.some((p) => p.id === id && p.status === "resolved")));
 if (ready.length) return "ask-next-round";
 const evidence = snapshot.evidence?.materialKey === agreement.materialKey ? snapshot.evidence : undefined;
 if (evidence && decisions.some((d) => d.id === evidence.decisionId && d.status === "waiting")) {
  return { ready: "run-evidence", running: "recover-evidence-result", returned: "incorporate-evidence", blocked: "repair-evidence-with-existing-authorization" }[evidence.state];
 }
 if (decisions.some((d) => d.status === "waiting" || (d.kind === "fact" && d.status !== "resolved"))) return "prepare-evidence";
 return decisions.every((d) => d.status === "resolved") ? "review" : "resolve-dependencies";
}

function observedDraft(ctx: IntentContext, work: string, expectedRevision: string, roundRevision: string,
  update: (draft: IntentDraftV1) => IntentDraftV1, ports: IntentRuntimePorts): Snapshot {
 const result = transactIntentDraft(ctx.cwd, work, expectedRevision, (draft) => {
  if (!draft || draft.agreement.status !== "pending" || draft.agreement.revision !== roundRevision) throw new IntentDraftError("conflict", "Intent round changed; preserve this observation in its origin session");
  if (["promoting", "invalidating"].includes(draft.publication.state)) throw new IntentDraftError("conflict", "Recover intent publication before observing another answer");
  return update(draft);
 }, ports);
 if (!result.ok) throw new IntentDraftError(result.code, result.reason);
 return snapshotFromDraft(result.draft);
}

export function observeIntentResponse(ctx: IntentContext, work: string, expectedRevision: string, roundRevision: string,
 response: IntentInput, ports: IntentRuntimePorts, bindingId?: string): Snapshot {
 return observedDraft(ctx, work, expectedRevision, roundRevision, (draft) => {
  if (draft.agreement.history?.some((round) => round.response.id === response.id)) throw new IntentDraftError("invalid", "A previous-round response cannot answer the fresh review");
  if (draft.response?.id === response.id && (draft.response.text !== response.text || draft.response.source !== response.source || Boolean(draft.response.cancelled) !== Boolean(response.cancelled))) throw new IntentDraftError("conflict", "An observed response ID cannot be reassigned to another answer or source");
  if (bindingId && !draft.questionnaireBindings.some((binding) => binding.toolCallId === bindingId && binding.revision === roundRevision)) throw new IntentDraftError("conflict", "Questionnaire binding is absent or stale");
  return { ...draft, response: { ...response, revision: roundRevision }, questionnaireBindings: bindingId ? draft.questionnaireBindings.filter((binding) => binding.toolCallId !== bindingId) : draft.questionnaireBindings };
 }, ports);
}

export function observeIntentEvidence(ctx: IntentContext, work: string, expectedRevision: string, roundRevision: string,
 evidence: IntentEvidence, ports: IntentRuntimePorts): Snapshot {
 return observedDraft(ctx, work, expectedRevision, roundRevision, (draft) => {
  if (evidence.work !== work || evidence.materialKey !== draft.agreement.materialKey) throw new IntentDraftError("conflict", "Evidence belongs to another intent revision");
  return { ...draft, evidence };
 }, ports);
}

export function bindIntentQuestionnaire(ctx: IntentContext, work: string, expectedRevision: string, toolCallId: string,
 questions: IntentQuestion[], ports: IntentRuntimePorts): Snapshot {
 const current = intentSnapshot(ctx, work);
 if (!current.agreement) throw new IntentDraftError("invalid", "No pending intent round");
 return observedDraft(ctx, work, expectedRevision, current.agreement.revision, (draft) => ({ ...draft,
  questionnaireBindings: [...draft.questionnaireBindings.filter((binding) => binding.toolCallId !== toolCallId),
   { toolCallId, revision: draft.agreement.revision, questions, fingerprint: questionnaireFingerprint(questions) }],
 }), ports);
}

export function migrateLegacyIntentDraft(ctx: IntentContext, work: string, ports: IntentRuntimePorts): Snapshot {
 const current = readIntentDraft(ctx.cwd, work);
 if (current.status === "invalid") throw new IntentDraftError("invalid", current.reason);
 if (current.status === "valid") return snapshotFromDraft(current.draft);
 const legacy = legacyIntentSnapshot(ctx, work);
 if (!legacy.agreement) return {};
 if (legacy.agreement.change) {
  const canonical = readAgreement(intentCanonicalDirectory(ctx.cwd, work));
  if (canonical.kind === "invalid" || canonical.kind === "valid" && JSON.stringify(canonical.agreement) !== JSON.stringify(legacy.agreement)) throw new IntentDraftError("conflict", "The legacy session disagrees with canonical intent; do not overwrite newer evidence");
  if (legacy.agreement.status === "confirmed") {
   if (canonical.kind !== "valid") throw new IntentDraftError("conflict", "The canonical agreement is missing; session migration cannot recreate confirmation");
   return { agreement: canonical.agreement };
  }
 }
 const result = publishIntentDraft(ctx.cwd, { schemaVersion: 1, work, agreement: legacy.agreement,
  response: legacy.response ? { ...legacy.response, revision: legacy.agreement.revision } : undefined,
  evidence: legacy.evidence, questionnaireBindings: [], publication: { state: "none" } }, "absent", ports);
 if (!result.ok) throw new IntentDraftError(result.code, result.reason);
 return snapshotFromDraft(result.draft);
}

export function selectIntentDraft(ctx: IntentContext, explicitWork?: string, objectiveWork?: string): { work?: string; ambiguous?: string[] } {
 if (explicitWork) return { work: explicitWork };
 if (objectiveWork) {
  const selected = readIntentDraft(ctx.cwd, objectiveWork);
  if (selected.status === "invalid") throw new IntentDraftError("invalid", selected.reason);
  if (selected.status === "valid" && selected.draft.publication.state !== "archived" && selected.draft.agreement.status !== "cancelled") return { work: objectiveWork };
 }
 const listed = listIntentDrafts(ctx.cwd);
 if (listed.status !== "ok") throw new IntentDraftError("invalid", listed.reason);
 const pending = listed.drafts.filter((draft) => draft.agreement.status === "pending" || ["promoting", "invalidating"].includes(draft.publication.state));
 if (pending.length > 1) return { ambiguous: pending.map((draft) => draft.work) };
 return pending.length ? { work: pending[0]!.work } : {};
}

export { recoverIntentDraft };
