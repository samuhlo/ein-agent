status: complete

## // 001. Persisted-delta preflight contract

- **Status at group 001 checkpoint:** complete; tasks 1.1–1.4 finished.
- **Changed:** added the focused static contract regression and updated `sdd-scope.md` with a mandatory persisted-delta preflight, exact-byte authority, destructive-operation ordering, and the existing missing/invalid fallback.
- **Files:** `tests/sdd-flow-contract.test.ts`, `ein-pi/core/agents/sdd-scope.md`, `openspec/changes/harden-scope-retries/tasks.md`.

### TDD Cycle Evidence

| Stage | Real evidence |
| --- | --- |
| RED | `timeout 120 bun test tests/sdd-flow-contract.test.ts` — 29 pass, 3 new contract tests failed because the preflight/fallback wording was absent. |
| GREEN | Same focused command after implementation and assertion alignment — 32 pass, 0 fail. |
| TRIANGULATE | Added explicit exact-byte plus missing/invalid provenance checks and reran the focused command — 32 pass, 0 fail. |
| REFACTOR | Simplified the prompt sentence and operation-anchor assertion without weakening ordering or fallback rules — 32 pass, 0 fail. |

- **Deviations:** none from group 001 design; no runtime persistence machinery or delta grammar was added.
- **Remaining at group 001 boundary:** groups 002 and 003 were still pending at that historical checkpoint.

## // 002. Canonical scope-to-map provenance gate

- **Status at group 002 checkpoint:** complete; tasks 2.1–2.4 finished.
- **Changed:** canonical `map` candidates now fail closed to `scope` for `unresolved`/`conflict`, with exact state-specific blockers and next-step diagnostics; `pending`/`synchronized` remain eligible.
- **Files:** `ein-pi/agent/lib/sdd-router.ts`, `tests/sdd-router.test.ts`, `openspec/changes/harden-scope-retries/tasks.md`.

### TDD Cycle Evidence

| Stage | Real evidence |
| --- | --- |
| RED | `timeout 120 bun test tests/sdd-router.test.ts` — 31 pass, 1 fail: unresolved still routed to `map`; after adding next-report assertions, 31 pass, 1 fail on generic reason. |
| GREEN | Router gate and provenance-specific `resolveSddNext()` reason/action implemented; focused command — 32 pass, 0 fail. |
| TRIANGULATE | Added missing-scope, existing-map, and later-phase boundary assertions; focused command — 33 pass, 0 fail. Existing legacy routing remained green. |
| REFACTOR | Consolidated state/blocker/action assertions and router formatting; focused command — 33 pass, 0 fail. |

- **Additional gate:** `timeout 120 bash -lc 'cd installer && bun run typecheck'` — pass.
- **Deviations:** none; reused `specState`/existing evaluation and did not alter legacy routing, sync semantics, or `optimize-tdd-verify`.
- **Remaining at group 002 boundary:** group 003 was still pending at that historical checkpoint.

## // 003. Next-dispatcher diagnostic visibility

- **Status:** complete; tasks 3.1–3.4 finished.
- **Changed:** added dispatcher regressions for canonical `unresolved` and `conflict`, asserting `scope` remediation, exact provenance blocker/reason, state-specific action, and rendered diagnostics. Updated existing dry-run expectations for the fail-closed route; command wiring remains covered.
- **Files:** `tests/sdd-next-dispatcher.test.ts`, `openspec/changes/harden-scope-retries/tasks.md`.

### TDD Cycle Evidence

| Stage | Real evidence |
| --- | --- |
| RED | Added unresolved/conflict report assertions; focused run initially failed on stale dispatcher expectations (`map`/generic output) after the completed router gate. |
| GREEN | Updated only dispatcher fixtures/expectations; `timeout 120 bun test tests/sdd-next-dispatcher.test.ts` — 7 pass, 0 fail. |
| TRIANGULATE | `timeout 120 bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-flow-contract.test.ts` — 72 pass, 0 fail; pending/synchronized and legacy routing remained green. |
| REFACTOR | Removed redundant non-map assertion while retaining route, exact blocker/reason/action, dry-run, and command-wiring coverage; focused dispatcher run — 7 pass, 0 fail. |

- **Additional gate:** `timeout 120 bash -lc 'cd installer && bun run typecheck'` — pass.
- **Deviations:** no production files changed; no command, dry-run, phase, synchronization, or `optimize-tdd-verify` artifacts touched.
- **Remaining:** none; all tasks in this change are checked.

## // 004. Post-verify stale status expectation remediation

- **Status:** complete; existing tasks remain complete.
- **Changed:** updated only `tests/sdd-status-output.test.ts` so unresolved canonical provenance expects `next: scope` and the approved provenance blocker/reason; production code and `optimize-tdd-verify` were untouched.
- **Tests:** `timeout 120 bun test tests/sdd-status-output.test.ts` — 22 pass, 0 fail. Focused router/status/dispatcher run (`tests/sdd-router.test.ts`, `tests/sdd-next-dispatcher.test.ts`, `tests/sdd-status-output.test.ts`) — 62 pass, 0 fail.
- **Typecheck:** `timeout 120 bash -lc 'cd installer && bun run typecheck'` — pass.
- **TDD evidence:** the pre-remediation status test reproduced the stale `next: map` failure; the expectation-only correction is green. No production behavior was changed.
- **Deviations:** none; `tasks.md` remains fully checked. `verify-report.md` is intentionally left for regeneration by `sdd-verify`.
- **Remaining:** none for this remediation.