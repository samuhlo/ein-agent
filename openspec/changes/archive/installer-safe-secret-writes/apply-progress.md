status: complete

## // 001. Atomic filesystem contract and deterministic seam

- Completed tasks: 1.1, 1.2, 1.3.
- Added focused atomic-write tests covering same-directory exclusive temp creation, complete writes, fsync/close/revalidation/rename ordering, failure preservation, owned-temp cleanup, cleanup-error reporting, missing destinations, mode, collisions, and `O_NOFOLLOW` capability.
- Added the narrow `AtomicFsOps` seam and private atomic-write core in `installer/src/core/secrets.ts`; public secret/RC consumers remain unchanged for later groups.
- The core retries `EEXIST` temp collisions, writes fully before fsync/close, invokes pre-rename revalidation, renames only after close, and unlinks only owned temp paths while retaining primary failures.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | `bun test tests/installer-safe-secret-writes.test.ts` failed because the test-only atomic adapter was not yet exported. |
| GREEN | Implemented the seam/core; focused suite passed: 5 tests, 51 assertions. |
| TRIANGULATE | Focused suite covers missing/existing destinations, restrictive mode under umask, collision retry, failure injection, cleanup secondary errors, and conditional `O_NOFOLLOW`. |
| REFACTOR | Kept the seam local to `secrets.ts`, centralized full-write/cleanup logic, and retained consumer behavior unchanged. Focused suite remained green. |

Files changed: `installer/src/core/secrets.ts`, `tests/installer-safe-secret-writes.test.ts`, `openspec/changes/installer-safe-secret-writes/tasks.md`.
Verification: `bun test tests/installer-safe-secret-writes.test.ts` (pass).
Deviations: none; installer typecheck and consumer behavior remain assigned to later groups.
Remaining: task groups 002, 003, 004, and 005.

## // 002. No-follow target and parent validation

- Completed tasks: 2.1, 2.2, 2.3.
- Added RED coverage for missing parents, symbolic-link parents/final targets, directories, available FIFOs, pre-rename identity changes, no-content-access rejection, and referent/object preservation.
- Implemented private `lstat` classification: only an existing regular target or `ENOENT` is accepted, and the direct parent must be an existing real directory. Revalidation compares parent and destination identity/state before rename; temp creation retains `O_NOFOLLOW` when available.
- Focused suite: `bun test tests/installer-safe-secret-writes.test.ts` (11 pass, 78 assertions). Installer typecheck: `cd installer && bun run typecheck` (pass).
- TDD evidence: RED failed with temp open/content-access on unsafe paths; GREEN passed after classifier/revalidation; TRIANGULATE covered FIFO capability fallback and conditional `O_NOFOLLOW`; REFACTOR kept errors focused and consumer wiring unchanged.
- Residual risk remains the documented path-based parent/destination TOCTOU window between final validation and rename; descriptor-relative native primitives are out of scope.
- Remaining: task groups 003, 004, and 005.

## // 003. Secret writer behavior

- Completed tasks: 3.1, 3.2, 3.3.
- Added isolated-HOME subprocess coverage for empty/whitespace no-op, missing/existing regular secrets, trim plus one newline, exact `0600` under umasks `000/022/077`, symlink/directory targets, and a symlink secrets directory.
- Wired `writeSecret` to the validated atomic writer; safe directory creation now rejects symlinks/non-directories, enforces `0700`, and empty values return before filesystem changes.
- Existing atomic seam tests continue to cover open/write/fsync/close/rename failure preservation, owned-temp cleanup, cleanup-error reporting, and no partial publication.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Focused suite failed on public symlink target and symlink secrets-directory tests against direct `writeFileSync` behavior. |
| GREEN | Replaced direct secret writes with `atomicWrite` (`0600`); validated/created the secrets directory with no-follow metadata and `0700`. Focused suite passed: 16 tests, 111 assertions. |
| TRIANGULATE | Re-ran `bun test tests/installer-safe-secret-writes.test.ts`; failure-injection and unsafe-target matrix remained green, including residue and original-byte checks. |
| REFACTOR | Kept the public `writeSecret` contract unchanged and limited changes to the consumer and focused tests; no shell-RC behavior changed. |

