import type { IntentQuestion } from "./intent-questionnaire.ts";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createIntentMaterialKey, normalizeIntentMaterial, type IntentMaterial } from "./sdd-intent-preflight.ts";
import { readAgreement, validateAgreement, writeAgreement, type IntentAgreement, validateIntentDecisions, type IntentDecision } from "./intent-agreement.ts";
import { isSafeChangeName, resolveChangesDir } from "./sdd-routing-core.ts";

export const INTENT_STATE = "ein:intent-discovery";
export const INTENT_INPUT = "ein:intent-response";
export type IntentContext = Pick<ExtensionContext, "cwd" | "sessionManager">;
export type IntentInput = { id: string; text: string; source: "interactive" | "rpc" | "ask_user_question"; cancelled?: boolean };
export type IntentRequest = {
	action: "propose" | "status" | "confirm" | "cancel" | "delegate" | "record" | "review";
	decisions?: IntentDecision[];
	work: string;
	change?: string;
	material?: IntentMaterial;
	questions?: string[];
	questionnaire?: IntentQuestion[];
	responseId?: string;
	reopenReason?: string;
};
type Entry = { type?: string; customType?: string; data?: unknown };
type Snapshot = { agreement?: IntentAgreement; response?: IntentInput };

function entries(ctx: IntentContext): Entry[] {
	return ctx.sessionManager.getBranch() as Entry[];
}

export function intentSnapshot(ctx: IntentContext, work: string): Snapshot {
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
	return { agreement, response };
}

function changeDirectory(cwd: string, change: string, create = false): string {
	if (!isSafeChangeName(change)) throw new Error("Invalid intent change name");
	const root = realpathSync(cwd);
	const changes = resolveChangesDir(root);
	const path = join(changes, change);
	let parent = root;
	for (const part of relative(root, path).split(sep)) {
		parent = join(parent, part);
		if (existsSync(parent) && (lstatSync(parent).isSymbolicLink() || !lstatSync(parent).isDirectory())) throw new Error("Unsafe intent directory");
	}
	if (create) mkdirSync(path, { recursive: true });
	return path;
}

export function discoveryAgreement(ctx: IntentContext, work: string, change?: string): Snapshot {
	const session = intentSnapshot(ctx, work);
	if (!change && session.agreement?.change) return discoveryAgreement(ctx, work, session.agreement.change);
	if (!change) return session;
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
): Snapshot {
	if (!isSafeChangeName(request.work) || (request.change !== undefined && request.change !== request.work)) throw new Error("Use a bounded work name; for SDD, work and change must match");
	let previous: Snapshot;
	try { previous = discoveryAgreement(ctx, request.work, request.change); }
	catch (error) {
		// Un intent antiguo se conserva; la nueva conversación permite adoptarlo
		// solo después de obtener una respuesta, nunca por mera presencia.
		if (request.action !== "propose") throw error;
		const pending = intentSnapshot(ctx, request.work);
		previous = pending.agreement?.status === "pending" ? pending : {};
	}
	request = { ...request, questions: request.questionnaire?.map((q) => q.question) ?? request.questions, change: request.change ?? previous.agreement?.change };
	if (request.action === "status") {
		if (previous.agreement?.status === "pending" && intentSnapshot(ctx, request.work).agreement?.revision !== previous.agreement.revision) append(INTENT_STATE, previous.agreement);
		return previous;
	}
	const publish = (agreement: IntentAgreement) => {
		validateAgreement(agreement);
		if (agreement.change && (agreement.status === "confirmed" || readAgreement(changeDirectory(ctx.cwd, agreement.change)).kind === "valid")) {
			writeAgreement(changeDirectory(ctx.cwd, agreement.change, true), agreement);
		}
		append(INTENT_STATE, agreement);
		return { agreement };
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
			] : [], revision: randomUUID() });
	}
	if (request.action === "delegate") {
		const explicit = /^(?:(?:resu[eé]lvelo t[uú]|hazlo|decide t[uú]|adelante|contin[uú]a)[,;:]?\s+)?(?:sin preguntas|sin preguntarme|no me preguntes|without questions|don['’]t ask me|do not ask me)[.!]?$/i;
		if (!latestInput || !latestInput.text.split(/\r?\n/).some((line) => explicit.test(line.trim()))) {
			throw new Error("Skipping questions requires an explicit no-questions instruction in the current human input; auto alone is not consent");
		}
		if (!request.material) throw new Error("Record the delegated objective, boundaries and completion criteria");
		const material = normalizeIntentMaterial(request.material);
		return publish({ version: 1, work: request.work, change: request.change, status: "confirmed", material,
			materialKey: createIntentMaterialKey(material), questions: [], delegated: true, response: latestInput, revision: randomUUID() });
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
			materialKey, stage: "round", decisions: request.decisions ?? previous.agreement?.decisions, questions: request.questions, questionnaire: request.questionnaire, reopenReason: request.reopenReason?.trim(), history, revision: randomUUID() });
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
			response: undefined, revision: randomUUID() });
	}
	if (request.action !== "confirm") throw new Error("Unknown intent action");
	if (previous.agreement.status === "confirmed") return previous;
	if (previous.agreement.status !== "pending" || !previous.response || previous.response.id !== request.responseId) {
		throw new Error("Wait for a real user response after the question; call status to obtain its responseId. Model declarations and extension messages do not confirm intent.");
	}
	if (previous.response.source === "ask_user_question" && previous.agreement.stage === "review") {
		const replies = previous.response.text.split("\n").map((line) => JSON.parse(line));
		const last = replies.at(-1)?.answers?.at(-1)?.answer;
		if (last === "Ajustar acuerdo" || last === "Cancelar") throw new Error("The user did not confirm the review; adjust or cancel intent");
	}
	if (previous.agreement.stage !== "review") throw new Error("A round answer does not close intent. Recompute the tree and use review before final confirmation.");
	if (request.material && createIntentMaterialKey(normalizeIntentMaterial(request.material)) !== previous.agreement.materialKey) throw new Error("Changed material requires a new review and a fresh human response");
	const material = request.material ? normalizeIntentMaterial(request.material) : previous.agreement.material;
	return publish({ ...previous.agreement, status: "confirmed", material,
		materialKey: createIntentMaterialKey(material), response: previous.response });
}

export function requireIntent(ctx: IntentContext, work?: string, change?: string): IntentAgreement {
	if (!work) throw new Error("Intent required: call ein_intent before delegating new work, then include intent_work: <work> in the task");
	const { agreement } = discoveryAgreement(ctx, work, change);
	if (agreement?.status !== "confirmed") throw new Error("Intent pending: ask the user and wait for their response before scoping, designing or implementing; auto does not skip discovery");
	return agreement;
}
