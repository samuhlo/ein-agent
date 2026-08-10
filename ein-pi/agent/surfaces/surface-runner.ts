import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { invokeProductionWorkbench } from "./workbench-entrypoint.ts";
import { auditCleanerReadOnly } from "../lib/cleaner-read-only-audit.ts";
import {
  applyCleanerBoundedMutation,
  assessCleanerCompletion,
  type CleanerBoundedMutationRequestV1,
  type CleanerProjectStateSnapshotV1,
  type CleanerStateTransitionRecordV1,
  type CleanerTargetFileSnapshotV1,
  type CleanerVerificationRecordV1,
} from "../lib/cleaner-bounded-mutations.ts";
import {
  projectGitStateForReviewedArea,
  projectProjectState,
  type ProjectStateRequest,
  type ProjectStateV1,
} from "../lib/project-state.ts";
import {
  AREA_ID_PATTERN,
  evaluateReviewedArea,
  normalizeLedger,
  type EvidenceResolution,
  type GitTransition,
} from "../lib/reviewed-area-ledger.ts";
import {
  readWorkspaceLedger,
  type WorkspaceLedgerRead,
} from "../lib/reviewed-area-ledger-store.ts";

export const CLEANER_REQUEST_VERSION = "cleaner-surface-request/v1" as const;
export const CLEANER_RESULT_VERSION = "cleaner-surface-result/v1" as const;
export const MAX_CLEANER_REQUEST_BYTES = 64 * 1024;
export const MAX_CLEANER_RESULT_BYTES = 64 * 1024;

const MAX_JSON_DEPTH = 12;
const MAX_JSON_VALUES = 2_048;
const MAX_JSON_STRING_BYTES = 16 * 1024;
const REASON_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const CLEANER_CAPABILITIES = ["cleaner.audit", "cleaner.mutate", "cleaner.complete"] as const;
export type CleanerCapability = (typeof CLEANER_CAPABILITIES)[number];
export type CleanerSurfaceStatus = "processed" | "usage-error" | "unavailable";
export type JsonObject = Record<string, unknown>;

export type CleanerRequest = Readonly<{
  version: typeof CLEANER_REQUEST_VERSION;
  capability: CleanerCapability;
  input: JsonObject;
}>;

export type CleanerAdapterResult = Readonly<{
  status: CleanerSurfaceStatus;
  reason: string;
  payload?: unknown;
}>;

export type CleanerResult = Readonly<{
  version: typeof CLEANER_RESULT_VERSION;
  capability: CleanerCapability | "unknown";
  status: CleanerSurfaceStatus;
  reason: string;
  payload?: unknown;
  diagnostic?: string;
}>;

export interface AuthorityReadAdapters {
  audit(input: JsonObject): CleanerAdapterResult | Promise<CleanerAdapterResult>;
  complete(input: JsonObject): CleanerAdapterResult | Promise<CleanerAdapterResult>;
}

export interface MutationWriteAdapter {
  mutate(input: JsonObject): CleanerAdapterResult | Promise<CleanerAdapterResult>;
}

export interface WorkbenchInvocationAdapter {
  invoke(args: readonly string[]): number | Promise<number>;
}

export function createProductionWorkbenchInvocationAdapter(): WorkbenchInvocationAdapter {
  return { invoke: invokeProductionWorkbench };
}

export interface SurfaceRunnerAdapters {
  authorityReads: AuthorityReadAdapters;
  mutationWriter: MutationWriteAdapter;
  workbench: WorkbenchInvocationAdapter;
}

export type AuthorityReadAssemblyDependencies = Readonly<{
  readProjectState?: (request: ProjectStateRequest) => ProjectStateV1;
}>;

export type AuthorityMutationAssemblyDependencies = AuthorityReadAssemblyDependencies & Readonly<{
  readLedger?: (cwd: string) => WorkspaceLedgerRead;
  readTarget?: (root: string, targetPath: string) => CleanerTargetFileSnapshotV1;
  writeTarget?: (root: string, targetPath: string, bytes: Readonly<Uint8Array>) => void;
}>;

export type AuthorityMutationAdapterAssembly = Readonly<{
  authorityReads: Pick<AuthorityReadAdapters, "complete">;
  mutationWriter: MutationWriteAdapter;
}>;

