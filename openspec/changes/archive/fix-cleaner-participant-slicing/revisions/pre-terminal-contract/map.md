status: mapped
scope_status: bounded
change: fix-cleaner-participant-slicing
phase: map

# Map notes

## Scope and routing

The requested slice is bounded to the SDD participant planner/checkpoint path, existing Cleaner audit limits/contracts, the participant delegation adapter only where required, and focused participant tests. No implementation, tests, build, or typecheck was run. The new domain delta is `sdd-participant-routing`; canonical spec domains are empty.

## Primary seam: `ein-pi/agent/lib/sdd-participants.ts`

- `changedScope()` parses `apply-progress.md`, validates every declared path, sorts paths, reads each file, and creates the `sdd-scope-v1` seal plus apply identity. This is the complete changed-file source of truth and currently presents one `scope` array to every participant.
- `passage()` loads the SDD continuity checkpoint, compares durable `applyId`, `scopeId`, and the latest observed state to the current scope, and recreates durable participant state when those identities differ. Its durable model currently has one Cleaner evidence slot and one Architect evidence slot.
- `participantId()` intentionally excludes participant order; it hashes change/apply/scope/before-state identity. Any slice representation must preserve deterministic identity semantics and avoid treating a participant disablement as a source-generation change.
- `task()` emits exact file selectors and the current passage state marker. Cleaner currently receives the whole changed scope; Architect receives the same path scope with `stateRef` derived from Cleaner `afterStateRef` when present.
- `planSddParticipants()` finds the first blocked or incomplete participant in durable order and gates Architect only through that order. It has no slice-level completion accounting, so missing/stale/blocked Cleaner slices are not representable today.
- `admitSddParticipantCall()` re-plans, checks expected agent, then recomputes the current source seal against the task marker. This is the admission seam for per-slice identity/staleness checks.
- `completeSddParticipantCall()` recognizes one terminal status, recomputes observed scope state, and persists one Cleaner or Architect evidence record through optimistic checkpoint publication. Cleaner completion records `afterStateRef`; Architect requires observed state equal to the passage state.
- `guardSddVerify()` delegates entirely to planning; preserving its fail-closed behavior requires planner completion to remain the sole admission condition.

## Checkpoint / continuity seam

`ein-pi/agent/lib/continuity-checkpoint.ts` is directly necessary if slice progress and corrected planner/apply reinitialization are persisted. `SddParticipantsCheckpoint` currently stores `change`, `applyId`, `scopeId`, `beforeStateRef`, durable order, and nullable single `cleaner`/`architect` evidence. `validParticipants()` enforces exact keys, allowed order, evidence status/seals, Cleaner-before-Architect state relationships, and checkpoint serialization limits. `withSddParticipants()` versions and republishes this structure through the existing checkpoint revision contract.

`ein-pi/agent/lib/continuity-checkpoint-store.ts` supplies the revision-conditional write and conflict retry boundary used by the participant planner/completer. No broader continuity lifecycle module is implicated by the scope; do not alter canonical lifecycle context.

The blocked-passage recovery seam is `passage()`'s identity comparison and durable checkpoint replacement. Current behavior reinitializes whenever durable identity/state differs; the requested delta specifically requires unchanged planner/apply identities to remain blocked and corrected identity changes to create a fresh deterministic passage. Map/design must distinguish planner identity from apply/source identity rather than relying only on current source seal.

## Cleaner audit limits/contracts

`ein-pi/agent/lib/cleaner-audit-evidence.ts` defines the existing limits:

- `MAX_FILES = 32`
- `MAX_SOURCE_BYTES = 128 * 1024`

`collectCleanerAuditEvidence()` canonicalizes selectors, resolves exact files, sorts paths, measures UTF-8 bytes, and rejects a scope over either limit (`scope-exceeds-32-source-files`, `scope-exceeds-128-kib-source`). It also rejects empty/unsupported scopes and malformed or unsafe selectors. These limits and rejection semantics are contracts to consume per slice, not change. A single file above the source-byte limit must remain a blocking condition rather than being dropped.

