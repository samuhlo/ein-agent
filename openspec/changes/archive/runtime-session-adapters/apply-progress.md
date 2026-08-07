status: complete

## // 001. Normalized adapter contract and state-bound envelopes

- Status: task 1.1 complete; later groups intentionally untouched.
- Added the data-first adapter contract in `ein-pi/agent/lib/runtime-session-adapters.ts`.
- Added `ProjectBinding` fields derived from `ProjectStateV1`; `project-state.ts` remains unchanged.
- Added closed provider/operation/outcome/error discriminants, state-bound `LaunchIntent`, privacy-safe `SessionMetadata`, and the exact asymmetric capability matrix.
- Added focused contract/privacy tests in `tests/runtime-session-adapters.test.ts`.
- Checked task 1.1 in `tasks.md`; tasks 2.1–5.1 remain open.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Wrote the focused contract test first; `bun test tests/runtime-session-adapters.test.ts` failed because the adapter module was absent. |
| GREEN | Added only foundational types and matrix; focused runner passed 5 tests. |
| TRIANGULATE | Added closed-outcome, malformed-state diagnostic, binding, non-repository, and privacy-shape assertions; runner passed 6 tests / 44 expectations. |
| REFACTOR | Extracted the internal failure-outcome alias without changing public discriminants; focused runner and `git diff --check` passed. |

- Commands: `bun test tests/runtime-session-adapters.test.ts`; `git diff --check -- ein-pi/agent/lib/runtime-session-adapters.ts tests/runtime-session-adapters.test.ts`.
- Deviations: none; no runtime/filesystem/process/session behavior was added.
- Remaining: task groups 002–005, including session metadata seam, operations, launch execution, and B metadata translation.
- Risks: runtime validation and provider execution are intentionally deferred to later groups.

## // 002. Bounded Pi project-scoped metadata seam

- Status: task 2.1 complete; later groups intentionally untouched.
- Added `scanProjectSessions` as an additive, lexical exact-scope reader: repository root/subdirectories or exact non-repository cwd, first-line-only metadata, deterministic recency ordering, and a 4,096-candidate fail-closed bound.
- Added adapter composition via `listPiProjectSessions`, validating limits and returning only hashed `pi:v1:sha256:<64 lowercase hex>` references plus recency; duplicate opaque references fail closed.
- Added compatibility coverage while preserving legacy `listRecentSessions`, `RecentSession`, `humanizeAge`, `excludePath`, and dedupe behavior.
- Files changed: `ein-pi/agent/lib/sessions.ts`, `ein-pi/agent/lib/runtime-session-adapters.ts`, `tests/runtime-session-adapters.test.ts`, `tests/sessions.test.ts`, `tasks.md`.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Added project-scope, privacy, non-repository, duplicate, and overflow tests first; focused runner failed with missing `listPiProjectSessions`. |
| GREEN | Added bounded sessions seam and adapter hashing/composition; `bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts` passed 15 tests. |
| TRIANGULATE | Added normalized-boundary, invalid-limit, deterministic-tie, and >1,024-byte first-line cases; focused runner passed 17 tests / 80 expectations. |
| REFACTOR | Kept internal session record private, retained additive legacy path, reran focused runner: 17 pass; `cd installer && bun run typecheck` passed; `git diff --check` passed. |

- Deviations: none; no persistence, transcript reads, launcher, state, or later lifecycle work added.
- Remaining: groups 003–005.
- Risks: source absence remains legacy best-effort empty listing; full adapter state validation is intentionally deferred to group 003.

## // 003. Request-only create, fail-closed resume, and provider translation