export type CleanerRequestParseResult =
  | Readonly<{ ok: true; request: CleanerRequest }>
  | Readonly<{ ok: false; reason: string; capability?: CleanerCapability }>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapability(value: unknown): value is CleanerCapability {
  return typeof value === "string" && CLEANER_CAPABILITIES.includes(value as CleanerCapability);
}

function boundedJsonReason(value: unknown): string | undefined {
  let values = 0;
  const visit = (candidate: unknown, depth: number): string | undefined => {
    values += 1;
    if (values > MAX_JSON_VALUES || depth > MAX_JSON_DEPTH) return "request-too-complex";
    if (candidate === null || typeof candidate === "boolean" || typeof candidate === "number") {
      return typeof candidate === "number" && !Number.isFinite(candidate) ? "invalid-json-value" : undefined;
    }
    if (typeof candidate === "string") {
      return new TextEncoder().encode(candidate).byteLength > MAX_JSON_STRING_BYTES ? "request-too-complex" : undefined;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const reason = visit(item, depth + 1);
        if (reason) return reason;
      }
      return undefined;
    }
    if (!isObject(candidate)) return "invalid-json-value";
    for (const [key, item] of Object.entries(candidate)) {
      if (UNSAFE_KEYS.has(key)) return "unsafe-request-key";
      const reason = visit(item, depth + 1);
      if (reason) return reason;
    }
    return undefined;
  };
  return visit(value, 0);
}

export function parseCleanerRequest(raw: string): CleanerRequestParseResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_CLEANER_REQUEST_BYTES) {
    return { ok: false, reason: "request-too-large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed-json" };
  }
  if (!isObject(parsed)) return { ok: false, reason: "invalid-request" };

  const keys = Object.keys(parsed);
  if (keys.some((key) => !["version", "capability", "input"].includes(key))) {
    return { ok: false, reason: "unknown-request-key" };
  }
  if (parsed.version !== CLEANER_REQUEST_VERSION) return { ok: false, reason: "unsupported-version" };
  if (!isCapability(parsed.capability)) return { ok: false, reason: "unsupported-capability" };
  const capability = parsed.capability;
  if (!keys.includes("input") || !isObject(parsed.input)) {
    return { ok: false, reason: "invalid-request", capability };
  }
  const boundedReason = boundedJsonReason(parsed.input);
  if (boundedReason) return { ok: false, reason: boundedReason, capability };

  return {
    ok: true,
    request: { version: CLEANER_REQUEST_VERSION, capability, input: parsed.input },
  };
}

const EVIDENCE_REFERENCE_PATTERN = /^review-evidence-v1:[0-9a-f]{32,64}$/;
const EVIDENCE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVIEWER_REFERENCE_PATTERN = /^reviewer-v1:sha256:[0-9a-f]{64}$/;
const STATE_REF_PATTERN = /^git-v1:sha256:[0-9a-f]{64}$/;
const SELECTED_CHANGE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;

