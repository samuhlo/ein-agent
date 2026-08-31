import { randomUUID } from "node:crypto";
import { isProxy } from "node:util/types";
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
  inspectStoredInstallJournal,
  productionInstallJournalFs,
  publishStoredInstallJournal,
  type InstallJournalFs,
} from "./install-journal-store.ts";
import { INSTALL_PLAN_ENTRY_CONTRACTS, INSTALL_PLAN_ENTRY_IDS, validateInstallPlan, type InstallPlanEntryId, type InstallPlanRuntime, type InstallPlanV1 } from "./install-plan.ts";

export { installJournalPath } from "./install-journal-store.ts";
export type { InstallJournalFs } from "./install-journal-store.ts";
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

const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || isProxy(value)) return false;
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Reflect.ownKeys(descriptors).length === keys.length
      && keys.every((key) => {
        const item = descriptors[key];
        return item?.enumerable && "value" in item;
      });
  } catch {
    return false;
  }
};

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

const JOURNAL_TARGETS = ["pi", "claude", "both"] as const;
const JOURNAL_STATES: readonly InstallJournalState[] = ["prepared", "executing", "recovery-required", "complete"];
const ENTRY_STATES: readonly InstallJournalEntryState[] = ["not-run", "pending", "completed", "failed"];
const SEGMENT_ORDER: readonly InstallPlanRuntime[] = ["shared", "pi", "claude"];
const RECOVERY_CODES = ["handler-failed", "interrupted"] as const;
const RECOVERY_SEQUENCE = /^(completed,)*((failed|pending),)?(not-run,)*$/;
const EXECUTING_SEQUENCE = /^(completed,)*(pending,)?(not-run,)*$/;

type JournalEnvelope = Record<string, unknown> & {
  schemaVersion: 1;
  transactionId: string;
  planDigest: string;
  target: InstallPlanV1["target"];
  platform: InstallPlanV1["platform"];
  state: InstallJournalState;
  entries: unknown[];
};

type JournalValidationFacts = Readonly<{
  completed: number;
  failed: number;
  pending: number;
  pointsAtProblem: boolean;
  recoveryReachable: boolean;
  executingReachable: boolean;
}>;

function rejectJournal(): never {
  throw new InstallJournalError("recovery-required");
}

function isDenseDataArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
    && value.length > 0
    && !isProxy(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && Object.keys(value).length === value.length
    && Object.entries(Object.getOwnPropertyDescriptors(value)).every(
      ([key, item]) => key === "length" || item.enumerable && "value" in item,
    );
}

function isJournalEnvelope(value: unknown): value is JournalEnvelope {
  if (!value || typeof value !== "object" || isProxy(value)) return false;
  const own = Object.getOwnPropertyDescriptors(value);
  const optional = own.pendingEntryId ? ["pendingEntryId"] : [];
  const recovery = own.recoveryCode ? ["recoveryCode"] : [];
  if (!exact(value, ["schemaVersion", "transactionId", "planDigest", "target", "platform", "state", "entries", ...optional, ...recovery])) return false;
  return value.schemaVersion === 1
    && typeof value.transactionId === "string"
    && /^[0-9a-f-]{16,64}$/.test(value.transactionId)
    && typeof value.planDigest === "string"
    && /^[0-9a-f]{64}$/.test(value.planDigest)
    && JOURNAL_TARGETS.includes(value.target as InstallPlanV1["target"])
    && JOURNAL_STATES.includes(value.state as InstallJournalState)
    && exact(value.platform, ["os", "arch"])
    && ["darwin", "linux"].includes(value.platform.os as string)
    && ["arm64", "x64"].includes(value.platform.arch as string)
    && isDenseDataArray(value.entries);
}

function allowedRuntime(target: InstallPlanV1["target"], runtime: unknown): boolean {
  return runtime === "shared"
    || target !== "claude" && runtime === "pi"
    || target !== "pi" && runtime === "claude";
}

