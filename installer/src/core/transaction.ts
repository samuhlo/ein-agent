import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { acquireRelease } from "./acquisition.ts";
import type { AssetPlatform } from "./asset-selector.ts";
import { probeBinaryVersion, verifyBinaryIdentity } from "./binary-probe.ts";
import { spawnContinuation } from "./child-continuation.ts";
import { commitExecutableCandidate, prepareExecutableCandidate, restoreExecutableCandidate } from "./executable.ts";
import { classifyOwnership, commitMarkerV2, readMarkerV2 } from "./marker-v2.ts";
import { BACKUP_DIR, INSTALL_MARKER } from "./paths.ts";
import type { MarkerV2, OwnershipMarker, ReleaseSelector, ReleaseTag, ResolvedRelease, Result, UpdateOutcome, UpdateStageError } from "./release-types.ts";
import { fetchLatestRelease, fetchReleaseByTag } from "./release-record.ts";
import { resolveRecord } from "./release-resolver.ts";
import { deployEmbeddedTemplate, restoreTemplate, snapshotTemplate, validateDeployedManifest } from "./template-transaction.ts";
import type { UpdateCaps } from "./update-caps.ts";

export type TransactionState =
  | "prepared"
  | "binary-replaced"
  | "child-reexecuted"
  | "template-deployed"
  | "marker-committed"
  | "validated"
  | "complete";

export type Journal = {
  schemaVersion: 1;
  txId: string;
  target: ReleaseTag;
  owner: OwnershipMarker;
  state: TransactionState;
  pending?: Exclude<TransactionState, "prepared" | "complete">;
  artifacts: Record<string, string>;
};

export type TransactionError = UpdateStageError & { recoveryArtifacts: string[] };
export type RecoveryStatus = "clean" | "recovered" | "recovery-required";

type Rollback = () => Promise<void> | void;

const TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  prepared: ["binary-replaced"],
  "binary-replaced": ["child-reexecuted"],
  "child-reexecuted": ["template-deployed"],
  "template-deployed": ["marker-committed"],
  "marker-committed": ["validated"],
  validated: ["complete"],
  complete: [],
};

function transactionError(stage: UpdateStageError["stage"], code: string, message: string, journal: Journal): TransactionError {
  return { stage, code, message, recoveryArtifacts: Object.values(journal.artifacts) };
}

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function defaultJournalPath(): string {
  return join(BACKUP_DIR, ".ein-update-journal.json");
}

function readJournal(caps: UpdateCaps, journalPath: string): Journal | null {
  if (!caps.fs.exists(journalPath)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(caps.fs.readFile(journalPath))) as Partial<Journal>;
    if (
      parsed.schemaVersion !== 1 || typeof parsed.txId !== "string" || typeof parsed.target !== "string" ||
      !parsed.owner || typeof parsed.owner !== "object" || typeof parsed.state !== "string" ||
      !parsed.artifacts || typeof parsed.artifacts !== "object" || !(parsed.state in TRANSITIONS)
    ) return null;
    return parsed as Journal;
  } catch {
    return null;
  }
}

function persistJournal(caps: UpdateCaps, journalPath: string, journal: Journal): void {
  caps.fs.makeDir(dirname(journalPath));
  const temporary = caps.fs.createSiblingFile(journalPath);
  caps.fs.writeFile(temporary, encode(journal));
  caps.fs.rename(temporary, journalPath);
  caps.fs.fsyncDir(dirname(journalPath));
}

export type Transaction = {
  readonly journal: Journal;
  prepare(artifacts: Record<string, string>): Result<void, TransactionError>;
  transition(state: Exclude<TransactionState, "prepared" | "complete">, action: () => Promise<void> | void, rollback: Rollback): Promise<Result<void, TransactionError>>;
  rollback(): Promise<Result<void, TransactionError>>;
  complete(): Result<void, TransactionError>;
};

