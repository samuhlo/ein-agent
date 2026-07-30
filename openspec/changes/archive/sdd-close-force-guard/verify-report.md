status: pass
behavior_coverage: verified

# Verify — sdd-close-force-guard (fail-closed forced close)

## Scope and artifacts reviewed

- `openspec/changes/sdd-close-force-guard/{scope,map,design,tasks,apply-progress,sync-report}.md` and the `specs/sdd-lifecycle/spec.md` delta.
- Distinct OpenSpec write to `openspec/specs/sdd-lifecycle/spec.md` (synchronized; `state: synchronized`, `conflicts: 0`, `domains: sdd-lifecycle`).
- `openspec/changes/sdd-close-force-guard/sync-report.md` reports `state: synchronized`, `operations: added=2 modified=1 removed=0`, `conflicts: 0`.

## Production / test / spec diff vs HEAD

| Area | Files | Insertions | Deletions | Lines | Forecast | Budget |
|---|---|---:|---:|---:|---|---|
| Production | `sdd-router.ts`, `sdd-close.ts`, `ein-ai.ts` | 126 | 49 | 175 | ≤280 | ≤400 ✓ |
| Tests | `tests/sdd-router.test.ts`, `tests/sdd-close.test.ts`, `tests/sdd-flow-contract.test.ts` | 150 | 57 | 207 | ≤360 | — |
| Docs/spec | `openspec/specs/sdd-lifecycle/spec.md` | 47 | 5 | 52 | ≤140 | — |
| Generated | — | 0 | 0 | 0 | 0 | 0 ✓ |

Test and generated lines are reported separately, never counted toward the review-workload gate. Production lines (175) fit comfortably inside both the task forecast (≤280) and the 400-line review gate.

## Commands run

```
$ timeout 120 bun test tests/sdd-close.test.ts tests/sdd-router.test.ts tests/sdd-flow-contract.test.ts
Ran 101 tests across 3 files. [110.00ms]
101 pass, 0 fail, 323 expect() calls

$ git diff --check -- ein-pi/agent/lib/sdd-router.ts ein-pi/agent/lib/sdd-close.ts \
  ein-pi/agent/extensions/ein-ai.ts tests/sdd-router.test.ts tests/sdd-close.test.ts \
  tests/sdd-flow-contract.test.ts
(exit 0; clean)
```

## Spec coverage (design requirements 1–6 → implementation → test)

- **R1 — completion/freshness gates absolute**: `sdd-router.ts` `assessCloseReadiness` emits `apply-not-complete`, `verify-missing`, `verify-failed`, `verify-unclear`, `verify-stale`, `summary-missing`, `summary-stale`, `tasks-pending`; `sdd-close.ts` keeps them absolute by filtering only `spec-unresolved` out of the escape path. Tested by `force cannot bypass [pending tasks|blocked tasks|partial apply|blocked apply|unknown apply|missing verify|failed verify|unknown verify|missing summary|pending spec|malformed unresolved spec]` (11 cases in `tests/sdd-close.test.ts`).
- **R2 — canonical spec states fail closed**: `sdd-router.ts` returns `spec-pending`, `spec-conflict`, `spec-unresolved`; close never invokes `synchronizeOpenSpecFilesystem`. Tested explicitly by `--force NO archiva sobre specs en conflicto` and `force cannot bypass pending spec` / `malformed unresolved spec`.
- **R3 — declarationless legacy eligibility is exact**: `declarationlessLegacyEligible` requires canonical `openspec/changes/`, `unresolved` state, readable declarationless `scope.md`, no `sync-report.md`, no `specs/<domain>/spec.md`, `apply === complete`, present and non-stale verify, present and non-stale summary, no pending tasks. Tested by `reconoce solamente el registro canónico declarationless completo` (1 positive + 4 negatives: declared, delta, sync, incomplete).
- **R4 — explicit reason + boundary enforcement**: `normalizeLegacyReason` rejects empty, whitespace-only, >200 chars, and the placeholders `none/n/a/na/tbd/unknown/-`. Tested by `eligible declarationless record requires force and a valid normalized reason` (5 invalid reasons + 1 valid).
- **R5 — distinguishable results**: `CloseResult` adds optional `legacyEscape: { used: true, priorSpecState: "unresolved", eligibility: "declarationless-record", reason }`. Help/tool text uses `Closed through legacy escape (spec state remained unresolved): <reason>` versus `Verified change '<change>' closed.`. Tested by `normal close and unused force retain the normal result shape` (deep-equality on the minimal shape) and the legacy escape assertions.
- **R6 — movement deterministic**: `_validate-and-move` order is preserved (readiness → mkdir archive → rename → fallback cp/rm). Rejected requests return before `mkdirSync`. Tested by `force cannot bypass …` (each asserts `existsSync(join(..., change))` and no archive entry) and `el vacío no apunta al directorio de cambios entero`.

