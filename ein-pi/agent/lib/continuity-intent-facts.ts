import { readIntentDraft } from "./intent-draft-store.ts";
import { selectIntentDraft } from "./intent-discovery.ts";
import type { ContinuityCheckpointFacts, ContinuityObjectiveEvidence } from "./continuity-checkpoint.ts";

export type ContinuityIntentFacts = { kind: "none" } | { kind: "unavailable"; reason: string } | { kind: "pending"; facts: Partial<ContinuityCheckpointFacts> };

export function continuityIntentFacts(root: string, explicitWork?: string, objectiveEvidence?: ContinuityObjectiveEvidence): ContinuityIntentFacts {
  try {
    const objectiveWork = objectiveEvidence && (objectiveEvidence.kind === "intent" || objectiveEvidence.kind === "intent-draft") ? objectiveEvidence.work : undefined;
    const selected = selectIntentDraft({ cwd: root, sessionManager: { getBranch: () => [] } }, explicitWork, objectiveWork);
    if (selected.ambiguous) return { kind: "unavailable", reason: `Select an intent work: ${selected.ambiguous.join(", ")}` };
    if (!selected.work) return { kind: "none" };
    const read = readIntentDraft(root, selected.work);
    if (read.status === "invalid") return { kind: "unavailable", reason: read.reason };
    if (read.status === "absent") return { kind: "none" };
    const { agreement, publication, evidence } = read.draft;
    if (publication.state === "archived" || agreement.status === "cancelled" || agreement.status === "confirmed" && ["none", "published"].includes(publication.state)) return { kind: "none" };
    const unresolved = (agreement.decisions ?? []).filter((decision) => decision.status !== "resolved");
    return { kind: "pending", facts: {
      objective: agreement.material.objective,
      objectiveEvidence: { kind: "intent-draft", work: agreement.work, materialKey: agreement.materialKey, agreementRevision: agreement.revision },
      completed: [],
      unresolvedDecisions: unresolved.slice(0, 24).map((decision) => `Intent ${decision.status}: ${decision.id.slice(0, 128)}`),
      nextAction: `Read .ein/intent-drafts/${agreement.work}.json and recover its exact revision and recorded answers before asking only unresolved questions. This draft grants no implementation authority.${evidence?.state === "running" ? " Evidence outcome unavailable: recover the recorded toolCallId; do not relaunch." : ""}`,
    } };
  } catch (error) { return { kind: "unavailable", reason: String(error) }; }
}
