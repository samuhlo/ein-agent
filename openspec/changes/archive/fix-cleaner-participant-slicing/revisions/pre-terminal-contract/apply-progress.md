status: complete

## Group // 001 — Authoritative Cleaner limits contract

Completed task 1.1 only. Exported the frozen `CLEANER_AUDIT_LIMITS` contract from the Cleaner audit boundary, switched both collector cap checks to it without changing rejection codes, and made participant planning carry the same contract in its Cleaner task.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Audit collection enforces the immutable shared file/UTF-8 limits | `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts` failed because `CLEANER_AUDIT_LIMITS` was not exported | Same focused command: 43 passed | New audit-limit test: 1 passed; existing audit suite retained cap rejection coverage | Final focused command below: audit suite passed (5 tests) |
| Participant planning consumes the same limits contract | Same RED command: import failed before tests | Same focused command: 43 passed | New planning-limit test: 1 passed | Final focused command below: participant suite passed (38 tests) |

Final focused verification (associated with both seams): `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts` — 43 passed, 0 failed.
Type-check: `bun run typecheck` — passed.

## Files changed

`ein-pi/agent/lib/cleaner-audit-evidence.ts`
`ein-pi/agent/lib/sdd-participants.ts`
`ein-pi/agent/lib/sdd-preflight.ts`
`ein-pi/agent/extensions/ein-ai.ts`
`ein-pi/agent/lib/continuity-checkpoint.ts`
`tests/cleaner-audit-evidence.test.ts`
`tests/sdd-participants.test.ts`
`tests/continuity-checkpoint.test.ts`
`openspec/changes/fix-cleaner-participant-slicing/tasks.md`
`openspec/changes/fix-cleaner-participant-slicing/apply-progress.md`

## Deviations and residual risks

- At group // 001 completion, group // 003 onward remained pending; checkpoint schema work was assigned to group // 003.
- Planning blockers are deterministic participant-plan evidence; durable per-slice state, migration, and Architect progression remain pending.

## Group // 002 — Deterministic slice planner and limits

Completed tasks 2.1 and 2.2 only. Changed-scope admission now builds an immutable sorted snapshot with raw byte totals and digests, emits contiguous greedy slices under the shared limits, and exposes stable planner/slice IDs. Oversized, invalid UTF-8, and authoritative Cleaner contract-rejected selectors remain represented by immutable blocker descriptors; blocked plans expose no runnable task. Equivalent changed-file declaration ordering preserves the passage identity.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Deterministic contiguous Cleaner slices cover sorted scope once and respect authoritative limits | `bun test tests/sdd-participants.test.ts` — 3 planner tests failed (`slices` absent and IDs differed) | Same focused command — 41 passed, 0 failed | `bun test tests/sdd-participants.test.ts --test-name-pattern 'changed-file scope admission'` — 10 passed, 0 failed | Canonical path comparator refactor; final `bun test tests/sdd-participants.test.ts` — 44 passed, 0 failed |
| Impossible or authoritative-rejected scope is represented as a blocker with no admitted task | `bun test tests/sdd-participants.test.ts --test-name-pattern 'RED: (oversized|non-UTF-8|Cleaner contract)'` — 3 failed | Same command — 3 passed, 0 failed | `bun test tests/sdd-participants.test.ts --test-name-pattern 'changed-file scope admission'` — 13 passed, 0 failed | Immutable blocker-constructor refactor; final `bun test tests/sdd-participants.test.ts` — 44 passed, 0 failed |

Type-check: `bun run typecheck` — passed. `git diff --check` — passed.

## Group // 003 — Versioned participant checkpoint schema

Completed task 3.1 only. Added strict outer checkpoint v3 support with canonical sliced generations, slice descriptors/results, planning blockers, Architect binding state, bounded prior generations, and revision/serialization validation. Existing v1/v2 parsing remains compatible; migration and durable consumers remain out of scope.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Canonical v3 sliced payload round-trips with a revision | `bun test tests/continuity-checkpoint.test.ts` — import failed because `withSddParticipantsV3` was absent | Same command — 19 passed, 0 failed | `bun test tests/continuity-checkpoint.test.ts --test-name-pattern 'v3|Cleaner slice limits'` — 3 passed, 0 failed | Enforced complete-result state binding; final focused command below — 19 passed, 0 failed |
| Ranges, IDs, transitions, chains, and Architect ordering reject malformed evidence | Same RED command — module export failure before tests | Same focused command — 19 passed, 0 failed | Same targeted command — 3 passed, 0 failed | Final focused command below — 19 passed, 0 failed |
| Cleaner limits and 32 KiB serialization ceiling fail closed | Same RED command — module export failure before tests | Same focused command — 19 passed, 0 failed | Same targeted command — 3 passed, 0 failed | Final focused command below — 19 passed, 0 failed |