function validateEntries(
  entries: readonly unknown[],
  target: InstallPlanV1["target"],
): InstallExecutionJournalV1["entries"] {
  const ids = new Set<string>();
  let previous = -1;
  const validated: InstallExecutionJournalV1["entries"][number][] = [];

  for (const entry of entries) {
    const own = entry && typeof entry === "object" && !isProxy(entry)
      ? Object.getOwnPropertyDescriptors(entry)
      : {};
    const detail = own.detail ? ["detail"] : [];
    const id = own.id && "value" in own.id ? own.id.value : undefined;
    const order = typeof id === "string" ? INSTALL_PLAN_ENTRY_IDS.indexOf(id as InstallPlanEntryId) : -1;
    const expectedRuntime = order >= 0 ? INSTALL_PLAN_ENTRY_CONTRACTS[id as InstallPlanEntryId][0] : undefined;

    if (!exact(entry, ["id", "runtime", "status", ...detail])) rejectJournal();
    if (order <= previous || ids.has(entry.id as string)) rejectJournal();
    if (entry.runtime !== expectedRuntime || !allowedRuntime(target, entry.runtime)) rejectJournal();
    if (!ENTRY_STATES.includes(entry.status as InstallJournalEntryState)) rejectJournal();
    if (own.detail && (
      entry.id !== "pi.backup-current"
      || !["failed", "pending"].includes(entry.status as string)
      || !validFailureDetail(entry.detail)
    )) rejectJournal();

    previous = order;
    ids.add(entry.id as string);
    validated.push(entry as InstallExecutionJournalV1["entries"][number]);
  }
  return validated;
}

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

function stateIsCoherent(
  journal: InstallExecutionJournalV1,
  own: PropertyDescriptorMap,
  facts: JournalValidationFacts,
): boolean {
  if (journal.state === "prepared") {
    return facts.completed === 0 && facts.pending === 0 && facts.failed === 0
      && !own.pendingEntryId && !own.recoveryCode;
  }
  if (journal.state === "complete") {
    return facts.completed === journal.entries.length && facts.pending === 0 && facts.failed === 0
      && !own.pendingEntryId && !own.recoveryCode;
  }
  if (journal.state === "executing") {
    return facts.failed === 0
      && facts.pending <= 1
      && !own.recoveryCode
      && (facts.pending === 0 ? !own.pendingEntryId : facts.pointsAtProblem)
      && facts.executingReachable;
  }
  return facts.recoveryReachable
    && RECOVERY_CODES.includes(journal.recoveryCode as typeof RECOVERY_CODES[number])
    && (journal.recoveryCode === "handler-failed" ? facts.failed > 0 || facts.pending > 0 : facts.pending > 0)
    && facts.pointsAtProblem;
}

// FAIL CLOSED -> este fichero autoriza reanudar mutaciones. Cada forma dudosa
// se rechaza antes de que el ejecutor pueda interpretar el estado.
export function validateInstallJournal(value: unknown): asserts value is InstallExecutionJournalV1 {
  if (!isJournalEnvelope(value)) rejectJournal();
  const entries = validateEntries(value.entries, value.target);
  const journal = { ...value, entries } as InstallExecutionJournalV1;
  if (!stateIsCoherent(journal, Object.getOwnPropertyDescriptors(value), deriveValidationFacts(journal))) rejectJournal();
}

const encodeJournal = (value: InstallExecutionJournalV1): Uint8Array =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

function parseJournal(bytes: Uint8Array): InstallExecutionJournalV1 {
  try {
    const text = new TextDecoder().decode(bytes);
    const value: unknown = JSON.parse(text);
    validateInstallJournal(value);
    if (text !== new TextDecoder().decode(encodeJournal(value))) throw new Error("non-canonical journal");
    return value;
  } catch {
    throw new InstallJournalError("recovery-required");
  }
}

export function inspectInstallJournal(home: string, fs: InstallJournalFs = productionInstallJournalFs): { status: "missing" } | { status: "valid"; journal: InstallExecutionJournalV1 } | { status: "invalid" } {
  const stored = inspectStoredInstallJournal(home, fs);
  if (stored.status !== "available") return stored;
  try {
    return { status: "valid", journal: parseJournal(stored.bytes) };
  } catch {
    return { status: "invalid" };
  }
}

function publish(home: string, journal: InstallExecutionJournalV1, fs: InstallJournalFs): void {
  validateInstallJournal(journal);
  try {
    publishStoredInstallJournal(home, journal.transactionId, encodeJournal(journal), fs);
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
