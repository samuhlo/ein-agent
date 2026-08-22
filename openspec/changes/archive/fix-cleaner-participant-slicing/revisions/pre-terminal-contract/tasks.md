# Tasks — fix-cleaner-participant-slicing

status: ready
blocked_by: none

## // 001. Authoritative Cleaner limits contract

- [x] 1.1 RED/GREEN/TRIANGULATE/REFACTOR: add focused `bun:test` coverage proving the exported immutable Cleaner limits are consumed by both audit collection and planning, then expose the single limits contract without changing collector rejection behavior.
  - skills: `ein-discipline`, `vitest`
  - why: The slicer and collector must share one authoritative file-count and UTF-8 byte limit.
  - learn: Shared policy values belong at the boundary that owns the policy, not in each consumer.
  - architecture: `cleaner-audit-evidence.ts` owns limits; consumers import the contract.
  - avoid: Copying numeric constants into `sdd-participants.ts` or probing limits via intentional failures.
  - verify: `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts`

## // 002. Deterministic slice planner and limits

- [x] 2.1 RED/GREEN/TRIANGULATE/REFACTOR: test reordered inputs, lexical ordering, exact 32-file and 128-KiB boundaries, dual-limit crossings, multibyte UTF-8 byte accounting, stable slice/passages IDs, and once-only coverage; implement the validated sorted snapshot and contiguous greedy planner.
  - skills: `ein-discipline`, `vitest`
  - why: Cleaner work must be partitioned completely and reproducibly before any participant execution.
  - learn: Deterministic boundaries require canonical ordering and raw byte measurements.
  - architecture: `sdd-participants.ts` owns changed-scope validation, planner identity, boundaries, and slice descriptors.
  - avoid: Bin-packing, reordering for fit, or replanning after each Cleaner mutation.
  - verify: `bun test tests/sdd-participants.test.ts`

- [x] 2.2 RED/GREEN/TRIANGULATE/REFACTOR: test oversized, non-UTF-8, and authoritative-contract-rejected files as durable planning blockers with complete declared-path representation and no admitted task; implement fail-closed blocker descriptors.
  - skills: `ein-discipline`, `vitest`
  - why: Impossible or rejected scope must never be silently omitted or issued as runnable Cleaner work.
  - learn: A planner blocker is evidence and must preserve the reason and affected scope.
  - architecture: Planner records blockers in the participant plan; Cleaner execution remains the audit contract’s responsibility.
  - avoid: Dropping an impossible file or treating an empty generated slice as runnable.
  - verify: `bun test tests/sdd-participants.test.ts`

## // 003. Versioned participant checkpoint schema

- [x] 3.1 RED/GREEN/TRIANGULATE/REFACTOR: add schema tests for strict v3 sliced payload validation, canonical ranges/order/unique IDs, limit compliance, legal transitions, state chains, Architect ordering, and the 32 KiB serialization ceiling; implement the minimal v3 types and serializer/validator.
  - skills: `ein-discipline`, `vitest`
  - why: Restart-safe slicing needs a durable contract that rejects malformed or overflowing evidence.
  - learn: Foundational schemas should be introduced and validated before their state-machine consumers.
  - architecture: `continuity-checkpoint.ts` owns versioned participant types, validation, canonical revision serialization, and bounds.
  - avoid: Evicting evidence to fit history or accepting permissive unknown keys/states.
  - verify: `bun test tests/continuity-checkpoint.test.ts`

## // 004. Legacy migration and bounded prior-generation evidence

- [x] 4.1 RED/GREEN/TRIANGULATE/REFACTOR: test v1 and legacy v2 reads, one-identical-slice carry-forward, multi-slice non-fan-out, preservation of blocked evidence, bounded history, and overflow rejection; implement migration to v3 with legacy contract identity and prior-generation retention.
  - skills: `ein-discipline`, `vitest`
  - why: Existing checkpoints must remain readable without allowing old aggregate evidence to imply completion of new slices.
  - learn: Compatibility means preserving old evidence and gating new work, not rewriting history into success.
  - architecture: `continuity-checkpoint.ts` performs compatibility parsing/migration; existing checkpoint-store CAS remains the publication boundary.
  - avoid: Deleting blocked generations, fanning one legacy result across multiple slices, or evicting history.
  - verify: `bun test tests/continuity-checkpoint.test.ts`

## // 005. Durable per-slice admission and evidence state