- Status: task 3.1 complete; groups 004–005 remain intentionally untouched.
- Implemented exact state identity/repository binding validation, complete `git.stateRef` requirements for create/resume, exact-cwd non-repository support, opaque provider-reference validation, request-only create, deterministic Pi list/Claude unsupported-list outcomes, unsupported Pi/Claude resume, and Pi/Claude adapter factories with capability translation.
- Added envelope and positional request forms; invalid, stale, cross-provider, wrong-project, unknown, incomplete, and inconsistent inputs fail closed. Public results contain only bound identity, opaque references, and safe error codes; no writes, projector calls, persistence, or transcript/history transfer were added.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Added group-003 lifecycle tests before implementation; focused runner had 12 passing legacy tests and 5 new failures for missing request/factory/validation symbols. |
| GREEN | Added state validation, request/list/resume functions, factories, and capability translation; focused runner passed 17 tests / 103 expectations. |
| TRIANGULATE | Added stale/wrong-project binding, missing-ref list, inconsistent identity, unknown provider, privacy, and request-envelope cases; focused runner passed 20 tests / 120 expectations. |
| REFACTOR | Normalized binding helpers, portable path boundaries, deterministic request-part parsing, and closed provider handling; focused runner remained 20 pass / 120 expectations. |

- Commands: `bun test tests/runtime-session-adapters.test.ts`; `cd installer && bun run typecheck` (pass).
- Files changed: `ein-pi/agent/lib/runtime-session-adapters.ts`, `tests/runtime-session-adapters.test.ts`, `tasks.md`, this progress file.
- Deviations: none; launch planning/execution, B metadata translation, persistence, and all unrelated dirty files remain untouched.
- Remaining: tasks 4.1 and 5.1. Risks: launch executor and final B metadata projection are deliberately deferred to later groups.

## // 004. Fixed-argument isolated launch boundary

- Status: task 4.1 complete; group 005 intentionally untouched.
- Added adapter-local executable resolution, fixed Pi/Claude create plans, selected-cwd structured inputs, exact Fish-derived isolation overrides, shell-disabled execution, and injectable executor normalization.
- Added closed cancellation, spawn-failed, process-exit, and process-signalled outcomes; executor input carries no caller argv, output, stderr, pid, or diagnostics.
- Added executor-spy coverage for metacharacter cwd, missing executable, cancellation before/during/after execution, signals, stale bindings, mutable plans, privacy, and no writes.
- Files changed: `ein-pi/agent/lib/runtime-session-adapters.ts`, `tests/runtime-session-adapters.test.ts`, `tasks.md`, this progress file.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Added fixed-plan/executor-spy tests first; focused runner passed 20 legacy tests and failed 5 new tests for missing launch symbols. |
| GREEN | Implemented resolver, plan builder, injectable non-shell executor, and normalized outcomes; focused runner passed 25 tests / 151 expectations. |
| TRIANGULATE | Added stale-binding ordering, missing-home, mutable argv, abort-after-exit, unknown-signal, spawn-error, and privacy/no-write cases; runner passed 27 tests / 161 expectations. |
| REFACTOR | Reused normalized home paths, single stat read, exact plan env keys, and allowlisted signal tokens; focused runner remained 27 pass / 161 expectations. |

- Commands: `bun test tests/runtime-session-adapters.test.ts` (27 pass); `cd installer && bun run typecheck` (pass); focused `git diff --check` (pass).
- Deviations: none; no Fish invocation, secret-file read, installer import, runtime-store access, runtime launch, metadata integration, or persistence.
- Remaining: task 5.1 only. Risks: default executor is intentionally unexercised against a real runtime; independent verify remains responsible for final freshness and broader compatibility.

## // 005. ProjectStateV1 metadata integration and compatibility/privacy gate

- Status: task 5.1 complete; all runtime-session-adapters tasks are checked.
- Added pure `toProjectRuntimeMetadata` translation in `runtime-session-adapters.ts`; `project-state.ts` remains unchanged.
- Successful observations expose only availability, applicable B capability tokens, and bounded provider-validated opaque references.
- Unsupported, source, runtime/process, identity, binding, and reference failures map to existing B reason codes; adapter diagnostics, exit codes, signals, paths, and private content are discarded.
- Added serialized privacy, immutable-input, no-write/filesystem, ownership, cancellation, malformed-data, full error-family, and 20-reference-bound assertions.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Added translation/privacy tests first; focused runtime runner failed with four missing-function failures (`toProjectRuntimeMetadata` undefined), while 27 prior tests passed. |
| GREEN | Implemented pure metadata translation and B reason mapping; runtime runner passed 31 tests / 203 expectations. |
| TRIANGULATE | Added all failure-family, malformed-stream, provider-opaque, and reference-bound cases; first run exposed malformed entry short-circuiting, then passed 32 tests / 219 expectations after fail-open filtering. |
| REFACTOR | Extracted failure metadata construction without changing the public shape; kept translation one-way/persistence-free, capped/deduped validated references, and reran all four suites plus installer typecheck. |