function exactKeys(value: JsonObject, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function normalizeEvidenceResolution(value: unknown): EvidenceResolution {
  if (!isObject(value) || typeof value.status !== "string") return { status: "invalid" };
  if (["missing", "mismatch", "invalid", "unavailable"].includes(value.status)) {
    return exactKeys(value, ["status"])
      ? { status: value.status as "missing" | "mismatch" | "invalid" | "unavailable" }
      : { status: "invalid" };
  }
  if (
    value.status !== "verified" ||
    !exactKeys(value, ["status", "reference", "digest", "reviewerRef", "areaId", "stateRef"]) ||
    typeof value.reference !== "string" || !EVIDENCE_REFERENCE_PATTERN.test(value.reference) ||
    typeof value.digest !== "string" || !EVIDENCE_DIGEST_PATTERN.test(value.digest) ||
    typeof value.reviewerRef !== "string" || !REVIEWER_REFERENCE_PATTERN.test(value.reviewerRef) ||
    typeof value.areaId !== "string" || !AREA_ID_PATTERN.test(value.areaId) ||
    typeof value.stateRef !== "string" || !STATE_REF_PATTERN.test(value.stateRef)
  ) return { status: "invalid" };
  return {
    status: "verified",
    reference: value.reference,
    digest: value.digest,
    reviewerRef: value.reviewerRef,
    areaId: value.areaId,
    stateRef: value.stateRef,
  };
}

function invalidAuditInput(): CleanerAdapterResult {
  return { status: "usage-error", reason: "invalid-audit-input" };
}

/**
 * Assembles fresh B/G reads at the runtime edge. The caller identifies areas and
 * supplies evidence resolutions; only B and G derive current admission meaning.
 */
export function createAuthorityReadAdapters(
  dependencies: AuthorityReadAssemblyDependencies = {},
): AuthorityReadAdapters {
  const readProjectState = dependencies.readProjectState ?? projectProjectState;
  return {
    audit(input): CleanerAdapterResult {
      if (!exactKeys(input, ["cwd", "selectedChange", "ledger", "assessments"])) return invalidAuditInput();
      if (typeof input.cwd !== "string" || input.cwd.length === 0 || input.cwd.length > 4_096 || input.cwd.includes("\0")) {
        return invalidAuditInput();
      }
      if (input.selectedChange !== undefined && (
        typeof input.selectedChange !== "string" || !SELECTED_CHANGE_PATTERN.test(input.selectedChange)
      )) return invalidAuditInput();
      const ledger = normalizeLedger(input.ledger);
      if (!ledger || !Array.isArray(input.assessments) || input.assessments.length === 0 || input.assessments.length > 64) {
        return invalidAuditInput();
      }

      const state = readProjectState({
        cwd: input.cwd,
        ...(typeof input.selectedChange === "string" ? { selectedChange: input.selectedChange } : {}),
      });
      const current = projectGitStateForReviewedArea(state);
      const assessments = input.assessments.map((candidate) => {
        if (!isObject(candidate) || !exactKeys(candidate, ["areaId", "evidence", "transition"]) ||
          typeof candidate.areaId !== "string" || !AREA_ID_PATTERN.test(candidate.areaId)) return undefined;
        const record = ledger.records.find(({ area }) => area.id === candidate.areaId);
        if (!record) return undefined;
        const evidence = normalizeEvidenceResolution(candidate.evidence);
        const transition = candidate.transition === undefined ? undefined : candidate.transition as GitTransition;
        return {
          area: record.area,
          evidence,
          evaluation: evaluateReviewedArea(ledger, record.area.id, current, transition, evidence),
        };
      });
      if (assessments.some((assessment) => assessment === undefined)) return invalidAuditInput();

      return {
        status: "processed",
        reason: "audit-processed",
        payload: auditCleanerReadOnly({ state, assessments: assessments as Exclude<(typeof assessments)[number], undefined>[] }),
      };
    },
    complete(): CleanerAdapterResult {
      return { status: "unavailable", reason: "capability-not-wired" };
    },
  };
}

function validCwd(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096 && !value.includes("\0");
}

function projectSnapshot(state: ProjectStateV1): CleanerProjectStateSnapshotV1 {
  return {
    stateRef: state.git.stateRef ?? "state-unavailable",
    complete: state.git.repository === true && state.git.complete && state.git.quality === "current",
    conflicted: state.git.changes.some((change) => change.kind === "unmerged" || change.indexStatus === "U" || change.worktreeStatus === "U"),
  };
}

function canonicalTarget(root: string, targetPath: string): string {
  const absoluteRoot = resolve(root);
  const physicalRoot = realpathSync(absoluteRoot);
  const rootStat = lstatSync(absoluteRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || physicalRoot !== absoluteRoot) throw new Error("unsafe-project-root");
  const candidate = resolve(physicalRoot, targetPath);
  const relation = relative(physicalRoot, candidate);
  if (!relation || relation.startsWith("..") || isAbsolute(relation)) throw new Error("unsafe-target");
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("unsafe-target");
  const physicalTarget = realpathSync(candidate);
  const physicalRelation = relative(physicalRoot, physicalTarget);
  if (!physicalRelation || physicalRelation.startsWith("..") || isAbsolute(physicalRelation)) throw new Error("unsafe-target");
  return physicalTarget;
}

function filesystemTargetRead(root: string, targetPath: string): CleanerTargetFileSnapshotV1 {
  const path = canonicalTarget(root, targetPath);
  const bytes = readFileSync(path);
  return {
    bytes: new Uint8Array(bytes),
    digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    kind: "regular",
    isSymlink: false,
    isRegular: true,
  };
}

function filesystemTargetWrite(root: string, targetPath: string, bytes: Readonly<Uint8Array>): void {
  const path = canonicalTarget(root, targetPath);
  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const descriptor = openSync(path, constants.O_WRONLY | noFollow);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile()) throw new Error("unsafe-target");
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, new Uint8Array(bytes));
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function blockedMutation(reason: string): CleanerAdapterResult {
  return { status: "processed", reason, payload: { status: "blocked", reason } };
}

