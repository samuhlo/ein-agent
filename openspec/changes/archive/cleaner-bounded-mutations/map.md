status: partial
scope_status: bounded
change: cleaner-bounded-mutations
phase: map

# Map — cleaner-bounded-mutations

## Scope and routing

This slice enables exactly one reviewed H finding to cross from read-only evidence into a bounded cleaner mutation. The implementation boundary must be an explicit SDD slice with one finding, one ownership area, declared affected seams/paths, behavioral limits, preconditions, actor/review attribution, evidence state identities, and fresh verification. It must fail closed for stale, invalid, unavailable, ambiguous, non-mechanical, out-of-ownership, or otherwise unmet inputs. Autonomous cleaner loops, architect mutation, parallel writers, and bulk cleanup remain outside this slice.

The delta at `specs/sdd-lifecycle/spec.md` adds three behaviors: one reviewed finding may be applied only as a bounded slice; prior evidence becomes stale/invalid after relevant code-state change; completion requires fresh verification of the exact resulting state. No canonical `openspec/specs/<domain>/spec.md` was selected by scope, so this map relies on the validated delta, roadmap, and archived dependency scopes.

## Existing source seams and ownership

### H finding producer / read-only boundary

- `ein-pi/agent/lib/cleaner-read-only-audit.ts`
  - `auditCleanerReadOnly(input)` is the current H output seam.
  - It consumes `ProjectStateV1` (B) plus read-only `CleanerReadOnlyAssessment[]` (G evaluation/evidence).
  - It emits immutable `CleanerAuditReportV1` with `mode: "read-only"`, deterministic `CleanerFindingV1` IDs, area selectors, B state trace, G trace, opaque evidence reference/digest, `applied: false`, and `appliedChanges: 0`.
  - Current implementation deliberately has no apply/write/mutate operation and strips reviewer references. This is the input boundary, not an implementation seam to widen with an autonomous loop.
  - Findings are sorted by canonical area/rule/selectors/id. A later mutation seam must select one finding explicitly; it must not iterate the report as a bulk operation.
- `tests/cleaner-read-only-audit.test.ts`
  - Existing contract coverage proves deterministic ordering/identity, immutable report, privacy-safe trace, stale/invalid/unavailable/unknown evidence remaining unresolved, and mutation intent not being callable or propagated.
  - Later I tests should extend this seam with selection cardinality, ownership/behavior preconditions, state invalidation, and fresh verification; do not convert this audit test into an apply test without preserving H's read-only assertions.

### B authoritative project/Git state

- `ein-pi/agent/lib/project-state.ts`
  - `projectProjectState({ cwd, selectedChange, runtime })` is the authoritative read projection used by downstream consumers.
  - `ProjectStateV1.git.stateRef` is the exact `git-v1:sha256:<64 hex>` identity; Git state includes HEAD/branch, bounded repository-relative changes, index/worktree status, and `complete`/quality fail-closed states.
  - `ProjectVerificationState` distinguishes current, stale, unbound, unavailable, and invalid freshness and carries `currentStateRef` plus `observedStateRef`. Legacy reports without an exact binding are unbound, not current.
  - `projectGitStateForReviewedArea` / `reviewedAreaGitInput` deliberately expose only the B-owned current state to G; it excludes current changes, so it is not sufficient alone to prove a mutation transition. I must retain the observed-before and resulting-after exact state refs and obtain a fresh post-mutation projection.
  - OpenSpec state reuses `listActiveChanges`, `resolveSddStatus`, and `resolveSddNext`; ambiguous active changes are explicit and not silently selected by the router fallback. EIN and runtime data remain read-only/public metadata.
- `ein-pi/agent/lib/sdd-router.ts`
  - Existing status/router remains lifecycle authority for active change, phase, artifacts, blockers, verify outcome, and mtime-based `verifyStale`.
  - `resolveSddStatus` and `resolveSddNext` are consumed by B and must not be forked or changed to create a cleaner-specific lifecycle authority.
  - Existing verification staleness is conservative over delivered production/test files; I must additionally bind completion to the exact resulting Git state and not treat router `pass` alone as fresh.
