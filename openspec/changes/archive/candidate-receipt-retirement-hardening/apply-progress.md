status: complete

## Group 001 — Restore historical evidence and canonical baseline

- Restored the six archived `candidate-receipt-retirement` artifacts exactly from `1f89b0f`.
- Backed up pre-apply canonical bytes at `.git/ein/candidate-receipt-retirement-hardening-canonical-preapply-sdd-lifecycle-spec.md` (SHA-256 `e74f081c21750fd3535929277fff5a22520a38ea2886cd51739bd815001d09bc`), then restored `openspec/specs/sdd-lifecycle/spec.md` exactly from `1f89b0f`.
- Commands passed: `cmp "$path" <(git show "1f89b0f:$path")` for all six archived paths and the canonical spec; `cmp .git/ein/candidate-receipt-retirement-hardening-canonical-preapply-sdd-lifecycle-spec.md <(git show ':openspec/specs/sdd-lifecycle/spec.md')`; focused `git diff --check --` over restored and sibling artifacts.
- Results: 7/7 restoration comparisons passed; backup pre-apply comparison passed; focused whitespace check passed. No source or test files were changed, and no tests were required for this restoration-only group.
- Remaining: groups 002–004, including the required deterministic sibling synchronization before delivery readiness.

## Group 002 — Correct bounded remote-adapter coverage

- Added one injected-runner happy path with valid same-repository merged `gh pr view` JSON. It asserts the exact `gh pr view` arguments and JSON field request, timeout, propagated `AbortSignal`, and complete normalized observation.
- Relabeled the public-tool source inspection as smoke-only registration/import/call-site coverage; it explicitly does not claim runtime execution.
- Changed: `tests/candidate-receipt-retirement-remote.test.ts`, `tests/candidate-receipt-retirement-tool.test.ts`, and group 002 checkboxes in `tasks.md`.
- Commands passed: `bun test tests/candidate-receipt-retirement-remote.test.ts` (3 pass, 12 assertions); `bun test tests/candidate-receipt-retirement-tool.test.ts` (1 pass, 6 assertions); `git diff --check -- tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts`.
- No production code changed. Residual risk: the static public-tool smoke test still does not execute runtime wiring, by design.
- Remaining: groups 003–004; next is deterministic sibling synchronization.

## Group 003 — Synchronize the sibling-owned six-scenario delta

- Status: complete for this group; overall apply remains `partial` because group 004 is intentionally pending.
- Verified sibling `sync-report.md` reports exactly `state: synchronized`, `conflicts: 0`, and `operations: added=6 modified=0 removed=0`; no synchronization was rerun in this retry.
- Compared the current canonical with the retained pre-apply backup by scenario identity: all 33 identities matched and every scenario body was byte-identical, independent of deterministic scenario ordering. Each of the six sibling-owned identities appeared exactly once.
- Verified archived original `sync-report.md` is byte-identical to `git show 1f89b0f:<path>` and itself reports synchronized with zero conflicts.
- Removed only the temporary canonical pre-apply backup after the acceptance checks passed.
- Commands passed: focused shell/Python acceptance comparison and `git diff --check --` over the sibling tracking/sync and canonical files.
- Changed: `openspec/changes/candidate-receipt-retirement-hardening/tasks.md`; `openspec/changes/candidate-receipt-retirement-hardening/apply-progress.md`; removed `.git/ein/candidate-receipt-retirement-hardening-canonical-preapply-sdd-lifecycle-spec.md`.
- Remaining: group 004 only. No canonical, delta, source, test, or original archive bytes were edited in this retry.

## Group 004 — Audit final bytes and complete apply readiness

- Status: complete. All task groups are checked; this entry is the final-HEAD apply evidence.
- Passed focused retirement suites: `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts` — 116 pass, 0 fail, 277 assertions.
- Passed OpenSpec checks: `bun test tests/openspec-specs.test.ts` — 26 pass, 0 fail, 55 assertions.
- Passed full suite: `bun test` — 939 pass, 0 fail, 2,578 assertions across 83 files. Passed `bun run --cwd installer typecheck` and `git diff --check`.
- All 6/6 original archive paths byte-compare with `git show 1f89b0f:<path>`. The original archive sync report says `state: synchronized`, `conflicts: 0`.
- Sibling sync report says `state: synchronized`, `conflicts: 0`, `added=6 modified=0 removed=0`; each of its six scenario IDs occurs exactly once in canonical.
- The active `.git/ein/candidate-receipt.json` remains stale for tree `1c3138ed4009d2681503a4de1bf23ae981c5ad35`; it was neither deleted nor replaced.
- All three source hardening paths byte-match `961aefa`; their worktree status is clean, so no unrelated WIP entered intended source paths.
- Changed only sibling `tasks.md` and this progress record in this group. No production build, verify report, summary, archive, close, or receipt was created.
- Handoff: `sdd-verify`, then `sdd-close`/deterministic archive, then a fresh candidate receipt remain subsequent owner phases. verify → close → fresh receipt.
- Residual risk: static public-tool coverage remains smoke-only by design; the stale receipt must be replaced only after fresh verify and close evidence.
