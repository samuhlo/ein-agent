status: ready
scope_status: bounded
change: harden-scope-retries
phase: map

# Map — harden-scope-retries

## Scope and routing outcome

This slice has two bounded seams: make the `sdd-scope` contract resumable around an already-valid persisted delta, and add a canonical-only provenance gate at the status/router map boundary. No application runtime, OpenSpec sync semantics, legacy `.sdd` behavior, retry policy, or delivery behavior is in scope.

The existing `SddNext` vocabulary has no remediation phase. The smallest compatible fail-closed route is `scope` when `scope.md` exists, `map.md` is absent, and canonical `specState` is `unresolved` or `conflict`; the returned blocker and report reason must name the provenance state. `pending` and `synchronized` retain `map`.

## Canonical context

- `openspec/specs/sdd-lifecycle/spec.md` is the sole selected canonical reference.
- Scope packet records SHA-256 `51ee0e4de3db05d77e73dbf08a9a207f7adf5fe31e39af6b66428b144692e990` and 17,452 UTF-8 bytes.
- Existing authority is the parsed `specState` flow, not a new reconciliation state machine.

## Current flow and exact seams

### 1. Resumable `sdd-scope` contract

- **Production contract:** `ein-pi/core/agents/sdd-scope.md`, especially the mandatory “Spec delta declaration” section.
- The contract currently teaches the exactly-one-of-delta-or-`spec_delta: none` rule and exposes `ein_openspec_delta_write`, whose implementation builds deterministic bytes and re-parses them through the strict delta grammar (`ein-pi/agent/extensions/ein-ai.ts`, `buildOpenSpecDelta` in `ein-pi/agent/lib/openspec-spec-parser.ts`).
- The missing seam is ordering on retry: before declaring `none`, invoking the writer, or producing a replacement, the executor must inspect the active change’s persisted `specs/<domain>/spec.md`, reuse the existing declaration/grammar validation path, and treat a valid persisted delta’s exact bytes as authoritative. A valid persisted delta must not be rewritten, regenerated, downgraded to `none`, or contradicted by a later declaration.
- Missing or invalid persisted provenance continues through the existing validation/fallback path. Do not add reconciliation, merge, staging, rollback, or extra retry behavior.

### 2. Canonical router/status map gate

- **Production source:** `ein-pi/agent/lib/sdd-router.ts`.
- `readOpenSpecState()` already reads `readSpecDeltaDeclaration()` from `ein-pi/agent/lib/sdd-guardrails.ts`, loads canonical bases, and delegates classification to `evaluateOpenSpecState()` in `ein-pi/agent/lib/openspec-spec-sync.ts`. Reuse this result unchanged.
- `resolveSddStatus()` computes `specState` before selecting `nextRecommended`; its current phase-order branch selects `map` solely from `scope.md` present and `map.md` absent, without consulting provenance. This is the smallest gate location: after the ordinary phase candidate is known, narrow the override to canonical changes at exactly the scope→map boundary and only `unresolved|conflict`.
- Keep `legacy`/`.sdd` routing untouched. Do not gate `pending` or `synchronized`; with scope present and map absent they must remain `map`.
- `SddNext` is only `SddPhase | "done"`. Preserve that type. If the gate changes the route to `scope`, carry an explicit provenance blocker through `blocked` and make `resolveSddNext()` report the same blocker as its reason/suggested action rather than the generic “scope missing” copy. The report must never say `nextRecommended: map` for either blocked state.
- Existing close-readiness blocker codes/messages for `spec-unresolved` and `spec-conflict` are separate behavior and should not be broadened or reused as a new close gate.

## Smallest test surfaces

1. **`tests/sdd-router.test.ts` (required production regression seam).** Extend the existing OpenSpec-state fixtures and helpers (`DELTA`, `planOpenSpecSync`, `serializeSyncReport`, `serializeOpenSpec`) with four focused map-boundary cases:
   - declarationless/invalid canonical provenance yielding `unresolved`: route is not `map`, route/blocker reason names `unresolved`;
   - a valid delta plus conflicting canonical base/report yielding `conflict`: route is not `map`, route/blocker reason names `conflict`;
   - valid persisted delta without an applied report yielding `pending`: route remains `map`;
   - valid delta, successful report, and canonical result bytes matching the report yielding `synchronized`: route remains `map`.
   Assert both `resolveSddStatus().nextRecommended`/`blocked` and the `resolveSddNext()` report where needed, so a formatter or generic reason cannot hide the blocker.

