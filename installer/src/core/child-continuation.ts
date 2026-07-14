import { normalizeTag } from "./release-resolver.ts";
import type { BinaryIdentity } from "./binary-probe.ts";
import type { ReleaseTag, Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type ContinuationMessage = {
  txId: string;
  releaseTag: ReleaseTag;
  binaryVersion: string;
  templateVersion: string;
  status: "ok" | "failed";
  error?: string;
};

export type ContinuationError = UpdateStageError;

export type ContinuationOptions = {
  candidatePath: string;
  txId: string;
  releaseTag: ReleaseTag;
  caps: UpdateCaps;
};

function continuationError(code: string, message: string): ContinuationError {
  return { stage: "continuing", code, message };
}

function parseMessage(stdout: string): ContinuationMessage | null {
  try {
    const value = JSON.parse(stdout) as Partial<ContinuationMessage>;
    if (
      typeof value.txId !== "string" ||
      typeof value.releaseTag !== "string" ||
      typeof value.binaryVersion !== "string" ||
      typeof value.templateVersion !== "string" ||
      (value.status !== "ok" && value.status !== "failed")
    ) return null;
    const releaseTag = normalizeTag(value.releaseTag);
    if (!releaseTag.ok) return null;
    return { ...value, releaseTag: releaseTag.value } as ContinuationMessage;
  } catch {
    return null;
  }
}

/** Spawns only the verified candidate; the active process is never replaced. */
export async function spawnContinuation(
  options: ContinuationOptions,
): Promise<Result<ContinuationMessage, ContinuationError>> {
  const { candidatePath, txId, releaseTag, caps } = options;
  try {
    const child = await caps.child.spawn(
      candidatePath,
      [`--ein-continuation=${txId}`, `--ein-release=${releaseTag}`],
      { env: { EIN_UPDATE_TX_ID: txId, EIN_UPDATE_RELEASE_TAG: releaseTag } },
    );
    if (child.code !== 0) return { ok: false, error: continuationError("child-exit", `Continuation exited with ${child.code}`) };
    const message = parseMessage(child.stdout);
    if (!message) return { ok: false, error: continuationError("invalid-message", "Continuation returned invalid JSON") };
    if (message.status !== "ok" || message.txId !== txId || message.releaseTag !== releaseTag) {
      return { ok: false, error: continuationError("continuation-failed", message.error ?? "Continuation rejected release identity") };
    }
    return { ok: true, value: message };
  } catch (error) {
    return { ok: false, error: continuationError("spawn-failed", error instanceof Error ? error.message : "Could not start continuation") };
  }
}

/** Private-child helper: identity must match before later groups deploy or commit anything. */
export function runUpdateContinuation(
  options: { txId: string; releaseTag: ReleaseTag; identity: BinaryIdentity },
): ContinuationMessage {
  const expectedVersion = options.releaseTag.slice("installer-v".length);
  const matches = options.identity.binaryVersion === expectedVersion && options.identity.templateVersion === expectedVersion;
  return matches
    ? { ...options, ...options.identity, status: "ok" }
    : { ...options, ...options.identity, status: "failed", error: "Continuation binary identity does not match selected release" };
}
