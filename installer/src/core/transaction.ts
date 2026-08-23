import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { acquireRelease } from "./acquisition.ts";
import type { AssetPlatform } from "./asset-selector.ts";
import { probeBinaryVersion, verifyBinaryIdentity } from "./binary-probe.ts";
import { spawnContinuation } from "./child-continuation.ts";
import { commitExecutableCandidate, prepareExecutableCandidate, restoreExecutableCandidate } from "./executable.ts";
import { classifyOwnership, commitMarkerV2, readMarkerV2 } from "./marker-v2.ts";
import { BACKUP_DIR, INSTALL_MARKER } from "./paths.ts";
import { deriveArtifactId, isReleaseChannel } from "./release-types.ts";
import type { ArtifactId, MarkerV2, OwnershipMarker, ReleaseChannel, ReleaseSelector, ReleaseTag, ResolvedRelease, Result, UpdateOutcome, UpdateStageError } from "./release-types.ts";
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

/** A durable terminal state for a proven local rollback, distinct from update completion. */
export type JournalState = TransactionState | "recovery-succeeded";

export type ArtifactEndpoint =
  | { status: "none" }
  | { status: "present"; artifactId: ArtifactId }
  | { status: "missing"; reason: string };

export type RollbackOutcome =
  | { status: "not-attempted" }
  | { status: "attempted" }
  | { status: "succeeded" }
  | { status: "failed"; message: string };

export type LocalTransactionEvidence = {
  authority: "local";
  previousArtifactId: ArtifactEndpoint;
  attemptedArtifactId: ArtifactEndpoint;
  managedTree: string;
  backupReference: string;
};

