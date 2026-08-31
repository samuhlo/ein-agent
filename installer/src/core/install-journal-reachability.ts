import {
  type InstallExecutionJournalV1,
} from "./install-journal-contract.ts";
import { type InstallPlanRuntime } from "./install-plan.ts";

const SEGMENT_ORDER: readonly InstallPlanRuntime[] = ["shared", "pi", "claude"];
const RECOVERY_CODES = ["handler-failed", "interrupted"] as const;
const RECOVERY_SEQUENCE = /^(completed,)*((failed|pending),)?(not-run,)*$/;
const EXECUTING_SEQUENCE = /^(completed,)*(pending,)?(not-run,)*$/;

type JournalFieldPresence = Readonly<{
  pendingEntryId: boolean;
  recoveryCode: boolean;
}>;

type JournalValidationFacts = Readonly<{
  completed: number;
  failed: number;
  pending: number;
  pointsAtProblem: boolean;
  recoveryReachable: boolean;
  executingReachable: boolean;
}>;

function statusSequence(entries: InstallExecutionJournalV1["entries"]): string {
  const statuses = entries.map(({ status }) => status).join(",");
  return entries.length > 0 ? `${statuses},` : "";
}

function deriveValidationFacts(
  journal: InstallExecutionJournalV1,
): JournalValidationFacts {
  const segment = (runtime: InstallPlanRuntime) => journal.entries.filter((entry) => entry.runtime === runtime);
  const shared = segment("shared");
  const bootstrapShared = shared.filter(({ id }) => id !== "shared.retire-legacy");
  const cleanup = shared.find(({ id }) => id === "shared.retire-legacy");
  const pi = segment("pi");
  const claude = segment("claude");
  const pending = journal.entries.filter(({ status }) => status === "pending").length;
  const failed = journal.entries.filter(({ status }) => status === "failed").length;
  const completed = journal.entries.filter(({ status }) => status === "completed").length;
  const pointsAtProblem = journal.pendingEntryId !== undefined && journal.entries.some(
    (entry) => entry.id === journal.pendingEntryId && (entry.status === "pending" || entry.status === "failed"),
  );

  const segmentsReachable = SEGMENT_ORDER.every((runtime) => RECOVERY_SEQUENCE.test(statusSequence(segment(runtime))));
  const sharedTerminal = bootstrapShared.some(({ status }) => status === "failed" || status === "pending");
  const claudeStarted = claude.some(({ status }) => status !== "not-run");
  const backupPending = pi.some(({ id, status }) => id === "pi.backup-current" && status === "pending");
  const cleanupRecovery = cleanup !== undefined
    && ["failed", "pending"].includes(cleanup.status)
    && [...bootstrapShared, ...pi, ...claude].every(({ status }) => status === "completed");
  const earlierRuntimeStateAllowsRecovery = !sharedTerminal
    || [...pi, ...claude].every(({ status }) => status === "not-run");
  const piStateAllowsClaude = pi.length === 0
    || pi.every(({ status }) => status === "completed")
    || pi.some(({ status }) => status === "failed")
    || backupPending;
  const claudeStateReachable = !claudeStarted || (
    bootstrapShared.every(({ status }) => status === "completed")
    && piStateAllowsClaude
    && (!pi.some(({ status }) => status === "pending") || backupPending)
  );
  const recoveryReachable = segmentsReachable
    && pending <= 1
    && failed + pending > 0
    && (cleanupRecovery || earlierRuntimeStateAllowsRecovery && claudeStateReachable);

  const standardExecuting = EXECUTING_SEQUENCE.test(statusSequence(journal.entries));
  const resumedExecuting = bootstrapShared.every(({ status }) => status === "completed")
    && cleanup?.status === "not-run"
    && claude.length > 0
    && claude.every(({ status }) => status === "completed")
    && EXECUTING_SEQUENCE.test(statusSequence(pi));

  return {
    completed,
    failed,
    pending,
    pointsAtProblem,
    recoveryReachable,
    executingReachable: standardExecuting || resumedExecuting,
  };
}

// FAIL CLOSED -> Sólo un historial alcanzable puede autorizar nuevas mutaciones.
export function isInstallJournalStateReachable(
  journal: InstallExecutionJournalV1,
  fields: JournalFieldPresence,
): boolean {
  const facts = deriveValidationFacts(journal);
  if (journal.state === "prepared") {
    return facts.completed === 0 && facts.pending === 0 && facts.failed === 0
      && !fields.pendingEntryId && !fields.recoveryCode;
  }
  if (journal.state === "complete") {
    return facts.completed === journal.entries.length && facts.pending === 0 && facts.failed === 0
      && !fields.pendingEntryId && !fields.recoveryCode;
  }
  if (journal.state === "executing") {
    return facts.failed === 0
      && facts.pending <= 1
      && !fields.recoveryCode
      && (facts.pending === 0 ? !fields.pendingEntryId : facts.pointsAtProblem)
      && facts.executingReachable;
  }
  return facts.recoveryReachable
    && RECOVERY_CODES.includes(journal.recoveryCode as typeof RECOVERY_CODES[number])
    && (journal.recoveryCode === "handler-failed" ? facts.failed > 0 || facts.pending > 0 : facts.pending > 0)
    && facts.pointsAtProblem;
}
