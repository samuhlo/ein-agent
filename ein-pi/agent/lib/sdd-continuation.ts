import { join } from "node:path";
import { readAgreement, validateAgreement } from "./intent-agreement.ts";
import { INTENT_STATE } from "./intent-discovery.ts";
import { parseSessionBindingEntryV1, SDD_SESSION_BINDING_CUSTOM_TYPE } from "./sdd-session-binding.ts";
import { resolveChangesDir } from "./sdd-routing-core.ts";

type Context = { cwd: string; sessionManager: { getBranch(): readonly unknown[] } };

// A continuation uses existing session authority, never an arbitrary active directory.
export function readAuthorizedContinuation(ctx: Context, agent: string, task: string): string | undefined {
  if (!["sdd-verify", "sdd-close"].includes(agent) || /intent_work:|\bchange\s*[:=]|(?:openspec|\.sdd)\/changes\//i.test(task)) return;
  const entry = [...ctx.sessionManager.getBranch()].reverse().find((value) => {
    const row = value as { type?: string; customType?: string };
    return row?.type === "custom" && [INTENT_STATE, SDD_SESSION_BINDING_CUSTOM_TYPE].includes(row.customType ?? "");
  }) as { customType: string; data: unknown } | undefined;
  if (!entry) return;
  let change: string | undefined;
  if (entry.customType === SDD_SESSION_BINDING_CUSTOM_TYPE) {
    const binding = parseSessionBindingEntryV1(entry.data);
    if (binding?.state === "bound") change = binding.change;
  } else {
    try { const agreement = validateAgreement(entry.data); if (agreement.status === "confirmed") change = agreement.change; }
    catch { return; }
  }
  if (!change) return;
  const current = readAgreement(join(resolveChangesDir(ctx.cwd), change));
  if (current.kind !== "valid" || current.agreement.status !== "confirmed" || current.agreement.change !== change) return;
  return change;
}
