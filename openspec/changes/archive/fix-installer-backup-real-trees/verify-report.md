status: pass
behavior_coverage: verified

# Verify report — fix-installer-backup-real-trees

## Outcome

Independent fresh verification passed after remediation. Focused backup, manifest, symlink, hardlink, journal, caller-level failure-detail, pre-mutation retry, and legacy restore no-follow behavior all passed. Full Bun suite and both typechecks passed. No production source was modified during verify.

## Spec and task coverage

- Tasks 1.1–6.1 are checked complete.
- Requirements 1–8 are covered by the focused suites: dependency exclusion before traversal/accounting, v1/v2 compatibility, opaque symlink preservation, hardlink acceptance, bounded failure causes, truthful failed journal state, exact `both` pre-mutation retry, completed-Claude preservation, rejection matrix, and legacy restore safety.
- Observable behavior coverage is verified, not build-only.

## Fresh command plan and current results

Commands were planned anew from current `openspec/config.yaml`, `design.md`, `tasks.md`, and apply evidence. Each unique scheduled command was invoked once in the current tree. The shell `timeout` executable is unavailable in this environment; each command was run with a streaming Python subprocess wrapper and a 300-second timeout. The rows record the normalized underlying commands.

| Order | Normalized command | Roles / behavior seam | Result |
|---:|---|---|---|
| 1 | `bun test tests/installer-backup.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts` | required focused gate; backup, journal, retry, completed-journal reentry | PASS — 53 passed, 0 failed, 459 assertions |
| 2 | `bun test tests/installer-backup.test.ts -t "manifest|exclude|hardlink"` | manifest v1/v2, exclusion, hardlinks, linked-node behavior | PASS — 34 passed, 0 failed, 287 assertions |
| 3 | `bun test tests/installer-backup.test.ts -t "symlink|restore|tamper|v1|v2"` | symlink staging/restore, tamper, v1/v2, parent safety | PASS — 34 passed, 0 failed, 287 assertions |
| 4 | `bun test tests/installer-backup.test.ts -t "Omarchy|real tree|dependency|hardlink"` | real-tree dependency exclusion, no traversal, hardlinks | PASS — 2 passed, 0 failed, 22 assertions |
| 5 | `bun test tests/install-journal.test.ts -t "backup failure|cause|detail"` | bounded backup cause, executor propagation, truthful failure | PASS — 6 passed, 0 failed, 34 assertions |
| 6 | `bun test tests/install-journal.test.ts -t "recovery|retry|completed Claude|unsupported|interrupted"` | exact recovery predicate, retry, Claude preservation, rejection matrix | PASS — 7 passed, 0 failed, 57 assertions |
| 7 | `bun test tests/install-journal.test.ts -t "supported pre-mutation|every other valid"` | caller startup admission and blocking unsupported journals | PASS — 2 passed, 0 failed, 18 assertions |
| 8 | `bun test tests/install-journal.test.ts -t "pi backup caller"` | caller-level bounded-detail propagation into journal | PASS — 1 passed, 0 failed, 3 assertions |
| 9 | `bun test tests/installer-backup.test.ts -t "legacy"` | legacy restore and no-follow chmod regression | PASS — 3 passed, 0 failed, 13 assertions |
| 10 | `bun test` | configured full-suite global check | PASS — 2357 passed, 0 failed, 9596 assertions |
| 11 | `bun run typecheck` | required root typecheck | PASS |
| 12 | `cd installer && bun run typecheck` | required installer typecheck | PASS |

Global-check disposition: `bun test`, root `bun run typecheck`, and `cd installer && bun run typecheck` were relevant and scheduled. No lint, format, coverage, or build command is configured or explicitly required for this change; not relevant. No production build was run, consistent with design/tasks.

## Strict-TDD audit

Strict TDD is active (`preflight.json` and `openspec/config.yaml`). `apply-progress.md` contains the required `TDD Cycle Evidence` table/evidence. Reported test files exist and were freshly executed. RED, GREEN, TRIANGULATE, and REFACTOR evidence is present for groups 1.1–6.1 and both confirmed-gap remediations. Focused assertions exercise observable filesystem and journal behavior; no tautological, ghost-loop, type-only, smoke-only, or implementation-detail CSS assertions were found. Strict-TDD compliance: PASS.

## Remediation validation

- Caller-level propagation: `pi.backup-current` returns the already-sanitized bounded `BackupFailure` detail; focused caller test passes and journal detail remains actionable/bounded.
- Legacy restore: symlink nodes are recreated without follow-capable chmod; focused regression confirms the external target mode is unchanged.
- Optional Cleaner/Architect participant pass was unavailable (`participant terminal child identity or output is missing`); advisory only and not used as verification evidence.

## Blockers and risks

No verification blockers. The test environment lacks the `timeout` binary, so bounded Python wrappers were used. Focused install tests print expected missing-dependency probe diagnostics; assertions and exit status are green.
