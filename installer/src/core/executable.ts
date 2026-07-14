import { basename, dirname, join } from "node:path";
import { probeBinaryVersion, verifyBinaryIdentity } from "./binary-probe.ts";
import { spawnContinuation, type ContinuationMessage } from "./child-continuation.ts";
import type { ReleaseTag, Result, UpdateStageError } from "./release-types.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type CandidatePaths = {
  sourcePath: string;
  destinationPath: string;
  candidatePath: string;
  backupPath: string;
};

export type ExecutableError = UpdateStageError;

function executableError(code: string, message: string): ExecutableError {
  return { stage: "staging", code, message };
}

function safeExecutableMode(mode: number): number | null {
  const executableMode = (mode & 0o777) & ~0o6000;
  return executableMode & 0o111 ? executableMode : null;
}

function backupPathFor(destinationPath: string): string {
  return join(dirname(destinationPath), `.${basename(destinationPath)}.ein-backup`);
}

/** Stages a verified payload beside its destination; it never replaces the active binary. */
export function prepareExecutableCandidate(
  options: { sourcePath: string; destinationPath: string; caps: UpdateCaps },
): Result<CandidatePaths, ExecutableError> {
  const { sourcePath, destinationPath, caps } = options;
  try {
    const source = caps.fs.inspect(sourcePath);
    const destination = caps.fs.inspect(destinationPath);
    const parent = caps.fs.inspect(dirname(destinationPath));
    if (source.kind !== "file") return { ok: false, error: executableError("unsafe-source", "Staged executable must be a regular file") };
    if (destination.kind === "symlink") return { ok: false, error: executableError("destination-symlink", "Executable destination must not be a symlink") };
    if (destination.kind !== "file") return { ok: false, error: executableError("unsafe-destination", "Executable destination must be a regular file") };
    if (parent.kind !== "directory") return { ok: false, error: executableError("unsafe-parent", "Executable parent must be a directory") };
    if (destination.uid !== caps.fs.currentUid()) return { ok: false, error: executableError("unsafe-owner", "Executable destination belongs to a different user") };
    const mode = safeExecutableMode(destination.mode);
    if (mode === null) return { ok: false, error: executableError("unsafe-mode", "Executable destination has no execute permission") };

    const candidatePath = caps.fs.createSiblingFile(destinationPath);
    let prepared = false;
    try {
      caps.fs.copyFile(sourcePath, candidatePath);
      const candidate = caps.fs.inspect(candidatePath);
      if (candidate.kind !== "file" || candidate.dev !== destination.dev) {
        return { ok: false, error: executableError("EXDEV", "Executable candidate is not on the destination filesystem") };
      }
      caps.fs.chmod(candidatePath, mode);
      caps.fs.fsyncDir(dirname(destinationPath));
      prepared = true;
      return {
        ok: true,
        value: { sourcePath, destinationPath, candidatePath, backupPath: backupPathFor(destinationPath) },
      };
    } catch (error) {
      return { ok: false, error: executableError("staging-failed", error instanceof Error ? error.message : "Could not stage executable") };
    } finally {
      // BLINDAJE -> Failed preparation cannot leave an executable-shaped artifact behind.
      if (!prepared) {
        try {
          caps.fs.removeFile(candidatePath);
        } catch {
          // No candidate was created, so no cleanup remains.
        }
      }
    }
  } catch (error) {
    return { ok: false, error: executableError("validation-failed", error instanceof Error ? error.message : "Could not validate executable destination") };
  }
}

/** Atomically replaces only a prepared candidate and retains a same-directory rollback copy. */
export function commitExecutableCandidate(
  candidate: CandidatePaths,
  caps: UpdateCaps,
): Result<CandidatePaths, ExecutableError> {
  let replaced = false;
  try {
    caps.fs.copyFile(candidate.destinationPath, candidate.backupPath);
    caps.fs.rename(candidate.candidatePath, candidate.destinationPath);
    replaced = true;
    caps.fs.fsyncDir(dirname(candidate.destinationPath));
    return { ok: true, value: candidate };
  } catch (error) {
    if (replaced) {
      const restored = restoreExecutableCandidate(candidate, caps);
      if (!restored.ok) return restored;
    }
    cleanupExecutableCandidate(candidate, caps);
    return { ok: false, error: executableError("rename-failed", error instanceof Error ? error.message : "Could not atomically replace executable") };
  }
}

/** Restores the previous executable after a failed post-replacement step. */
export function restoreExecutableCandidate(
  candidate: CandidatePaths,
  caps: UpdateCaps,
): Result<void, ExecutableError> {
  try {
    caps.fs.rename(candidate.backupPath, candidate.destinationPath);
    caps.fs.fsyncDir(dirname(candidate.destinationPath));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: executableError("restore-failed", error instanceof Error ? error.message : "Could not restore executable") };
  }
}

export function cleanupExecutableCandidate(candidate: CandidatePaths, caps: UpdateCaps): void {
  for (const path of [candidate.candidatePath, candidate.backupPath]) {
    try {
      caps.fs.removeFile(path);
    } catch {
      // Already moved or absent: there is no recovery artifact to retain.
    }
  }
}

/** Performs only the group-3 binary boundary; template and marker commits remain later work. */
export async function replaceAndContinueExecutable(
  options: { sourcePath: string; destinationPath: string; releaseTag: ReleaseTag; txId: string; caps: UpdateCaps },
): Promise<Result<{ candidate: CandidatePaths; continuation: ContinuationMessage }, UpdateStageError>> {
  const prepared = prepareExecutableCandidate(options);
  if (!prepared.ok) return prepared;

  const expectedVersion = options.releaseTag.slice("installer-v".length);
  const probed = await probeBinaryVersion(prepared.value.candidatePath, options.caps);
  if (!probed.ok) {
    cleanupExecutableCandidate(prepared.value, options.caps);
    return probed;
  }
  const verified = verifyBinaryIdentity(probed.value, expectedVersion);
  if (!verified.ok) {
    cleanupExecutableCandidate(prepared.value, options.caps);
    return verified;
  }

  const committed = commitExecutableCandidate(prepared.value, options.caps);
  if (!committed.ok) return committed;
  const continued = await spawnContinuation({
    candidatePath: options.destinationPath,
    txId: options.txId,
    releaseTag: options.releaseTag,
    caps: options.caps,
  });
  if (continued.ok) return { ok: true, value: { candidate: committed.value, continuation: continued.value } };

  const restored = restoreExecutableCandidate(committed.value, options.caps);
  cleanupExecutableCandidate(committed.value, options.caps);
  return restored.ok ? continued : restored;
}
