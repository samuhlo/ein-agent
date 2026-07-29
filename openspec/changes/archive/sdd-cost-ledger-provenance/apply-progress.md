status: complete

## // 001. Local provenance identity and immutable receipt sidecars

Completed task 1.1.

- Added `ein-pi/agent/lib/sdd-cost-provenance.ts` as the local owner for flow manifests, run identities and attempts, stable source bindings, immutable run sidecars, timestamps, metadata candidate snapshots, and independent normalized metric states.
- Source bindings use stable reads with byte counts, SHA-256 digests, and filesystem identity. Flow identity includes the change-directory device/inode, so a recreated same-name change cannot reuse its prior flow.
- `usage.cost` remains unavailable for both provider and estimated cost. Unsupported cache fields remain independently unavailable, while explicitly reported zero is retained.
- Added focused coverage for exact-name/prose non-attribution, immutable receipt collisions and retries, source snapshot changes, and per-field metric truth. Existing guardrail regressions remain in the focused suite.

Verification:

- `bun test tests/sdd-real-cost-provenance.test.ts` (12 pass, 0 fail)

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: none. No hook, router, status, producer-package, reconciliation, spec, or roadmap integration was changed.

Remaining tasks: 3.1, 4.1, 5.1.

## // 002. Fail-closed delegation observation hook

Completed task 2.1.

- Bound local provenance observation to the existing direct `subagent` before/after hooks. The adapter snapshots before dispatch, observes once after the result, and never mutates the subagent input.
- Extended the provenance adapter to select exact changed phase/metadata pairs, persist immutable receipts and retry attempts, and record bounded exclusions for missing, ambiguous, unreadable, or unstable sources.
- Preserved `sdd-reconcile.ts` untouched. Observation runs before the unchanged reconciliation call and does not alter its outcome.
- Added focused adapter and runtime-contract coverage, including ambiguity, immutable retry identities, no unsupported input fields, and reconciliation ordering.

Verification:

- `bun test tests/sdd-real-cost-provenance.test.ts && bun test tests/sdd-reconcile.test.ts && bun test tests/sdd-phase-runtime-contract.test.ts` (57 pass, 0 fail)

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: extended the existing provenance adapter so `ein-ai.ts` remains a hook-only edge; no router, status, spec, or reconciliation production file was changed.

Remaining tasks: 3.1, 4.1, 5.1.

## // 003. Truthful ledger reader, aggregation, and status rendering

Completed task 3.1.

- Added validated local-sidecar reading with conflict exclusion, repeat-read deduplication, sorted receipt membership, and change/phase/attempt/agent aggregates.
- Metrics remain independently reported, estimated, or unavailable; incomplete totals are `null`, cache metrics are separate, and provider cost never aliases estimates or unqualified `usage.cost`.
- Legacy producer metadata is visibly excluded without task-prose matching. The router is now a deprecated compatibility facade over the provenance ledger.
- Status retains `details.realCost`, adds `details.costLedger`, and renders ledger provenance with `n/a` rather than “real cost.”

Verification:

- `bun test tests/sdd-real-cost-provenance.test.ts && bun test tests/sdd-status-output.test.ts` (32 pass, 0 fail)
- `cd installer && bun run typecheck` (pass)
- `git diff --check -- ein-pi/agent/lib/sdd-cost-provenance.ts ein-pi/agent/lib/sdd-router.ts ein-pi/agent/extensions/ein-ai.ts tests/sdd-real-cost-provenance.test.ts tests/sdd-status-output.test.ts` (pass)

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: none. No external package, reconciliation, specification, roadmap, or numeric gate changed.

Remaining tasks: 4.1, 5.1.

## // 004. Lifecycle delta synchronization

Status: delta ready; deterministic sync pending. Task 4.1 remains unchecked by instruction.

- Refined only the change-local `sdd-lifecycle` OpenSpec delta with local hook ownership, exact stable phase/metadata bindings, fail-closed candidate handling, metric truth, deduplicated aggregate membership, legacy exclusion, status compatibility, unchanged timeout reconciliation, and no numeric gates or external package changes.
- Kept the parser-required ADDED-only operation order and removed the blank line between the scenario heading and `title:`.

Verification:

- `git diff --check -- openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md` (pass)

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: none. No canonical spec, roadmap, source code, external package, or group 005 file changed.

Remaining tasks: 4.1 (deterministic sync pending), 5.1.

## // 004. Lifecycle delta synchronization receipt

Completed task 4.1 after deterministic synchronization.

- Authoritative `sync-report.md` records `state: synchronized`, `domains: sdd-lifecycle`, `conflicts: 0`, and one added operation.
- The canonical lifecycle SHA-256 is `f895e00282b8efc1b70175b0823d451a0e496ab3ed083d21906f4cb9dd5f12b9`, matching the report's `sdd-lifecycle` result.
- No delta, canonical spec, source, or test file was edited in this confirmation step.

Verification:

- `sha256sum openspec/specs/sdd-lifecycle/spec.md` (matches sync report domain result)
- `git diff --check -- openspec/changes/sdd-cost-ledger-provenance/specs/sdd-lifecycle/spec.md` (pass)

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: none. Group 005 remains pending.

Remaining tasks: 5.1.

## // 005. Focused integrated regressions and workload gate

Completed task 5.1. Focused suites confirm collision/prose exclusion, immutable bindings, ambiguous candidates, retries and deduped member IDs, per-field provenance and cache/cost distinction, legacy exclusion, status compatibility, unchanged reconciliation, and direct phase-runtime behavior.

Verification:

- `bun test tests/sdd-real-cost-provenance.test.ts` (15 pass, 0 fail)
- `bun test tests/sdd-status-output.test.ts` (17 pass, 0 fail)
- `bun test tests/sdd-reconcile.test.ts` (17 pass, 0 fail)
- `bun test tests/sdd-phase-runtime-contract.test.ts` (26 pass, 0 fail)
- `cd installer && bun run typecheck` (pass)
- `git diff --check` on in-scope production, tests, and lifecycle spec paths (pass)

Review measurement against `main`: production +480/-87 (567 changed lines); tests +154/-55 (209); specs +19/-0 (19). The production slice exceeds 400 lines, and the user explicitly approved a single-PR size exception, so no split/block was applied.

TDD Cycle Evidence: not applicable, strict TDD is off.

Deviations: no production, test, or specification changes were needed for this regression-only group. The frozen roadmap was untouched.

Remaining tasks: none.