- `ein-pi/agent/lib/git-baseline.ts`
  - `readGitBaseline` and rendering functions are advisory preflight/reset/stash signals only. They do not provide the exact state identity and do not authorize mutation.
  - Do not use a clean baseline, session existence, or automation success as a mutation precondition.
- `ein-pi/agent/lib/workbench.ts`
  - Imports `projectProjectState` and renders public project state for launcher/workbench consumers. No cleaner audit or mutation caller is present in this seam; it is an ownership boundary, not a place to add cleaner behavior.

### G reviewed-area evidence boundary

- `ein-pi/agent/lib/reviewed-area-ledger.ts`
  - `canonicalArea`/`normalizeArea` define bounded, deterministic file/tree selectors and `area-v1` identity.
  - `evaluateReviewedArea` is the read-only G decision seam. It requires reviewed evidence, exact Git binding, and evidence match; relevant transitions become stale, unverifiable transitions remain unknown, and unrelated transitions do not become current.
  - `intersects`/`transitionIntersects` determines whether a Git transition crosses the selected area, including rename/copy/delete semantics.
- `ein-pi/agent/lib/reviewed-area-ledger-store.ts`
  - `readWorkspaceLedger`/`evaluateWorkspaceLedger` are the consumer-facing read-only ledger seams and preserve unavailable/invalid states.
  - `replaceWorkspaceLedger` is the only observed writer seam in this domain. It is explicitly guarded by expected digest, B exclusion proof (`owner: "B"`), workspace boundary checks, temp-file ownership, and final precondition recheck. It writes the G-owned ledger, not cleaner source code.
  - I must not repurpose this writer as the cleaner mutation mechanism or make cleaner own ledger/evidence authority. If post-mutation evidence is updated, it must use the existing owner-controlled contract and only after fresh verification rules are satisfied.
- `tests/reviewed-area-ledger.test.ts`
  - Covers area canonicalization, privacy-safe evidence, exact/stale/unknown evaluation, transition intersection, B projection read-only behavior, workspace read failures, and guarded ledger replacement. Preserve these contracts and add only focused I integration coverage if needed.

## Call paths and current gaps

Current read path:

`projectProjectState` → `projectOpenSpecState` → `listActiveChanges` / `resolveSddStatus` / `resolveSddNext`; in parallel `readGitState` and `projectEinState` / verification binding → `ProjectStateV1`.

Current G path:

`readWorkspaceLedger` → `evaluateWorkspaceLedger` → `evaluateReviewedArea` → area/evidence/Git transition decision → `CleanerReadOnlyAssessment` → `auditCleanerReadOnly` → immutable report.

Current runtime/workbench path:

`workbench` consumes `projectProjectState` for rendering/launcher summaries; no caller currently connects it to cleaner audit or any cleaner writer.

Current mutation gap:

No existing cleaner mutation entrypoint/caller was found in `ein-pi/agent/lib` or tests. The only cleaner-specific exported operation is `auditCleanerReadOnly`; the only nearby file writer is the reviewed-area ledger writer owned by B. Design must introduce the smallest explicit I-slice command/application seam rather than silently adding mutation behavior to the H audit function, workbench, router, or ledger evaluator.

## Required I boundary to design next

