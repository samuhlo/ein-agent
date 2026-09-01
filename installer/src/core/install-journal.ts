import { randomUUID } from "node:crypto";
import { executeInstallPlan, type InstallPlanExecution, type InstallPlanExecutionContext, type InstallPlanExecutionHandlers, type InstallPlanProgress } from "./install-executor.ts";
import {
  InstallJournalError,
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import {
  encodeInstallJournal,
  parseInstallJournal,
  validateInstallJournal,
} from "./install-journal-codec.ts";
import {
  classifyInstallJournalResume,
  completeInstallJournal,
  createPreparedInstallJournal,
  failInstallJournalEntry,
  interruptInstallJournal,
  markInstallJournalEntryCompleted,
  markInstallJournalEntryPending,
} from "./install-journal-policy.ts";
import {
  inspectStoredInstallJournal,
  productionInstallJournalFs,
  publishStoredInstallJournal,
  type InstallJournalFs,
} from "./install-journal-store.ts";
import { validateInstallPlan, type InstallPlanV1 } from "./install-plan.ts";

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
  const resumeKind = resuming ? classifyInstallJournalResume(existing.journal, plan) : null;
  if (resuming && !resumeKind) throw new InstallJournalError("recovery-required");
  let journal: InstallExecutionJournalV1 = resuming
    ? existing.journal
    : createPreparedInstallJournal(plan, (options.transactionId ?? randomUUID)());
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
    const retryingBackup = resumeKind === "pre-mutation-retry" && entry.id === "pi.backup-current" && current.status === "failed";
    const retryingRetirement = resumeKind === "retirement-retry" && entry.id === "shared.retire-legacy" && ["pending", "failed", "completed"].includes(current.status);
    if (resuming && !retryingBackup && !retryingRetirement && current.status !== "not-run") return { ok: false };
    const update = (status: "pending" | "completed"): void => {
      journal = status === "pending"
        ? markInstallJournalEntryPending(journal, entry.id)
        : markInstallJournalEntryCompleted(journal, entry.id);
      persist();
    };
    const fail = (detail?: string): void => {
      journal = failInstallJournalEntry(journal, entry.id, detail);
      try { persist(); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); }
    };
    try { update("pending"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; }
    let result;
    try { result = await handlers[entry.id]({ transactionId: journal.transactionId }); } catch { fail(); return { ok: false }; }
    if (journalFailure) return { ok: false };
    if (!result.ok) fail(result.detail); else try { update("completed"); } catch { journalFailure = new InstallJournalError("journal-write-failed"); return { ok: false }; }
    return result;
  }])) as InstallPlanExecutionHandlers;
  const interrupted = (): void => { if (interruptedOnce || journal.state === "complete") return; interruptedOnce = true; if (writing) { journalFailure = new InstallJournalError("recovery-write-failed"); return; } journal = interruptInstallJournal(journal); try { persist(); journalFailure = new InstallJournalError("recovery-required"); } catch { journalFailure = new InstallJournalError("recovery-write-failed"); } };
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
    journal = completeInstallJournal(journal);
    persist();
    globallyCommitted = true;
    options.lifecycle?.finalize({ transactionId: journal.transactionId, target: journal.target });
    return result;
  } catch (error) {
    if (!globallyCommitted && !rolledBack) options.lifecycle?.rollback({ transactionId: journal.transactionId, target: journal.target });
    throw error;
  } finally { signals.off("SIGINT", interrupted); signals.off("SIGTERM", interrupted); }
}
