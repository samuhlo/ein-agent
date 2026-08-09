# Scope — cleaner-bounded-mutations

## SCOPE PACKET

```yaml
scope: Enable cleaner mutations only as bounded, reviewable SDD slices: select one finding from the completed cleaner read-only audit, delimit ownership and behavioral boundaries, apply only under explicit preconditions, invalidate stale evidence after code state changes, and require fresh verification. Excludes autonomous cleaner behavior, architect mutations, parallel writers, and bulk undecomposed changes.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Outcome

Deliver one bounded I-slice contract for converting exactly one finding from H into an attributable cleaner mutation. The slice must declare ownership, behavioral limits, preconditions, stale-evidence handling, and fresh verification; ambiguity or scope escape is fail-closed.

## Evidence and dependencies

- Canonical roadmap: `docs/roadmap-features-ein.md`, section I, defines I's objective, scope, exclusions, dependencies H/G/B, acceptance, and risk.
- Archived H evidence: `openspec/changes/archive/cleaner-read-only-audit/scope.md` establishes read-only findings, traceability, explicit uncertainty, fail-closed stale/invalid evidence, and zero applied changes.
- Archived G evidence: `openspec/changes/archive/reviewed-area-ledger/scope.md` establishes bounded area identity, privacy-safe evidence, exact Git freshness, and reviewed/unreviewed/stale/invalid/unavailable/unknown states.
- Archived B evidence: `openspec/changes/archive/shared-project-state-contract/scope.md` establishes authoritative source ownership, exact project/Git state, and verification freshness bound to the exact observed state.
- Dependencies are treated as prerequisites, not redesigned here: H supplies the selected finding; G supplies area/evidence freshness; B supplies authoritative project/Git state.

## In scope

- Select exactly one completed H finding per cleaner mutation slice.
- Require an explicit SDD slice identity, bounded ownership area, affected paths/seams, behavioral boundary, preconditions, and attributable actor/review evidence.
- Refuse to mutate when the finding is stale, ambiguous, unavailable, outside ownership, behaviorally non-mechanical, or when any precondition is unmet.
- Apply only the selected bounded change; no implicit neighboring cleanup or bulk expansion.
- Invalidate prior audit and verification evidence when the relevant code state changes, retaining observed and resulting state identities.
- Require fresh verification against the resulting exact state before the slice is complete or represented as current.
- Preserve human review and SDD lifecycle ownership; report uncertainty and incomplete evidence visibly.

## Explicit non-goals

- No autonomous cleaner or unattended mutation loop.
- No architect mutations or structural refactoring behavior.
- No parallel writers, shared working-tree concurrency, conflict resolution, or worktree orchestration.
- No bulk, repository-wide, or undecomposed cleaner changes.
- No redesign of B, G, or H contracts; no new competing evidence, ledger, or project-state authority.
- No mutation based solely on session existence, automation success, or stale audit output.
- No test/build/typecheck execution or implementation in scope phase.

## Acceptance criteria for later phases

1. A mutation cannot begin without one identifiable H finding, bounded ownership, explicit behavioral limits, and all declared preconditions passing.
2. A stale, invalid, unavailable, ambiguous, or out-of-bound finding fails closed and is not treated as permission to write.
3. The resulting change is limited to the selected slice; autonomous, architect, parallel, and bulk behavior is impossible through this boundary.
4. Any relevant code-state change invalidates prior evidence, and the invalidation records the prior and observed state identities.
5. Completion requires fresh, attributable verification of the exact resulting state; resuming a session does not refresh evidence.
6. Focused strict-TDD tests later cover precondition rejection, ownership/behavior boundaries, single-finding enforcement, state invalidation, fresh verification, and excluded mutation modes.

## Project and SDD configuration

- Stack: Node.js/TypeScript ESM; Bun package manager; GitHub Actions markers.
- `strict_tdd: true` is preserved from `openspec/config.yaml`.
- Configured typecheck: `cd installer && bun run typecheck`.
- Test runner and test commands remain blank/unreliably detected in config; no test command was run in scope.
- Artifact store: canonical OpenSpec under `openspec/changes/`.
- Execution mode: auto; webfetch: false.

## Canonical context resolution

No exact canonical domain hint or canonical `openspec/specs/<domain>/spec.md` path was supplied. To honor the phase limit and avoid guessing a domain, no canonical spec file was selected or read; therefore no path/hash/byte claim is made. The roadmap and archived dependency scopes above are repository-local evidence. The behavior declaration is the validated structured delta at `openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md`; this scope intentionally contains no `spec_delta: none` block.

## Phase boundary and risks

This artifact scopes I only. Map/design must choose the smallest existing cleaner and evidence seams, preserve H/G/B authority, and keep the change review-sized. Main risks are treating an audit suggestion as permission, under-defining ownership, and allowing stale evidence to survive a mutation.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Concrete scope findings identify roadmap and dependency evidence at docs/roadmap-features-ein.md and archived H/G/B scope artifacts; risks and exclusions are explicit."
    }
  ],
  "changedFiles": [
    "openspec/changes/cleaner-bounded-mutations/scope.md",
    "openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Scope packet records bounded I ownership, preconditions, evidence invalidation, and fresh verification requirements."
  ],
  "residualRisks": [
    "Exact implementation seams and precondition encoding remain for map/design.",
    "No canonical domain file was selected because no exact domain hint was supplied."
  ],
  "noStagedFiles": true,
  "diffSummary": "Added the I scope artifact and one validated sdd-lifecycle behavior delta; no product implementation or tests changed.",
  "reviewFindings": [
    "no blockers; scope findings are documented with file paths and dependency boundaries"
  ],
  "manualNotes": "Scope phase only; tests, build, typecheck, and implementation were not run."
}
```