1. **Selection:** accept one identified H finding only; reject zero, multiple, duplicate, unknown, or changed finding identities. Match the selected finding's opaque ID, area ID, selectors, and observed B state reference against the current read-only audit output.
2. **Ownership:** require a bounded canonical area (`area-v1` selectors), explicitly declared allowed affected paths/seams, and an attributable actor/review record. Reject empty, overlapping/expanded, ambiguous, or out-of-area paths. Cleaner must not claim B/G/H/architect/installer/workbench ownership.
3. **Behavior:** permit only the selected mechanical transformation declared by the SDD slice. Reject structural refactors, inferred neighboring cleanup, behavior changes, generated/private/runtime artifacts, and any second finding. No loop or parallel writer.
4. **Preconditions:** require current B exact state, current G reviewed evidence with exact state binding, selected finding classification suitable for mutation, explicit SDD change/phase identity, clean/unconflicted or otherwise declared Git condition, and all declared file/path checks. Stale/invalid/unavailable/ambiguous evidence is permission denial, never a warning.
5. **State invalidation:** capture the observed state identity before mutation; after the single bounded write, project the resulting exact state. Mark/represent prior audit and verification evidence stale/invalid with both prior observed and resulting state refs. Do not inherit freshness from a resumed session, runtime switch, matching text, or old report.
6. **Fresh verification:** run the declared focused verification against the resulting exact state, attributable to actor/command and exact state ref. Only then may the slice be represented complete/current. Failed, missing, unbound, stale, or unverifiable verification remains incomplete.
7. **Failure behavior:** stop at the first unmet precondition or boundary; return a visible blocked/uncertain result without retry loops, cleanup expansion, conflict resolution, staging, committing, or automatic evidence repair.

## Test seams for later apply/verify

- Add a narrowly named I mutation-contract suite, likely `tests/cleaner-bounded-mutations.test.ts`, around the new command seam.
- Cover one-finding success shape; zero/multiple/duplicate finding rejection; stale/invalid/unavailable/ambiguous H/G/B input rejection; bounded ownership and path intersection; mechanical-only behavior; architect/parallel/bulk/autonomous exclusion; precondition failure without writes; before/after state-ref capture and evidence invalidation; fresh verification requirement and exact resulting-state binding; attribution and resume/runtime non-refresh.
- Keep `tests/cleaner-read-only-audit.test.ts`, `tests/reviewed-area-ledger.test.ts`, `tests/shared-project-state.test.ts`, and `tests/sdd-router.test.ts` as compatibility contracts. No test/build/typecheck command was run in map.

## Archived dependency record

- H: `openspec/changes/archive/cleaner-read-only-audit/scope.md` — supplies traceable findings, explicit uncertainty, exact observed state identity, fail-closed stale/invalid/unavailable handling, and zero applied changes. H does not authorize writing.
- G: `openspec/changes/archive/reviewed-area-ledger/scope.md` — supplies bounded area identity, privacy-safe evidence, exact Git freshness, and reviewed/unreviewed/stale/invalid/unavailable/unknown states. G remains read-only to future audits and does not approve changes.
- B: `openspec/changes/archive/shared-project-state-contract/scope.md` — supplies authoritative OpenSpec/EIN/Git/project state, exact Git identity, and verification freshness tied to exact observed state. B is not redesigned here; its current implementation seam is `project-state.ts`.
- Roadmap: `docs/roadmap-features-ein.md`, section I — confirms I depends on H/G/B, is one bounded SDD slice, and excludes autonomous cleaner, architect mutation, parallel writers, and bulk changes.

## Map risks / design questions

- The repository already has a mature H/G/B read-only baseline but no cleaner writer; adding the mutation seam is the principal design decision and must remain review-sized.
- Existing router mtime staleness and exact Git identity must be combined without weakening either compatibility contract.
- Updating G evidence after mutation risks crossing G/B ownership; design must decide whether the slice records invalidation only and delegates ledger changes to its owner.
- A mechanical-looking finding can still alter behavior or cross selectors; fail closed unless the SDD declares the exact operation and affected paths.
- Codegraph index/source may lag later writes; apply/verify must re-read exact files and create fresh evidence.

## Ledger

