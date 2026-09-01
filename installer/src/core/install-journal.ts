import { randomUUID } from "node:crypto";
import { executeInstallPlan, type InstallPlanExecution, type InstallPlanExecutionContext, type InstallPlanExecutionHandlers, type InstallPlanProgress } from "./install-executor.ts";
import {
  installJournalMatchesPlan,
  installPlanDigest,
  InstallJournalError,
  isValidInstallFailureDetail as validFailureDetail,
  type InstallExecutionJournalV1,
  type InstallJournalEntryState,
  type InstallJournalState,
} from "./install-journal-contract.ts";
import {
  encodeInstallJournal,
  parseInstallJournal,
  validateInstallJournal,
} from "./install-journal-codec.ts";
import {
  inspectStoredInstallJournal,
  productionInstallJournalFs,
  publishStoredInstallJournal,
  type InstallJournalFs,
} from "./install-journal-store.ts";
import { INSTALL_PLAN_ENTRY_CONTRACTS, INSTALL_PLAN_ENTRY_IDS, validateInstallPlan, type InstallPlanV1 } from "./install-plan.ts";

export { installJournalPath } from "./install-journal-store.ts";
export type { InstallJournalFs } from "./install-journal-store.ts";
export { validateInstallJournal } from "./install-journal-codec.ts";
export {
  installJournalMatchesPlan,
  installPlanDigest,
  InstallJournalError,
  type InstallExecutionJournalV1,
  type InstallJournalEntryState,
  type InstallJournalState,
} from "./install-journal-contract.ts";

export type InstallJournalLifecycle = Readonly<{
  rollback: (context: InstallPlanExecutionContext & { target: InstallPlanV1["target"] }) => void;
  finalize: (context: InstallPlanExecutionContext & { target: InstallPlanV1["target"] }) => void;
}>;

const supportsPreMutationRetry = (journal: InstallExecutionJournalV1, plan: InstallPlanV1): boolean => {
  if (!installJournalMatchesPlan(journal, plan) || journal.target !== "both" || journal.state !== "recovery-required" || journal.recoveryCode !== "handler-failed" || journal.pendingEntryId !== "pi.backup-current") return false;
  const selected = plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional").map(({ id }) => id), entries = new Map(journal.entries.map((entry) => [entry.id, entry]));
  if (selected.length !== journal.entries.length || selected.some((id) => !entries.has(id))) return false;
  const backupOrder = INSTALL_PLAN_ENTRY_IDS.indexOf("pi.backup-current"), backup = entries.get("pi.backup-current"), shared = journal.entries.filter(({ runtime, id }) => runtime === "shared" && id !== "shared.retire-legacy"), cleanup = entries.get("shared.retire-legacy"), pi = journal.entries.filter(({ runtime }) => runtime === "pi"), claude = journal.entries.filter(({ runtime }) => runtime === "claude");
  if (!backup || backup.status !== "failed" || shared.some(({ status }) => status !== "completed") || claude.some(({ status }) => status !== "completed")) return false;
  return cleanup?.status === "not-run" && pi.every((entry) => { const order = INSTALL_PLAN_ENTRY_IDS.indexOf(entry.id); return order === backupOrder ? entry.status === "failed" : order < backupOrder ? INSTALL_PLAN_ENTRY_CONTRACTS[entry.id][1] === "ensure-dependency" && entry.status === "completed" : entry.status === "not-run"; });
};

const supportsRetirementRetry = (journal: InstallExecutionJournalV1, plan: InstallPlanV1): boolean => {
  if (!installJournalMatchesPlan(journal, plan) || !["executing", "recovery-required"].includes(journal.state)) return false;
  const cleanup = journal.entries.find(({ id }) => id === "shared.retire-legacy");
  if (!cleanup || !["pending", "failed", "completed"].includes(cleanup.status)) return false;
  if (journal.entries.some((entry) => entry.id !== cleanup.id && entry.status !== "completed")) return false;
  return cleanup.status === "completed" ? journal.pendingEntryId === undefined : journal.pendingEntryId === cleanup.id;
};

export function inspectInstallJournal(home: string, fs: InstallJournalFs = productionInstallJournalFs): { status: "missing" } | { status: "valid"; journal: InstallExecutionJournalV1 } | { status: "invalid" } {
  const stored = inspectStoredInstallJournal(home, fs);
  if (stored.status !== "available") return stored;
  try {
    return { status: "valid", journal: parseInstallJournal(stored.bytes) };
  } catch {
    return { status: "invalid" };
  }
}

function publish(home: string, journal: InstallExecutionJournalV1, fs: InstallJournalFs): void {
  validateInstallJournal(journal);
  try {
    publishStoredInstallJournal(home, journal.transactionId, encodeInstallJournal(journal), fs);
  } catch {
    throw new InstallJournalError("journal-write-failed");
  }
}

