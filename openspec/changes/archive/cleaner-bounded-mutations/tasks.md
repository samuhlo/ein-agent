# Tasks — cleaner-bounded-mutations

status: ready
blocked_by: none

## // 001. Establish the bounded mutation contract

- [x] 1.1 Define the immutable request, declaration, dependency adapters, discriminated outcomes, state-transition/invalidation records, verification record, and stable reason codes in `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; add contract fixtures/types in `tests/cleaner-bounded-mutations.test.ts`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Consumers need one explicit I-owned contract that cannot represent collections, autonomous selection, or a second writer.
  - learn: A narrow discriminated contract makes forbidden behavior unrepresentable before implementation details exist.
  - architecture: I owns the application/completion boundary; H, G, B, router, and SDD artifacts remain authorities and are injected/read rather than rewritten.
  - avoid: Adding `apply` to the read-only audit or introducing a generic patch/codemod API.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts -t "contract shape"`

  RED → GREEN → TRIANGULATE → REFACTOR evidence: RED records missing exported contract symbols; GREEN records the smallest type-only contract compiling and focused tests passing; TRIANGULATE asserts one target/one operation/one writer and rejects collection-shaped requests; REFACTOR records no behavior change and focused contract tests remain green.
  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`
  dependencies: none

## // 002. Implement fail-closed admission and exact replacement validation

- [x] 2.1 Implement fresh single-finding resolution, B/G/H freshness and attribution preconditions, canonical ownership/path checks, and exact one-file UTF-8 replacement validation in `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; cover all pre-write denials in `tests/cleaner-bounded-mutations.test.ts`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Admission must deny stale, ambiguous, out-of-area, non-mechanical, or broadened requests before invoking a writer.
  - learn: Validate identity, ownership, bytes, and digest invariants before side effects; never infer a cleanup from an audit finding.
  - architecture: The command consumes freshly projected authority-owned evidence and validates one declared target/operation, while the injected writer is not called during admission failure.
  - avoid: Selecting the first finding, choosing an occurrence, trusting a carried report, or using session/baseline state as permission.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts -t "admission|ownership|mechanical|precondition"`

  RED → GREEN → TRIANGULATE → REFACTOR evidence: RED shows each focused denial test fails because no admission exists; GREEN shows zero writer calls for stale/invalid/unavailable/ambiguous/unknown/multiple findings, ownership escapes, invalid files, digest mismatch, no-op, zero/multiple matches, and forbidden operation shapes; TRIANGULATE demonstrates distinct stable reason codes and no write on final state/content races; REFACTOR keeps all denial and compatibility assertions green.
  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`
  dependencies: Group 001

## // 003. Implement the single-write transition and conservative invalidation

- [x] 3.1 Implement immediate final B/content comparison, exactly-one synchronous writer invocation, before/after state capture, post-write digest/state checks, and `verification-required`/`mutation-uncertain` outcomes in `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; test successful transition, writer failure, and no retry/rollback in `tests/cleaner-bounded-mutations.test.ts`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: The mutation must be one bounded write and must make prior evidence non-current whenever relevant bytes may have changed.
  - learn: A successful write is not completion; state transition records must force fresh verification, and uncertain writes must stop visibly.
  - architecture: I records transition identities and invalidation only; it does not rewrite H reports, G ledger bytes, router state, stage, commit, or repair evidence.
  - avoid: Retry loops, compensating writes, automatic rollback, staging, or treating unchanged/unknown post-state as success.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts -t "single write|invalidation|uncertain|writer"`

  RED → GREEN → TRIANGULATE → REFACTOR evidence: RED shows transition tests fail without the writer path; GREEN proves one writer call and distinct observed/resulting state refs on success; TRIANGULATE forces writer throw, unreadable post-state, unexpected digest, and state identity anomalies, proving uncertain outcomes with zero retries; REFACTOR preserves writer-call counts and compatibility contracts.
  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`
  dependencies: Groups 001–002

## // 004. Implement separate fresh-verification completion assessment

- [x] 4.1 Implement the pure completion predicate for exact resulting B state, non-stale router verification, passing attributable command evidence, and matching state binding in `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; add missing/stale/unbound/wrong-state/resume/runtime cases in `tests/cleaner-bounded-mutations.test.ts`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Completion must remain a separate lifecycle step and cannot be implied by mutation success or session continuity.
  - learn: Freshness is an exact state-bound evidence property, not elapsed time or a resumed runtime session.
  - architecture: SDD verify owns command execution/evidence; I only assesses whether supplied evidence is attributable, passing, fresh, and bound to the resulting state.
  - avoid: Running tests inside apply, refreshing old verification automatically, or accepting router `pass` without exact Git-state binding.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts -t "completion|verification|required|resume|runtime"`

  RED → GREEN → TRIANGULATE → REFACTOR evidence: RED shows completion tests fail without the predicate; GREEN proves only fresh passing evidence at the exact resulting state yields complete; TRIANGULATE proves missing/failed/stale/unbound/wrong-state evidence and resume/runtime changes remain incomplete; REFACTOR leaves focused and prior read-only suites green.
  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`
  dependencies: Group 003

