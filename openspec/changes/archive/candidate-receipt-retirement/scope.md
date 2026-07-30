# Scope — candidate-receipt-retirement

## SCOPE PACKET

```yaml
scope: Define the smallest deterministic lifecycle for retiring a consumed candidate receipt only after proving that its validated delivery head completed the intended delivery boundary. Preserve the original receipt byte-for-byte in an archive, keep unverifiable states fail-closed, and allow later overlapping delivery only after retirement succeeds.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Goal

Prevent a successfully delivered candidate receipt from indefinitely blocking later delivery whose manifest overlaps old paths, without turning retirement into a bypass. A receipt remains active until deterministic delivery evidence proves it consumable; retirement then archives the exact evidence before removing it from the active gate.

## Canonical context

- Domain: `sdd-lifecycle`.
- Path: `openspec/specs/sdd-lifecycle/spec.md`.
- SHA-256: `37fc78cb36febb4ded7cee8e94a56868d0607f632a00775248defbdb55c34c08`.
- UTF-8 byte count: `9987`.
- Selection total: 1 file and 9987 bytes, within the shared limit of 3 files and 32768 bytes.

The existing domain is authoritative for candidate-receipt identity, four delivery boundaries, fail-closed divergence, mechanical declarations, PR-head matching, and separation of user intent from content authorization.

## In scope

1. Define an **active receipt** as the unique live candidate receipt whose validated delivery has not been deterministically proven to have completed its intended boundary and whose evidence must therefore continue to participate in delivery gating.
2. Define a **consumable receipt** using deterministic evidence that binds the receipt's validated delivery head to the completed intended boundary. Design must choose the narrow supported evidence source and operation; it may not infer completion from age, branch naming, user prose, local `HEAD` movement, or keyword matching.
3. Define a **retired receipt** as byte-for-byte archived evidence that no longer acts as the active content gate only after all retirement preconditions and archive publication complete successfully.
4. Select the smallest safe trigger surface during design: either an explicit deterministic retirement operation or an automatic pre-delivery state transition backed by equivalent deterministic evidence. Convenience alone is not sufficient grounds for automation.
5. Make retirement atomic or safely ordered so a later delivery cannot proceed while evidence is only partially archived or active-state removal is incomplete.
6. Preserve the original receipt bytes exactly in a durable retired archive. Historical receipts are never silently deleted, rewritten, or replaced with a summary.
7. Keep failed, divergent, corrupt, incomplete, missing-attempt-state, and remotely unobserved or unmerged receipts active and fail-closed. None may fall back to `mechanical-unverified`.
8. Make repeated retirement of the same already archived receipt deterministic and idempotent without weakening identity checks or overwriting conflicting archive evidence.
9. Permit a subsequent delivery, including one with an overlapping path manifest, only after safe retirement has completed and the active receipt no longer applies.
10. Add focused Bun coverage for active, safely retired, already-retired/idempotent, missing attempt state, unmerged or unobserved remote state, corrupt evidence, archive conflict/failure, and overlapping-manifest behavior; retain the existing full suite for verify.

## Acceptance criteria

- An active receipt continues to enforce existing verified-delivery identity gates.
- Retirement succeeds only when deterministic evidence proves that the exact validated delivery head completed the explicitly supported delivery boundary.
- A successful retirement preserves the source receipt byte-for-byte in the retired archive before subsequent delivery can ignore it.
- Repeating retirement against the same valid archived evidence is a no-op success or equivalent idempotent result; mismatched archive contents fail closed.
- Missing attempt state, absent or unobserved remote evidence, an unmerged delivery head, corrupt evidence, divergent identities, and archive publication failure all block retirement and later overlapping delivery.
- No blocked retirement is reclassified as trivial or mechanical delivery, and no verification claim is fabricated.
- After safe retirement, a later mechanical or verified delivery that overlaps the old manifest is evaluated under its own unchanged declaration, grant, and identity gates rather than the retired receipt.
- Existing user-intent grant semantics and commit, push, and PR identity checks remain behaviorally unchanged.
- Focused Bun tests cover every required state, and the established full suite remains the final verification gate in later phases.

## Non-goals

- Exact modeling of every Git refspec, merge strategy, or remote publication target.
- Force-push support.
- Weakening receipt divergence, freshness, repository, worktree, tree, manifest, or delivery-head checks.
- Deleting historical receipts or replacing original evidence with derived metadata.
- Broad redesign of delivery architecture, grants, candidate receipt emission, or the four existing identity gates.
- Automatic retirement based on age, branch names, local movement, user assertions, or keyword matching.
- Running tests, implementing runtime changes, or creating apply/verify artifacts during scope.

## Constraints and invariants

- Retirement is a lifecycle transition supported by evidence, not an escape hatch from candidate-content authorization.
- User intent continues to authorize the requested action; receipt evidence continues to authorize verified content. Retirement changes neither grant semantics nor action identity.
- Any uncertainty in receipt identity, intended boundary, completion evidence, archive integrity, or state transition blocks retirement.
- The archived payload must preserve the active receipt byte-for-byte; any retirement metadata must remain separate from or demonstrably non-mutating to that payload.
- A new delivery cannot race ahead of retirement completion. Map/design must identify the ordering or atomic publication seam that enforces this.
- `strict_tdd` is `false` in `openspec/config.yaml`; the requested focused Bun tests are still mandatory implementation and verification evidence, but no tests run in scope.
- OpenSpec is the canonical SDD record; Engram is unavailable for this session.

## Expected impact and review forecast

Map should inspect only the candidate-receipt persistence and validation seam, delivery-attempt/completion evidence, pre-delivery gate, explicit tool surface, archive conventions, and focused Bun tests. The change is one bounded lifecycle slice and should target the 400-production-line review budget; if mapping forecasts a larger production diff, design must split implementation rather than broaden this scope.

## Risks

- Treating push publication as equivalent to merged PR completion could retire evidence before the intended boundary is complete.
- Depending on mutable remote names without binding them to the validated head could accept unrelated delivery state.
- Removing the active receipt before durable archival could lose evidence or permit a race.
- Idempotency could hide archive corruption unless archived bytes and identity are checked exactly.
- An automatic pre-delivery transition could become an implicit bypass if its evidence and failure behavior are less strict than an explicit operation.

## Phase handoff

Map the concrete evidence already recorded for delivery attempts and the seams that can deterministically observe boundary completion. Design must explicitly decide the trigger surface and supported completion proof before tasks are written; it must not assume automatic retirement or keyword-based intent.