Related audit evidence fields expose `repository.scopedFiles`, `repository.sourceBytes`, per-file bytes/digests, and source identity. The implementation seam should preserve these facts and the no-source-writes constraint while passing exact slice selectors to Cleaner.

`cleaner-read-only-audit.ts` supplies report/finding contracts but is not in the requested implementation scope unless a type-level dependency makes it unavoidable. `cleaner-bounded-mutations.ts` owns mutation safety and is not a slicing seam; do not weaken its contracts.

## Participant tool adapter

`ein-pi/agent/extensions/ein-ai.ts` is a caller/adapter of planning, admission, completion, verify guard, and session cleanup. The relevant runtime safety helper is `ensureParticipantForeground()` in `sdd-preflight.ts`, which forces participant delegation to foreground execution; `participantResultIsUnrecognized()` and `sddParticipantCallsAreTracked()` protect terminal-result tracking. These are existing adapter contracts. Only update adapter wiring if the new per-slice task/result shape cannot be handled by the existing marker and terminal-result flow; no adapter behavior change is otherwise indicated by the map.

## Focused tests

Primary contract file: `tests/sdd-participants.test.ts`. Existing coverage includes exact participant ordering, blocked Cleaner/Architect verify gating, fresh post-Cleaner Architect state and stale handoff rejection, passage reuse and mutation generations, changed-file validation/sealing, restart hydration, failed/ambiguous result handling, foreground enforcement, and tracked-result recognition. It is the focused location for deterministic slice partitioning, exact once-only scope coverage, file/source-byte boundary cases, impossible oversized-file blocking, slice ordering/identity, missing or stale slice gating, fresh Architect binding after the final slice, and unchanged-vs-changed blocked-passage recovery.

Only directly necessary continuity tests should be added if checkpoint parsing/validation or persisted slice evidence is changed. Existing continuity tests are broad consumers but are not part of this map's focused test surface absent a checkpoint contract change.

## Dependency and blast-radius notes

- `planSddParticipants()` has callers in `sdd-participants.ts` and `ein-ai.ts`; focused tests cover it.
- `withSddParticipants()` and `SddParticipantsCheckpoint` have continuity consumers and currently lack dedicated participant-checkpoint tests; changing their shape requires validation tests.
- Cleaner evidence is consumed by operational/improve/audit paths and has its own focused tests; preserve the existing evidence contract and limits.
- Verify gating remains through `guardSddVerify()`; no bypass or lifecycle-router change is in scope.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/fix-cleaner-participant-slicing/scope.md", lines: 70, estimated_tokens: 1100 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/preflight.json", lines: 4, estimated_tokens: 80 }
    - { path: "openspec/changes/fix-cleaner-participant-slicing/specs/sdd-participant-routing/spec.md", lines: 35, estimated_tokens: 550 }
    - { path: "ein-pi/agent/lib/sdd-participants.ts", lines: 241, estimated_tokens: 2100 }
    - { path: "ein-pi/agent/lib/continuity-checkpoint.ts", lines: 301, estimated_tokens: 1700 }
    - { path: "ein-pi/agent/lib/continuity-checkpoint-store.ts", lines: 180, estimated_tokens: 500 }
    - { path: "ein-pi/agent/lib/cleaner-audit-evidence.ts", lines: 143, estimated_tokens: 1000 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: 470, estimated_tokens: 450 }
    - { path: "tests/sdd-participants.test.ts", lines: 420, estimated_tokens: 3000 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 0, estimated_tokens: 250, note: "codegraph caller map; source not required for current map" }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 10730, reads: 10 }
  budget_source: scope.md
  budget_exceeded: false

## Next phase

Proceed to `sdd-design` to choose the smallest durable representation for ordered Cleaner slices and the planner/apply identity needed for fail-closed recovery.
