# Tasks — installer-safe-secret-writes

status: ready
blocked_by: none

## // 001. Atomic filesystem contract and deterministic seam

- [x] 1.1 Add RED tests in `tests/installer-safe-secret-writes.test.ts` for a same-directory exclusive temporary file, complete write/flush/close ordering, atomic rename, owned-temp cleanup, and preservation of an existing destination after injected open/write/fsync/close/rename failures.
  - skills: `ein-discipline`, `architecture`
  - why: Establishes executable proof for the foundational transaction before either consumer is changed.
  - learn: Atomic publication means the destination is untouched until a fully written temporary file is committed.
  - architecture: Keep the filesystem seam narrow and private to `secrets.ts`; tests inject fail-once operations rather than relying on permissions.
  - avoid: Building a repository-wide filesystem library or using direct destination writes.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 1.2 Implement the private atomic-write helper and `AtomicFsOps` seam in `installer/src/core/secrets.ts`, changing the direct-write path to same-directory `O_CREAT|O_EXCL|O_WRONLY` temporary creation, `0600` creation, full write, fsync, close, pre-rename revalidation, and rename; clean only owned temp paths while preserving the primary error and reporting cleanup failure secondarily.
  - skills: `ein-discipline`, `architecture`
  - why: Supplies the shared safety boundary required by both secret and RC writers without broadening scope.
  - learn: Rename is the commit point; cleanup must never delete the destination or convert failure into success.
  - architecture: The helper owns transaction ordering and failure truthfulness; public functions retain their existing signatures and return shapes.
  - avoid: Claiming path checks eliminate the documented residual parent/destination TOCTOU race.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 1.3 TRIANGULATE the helper against missing destinations, existing regular destinations, umask-independent mode assertions, temp-name collisions, and cross-platform availability of `O_NOFOLLOW`; then REFACTOR only naming/duplication without changing the contract.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms the helper’s invariants across supported Bun/Node filesystem behavior before consumers depend on it.
  - learn: Portable security code must test both the strongest available no-follow flag path and the identity-check fallback.
  - architecture: Keep platform-specific flag detection inside the filesystem seam, not in callers or tests.
  - avoid: Permission-denial fixtures or unconditional FIFO/socket assumptions that fail on some platforms.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

## // 002. No-follow target and parent validation

- [x] 2.1 Add RED tests for missing safe parents, symlink destinations, directories, and available FIFO/socket/device or other non-regular targets; assert rejection occurs before content access and leaves symlink referents and original objects unchanged.
  - skills: `ein-discipline`, `architecture`
  - why: Encodes fail-closed classification for every unsafe object in the behavior matrix.
  - learn: `lstat`-style classification is required; `stat` and existence checks can follow links.
  - architecture: Validate the direct parent and final target in `secrets.ts`; RC parents must already be real directories, while the secrets directory may be created then validated as `0700`.
  - avoid: Following a symlink to inspect sentinel/content or opening a directory/special file for I/O.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 2.2 GREEN-implement private no-follow classifiers in `installer/src/core/secrets.ts`, distinguishing only `ENOENT` from existing regular files and rejecting symbolic links, directories, special files, and unsafe parents before reads or temporary creation; revalidate identity/state immediately before commit.
  - skills: `ein-discipline`, `architecture`
  - why: Makes both writers share one explicit safe-target policy.
  - learn: A missing target is creatable only when its direct parent is an existing non-symbolic directory.
  - architecture: Keep classification and identity verification adjacent to the atomic helper; do not alter paths/platform/install boundaries.
  - avoid: Expanding into ancestor-wide secure-path infrastructure or native `openat2`/`renameat2` bindings.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 2.3 TRIANGULATE cross-platform fixtures and fallback behavior, including skipped-only-when-unavailable special-file cases and `O_NOFOLLOW` absence; REFACTOR to keep rejection errors observable and focused.
  - skills: `ein-discipline`, `architecture`
  - why: Prevents tests from passing only on one Unix filesystem while preserving portability.
  - learn: Platform capability differences belong in explicit fixture setup, not weakened production validation.
  - architecture: Tests use temporary directories and isolated HOME; production remains Bun/Node-only.
  - avoid: Touching real home/system paths or treating unsupported fixture creation as a production success.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

## // 003. Secret writer behavior

- [x] 3.1 Add RED tests for empty/whitespace no-op, missing and existing regular secret targets, trimmed value plus exactly one newline, exact `0600` result under varying umask, and failure cleanup/no partial publication.
  - skills: `ein-discipline`, `architecture`
  - why: Preserves the existing secret contract while proving restrictive atomic replacement.
  - learn: Empty input must return before directory, target, or temp-file creation.
  - architecture: Exercise public `writeSecret` through an isolated temporary HOME established before importing path constants.
  - avoid: Changing secret format, adding encryption/keyrings, or testing through real user configuration.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 3.2 GREEN-wire `writeSecret` in `installer/src/core/secrets.ts` to validate/create the secrets directory safely, classify the target, and publish trimmed content through the foundational helper with `0600` from creation through commit; preserve `false` for empty values and `true` for successful non-empty writes.
  - skills: `ein-discipline`, `architecture`
  - why: Removes direct truncating writes and post-write best-effort chmod from the secret flow.
  - learn: Restrictive mode must be applied at temporary-file creation, not after plaintext publication.
  - architecture: `writeSecret` owns secret formatting and directory policy; the helper owns transaction mechanics.
  - avoid: Opening the destination for writing or swallowing chmod/rename/cleanup failures.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 3.3 TRIANGULATE secret failures at open/write/fsync/close/rename/unlink and rejected target cases, then REFACTOR only after all bytes, modes, and residue assertions pass.
  - skills: `ein-discipline`, `architecture`
  - why: Demonstrates that each failure remains visible and cannot publish partial secrets.
  - learn: Deterministic fail-once injection is more reliable than filesystem permission assumptions, especially under privileged runners.
  - architecture: Keep `hasSecret` behavior unchanged except minimal shared safety reuse required to avoid bypassing unsafe targets.
  - avoid: Including unrelated installer callers or audit findings in this slice.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

