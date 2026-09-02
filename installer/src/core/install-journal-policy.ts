// =============================================================================
// INSTALL JOURNAL POLICY
// Decide qué diario puede continuar y deriva estados nuevos sin tocar disco,
// ejecutar handlers ni conocer señales del proceso.
// =============================================================================

import { validateInstallJournal } from "./install-journal-codec.ts";
import {
  installJournalMatchesPlan,
  installPlanDigest,
  InstallJournalError,
  isValidInstallFailureDetail,
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import {
  validateInstallPlan,
  type InstallPlanEntryId,
  type InstallPlanV1,
} from "./install-plan.ts";

export type InstallJournalResumeKind =
  | "pre-mutation-retry"
  | "post-verification-restart"
  | "retirement-retry";

function selectedEntries(plan: InstallPlanV1) {
  return plan.inventory.filter(
    (entry) => entry.state === "selected" || entry.state === "conditional",
  );
}

function supportsPreMutationRetry(
  journal: InstallExecutionJournalV1,
  plan: InstallPlanV1,
): boolean {
  if (
    journal.target !== "both"
    || journal.state !== "recovery-required"
    || journal.recoveryCode !== "handler-failed"
    || journal.pendingEntryId !== "pi.backup-current"
  ) return false;

  const selected = selectedEntries(plan);
  const entries = new Map(journal.entries.map((entry) => [entry.id, entry]));
  if (selected.length !== journal.entries.length || selected.some(({ id }) => !entries.has(id))) {
    return false;
  }

  const backupIndex = plan.inventory.findIndex(({ id }) => id === "pi.backup-current");
  const backup = entries.get("pi.backup-current");
  if (!backup || backup.status !== "failed" || backupIndex < 0) return false;

  const sharedAndClaude = journal.entries.filter(
    ({ runtime, id }) => runtime === "claude"
      || runtime === "shared" && id !== "shared.retire-legacy",
  );
  if (sharedAndClaude.some(({ status }) => status !== "completed")) return false;
  if (entries.get("shared.retire-legacy")?.status !== "not-run") return false;

  return journal.entries
    .filter(({ runtime }) => runtime === "pi")
    .every((entry) => {
      const order = plan.inventory.findIndex(({ id }) => id === entry.id);
      if (order === backupIndex) return entry.status === "failed";
      if (order < backupIndex) {
        return plan.inventory[order]?.action === "ensure-dependency"
          && entry.status === "completed";
      }
      return entry.status === "not-run";
    });
}

function supportsRetirementRetry(
  journal: InstallExecutionJournalV1,
): boolean {
  if (!["executing", "recovery-required"].includes(journal.state)) return false;
  const cleanup = journal.entries.find(({ id }) => id === "shared.retire-legacy");
  if (!cleanup || !["pending", "failed", "completed"].includes(cleanup.status)) return false;
  if (journal.entries.some((entry) => entry.id !== cleanup.id && entry.status !== "completed")) {
    return false;
  }
  return cleanup.status === "completed"
    ? journal.pendingEntryId === undefined
    : journal.pendingEntryId === cleanup.id;
}

function supportsPostVerificationRestart(
  journal: InstallExecutionJournalV1,
  plan: InstallPlanV1,
): boolean {
  if (
    journal.target !== "pi"
    || plan.target !== "pi"
    || journal.platform.os !== plan.platform.os
    || journal.platform.arch !== plan.platform.arch
    || journal.state !== "recovery-required"
    || journal.recoveryCode !== "handler-failed"
    || journal.pendingEntryId !== "pi.verify-doctor"
  ) return false;

  // The fresh observation must prove that the failed deployment wrote a valid
  // Ein marker. An unmarked existing tree is blocked by the planner and an
  // absent target keeps the backup reason below, so neither can be adopted.
  const backup = plan.inventory.find(({ id }) => id === "pi.backup-current");
  if (
    plan.status !== "ready"
    || backup?.ownership !== "installer"
    || backup.reason !== "existing target is snapshotted before deploy"
  ) return false;

  const verifyIndex = journal.entries.findIndex(({ id }) => id === "pi.verify-doctor");
  if (verifyIndex < 0 || journal.entries[verifyIndex]?.status !== "failed") return false;
  return journal.entries.every((entry, index) => index < verifyIndex
    ? entry.status === "completed"
    : index === verifyIndex
      ? entry.status === "failed"
      : entry.status === "not-run");
}

export function classifyInstallJournalResume(
  journal: InstallExecutionJournalV1,
  plan: InstallPlanV1,
): InstallJournalResumeKind | null {
  try {
    validateInstallPlan(plan);
    validateInstallJournal(journal);
    if (plan.status !== "ready") return null;
    if (supportsPostVerificationRestart(journal, plan)) return "post-verification-restart";
    if (!installJournalMatchesPlan(journal, plan)) return null;
    if (supportsPreMutationRetry(journal, plan)) return "pre-mutation-retry";
    return supportsRetirementRetry(journal) ? "retirement-retry" : null;
  } catch {
    return null;
  }
}

function validJournal(journal: InstallExecutionJournalV1): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  return journal;
}