/** The journal records intent before each irreversible action and the completed state immediately after it. */
export function createTransaction(options: {
  caps: UpdateCaps;
  target: ReleaseTag;
  owner: OwnershipMarker;
  txId?: string;
  journalPath?: string;
}): Transaction {
  const journalPath = options.journalPath ?? defaultJournalPath();
  const journal: Journal = {
    schemaVersion: 1,
    txId: options.txId ?? randomUUID(),
    target: options.target,
    owner: options.owner,
    state: "prepared",
    artifacts: {},
  };
  const committedRollbacks: Rollback[] = [];

  const persist = (): Result<void, TransactionError> => {
    try {
      persistJournal(options.caps, journalPath, journal);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: transactionError("preparing", "journal-write-failed", error instanceof Error ? error.message : "Could not persist transaction journal", journal) };
    }
  };

  const rollbackCommitted = async (): Promise<Result<void, TransactionError>> => {
    for (const rollback of [...committedRollbacks].reverse()) {
      try {
        await rollback();
      } catch (error) {
        return { ok: false, error: transactionError("recovering", "rollback-failed", error instanceof Error ? error.message : "Rollback failed", journal) };
      }
    }
    try {
      for (const artifact of Object.values(journal.artifacts)) {
        try {
          const entry = options.caps.fs.inspect(artifact);
          if (entry.kind === "directory") options.caps.fs.removeDir(artifact);
          else options.caps.fs.removeFile(artifact);
        } catch {
          // Missing artifacts were either never created or already restored.
        }
      }
      options.caps.fs.removeFile(journalPath);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: transactionError("recovering", "journal-cleanup-failed", error instanceof Error ? error.message : "Could not clear recovered journal", journal) };
    }
  };

  return {
    journal,
    prepare(artifacts) {
      journal.artifacts = { ...artifacts };
      return persist();
    },
    async transition(state, action, rollback) {
      if (!TRANSITIONS[journal.state].includes(state)) {
        return { ok: false, error: transactionError("recovering", "invalid-transition", `Cannot transition from ${journal.state} to ${state}`, journal) };
      }
      journal.pending = state;
      const intent = persist();
      if (!intent.ok) return intent;
      try {
        // BLINDAJE -> A failed action may have crossed its mutation boundary; retain its undo first.
        committedRollbacks.push(rollback);
        await action();
        journal.state = state;
        delete journal.pending;
        const committed = persist();
        if (!committed.ok) return committed;
        return { ok: true, value: undefined };
      } catch (error) {
        const failed = transactionError("recovering", "transition-failed", error instanceof Error ? error.message : `Failed at ${state}`, journal);
        const restored = await rollbackCommitted();
        return restored.ok ? { ok: false, error: failed } : restored;
      }
    },
    rollback: rollbackCommitted,
    complete() {
      if (journal.state !== "validated") {
        return { ok: false, error: transactionError("recovering", "invalid-transition", "Transaction must validate before completion", journal) };
      }
      journal.state = "complete";
      const committed = persist();
      if (!committed.ok) return committed;
      try {
        options.caps.fs.removeFile(journalPath);
        return { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, error: transactionError("recovering", "journal-cleanup-failed", error instanceof Error ? error.message : "Committed journal retained for cleanup", journal) };
      }
    },
  };
}

export function installSignalHandlers(transaction: Transaction, caps: UpdateCaps): () => void {
  const onSignal = () => { void transaction.rollback(); };
  const removeInt = caps.signals.on("SIGINT", onSignal);
  const removeTerm = caps.signals.on("SIGTERM", onSignal);
  return () => {
    removeInt();
    removeTerm();
  };
}

export async function recoverPendingTransaction(options: {
  caps: UpdateCaps;
  journalPath?: string;
  recover?: (journal: Journal) => Promise<boolean> | boolean;
}): Promise<Result<RecoveryStatus, TransactionError>> {
  const journalPath = options.journalPath ?? defaultJournalPath();
  const journal = readJournal(options.caps, journalPath);
  if (!options.caps.fs.exists(journalPath)) return { ok: true, value: "clean" };
  if (!journal || journal.owner.type === "ownership-ambiguous") {
    return { ok: false, error: transactionError("recovering", "recovery-required", "Pending transaction identity is ambiguous", journal ?? {
      schemaVersion: 1, txId: "unknown", target: "installer-vunknown" as ReleaseTag, owner: { type: "ownership-ambiguous", reason: "invalid journal" }, state: "prepared", artifacts: {},
    }) };
  }
  if (journal.state === "complete") {
    try {
      options.caps.fs.removeFile(journalPath);
      return { ok: true, value: "clean" };
    } catch (error) {
      return { ok: false, error: transactionError("recovering", "journal-cleanup-failed", error instanceof Error ? error.message : "Could not clean committed journal", journal) };
    }
  }
  if (!options.recover) {
    return { ok: false, error: transactionError("recovering", "recovery-required", "Pending transaction requires explicit recovery", journal) };
  }
  try {
    if (!await options.recover(journal)) {
      return { ok: false, error: transactionError("recovering", "recovery-required", "Could not prove recovered installation identity", journal) };
    }
    options.caps.fs.removeFile(journalPath);
    return { ok: true, value: "recovered" };
  } catch (error) {
    return { ok: false, error: transactionError("recovering", "recovery-required", error instanceof Error ? error.message : "Could not recover transaction", journal) };
  }
}

