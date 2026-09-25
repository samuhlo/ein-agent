import { randomUUID } from "node:crypto";
import { OPERATION_LIMITS, operationId, operationInputDigest, validContinuityOperation, type NativeCallRef, type ContinuityOperation, type OperationRecovery } from "./continuity-operations.ts";
import { ensureOperationIsolation, readContinuityOperations, transactContinuityOperations, type OperationWrite } from "./continuity-operation-store.ts";
import { continuityEvidenceFile, createContinuityRecoveryEvidence, requiresExternalContinuityProof, type ContinuityRecoveryEvidencePort } from "./continuity-recovery-evidence.ts";
import { projectProjectState } from "./project-state.ts";
import { sessionReferenceFor } from "./runtime-session-identity.ts";
import { isSafeCheckpointText } from "./continuity-checkpoint.ts";

export type OperationStart = Pick<ContinuityOperation, "runtime" | "tool" | "inputDigest" | "nativeCallRef" | "effectScope" | "admissionRef">;
export type RecoveryAssessment = { kind: "local-attested" | "external-observed"; summary: string; callRef: NativeCallRef; evidenceRefs: string[]; evidencePaths: string[] };
type Result<T> = { ok: true; value: T } | { ok: false; reason: string };
type Ports = { now?: () => string; stateRef?: () => string | null; evidence?: ContinuityRecoveryEvidencePort; beforeRecoveryPublish?: () => void };
export function createContinuityOperationRuntime(cwd: string, ports: Ports = {}) {
  const now = ports.now ?? (() => new Date().toISOString());
  const stateRef = ports.stateRef ?? (() => projectProjectState({ cwd }).git.stateRef ?? null);
  const evidence = ports.evidence ?? createContinuityRecoveryEvidence(cwd);
  const admissions = new Map<string, string>();
  const read = () => readContinuityOperations(cwd);
  const update = (transition: (items: readonly ContinuityOperation[]) => readonly ContinuityOperation[]): OperationWrite => {
    const before = read(); if (before.status === "failure") return { ok: false, reason: before.reason, outcome: "not-published" };
    return transactContinuityOperations(cwd, before.status === "absent" ? "absent" : before.journal.revision, transition);
  };
  const candidate = (input: OperationStart): ContinuityOperation => {
    const id = operationId(input.runtime, input.nativeCallRef);
    return { ...input, id, admissionRef: input.admissionRef ?? admissions.get(id) ?? operationInputDigest(randomUUID()), startedAt: now(), beforeStateRef: stateRef(), status: "running" };
  };
  const compatible = (old: ContinuityOperation, next: ContinuityOperation) => {
    if (old.inputDigest !== next.inputDigest || old.tool !== next.tool || old.runtime !== next.runtime) throw new Error("operation-identity-conflict");
  };
  // CAS -> Recovery commands have their own journal entries; only target changes invalidate inspection.
  const token = (_revision: string, ref: string, op: ContinuityOperation) => operationInputDigest({ operationRevision: operationInputDigest(op), stateRef: ref });
  return {
    read,
    list(offset = 0) { const result = read(); if (result.status === "failure") return { ok: false as const, reason: result.reason }; const pending = result.status === "valid" ? result.journal.operations.filter((op) => op.status !== "settled") : []; const start = Number.isInteger(offset) && offset >= 0 ? offset : 0; return { ok: true as const, observed: result.status === "valid", total: pending.length, operations: pending.slice(start, start + 8).map(({ id, tool, status }) => ({ id, tool, status })), nextOffset: start + 8 < pending.length ? start + 8 : null }; },
    uncertain(): boolean { const result = read(); return result.status === "failure" || result.status === "valid" && result.journal.operations.some((op) => op.status !== "settled"); },
    reconcileNativeSubagents(): Result<{ reconciled: number; active: number; uncertain: number; limit: number }> {
      const before = read(); if (before.status !== "valid") return { ok: false, reason: before.status === "failure" ? before.reason : "journal-unavailable" };
      const observed = (op: ContinuityOperation) => {
        if (op.runtime !== "pi" || op.tool !== "subagent" || op.status !== "uncertain" || op.reason !== "native-unavailable") return false;
        const call = evidence.readCall(op.nativeCallRef);
        const agent = call?.input && typeof call.input === "object" ? (call.input as { agent?: unknown }).agent : undefined;
        const content = call?.result && typeof call.result === "object" ? (call.result as { content?: unknown }).content : undefined;
        const statusLines = Array.isArray(content) ? content.flatMap((part) => part?.type === "text" && typeof part.text === "string"
          ? part.text.split(/\r?\n/).filter((line: string) => /^\s*status\s*:/.test(line)) : []) : [];
        return call?.tool === op.tool && call.inputDigest === op.inputDigest && call.terminal === "succeeded" && agent === "sdd-apply"
          && statusLines.length === 1 && /^\s*status\s*:\s*partial\s*$/.test(statusLines[0]!)
          && call.nativeOrder?.result !== undefined && call.nativeOrder.result > call.nativeOrder.call;
      };
      const candidates = before.journal.operations.filter(observed);
      const active = before.journal.operations.filter((op) => op.status === "running").length;
      const uncertain = before.journal.operations.filter((op) => op.status === "uncertain").length;
      const limit = OPERATION_LIMITS.active + (before.journal.extraActiveSlots ?? 0);
      if (!candidates.length) return { ok: true, value: { reconciled: 0, active, uncertain, limit } };
      const ids = new Set(candidates.map((op) => op.id));
      const written = transactContinuityOperations(cwd, before.journal.revision, (items) => items.map((op) => ids.has(op.id)
        ? { ...op, status: "settled" as const, outcome: "observed" as const, reason: "native-result-observed" } : op), {
        beforePublish() {
          if (candidates.some((op) => !observed(op))) throw new Error("native-result-stale");
        },
      });
      return written.ok ? { ok: true, value: { reconciled: candidates.length, active, uncertain: uncertain - candidates.length, limit } }
        : { ok: false, reason: written.reason };
    },
    grantActiveSlot(): OperationWrite {
      const before = read(); if (before.status !== "valid") return { ok: false, reason: before.status === "failure" ? before.reason : "journal-unavailable", outcome: "not-published" };
      const active = before.journal.operations.filter((op) => op.status === "running").length;
      const limit = OPERATION_LIMITS.active + (before.journal.extraActiveSlots ?? 0);
      if (active < limit) return { ok: false, reason: "grant-not-needed", outcome: "not-published" };
      return transactContinuityOperations(cwd, before.journal.revision, (items) => items, { grantActiveSlot: true });
    },
    begin(input: OperationStart): OperationWrite {
      const isolated = ensureOperationIsolation(cwd); if (!isolated.ok) return { ...isolated, outcome: "not-published" };
      const next = candidate(input);
      const result = update((items) => {
        const old = items.find((op) => op.id === next.id);
        if (old) {
          compatible(old, next);
          if (old.status !== "running") throw new Error("operation-terminal-conflict");
          if (old.admissionRef !== next.admissionRef) throw new Error("operation-attempt-conflict");
          return items;
        }
        return [...items, next];
      });
      if (result.ok && result.journal.operations.some((op) => op.id === next.id && op.status === "running")) admissions.set(next.id, next.admissionRef!);
      return result;
    },
    finish(input: OperationStart, outcome: "succeeded" | "observed" | "failed" | "unavailable"): OperationWrite {
      const next = candidate(input);
      const result = update((items) => {
        const old = items.find((op) => op.id === next.id);
        if (!old) return [...items, { ...next, beforeStateRef: null, status: "uncertain", reason: "missing-start", afterStateRef: stateRef() }];
        compatible(old, next); if (old.status === "settled") return items;
        if (old.status === "uncertain") { if (outcome === "succeeded" || outcome === "observed") throw new Error("operation-terminal-conflict"); return items; }
        const settled: ContinuityOperation = outcome === "succeeded" || outcome === "observed"
          ? { ...old, status: "settled", outcome, afterStateRef: stateRef() }
          : { ...old, status: "uncertain", reason: `native-${outcome}`, afterStateRef: stateRef() };
        return items.map((op) => op.id === old.id ? settled : op);
      });
      if (result.ok) admissions.delete(next.id);
      return result;
    },
    denied(input: OperationStart, guardId: string): OperationWrite {
      const next = candidate(input);
      const result = update((items) => {
        const old = items.find((op) => op.id === next.id); if (old) compatible(old, next);
        if (old?.status === "uncertain") throw new Error("operation-terminal-conflict");
        if (old?.status === "running" && (!old.admissionRef || old.admissionRef !== next.admissionRef)) throw new Error("operation-attempt-conflict");
        if (old?.status === "settled") { if (old.outcome !== "not-started") throw new Error("operation-terminal-conflict"); return items; }
        const denied: ContinuityOperation = { ...(old ?? next), status: "settled", outcome: "not-started", reason: `ein-guard:${guardId}` };
        return [...items.filter((op) => op.id !== next.id), denied];
      });
      if (result.ok) admissions.delete(next.id);
      return result;
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
      const preview = (value: unknown) => {
        const text = JSON.stringify(value) ?? "";
        return { text: isSafeCheckpointText(text, 64 * 1024 * 1024) ? text.slice(0, 2048) : "[sensitive content omitted]", truncated: text.length > 2048 };
      };
      const inspectedCall = call ? { ...call, input: preview(call.input), result: preview(call.result) } : undefined;
      return { ok: true, value: { operation, token: token(journal.journal.revision, ref, operation), stateRef: ref, call: inspectedCall } };
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
        if (assessment.kind === "local-attested" && requiresExternalContinuityProof(call)) return { ok: false, reason: "external-proof-required" };
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
          if (stateRef() !== ref || !currentCall || currentCall.tool !== old.tool || currentCall.inputDigest !== old.inputDigest
            || paths.some((path) => continuityEvidenceFile(cwd, path.path).digest !== path.digest)
            || refs.some((item) => evidence.readEvidence(item!.ref, currentCall)?.digest !== item!.digest)) throw new Error("inspection-stale");
        } });
        return written.ok ? { ok: true, value: resolved } : { ok: false, reason: written.reason };
      } catch { return { ok: false, reason: "evidence-unavailable" }; }
    },
  };
}