## Decision-table coverage

Every row in the design's decision table is represented by a focused regression (the `force cannot bypass …` table has 11 cases; the declarationless path has 1 positive + 4 negatives + 5 invalid reasons + 1 valid reason). `.sdd/changes/` fallback with incomplete-evidence preservation is covered by `cierra cambios completos en la raíz legacy .sdd/changes/`. Synchronized close with `force: true` is covered by `normal close and unused force retain the normal result shape`. Multiple simultaneous blockers are covered by `multiple blockers are reported together and cannot be erased by legacy eligibility`.

## Tool / help wording audit

- Required wording present in `ein-ai.ts` (description of `ein_sdd_close`): `--force --reason "<audit reason>" is only for an otherwise complete, freshly verified declarationless legacy record. It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs.`
- Forbidden wording absent: `Bypass the readiness guard` and `bypass readiness` are not present in `ein-ai.ts`. The only occurrence of `bypass` is inside the negation sentence, exactly as required.
- Two distinct user-visible success messages confirmed: `Closed through legacy escape (spec state remained unresolved): <reason>` and `Verified change '<change>' closed. openspec/changes/ is clean.`. The tool's sister message adds the `/// SDD CLOSE —` prefix and the archived path.
- Sync report says close did not create or modify canonical specs, declarations, or `sync-report.md` (unchanged; only the deterministic sync flow wrote `sync-report.md` once).

## No automatic sync on rejection

`closeChange` only calls `assessCloseReadiness` and filesystem primitives; it never invokes `synchronizeOpenSpecFilesystem`, `planOpenSpecSync`, or `openspec-spec-sync`. Confirmed by reading `sdd-close.ts` end-to-end and by the existing `pending sync evidence` block in `sdd-router.ts` (which is a detection-only path, executed by the gating library, not by close).

## Synchronized lifecycle contract

The canonical `openspec/specs/sdd-lifecycle/spec.md` contains the three required scenarios:

- `MODIFIED` `canonical-close-readiness` with the exact text required by the design's "Exact correction required in the current delta"… reads close requires synchronized evidence; pending/conflict/malformed/stale always blocks; only the exact unresolved declarationless legacy shape may close with force and a valid reason, returning distinguishable legacy evidence without reclassifying or synchronizing the spec state.
- `ADDED` `forced-close-preserves-readiness-gates` (force cannot archive incomplete / unverified / unverified / stale / conflicted work).
- `ADDED` `forced-close-explicit-legacy-escape` (declarationless unresolved legacy close is narrow and auditable).

`sync-report.md` shows `added=2 modified=1` and `conflicts: 0`, agreeing with the spec delta. No delta file is edited outside `openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md` and its synchronized mirror.

## Behavioral coverage

`behavior_coverage: verified`. All 101 tests across the three in-scope files passed. The matrix covers:

