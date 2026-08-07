status: complete

## // 001. Public ProjectStateV1 contract

- **Status:** complete for assigned group; later groups remain pending.
- **Completed:** tasks 1.1 and 1.2. Added the schema-versioned public ProjectStateV1 contract, projector declaration, stable `pi`/`claude` defaults, and focused contract assertions.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `tasks.md`.
- **Verification:** `bun test tests/shared-project-state.test.ts --test-name-pattern "contract|schema|runtime shape"` passed after GREEN, TRIANGULATE, and REFACTOR (5 tests, 28 expectations).
- **Type-check:** attempted focused `tsc`; environment lacks resolvable `bun`/Node type definitions, so no standalone type-check result is claimed. No dependencies were installed.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Focused command failed before implementation: module `../ein-pi/agent/lib/project-state` was missing. |
| GREEN | Minimal public types/default projector added; focused command passed 4 tests. |
| TRIANGULATE | Added deterministic/request-scoped and alternate-`cwd` assertions; focused command passed 5 tests. |
| REFACTOR | Deduplicated stable not-inspected source defaults without changing output; focused command passed 5 tests. |

- **Deviations:** No source readers, Git/OpenSpec/EIN composition, verification binding, adapters, persistence, or presentation behavior implemented; runtime input is declaration-only in this group.
- **Remaining:** Groups 002–005 are untouched. `EIN.md` and unrelated dirty files were preserved.

## // 002. Bounded exact Git summary and identity

- **Status:** complete for assigned group; groups 003–005 remain pending.
- **Completed:** tasks 2.1 and 2.2. Added a private fixed-argument, no-optional-locks Git reader with exact HEAD/index/worktree/untracked identities, sorted repository-relative summaries, detached/unborn markers, root discovery, and `git-v1:sha256:<digest>` references. Overflow, malformed output, command errors, and non-repositories fail closed.
- **Tests:** temporary repositories cover HEAD/unborn/detached, staged/index, repeated tracked-content edits, untracked content, nested working directories, rename/delete, unrelated dirty-file preservation, bounded 256-entry overflow, non-repository, malformed output, and command-error behavior. Assertions reject absolute paths/content/diff leakage and verify the Git index bytes remain unchanged.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `tasks.md`.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Focused Git command failed against the contract-only projector: Git remained `repository: null`/empty, with 7 failing transition assertions. |
| GREEN | Implemented the minimal private Git reader and transition fixtures; focused command passed 7 tests. |
| TRIANGULATE | Added repeated dirty-content, repository-root, nested-cwd, unrelated-file, malformed/command-error, and overflow assertions; focused command passed 9 tests. |
| REFACTOR | Corrected unmerged metadata validation, rooted status inspection at the repository root, fixed rename detection arguments, simplified failure/path guards, and reused one Git read for identity/root projection with Git-derived identity quality; focused command passed 9 tests. |

- **Verification:** `bun test tests/shared-project-state.test.ts --test-name-pattern "Git|HEAD|index|tracked|untracked|detached|overflow"` passed (9 tests, 57 expectations) after REFACTOR. Focused TypeScript check passed with installer `tsc` over the changed source/test files; `cd installer && bun run typecheck` also passed. No build or full suite run.
- **Deviations:** No Git baseline, router, EIN reader, verification binding, runtime adapter, persistence, or presentation behavior changed. Git output and command errors are normalized without raw stderr.
- **Remaining:** Groups 003–005. Existing unrelated dirty files and source artifacts remain untouched by projection calls.

## // 003. OpenSpec and EIN.md projections

- **Status:** complete for assigned tasks 3.1 and 3.2; groups 004–005 remain pending.
- **Completed:** Composed active-change listing, router status/next, ambiguity gating, canonical/legacy provenance, lifecycle artifacts/blockers, router verify outcome, and read-only EIN metadata with absent/incomplete/unavailable/current quality.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `tasks.md`.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Both focused commands failed on the contract-only projector: OpenSpec/active/provenance and EIN/context/revision/read-only assertions were unmet. |
| GREEN | Added minimal OpenSpec and EIN composition; both focused commands passed (10 OpenSpec/router tests, 7 EIN/context tests). |
| TRIANGULATE | Added explicit selection, unresolved provenance blockers, malformed AUTO boundaries, and unreadable-vs-absent EIN cases; focused commands passed (11 and 8 tests). |
| REFACTOR | Centralized selection/blocker/quality normalization and boundary parsing without touching router/context writers; focused commands and typecheck passed. |

- **Verification:** `bun test tests/shared-project-state.test.ts tests/sdd-router.test.ts --test-name-pattern "OpenSpec|active|legacy|ambiguous|provenance"`; `bun test tests/shared-project-state.test.ts tests/project-context.test.ts --test-name-pattern "EIN|context|revision|read-only"`; `cd installer && bun run typecheck` — all pass.
- **Deviations:** No changes to `sdd-router.ts`, `project-context.ts`, `EIN.md`, router fallback behavior, or writers; no build/full suite run.
- **Remaining:** Groups 004–005 only; unrelated dirty files preserved.

## // 004. Verification freshness and degradation