ledger:
  reads:
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/vueuse/SKILL.md, lines: 341, estimated_tokens: 2300}
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/nuxt-ui/SKILL.md, lines: 79, estimated_tokens: 650}
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/vitest/SKILL.md, lines: 58, estimated_tokens: 500}
    - {path: /Users/samu/.pi-ein/agent/skills/local/ein-discipline/SKILL.md, lines: 101, estimated_tokens: 1100}
    - {path: /Users/samu/.pi-ein/agent/skills/local/architecture/SKILL.md, lines: 145, estimated_tokens: 1500}
    - {path: /Users/samu/.pi-ein/agent/skills/downloaded/document-writer/SKILL.md, lines: 83, estimated_tokens: 700}
    - {path: openspec/changes/cleaner-bounded-mutations/scope.md, lines: 112, estimated_tokens: 1500}
    - {path: openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md, lines: 25, estimated_tokens: 350}
    - {path: docs/roadmap-features-ein.md, lines: 381, estimated_tokens: 4300}
    - {path: openspec/changes/archive/cleaner-read-only-audit/scope.md, lines: 66, estimated_tokens: 1100}
    - {path: openspec/changes/archive/reviewed-area-ledger/scope.md, lines: 58, estimated_tokens: 1000}
    - {path: openspec/changes/archive/shared-project-state-contract/scope.md, lines: 179, estimated_tokens: 3000}
    - {path: ein-pi/agent/lib/cleaner-read-only-audit.ts, lines: 347, estimated_tokens: 2700}
    - {path: ein-pi/agent/lib/project-state.ts, lines: 1069, estimated_tokens: 7600}
    - {path: ein-pi/agent/lib/reviewed-area-ledger.ts, lines: 404, estimated_tokens: 3600}
    - {path: ein-pi/agent/lib/reviewed-area-ledger-store.ts, lines: 275, estimated_tokens: 2600}
    - {path: ein-pi/agent/lib/sdd-router.ts, lines: 760, estimated_tokens: 6500}
    - {path: tests/cleaner-read-only-audit.test.ts, lines: 397, estimated_tokens: 3000}
    - {path: tests/shared-project-state.test.ts, lines: 690, estimated_tokens: 5800}
    - {path: ein-pi/agent/lib/git-baseline.ts, lines: 135, estimated_tokens: 1200}
    - {path: tests/reviewed-area-ledger.test.ts, lines: 400, estimated_tokens: 3000}
    - {path: ein-pi/agent/lib/workbench.ts, lines: 140, estimated_tokens: 1100}
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: {tokens: 50100, reads: 31}
  budget_exceeded: true
  budget_note: "The effective read cap was reached during scoped exploration; no further source exploration was continued. Token estimates include required skill/context reads and codegraph-returned source."

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {"id":"criterion-1","status":"satisfied","evidence":"Map is limited to the I cleaner mutation slice and identifies existing H/G/B seams, the missing cleaner writer boundary, exact call paths, tests, and explicit exclusions."}
  ],
  "changedFiles": ["openspec/changes/cleaner-bounded-mutations/map.md"],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {"command":"codegraph explore (read-only cleaner/project-state/ledger query)","result":"passed","summary":"Returned indexed source and blast-radius context."},
    {"command":"codegraph callers (cleaner/ledger/project-state symbols)","result":"passed","summary":"No indexed callers were found for the queried exported symbols; grep confirmed only workbench project-state composition and test imports."}
  ],
  "validationOutput": ["No test, build, typecheck, or implementation command was run; map artifact was written at the canonical path."],
  "residualRisks":["No existing cleaner mutation entrypoint is present; design must add the smallest explicit command seam.","Exact post-mutation evidence ownership/update protocol remains a design decision."],
  "noStagedFiles":true,
  "diffSummary":"Added only the canonical map artifact; no source or tests were edited.",
  "reviewFindings":["no blockers in mapping; budget cap was exceeded after the required context reads"],
  "manualNotes":"Nuxt/VueUse/UI skills were not applicable to this Node/TypeScript cleaner domain; Vitest guidance was not used because repository tests use Bun and map phase forbids execution."
}
```