- Normal close with no force: passes.
- Force on a fully ready change: passes with no `legacyEscape` marker.
- Force on each of 11 absolute blockers (pending tasks, blocked tasks, partial/blocked/unknown apply, missing/failed/unknown verify, missing summary, pending spec, malformed unresolved spec): fails, source remains, archive not created, blocker code surfaces.
- Declarationless eligible: fails without force, fails with force but without a valid reason (5 invalid reasons), succeeds only with force + a valid reason whose normalized form appears in the `legacyEscape.reason`.
- Multiple blockers simultaneously: all reported together; legacy eligibility does not erase other blockers.
- `.sdd/changes/` legacy root: closes normally when complete; close-level change name validation rejects `..`, `/`, `archive`, empty, and `a/b`.
- `_validate`-before-move invariant: an empty/null/invalid change name never points to the directory as a whole.

## Strict TDD compliance

`openspec/config.yaml` declares `strict_tdd: false`. The TDD Cycle Evidence table is therefore not required. The apply-progress does not claim strict TDD was enforced, and the test design is table-driven rather than RED-first; that is consistent with the project configuration.

## Findings (sorted by severity)

- No blockers.
- No new findings.

## Out-of-scope working-tree files (preserved, not treated as blockers)

Modified but unrelated to this change (human-first teaching, frozen roadmap, other untracked work): `ein-pi/agent/assets/orchestrator.md`, `ein-pi/core/AGENTS.md`, `ein-pi/core/agents/sdd-apply.md`, `tests/sdd-phase-runtime-contract.test.ts`. Untracked unrelated work: `docs/ein-multiagente-plan.md`, `docs/public-beta-implementation-plan.md`, `docs/public-beta-plan.md`, `EIN.md`, `openspec/config.yaml`, `tests/sdd-config-bootstrap.test.ts`, `.sdd/changes/ein-sdd-state-machine-map/`, `openspec/changes/release-experience-roadmap/`, `openspec/changes/archive/sdd-apply-contract-drift/`, `openspec/changes/archive/zero-friction-sdd-start/`. None of these were staged or touched by this change.

## Residual risks

- `openspec/changes/sdd-close-force-guard/map.md` carries `status: partial` and `budget_exceeded: true`. This is a map-phase artifact, not a close-time blocker; the close path reads `map.md` as a presence-only alias for `scope.md` and does not gate on the map's `status` field. Recommend the next `sdd-tasks` / `sdd-design` cycle address the over-budget map, but it does not affect this change.
- The `apply-progress.md` "TDD: off" annotation is consistent with `openspec/config.yaml::strict_tdd: false`. If the project later enables strict TDD, this change's tests are black-box behavior assertions, which is fully compatible with strict TDD; no TDD rework is required.
- `–force` accepts the placeholder audit reason set `none / n/a / na / tbd / unknown / -` case-insensitively. Worth a heads-up line in the project user-facing docs so reviewers don't propose adding to the deny-list; the design intentionally rejects a per-value denylist in favor of free-text audit reasoning.

## No staged files

`git diff --cached --name-only` returned 0 files. Nothing has been staged; the change-local working tree is the only delivery surface for this verify pass.

## Acceptance

- Pass: build, types, tests, and the `--check` whitespace/git hook are all green.
- Behavioral coverage is verified by the 101 focused tests covering the full normal-vs-force decision table, declarationless eligibility with both 4 negatives and 5 invalid reasons + 1 valid reason, multiple-blocker reporting, no-movement on rejection, the `.sdd/changes/` legacy fallback, and the truthful normal-vs-legacy result/audit output.
- Spec coverage matches the design's requirements 1–6 and the decision table.
- No automatic sync on rejection; the close library only moves files.
- The canonical spec contains the corrected `MODIFIED` `canonical-close-readiness` scenario plus the two new `ADDED` scenarios, and `sync-report.md` agrees with the delta (`state: synchronized`, `conflicts: 0`).
- Tool and help wording carries the required narrow language and contains no "bypass readiness" phrasing.
- Production diff (175 lines) is within both the task forecast (≤280) and the 400-line review workload gate.
- No staged files; out-of-scope working-tree files are preserved.