- **Status:** complete for assigned tasks 4.1 and 4.2; group 005 remains pending.
- **Completed:** Normalized verification from router outcome/staleness and one exact `project_state_git_ref`; only matching complete Git + pass is current. Explicitly fail-closed for unbound/legacy, mismatch, absent, failed, malformed, stale, unavailable, and incomplete Git identity cases. Added independent degradation, determinism, and no-write assertions.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `tasks.md`.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Both requested focused commands failed across the new verification/degradation assertions against the not-inspected projector baseline. |
| GREEN | Added binding parsing, report normalization, router freshness/staleness gating, and source-independent degradation; both focused commands passed. |
| TRIANGULATE | Added mismatch/reference exposure, malformed/duplicate and malformed-status evidence, router mtime staleness, incomplete Git overflow, EIN/OpenSpec partial failures, and no-write checks; focused commands passed. |
| REFACTOR | Separated report-path/binding parsing and verification normalization, then retained fail-closed semantics for malformed unknown outcomes; focused commands and typecheck passed. |

- **Verification:** `bun test tests/shared-project-state.test.ts tests/sdd-router.test.ts --test-name-pattern "verification|fresh|stale|unbound|binding"`; `bun test tests/shared-project-state.test.ts --test-name-pattern "degradation|determin|no.*(file|write)|mutation"`; `cd installer && bun run typecheck` — all pass. No build/full suite run.
- **Deviations:** No router changes, verification writes, cache/state files, EIN writes, runtime/session behavior, or source mutation. Fixtures ignore their report artifact so the exact pre-report Git identity can be bound without changing the repository fingerprint during assertion.
- **Remaining:** Group 005 only; unrelated dirty files preserved.

## // 005. Runtime defaults and public integration contract

- **Status:** complete. Tasks 5.1 and 5.2 are implemented and independently verified.
- **Completed:** Runtime inputs are normalized for `pi`/`claude` without provider probing. Absent providers remain deterministic `not-provided`/`absent` with empty capabilities, references, and errors. Optional metadata accepts only stable availability/quality/reason values, sorted unique public opaque tokens, and sanitized stable error details; private paths, prompt/transcript content, and execution fields are omitted.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `tasks.md`.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Added runtime normalization/privacy assertions; requested focused pattern failed with 3 failing tests against the defaults-only implementation. |
| GREEN | Implemented request-scoped runtime normalization and privacy filtering; focused pattern passed 4 tests. |
| TRIANGULATE | Added provider-scoped, sorted/deduplicated, input-immutability assertions; focused pattern passed 5 tests. |
| REFACTOR | Simplified token normalization without behavior changes; focused pattern passed 5 tests. |

- **Final verification:** `bun test tests/shared-project-state.test.ts` passed (37 tests); compatibility command `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/project-context.test.ts tests/git-baseline.test.ts` passed (84 tests); `cd installer && bun run typecheck` passed.
- **Read-only evidence:** Existing repeated-projection/no-write assertions passed; runtime normalization only consumes request metadata, creates no stores/cache/state files, and compatibility suites passed without changes to router, status output, project-context, or Git-baseline modules.
- **Deviations:** None. No adapters, runtime-store/session reads, prompts, transcripts, commands, lifecycle operations, or production build were added.
- **Remaining:** None for this change; unrelated dirty files preserved.

## // Remediation after failed verification

- **Status:** complete; verification blockers remediated within the original four-file boundary.
- **Completed:** Fail-closed OpenSpec root inspection rejects regular-file/unreadable `openspec/changes` roots as unavailable with deterministic `invalid-source`/`read-error` reasons and never emits `done`; bounded Git records now expose `indexStatus` and `worktreeStatus`; parser accesses in `project-state.ts` are explicitly narrowed for strict `noUncheckedIndexedAccess`.
- **Files changed:** `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, `openspec/changes/shared-project-state-contract/apply-progress.md`. `tasks.md` checkboxes were already complete and were not changed.
- **TDD Cycle Evidence:**

| Cycle | Evidence |
|---|---|
| RED | Added invalid OpenSpec-root and staged/unstaged/mixed regression assertions; targeted pattern failed with absent/done OpenSpec and missing public classifications. |
| GREEN | Added root validation, public status fields, and explicit status-pair/token narrowing; targeted pattern passed 4 tests. |
| TRIANGULATE | Full focused suite initially exposed expected rename/delete status symbols; corrected assertions and reran 39 tests/160 expectations green. |
| REFACTOR | Centralized unavailable OpenSpec construction without behavior change; targeted pattern and full focused suite passed again. |

- **Verification:** `bun test tests/shared-project-state.test.ts --test-name-pattern "unreadable|invalid.*changes|OpenSpec.*unavailable|staged|unstaged|indexStatus|worktreeStatus"` — 4 passed; `bun test tests/shared-project-state.test.ts` — 39 passed; `git diff --check` on both touched source/test files — clean.
- **Strict TypeScript:** Reported command still emits only pre-existing imported-module errors in `lang.ts`, `openspec-spec-parser.ts`, `openspec-spec-sync.ts`, `project-context.ts`, `sdd-guardrails.ts`, and `sdd-router.ts` (plus missing Pi types); no errors remain attributable to `project-state.ts` or the focused test.
- **Deviations/Risks:** No router or unrelated files changed; no build or broad suite run; permission-based unreadability remains OS/user dependent, while regular-file invalid-root coverage is deterministic.