/**
 * Assembles H/I mutation and completion at the runtime edge. Every engine read
 * calls B/G again; the writer remains one synchronous, project-root-bound seam.
 */
export function createAuthorityMutationAdapters(
  dependencies: AuthorityMutationAssemblyDependencies = {},
): AuthorityMutationAdapterAssembly {
  const readProjectState = dependencies.readProjectState ?? projectProjectState;
  const readLedger = dependencies.readLedger ?? readWorkspaceLedger;
  const readTarget = dependencies.readTarget ?? filesystemTargetRead;
  const writeTarget = dependencies.writeTarget ?? filesystemTargetWrite;

  return {
    mutationWriter: {
      mutate(input): CleanerAdapterResult {
        if (!exactKeys(input, ["cwd", "areaId", "evidence", "transition", "request"]) ||
          !validCwd(input.cwd) || typeof input.areaId !== "string" || !AREA_ID_PATTERN.test(input.areaId) ||
          !isObject(input.request)) return { status: "usage-error", reason: "invalid-mutation-input" };
        const request = input.request as CleanerBoundedMutationRequestV1;
        const selectedChange = isObject(request.declaration) && typeof request.declaration.changeId === "string"
          ? request.declaration.changeId
          : undefined;
        const stateRequest: ProjectStateRequest = {
          cwd: input.cwd,
          ...(selectedChange ? { selectedChange } : {}),
        };
        const rootState = readProjectState(stateRequest);
        const root = rootState.identity.repositoryRoot ?? rootState.git.root;
        if (typeof root !== "string" || root.length === 0) return blockedMutation("state-unavailable");

        let authorityUnavailable = false;
        const finding = () => {
          const state = readProjectState(stateRequest);
          let source: WorkspaceLedgerRead;
          try { source = readLedger(input.cwd as string); } catch {
            authorityUnavailable = true;
            return null;
          }
          if (source.status !== "valid" && source.status !== "absent") {
            authorityUnavailable = true;
            return null;
          }
          const record = source.ledger.records.find(({ area }) => area.id === input.areaId);
          if (!record) return null;
          const evidence = normalizeEvidenceResolution(input.evidence);
          const transition = input.transition === undefined ? undefined : input.transition as GitTransition;
          const evaluation = evaluateReviewedArea(
            source.ledger,
            record.area.id,
            projectGitStateForReviewedArea(state),
            transition,
            evidence,
          );
          return auditCleanerReadOnly({ state, assessments: [{ area: record.area, evaluation, evidence }] }).findings[0] ?? null;
        };
        const outcome = applyCleanerBoundedMutation(request, {
          projectState: { project: () => projectSnapshot(readProjectState(stateRequest)) },
          finding: { resolve: () => {
            const current = finding();
            if (authorityUnavailable) throw new Error("authority-unavailable");
            return current;
          } },
          target: { read: (targetPath) => readTarget(root, targetPath) },
          writer: { write: (targetPath, bytes) => writeTarget(root, targetPath, bytes) },
        });
        return { status: "processed", reason: outcome.reason, payload: outcome };
      },
    },
    authorityReads: {
      complete(input): CleanerAdapterResult {
        if (!exactKeys(input, ["cwd", "selectedChange", "transition", "verification"]) ||
          !validCwd(input.cwd) || typeof input.selectedChange !== "string" || !SELECTED_CHANGE_PATTERN.test(input.selectedChange) ||
          !isObject(input.transition) || (input.verification !== null && !isObject(input.verification))) {
          return { status: "usage-error", reason: "invalid-completion-input" };
        }
        const state = readProjectState({ cwd: input.cwd, selectedChange: input.selectedChange });
        const verification = state.verification;
        const outcome = assessCleanerCompletion(
          input.transition as CleanerStateTransitionRecordV1,
          input.verification as CleanerVerificationRecordV1 | null,
          {
            projectState: { project: () => projectSnapshot(state) },
            router: {
              verification: () => ({
                outcome: verification.effectiveOutcome,
                stale: verification.freshness === "stale",
              }),
            },
          },
        );
        return { status: "processed", reason: outcome.reason, payload: outcome };
      },
    },
  };
}

