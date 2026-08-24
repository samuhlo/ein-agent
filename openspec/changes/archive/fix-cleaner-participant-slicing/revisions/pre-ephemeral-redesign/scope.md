# Scope: fix-cleaner-participant-slicing

**Change:** `fix-cleaner-participant-slicing`  
**Phase:** scope  
**Lane:** bounded standard SDD  
**TDD:** strict (configured default; phase records configuration only)  
**Artifact language:** English

## Problem statement

The SDD participant passage currently treats Cleaner work as one undifferentiated handoff. A large complete changed-file scope can exceed existing Cleaner file/source-byte limits, while partial progress can incorrectly permit Architect or leave a blocked passage unrecoverable. The change must make Cleaner slicing deterministic and fail closed without weakening any existing limit, participant, or verification gate.

## In scope

- Deterministically partition the complete changed-file scope into ordered Cleaner audit slices.
- Enforce the existing Cleaner file-count and source-byte limits independently for every slice.
- Preserve every changed file; do not filter files, raise limits, disable participants, or bypass verify.
- Track completion for every slice and keep the passage blocked on any blocked, failed, missing, or stale slice.
- Admit Architect only after all Cleaner slices complete, with a fresh post-Cleaner Architect binding/state identity.
- Reinitialize an already-blocked passage only when the corrected planner identity or apply identity changes; unchanged identities remain fail-closed.
- Bound implementation to `ein-pi/agent/lib/sdd-participants.ts` and directly necessary continuity code, plus focused tests mirroring the touched modules. Exact file selection belongs to map/design.

## Out of scope

- Any change to canonical `sdd-lifecycle` context or loading `openspec/specs/sdd-lifecycle/spec.md`.
- Raising Cleaner request/result/file/source-byte limits or changing Cleaner mutation semantics.
- Filtering changed files, silently dropping oversized files, disabling Cleaner/Architect, or allowing verify to bypass participant completion.
- General continuity redesign, unrelated participant registration fixes, or broad router/installer changes.
- Implementation, test execution, build, or typecheck in this scope phase.

## Acceptance criteria

1. The complete changed-file scope is represented exactly once across deterministic Cleaner slices.
2. Each slice respects the pre-existing Cleaner file and source-byte limits; an individual impossible-to-fit file blocks rather than being filtered or silently accepted.
3. Slice ordering and identities are deterministic for the same planner/apply inputs.
4. Architect admission is unavailable until every Cleaner slice is complete; any blocked or stale slice keeps the passage blocked.
5. Architect binding uses a fresh identity observed after the final Cleaner slice, and stale calls are rejected.
6. A blocked passage remains blocked when planner/apply identities are unchanged and is safely reinitialized only after a corrected planner/apply identity change.
7. Existing verify gating remains intact and no participant is bypassed.

## Focused evidence surface

- Primary production seam: `ein-pi/agent/lib/sdd-participants.ts`.
- Continuity seam only if required for persisted blocked-passage identity/reinitialization: `ein-pi/agent/lib/continuity-checkpoint*.ts` and the directly relevant continuity lifecycle module.
- Focused contracts: `tests/sdd-participants.test.ts` and only directly necessary continuity tests.
- No suite, build, or typecheck was run; those belong to apply/verify.

## Project configuration

- Stack: Node.js/TypeScript ESM; Bun package manager/runtime.
- Test runner: `bun test`; unit/integration/e2e tests live under `tests/`.
- Typechecks: root `bun run typecheck` and `cd installer && bun run typecheck` (CI runs both).
- Strict TDD: `true` in `openspec/config.yaml`; this phase records it and does not execute tests.
- Existing config was preserved; no destructive rewrite was needed.

## Canonical spec context

`canonical_spec_domains: []` was supplied. No canonical spec files were selected, read, hashed, or referenced. The requested behavior delta is declared in the new bounded domain `sdd-participant-routing`; therefore this scope intentionally contains no `spec_delta: none` declaration block.

## SCOPE PACKET

scope: Deterministically split an SDD change's complete changed-file scope into Cleaner audit slices that each respect existing Cleaner file/source-byte limits; require every slice complete before Architect; fail closed on any blocked slice; retain fresh post-Cleaner Architect binding; and safely reinitialize an already-blocked passage only when corrected planner/apply identity changes. Never filter changed files, raise Cleaner limits, disable participants, or bypass verify.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000
