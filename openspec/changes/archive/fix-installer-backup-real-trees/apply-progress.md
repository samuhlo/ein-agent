status: complete

## Completed
Groups 1.1 and 2.1 remain complete: manifest v2 accepts opaque symlink nodes and hardlinks, v1 remains readable, staging/restore is non-following, destination parents are checked, and tampering is rejected before live mutation.

Group 3.1 remains complete: the Omarchy-shaped fixture covers an external `skills/omarchy` link, dependency `.bin` links, a payload over both legacy file/byte limits, included hardlinks/user files, no external traversal, successful snapshot/restore, and rejection of included over-limit state.

Group 4.1 and 5.1 remain complete: bounded backup failure causes propagate through the executor, optional journal detail is validated, and only the exact pre-mutation `both` retry preserves completed Claude work and later-Pi truthfulness.

Group 6.1 implementation is complete: startup reconstructs the read-only plan before banner/prompts/handlers, matches the journal to that plan, admits only the proven `both`/`pi.backup-current` retry, preserves completed Claude work, and blocks other valid non-complete journals before side effects.

## Files changed
`installer/src/core/backup-manifest.ts`
`installer/src/core/backup.ts`
`installer/src/core/install-executor.ts`
`installer/src/core/install-journal.ts`
`installer/src/cli/install.ts`
`tests/installer-backup.test.ts`
`tests/install-journal.test.ts`
`openspec/changes/fix-installer-backup-real-trees/tasks.md`
`openspec/changes/fix-installer-backup-real-trees/apply-progress.md`

## TDD Cycle Evidence
Group 2 RED: `bun test tests/installer-backup.test.ts -t "symlink|restore|tamper|v1|v2"` failed before link staging, linked-parent protection, and link-root durability were implemented. GREEN and TRIANGULATE passed after opaque link materialization, non-following excluded-state copy, tamper checks, and no-follow fsync/seal changes. REFACTOR remained green after descriptor-based writes and rollback-safe reinsertion.

Group 3 RED: `bun test tests/installer-backup.test.ts -t "Omarchy|real tree|dependency|hardlink"` failed because restore copied the oversized `npm` dependency root into live state. GREEN passed after `backup.ts` skipped regenerable dependency roots during excluded-state reinsertion. TRIANGULATE passed with a permission-denied external target sentinel, excluded `.bin` links, hardlinked files, and an included sparse file over `BACKUP_LIMITS.bytes`. REFACTOR passed diff hygiene and both typechecks.

Final focused seam command for group 3.1: `bun test tests/installer-backup.test.ts -t "Omarchy|real tree|dependency|hardlink"` — 2 passed, 0 failed, 22 assertions.

### Group 4.1
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Bounded backup failure context | Focused command failed before `BackupFailure` existed. | Passed operation/entry propagation, control/path/stack-channel removal, and UTF-8 bound; metadata failure covered missing entry context. | `bun test tests/install-journal.test.ts -t "backup failure|cause|detail"` — 4 passed, 27 assertions. |
| Executor preserves backup detail with generic fallback | Same RED command. | Passed returned detail propagation and generic fallback for missing/thrown non-actionable detail. | Same focused command — 4 passed, 27 assertions. |
| Truthful failed `pi.backup-current` state | Same RED command. | Passed recovery-required state, failed backup entry, non-run later Pi, and completed Claude evidence. | Same focused command — 4 passed, 27 assertions. |

### Group 5.1
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Optional bounded journal failure detail | Initial focused run failed the new valid-detail assertion before schema support. | Passed UTF-8/control/placement rejection and v1 no-detail compatibility; typechecks and diff hygiene remained green. | `bun test tests/install-journal.test.ts -t "recovery|retry|completed Claude|unsupported|interrupted"` — 6 passed, 50 assertions. |
| Exact both pre-mutation resume | Initial focused run blocked the supported retry before resume execution existed. | Passed completed-Claude preservation, failed retry truthfulness, later-Pi non-completion, and plan/target/interrupted/migration/post-mutation rejection. Full focused file: 14 passed, 145 assertions. | Same focused command — 6 passed, 50 assertions. |