## // 005. Compatibility and bounded-scope verification

- [x] 5.1 Preserve existing H/G/B/router contracts and execute focused, compatibility, and typecheck verification without modifying existing authority files.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: The I seam must not widen read-only audit, ledger, project-state, router, workbench, or installer ownership.
  - learn: Compatibility tests are evidence that a new boundary did not smuggle side effects into an existing authority.
  - architecture: Only the new I module and its contract suite are production/test scope; all existing seams remain unchanged consumers.
  - avoid: Wiring UI/workbench/installer behavior or “fixing” unrelated compatibility failures in this slice.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts tests/cleaner-read-only-audit.test.ts tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/sdd-router.test.ts && cd installer && bun run typecheck`

  RED → GREEN → TRIANGULATE → REFACTOR evidence: RED is the focused suite before implementation; GREEN is focused suite after each bounded implementation group; TRIANGULATE is the compatibility suite plus adversarial forbidden-mode cases; REFACTOR is final focused/compatibility/typecheck output with no scope-expanding edits.
  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`, `tests/cleaner-read-only-audit.test.ts`, `tests/reviewed-area-ledger.test.ts`, `tests/shared-project-state.test.ts`, `tests/sdd-router.test.ts`
  dependencies: Group 004

## // 006. Remediate verification blockers with strict-TDD boundary hardening

- [x] 6.1 RED → GREEN → TRIANGULATE → REFACTOR: add adversarial runtime-shape tests in `tests/cleaner-bounded-mutations.test.ts` proving architect-labelled seams and extra collection-shaped `findings`/`writers` fields are rejected fail-closed with zero writer calls; implement only the corresponding runtime validation in `ein-pi/agent/lib/cleaner-bounded-mutations.ts`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Independent verification showed architect-labelled seams and unknown collection fields can currently reach admission instead of being denied.
  - learn: TypeScript shapes do not protect runtime callers; boundary validators must reject forbidden ownership and unknown keys explicitly.
  - architecture: The I mutation boundary owns runtime admission; architect/structural work remains outside this seam, and writer capability remains singular and untouched.
  - avoid: Accepting opaque seam labels, silently ignoring unknown keys, coercing collections into singular values, or changing H/G/B/router authorities.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts -t "architect|extra fields|runtime shape|contract shape"`

- [x] 6.2 RED → GREEN → TRIANGULATE → REFACTOR: reduce and simplify the implementation in `ein-pi/agent/lib/cleaner-bounded-mutations.ts` so the production diff for this change is at most 400 changed lines while preserving the designed public behavior; use the existing compatibility assertions in `tests/cleaner-bounded-mutations.test.ts` as the regression contract.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Verification measured 807 production changed lines, exceeding the design and review-budget ceiling.
  - learn: A bounded public contract is easier to review when duplicated plumbing is removed without broadening behavior or ownership.
  - architecture: Keep all admission, one-write transition, invalidation, and completion ownership in the existing I module; do not split scope into new production files or add abstractions without present payoff.
  - avoid: Dropping safety checks, weakening public behavior, introducing a generic patch engine, or moving code into authority/UI/installer files to disguise the diff.
  - verify: `git diff --numstat -- ein-pi/agent/lib/cleaner-bounded-mutations.ts` and confirm production changed lines are `<=400`; then run `bun test tests/cleaner-bounded-mutations.test.ts`.

- [x] 6.3 RED → GREEN → TRIANGULATE → REFACTOR: normalize `openspec/changes/cleaner-bounded-mutations/apply-progress.md` into the required `TDD Cycle Evidence` markdown table for groups 1–6, transcribing only evidence already present and marking unavailable RED/GREEN/TRIANGULATE/REFACTOR evidence as not recorded rather than inventing it.
  - skills: `ein-discipline`, `architecture`
  - why: Strict-TDD verification failed because apply-progress has prose bullets but no required evidence table.
  - learn: Lifecycle artifacts must distinguish observed command evidence from retrospective claims; missing evidence stays explicitly missing.
  - architecture: Apply-progress is the lifecycle evidence artifact; it records execution history only and does not become a source of implementation behavior.
  - avoid: Fabricating commands, results, timestamps, or RED evidence, or editing design, verify-report, source, or tests in this step.
  - verify: `grep -n "TDD Cycle Evidence" openspec/changes/cleaner-bounded-mutations/apply-progress.md` and manually confirm every cell is sourced or marked not recorded.

- [x] 6.4 RED → GREEN → TRIANGULATE → REFACTOR: run focused and full compatibility verification after 6.1–6.3, including hostile architect/extra-field cases, the bounded production diff check, and the existing compatibility/typecheck command without widening the approved file scope.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: The remediation is complete only when all four independent blockers are addressed and designed behavior remains compatible.
  - learn: A green focused suite is necessary but insufficient when verification also checks runtime boundaries, artifact evidence, and review-budget constraints.
  - architecture: Only the exact production file, exact test file, and tasks/apply-progress artifacts may change; existing authority files remain untouched.
  - avoid: Treating installer typecheck alone as coverage of the new module, accepting stale evidence, or fixing unrelated compatibility failures.
  - verify: `bun test tests/cleaner-bounded-mutations.test.ts && bun test tests/cleaner-read-only-audit.test.ts tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/sdd-router.test.ts && cd installer && bun run typecheck`

  production files: `ein-pi/agent/lib/cleaner-bounded-mutations.ts`
  test files: `tests/cleaner-bounded-mutations.test.ts`
  artifact files: `openspec/changes/cleaner-bounded-mutations/tasks.md`, `openspec/changes/cleaner-bounded-mutations/apply-progress.md`
  dependencies: Groups 001–005

## // 007. Remediate exact TypeScript diagnostics and artifact whitespace

- [x] 7.1 Inspect the latest verify-run diagnostics exactly at lines 273, 284, 287, 291, 313, and 396 of `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; make the smallest type-safe corrections required there, preserving behavior and keeping production changed lines at `<=400`.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: The latest verification captured direct TypeScript failures at these exact locations; they must be resolved without widening the bounded mutation contract.
  - learn: Correct compiler diagnostics at the narrowest boundary rather than weakening types or expanding runtime behavior.
  - architecture: Keep all remediation inside the existing I-owned module; do not alter H/G/B/router authorities or add production files.
  - avoid: Broad casts, `any`, behavioral changes, generic abstractions, or moving code to disguise the line budget.
  - verify: `bunx tsc --noEmit --pretty false ein-pi/agent/lib/cleaner-bounded-mutations.ts` (or the exact direct diagnostic command recorded by the latest verify run); inspect only the listed diagnostics and confirm no new diagnostics.