- [x] 5.1 RED/GREEN/TRIANGULATE/REFACTOR: test pending/admitted-without-result/complete/blocked/failed-ambiguous/stale states, one-current-pending admission, restart after admission, CAS conflict, expected frontier chaining, and stale or duplicate terminal results; implement the per-slice state machine and optimistic checkpoint publication.
  - skills: `ein-discipline`, `vitest`
  - why: Admission and terminal evidence must survive crashes and advance only an unambiguous current slice.
  - learn: Durable admission is evidence; an admitted unit without a result is blocked rather than silently retryable.
  - architecture: `sdd-participants.ts` owns unit progression and state transitions; checkpoint store provides atomic revision-conditional writes.
  - avoid: Aggregate completed counters, agent-only running keys, automatic reruns after ambiguous output, or accepting stale state references.
  - verify: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint-store.test.ts`

## // 006. Participant routing and Architect final-state binding

- [x] 6.1 RED/GREEN/TRIANGULATE/REFACTOR: test slice-qualified marker identity, exact next-task admission, sequential before/after state references, foreground routing, and rejection of stale/late Cleaner tasks and results; implement participant routing for one current slice at a time.
  - skills: `ein-discipline`, `vitest`
  - why: Routing must not let an old task complete a different slice or bypass the execution frontier.
  - learn: Task identity must include the durable unit, exact selector range, passage, and expected state.
  - architecture: `sdd-participants.ts` owns routing decisions and passage-unit concurrency keys; adapters only execute the selected foreground unit.
  - avoid: Agent-only passage locks, legacy unqualified markers, or parallel Cleaner execution.
  - verify: `bun test tests/sdd-participants.test.ts`

- [x] 6.2 RED/GREEN/TRIANGULATE/REFACTOR: test Architect unavailable before all slices, fresh full-scope seal binding after the final slice, stale source rejection, and stale Architect task/result rejection; implement the separate durable Architect binding transition and verify gate inputs.
  - skills: `ein-discipline`, `vitest`
  - why: Architect and verify must observe the final changed scope, not merely a slice count.
  - learn: Final-state freshness requires recomputing and persisting a seal after the last mutation.
  - architecture: `sdd-participants.ts` creates and validates Architect only after complete current Cleaner evidence; `guardSddVerify()` remains a durable-plan gate.
  - avoid: Reusing a pre-Cleaner Architect task or inferring freshness from completion counts.
  - verify: `bun test tests/sdd-participants.test.ts`

## // 007. Blocked-generation recovery and integration edges

- [x] 7.1 RED/GREEN/TRIANGULATE/REFACTOR: test unchanged blocked generations remaining identical, changed apply/planner identities creating one fresh generation, preserved prior evidence, revision-CAS failure behavior, and post-acquisition participant disablement remaining gated; implement evidence-preserving reinitialization through the existing checkpoint store.
  - skills: `ein-discipline`, `vitest`
  - why: Recovery must require a real identity change and cannot erase acquired work.
  - learn: Fail-closed recovery archives evidence before starting a new generation and treats publication failure as blocked.
  - architecture: Participant planner owns generation identity; `continuity-checkpoint-store.ts` owns atomic publication.
  - avoid: Rewriting blocked checkpoints in place, resetting acquired units, or making unchanged retries appear fresh.
  - verify: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts`

- [x] 7.2 RED/GREEN/TRIANGULATE/REFACTOR: add only the marker recognition/wiring changes required by slice-qualified participant markers, preserving foreground execution and apply-complete/exact-selector boundaries; update focused edge tests and leave installer untouched.
  - skills: `ein-discipline`, `vitest`
  - why: Runtime edges must recognize the extended marker without broad adapter or execution-policy changes.
  - learn: Keep runtime adapters thin; route policy and evidence remain in deterministic core modules.
  - architecture: `sdd-preflight.ts`/`ein-ai.ts` change only if marker recognition requires it; no installer ownership is introduced.
  - avoid: Broad adapter rewrites, lifecycle-router changes, or participant-disable bypasses.
  - verify: `bun test tests/sdd-participants.test.ts`

## // 008. Integration and verification gates

- [x] 8.1 RED/GREEN/TRIANGULATE/REFACTOR: exercise end-to-end restart, stale-call, blocked-planner, legacy-migration, final-seal, and verify-gate scenarios using the focused suites; then run the full root test and typecheck gates.
  - skills: `ein-discipline`, `vitest`
  - why: Integration must prove durable evidence and fail-closed gating across the complete participant flow.
  - learn: Passing focused tests is necessary but does not replace repository-wide tests and TypeScript checks.
  - architecture: Verification crosses the participant, checkpoint, store, and optional adapter boundaries without adding build steps.
  - avoid: Running a build, weakening existing assertions, or treating `bun test` as a typecheck.
  - verify: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts && bun test && bun run typecheck`

- [x] 8.2 Manual verification: inspect continuity after restart between slices, confirm stable IDs and retained prior evidence, submit stale Cleaner/Architect calls, and confirm verify remains blocked; run installer typecheck only if installer files were actually touched.
  - skills: `ein-discipline`
  - why: Durable restart and stale-call behavior needs inspection beyond assertions.
  - learn: Evidence provenance is verified by observing persisted checkpoints, not only returned in-memory decisions.
  - architecture: Manual checks validate the existing checkpoint-store boundary and do not expand installer scope.
  - avoid: Running any build or claiming installer coverage when no installer file changed.
  - verify: `bun run typecheck` (and, only if installer files are touched, `cd installer && bun run typecheck`)