Files changed: `installer/src/core/secrets.ts`, `tests/installer-safe-secret-writes.test.ts`, `openspec/changes/installer-safe-secret-writes/tasks.md`.
Verification: `bun test tests/installer-safe-secret-writes.test.ts` (pass).
Deviations: none; no build or broad suite run.
Remaining: task groups 004 and 005.

## // 004. Shell-RC writer behavior

- Completed tasks: 4.1, 4.2, 4.3.
- Added RED coverage for missing/existing regular RCs, exact POSIX/Fish blocks, byte preservation and separators, modes, sentinel no-write idempotency, unsafe targets, and injected publication failures.
- Updated synchronous `ensureContext7Export` to classify no-follow targets, read regular RCs through an `O_NOFOLLOW` descriptor with identity checks, preserve bytes/modes, and publish via same-directory atomic replacement with owned-temp cleanup. Public return shape and synchronous callers remain unchanged.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Focused suite failed because the RC test adapter/export was absent. |
| GREEN | Implemented the synchronous RC atomic seam and consumer; focused suite passed: 21 tests, 149 assertions. |
| TRIANGULATE | Covered POSIX/Fish, missing/trailing-newline variants, repeated sentinel calls, symlink/directory rejection, mode preservation, and open/write/fsync/close/rename cleanup behavior; shared FIFO and secondary-cleanup tests remain green. |
| REFACTOR | Kept formatting in the RC consumer, validation/publication in `secrets.ts`, and callers unchanged; no build or broad suite run. |

Files changed: `installer/src/core/secrets.ts`, `tests/installer-safe-secret-writes.test.ts`, `openspec/changes/installer-safe-secret-writes/tasks.md`.
Verification: `bun test tests/installer-safe-secret-writes.test.ts` (pass).
Deviations: none; installer typecheck remains assigned to task group 005.
Remaining: task group 005.

## // 005. Final adjacent regression and type verification

- Completed tasks: 5.1, 5.2.
- Focused regression passed: `bun test tests/installer-safe-secret-writes.test.ts` — 21 tests, 149 assertions.
- Triangulated bytes, restrictive/preserved modes, symlink referents, available FIFO rejection, injected open/write/fsync/close/rename failures, idempotent sentinel no-write behavior, and temporary residue cleanup.
- Installer typecheck passed: `cd installer && bun run typecheck`.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Final group is verification-only; prior RED evidence for the scoped behavior remains recorded in groups 001–004, with no production behavior added here. |
| GREEN | Focused regression and installer typecheck both passed. |
| TRIANGULATE | The supported FIFO fixture executed; byte/mode/referent/residue and injected-failure assertions remained green across the complete focused matrix. |
| REFACTOR | No refactor was needed; local duplication and explicit residual TOCTOU/security observations were left unchanged. |

Files changed in this group: `openspec/changes/installer-safe-secret-writes/tasks.md`, `openspec/changes/installer-safe-secret-writes/apply-progress.md`.
Deviations: none; no production build or out-of-scope audit was run. `EIN.md` and scope exclusions remain preserved.
Remaining: none.

## // 006. Safe secret existence check

- Completed tasks: 6.1, 6.2, 6.3.
- Added isolated-HOME RED coverage for missing, final symlink, directory, supported FIFO, empty regular, and populated regular secret targets.
- Updated `hasSecret()` to classify with `lstatSync`, reject symlinks/non-regular targets before reading, and return `false` for filesystem errors while preserving trimmed regular-file semantics.

### TDD Cycle Evidence

| Cycle | Evidence |
| --- | --- |
| RED | Focused suite failed on final symlink (`true`), directory (read error), and FIFO (timeout) cases before the production change. |
| GREEN | Focused suite passed: `bun test tests/installer-safe-secret-writes.test.ts` — 27 tests, 165 assertions. |
| TRIANGULATE | Matrix covered missing, symlink referent preservation, directory, available FIFO, empty regular, and populated regular targets; installer typecheck passed with `cd installer && bun run typecheck`. |
| REFACTOR | Removed the obsolete `existsSync` import; kept the public predicate contract and scope unchanged. |

Files changed: `installer/src/core/secrets.ts`, `tests/installer-safe-secret-writes.test.ts`, `openspec/changes/installer-safe-secret-writes/tasks.md`, `openspec/changes/installer-safe-secret-writes/apply-progress.md`.
Deviations: none; `EIN.md` and unrelated installer behavior were untouched.
Remaining: none.
