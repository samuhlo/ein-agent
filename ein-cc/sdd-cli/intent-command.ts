import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAgreement, validateAgreement, type IntentAgreement } from "../../shared/sdd/intent-agreement.ts";
import { createIntentMaterialKey, normalizeIntentMaterial, type IntentMaterial } from "../../shared/sdd/sdd-intent-preflight.ts";
import { isSafeChangeName, resolveChangesDir } from "../../shared/sdd/sdd-routing-core.ts";
import { setContinuityObjective, showContinuityObjective } from "../../shared/ports/continuity.ts";
import { createIntentDraftRuntime, isSafeDraftWork, readIntentDraft, listIntentDrafts, publishIntentDraft, recoverIntentDraft,
  readIntentAdmission, runIntentDiscovery, observeIntentResponse, snapshotFromDraft, nextIntentAction, type IntentRequest } from "../../shared/ports/intent.ts";

export const INTENT_HELP = `ein-cc-sdd intent <change> [show|record] < agreement.json
show is read-only. record requires JSON:
{"material":{"objective":"...","boundaries":{"in":["..."],"out":["..."]},"completionCriteria":["..."]},"questions":["Exact question"],"response":"Literal user answer","confirmed":true}
For a complete user request, questions may be []. Reuse an unchanged confirmed agreement.
Earlier rounds may be supplied as rounds: [{questions:["..."],response:"literal answer"}].
To replace an existing agreement, include expectedRevision and reopenReason.
For an unmanaged intent.md, include expectedDigest (from show) and reopenReason;
the original is preserved beside intent.md. Review existing artifacts before binding
them to the returned materialKey. Never relabel stale work without reviewing it.
Claude records coordinator-attested conversation, not Pi observed-response receipts.
--force cannot bypass intent, failed verification, pending tasks or spec conflicts.
Drafts: intent <work> draft-show | intent draft-list (read-only).
Mutations: draft-propose, draft-answer, draft-review, draft-confirm, draft-cancel, draft-recover.
Supply expectedRevision in stdin JSON (absent only when creating). answer/review/confirm also
require roundRevision from draft-show. answer requires literal text; review/confirm require responseId.
Review first, then record a NEW answer before confirm; confirmed:true alone never confirms a draft.`;

type RecordInput = {
	material: IntentMaterial;
	questions: string[];
	response: string;
	confirmed: boolean;
	expectedRevision?: string;
	expectedDigest?: string;
	reopenReason?: string;
	rounds?: { questions: string[]; response: string }[];
};

function publishObjective(cwd: string, agreement: IntentAgreement): string | undefined {
	const shown = showContinuityObjective(cwd);
	if (shown.kind === "unavailable") return `continuity-objective-unavailable:${shown.reason}`;
	const result = setContinuityObjective(cwd, { objective: agreement.material.objective, evidence: {
		kind: "intent", work: agreement.work, materialKey: agreement.materialKey, agreementRevision: agreement.revision,
	} }, shown.expectedRevision);
	return result.outcome === "set" || result.outcome === "unchanged" ? undefined : `continuity-objective-${result.outcome}:${result.reason ?? "unknown"}`;
}

