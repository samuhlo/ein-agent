import { createContinuityOperationRuntime, type RecoveryAssessment } from "../../shared/ports/continuity.ts";

export const CONTINUITY_HELP = "ein-cc-sdd continuity inspect [opId] | resolve <opId> < recovery.json";
export function runContinuityCommand(cwd: string, args: readonly string[], raw = ""): { text: string; exitCode: 0 | 1 } {
  try {
    const [action, id] = args;
    if (!["inspect", "resolve"].includes(action ?? "") || (action === "resolve" ? args.length !== 2 || !id : args.length > 2)) throw new Error(CONTINUITY_HELP);
    const runtime = createContinuityOperationRuntime(cwd);
    if (action === "inspect") {
      const result = id ? runtime.inspect(id) : runtime.list(); return { text: JSON.stringify(result), exitCode: result.ok ? 0 : 1 };
    }
    if (Buffer.byteLength(raw) > 64 * 1024) throw new Error("recovery-input-too-large");
    const request = JSON.parse(raw) as { token: string; assessment: RecoveryAssessment };
    if (!request || Object.keys(request).sort().join() !== "assessment,token" || typeof request.token !== "string") throw new Error("invalid-recovery-input");
    const result = runtime.resolve(id!, request.token, request.assessment, "claude-coordinator");
    return { text: JSON.stringify(result), exitCode: result.ok ? 0 : 1 };
  } catch (error) { return { text: JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "recovery-unavailable" }), exitCode: 1 }; }
}