export type UpdateTransactionOptions = {
  caps: UpdateCaps;
  selector: ReleaseSelector;
  platform: AssetPlatform;
  destinationPath: string;
  agentDir: string;
  markerPath?: string;
  journalPath?: string;
  dryRun?: boolean;
  promoteApp?: () => Promise<{ rollback: () => void; commit: () => void }>;
};

function failure(error: UpdateStageError, selector: ReleaseSelector, release?: ResolvedRelease): UpdateOutcome {
  return { type: "failed", stage: error.stage, message: error.message, selector, ...(release ? { release } : {}) };
}

async function resolveForDryRun(options: UpdateTransactionOptions): Promise<Result<ResolvedRelease, UpdateStageError>> {
  const record = options.selector.kind === "latest"
    ? await fetchLatestRelease(options.caps)
    : await fetchReleaseByTag(options.selector.tag, options.caps);
  if (!record.ok) return record;
  return resolveRecord(options.selector, record.value);
}

function currentIsCoherent(options: UpdateTransactionOptions, marker: MarkerV2, release: ResolvedRelease, digest: string): Promise<boolean> {
  const expectedVersion = release.release.tag.slice("installer-v".length);
  return Promise.all([
    options.caps.hashFile(options.destinationPath),
    probeBinaryVersion(options.destinationPath, options.caps),
    options.caps.template.readManifest(options.agentDir),
  ]).then(([hash, identity, manifest]) =>
    hash === marker.asset.sha256 &&
    marker.releaseTag === release.release.tag &&
    marker.binaryVersion === expectedVersion &&
    marker.templateVersion === expectedVersion &&
    identity.ok && identity.value.binaryVersion === expectedVersion && identity.value.templateVersion === expectedVersion &&
    manifest?.templateVersion === expectedVersion && digest === marker.asset.sha256,
  ).catch(() => false);
}

function cleanup(paths: string[], caps: UpdateCaps): void {
  for (const path of paths) {
    try {
      caps.fs.removeFile(path);
    } catch {
      try {
        caps.fs.removeDir(path);
      } catch {
        // Disposable cleanup never changes the already-validated identity.
      }
    }
  }
}