Final focused verification (associated with all three seams): `bun test tests/continuity-checkpoint.test.ts` — 19 passed, 0 failed. Type-check: `bun run typecheck` — passed. `git diff --check` — passed.

## Deviations and residual risks

- Production scope stayed within `ein-pi/agent/lib/continuity-checkpoint.ts`; focused schema tests were added in `tests/continuity-checkpoint.test.ts`.
- Group // 004 onward remains pending: legacy migration, durable per-slice execution, and participant routing/Architect integration are not implemented.

## Group // 004 — Legacy migration and bounded prior-generation evidence

Completed task 4.1 only. Added deterministic v1/v2-to-v3 migration with a legacy contract planner identity, prior-generation retention, one-identical-slice carry-forward, non-fan-out behavior for split plans, blocked-evidence preservation, and fail-closed history/serialization bounds. Group // 005 onward remains untouched.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Legacy v1/v2 checkpoints migrate to a gated v3 generation and carry one identical slice only | `bun test tests/continuity-checkpoint.test.ts` — missing migration export (0 passed, 1 failed) | Same command — migration tests passed | `bun test tests/continuity-checkpoint.test.ts --test-name-pattern 'reads v1|carries one identical|preserves blocked'` — 4 passed | Typed v3 migration result and deterministic legacy identity; final `bun test tests/continuity-checkpoint.test.ts` — 22 passed, 0 failed |
| Blocked legacy evidence remains retained and bounded history/serialization overflow rejects without eviction | RED import failure above | Same focused suite — blocked/history/overflow assertions passed | Same targeted command — 4 passed, 0 failed | Final focused command above — 22 passed, 0 failed |

Type-check: `bun run typecheck` — passed. `git diff --check` — passed.

## Deviations and residual risks

- Production scope stayed within `ein-pi/agent/lib/continuity-checkpoint.ts`; focused migration tests are in `tests/continuity-checkpoint.test.ts`.
- Migration requires a non-empty changed-path snapshot to represent archived legacy work as a valid bounded slice; invalid/overflowing candidates remain blocked.
- Group // 005 onward remains pending; durable admission/state-machine consumers are not implemented.

## Group // 005 — Durable per-slice admission and evidence state

Completed task 5.1 only. Cleaner slices now use the v3 checkpoint generation for durable pending/admitted/terminal state, optimistic revision-CAS admission/result publication, restart-safe missing-result blocking, frontier chaining, and fail-closed blocked/failed/stale outcomes. Duplicate terminal callbacks do not mutate durable evidence. Group // 006 onward remains untouched.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Admission is durable and a restart after admission blocks instead of rerunning | `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint-store.test.ts` — 5 new group tests failed against the pre-v3 participant path | `bun test tests/sdd-participants.test.ts --test-name-pattern 'automatic SDD participant sequence|durable per-slice admission and evidence'` — 19 passed | Same targeted participant command — 19 passed, 0 failed | Final focused command below — participant/store suites passed |
| Complete, blocked, failed/ambiguous, stale, duplicate, and chained slice evidence advance only the expected frontier | Same RED command — durable group assertions failed before implementation | Same GREEN command — 19 passed, 0 failed | `bun test tests/sdd-participants.test.ts --test-name-pattern 'durable per-slice admission and evidence|automatic SDD participant sequence'` — 19 passed | Final focused command below — 74 passed, 0 failed |
| Revision-conditional publication retains store CAS guarantees | Existing focused store coverage ran in the RED command while participant tests failed | `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint-store.test.ts` — 74 passed | `bun test tests/continuity-checkpoint-store.test.ts --test-name-pattern 'CAS conflicts|writes canonical|lock contention'` — 3 passed | Final focused command below — 74 passed, 0 failed |

Final focused verification (associated with all three seams): `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint-store.test.ts` — 74 passed, 0 failed. Type-check: `bun run typecheck` — passed. `git diff --check` — passed.

## Deviations and residual risks

- Production scope stayed within `ein-pi/agent/lib/sdd-participants.ts`; focused behavior coverage was added/updated in `tests/sdd-participants.test.ts`. Existing v2-only assertions were updated to inspect the durable v3 generation.
- Source mutation after Cleaner admission is recorded as stale and keeps the acquired generation blocked; recovery/reinitialization remains for later groups.
- Architect v3 admission/result persistence is retained only to keep the existing participant sequence operational; final-state seal binding/routing work remains Group // 006.

## Group // 006 — Participant routing and Architect final-state binding