function entryIndex(journal: InstallExecutionJournalV1, id: InstallPlanEntryId): number {
  const index = journal.entries.findIndex((entry) => entry.id === id);
  if (index < 0) throw new InstallJournalError("recovery-required");
  return index;
}

export function createPreparedInstallJournal(
  plan: InstallPlanV1,
  transactionId: string,
): InstallExecutionJournalV1 {
  validateInstallPlan(plan);
  return validJournal({
    schemaVersion: 1,
    transactionId,
    planDigest: installPlanDigest(plan),
    target: plan.target,
    platform: plan.platform,
    state: "prepared",
    entries: selectedEntries(plan).map(({ id, runtime }) => ({
      id,
      runtime,
      status: "not-run",
    })),
  });
}

export function markInstallJournalEntryPending(
  journal: InstallExecutionJournalV1,
  id: InstallPlanEntryId,
): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  const index = entryIndex(journal, id);
  const current = journal.entries[index]!;
  // GUARD -> La retirada final admite los mismos estados que su clasificador:
  // interrumpida deja el checkpoint en `pending` y aun así debe poder reanudarse.
  const retryable = current.status === "failed"
    && (id === "pi.backup-current" || id === "shared.retire-legacy")
    || ["pending", "completed"].includes(current.status)
    && id === "shared.retire-legacy";
  if (current.status !== "not-run" && !retryable) {
    throw new InstallJournalError("recovery-required");
  }

  const entries = journal.entries.map((entry, at) => at === index
    ? { ...entry, status: "pending" as const }
    : entry);
  const { pendingEntryId: _pending, ...base } = journal;
  return validJournal({
    ...base,
    entries,
    state: journal.state === "recovery-required" ? "recovery-required" : "executing",
    pendingEntryId: id,
  });
}

export function markInstallJournalEntryCompleted(
  journal: InstallExecutionJournalV1,
  id: InstallPlanEntryId,
): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  const index = entryIndex(journal, id);
  if (journal.entries[index]?.status !== "pending") {
    throw new InstallJournalError("recovery-required");
  }

  const entries = journal.entries.map((entry, at) => {
    if (at !== index) return entry;
    const { detail: _detail, ...completed } = entry;
    return { ...completed, status: "completed" as const };
  });
  const problem = entries.find(
    (entry) => entry.status === "failed" || entry.status === "pending",
  );
  const { pendingEntryId: _pending, recoveryCode: _recovery, ...base } = journal;
  return validJournal({
    ...base,
    entries,
    state: problem ? journal.state : "executing",
    ...(problem ? { pendingEntryId: problem.id } : {}),
    ...(problem && journal.recoveryCode ? { recoveryCode: journal.recoveryCode } : {}),
  });
}

export function failInstallJournalEntry(
  journal: InstallExecutionJournalV1,
  id: InstallPlanEntryId,
  detail?: string,
): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  const index = entryIndex(journal, id);
  if (journal.entries[index]?.status !== "pending") {
    throw new InstallJournalError("recovery-required");
  }

  const existingDetail = journal.entries[index]?.detail;
  const nextDetail = id === "pi.backup-current"
    && (isValidInstallFailureDetail(detail) ? detail : existingDetail);
  const entries = journal.entries.map((entry, at) => at === index
    ? {
        ...entry,
        status: "failed" as const,
        ...(nextDetail ? { detail: nextDetail } : {}),
      }
    : entry);
  return validJournal({
    ...journal,
    entries,
    state: "recovery-required",
    pendingEntryId: id,
    recoveryCode: "handler-failed",
  });
}

export function interruptInstallJournal(
  journal: InstallExecutionJournalV1,
): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  return validJournal({
    ...journal,
    state: "recovery-required",
    recoveryCode: "interrupted",
  });
}

export function completeInstallJournal(
  journal: InstallExecutionJournalV1,
): InstallExecutionJournalV1 {
  validateInstallJournal(journal);
  const { pendingEntryId: _pending, recoveryCode: _recovery, ...base } = journal;
  return validJournal({ ...base, state: "complete" });
}