export type Journal = {
  schemaVersion: 1;
  txId: string;
  target: ReleaseTag;
  owner: OwnershipMarker;
  state: JournalState;
  pending?: Exclude<TransactionState, "prepared" | "complete">;
  artifacts: Record<string, string>;
  /** Present for the active local update path; old journals remain readable for recovery. */
  authority?: "local";
  /** The effective channel chosen by the caller for this local transaction. */
  channel?: ReleaseChannel;
  previousArtifactId?: ArtifactEndpoint;
  attemptedArtifactId?: ArtifactEndpoint;
  managedTree?: string;
  backupReference?: string;
  rollbackOutcome?: RollbackOutcome;
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

function isCanonicalArtifactId(value: unknown): value is ArtifactId {
  if (typeof value !== "string") return false;
  const separator = value.lastIndexOf("@sha256:");
  if (separator <= 0) return false;
  const derived = deriveArtifactId(value.slice(0, separator), value.slice(separator + "@sha256:".length));
  return derived.ok && derived.value === value;
}

function isArtifactEndpoint(value: unknown): value is ArtifactEndpoint {
  if (!value || typeof value !== "object" || !("status" in value)) return false;
  const endpoint = value as Partial<ArtifactEndpoint>;
  if (endpoint.status === "none") return true;
  if (endpoint.status === "missing") return typeof endpoint.reason === "string" && endpoint.reason.length > 0;
  return endpoint.status === "present" && isCanonicalArtifactId(endpoint.artifactId);
}

function isRollbackOutcome(value: unknown): value is RollbackOutcome {
  if (!value || typeof value !== "object" || !("status" in value)) return false;
  const outcome = value as Partial<RollbackOutcome>;
  if (outcome.status === "not-attempted" || outcome.status === "attempted" || outcome.status === "succeeded") return true;
  return outcome.status === "failed" && typeof outcome.message === "string" && outcome.message.length > 0;
}

function hasLocalEvidence(journal: Journal): journal is Journal & Required<LocalTransactionEvidence> & { rollbackOutcome: RollbackOutcome } {
  return journal.authority === "local" && isArtifactEndpoint(journal.previousArtifactId) && isArtifactEndpoint(journal.attemptedArtifactId) &&
    typeof journal.managedTree === "string" && journal.managedTree.length > 0 &&
    typeof journal.backupReference === "string" && journal.backupReference.length > 0 && isRollbackOutcome(journal.rollbackOutcome);
}

function hasEvidenceFields(value: Partial<Journal>): boolean {
  return ["authority", "previousArtifactId", "attemptedArtifactId", "managedTree", "backupReference", "rollbackOutcome"].some((field) => field in value);
}

function sameRollbackOutcome(left: RollbackOutcome | undefined, right: RollbackOutcome | undefined): boolean {
  if (!left || !right || left.status !== right.status) return false;
  if (left.status !== "failed") return true;
  return right.status === "failed" && left.message === right.message;
}

function readJournal(caps: UpdateCaps, journalPath: string): Journal | null {
  if (!caps.fs.exists(journalPath)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(caps.fs.readFile(journalPath))) as Partial<Journal>;
    const isTerminalRecovery = parsed.state === "recovery-succeeded";
    if (
      parsed.schemaVersion !== 1 || typeof parsed.txId !== "string" || typeof parsed.target !== "string" ||
      !parsed.owner || typeof parsed.owner !== "object" || typeof parsed.state !== "string" ||
      !parsed.artifacts || typeof parsed.artifacts !== "object" || (!isTerminalRecovery && !Object.prototype.hasOwnProperty.call(TRANSITIONS, parsed.state)) ||
      (parsed.channel !== undefined && !isReleaseChannel(parsed.channel)) ||
      (hasEvidenceFields(parsed) && !hasLocalEvidence(parsed as Journal)) ||
      (isTerminalRecovery && (!hasLocalEvidence(parsed as Journal) || parsed.rollbackOutcome?.status !== "succeeded"))
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

function persistLocalRollbackOutcome(
  caps: UpdateCaps,
  journalPath: string,
  journal: Journal,
  outcome: RollbackOutcome,
  failureMessage: string,
): Result<void, TransactionError> {
  if (!hasLocalEvidence(journal)) return { ok: true, value: undefined };
  journal.rollbackOutcome = outcome;
  try {
    persistJournal(caps, journalPath, journal);
    const readBack = readJournal(caps, journalPath);
    if (!readBack || !hasLocalEvidence(readBack) || !sameRollbackOutcome(readBack.rollbackOutcome, outcome)) {
      return { ok: false, error: transactionError("recovering", "journal-write-failed", "Recovery outcome read-back did not match the persisted evidence", journal) };
    }
    Object.assign(journal, readBack);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: transactionError("recovering", "journal-write-failed", error instanceof Error ? error.message : failureMessage, journal) };
  }
}

function finalizeSuccessfulRecovery(caps: UpdateCaps, journalPath: string, journal: Journal): Result<void, TransactionError> {
  if (!hasLocalEvidence(journal) || journal.rollbackOutcome.status !== "succeeded") {
    return { ok: false, error: transactionError("recovering", "recovery-required", "Successful local recovery evidence is incomplete", journal) };
  }
  journal.state = "recovery-succeeded";
  try {
    persistJournal(caps, journalPath, journal);
    const readBack = readJournal(caps, journalPath);
    if (!readBack || readBack.state !== "recovery-succeeded" || !hasLocalEvidence(readBack) || readBack.rollbackOutcome.status !== "succeeded") {
      return { ok: false, error: transactionError("recovering", "journal-write-failed", "Terminal recovery state read-back did not match the persisted evidence", journal) };
    }
    Object.assign(journal, readBack);
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: transactionError("recovering", "journal-write-failed", error instanceof Error ? error.message : "Could not persist terminal recovery state", journal) };
  }
}

function cleanTerminalRecovery(caps: UpdateCaps, journalPath: string, journal: Journal): Result<RecoveryStatus, TransactionError> {
  try {
    caps.fs.removeFile(journalPath);
    return { ok: true, value: "clean" };
  } catch (error) {
    return { ok: false, error: transactionError("recovering", "journal-cleanup-failed", error instanceof Error ? error.message : "Could not clean terminal recovery journal", journal) };
  }
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
  channel?: ReleaseChannel;
  evidence?: LocalTransactionEvidence;
}): Transaction {
  const journalPath = options.journalPath ?? defaultJournalPath();
  const journal: Journal = {
    schemaVersion: 1,
    txId: options.txId ?? randomUUID(),
    target: options.target,
    owner: options.owner,
    state: "prepared",
    artifacts: {},
    ...(options.channel ? { channel: options.channel } : {}),
    ...(options.evidence ? {
      ...options.evidence,
      rollbackOutcome: { status: "not-attempted" as const },
    } : {}),
  };
  const committedRollbacks: Rollback[] = [];

  const persist = (): Result<void, TransactionError> => {
    if (hasEvidenceFields(journal) && !hasLocalEvidence(journal)) {
      return { ok: false, error: transactionError("preparing", "invalid-journal-evidence", "Local transaction evidence is incomplete or malformed", journal) };
    }
    try {
      persistJournal(options.caps, journalPath, journal);
      return { ok: true, value: undefined };
    } catch (error) {
      return { ok: false, error: transactionError("preparing", "journal-write-failed", error instanceof Error ? error.message : "Could not persist transaction journal", journal) };
    }
  };

  const persistRollbackOutcome = (outcome: RollbackOutcome): Result<void, TransactionError> =>
    persistLocalRollbackOutcome(options.caps, journalPath, journal, outcome, "Could not persist rollback outcome");

  const rollbackCommitted = async (): Promise<Result<void, TransactionError>> => {
    if (hasLocalEvidence(journal) && journal.rollbackOutcome.status === "succeeded") {
      if (journal.state === "recovery-succeeded") return { ok: true, value: undefined };
      const finalized = finalizeSuccessfulRecovery(options.caps, journalPath, journal);
      return finalized.ok ? { ok: true, value: undefined } : finalized;
    }
    const attempted = persistRollbackOutcome({ status: "attempted" });
    if (!attempted.ok) return attempted;
    for (const rollback of [...committedRollbacks].reverse()) {
      try {
        await rollback();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Rollback failed";
        const failed = persistRollbackOutcome({ status: "failed", message });
        return failed.ok
          ? { ok: false, error: transactionError("recovering", "rollback-failed", message, journal) }
          : failed;
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not clear recovered artifacts";
      const failed = persistRollbackOutcome({ status: "failed", message });
      return failed.ok
        ? { ok: false, error: transactionError("recovering", "journal-cleanup-failed", message, journal) }
        : failed;
    }
    const succeeded = persistRollbackOutcome({ status: "succeeded" });
    if (!succeeded.ok) return succeeded;
    if (hasLocalEvidence(journal)) {
      const finalized = finalizeSuccessfulRecovery(options.caps, journalPath, journal);
      return finalized.ok ? { ok: true, value: undefined } : finalized;
    }
    try {
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
      if (journal.state === "recovery-succeeded" || !TRANSITIONS[journal.state].includes(state)) {
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
  const persistRecoveryOutcome = (outcome: RollbackOutcome): Result<void, TransactionError> =>
    journal ? persistLocalRollbackOutcome(options.caps, journalPath, journal, outcome, "Could not persist recovery outcome") : { ok: true, value: undefined };
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
  if (journal.state === "recovery-succeeded") return cleanTerminalRecovery(options.caps, journalPath, journal);
  // Journals written by the previous recovery implementation can already contain
  // durable success without the terminal state; finalize those before cleanup.
  if (hasLocalEvidence(journal) && journal.rollbackOutcome.status === "succeeded") {
    const finalized = finalizeSuccessfulRecovery(options.caps, journalPath, journal);
    if (!finalized.ok) return finalized;
    return cleanTerminalRecovery(options.caps, journalPath, journal);
  }
  if (!options.recover) {
    return { ok: false, error: transactionError("recovering", "recovery-required", "Pending transaction requires explicit recovery", journal) };
  }
  const attempted = persistRecoveryOutcome({ status: "attempted" });
  if (!attempted.ok) return attempted;
  try {
    if (!await options.recover(journal)) {
      const message = "Could not prove recovered installation identity";
      const failed = persistRecoveryOutcome({ status: "failed", message });
      return failed.ok
        ? { ok: false, error: transactionError("recovering", "recovery-required", message, journal) }
        : failed;
    }
    const succeeded = persistRecoveryOutcome({ status: "succeeded" });
    if (!succeeded.ok) return succeeded;
    if (hasLocalEvidence(journal)) {
      const finalized = finalizeSuccessfulRecovery(options.caps, journalPath, journal);
      return finalized.ok ? { ok: true, value: "recovered" } : finalized;
    }
    options.caps.fs.removeFile(journalPath);
    return { ok: true, value: "recovered" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not recover transaction";
    const failed = persistRecoveryOutcome({ status: "failed", message });
    return failed.ok
      ? { ok: false, error: transactionError("recovering", "recovery-required", message, journal) }
      : failed;
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
  /** Effective channel supplied by the preference boundary; omitted means caller-level stable compatibility. */
  channel?: ReleaseChannel;
};

function failure(error: UpdateStageError, selector: ReleaseSelector, release?: ResolvedRelease): UpdateOutcome {
  return { type: "failed", stage: error.stage, message: error.message, selector, ...(release ? { release } : {}) };
}

async function resolveForDryRun(options: UpdateTransactionOptions, channel: ReleaseChannel): Promise<Result<ResolvedRelease, UpdateStageError>> {
  const record = options.selector.kind === "latest"
    ? await fetchLatestRelease(options.caps, undefined, channel)
    : await fetchReleaseByTag(options.selector.tag, options.caps, undefined, channel);
  if (!record.ok) return record;
  return resolveRecord(options.selector, record.value, channel);
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
  const effectiveChannel: unknown = options.channel === undefined ? "stable" : options.channel;
  if (!isReleaseChannel(effectiveChannel)) {
    return failure({ stage: "resolving", code: "invalid-channel", message: "Update transaction requires stable or alpha" }, options.selector);
  }
  const markerPath = options.markerPath ?? INSTALL_MARKER;
  const marker = readMarkerV2(options.caps, markerPath);
  const owner = classifyOwnership(marker);
  if (owner.type === "ownership-ambiguous") {
    return failure({ stage: "preparing", code: "ambiguous-owner", message: owner.reason }, options.selector);
  }

  if (options.dryRun) {
    const resolved = await resolveForDryRun(options, effectiveChannel);
    return resolved.ok
      ? { type: "dry-run", release: resolved.value, owner }
      : failure(resolved.error, options.selector);
  }

  const acquired = await acquireRelease({ selector: options.selector, platform: options.platform, caps: options.caps, channel: effectiveChannel });
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

    const previousArtifactId: ArtifactEndpoint = !marker
      ? { status: "none" }
      : "artifactId" in marker
        ? { status: "present", artifactId: marker.artifactId }
        : { status: "missing", reason: "Installed marker has no verified artifactId" };
    const tx = createTransaction({
      caps: options.caps,
      target: release.release.tag,
      channel: effectiveChannel,
      owner: { type: "standalone" },
      journalPath: options.journalPath,
      evidence: {
        authority: "local",
        previousArtifactId,
        attemptedArtifactId: { status: "present", artifactId: acquired.value.artifactId },
        managedTree: options.agentDir,
        backupReference: snapshot.value.path,
      },
    });
    const prepared = tx.prepare({ binary: candidate.value.backupPath, template: snapshot.value.path, ...(markerBackup ? { marker: markerBackup } : {}) });
    if (!prepared.ok) return failure(prepared.error, options.selector, release);
    const removeSignals = installSignalHandlers(tx, options.caps);
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
        const result = commitMarkerV2({ release, binaryVersion: expectedVersion, templateVersion: expectedVersion, owner: { type: "standalone" }, asset: acquired.value.digest, channel: effectiveChannel, markerPath, caps: options.caps });
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
      }, () => undefined);
      if (!validated.ok) return failure(validated.error, options.selector, release);
      const complete = tx.complete();
      if (!complete.ok) return failure(complete.error, options.selector, release);
      cleanup([candidate.value.backupPath, snapshot.value.path, ...(markerBackup ? [markerBackup] : [])], options.caps);
      return { type: "updated", release };
    } finally {
      removeSignals();
    }
  } finally {
    acquired.value.cleanup();
  }
}
