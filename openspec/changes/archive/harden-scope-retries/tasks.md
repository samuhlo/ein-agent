# Tasks — harden-scope-retries

status: ready
blocked_by: none

## // 001. Persisted-delta preflight contract

- [x] 1.1 RED: add a focused static contract test proving `sdd-scope.md` requires validating the active change's persisted delta before `spec_delta: none`, writer invocation, replacement, or regeneration, and requires exact-byte preservation.
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Prevent a scope retry from destructively discarding an already-valid OpenSpec delta.
  - learn: Agent-prompt ordering is an executable contract when no runtime scope function owns the behavior.
  - architecture: Keep delta validity delegated to the existing declaration/parser path; keep operation ordering in the sdd-scope contract.
  - avoid: Adding transactions, staging, rollback, reconciliation, or a second delta grammar.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

- [x] 1.2 GREEN: update `ein-pi/core/agents/sdd-scope.md` with the mandatory persisted-delta preflight and byte-preserving authoritative retry rule, while retaining the existing fallback path for missing or invalid provenance.
  - skills: `architecture`, `ein-discipline`, `work-unit-commits`
  - why: Make the contract satisfy the regression and preserve valid persisted deltas on retry.
  - learn: A contract change should state both the safe ordering and the narrow fallback, not invent repair behavior.
  - architecture: `sdd-scope.md` owns executor ordering; existing validation authorities remain unchanged.
  - avoid: Rewriting canonical sync semantics or adding extra retry/timeout/model behavior.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

- [x] 1.3 TRIANGULATE: exercise the contract assertion against valid, missing, and invalid provenance wording, confirming preservation is explicit and contradictory `none`/replacement instructions are excluded.
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Ensure the static test detects both destructive ordering and accidental overreach.
  - learn: Triangulation checks the invariant from more than one wording boundary instead of trusting one substring.
  - architecture: Keep this verification at the prompt-contract seam; do not add runtime persistence machinery.
  - avoid: Broad snapshot tests that make unrelated prompt edits brittle.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

- [x] 1.4 REFACTOR: simplify the contract assertion and prompt wording without weakening ordering, exact-byte authority, or invalid-provenance fallback guarantees.
  - skills: `architecture`, `vitest`, `work-unit-commits`
  - why: Leave a small, reviewable contract work unit with durable diagnostics.
  - learn: Refactoring after green should reduce ambiguity while preserving the tested contract boundaries.
  - architecture: No new shared abstraction; the prompt and its focused test remain co-located in one work unit.
  - avoid: Generalizing this rule into a reusable reconciliation framework.
  - verify: `bun test tests/sdd-flow-contract.test.ts`

## // 002. Canonical scope-to-map provenance gate

- [x] 2.1 RED: add the router state-matrix regressions for canonical changes with scope and no map: unresolved and conflict must route away from map with state-specific blockers, while pending and synchronized remain eligible for map.
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Lock the deterministic route and diagnostic contract before changing production behavior.
  - learn: Assert route plus blocker text so a generic diagnostic cannot hide a fail-closed decision.
  - architecture: Consume the existing `specState`; constrain the gate to the ordinary canonical scope→map candidate.
  - avoid: Changing `evaluateOpenSpecState`, delta parsing, close readiness, or legacy `.sdd` routing.
  - verify: `bun test tests/sdd-router.test.ts`

- [x] 2.2 GREEN: implement the narrow `sdd-router.ts` override that changes only canonical `map` candidates with `specState` unresolved or conflict to `scope`, carrying the exact provenance blocker and suggested action.
  - skills: `architecture`, `ein-discipline`, `work-unit-commits`
  - why: Fail closed before map without expanding the existing SddNext vocabulary or state semantics.
  - learn: A candidate-based gate is safer than a global phase gate because it preserves unrelated lifecycle routing.
  - architecture: `resolveSddStatus` owns status selection; `resolveSddNext` surfaces the same provenance-specific reason/action.
  - avoid: Introducing a remediation phase, new blocker type, or broad gating of pending/synchronized/later phases.
  - verify: `bun test tests/sdd-router.test.ts`

- [x] 2.3 TRIANGULATE: run the focused router matrix and add/retain compatibility assertions for legacy routing and boundary conditions (missing scope, existing map, later phases).
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Demonstrate the override is canonical-only and limited to scope→map.
  - learn: Boundary tests protect the negative space of a narrow routing change.
  - architecture: Reuse current fixtures and authorities rather than adding parser or sync helpers.
  - avoid: Blocking pending or synchronized provenance merely because it is not yet fully synchronized.
  - verify: `bun test tests/sdd-router.test.ts`

- [x] 2.4 REFACTOR: consolidate repeated provenance assertions and keep blocker/action text deterministic without changing the four-state behavior matrix.
  - skills: `architecture`, `vitest`, `work-unit-commits`
  - why: Keep router and tests reviewable while preserving explicit diagnostics.
  - learn: Deterministic status text is part of the API when downstream reports assert it.
  - architecture: Keep state evaluation in existing authorities and routing policy in `sdd-router.ts`.
  - avoid: Refactoring the router broadly or touching excluded lifecycle behavior.
  - verify: `bun test tests/sdd-router.test.ts`

## // 003. Next-dispatcher diagnostic visibility

- [x] 3.1 RED: add a focused dispatcher regression proving unresolved or conflict output reports the non-map remediation route and includes the exact provenance blocker/reason, while leaving dry-run and command wiring behavior intact.
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Ensure the user-facing next-step report cannot erase the router's fail-closed diagnostic.
  - learn: Status correctness is incomplete if the rendered next-step report presents a misleading generic action.
  - architecture: Reuse the router's status and reason; do not create a second routing decision in the dispatcher.
  - avoid: Altering dispatcher commands, dry-run semantics, or adding delivery behavior.
  - verify: `bun test tests/sdd-next-dispatcher.test.ts`

- [x] 3.2 GREEN: wire `resolveSddNext()` report formatting to preserve the router's provenance-specific scope route, reason, and suggested action for blocked canonical states.
  - skills: `architecture`, `ein-discipline`, `work-unit-commits`
  - why: Satisfy the report-level contract without changing phase types or synchronization semantics.
  - learn: Diagnostics should travel through one authority rather than being reconstructed at each presentation layer.
  - architecture: Router owns the decision; dispatcher only exposes its deterministic report.
  - avoid: Duplicating spec-state evaluation or proposing a new repair/reconciliation flow.
  - verify: `bun test tests/sdd-next-dispatcher.test.ts`

- [x] 3.3 TRIANGULATE: run the complete focused suite and confirm unresolved/conflict reasons remain state-specific while pending/synchronized map eligibility and legacy tests stay green.
  - skills: `bun`, `vitest`, `ein-discipline`
  - why: Validate integration across contract, status, and report surfaces.
  - learn: A focused cross-surface run catches diagnostic drift that isolated unit tests can miss.
  - architecture: Keep the change limited to declared contract/router/test surfaces.
  - avoid: Running or modifying optimize-tdd-verify artifacts and roadmap files.
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-flow-contract.test.ts`

- [x] 3.4 REFACTOR: remove redundant dispatcher assertions or helpers while retaining route, blocker, and reason coverage and the existing dry-run/command wiring tests.
  - skills: `architecture`, `vitest`, `work-unit-commits`
  - why: Finish with compact tests that explain the public diagnostic contract.
  - learn: Refactor test structure only after the integrated behavior is green.
  - architecture: Tests stay with the router/dispatcher behavior they prove; no generic test framework is introduced.
  - avoid: Broad test-suite rewrites or unrelated typecheck/build/config changes.
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-flow-contract.test.ts`