### Group 6.1
| Behavior seam | RED | GREEN / TRIANGULATE / REFACTOR | Final focused command |
|---|---|---|---|
| Supported pre-mutation recovery is admitted at startup and routes only backup/later Pi work | `bun test tests/install-journal.test.ts -t "supported pre-mutation|every other valid"` failed the supported caller admission before the CLI change (1 failed, 1 passed). | GREEN passed after read-only plan matching and narrow admission. TRIANGULATE covered startup/re-entry/recovery matrix. REFACTOR remained green after plan-status fail-closed guard. | `bun test tests/install-journal.test.ts -t "supported pre-mutation|every other valid"` — 2 passed, 18 assertions. |
| Other valid non-complete journals block before banner or handlers | Same RED command (the initial fixture-directory defect was corrected in the test before production edits). | GREEN/TRIANGULATE/REFACTOR passed interrupted, post-mutation, Pi-only, complete-journal, and handler-admission cases with zero banner/handler effects on blocked paths. | Same focused command — 2 passed, 18 assertions. |

### Blocker remediation: restore fault probe
| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
|---|---|---|---|---|---|
| Restore fault injection enumerates every current restore fault point | `bun test tests/installer-backup.test.ts -t "cada ocurrencia restore revierte exactamente"` failed: expected 57, received 56. | Diagnosis found only `restore:live-fsync:dir:npm` missing: `copyExcludedState` intentionally skips regenerable `npm`, so no directory exists to fsync. Updated the stale expectation to 56; production fault points and security checks unchanged. | Full backup and three-file suites, both typechecks, and full suite passed except the unrelated vocabulary failure; dependency-exclusion/no-follow coverage remains green. | No refactor needed; diff check passed. | `bun test tests/installer-backup.test.ts` — 32 passed, 0 failed. |

## Verification
Required focused command `bun test tests/installer-backup.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts` — 50 passed, 0 failed.

Final required gates ran with the explicitly authorized document temporarily moved outside the repository via a secure `mktemp -d` directory and restored by an EXIT/INT/TERM shell trap:
- `bun test` — 2353 passed, 0 failed.
- `bun run typecheck` — passed.
- `(cd installer && bun run typecheck)` — passed.
- `git diff --check` — passed.

Before move: `docs/valoracion-estado-y-rumbo-2026-08.md`; SHA-256 `4396a17d978fd5b5ce93e9a5dfcab424e046db57b8682880d851100615648f2c`; metadata `mode=-rw-r--r--|owner=samu|group=staff|size=49053|mtime=1787216969|flags=0|birth=1787216886|path=docs/valoracion-estado-y-rumbo-2026-08.md`.
After trap restoration: original path exists as a regular non-symlink file, with the same SHA-256 and identical recorded metadata. The temporary directory was removed.

## Deviations and residual risk
The blocker was environmental: the unrelated document contained legacy SDD vocabulary. It was not edited; no production or test code was changed in this finalization, and all unrelated dirty files were preserved.

## Remaining
No group task remains unchecked. Apply is complete; verify may run its independent fresh checks.

## Group 1.1 strict-TDD remediation
The prior group 1.1 implementation evidence was absent; no historical RED/GREEN claim is backfilled. One uncovered acceptance seam was remediated: Unicode C1 control characters in opaque symlink targets are rejected before manifest acceptance.

- RED: after adding the focused test, `bun test tests/installer-backup.test.ts -t "manifest v2 rejects Unicode control targets"` failed (1 failed; parser accepted `safe\\u0085target`).
- GREEN: the same command passed (1 passed) after extending `assertLinkTarget`'s control-range check to Unicode C1 controls.
- TRIANGULATE: `bun test tests/installer-backup.test.ts -t "manifest"` passed (33 tests, 283 assertions), including existing empty/size/C0-control targets, canonical v1/v2, ordering/digest, exclusion, and hardlink cases.
- REFACTOR: no broader refactor was warranted; the minimal validation change remained green under the final focused command above.