Completed tasks 6.1 and 6.2 only. Participant task markers now carry unit, slice, exact range, and expected state identity; admission requires the exact current task and terminal results are tied to the admitted task. Cleaner progression remains sequential and stale/late identities fail closed. After the final current Cleaner slice, Architect receives a durable pending binding to a freshly recomputed full-scope seal; stale source or Architect evidence blocks verify. Existing foreground routing remains covered and unchanged.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Slice-qualified Cleaner routing rejects stale/late tasks and results while preserving the state frontier | `bun test tests/sdd-participants.test.ts` — 50 passed, 3 failed after adding routing tests | Same focused suite after implementation — 53 passed, 0 failed | Targeted participant sequence, durable-slice, routing, and foreground tests — 26 passed, 0 failed | Added durable expected-state/task checks; final `bun test tests/sdd-participants.test.ts` — 53 passed, 0 failed |
| Architect is unavailable before all slices and binds to a fresh final full-scope seal; stale source/task/result blocks verify | Same RED command — fresh binding and identity assertions failed before implementation | Same focused suite — 53 passed, 0 failed | Targeted routing/Architect and sequence tests — 26 passed, 0 failed | Final `bun test tests/sdd-participants.test.ts` — 53 passed, 0 failed |
| Participant delegation remains foreground-only for the qualified marker family | Existing focused regression was green during RED; no production edge change was required | Targeted foreground tests — 3 passed, 0 failed | Targeted command included all foreground cases — 3 passed, 0 failed | Final full focused command above retained foreground coverage |

Type-check: `bun run typecheck` — passed. Group scope: participant implementation plus focused participant tests only. Group // 007 onward remains pending; apply status stays `partial`.

## Group // 007 — Blocked-generation recovery and integration edges

Completed tasks 7.1 and 7.2 only. Blocked v3 generations now remain immutable for unchanged apply/planner identities; a changed apply or planner identity archives the complete current generation through revision-CAS and starts one fresh gated generation. Prior blockers/results are retained, serialization/CAS failures remain fail-closed, and acquired participant disablement pauses issuance without shrinking the durable order. Slice-qualified markers alone trigger foreground wiring; installer scope was untouched. Group // 008 remains pending; apply status stays `partial`.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Unchanged blocked generations stay identical; changed apply/planner identities archive evidence and create one fresh generation | Focused command: 97 passed, 6 failed, including both recovery tests before implementation | `bun test tests/sdd-participants.test.ts` — 56 passed, 0 failed | `bun test tests/sdd-participants.test.ts --test-name-pattern 'blocked-generation recovery'` — 2 passed, 0 failed | Final focused command below — 103 passed, 0 failed |
| Acquired participant disablement remains a durable verify gate while re-enable restores issuance | Same RED command failed the updated disablement expectations | Same participant suite — 56 passed, 0 failed | Targeted disablement pattern — 3 passed, 0 failed | Final focused command below — 103 passed, 0 failed |
| Slice-qualified participant markers preserve foreground-only execution and reject expired unqualified wiring | Same RED command failed the expired-marker edge | Same participant suite — 56 passed, 0 failed | Targeted foreground pattern — 4 passed, 0 failed | Final focused command below — 103 passed, 0 failed |
| Revision-CAS publication preserves the prior checkpoint on conflict | Existing store CAS contract remained green during RED; no store implementation change was required | Focused store suite — 25 passed, 0 failed | Existing CAS/conflict and lock/readback cases — passed | Final focused command below — store cases passed |

Final focused verification (associated with every seam): `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts` — 103 passed, 0 failed. Type-check: `bun run typecheck` — passed. `git diff --check` — passed.

## Deviations and residual risks

- `continuity-checkpoint-store.ts` already provided the required atomic revision-CAS boundary, so no production store edit was needed; reinitialization uses it without bypassing conflicts.
- The repository has `ein-pi/agent/extensions/ein-ai.ts` (not `ein-pi/agent/lib/ein-ai.ts`); only that existing adapter edge was updated.
- Group // 008 integration/full verification remains intentionally untouched.

## Group // 008 — Integration and verification gates