function diagnosticResult(
  capability: CleanerCapability | "unknown",
  status: Extract<CleanerSurfaceStatus, "usage-error" | "unavailable">,
  reason: string,
  diagnostic?: string,
): CleanerResult {
  return {
    version: CLEANER_RESULT_VERSION,
    capability,
    status,
    reason,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function normalizeAdapterResult(capability: CleanerCapability, candidate: unknown): CleanerResult {
  if (!isObject(candidate)) {
    return diagnosticResult(capability, "unavailable", "invalid-adapter-result", "Surface adapter returned an invalid result");
  }
  const keys = Object.keys(candidate);
  const validStatus = candidate.status === "processed" || candidate.status === "usage-error" || candidate.status === "unavailable";
  const validReason = typeof candidate.reason === "string" && REASON_PATTERN.test(candidate.reason);
  const payloadReason = "payload" in candidate ? boundedJsonReason(candidate.payload) : undefined;
  const base = {
    version: CLEANER_RESULT_VERSION,
    capability,
    status: candidate.status,
    reason: candidate.reason,
    ...(candidate.payload === undefined ? {} : { payload: candidate.payload }),
  };
  const encodedBytes = new TextEncoder().encode(JSON.stringify(base)).byteLength;
  if (keys.some((key) => !["status", "reason", "payload"].includes(key)) || !validStatus || !validReason || payloadReason || encodedBytes > MAX_CLEANER_RESULT_BYTES) {
    return diagnosticResult(capability, "unavailable", "invalid-adapter-result", "Surface adapter returned an invalid result");
  }
  return base as CleanerResult;
}

export async function runCleanerRequest(raw: string, adapters: SurfaceRunnerAdapters): Promise<CleanerResult> {
  const parsed = parseCleanerRequest(raw);
  if (!parsed.ok) {
    return diagnosticResult(parsed.capability ?? "unknown", "usage-error", parsed.reason);
  }

  const { capability, input } = parsed.request;
  try {
    const adapterResult = capability === "cleaner.audit"
      ? await adapters.authorityReads.audit(input)
      : capability === "cleaner.mutate"
        ? await adapters.mutationWriter.mutate(input)
        : await adapters.authorityReads.complete(input);
    return normalizeAdapterResult(capability, adapterResult);
  } catch {
    return diagnosticResult(capability, "unavailable", "adapter-failed", "Surface adapter failed");
  }
}

export type SurfaceRunnerResult =
  | Readonly<{ kind: "cleaner"; result: CleanerResult }>
  | Readonly<{ kind: "workbench"; exitCode: number }>
  | Readonly<{ kind: "activation-failure"; reason: "unsupported-activation" }>;

/** Shared dispatch seam. Launchers provide transport only; production adapters are assembled here. */
export async function runSurfaceRunner(args: readonly string[], adapters: SurfaceRunnerAdapters): Promise<SurfaceRunnerResult> {
  if (args[0] === "workbench") {
    return { kind: "workbench", exitCode: await adapters.workbench.invoke(args.slice(1)) };
  }
  if (args[0] === "cleaner" && typeof args[1] === "string") {
    return { kind: "cleaner", result: await runCleanerRequest(args[1], adapters) };
  }
  return { kind: "activation-failure", reason: "unsupported-activation" };
}

export function createProductionSurfaceRunnerAdapters(): SurfaceRunnerAdapters {
  const reads = createAuthorityReadAdapters();
  const mutations = createAuthorityMutationAdapters();
  return {
    authorityReads: {
      audit: reads.audit,
      complete: mutations.authorityReads.complete,
    },
    mutationWriter: mutations.mutationWriter,
    workbench: createProductionWorkbenchInvocationAdapter(),
  };
}

export async function runProductionSurfaceRunnerCli(args: readonly string[]): Promise<number> {
  const outcome = await runSurfaceRunner(args, createProductionSurfaceRunnerAdapters());
  if (outcome.kind === "workbench") return outcome.exitCode;
  if (outcome.kind === "activation-failure") {
    process.stderr.write("Surface activation unsupported\n");
    return 64;
  }
  process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
  return outcome.result.status === "processed" ? 0 : outcome.result.status === "usage-error" ? 64 : 69;
}

if (import.meta.main) {
  process.exitCode = await runProductionSurfaceRunnerCli(process.argv.slice(2));
}