2. **`tests/sdd-next-dispatcher.test.ts` (focused visibility regression).** Add one report-level assertion using the smallest unresolved or conflict fixture: `nextRecommended` is the non-map remediation route and the rendered/report reason includes the provenance blocker. Keep the existing dry-run and command-wiring tests unchanged.

3. **`tests/sdd-flow-contract.test.ts` (scope contract regression).** Keep the existing delta/`none` declaration assertions, and add a static ordering/contract assertion for `sdd-scope.md`: a valid persisted delta is checked and preserved before the `spec_delta: none` fallback, with no replacement/regeneration on retry. This is the appropriate contract seam because the phase is an agent prompt, not a runtime function.

No new parser, sync, guardrail, extension, or test helper is needed unless design discovers that the existing fixtures cannot express the four already-supported `specState` values.

## Data flow and invariants

- Persisted delta bytes → existing declaration parser/validation → `readOpenSpecState()` → `specState` → map-boundary gate → `SddChangeStatus` → `resolveSddNext()` report.
- The scope retry contract must preserve byte identity for a valid delta; the deterministic writer remains the creation path for structured new deltas only.
- `unresolved` and `conflict` are fail-closed before map; `pending` means eligible but not synchronized; `synchronized` is eligible. Only canonical changes receive this gate.
- The gate must be applied only when `scope.md` exists and `map.md` is missing. Later phases, missing scope, existing map, and legacy `.sdd` routing retain current behavior.
- Assert blocker/reason text, not only route values, to prevent silent diagnostic loss.

## Explicit non-goals and exclusions

- Do not read or modify `openspec/changes/optimize-tdd-verify/` or `docs/roadmap-codegraph-tdd-launcher.md`.
- Do not modify canonical synchronization/evaluation, delta grammar, close readiness, or `readSpecDeltaDeclaration`/`evaluateOpenSpecState` semantics.
- Do not introduce transactions, staging, rollback, generic reconciliation, additional retries/timeouts, model changes, or delivery changes.
- Do not alter legacy `.sdd` lifecycle behavior.
- Map phase did not run tests, builds, or typechecks.

## Handoff to design

Design the smallest contract wording change in `sdd-scope.md`, then the canonical scope→map provenance override in `sdd-router.ts`, preserving the existing `SddNext` type and surfacing an explicit reason. Use the existing router/OpenSpec fixtures for the four state cases and keep strict-TDD execution for apply/verify.

ledger:
  reads:
    - { path: "openspec/changes/harden-scope-retries/scope.md", lines: "1-end", estimated_tokens: 1150 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: "1-end", estimated_tokens: 2600 }
    - { path: "ein-pi/core/agents/sdd-scope.md", lines: "1-81", estimated_tokens: 1200 }
    - { path: "ein-pi/agent/lib/sdd-router.ts", lines: "21-690", estimated_tokens: 3000 }
    - { path: "ein-pi/agent/lib/sdd-guardrails.ts", lines: "425-445", estimated_tokens: 220 }
    - { path: "ein-pi/agent/lib/openspec-spec-sync.ts", lines: "134-180", estimated_tokens: 650 }
    - { path: "ein-pi/agent/lib/openspec-spec-parser.ts", lines: "172-181", estimated_tokens: 140 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: "1289-1343", estimated_tokens: 600 }
    - { path: "tests/sdd-router.test.ts", lines: "1-390", estimated_tokens: 2700 }
    - { path: "tests/sdd-next-dispatcher.test.ts", lines: "1-120", estimated_tokens: 850 }
    - { path: "tests/sdd-flow-contract.test.ts", lines: "160-220", estimated_tokens: 550 }
    - { path: "tests/sdd-scope-packet.test.ts", lines: "1-125", estimated_tokens: 1200 }
  webfetch_used: false
  webfetch_urls: []
  budget_source: scope.md
  budget_allocated: { max_tokens: 15000, max_reads: 30 }
  budget_consumed: { tokens: 14860, reads: 12 }