- Commands: `bun test tests/runtime-session-adapters.test.ts` (RED, GREEN, TRIANGULATE; final 32 pass); `bun test tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/shared-project-state.test.ts tests/installer-runtime-menu.test.ts` (102 pass); `cd installer && bun run typecheck` (pass).
- Files changed for group 005: `ein-pi/agent/lib/runtime-session-adapters.ts`, `tests/runtime-session-adapters.test.ts`, `openspec/changes/runtime-session-adapters/tasks.md`, this progress file.
- Deviations: none; no `project-state.ts`, sessions compatibility behavior, installer/UI/CLI behavior, launcher fields, migration, persistence, or verification freshness was changed.
- Remaining tasks: none. Independent `sdd-verify` still owns final freshness/holistic verification.
- Risks: default runtime process execution remains injectable-only; translation intentionally does not assert or refresh verification evidence.

## // 006. Verification remediation — launch-plan integrity and strict closure

- Status: complete; all assigned remediation blockers are fixed without broadening scope.
- Added mutation regression coverage for every provider isolation value (`PI_CODING_AGENT_DIR`, `EIN_PI_AGENT_HOME`, `CLAUDE_CONFIG_DIR`, and Claude `PATH`); mutated plans are rejected before executor invocation.
- Exact environment snapshots are retained per adapter-created plan and compared during execution; shell-disabled structured execution remains intact, while Bun's incompatible `shell` SpawnOptions field is omitted from the array spawn call.
- Corrected strict diagnostics for validation failure narrowing, environment record typing, invalid-plan narrowing/schema literal fallback, and test `ProjectStateReasonCode` typing. No `any`, suppression directive, unsafe remediation cast, or new non-null assertion was added.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Added the four provider-environment mutation cases first; focused test failed 1 case because the executor was reached after mutation. |
| GREEN | Added exact per-plan environment validation and strict narrowing fixes; focused runner passed 33 tests / 227 expectations. |
| TRIANGULATE | Re-ran mutation coverage and the corrected strict closure; no diagnostics remained attributable to the adapter or focused test. |
| REFACTOR | Removed the test's invalid-input casts, accepted malformed list envelopes as `unknown`, and kept the exact-env validator/provenance check small; focused runner remained green. |

- Commands: `timeout 300 bun test tests/runtime-session-adapters.test.ts` (33 pass / 227 expectations); corrected closure from `installer` using the exact strict flags in `verify-report.md` (exit 2 only for imported/pre-existing diagnostics; zero adapter or focused-test diagnostics); `git diff --check -- ein-pi/agent/lib/runtime-session-adapters.ts tests/runtime-session-adapters.test.ts openspec/changes/runtime-session-adapters/apply-progress.md` (pass).
- Baseline-only closure diagnostics: missing `@earendil-works/pi-coding-agent` declarations, existing strict errors in OpenSpec/guardrail/router modules, missing installer asset declarations, and existing `installer-runtime-menu.test.ts` narrowing errors; tracked separately and not attributed to this remediation.
- Files changed in remediation: `ein-pi/agent/lib/runtime-session-adapters.ts`, `tests/runtime-session-adapters.test.ts`, and this progress file only. Tasks remain fully checked; no sessions/project-state/installer/docs/specs/runtime writes were made.
- Remaining tasks: none. Residual risk: the default executor and real Pi/Claude runtimes remain intentionally uninvoked per task constraints.