/** Executes the verified release state machine; callers only render its outcome. */
export async function runUpdateTransaction(options: UpdateTransactionOptions): Promise<UpdateOutcome> {
  const markerPath = options.markerPath ?? INSTALL_MARKER;
  const marker = readMarkerV2(options.caps, markerPath);
  const owner = classifyOwnership(marker);
  if (owner.type === "ownership-ambiguous") {
    return failure({ stage: "preparing", code: "ambiguous-owner", message: owner.reason }, options.selector);
  }

  if (options.dryRun) {
    const resolved = await resolveForDryRun(options);
    return resolved.ok
      ? { type: "dry-run", release: resolved.value, owner }
      : failure(resolved.error, options.selector);
  }

  const acquired = await acquireRelease({ selector: options.selector, platform: options.platform, caps: options.caps });
  if (!acquired.ok) return failure(acquired.error, options.selector);
  try {
    const release = acquired.value.release;
    const expectedVersion = release.release.tag.slice("installer-v".length);
    if (owner.type === "package-manager") {
      return { type: "blocked-external-owner", owner, release };
    }
    if (marker && "schemaVersion" in marker && await currentIsCoherent(options, marker, release, acquired.value.digest.sha256)) {
      return { type: "already-current", release };
    }

    const snapshot = snapshotTemplate({ agentDir: options.agentDir, caps: options.caps });
    if (!snapshot.ok) return failure(snapshot.error, options.selector, release);
    const candidate = prepareExecutableCandidate({ sourcePath: acquired.value.stagedPath, destinationPath: options.destinationPath, caps: options.caps });
    if (!candidate.ok) return failure(candidate.error, options.selector, release);

    const identity = await probeBinaryVersion(candidate.value.candidatePath, options.caps);
    if (!identity.ok) return failure(identity.error, options.selector, release);
    const verified = verifyBinaryIdentity(identity.value, expectedVersion);
    if (!verified.ok) return failure(verified.error, options.selector, release);

    const markerBackup = marker ? options.caps.fs.createSiblingFile(markerPath) : undefined;
    try {
      if (markerBackup) options.caps.fs.copyFile(markerPath, markerBackup);
    } catch (error) {
      cleanup([candidate.value.candidatePath, snapshot.value.path], options.caps);
      return failure({ stage: "preparing", code: "marker-backup-failed", message: error instanceof Error ? error.message : "Could not preserve the installed marker" }, options.selector, release);
    }

    const tx = createTransaction({ caps: options.caps, target: release.release.tag, owner: { type: "standalone" }, journalPath: options.journalPath });
    const prepared = tx.prepare({ binary: candidate.value.backupPath, template: snapshot.value.path, ...(markerBackup ? { marker: markerBackup } : {}) });
    if (!prepared.ok) return failure(prepared.error, options.selector, release);
    const removeSignals = installSignalHandlers(tx, options.caps);
    let appPromotion: Awaited<ReturnType<NonNullable<UpdateTransactionOptions["promoteApp"]>>> | undefined;
    try {
      const replaced = await tx.transition("binary-replaced", () => {
        const result = commitExecutableCandidate(candidate.value, options.caps);
        if (!result.ok) throw new Error(result.error.message);
      }, () => {
        const result = restoreExecutableCandidate(candidate.value, options.caps);
        if (!result.ok) throw new Error(result.error.message);
      });
      if (!replaced.ok) return failure(replaced.error, options.selector, release);

      const continued = await tx.transition("child-reexecuted", async () => {
        const result = await spawnContinuation({ candidatePath: options.destinationPath, txId: tx.journal.txId, releaseTag: release.release.tag, caps: options.caps });
        if (!result.ok) throw new Error(result.error.message);
      }, () => undefined);
      if (!continued.ok) return failure(continued.error, options.selector, release);

      const deployed = await tx.transition("template-deployed", async () => {
        const result = await deployEmbeddedTemplate({ binaryPath: options.destinationPath, agentDir: options.agentDir, caps: options.caps });
        if (!result.ok) throw new Error(result.error.message);
        const valid = await validateDeployedManifest({ agentDir: options.agentDir, expectedVersion, caps: options.caps });
        if (!valid.ok) throw new Error(valid.error.message);
      }, () => {
        const result = restoreTemplate({ agentDir: options.agentDir, snapshotPath: snapshot.value.path, caps: options.caps });
        if (!result.ok) throw new Error(result.error.message);
      });
      if (!deployed.ok) return failure(deployed.error, options.selector, release);

      const committed = await tx.transition("marker-committed", () => {
        const result = commitMarkerV2({ release, binaryVersion: expectedVersion, templateVersion: expectedVersion, owner: { type: "standalone" }, asset: acquired.value.digest, markerPath, caps: options.caps });
        if (!result.ok) throw new Error(result.error.message);
      }, () => {
        if (markerBackup) options.caps.fs.copyFile(markerBackup, markerPath);
        else if (options.caps.fs.exists(markerPath)) options.caps.fs.removeFile(markerPath);
      });
      if (!committed.ok) return failure(committed.error, options.selector, release);

      const validated = await tx.transition("validated", async () => {
        const committedMarker = readMarkerV2(options.caps, markerPath);
        if (!committedMarker || !("schemaVersion" in committedMarker) || !await currentIsCoherent(options, committedMarker, release, acquired.value.digest.sha256)) {
          throw new Error("Installed release could not be validated");
        }
        appPromotion = await options.promoteApp?.();
      }, () => appPromotion?.rollback());
      if (!validated.ok) return failure(validated.error, options.selector, release);
      const complete = tx.complete();
      if (!complete.ok) {
        const restored = await tx.rollback();
        return failure(restored.ok ? complete.error : restored.error, options.selector, release);
      }
      appPromotion?.commit();
      cleanup([candidate.value.backupPath, snapshot.value.path, ...(markerBackup ? [markerBackup] : [])], options.caps);
      return { type: "updated", release };
    } finally {
      removeSignals();
    }
  } finally {
    acquired.value.cleanup();
  }
}
