status: complete

## Completed work

- [x] 1.1 Added the pure `banner-git` model, strict porcelain/count parsers, bilingual responsive renderer, read-only injected probe, and cached generation-aware controller.
- [x] 2.1 Added fake-process lifecycle coverage for loading, deferred server checks, timeout/error versus explicit DNS offline, OID mismatch, stale generations, and invalidation.
- [x] 3.1 Wired the agent banner to cached `HEAD`, `LOCAL`, and `UPSTREAM` rows with deferred refresh and active-header repaint gating; installer UI remains untouched.
- [x] 4.1 Completed the integrated final matrix and wrote the factual downstream handoff.

## Group 004 evidence

- The renderer matrix covers clean, staged, unstaged, untracked, mixed, and rename local states; equal, ahead, behind, diverged, no-upstream, detached, loading, uncomputable, offline, error, and server-changed upstream states.
- Each state matrix runs Spanish/English variants at 80, 60, and 40 columns. It fixes `MM + ??` at `entries: 2` despite three category hits, preserves both diverged commit counts, and hides counts for server-changed.
- Controller tests prove cached `getSnapshot()` and rendering make no runner calls, stale generations cannot repaint after replacement, and `invalidate()` suppresses late server completion. Fake runner allowlists read-only commands; tests use no repository, remote, network, or Git mutation.
- `handoff.md` is 25 lines and states the porcelain-entry and local-tracking-ref units, stale-ref limitation, server-changed/counts-unavailable behavior, no fetch/mutation boundary, installer exclusion, and untouched README. It explicitly leaves independent SDD VERIFY pending; CLOSE owns `summary.md`.

## Files changed

- `ein-pi/agent/lib/banner-git.ts` — groups 001–002 domain/probe/controller.
- `ein-pi/agent/extensions/ein-banner.ts` — group 003 TUI adapter.
- `tests/banner-git-semantics.test.ts` — groups 001–004 fake, renderer, controller, and adapter coverage.
- `openspec/changes/banner-git-semantics/tasks.md` — all four groups checked complete; top-level status remains `ready`.
- `openspec/changes/banner-git-semantics/apply-progress.md` — cumulative completion record.
- `openspec/changes/banner-git-semantics/handoff.md` — factual handoff for `readme-release-ia`.

## Verification

- `bun test` — initially failed only in the new 40-column matrix: its expectation assumed category copy where the specified narrow variant correctly uses `1 entradas locales` / `1 local entries`. The test-only expectation was corrected; the command was not re-run because the requested command sequence permits one full run followed by the focused run.
- `bun test tests/banner-git-semantics.test.ts` — passed: 47 tests, 336 assertions, 0 failures.
- `git diff --check` and `git diff --cached --check` — passed before the final artifact updates; no staged files were present.
- No production build, dependency change, real repository/remote/network test, or Git mutation was run.

## Exact source/test line ledger

- `ein-pi/agent/lib/banner-git.ts`: production `+405/-0`.
- `ein-pi/agent/extensions/ein-banner.ts`: production `+61/-62` (123 changed lines).
- Production cumulative: `+466/-62` (528 changed lines).
- `tests/banner-git-semantics.test.ts`: test `+386/-0`; group 004 added 51 lines.
- Source/test cumulative: `+852/-62` (914 changed lines).
- `openspec/changes/banner-git-semantics/handoff.md`: documentation `+25/-0` (within the 60-line limit).

## TDD and deviations

- Strict TDD is off in `openspec/config.yaml`; all groups used standard-mode behavioral coverage.
- No production correction was required by the final matrix. The only discovered issue was the new narrow-width test expectation, corrected to the designed aggregate-entry copy.
- The pre-existing groups 001–003 production ledger exceeded the 400-line target; group 004 added no production lines and did not widen scope.

## Remediation — minimal Git rows

- Fixed the VERIFY blocker in `ein-pi/agent/extensions/ein-banner.ts`: the shared `addGitBannerRows()` layout adapter now emits the cached semantic rows in both full and minimal modes. It splits only the renderer's explicit `↵` continuation marker into physical rows, so critical Git copy is not generically sliced.
- Added the `ein-banner Git adapter` source-contract regression in `tests/banner-git-semantics.test.ts`. It follows the actual full branch at 80, minimal branch at 60 and exactly 40, and `<40` skip. It also guards that render contains no refresh or runner invocation; the controller regression retains the repeated cached-render zero-runner assertion.
- Corrected `handoff.md` after the focused regression passed: it now identifies full 80-column and minimal 60/40-column adapter output.

## Remediation verification

- `bun test` — passed: 576 tests, 1,728 assertions, 0 failures.
- `bun test tests/banner-git-semantics.test.ts` — passed: 48 tests, 346 assertions, 0 failures.
- `git diff --check` — passed: no whitespace errors.

## Remaining and limitations

- No APPLY tasks remain.
- Independent SDD VERIFY is pending. Local tracking refs can be stale without fetch; server changes intentionally provide no refreshed ancestry counts, and no remote-live synchronization is claimed.
