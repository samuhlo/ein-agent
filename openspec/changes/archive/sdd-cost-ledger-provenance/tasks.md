# Tasks — sdd-cost-ledger-provenance

status: ready
blocked_by: none

## // 001. Local provenance identity and immutable receipt sidecars

- [x] 1.1 Create the locally owned identity, flow-manifest, stable-source-binding, immutable-sidecar, and metric-normalization contract.
  - skills: `ein-discipline`
  - why: Attribution must be proved by local structured identity and immutable bytes, not task prose or an unsupported external metadata extension.
  - learn: A receipt is trustworthy only when its identity and source bytes can be reproduced later.
  - architecture: Add `ein-pi/agent/lib/sdd-cost-provenance.ts` as the sole owner of flow/run identity, candidate snapshots, sidecar persistence, source digests, and per-field normalized metrics; do not alter `pi-subagents`.
  - avoid: Inferring identity from metadata filenames, agents, prefixes, task text, or later prose.
  - acceptance: Exact-name collisions (`foo`/`foo-bar`) and later prose mentions cannot bind a receipt; a receipt retains immutable phase/meta byte bindings and timestamps; input, output, cache-read, cache-write, provider cost, estimated cost, and duration retain independent reported/estimated/unavailable states; unqualified `usage.cost` is neither cost kind.
  - production paths: `ein-pi/agent/lib/sdd-cost-provenance.ts`
  - tests: `tests/sdd-real-cost-provenance.test.ts`
  - forecast: production +180/-0 lines; tests +230/-0 lines; docs +0/-0 lines; generated +0/-0 lines.
  - verify: `bun test tests/sdd-real-cost-provenance.test.ts`

## // 002. Fail-closed delegation observation hook

- [x] 2.1 Bind the provenance adapter to existing direct-delegation hooks while leaving the reconciliation decision path byte-for-byte behaviorally unchanged.
  - skills: `ein-discipline`
  - why: The local hook is the only owned boundary that can correlate one delegation with one changed phase artifact and one changed producer artifact.
  - learn: When an external writer has no supported identity contract, ambiguity is a result to report, not a gap to guess through.
  - architecture: Update `ein-pi/agent/extensions/ein-ai.ts` to snapshot before and observe after a uniquely resolved direct SDD phase; delegate all identity/candidate decisions to `sdd-cost-provenance.ts`, without adding `output`, `outputMode`, or identity fields to `subagent` input and without modifying `sdd-reconcile.ts`.
  - avoid: Adding a second reconciliation implementation, changing reconciliation ordering, or accepting zero/multiple/unstable phase or metadata candidates.
  - acceptance: Zero, multiple, unreadable, unstable, or ambiguous candidates write bounded excluded-problem records and no receipt; one exact candidate binds immutably; retries allocate auditable attempts without run double-counting; direct artifact persistence and all existing reconciliation outcomes remain unchanged.
  - production paths: `ein-pi/agent/extensions/ein-ai.ts`
  - tests: `tests/sdd-real-cost-provenance.test.ts`, `tests/sdd-reconcile.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`
  - forecast: production +70/-15 lines; tests +150/-10 lines; docs +0/-0 lines; generated +0/-0 lines.
  - verify: `bun test tests/sdd-real-cost-provenance.test.ts && bun test tests/sdd-reconcile.test.ts && bun test tests/sdd-phase-runtime-contract.test.ts`

## // 003. Truthful ledger reader, aggregation, and status rendering

