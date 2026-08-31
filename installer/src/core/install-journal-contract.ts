import { createHash } from "node:crypto";
import {
  validateInstallPlan,
  type InstallPlanEntryId,
  type InstallPlanRuntime,
  type InstallPlanV1,
} from "./install-plan.ts";

export type InstallJournalState = "prepared" | "executing" | "recovery-required" | "complete";
export type InstallJournalEntryState = "not-run" | "pending" | "completed" | "failed";
export type InstallExecutionJournalV1 = Readonly<{
  schemaVersion: 1;
  transactionId: string;
  planDigest: string;
  target: InstallPlanV1["target"];
  platform: InstallPlanV1["platform"];
  state: InstallJournalState;
  entries: readonly Readonly<{
    id: InstallPlanEntryId;
    runtime: InstallPlanRuntime;
    status: InstallJournalEntryState;
    detail?: string;
  }>[];
  pendingEntryId?: InstallPlanEntryId;
  recoveryCode?: "handler-failed" | "interrupted";
}>;

export class InstallJournalError extends Error {
  constructor(readonly code: "recovery-required" | "journal-write-failed" | "recovery-write-failed") {
    super(`Install recovery status: ${code}`);
    this.name = "InstallJournalError";
  }
}

const MAX_FAILURE_DETAIL_BYTES = 512;
export const isValidInstallFailureDetail = (value: unknown): value is string =>
  typeof value === "string"
  && value.length > 0
  && !/[\u0000-\u001f\u007f]/.test(value)
  && new TextEncoder().encode(value).byteLength <= MAX_FAILURE_DETAIL_BYTES;

const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}` : JSON.stringify(value);

export const installPlanDigest = (plan: InstallPlanV1): string => {
  validateInstallPlan(plan);
  return createHash("sha256").update(canonical(plan)).digest("hex");
};

export const installJournalMatchesPlan = (
  journal: InstallExecutionJournalV1,
  plan: InstallPlanV1,
): boolean => journal.planDigest === installPlanDigest(plan)
  && journal.target === plan.target
  && journal.platform.os === plan.platform.os
  && journal.platform.arch === plan.platform.arch
  && journal.entries.map(({ id }) => id).join() === plan.inventory
    .filter((entry) => entry.state === "selected" || entry.state === "conditional")
    .map(({ id }) => id)
    .join();
