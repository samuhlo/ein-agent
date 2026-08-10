# Scope: archive-out-of-flow-delivery

## Scope packet

scope: Add a narrowly audited deterministic close path for the legacy docs-site-shell OpenSpec record, which contains only scope.md because delivery occurred outside SDD. The path must permit archival only after a fresh delivery summary and concrete repository verification, without fabricating lifecycle artifacts, while preserving every ordinary close guard and requiring an explicit auditable signal and reason.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 150000

## Objective

Extend the SDD close/reconciliation contract so a specifically recognized declarationless legacy record can be archived through an explicit, auditable out-of-flow delivery path. The implementation target is the close/check tooling and its tests in a later phase; this scope phase does not close `docs-site-shell` or create any map, design, tasks, apply, verify, or summary artifact for that target.

## In scope

- Define the minimum reconciliation evidence/artifact or marker needed to identify an out-of-flow delivery and bind it to the named legacy change.
- Require an explicit, non-accidental signal plus a non-empty auditable reason; reject implicit inference from missing artifacts, a `--force`-style general bypass, or ordinary incomplete records.
- Require a fresh summary explicitly stating that delivery occurred outside SDD and concrete repository verification tied to the current repository state.
- Permit only the narrow legacy shape (`scope.md` plus the approved declarationless legacy state) and preserve the existing declarationless legacy escape.
- Keep normal close readiness unchanged: complete apply, fresh passing verify, fresh summary, no pending tasks, spec synchronization/conflict guards, and sequence checks remain required for ordinary changes.
- Cover allowed and denied cases, including denial for an ordinary incomplete change, missing/stale/non-concrete evidence, absent or malformed explicit signal/reason, fabricated lifecycle artifacts, and attempts to use the path for a normal SDD record.

## Out of scope

- Closing or archiving `docs-site-shell` in this change.
- Implementing the close path, changing `ein_sdd_close`/`ein_sdd_check`, or adding tests.
- Creating retrospective map/design/tasks/apply/verify artifacts for `docs-site-shell`.
- Weakening standard lifecycle guards or broadening force-close semantics.
- Reconstructing delivery claims from roadmap text alone; the roadmap is direction only.

## Acceptance criteria for downstream phases

1. A deterministic, explicitly selected reconciliation path accepts only the approved legacy record shape and all required fresh evidence.
2. The resulting summary records, in plain terms, that delivery occurred outside SDD and identifies concrete repository verification evidence.
3. Missing, stale, ambiguous, fabricated, or accidentally triggerable signals fail closed; ordinary incomplete changes still fail under normal close rules.
4. The existing declarationless legacy escape and all standard close/readiness and sequence guards remain intact.
5. The implementation has tests for both allowed and denied cases without mutating or closing `docs-site-shell` during this change.

## Repository context

- Stack: Node.js/TypeScript ESM monorepo using Bun; strict TDD is enabled in `openspec/config.yaml`.
- Test runner: `bun test`; typecheck: `cd installer && bun run typecheck`.
- Canonical product direction consulted: `docs/roadmap-features-ein.md` (SHA-256 and byte count recorded below). Superseded roadmaps were not consulted.
- Target legacy record: `openspec/changes/docs-site-shell/scope.md`, currently scope-only with `spec_delta:none`.

## Phase rules

Scope only. Do not run tests/builds, implement code, or write map/design/tasks/apply-progress/verify-report artifacts. Strict TDD is recorded as configuration, not enacted in this phase.

## Evidence budget

Planned reads: 5 of 30 maximum. Planned token budget: 15000 maximum. Runtime cap: 150000 ms. No web fetch.

## Source provenance

- `docs/roadmap-features-ein.md` — SHA-256: `279b3600e566227aa2961a09ecc6cec7bc7138499cdee0b0df0c2001d33ad818`; bytes: `28941`

## Spec delta

This change modifies observable SDD close behavior, so the behavior delta is declared in the accompanying `specs/sdd-lifecycle/spec.md`; no `spec_delta:none` block is present in this scope artifact.