export function runIntentCommand(cwd: string, args: readonly string[], raw = ""): { text: string; exitCode: number } {
	try {
		const [change, action = "show"] = args;
		if (change === "draft-list" || action.startsWith("draft-")) return runDraftCommand(cwd, args, raw);
		if (!change || args.includes("--help")) return { text: INTENT_HELP, exitCode: args.includes("--help") ? 0 : 1 };
		if (!isSafeChangeName(change) || args.length > 2 || !["show", "record"].includes(action)) throw new Error(INTENT_HELP);
		const root = resolveChangesDir(cwd);
		const dir = join(root, change);
		// DESTINO -> No seguir enlaces al registrar un acuerdo fuera del proyecto.
		for (const path of [join(cwd, "openspec"), join(cwd, ".sdd"), root, dir, join(dir, "intent.md")]) {
			if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error("Unsafe intent path");
		}
		const current = readAgreement(dir);
		const draft = isSafeDraftWork(change) ? readIntentDraft(cwd, change) : { status: "absent" as const };
		if (action === "record" && draft.status !== "absent") {
			const admission = readIntentAdmission({ root: cwd, work: change, changeDir: dir, requiresCanonical: true });
			if (!admission.admitted) throw new Error("An open, cancelled or invalid intent draft cannot be bypassed with record; resume draft-show and its current round");
		}
		const original = current.kind === "invalid" ? readFileSync(join(dir, "intent.md"), "utf8") : undefined;
		const digest = original === undefined ? undefined : `sha256:${createHash("sha256").update(original).digest("hex")}`;
		if (action === "show") return { text: JSON.stringify({ ...current, ...(digest ? { digest } : {}), ...(draft.status === "valid" ? { draftRevision: draft.draft.revision, draftStatus: draft.draft.agreement.status, publication: draft.draft.publication.state } : {}) }), exitCode: 0 };
		if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("Intent input exceeds 64 KiB");
		const input: RecordInput = JSON.parse(raw);
		if (input.confirmed !== true || typeof input.response !== "string" || !input.response.trim()) throw new Error("Record only an actual user agreement: confirmed=true and literal response required");
		const material = normalizeIntentMaterial(input.material);
		const materialKey = createIntentMaterialKey(material);
		const previous = current.kind === "valid" ? current.agreement : undefined;
		if (previous && previous.work !== change) throw new Error("Agreement belongs to a different change");
		if (previous?.status === "confirmed" && previous.materialKey === materialKey) {
			const continuityWarning = publishObjective(cwd, previous);
			return { text: JSON.stringify({ outcome: "adopted", agreement: previous, ...(continuityWarning ? { continuityWarning } : {}) }), exitCode: 0 };
		}
		if (current.kind !== "absent") {
			if (!input.reopenReason?.trim()) throw new Error("Existing intent requires reopenReason");
			if (previous ? input.expectedRevision !== previous.revision : input.expectedDigest !== digest) throw new Error("Intent changed or was not reviewed: use the revision/digest from intent show");
		}
		if (input.rounds !== undefined && !Array.isArray(input.rounds)) throw new Error("Invalid earlier rounds");
		const rounds = (input.rounds ?? []).map((round) => {
			if (!Array.isArray(round.questions) || round.questions.length < 1 || round.questions.length > 4 || round.questions.some((q) => typeof q !== "string" || !q.trim()) || typeof round.response !== "string" || !round.response.trim()) throw new Error("Invalid earlier round");
			return { questions: round.questions, response: { id: randomUUID(), text: round.response, source: "claude-coordinator" as const } };
		});
		const history = [...(previous?.history ?? []), ...(previous?.response ? [{ questions: previous.questions, response: previous.response }] : []), ...rounds];
		const agreement: IntentAgreement = validateAgreement({
			version: 1, work: change, change, status: "confirmed", material, materialKey,
			questions: input.questions, ...(input.questions?.length === 0 ? { fromRequest: true } : {}),
			response: { id: randomUUID(), text: input.response, source: "claude-coordinator" },
			revision: randomUUID(), ...(input.reopenReason ? { reopenReason: input.reopenReason } : {}),
			...(history.length ? { history } : {}),
		});
		mkdirSync(dir, { recursive: true });
		if (original !== undefined) {
			const backup = join(dir, `intent-before-claude-${digest!.slice(7)}.md`);
			if (existsSync(backup)) {
				if (lstatSync(backup).isSymbolicLink() || readFileSync(backup, "utf8") !== original) throw new Error("Intent backup conflicts");
			} else writeFileSync(backup, original, { flag: "wx", mode: 0o600 });
		}
		const stored = publishIntentDraft(cwd, { schemaVersion: 1, work: change, agreement, questionnaireBindings: [], publication: { state: "none" } },
			draft.status === "valid" ? draft.draft.revision : "absent", createIntentDraftRuntime(cwd, { mutating: true }), {},
			original !== undefined ? { expectedDigest: input.expectedDigest!, reason: input.reopenReason! } : undefined);
		if (!stored.ok) throw new Error(stored.reason);
		const continuityWarning = publishObjective(cwd, agreement);
		return { text: JSON.stringify({ outcome: "recorded", agreement, ...(continuityWarning ? { continuityWarning } : {}) }), exitCode: 0 };
	} catch (error) {
		return { text: error instanceof Error ? error.message : String(error), exitCode: 1 };
	}
}

function runDraftCommand(cwd: string, args: readonly string[], raw: string): { text: string; exitCode: number } {
  const [work, action = "draft-show"] = args;
  if (work === "draft-list" || action === "draft-list") {
    const listed = listIntentDrafts(cwd);
    return { text: JSON.stringify(listed), exitCode: listed.status === "ok" ? 0 : 1 };
  }
  if (!isSafeDraftWork(work) || args.length !== 2) throw new Error("Provide one safe work and draft action");
  const current = readIntentDraft(cwd, work);
  if (action === "draft-show") return { text: JSON.stringify(current.status === "valid" ? { kind: "draft", ...snapshotFromDraft(current.draft, cwd), nextAction: nextIntentAction(snapshotFromDraft(current.draft, cwd)) } : current), exitCode: current.status === "invalid" ? 1 : 0 };
  if (!["draft-propose", "draft-answer", "draft-review", "draft-confirm", "draft-cancel", "draft-recover"].includes(action)) throw new Error(INTENT_HELP);
  if (Buffer.byteLength(raw) > 256 * 1024) throw new Error("Draft input exceeds 256 KiB");
  const input = JSON.parse(raw) as Record<string, unknown>;
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.expectedRevision !== "string") throw new Error("Draft mutation requires expectedRevision");
  const ctx = { cwd, sessionManager: { getBranch: () => [] } };
  const ports = createIntentDraftRuntime(cwd, { mutating: true });
  if (action === "draft-recover") {
    const recovered = recoverIntentDraft(cwd, work, input.expectedRevision, ports);
    if (!recovered.ok) throw new Error(recovered.reason);
    return { text: JSON.stringify(snapshotFromDraft(recovered.draft)), exitCode: 0 };
  }
  if (["draft-answer", "draft-review", "draft-confirm"].includes(action) && (current.status !== "valid" || input.roundRevision !== current.draft.agreement.revision)) throw new Error("Draft answer/review/confirm requires the current roundRevision");
  let snapshot;
  if (action === "draft-answer") {
    if (typeof input.text !== "string" || !input.text.trim()) throw new Error("A literal user answer is required");
    const response = { id: typeof input.retryResponseId === "string" && /^[a-f0-9-]{36}$/i.test(input.retryResponseId) ? input.retryResponseId : ports.newId(), text: input.text, source: "claude-coordinator" as const };
    try { snapshot = observeIntentResponse(ctx, work, input.expectedRevision, String(input.roundRevision), response, ports); }
    catch (error) { return { text: JSON.stringify({ ok: false, reason: String(error), work, unpublishedResponse: { ...response, revision: input.roundRevision }, instruction: "This response was not published. Reload the draft and retain this ID with retryResponseId when retrying the same round." }), exitCode: 1 }; }
  } else {
    snapshot = runIntentDiscovery(ctx, { ...input, work, action: action.slice(6) } as IntentRequest, () => {}, undefined, ports);
  }
  return { text: JSON.stringify({ ...snapshot, nextAction: nextIntentAction(snapshot) }), exitCode: 0 };
}