- [x] 7.2 Remove the extra blank line at end-of-file from `openspec/changes/cleaner-bounded-mutations/apply-progress.md`, without changing its recorded evidence.
  - skills: `ein-discipline`
  - why: Verification identified a whitespace-only artifact defect that must be corrected independently of source behavior.
  - learn: Normalize artifact whitespace mechanically while preserving lifecycle evidence content byte-for-byte otherwise.
  - architecture: `apply-progress.md` remains an evidence artifact; this step owns no implementation or test changes.
  - avoid: Reformatting the table, rewriting evidence, or editing any artifact other than the specified EOF whitespace.
  - verify: `python3 -c 'from pathlib import Path; p=Path("openspec/changes/cleaner-bounded-mutations/apply-progress.md"); b=p.read_bytes(); assert b.endswith(b"\\n") and not b.endswith(b"\\n\\n")'`

- [x] 7.3 Rerun direct module diagnostics, the full cleaner/compatibility tests, installer typecheck, whitespace validation, and the production line-budget check; change tests only if a genuine behavior correction requires it.
  - skills: `ein-discipline`, `architecture`, `vitest`
  - why: Final verification must prove the targeted type fixes, compatibility, artifact cleanliness, and `<=400` production-line budget together.
  - learn: A remediation is complete only when focused diagnostics and independent compatibility/budget checks agree.
  - architecture: Production scope is exactly `ein-pi/agent/lib/cleaner-bounded-mutations.ts`; `tests/cleaner-bounded-mutations.test.ts` is conditional only for behavior correction; artifact scope is exactly `apply-progress.md`.
  - avoid: Skipping direct diagnostics, treating installer typecheck as module coverage, changing tests speculatively, or accepting unrelated failures as remediation success.
  - verify: `bunx tsc --noEmit --pretty false ein-pi/agent/lib/cleaner-bounded-mutations.ts && bun test tests/cleaner-bounded-mutations.test.ts && bun test tests/cleaner-read-only-audit.test.ts tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/sdd-router.test.ts && (cd installer && bun run typecheck) && git diff --check && test "$(git diff --numstat -- ein-pi/agent/lib/cleaner-bounded-mutations.ts | awk '{a+=$1; d+=$2} END {print a+d+0}')" -le 400`
  - dependencies: Group 006
