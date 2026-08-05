# Scope — harden-scope-retries

## SCOPE PACKET

```yaml
scope: Harden resumable sdd-scope retries so valid persisted OpenSpec deltas remain authoritative, and prevent deterministic SDD routing from recommending map while specState is unresolved or conflicting; preserve pending/synchronized continuation and add focused strict-TDD regressions.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Goal

Make a retry of `sdd-scope` resumable instead of destructive: an already-valid persisted OpenSpec delta remains the source of truth and is not contradicted by a later declaration. Make the deterministic router fail closed before `map` for canonical `unresolved` or `conflict` provenance while leaving `pending` and `synchronized` states eligible to continue.

## Canonical context

- Domain: `sdd-lifecycle`.
- Path: `openspec/specs/sdd-lifecycle/spec.md`.
- SHA-256: `51ee0e4de3db05d77e73dbf08a9a207f7adf5fe31e39af6b66428b144692e990`.
- UTF-8 byte count: `17452`.
- Selection total: 1 file and 17452 bytes, within the shared limit of 3 files and 32768 bytes.
- Relevant existing authority: canonical OpenSpec evidence is represented by `specState`; delta syntax is already validated by `readSpecDeltaDeclaration` and the deterministic delta writer.

## Existing SDD and testing configuration

- `openspec/config.yaml` already exists and is preserved; it sets `strict_tdd: true`.
- Project context: Node.js/TypeScript ESM with Bun as the package manager; the repository test files use `bun:test`.
- `bunfig.toml` configures the root Bun test preload at `./tests/preload-env.ts`.
- The existing config has blank testing runner/layer command fields despite the Bun evidence; later phases should use the focused Bun tests and record the actual command rather than rewriting user-maintained config here.
- Existing derived typecheck command is `cd installer && bun run typecheck`.
- Scope does not run tests, builds, or typechecks; strict TDD is recorded for apply/verify only.

## In scope

1. **Resumable scope contract.** Update the `sdd-scope` phase contract so a retry first respects a valid persisted delta for the active canonical change. It must not introduce `spec_delta: none`, replace, or regenerate a valid delta with contradictory content. Missing or invalid provenance may still be handled through the existing validation path; this slice does not invent a reconciliation mechanism.
2. **Router consistency.** Reuse the status already returned as `specState` and the existing delta validation/evaluation. Before selecting `map` for a canonical change with `scope.md` but no `map.md`, treat `unresolved` and `conflict` as blockers and select a non-`map` remediation route consistent with the existing phase vocabulary. Keep `pending` and `synchronized` eligible for `map` when no earlier gate blocks; preserve legacy `.sdd` routing.
3. **Focused regression coverage.** Add strict-TDD tests for: a scope retry with a valid persisted delta preserving that delta; router rejection of `map` for unresolved provenance; router rejection of `map` for conflict; and continued `map` eligibility for pending and synchronized provenance. Assert the blocker/reason so the deterministic contract cannot silently regress.

## Expected implementation surface

- `ein-pi/core/agents/sdd-scope.md` — resumable retry and persisted-delta contract.
- `ein-pi/agent/lib/sdd-router.ts` — pre-map provenance gate using existing `specState`.
- Focused contracts/router tests, primarily `tests/sdd-router.test.ts`, `tests/sdd-next-dispatcher.test.ts`, and the appropriate `sdd-scope` contract test.
- `ein-pi/agent/lib/sdd-guardrails.ts` and `ein-pi/agent/lib/openspec-spec-sync.ts` are existing validation/state authorities to reuse, not a target for new reconciliation logic unless mapping finds a strictly necessary test seam.

## Acceptance criteria

- A valid persisted OpenSpec delta survives a future `sdd-scope` retry byte-for-byte and remains authoritative; the retry cannot add a contradictory declaration or delta.
- For an active canonical change whose next missing phase is `map`, `specState: unresolved` and `specState: conflict` produce a deterministic blocker and never return `nextRecommended: map`.
- `specState: pending` and `specState: synchronized` retain the existing ability to return `nextRecommended: map` when scope exists and no earlier gate blocks.
- Regression tests cover both blocked states and both eligible states, plus the persisted-delta retry contract, under the repository’s Bun test conventions.
- No transaction, staging, rollback, generic reconciliation subsystem, retry/timeout/model change, or delivery behavior change is introduced.
- `openspec/changes/optimize-tdd-verify/` and `docs/roadmap-codegraph-tdd-launcher.md` remain untouched.

## Non-goals

- Repairing or reading implementation guidance from `openspec/changes/optimize-tdd-verify`.
- Changing canonical OpenSpec synchronization semantics, close readiness, or the existing delta grammar.
- Introducing transactions, staging, rollback, generic reconciliation, extra retries, timeout increases, model changes, or delivery changes.
- Broad SDD router redesign or changing legacy `.sdd` lifecycle behavior.
- Running tests, implementing runtime changes, or creating `apply-progress*` or `verify-report*` artifacts during scope.

## Constraints and invariants

- OpenSpec is the canonical SDD record; the new delta under `openspec/changes/harden-scope-retries/specs/sdd-lifecycle/spec.md` is the behavior declaration for this change, so `scope.md` intentionally contains no `spec_delta: none` block.
- Existing valid persisted deltas are authoritative on retry; a retry must not downgrade them to declarationless state.
- `pending` means provenance is not yet synchronized but remains eligible to continue; `synchronized` is eligible to continue. `unresolved` and `conflict` are fail-closed before `map`.
- Scope remains read/scout-only for source behavior: no code or tests are changed in this phase.
- The canonical reference above is the only selected domain context; no `.sdd` spec or unlisted canonical domain may be read for this slice.

## Risks

- Selecting `scope` as the non-`map` remediation route could make the phase label look repetitive; the reason/blocker must clearly identify unresolved or conflicting provenance.
- A test that only checks `nextRecommended` could miss a silently omitted blocker; assert both route and diagnostic reason.
- Reusing `specState` without preserving legacy routing could block older `.sdd` changes; keep the gate canonical-only.

## Phase handoff

Map the smallest seams for the scope retry contract and router pre-map gate. Confirm the exact non-`map` remediation representation available in the current `SddNext` vocabulary, then produce a design that preserves valid delta bytes, reuses `readSpecDeltaDeclaration`/`evaluateOpenSpecState`, and covers unresolved, conflict, pending, and synchronized states without touching the excluded change or roadmap document.