export async function executeInstallPlanJournaled(plan: InstallPlanV1, handlers: InstallPlanExecutionHandlers, options: { fs?: InstallJournalFs; transactionId?: () => string; signals?: Pick<NodeJS.Process, "on" | "off">; progress?: InstallPlanProgress; lifecycle?: InstallJournalLifecycle } = {}): Promise<InstallPlanExecution> {
  validateInstallPlan(plan); const fs = options.fs ?? productionInstallJournalFs, home = plan.home;
  const existing = inspectInstallJournal(home, fs);
  if (existing.status === "invalid") throw new InstallJournalError("recovery-required");
  if (existing.status === "valid" && existing.journal.state === "complete") options.lifecycle?.finalize({ transactionId: existing.journal.transactionId, target: existing.journal.target });
  const resuming = existing.status === "valid" && existing.journal.state !== "complete";
  if (resuming && !supportsPreMutationRetry(existing.journal, plan) && !supportsRetirementRetry(existing.journal, plan)) throw new InstallJournalError("recovery-required");
  let journal: InstallExecutionJournalV1 = resuming ? existing.journal : { schemaVersion: 1, transactionId: (options.transactionId ?? randomUUID)(), planDigest: installPlanDigest(plan), target: plan.target, platform: plan.platform, state: "prepared", entries: plan.inventory.filter((entry) => entry.state === "selected" || entry.state === "conditional").map(({ id, runtime }) => ({ id, runtime, status: "not-run" })) };
  let writing = false, interruptedOnce = false, journalFailure: InstallJournalError | undefined;
  const persist = (): void => { writing = true; try { publish(home, journal, fs); } finally { writing = false; } };
  if (!resuming) persist();
  const wrapped = Object.fromEntries(plan.inventory.map((entry) => [entry.id, async () => {
    if (journalFailure) return { ok: false };
    const index = journal.entries.findIndex(({ id }) => id === entry.id);
    if (index < 0) return handlers[entry.id]();
    const current = journal.entries[index];
    if (!current) return { ok: false };
    if (current.status === "completed" && entry.id !== "shared.retire-legacy") return { ok: true };
    const retryingBackup = resuming && entry.id === "pi.backup-current" && current.status === "failed";
    const retryingRetirement = resuming && entry.id === "shared.retire-legacy" && ["pending", "failed", "completed"].includes(current.status);
    if (resuming && !retryingBackup && !retryingRetirement && current.status !== "not-run") return { ok: false };
    const update = (status: InstallJournalEntryState): void => {
      const entries = journal.entries.map((item, at) => {
        if (at !== index) return item;
        const updated = { ...item, status };
        if (status === "completed") { const { detail: _, ...withoutDetail } = updated; return withoutDetail; }
        return updated;
      });
      const { pendingEntryId: _, ...withoutPending } = journal;
      let base = withoutPending;
      if (status === "completed" && entry.id === "pi.backup-current") { const { recoveryCode: __, ...withoutRecovery } = base; base = withoutRecovery; }
      const failed = entries.find((item) => item.status === "failed")?.id, nextPending = status === "pending" ? entry.id : failed;
      journal = { ...base, entries, state: status === "completed" && entry.id === "pi.backup-current" ? "executing" : journal.state === "recovery-required" ? "recovery-required" : "executing", ...(nextPending ? { pendingEntryId: nextPending } : {}) };
      persist();
    };
    const fail = (detail?: string): void => {
      const existingDetail = journal.entries[index]?.detail, nextDetail = entry.id === "pi.backup-current" && (validFailureDetail(detail) ? detail : existingDetail);
      journal = { ...journal, state: "recovery-required", pendingEntryId: entry.id, recoveryCode: "handler-failed", entries: journal.entries.map((item, at) => at === index ? { ...item, status: "failed", ...(nextDetail ? { detail: nextDetail } : {}) } : item) };
      try { persist(); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); }
    };
    try { update("pending"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; }
    let result;
    try { result = await handlers[entry.id]({ transactionId: journal.transactionId }); } catch { fail(); return { ok: false }; }
    if (journalFailure) return { ok: false };
    if (!result.ok) fail(result.detail); else try { update("completed"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; }
    return result;
  }])) as InstallPlanExecutionHandlers;
  const interrupted = (): void => { if (interruptedOnce || journal.state === "complete") return; interruptedOnce = true; if (writing) { journalFailure = new InstallJournalError("recovery-write-failed"); return; } journal = { ...journal, state: "recovery-required", recoveryCode: "interrupted" }; try { persist(); journalFailure = new InstallJournalError("recovery-required"); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); } };
  const signals = options.signals ?? process; signals.on("SIGINT", interrupted); signals.on("SIGTERM", interrupted);
  let globallyCommitted = false, rolledBack = false;
  try {
    const result = await executeInstallPlan(plan, wrapped, options.progress);
    if (journalFailure) throw journalFailure;
    if (!result.ok) {
      options.lifecycle?.rollback({ transactionId: journal.transactionId, target: journal.target });
      rolledBack = true;
      return result;
    }
    journal = { ...journal, state: "complete" };
    persist();
    globallyCommitted = true;
    options.lifecycle?.finalize({ transactionId: journal.transactionId, target: journal.target });
    return result;
  } catch (error) {
    if (!globallyCommitted && !rolledBack) options.lifecycle?.rollback({ transactionId: journal.transactionId, target: journal.target });
    throw error;
  } finally { signals.off("SIGINT", interrupted); signals.off("SIGTERM", interrupted); }
}
