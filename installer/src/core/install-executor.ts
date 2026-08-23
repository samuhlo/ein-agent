import {
  validateInstallPlan,
  type InstallPlanEntryId,
  type InstallPlanRuntime,
  type InstallPlanV1,
  type RuntimeInstallTarget,
} from "./install-plan.ts";
import { isProxy } from "node:util/types";
import { BackupFailure, sanitizeBackupFailureDetail } from "./backup.ts";

export type InstallPlanHandlerResult = Readonly<{ ok: boolean; detail?: string }>;
export type InstallPlanExecutionHandler = () => Promise<InstallPlanHandlerResult> | InstallPlanHandlerResult;
export type InstallPlanExecutionHandlers = Readonly<Record<InstallPlanEntryId, InstallPlanExecutionHandler>>;
export type InstallPlanExecution = Readonly<{
  ok: boolean;
  failures: Readonly<Partial<Record<InstallPlanRuntime, string>>>;
}>;

export class InstallPlanExecutionError extends Error {
  readonly code: "blocked-plan" | "invalid-handlers";
  constructor(code: InstallPlanExecutionError["code"]) { super(`Install plan execution rejected: ${code}`); this.name = "InstallPlanExecutionError"; this.code = code; }
}

function preflight(plan: InstallPlanV1, handlers: InstallPlanExecutionHandlers): InstallPlanExecutionHandlers {
  validateInstallPlan(plan);
  if (plan.status === "blocked") throw new InstallPlanExecutionError("blocked-plan");
  try { if (!handlers || typeof handlers !== "object" || isProxy(handlers) || Array.isArray(handlers) || Object.getPrototypeOf(handlers) !== Object.prototype) throw 0;
    const expected = plan.inventory.map((entry) => entry.id), descriptors = Object.getOwnPropertyDescriptors(handlers);
    if (Reflect.ownKeys(descriptors).length !== expected.length || expected.some((id) => { const descriptor = descriptors[id]; return !descriptor?.enumerable || !("value" in descriptor) || typeof descriptor.value !== "function"; })) throw 0;
    return Object.fromEntries(expected.map((id) => [id, descriptors[id]!.value])) as InstallPlanExecutionHandlers;
  } catch { throw new InstallPlanExecutionError("invalid-handlers"); }
}

const genericFailureDetail = (runtime: InstallPlanRuntime, id: InstallPlanEntryId): string => runtime === "shared" ? `Bun no disponible: ${id}` : `${runtime === "pi" ? "Pi" : "Claude Code"} installation failed at ${id}`;
const isBackupEntry = (runtime: InstallPlanRuntime, id: InstallPlanEntryId): boolean => runtime === "pi" && id === "pi.backup-current";
const failureDetail = (runtime: InstallPlanRuntime, id: InstallPlanEntryId, detail?: string): string => {
  if (!isBackupEntry(runtime, id) || !detail) return genericFailureDetail(runtime, id);
  const safe = sanitizeBackupFailureDetail(detail);
  return safe ? safe : genericFailureDetail(runtime, id);
};

/** Execute only the immutable inventory order; failures stop their runtime, not later runtimes. */
export async function executeInstallPlan(plan: InstallPlanV1, handlers: InstallPlanExecutionHandlers): Promise<InstallPlanExecution> {
  const admitted = preflight(plan, handlers);
  const failures: Partial<Record<InstallPlanRuntime, string>> = {};
  for (const entry of plan.inventory) {
    if (entry.state !== "selected" && entry.state !== "conditional") continue;
    if (failures.shared || failures[entry.runtime]) continue;
    try {
      const result = await admitted[entry.id]();
      if (!result.ok) failures[entry.runtime] = failureDetail(entry.runtime, entry.id, result.detail);
    } catch (error) {
      failures[entry.runtime] = isBackupEntry(entry.runtime, entry.id) && error instanceof BackupFailure ? error.message : genericFailureDetail(entry.runtime, entry.id);
    }
  }
  return Object.freeze({ ok: Object.keys(failures).length === 0, failures: Object.freeze(failures) });
}

export function runtimeFailure(execution: InstallPlanExecution, runtime: RuntimeInstallTarget): string | undefined {
  return execution.failures.shared ?? execution.failures[runtime];
}
