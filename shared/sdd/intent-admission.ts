import { readAgreement, type IntentAgreement } from "./intent-agreement.ts";
import { isSafeDraftWork } from "./intent-draft.ts";
import { readIntentDraft } from "./intent-draft-store.ts";

export type IntentAdmission = {
  admitted: boolean;
  state: "absent" | "confirmed" | "pending" | "cancelled" | "invalid";
  reason?: string;
  agreement?: IntentAgreement;
  draftRevision?: string;
};
export function readIntentAdmission(input: { root: string; work: string; changeDir: string; requiresCanonical: boolean }): IntentAdmission {
  const canonical = readAgreement(input.changeDir);
  const draft = isSafeDraftWork(input.work) ? readIntentDraft(input.root, input.work) : { status: "absent" as const };
  if (draft.status === "invalid") return { admitted: false, state: "invalid", reason: draft.reason };
  if (draft.status === "valid") {
    const { agreement, publication, revision } = draft.draft;
    const base = { agreement, draftRevision: revision };
    if (publication.state === "archived") return { ...base, admitted: false, state: "cancelled", reason: "Archived intent is historical; reopen explicitly before another execution" };
    if (publication.state === "archiving") return { ...base, admitted: false, state: "pending", reason: "Intent archive publication requires recovery" };
    if (publication.state === "promoting" || publication.state === "invalidating") return { ...base, admitted: false, state: "pending", reason: "Intent publication interrupted; recover the saved draft revision" };
    if (agreement.status !== "confirmed") return { ...base, admitted: false, state: agreement.status, reason: "Intent draft is not confirmed" };
    if (input.requiresCanonical || agreement.change || publication.state === "published") {
      if (canonical.kind !== "valid" || JSON.stringify(canonical.agreement) !== JSON.stringify(agreement)) return { ...base, admitted: false, state: "invalid", reason: "Intent draft and canonical agreement disagree; recover before continuing" };
    }
    return { ...base, admitted: true, state: "confirmed" };
  }
  if (canonical.kind === "invalid") return { admitted: false, state: "invalid", reason: "Canonical intent is unreadable or invalid" };
  if (canonical.kind === "absent") return { admitted: !input.requiresCanonical, state: "absent" };
  if (canonical.agreement.work !== input.work || canonical.agreement.change !== input.work) return { admitted: false, state: "invalid", reason: "Canonical intent belongs to another work" };
  return { admitted: canonical.agreement.status === "confirmed", state: canonical.agreement.status, agreement: canonical.agreement };
}
