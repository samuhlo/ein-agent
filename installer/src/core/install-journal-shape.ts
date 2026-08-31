import { isProxy } from "node:util/types";
import {
  isValidInstallFailureDetail,
  type InstallExecutionJournalV1,
  type InstallJournalEntryState,
  type InstallJournalState,
} from "./install-journal-contract.ts";
import {
  INSTALL_PLAN_ENTRY_CONTRACTS,
  INSTALL_PLAN_ENTRY_IDS,
  type InstallPlanEntryId,
  type InstallPlanV1,
} from "./install-plan.ts";

const JOURNAL_TARGETS = ["pi", "claude", "both"] as const;
const JOURNAL_STATES: readonly InstallJournalState[] = ["prepared", "executing", "recovery-required", "complete"];
const ENTRY_STATES: readonly InstallJournalEntryState[] = ["not-run", "pending", "completed", "failed"];
const RECOVERY_CODES = ["handler-failed", "interrupted"] as const;

type JournalEnvelope = Record<string, unknown> & {
  schemaVersion: 1;
  transactionId: string;
  planDigest: string;
  target: InstallPlanV1["target"];
  platform: InstallPlanV1["platform"];
  state: InstallJournalState;
  entries: unknown[];
  pendingEntryId?: InstallPlanEntryId;
  recoveryCode?: typeof RECOVERY_CODES[number];
};

function hasExactDataProperties(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
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
  if (!hasExactDataProperties(value, ["schemaVersion", "transactionId", "planDigest", "target", "platform", "state", "entries", ...optional, ...recovery])) return false;
  return value.schemaVersion === 1
    && typeof value.transactionId === "string"
    && /^[0-9a-f-]{16,64}$/.test(value.transactionId)
    && typeof value.planDigest === "string"
    && /^[0-9a-f]{64}$/.test(value.planDigest)
    && JOURNAL_TARGETS.includes(value.target as InstallPlanV1["target"])
    && JOURNAL_STATES.includes(value.state as InstallJournalState)
    && (!own.pendingEntryId || INSTALL_PLAN_ENTRY_IDS.includes(value.pendingEntryId as InstallPlanEntryId))
    && (!own.recoveryCode || RECOVERY_CODES.includes(value.recoveryCode as typeof RECOVERY_CODES[number]))
    && hasExactDataProperties(value.platform, ["os", "arch"])
    && ["darwin", "linux"].includes(value.platform.os as string)
    && ["arm64", "x64"].includes(value.platform.arch as string)
    && isDenseDataArray(value.entries);
}

function isAllowedRuntime(target: InstallPlanV1["target"], runtime: unknown): boolean {
  return runtime === "shared"
    || target !== "claude" && runtime === "pi"
    || target !== "pi" && runtime === "claude";
}

function areJournalEntriesValid(
  entries: readonly unknown[],
  target: InstallPlanV1["target"],
): entries is InstallExecutionJournalV1["entries"] {
  const ids = new Set<string>();
  let previous = -1;

  for (const entry of entries) {
    const own = entry && typeof entry === "object" && !isProxy(entry)
      ? Object.getOwnPropertyDescriptors(entry)
      : {};
    const detail = own.detail ? ["detail"] : [];
    const id = own.id && "value" in own.id ? own.id.value : undefined;
    const order = typeof id === "string" ? INSTALL_PLAN_ENTRY_IDS.indexOf(id as InstallPlanEntryId) : -1;
    const expectedRuntime = order >= 0 ? INSTALL_PLAN_ENTRY_CONTRACTS[id as InstallPlanEntryId][0] : undefined;

    if (!hasExactDataProperties(entry, ["id", "runtime", "status", ...detail])) return false;
    if (order <= previous || ids.has(entry.id as string)) return false;
    if (entry.runtime !== expectedRuntime || !isAllowedRuntime(target, entry.runtime)) return false;
    if (!ENTRY_STATES.includes(entry.status as InstallJournalEntryState)) return false;
    if (own.detail && (
      entry.id !== "pi.backup-current"
      || !["failed", "pending"].includes(entry.status as string)
      || !isValidInstallFailureDetail(entry.detail)
    )) return false;

    previous = order;
    ids.add(entry.id as string);
  }
  return true;
}

// FAIL CLOSED -> Un objeto exótico nunca se convierte en estado reanudable.
export function isStructurallyValidInstallJournal(value: unknown): value is InstallExecutionJournalV1 {
  try {
    return isJournalEnvelope(value) && areJournalEntriesValid(value.entries, value.target);
  } catch {
    return false;
  }
}
