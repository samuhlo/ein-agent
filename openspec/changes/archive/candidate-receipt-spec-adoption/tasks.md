# Tasks — candidate-receipt-spec-adoption

status: ready
blocked_by: none

line_forecast: docs +1/-0, specs +64/-0, tests +0/-0, production +0/-0

## // 001. Author the ADDED-only lifecycle delta

- [x] 1.1 Create `openspec/changes/candidate-receipt-spec-adoption/specs/sdd-lifecycle/spec.md` as an `openspec-delta/v1` for `sdd-lifecycle`, with only `## ADDED` and the eight designed candidate-receipt scenarios.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: Adopt the observable, already-merged candidate-receipt contract without claiming this SDD implemented PR #43 (`b11f4a3`).
  - learn: A delta adds new contractual behavior without rewriting the history or meaning of existing canonical scenarios.
  - architecture: The change delta owns new lifecycle requirements; runtime, tool wiring, and tests remain contrast sources and are not edited.
  - avoid: Using `MODIFIED`/`REMOVED`, copying internal temporary-index details, or turning the receipt into a delivery gate or mechanical lane.
  - verify: `bun test tests/openspec-specs.test.ts`

## // 002. Synchronize the canonical OpenSpec projection

- [x] 2.1 Run `ein_openspec_sync` for `candidate-receipt-spec-adoption`, retain `openspec/changes/candidate-receipt-spec-adoption/sync-report.md`, and confirm it reports the current delta and conflict-free canonical result.
  - skills: `ein-discipline`, `bun`
  - why: Make the canonical `sdd-lifecycle` contract an idempotent, tool-produced projection of the ADDED-only delta.
  - learn: `sync-report.md` binds the delta and canonical bytes through digests, so a successful sync is reproducible evidence rather than a manual copy.
  - architecture: `ein_openspec_sync` exclusively owns updates to `openspec/specs/sdd-lifecycle/spec.md` and the sync receipt; authors do not hand-edit the projection.
  - avoid: Editing `openspec/specs/sdd-lifecycle/spec.md` or fabricating sync evidence by hand.
  - verify: `bun test tests/openspec-specs.test.ts`

## // 003. Contrast the adopted contract and preserve roadmap boundaries

- [x] 3.1 Contrast `openspec/specs/sdd-lifecycle/spec.md` and `openspec/changes/candidate-receipt-spec-adoption/sync-report.md` with the merged behavior in `ein-pi/agent/lib/candidate-receipt.ts`, `ein-pi/agent/extensions/ein-ai.ts`, and `tests/candidate-receipt.test.ts`; update only the slice-03 adoption state in `docs/sdd-cost-plan.md` if that completion boundary is satisfied, while leaving slice 03 incomplete if its mechanical lane or slice-04 consumption remains out of scope.
  - skills: `ein-discipline`, `cognitive-doc-design`, `bun`
  - why: Confirm the canonical specification faithfully adopts current behavior while preventing a documentation status from claiming later delivery-consumption work.
  - learn: A verified contract can complete a specification-adoption milestone without completing dependent delivery capabilities.
  - architecture: OpenSpec is the canonical contract; the roadmap records bounded milestone state and must not collapse slice-03 adoption into the out-of-scope mechanical lane or slice-04 consumer work.
  - avoid: Production or test edits, retrospective implementation claims, or marking slice 03 complete solely because the sync succeeded.
  - verify: `bun test tests/candidate-receipt.test.ts && bun test tests/openspec-specs.test.ts`
