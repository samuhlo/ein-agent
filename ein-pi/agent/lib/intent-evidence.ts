import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { IntentAgreement } from "./intent-agreement.ts";

export const INTENT_EVIDENCE = "ein:intent-evidence";
export const EVIDENCE_MARKER = "intent_evidence: ";
export type EvidencePlan = { decisionId: string; objective: string; roots: string[]; commands: string[] };
export type IntentEvidence = EvidencePlan & {
 version: 1; id: string; work: string; materialKey: string;
 authorization: NonNullable<IntentAgreement["response"]>;
 state: "ready" | "running" | "returned" | "blocked";
 toolCallId?: string;
 result?: { text: string; truncated: boolean; isError: boolean };
};

export function evidenceFor(entries: readonly unknown[], work: string): IntentEvidence | undefined {
 for (let i = entries.length - 1; i >= 0; i--) {
  const entry = entries[i] as { type?: string; customType?: string; data?: IntentEvidence };
  if (entry?.type === "custom" && entry.customType === INTENT_EVIDENCE && entry.data?.work === work) return entry.data;
 }
}

export function prepareEvidence(agreement: IntentAgreement, plan: EvidencePlan, response: IntentAgreement["response"], previous?: IntentEvidence): IntentEvidence {
 const fact = agreement.decisions?.find((d) => d.id === plan.decisionId);
 if (agreement.status !== "pending" || !fact || fact.status !== "waiting") throw new Error("Evidence must answer an unresolved fact in the current intent");
 if (fact.dependsOn.some((id) => !agreement.decisions?.some((d) => d.id === id && d.status === "resolved"))) throw new Error("Incorporate the existing response to settle the evidence prerequisites first");
 if (!plan.objective?.trim() || !Array.isArray(plan.roots) || !plan.roots.length || plan.roots.some((r) => typeof r !== "string" || !r.trim())
  || !Array.isArray(plan.commands) || !plan.commands.length || plan.commands.some((c) => typeof c !== "string" || !c.trim())) throw new Error("Supply a bounded evidence objective, read roots and exact local commands");
 const unchanged = previous && previous.materialKey === agreement.materialKey && previous.decisionId === plan.decisionId
  && previous.objective === plan.objective && JSON.stringify(previous.roots) === JSON.stringify(plan.roots) && JSON.stringify(previous.commands) === JSON.stringify(plan.commands);
 if (unchanged) return previous.state === "blocked" ? { ...previous, state: "ready", toolCallId: undefined, result: undefined } : previous;
 if (!response?.id || !response.text) throw new Error("Recover the existing authorization response from intent status/history; a technical rejection is not missing user permission");
 return { ...plan, version: 1, id: randomUUID(), work: agreement.work, materialKey: agreement.materialKey, authorization: response, state: "ready" };
}

// The parent checks this packet against its durable authorization. The child
// receives that exact packet, not a prose claim that ordinary SDD is read-only.
export function evidenceTask(evidence: IntentEvidence): string {
 const packet = { ...evidence, state: "ready" as const, toolCallId: undefined, result: undefined };
 return `${EVIDENCE_MARKER}${Buffer.from(JSON.stringify(packet)).toString("base64")}\n${evidence.objective}\nRead only the allowed roots. Execute only the supplied local commands. Return observations and exact command results inline; do not implement, create SDD artifacts or ask the user to authorize this same investigation again.`;
}

export function readEvidenceTask(task: string): IntentEvidence | undefined {
 const line = task.split("\n").find((line) => line.startsWith(EVIDENCE_MARKER));
 if (!line) return;
 try {
  const value = JSON.parse(Buffer.from(line.slice(EVIDENCE_MARKER.length), "base64").toString("utf8")) as IntentEvidence;
  if (value.version !== 1 || !value.id || !value.work || !value.authorization?.id || !value.objective
   || !Array.isArray(value.roots) || !value.roots.length || !Array.isArray(value.commands) || !value.commands.length) throw new Error();
  return value;
 } catch { throw new Error("Invalid intent evidence packet"); }
}

export function evidenceReadAllowed(cwd: string, path: unknown, roots: string[]): boolean {
 if (typeof path !== "string") return false;
 try {
  const target = realpathSync(resolve(cwd, path));
  return roots.some((root) => {
   const base = realpathSync(resolve(cwd, root));
   const delta = relative(base, target);
   return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(`..${sep}`));
  });
 } catch { return false; }
}