Final task-1.1 gate: `bun test tests/installer-backup.test.ts -t "manifest|exclude|hardlink"` — 33 passed, 0 failed, 283 assertions. Named test file: `bun test tests/installer-backup.test.ts` — 33 passed, 0 failed, 283 assertions. Root `bun run typecheck` and `(cd installer && bun run typecheck)` both passed. No production build was run.

`verify-report.md` remains `status: fail` for the original evidence gap and is intentionally left for an independent verify rerun.

## Verify remediation — confirmed safety gaps

Status: complete. Both confirmed gaps are remediated with caller-level and platform-safe regressions; all assigned apply work remains complete.

### Gap A — `pi.backup-current` preserves bounded failure detail

| Stage | Exact evidence |
|---|---|
| RED | `bun test tests/install-journal.test.ts -t "pi backup caller"` — failed: 1 failed; journal detail was `undefined` instead of the bounded `BackupFailure` message. |
| GREEN | `bun test tests/install-journal.test.ts -t "pi backup caller"` — 1 passed, 0 failed, 3 assertions, after the CLI handler returned `BackupFailure.message`. |
| TRIANGULATE | `bun test tests/install-journal.test.ts -t "backup"` — 4 passed, 0 failed, 24 assertions; covered sanitization/bounds, caller propagation, executor fallback, and truthful failed state. |
| REFACTOR | `git diff --check -- installer/src/cli/install.ts tests/install-journal.test.ts` — passed; no broader abstraction added. |
| Final focused command | `bun test tests/install-journal.test.ts -t "backup"` — 4 passed, 0 failed, 24 assertions. |

### Gap B — legacy restore does not follow symlinks for chmod

| Stage | Exact evidence |
|---|---|
| RED | `bun test tests/installer-backup.test.ts -t "legacy restore recreates symlinks"` — failed: 1 failed; external target mode changed from `0o644` (`420`) to `0o600` (`384`). |
| GREEN | `bun test tests/installer-backup.test.ts -t "legacy restore recreates symlinks"` — 1 passed, 0 failed, 4 assertions, after no-follow node replacement and descriptor-based regular-file writes. |
| TRIANGULATE | `bun test tests/installer-backup.test.ts -t "legacy"` — 3 passed, 0 failed, 13 assertions; covered regular legacy restore, symlink restore, and archive rejection. |
| REFACTOR | `git diff --check -- installer/src/core/backup.ts tests/installer-backup.test.ts` — passed; symlink entries skip chmod fault handling and regular files retain compatibility fault points. |
| Final focused command | `bun test tests/installer-backup.test.ts -t "legacy"` — 3 passed, 0 failed, 13 assertions. |

### Remediation gates

- `bun test tests/installer-backup.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts` — 53 passed, 0 failed, 459 assertions.
- `bun run typecheck` — passed.
- `cd installer && bun run typecheck` — passed.
- `git diff --check -- installer/src/cli/install.ts installer/src/core/backup.ts tests/install-journal.test.ts tests/installer-backup.test.ts` — passed.
- No production build was run. No unrelated dirty files were modified.

### Remediation changes

- `installer/src/cli/install.ts` now returns only the already-sanitized `BackupFailure` detail from the Pi backup handler; non-actionable failures retain executor fallback behavior.
- `installer/src/core/backup.ts` replaces legacy `cpSync`/path `chmodSync` with no-follow node replacement; symlinks are recreated as nodes and regular files are chmodded through descriptors.
- Caller-level journal coverage and a platform-safe legacy symlink regression were added to the named focused test files.

Remaining: independent verify must rerun its fresh checks and replace the failed report if both claims remain green.
