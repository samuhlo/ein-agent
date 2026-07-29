# Tasks — sdd-close-force-guard

status: ready
blocked_by: none

## // 001. Classify close readiness and declarationless legacy eligibility

- [x] 1.1 Add router-owned structured blocker codes and an explicit `declarationless-record` legacy-eligibility fact without changing the underlying lifecycle assessment or writing spec artifacts.
  - paths: production: `ein-pi/agent/lib/sdd-router.ts`; tests: `tests/sdd-router.test.ts`
  - skills: `bun`, `ein-discipline`
  - why: Close policy needs stable filesystem-derived facts instead of brittle localized reason-string matching.
  - learn: Separate evidence classification from the policy that consumes it so new blockers fail closed by default.
  - architecture: `sdd-router.ts` owns readiness facts, all blocker codes/messages, and eligibility; it does not archive or decide whether force may proceed.
  - avoid: Recomputing task/apply/verify/summary freshness in `sdd-close.ts` or treating every `unresolved` state as legacy.
  - acceptance: Recognize eligibility only for a canonical `openspec/changes/` record with `unresolved` state, readable declarationless `scope.md`, no delta document, no `sync-report.md`, and all non-spec gates passing; classify pending, malformed tokens/deltas, read failures, stale/borrowed/mismatched sync evidence, conflict, and mixed artifacts as ineligible.
  - verify: `bun test tests/sdd-router.test.ts`

## // 002. Enforce fail-closed close policy and truthful escape results

- [x] 2.1 Extend the close boundary with optional `legacyReason`, validate it deterministically, and permit force only for the router’s exact eligible declarationless-unresolved classification.
  - paths: production: `ein-pi/agent/lib/sdd-close.ts`; tests: `tests/sdd-close.test.ts`
  - skills: `bun`, `ein-discipline`
  - why: The library boundary must prevent programmatic callers from using force as a general readiness bypass.
  - learn: Validate an audit requirement at the state-changing boundary, not solely at argument parsing.
  - architecture: `sdd-close.ts` consumes router facts, owns force policy and reason validation, and leaves rename-first/copy-remove movement and collision protection unchanged.
  - avoid: A force denylist, UI-only reason validation, archive audit-file creation, or automatic spec synchronization.
  - acceptance: Require a trimmed, non-empty reason of at most 200 characters that is not `none`, `n/a`, `na`, `tbd`, `unknown`, or `-`; reject invalid/missing reasons without moving the source or creating an archive destination; preserve the normal success shape and add `legacyEscape { used: true, priorSpecState: "unresolved", eligibility: "declarationless-record", reason }` only for a successful escape.
  - verify: `bun test tests/sdd-close.test.ts`

- [x] 2.2 Add table-driven close regressions for the complete normal-versus-force matrix, result/audit distinction, and no-movement rejection behavior.
  - paths: production: `ein-pi/agent/lib/sdd-close.ts`; tests: `tests/sdd-close.test.ts`
  - skills: `bun`, `ein-discipline`
  - why: The narrow exception is safe only when every ordinary lifecycle failure remains an absolute blocker under force.
  - learn: A decision table becomes durable behavior when each row is represented by a focused regression case.
  - architecture: Tests prove the public close contract while router-specific artifact-shape classification remains covered in `tests/sdd-router.test.ts`.
  - avoid: Fixtures that use `force` to mask incomplete lifecycle evidence or assertions that inspect only a generic success flag.
  - acceptance: Test normal and forced close for pending/malformed/blocked tasks; absent/partial/blocked/unknown/non-complete apply; absent/fail/unknown/stale verify; absent/stale summary; pending spec; conflict spec; unresolved malformed/ineligible spec; exact eligible declarationless unresolved spec with and without force/reason; multiple simultaneous blockers; ready synchronized close with force but no escape marker; `.sdd/changes/` fallback with incomplete evidence; unchanged source/no archive on rejection; and distinguishable normal versus legacy result/audit output.
  - verify: `bun test tests/sdd-close.test.ts tests/sdd-router.test.ts`

## // 003. Wire audited force arguments and narrow help/output