## // 004. Shell-RC writer behavior

- [x] 4.1 Add RED tests for missing RCs, existing regular RC byte preservation with/without trailing newline, Fish/POSIX block compatibility, sentinel idempotency, modes, unsafe targets, and injected failure cleanup.
  - skills: `ein-discipline`, `architecture`
  - why: Locks down shell-specific behavior while proving no rewrite occurs for an already-sentinelized RC.
  - learn: Sentinel detection is valid only after no-follow regular-file validation and safe descriptor reading.
  - architecture: Pass temporary `Platform` objects directly; preserve existing shell detection and block text.
  - avoid: Rewriting unrelated RC bytes, embedding the API key, or creating a temp file on `changed: false`.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 4.2 GREEN-update `ensureContext7Export` in `installer/src/core/secrets.ts` to validate before reading, read existing regular RCs through the safe descriptor path, preserve bytes, append exactly the required separator/block, and atomically create/replace via the helper while returning the existing `{ changed, rc }` shape.
  - skills: `ein-discipline`, `architecture`
  - why: Hardens RC publication without changing sentinel semantics or shell output.
  - learn: Existing RC permission bits are preserved; a missing RC is no more permissive than `0600`.
  - architecture: RC formatting stays in the consumer; validation, commit, and cleanup stay in the foundational helper.
  - avoid: Creating RC parents implicitly when the contract requires a safe existing direct parent.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 4.3 TRIANGULATE repeated idempotent calls, Fish/POSIX cases, missing/existing modes, special files where supported, and write/flush/close/rename/cleanup failures; REFACTOR without changing sentinel text or caller error propagation.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms compatibility and truthful failures at the second consumer boundary.
  - learn: Idempotency is a no-write guarantee, not merely avoiding duplicate text.
  - architecture: Leave `installer/src/cli/install.ts`, `paths.ts`, and `platform.ts` behavior unchanged as contract boundaries.
  - avoid: Adding catches or logging that would hide failures from the existing installer error path.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

## // 005. Final adjacent regression and type verification

- [x] 5.1 Run the focused regression suite and inspect bytes, modes, symlink referents, available special-file rejection, and temporary-directory residue across supported host platforms.
  - skills: `ein-discipline`, `architecture`
  - why: Verifies the complete security and compatibility matrix after both consumers are integrated.
  - learn: Filesystem safety is observable through both content and side effects, not only return values.
  - architecture: Keep verification limited to the scoped test and installer runtime; do not expand into unrelated audits.
  - avoid: Treating unavailable platform fixtures as failures or skipping ordinary missing/regular/symlink cases.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 5.2 Run installer typechecking and adjacent installer regression checks, confirming existing callers still propagate failures through the current failed-runtime/exit-code path.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures the private seam and unchanged public contracts compile and integrate with installer callers.
  - learn: A focused security change is complete only when its boundary contracts remain type-safe.
  - architecture: Verify `installer/src/core/secrets.ts` integration without redesigning `install.ts` or unrelated runtime flows.
  - avoid: Running or modifying checksum, tar, release, CI/E2E, encryption, or other out-of-scope behavior.
  - verify: `cd installer && bun run typecheck`

## // 006. Safe secret existence check

- [x] 6.1 Add RED coverage in `tests/installer-safe-secret-writes.test.ts` proving `hasSecret()` does not follow final symlinks and returns `false` for missing targets, symlinks, directories, and non-regular targets; preserve assertions that valid regular secret files return `true` or `false` according to their existing content behavior.
  - skills: `ein-discipline`, `architecture`
  - why: Closes the verify-found gap where existence checks could classify unsafe targets through final-link traversal.
  - learn: Existence is not equivalent to a safe readable secret file; final-target type must be established without following symlinks.
  - architecture: Keep the public `hasSecret()` contract unchanged and place no-follow classification at the secrets boundary.
  - avoid: Reusing `stat` or an existence probe that follows the final symlink, or weakening valid-file content assertions.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 6.2 GREEN-update `hasSecret()` in `installer/src/core/secrets.ts` to inspect only a regular non-symlink target before reading, preserve existing `true`/`false` behavior for valid regular secret files, and safely return `false` for filesystem errors and unsafe target types.
  - skills: `ein-discipline`, `architecture`
  - why: Makes secret verification fail closed without changing the established valid-secret semantics.
  - learn: `lstat`-style inspection prevents final symlink traversal, while guarded reads keep transient filesystem failures non-fatal.
  - architecture: `hasSecret()` owns read verification and error-to-false handling; shared write transaction behavior remains untouched.
  - avoid: Following links before classification, treating directories/special files as readable secrets, or propagating routine filesystem errors from this predicate.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts`

- [x] 6.3 TRIANGULATE the focused existence matrix, then run the installer typecheck and REFACTOR only naming/duplication without changing the public result contract.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms the late hardening integrates with the installer while retaining all prior safe-write behavior.
  - learn: A narrow regression fix still needs both behavioral proof and type-level integration verification.
  - architecture: Limit changes to `installer/src/core/secrets.ts` and `tests/installer-safe-secret-writes.test.ts`; do not expand adjacent installer scope.
  - avoid: Editing completed groups, introducing new shared abstractions, or broadening verification into unrelated installer systems.
  - verify: `bun test tests/installer-safe-secret-writes.test.ts && (cd installer && bun run typecheck)`
