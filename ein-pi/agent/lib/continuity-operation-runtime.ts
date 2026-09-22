import { randomUUID } from "node:crypto";
import { operationId, operationInputDigest, validContinuityOperation, type NativeCallRef, type ContinuityOperation, type OperationRecovery } from "./continuity-operations.ts";
import { ensureOperationIsolation, readContinuityOperations, transactContinuityOperations, type OperationWrite } from "./continuity-operation-store.ts";
import { continuityEvidenceFile, createContinuityRecoveryEvidence, knownExternalContinuityCall, type ContinuityRecoveryEvidencePort } from "./continuity-recovery-evidence.ts";
import { projectProjectState } from "./project-state.ts";
import { sessionReferenceFor } from "./runtime-session-identity.ts";

export type OperationStart = Pick<ContinuityOperation, "runtime" | "tool" | "inputDigest" | "nativeCallRef" | "effectScope">;
export type RecoveryAssessment = { kind: "local-attested" | "external-observed"; summary: string; callRef: NativeCallRef; evidenceRefs: string[]; evidencePaths: string[] };
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
type Ports = { now?: () => string; stateRef?: () => string | null; evidence?: ContinuityRecoveryEvidencePort; beforeRecoveryPublish?: () => void };
export function createContinuityOperationRuntime(cwd: string, ports: Ports = {}) {
  const now = ports.now ?? (() => new Date().toISOString());
  const stateRef = ports.stateRef ?? (() => projectProjectState({ cwd }).git.stateRef ?? null);
  const evidence = ports.evidence ?? createContinuityRecoveryEvidence(cwd);
  const read = () => readContinuityOperations(cwd);
  const update = (transition: (items: readonly ContinuityOperation[]) => readonly ContinuityOperation[]): OperationWrite => {
    const before = read(); if (before.status === "failure") return { ok: false, reason: before.reason, outcome: "not-published" };
    return transactContinuityOperations(cwd, before.status === "absent" ? "absent" : before.journal.revision, transition);
  };
  const candidate = (input: OperationStart): ContinuityOperation => ({ ...input, id: operationId(input.runtime, input.nativeCallRef), startedAt: now(), beforeStateRef: stateRef(), status: "running" });
  const compatible = (old: ContinuityOperation, next: ContinuityOperation) => {
    if (old.inputDigest !== next.inputDigest || old.tool !== next.tool || old.runtime !== next.runtime) throw new Error("operation-identity-conflict");
  };
  // CAS -> Recovery commands have their own journal entries; only target changes invalidate inspection.
  const token = (_revision: string, ref: string, op: ContinuityOperation) => operationInputDigest({ operationRevision: operationInputDigest(op), stateRef: ref });
  return {
    read,
    list() { const result = read(); return result.status === "failure" ? { ok: false as const, reason: result.reason } : { ok: true as const, observed: result.status === "valid", operations: result.status === "valid" ? result.journal.operations.filter((op) => op.status !== "settled").map(({ id, tool, status }) => ({ id, tool, status })) : [] }; },
    uncertain(): boolean { const result = read(); return result.status === "failure" || result.status === "valid" && result.journal.operations.some((op) => op.status !== "settled"); },
    begin(input: OperationStart): OperationWrite {
      const isolated = ensureOperationIsolation(cwd); if (!isolated.ok) return { ...isolated, outcome: "not-published" };
      const next = candidate(input);
      return update((items) => { const old = items.find((op) => op.id === next.id); if (old) { compatible(old, next); return items; } return [...items, next]; });
    },
    finish(input: OperationStart, outcome: "succeeded" | "failed" | "unavailable"): OperationWrite {
      const next = candidate(input);
      return update((items) => {
        const old = items.find((op) => op.id === next.id);
        if (!old) return [...items, { ...next, beforeStateRef: null, status: "uncertain", reason: "missing-start", afterStateRef: stateRef() }];
        compatible(old, next); if (old.status === "settled") return items;
        const settled: ContinuityOperation = outcome === "succeeded"
          ? { ...old, status: "settled", outcome: "succeeded", afterStateRef: stateRef() }
          : { ...old, status: "uncertain", reason: `native-${outcome}`, afterStateRef: stateRef() };
        return items.map((op) => op.id === old.id ? settled : op);
      });
    },
    denied(input: OperationStart, guardId: string): OperationWrite {
      const next = candidate(input);
      return update((items) => {
        const old = items.find((op) => op.id === next.id); if (old) compatible(old, next);
        if (old?.status === "settled") { if (old.outcome !== "not-started") throw new Error("operation-terminal-conflict"); return items; }
        const denied: ContinuityOperation = { ...(old ?? next), status: "settled", outcome: "not-started", reason: `ein-guard:${guardId}` };
        return [...items.filter((op) => op.id !== next.id), denied];
      });
    },
    legacyFailure(runtime: "pi" | "claude" = "pi"): OperationWrite {
      const ref = { sessionRef: sessionReferenceFor(runtime, "legacy-unobserved"), toolCallId: randomUUID() };
      return this.finish({ runtime, tool: "legacy-mutation", inputDigest: operationInputDigest(null), nativeCallRef: ref, effectScope: "external-or-unknown" }, "unavailable");
    },
    inspect(id: string): Result<{ operation: ContinuityOperation; token: string; stateRef: string; call: ReturnType<ContinuityRecoveryEvidencePort["readCall"]> }> {
      const journal = read(); if (journal.status !== "valid") return { ok: false, reason: journal.status === "failure" ? journal.reason : "operation-not-found" };
      const operation = journal.journal.operations.find((op) => op.id === id); if (!operation) return { ok: false, reason: "operation-not-found" };
      const ref = stateRef(); if (!ref) return { ok: false, reason: "state-ref-unavailable" };
      const call = evidence.readCall(operation.nativeCallRef);
      return { ok: true, value: { operation, token: token(journal.journal.revision, ref, operation), stateRef: ref, call } };
    },
    resolve(id: string, suppliedToken: string, assessment: RecoveryAssessment, source: OperationRecovery["source"]): Result<ContinuityOperation> {
      try {
        const before = read(); if (before.status !== "valid") return { ok: false, reason: "journal-unavailable" };
        const old = before.journal.operations.find((op) => op.id === id), ref = stateRef();
        if (!old || old.status === "settled" || !ref || suppliedToken !== token(before.journal.revision, ref, old)) return { ok: false, reason: "inspection-stale" };
        if (operationInputDigest(assessment.callRef) !== operationInputDigest(old.nativeCallRef)) return { ok: false, reason: "call-reference-mismatch" };
        const call = evidence.readCall(old.nativeCallRef);
        if (!call || call.inputDigest !== old.inputDigest || call.tool !== old.tool) return { ok: false, reason: "native-call-unavailable" };
        if (!Array.isArray(assessment.evidenceRefs) || !Array.isArray(assessment.evidencePaths) || assessment.evidenceRefs.length > 16 || assessment.evidencePaths.length > 16) return { ok: false, reason: "invalid-recovery" };
        if (assessment.kind === "local-attested" && knownExternalContinuityCall(call)) return { ok: false, reason: "external-proof-required" };
        const refs = assessment.evidenceRefs.map((value) => evidence.readEvidence(value, call));
        if (refs.some((value) => !value)) return { ok: false, reason: "evidence-unavailable" };
        if (assessment.kind === "external-observed" && !refs.some((value) => value?.matchesExternalEffect === true)) return { ok: false, reason: "external-proof-required" };
        const paths = assessment.evidencePaths.map((path) => continuityEvidenceFile(cwd, path));
        if (assessment.kind === "local-attested" && !paths.length) return { ok: false, reason: "local-evidence-required" };
        const resolved: ContinuityOperation = { ...old, status: "settled", outcome: "recovered", recovery: { token: suppliedToken, stateRef: ref, kind: assessment.kind, source, summary: assessment.summary, callRef: old.nativeCallRef, evidenceRefs: refs.map((value) => `${value!.ref}@${value!.digest}`), evidence: paths, resolvedAt: now() } };
        if (!validContinuityOperation(resolved)) return { ok: false, reason: "invalid-recovery" };
        if (stateRef() !== ref || paths.some((path) => continuityEvidenceFile(cwd, path.path).digest !== path.digest)) return { ok: false, reason: "inspection-stale" };
        const written = transactContinuityOperations(cwd, before.journal.revision, (items) => items.map((op) => op.id === id ? resolved : op), { beforePublish() {
          ports.beforeRecoveryPublish?.();
          const currentCall = evidence.readCall(old.nativeCallRef);
          if (stateRef() !== ref || !currentCall || currentCall.inputDigest !== old.inputDigest
            || paths.some((path) => continuityEvidenceFile(cwd, path.path).digest !== path.digest)
            || refs.some((item) => evidence.readEvidence(item!.ref, currentCall)?.digest !== item!.digest)) throw new Error("inspection-stale");
        } });
        return written.ok ? { ok: true, value: resolved } : { ok: false, reason: written.reason };
      } catch { return { ok: false, reason: "evidence-unavailable" }; }
    },
  };
}