Task 8.2 is complete. No production changes were made in this verification-only group. Task 8.1 remains blocked because the required full root test gate reported two unrelated failures; all participant-focused checks and both typechecks passed.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Restart preserves admitted/completed slice evidence and blocks missing results | Group // 005 RED failed on the pre-v3 participant path | Existing Group // 005 implementation green | Scenario command: 15 passed, including both restart cases | No production refactor in this verification group; final `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts` — 103 passed |
| Stale Cleaner and Architect calls cannot advance the frontier | Group // 006 RED had 3 routing failures | Existing Group // 006 implementation green | Scenario command: stale task/result/source cases passed | No production refactor; same final focused command — 103 passed |
| Blocked planner scope remains represented and verify-gated | Group // 002 RED had 3 blocker failures | Existing Group // 002 implementation green | Scenario command: oversized, non-UTF-8, and contract-rejection cases passed | No production refactor; same final focused command — 103 passed |
| Legacy migration retains bounded prior evidence without fan-out | Group // 004 RED failed on the missing migration export | Existing Group // 004 implementation green | Legacy command: 3 passed | No production refactor; final `bun test tests/continuity-checkpoint.test.ts --test-name-pattern 'reads v1 and legacy v2|carries one identical legacy slice|preserves blocked legacy evidence'` — 3 passed |
| Architect binds only after the final fresh full-scope seal | Group // 006 RED failed fresh-binding assertions | Existing Group // 006 implementation green | Scenario command: final-seal and stale-source cases passed | No production refactor; same final participant focused command — 103 passed |
| Verify remains blocked for blocked, stale, and disabled acquired participants | Group // 007 RED failed updated disablement expectations | Existing Group // 007 implementation green | Scenario command: blocked/disabled gate cases passed | No production refactor; same final participant focused command — 103 passed |

## Checks executed

- `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts` — 103 passed, 0 failed.
- `bun test tests/sdd-participants.test.ts --test-name-pattern 'restart hydrates durable completion|persists pending and admitted|qualifies each Cleaner task|late Cleaner result|oversized files|non-UTF-8 files|Cleaner contract rejection|changed planner identity|persists a fresh Architect binding|stale source blocks the Architect|blocked participant prevents verify|blocked Architect prevents verify|disabling the pending Architect|disabling the Cleaner before it runs|late blocked result'` — 15 passed, 0 failed.
- `bun test tests/continuity-checkpoint.test.ts --test-name-pattern 'reads v1 and legacy v2|carries one identical legacy slice|preserves blocked legacy evidence'` — 3 passed, 0 failed.
- `bun run typecheck` — passed.
- `cd installer && bun run typecheck` — passed (installer files were already touched in the working tree).
- `bun test` — 2376 passed, 2 failed: unrelated Claude PTY handoff/unavailable runtime and `docs/valoracion-estado-y-rumbo-2026-08.md` vocabulary drift.

## Decisions and residual risks

- This group added no tests or production code; prior strict-TDD RED/GREEN evidence is referenced above and the current run supplies integration triangulation/final checks.
- The unrelated full-root failures prevent marking 8.1 or overall apply complete; no approved-scope defect was exposed.

## Remaining tasks

Task 8.1 remains pending until the required full root test gate is green; apply status stays `blocked`.

## Retry for pending task 8.1

The previously reported vocabulary-drift and real-PTY failures are corrected in the current working tree. No Cleaner production code or tests were modified in this retry.

### Final task 8.1 verification

- Focused integration scenarios: `bun test tests/sdd-participants.test.ts --test-name-pattern 'restart hydrates durable completion|persists pending and admitted|qualifies each Cleaner task|late Cleaner result|oversized files|non-UTF-8 files|Cleaner contract rejection|changed planner identity|persists a fresh Architect binding|stale source blocks the Architect|blocked participant prevents verify|blocked Architect prevents verify|disabling the pending Architect|disabling the Cleaner before it runs|late blocked result'` — 15 passed, 0 failed.
- Legacy migration scenarios: `bun test tests/continuity-checkpoint.test.ts --test-name-pattern 'reads v1 and legacy v2|carries one identical legacy slice|preserves blocked legacy evidence'` — 3 passed, 0 failed.
- Required focused suites: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts` — 103 passed, 0 failed.
- Full root suite: `bun test` — 2380 passed, 0 failed.
- Root typecheck: `bun run typecheck` — passed.
- Installer typecheck: `cd installer && bun run typecheck` — passed.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused check |
| --- | --- | --- | --- | --- |
| Restart and stale Cleaner evidence remain durable and fail closed | Prior Groups // 005–006 RED evidence above | Prior Groups // 005–006 focused implementation suites green | Current 15-scenario integration command passed | No production refactor; current 103-test focused suite passed |
| Blocked planner and legacy migration preserve evidence without admission or fan-out | Prior Groups // 002 and // 004 RED evidence above | Prior Groups // 002 and // 004 focused suites green | Current 15-scenario plus 3 migration scenarios passed | No production refactor; current focused suites passed |
| Architect final seal and verify gate remain fresh and fail closed | Prior Group // 006–007 RED evidence above | Prior Groups // 006–007 focused suites green | Current 15-scenario integration command passed | No production refactor; current 103-test focused suite passed |

## Deviations and residual risks

- No Cleaner implementation change was needed; the previously unrelated vocabulary and PTY continuity fixes were already present.
- Root `bun test` printed expected subprocess git-usage text but exited successfully with 2380 passing tests.

## Remaining tasks

None. Task 8.1 is complete; apply status is `complete`.