- [x] 3.1 Read only validated local sidecars, derive reproducible deduplicated aggregates, and expose/render the compatible status ledger.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: Status must explain exactly which receipts support totals without presenting missing data or estimates as provider facts.
  - learn: Aggregate availability is all-or-nothing per metric: a partial subtotal is not a truthful total.
  - architecture: Extend `ein-pi/agent/lib/sdd-cost-provenance.ts` with one validation/deduplication pass and change/phase/attempt aggregates; make `ein-pi/agent/lib/sdd-router.ts` a compatibility facade; update `ein-pi/agent/extensions/ein-ai.ts` to retain `details.realCost`, add `details.costLedger`, and render provenance-aware text using existing localization unless a new key is demonstrably required.
  - avoid: Re-reading `_meta.json` as the ledger, treating legacy metadata as attributable, using zero for missing metrics, or exposing estimated values through `costUsd`.
  - acceptance: Duplicate/re-read sidecars count once, conflicting `runId` records are excluded, and change/phase/retry aggregates expose sorted exact member IDs; each field independently reports reported/estimated/unavailable, cache fields remain separate, provider and estimate costs remain distinct, legacy records are visibly excluded, lifecycle status fields remain compatible, and text uses truthful `n/a`/provenance language rather than “real cost.”
  - production paths: `ein-pi/agent/lib/sdd-cost-provenance.ts`, `ein-pi/agent/lib/sdd-router.ts`, `ein-pi/agent/extensions/ein-ai.ts`
  - tests: `tests/sdd-real-cost-provenance.test.ts`, `tests/sdd-status-output.test.ts`
  - forecast: production +150/-90 lines; tests +190/-35 lines; docs +0/-0 lines; generated +0/-0 lines.
  - verify: `bun test tests/sdd-real-cost-provenance.test.ts && bun test tests/sdd-status-output.test.ts`

## // 004. Synchronize the lifecycle delta without widening scope

- [x] 4.1 Refine the change-local lifecycle delta to record local ownership, fail-closed binding, legacy exclusion, aggregate availability, and compatibility guarantees already designed.
  - skills: `ein-discipline`, `cognitive-doc-design`
  - why: The canonical delta must not imply unsupported producer metadata or omit the truth-preserving failure behavior that implementation follows.
  - learn: A delta should specify observable behavior and ownership boundaries, not accidental implementation shortcuts.
  - architecture: Modify only `openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md`; preserve the frozen roadmap and do not edit `docs/sdd-cost-plan.md`, canonical lifecycle spec, or source code.
  - avoid: Adding numeric token/cost gates, redesigning reconciliation, or expanding into external package changes.
  - acceptance: The delta explicitly requires local hook-owned identity and stable exact bindings; zero/multiple/unstable candidates fail closed; unqualified `usage.cost` is neither provider nor estimate; incomplete metrics are unavailable; aggregates list deduplicated members; legacy records are excluded; status compatibility and unchanged reconciliation remain explicit.
  - production paths: none
  - tests: none (spec synchronization only)
  - forecast: production +0/-0 lines; tests +0/-0 lines; docs +0/-0 lines; generated +0/-0 lines; OpenSpec delta +14/-1 lines.
  - verify: `git diff --check -- openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md`

## // 005. Focused integrated regressions and workload gate

- [x] 5.1 Complete focused cross-boundary regressions and measure the production review slice before delivery.
  - skills: `ein-discipline`
  - why: The integration must prove provenance changes did not disturb lifecycle reconciliation or artifact-persistence contracts, and must remain reviewable.
  - learn: A ledger is only safe when its accounting evidence and unrelated lifecycle behavior are both regression-tested.
  - architecture: Add assertions only in the established focused suites; make no production, external-package, roadmap, or generated-file changes in this group.
  - avoid: Hiding an over-budget production diff in test churn, adding a numeric runtime gate, or modifying user-untracked paths.
  - acceptance: Regressions cover exact-name collision, later prose mention, immutable binding, retry/run dedupe, exact member reproduction, per-field reported/estimated/unavailable, cache separation, provider-cost distinction, legacy exclusion, ambiguous candidates, compatible status output, unchanged reconciliation, and unchanged direct phase-runtime behavior; the measured production diff is at most 400 changed lines, otherwise split before apply/delivery.
  - production paths: none
  - tests: `tests/sdd-real-cost-provenance.test.ts`, `tests/sdd-status-output.test.ts`, `tests/sdd-reconcile.test.ts`, `tests/sdd-phase-runtime-contract.test.ts`
  - forecast: production +0/-0 lines; tests +90/-0 lines; docs +0/-0 lines; generated +0/-0 lines.
  - verify: `bun test tests/sdd-real-cost-provenance.test.ts && bun test tests/sdd-status-output.test.ts && bun test tests/sdd-reconcile.test.ts && bun test tests/sdd-phase-runtime-contract.test.ts && cd installer && bun run typecheck`
  - delivery: User explicitly granted a single-PR size exception. Actual in-scope production diff is +480/-87 (567 changed lines), above the 400-line budget; do not split this delivery.