- [x] 3.1 Wire command and `ein_sdd_close` tool reason input to `legacyReason`, render normal and legacy success differently, and replace general-bypass help with the approved narrow wording.
  - paths: production: `ein-pi/agent/extensions/ein-ai.ts`; tests: `tests/sdd-flow-contract.test.ts`
  - skills: `bun`, `cognitive-doc-design`, `ein-discipline`
  - why: Users and tool callers need an explicit audit reason and must not be told that force bypasses readiness.
  - learn: User-facing help should describe the boundary truthfully enough that the safe path is the obvious path.
  - architecture: `ein-ai.ts` parses, passes, and presents values only; eligibility and reason validation remain in the close library.
  - avoid: Duplicating legacy eligibility in the extension, calling a successful escape ordinary synchronized completion, or adding a new SDD phase.
  - acceptance: Help states that `--force --reason "<audit reason>"` is only for an otherwise complete, freshly verified declarationless legacy record; it never bypasses tasks, apply, verify, summary, pending synchronization, or conflicts; close never synchronizes specs; legacy output says `Closed through legacy escape (spec state remained unresolved): <reason>`; normal output has no escape wording.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

## // 004. Correct and synchronize the lifecycle contract

- [x] 4.1 Correct the change delta before synchronization: modify `canonical-close-readiness` and narrow the added legacy scenario from pending-or-unresolved to the exact declarationless `unresolved` shape.
  - paths: docs/spec delta: `openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md`; canonical docs/spec: `openspec/specs/sdd-lifecycle/spec.md`; tests: `tests/sdd-flow-contract.test.ts`
  - skills: `cognitive-doc-design`, `ein-discipline`
  - why: The current delta contradicts the accepted design by allowing pending evidence and by failing to modify the canonical readiness scenario.
  - learn: A delta must amend the governing scenario directly when an exception changes its meaning; an added conflicting scenario is not sufficient.
  - architecture: OpenSpec remains the lifecycle contract; synchronization applies the corrected delta and does not add archive semantics or write runtime spec evidence during close.
  - avoid: Leaving `pending` eligible, adding a new archive format/integrity mechanism, or implementing automatic synchronization during close.
  - acceptance: The delta contains a `MODIFIED` `canonical-close-readiness` scenario stating that unresolved/pending/malformed/stale/conflicted canonical evidence blocks close except force for the exact unresolved declarationless shape after all non-spec gates and a valid reason; its scenario says normal close still requires synchronization, pending/conflict/malformed/stale always block, and the exception returns legacy evidence without reclassification; the legacy added scenario requires absent delta and sync artifacts; synchronized `openspec/specs/sdd-lifecycle/spec.md` agrees exactly.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

## // 005. Review workload forecast and focused regression gate

- [x] 5.1 Keep the implementation within the review budget and run the mapped focused regression set after the four bounded groups are complete.
  - paths: production: `ein-pi/agent/lib/sdd-router.ts`, `ein-pi/agent/lib/sdd-close.ts`, `ein-pi/agent/extensions/ein-ai.ts`; tests: `tests/sdd-router.test.ts`, `tests/sdd-close.test.ts`, `tests/sdd-flow-contract.test.ts`; docs/spec: `openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md`, `openspec/specs/sdd-lifecycle/spec.md`; generated: none
  - skills: `bun`, `ein-discipline`, `cognitive-doc-design`
  - why: The cross-cutting guard remains reviewable only if its code, regressions, and contract stay bounded and agree.
  - learn: Forecast production lines separately from tests and specs so the PR safety gate measures the code reviewers must reason about.
  - architecture: No dependency, phase, archive-integrity redesign, or automatic spec synchronization is introduced; changes stay in the existing router/close/extension and OpenSpec boundaries.
  - avoid: Bundling unrelated cleanup, generated output, installers/updaters, or broad lifecycle refactoring into this fix.
  - acceptance: Forecast: production ≤280 changed lines (3 files), tests ≤360 changed lines (3 files), docs/spec ≤140 changed lines (2 files), generated 0; before delivery, measure production changes with the configured review-workload command and stop for a delivery decision if the total exceeds 400 lines.
  - verify: `bun test tests/sdd-close.test.ts tests/sdd-router.test.ts tests/sdd-flow-contract.test.ts`
