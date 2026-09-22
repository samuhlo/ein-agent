import { createHash } from "node:crypto";
import { validateAgreement, type IntentAgreement } from "./intent-agreement.ts";
import { validateIntentQuestionnaire, type IntentQuestion } from "./intent-questionnaire.ts";
import type { IntentEvidence } from "./intent-evidence.ts";

export const INTENT_DRAFT_LIMITS = { bytes: 256 * 1024, listed: 32, bindings: 4 } as const;
export const isSafeDraftWork = (work: unknown): work is string => typeof work === "string" && work !== "archive" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(work) && work.length <= 128;
export type IntentDraftResponse = NonNullable<IntentAgreement["response"]> & { revision: string; cancelled?: boolean };
export type IntentQuestionnaireBinding = { toolCallId: string; revision: string; questions: IntentQuestion[]; fingerprint: string };
export type IntentPublication = { state: "none"; legacyDigest?: string } | {
  state: "archiving" | "archived"; change: string; agreementRevision: string; summarySha256: string; verificationReceiptSha256?: string;
} | {
  state: "promoting" | "invalidating" | "published";
  expectedCanonicalRevision: string | "absent";
  expectedCanonicalMaterialKey: string | null;
  agreement: IntentAgreement;
};
export type IntentDraftV1 = {
  schemaVersion: 1; revision: string; work: string; agreement: IntentAgreement;
  response?: IntentDraftResponse; evidence?: IntentEvidence;
  questionnaireBindings: IntentQuestionnaireBinding[]; publication: IntentPublication;
};
export type IntentDraftBody = Omit<IntentDraftV1, "revision">;
export type IntentRuntimePorts = {
  admission: { check(root: string, mode?: "inspect" | "initialize"): { status: "isolated" | "not-git" | "lock-only" | "rejected"; root: string; reason?: string } };
  now(): string;
  newId(): string;
  publishObjective(input: { objective: string; work: string; materialKey: string; agreementRevision: string; kind: "intent" | "intent-draft" }): { status: "updated" } | { status: "warning"; code: string };
};

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function keys(value: unknown, allowed: string[]): asserts value is Record<string, unknown> {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) throw new Error("Invalid intent draft object");
}
const hash = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
export const questionnaireFingerprint = (questions: IntentQuestion[]): string => hash(questions);

export function createIntentDraft(body: IntentDraftBody): IntentDraftV1 {
  const { revision: _previousRevision, ...canonical } = JSON.parse(JSON.stringify(body)) as IntentDraftV1;
  return validateIntentDraft({ ...canonical, revision: hash(canonical) });
}

export function validateIntentDraft(value: unknown): IntentDraftV1 {
  keys(value, ["schemaVersion", "revision", "work", "agreement", "response", "evidence", "questionnaireBindings", "publication"]);
  if (Buffer.byteLength(JSON.stringify(value)) > INTENT_DRAFT_LIMITS.bytes) throw new Error("Intent draft exceeds 256 KiB; preserve the existing draft and narrow new material");
  const { revision, ...body } = value;
  if (value.schemaVersion !== 1 || !isSafeDraftWork(value.work) || revision !== hash(body)) throw new Error("Invalid intent draft identity or revision");
  const agreement = validateAgreement(value.agreement);
  if (agreement.work !== value.work) throw new Error("Draft belongs to another work");
  if (value.response !== undefined) {
    keys(value.response, ["id", "text", "source", "revision", "cancelled"]);
    const response = value.response;
    if (typeof response.id !== "string" || !response.id || typeof response.text !== "string" || !response.text.trim()
      || !["interactive", "rpc", "ask_user_question", "claude-coordinator"].includes(String(response.source))
      || response.revision !== agreement.revision || (response.cancelled !== undefined && typeof response.cancelled !== "boolean")) throw new Error("Invalid draft response");
  }
  if (!Array.isArray(value.questionnaireBindings) || value.questionnaireBindings.length > INTENT_DRAFT_LIMITS.bindings) throw new Error("Too many pending questionnaire bindings");
  const ids = new Set<string>();
  for (const binding of value.questionnaireBindings) {
    keys(binding, ["toolCallId", "revision", "questions", "fingerprint"]);
    if (typeof binding.toolCallId !== "string" || !binding.toolCallId || ids.has(binding.toolCallId) || binding.revision !== agreement.revision) throw new Error("Invalid questionnaire binding identity");
    validateIntentQuestionnaire(binding.questions as IntentQuestion[]);
    if (binding.fingerprint !== questionnaireFingerprint(binding.questions as IntentQuestion[])) throw new Error("Questionnaire binding changed");
    ids.add(binding.toolCallId);
  }
  keys(value.publication, ["state", "legacyDigest", "expectedCanonicalRevision", "expectedCanonicalMaterialKey", "agreement", "change", "agreementRevision", "summarySha256", "verificationReceiptSha256"]);
  const publication = value.publication;
  if (publication.state === "none") {
    if (Object.keys(publication).some((key) => !["state", "legacyDigest"].includes(key)) || publication.legacyDigest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(String(publication.legacyDigest))) throw new Error("Invalid unpublished draft");
  } else if (publication.state === "archiving" || publication.state === "archived") {
    if (publication.change !== value.work || publication.agreementRevision !== agreement.revision || !/^[a-f0-9]{64}$/.test(String(publication.summarySha256))
      || publication.verificationReceiptSha256 !== undefined && !/^[a-f0-9]{64}$/.test(String(publication.verificationReceiptSha256))) throw new Error("Invalid archived intent identity");
  } else {
    if (!["promoting", "invalidating", "published"].includes(String(publication.state)) || typeof publication.expectedCanonicalRevision !== "string"
      || (publication.expectedCanonicalMaterialKey !== null && typeof publication.expectedCanonicalMaterialKey !== "string")
      || JSON.stringify(validateAgreement(publication.agreement)) !== JSON.stringify(agreement) || !agreement.change) throw new Error("Invalid intent publication journal");
  }
  if (value.evidence !== undefined) {
    keys(value.evidence, ["version", "id", "work", "materialKey", "authorization", "state", "toolCallId", "result", "decisionId", "objective", "roots", "commands"]);
    const evidence = value.evidence;
    if (evidence.version !== 1 || evidence.work !== value.work || typeof evidence.id !== "string" || !evidence.id
      || typeof evidence.materialKey !== "string" || typeof evidence.decisionId !== "string" || typeof evidence.objective !== "string"
      || !["ready", "running", "returned", "blocked"].includes(String(evidence.state))
      || !Array.isArray(evidence.roots) || !evidence.roots.every((r) => typeof r === "string")
      || !Array.isArray(evidence.commands) || !evidence.commands.every((c) => typeof c === "string")
      || !object(evidence.authorization) || typeof evidence.authorization.id !== "string" || typeof evidence.authorization.text !== "string"
      || !["interactive", "rpc", "claude-coordinator", "ask_user_question"].includes(String(evidence.authorization.source))) throw new Error("Invalid draft evidence");
    if (evidence.result !== undefined) {
      keys(evidence.result, ["text", "truncated", "isError"]);
      if (typeof evidence.result.text !== "string" || evidence.result.text.length > 6000 || typeof evidence.result.truncated !== "boolean" || typeof evidence.result.isError !== "boolean") throw new Error("Invalid bounded evidence result");
    }
  }
  return value as IntentDraftV1;
}
