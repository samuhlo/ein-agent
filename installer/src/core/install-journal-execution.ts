// =============================================================================
// INSTALL JOURNAL EXECUTION
// Coordina handlers, checkpoints, señales y lifecycle. La política decide los
// estados y persistencia decide cómo cruzan el filesystem.
// =============================================================================

import { randomUUID } from "node:crypto";
import {
  executeInstallPlan,
  type InstallPlanExecution,
  type InstallPlanExecutionContext,
  type InstallPlanExecutionHandlers,
  type InstallPlanProgress,
} from "./install-executor.ts";
import {
  InstallJournalError,
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import {
  classifyInstallJournalResume,
  completeInstallJournal,
  createPreparedInstallJournal,
  failInstallJournalEntry,
  interruptInstallJournal,
  markInstallJournalEntryCompleted,
  markInstallJournalEntryPending,
  type InstallJournalResumeKind,
} from "./install-journal-policy.ts";
import {
  inspectInstallJournal,
  publishInstallJournal,
} from "./install-journal-persistence.ts";
import {
  productionInstallJournalFs,
  type InstallJournalFs,
} from "./install-journal-store.ts";
import { validateInstallPlan, type InstallPlanV1 } from "./install-plan.ts";

export type InstallJournalLifecycle = Readonly<{
  rollback: (
    context: InstallPlanExecutionContext & { target: InstallPlanV1["target"] },
  ) => void;
  finalize: (
    context: InstallPlanExecutionContext & { target: InstallPlanV1["target"] },
  ) => void;
}>;

type InstallJournalExecutionOptions = Readonly<{
  fs?: InstallJournalFs;
  transactionId?: () => string;
  signals?: Pick<NodeJS.Process, "on" | "off">;
  progress?: InstallPlanProgress;
  lifecycle?: InstallJournalLifecycle;
}>;

type JournalRun = {
  journal: InstallExecutionJournalV1;
  writing: boolean;
  interrupted: boolean;
  failure?: InstallJournalError;
};

type OpenJournal = Readonly<{
  run: JournalRun;
  resuming: boolean;
  resumeKind: InstallJournalResumeKind | null;
}>;

function openJournal(
  plan: InstallPlanV1,
  fs: InstallJournalFs,
  options: InstallJournalExecutionOptions,
): OpenJournal {
  const existing = inspectInstallJournal(plan.home, fs);
  if (existing.status === "invalid") {
    throw new InstallJournalError("recovery-required");
  }
  if (existing.status === "valid" && existing.journal.state === "complete") {
    options.lifecycle?.finalize({
      transactionId: existing.journal.transactionId,
      target: existing.journal.target,
    });
  }

  const resuming = existing.status === "valid" && existing.journal.state !== "complete";
  const resumeKind = resuming
    ? classifyInstallJournalResume(existing.journal, plan)
    : null;
  if (resuming && !resumeKind) {
    throw new InstallJournalError("recovery-required");
  }

  const journal = resuming
    ? existing.journal
    : createPreparedInstallJournal(plan, (options.transactionId ?? randomUUID)());
  return {
    run: { journal, writing: false, interrupted: false },
    resuming,
    resumeKind,
  };
}

function persistRun(home: string, run: JournalRun, fs: InstallJournalFs): void {
  run.writing = true;
  try {
    publishInstallJournal(home, run.journal, fs);
  } finally {
    run.writing = false;
  }
}

function createJournaledHandlers(
  plan: InstallPlanV1,
  handlers: InstallPlanExecutionHandlers,
  opened: OpenJournal,
  persist: () => void,
): InstallPlanExecutionHandlers {
  const { run, resuming, resumeKind } = opened;
  return Object.fromEntries(plan.inventory.map((entry) => [entry.id, async () => {
    if (run.failure) return { ok: false };
    const current = run.journal.entries.find((item) => item.id === entry.id);
    if (!current) return handlers[entry.id]();
    if (current.status === "completed" && entry.id !== "shared.retire-legacy") {
      return { ok: true };
    }

    const retryingBackup = resumeKind === "pre-mutation-retry"
      && entry.id === "pi.backup-current"
      && current.status === "failed";
    const retryingRetirement = resumeKind === "retirement-retry"
      && entry.id === "shared.retire-legacy"
      && ["pending", "failed", "completed"].includes(current.status);
    if (
      resuming
      && !retryingBackup
      && !retryingRetirement
      && current.status !== "not-run"
    ) return { ok: false };

    const update = (status: "pending" | "completed"): void => {
      run.journal = status === "pending"
        ? markInstallJournalEntryPending(run.journal, entry.id)
        : markInstallJournalEntryCompleted(run.journal, entry.id);
      persist();
    };
    const fail = (detail?: string): void => {
      run.journal = failInstallJournalEntry(run.journal, entry.id, detail);
      try {
        persist();
      } catch {
        run.failure = new InstallJournalError("recovery-write-failed");
      }
    };

    try {
      update("pending");
    } catch {
      run.failure = new InstallJournalError("journal-write-failed");
      return { ok: false };
    }

    let result;
    try {
      result = await handlers[entry.id]({ transactionId: run.journal.transactionId });
    } catch {
      fail();
      return { ok: false };
    }
    if (run.failure) return { ok: false };
    if (!result.ok) {
      fail(result.detail);
    } else {
      try {
        update("completed");
      } catch {
        run.failure = new InstallJournalError("journal-write-failed");
        return { ok: false };
      }
    }
    return result;
  }])) as InstallPlanExecutionHandlers;
}

function createInterruptionHandler(
  run: JournalRun,
  persist: () => void,
): () => void {
  return () => {
    if (run.interrupted || run.journal.state === "complete") return;
    run.interrupted = true;
    if (run.writing) {
      run.failure = new InstallJournalError("recovery-write-failed");
      return;
    }

    run.journal = interruptInstallJournal(run.journal);
    try {
      persist();
      run.failure = new InstallJournalError("recovery-required");
    } catch {
      run.failure = new InstallJournalError("recovery-write-failed");
    }
  };
}

export async function executeInstallPlanJournaled(
  plan: InstallPlanV1,
  handlers: InstallPlanExecutionHandlers,
  options: InstallJournalExecutionOptions = {},
): Promise<InstallPlanExecution> {
  validateInstallPlan(plan);
  const fs = options.fs ?? productionInstallJournalFs;
  const opened = openJournal(plan, fs, options);
  const { run } = opened;
  const persist = (): void => persistRun(plan.home, run, fs);
  if (!opened.resuming) persist();

  const wrapped = createJournaledHandlers(plan, handlers, opened, persist);
  const interrupted = createInterruptionHandler(run, persist);
  const signals = options.signals ?? process;
  signals.on("SIGINT", interrupted);
  signals.on("SIGTERM", interrupted);

  let globallyCommitted = false;
  let rollbackAttempted = false;
  const rollback = (): void => {
    rollbackAttempted = true;
    options.lifecycle?.rollback({
      transactionId: run.journal.transactionId,
      target: run.journal.target,
    });
  };

  try {
    const result = await executeInstallPlan(plan, wrapped, options.progress);
    if (run.failure) throw run.failure;
    if (!result.ok) {
      rollback();
      return result;
    }

    run.journal = completeInstallJournal(run.journal);
    persist();
    globallyCommitted = true;
    options.lifecycle?.finalize({
      transactionId: run.journal.transactionId,
      target: run.journal.target,
    });
    return result;
  } catch (error) {
    if (!globallyCommitted && !rollbackAttempted) rollback();
    throw error;
  } finally {
    signals.off("SIGINT", interrupted);
    signals.off("SIGTERM", interrupted);
  }
}
