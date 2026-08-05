status: partial
scope_status: in-scope-bounded
change: optimize-tdd-verify
phase: map
budget_exceeded: false

# Map: optimize-tdd-verify

## Scope and delta

The scope is limited to reducing redundant apply/final-verify command execution while preserving focused RED → GREEN → TRIANGULATE → REFACTOR cycles, independent verify freshness/evidence auditing, and the close gate. The declared delta adds four obligations: deduplicate identical final focused commands, retain one command per distinct behavior seam, execute every scheduled verify command freshly without cached/timestamp/hash evidence, preserve strict-TDD and close gates, and execute each relevant global check once. Production behavior, apply builds, cross-run caches, and test/build execution in this phase are excluded.

Accepted ownership evidence points to `ein-pi/core/agents/sdd-apply.md`, `ein-pi/core/agents/sdd-verify.md`, and `openspec/config.yaml`; no implementation is mapped outside the execution/routing seams below without downstream justification.

## Current execution contracts and flow

1. **Configuration input:** `openspec/config.yaml` sets `strict_tdd: true`. Apply and verify test-command fields and all global test/lint/format/coverage command lists are blank. The only configured quality command is `cd installer && bun run typecheck`; this phase did not execute it.
2. **Apply contract:** `ein-pi/core/agents/sdd-apply.md` owns focused tests and the strict RED → GREEN → TRIANGULATE → REFACTOR loop. It explicitly discourages exhaustive repetition, permits a full suite at most once at the end when needed, and keeps production builds out of apply. Its evidence is recorded in `apply-progress.md`.
3. **Verify contract:** `ein-pi/core/agents/sdd-verify.md` is the independent final gate. It reads the SDD artifacts/config, runs required focused and full checks when available, audits strict-TDD evidence and assertion quality, assesses behavioral coverage, and writes `verify-report.md`. It currently describes rerunning checks but has no explicit final-command plan, seam identity, duplicate elimination, or no-cache wording.
4. **Deterministic lifecycle seam:** `ein-pi/agent/lib/sdd-router.ts` defines `SddPhase`, `SddNext`, `VerifyOutcome`, `ApplyOutcome`, `SddNextMode`, artifact/task/budget status types, and the phase progression/close-readiness surface. `ein-pi/agent/lib/sdd-guardrails.ts` defines `lintPhaseArtifact`, phase-required signals, fabrication checks, and task/design linting. `ein-pi/agent/lib/sdd-close.ts` calls `assessCloseReadiness` before moving a change to archive. These are lifecycle/guardrail seams, not evidence that command execution currently belongs in the router.
5. **TDD routing seam:** `ein-pi/agent/lib/sdd-preflight.ts` exposes `readDelegationTddHint`, `delegationTargetsApply`, `delegationStartsScope`, `delegationIsDocsOnly`, and `gateTddForDelegation`; `ein-pi/agent/lib/tdd.ts` owns `TddMode`, config read/write, and the strict-mode options. These determine whether apply must use strict TDD, but are not presently a final verification command planner.

## Exact files and symbols in the blast radius

### Primary contract files

- `ein-pi/core/agents/sdd-apply.md`: focused-cycle ownership, test-frequency guidance, apply build boundary, and apply evidence contract.
- `ein-pi/core/agents/sdd-verify.md`: independent rerun/freshness audit, behavioral-coverage report, strict-TDD audit, and verify artifact contract.
- `openspec/config.yaml`: strict-TDD and command inventory inputs; currently has no configured global test commands.
- `openspec/changes/optimize-tdd-verify/specs/sdd-lifecycle/spec.md`: four scenarios are the acceptance delta.

### Deterministic lifecycle and guardrails

- `ein-pi/agent/lib/sdd-router.ts`: `SddPhase`, `SddNext`, `VerifyOutcome`, `ApplyOutcome`, `SddNextMode`, `SddArtifactStatus`, `SddTasksStatus`, `SddBudgetStatus`, `SddChangeSummary`; the router is also imported by guardrails and close-readiness code.
- `ein-pi/agent/lib/sdd-guardrails.ts`: `lintPhaseArtifact`, `lintTasksArtifact`, `oversizedGroupWarnings`, phase-required signals, and fabrication detection. Any new artifact marker or verify-plan contract would have to remain compatible with these deterministic checks.
- `ein-pi/agent/lib/sdd-close.ts`: `closeChange`, `closedChangePath`, and the `assessCloseReadiness` call that prevents archive/close before readiness.
- `ein-pi/agent/lib/sdd-preflight.ts`: `readDelegationTddHint`, `delegationTargetsApply`, `delegationStartsScope`, `delegationIsDocsOnly`, `gateTddForDelegation`, `renderSddPreflightPrompt`, and `ensureSddPreflight`.
- `ein-pi/agent/lib/tdd.ts`: `TddMode`, `TDD_OPTIONS`, `readTddMode`, `writeTddMode`, and `handleTddCommand`.

### Direct test seams identified by repository inventory

- `tests/sdd-tdd-phase-boundary.test.ts`: primary seam for apply-focused versus verify/global/build boundaries.
- `tests/sdd-phase-runtime-contract.test.ts`: runtime phase artifact/contract behavior.
- `tests/sdd-flow-contract.test.ts`: lifecycle contract and phase-flow expectations.
- `tests/sdd-router.test.ts`: deterministic routing/status behavior.
- `tests/sdd-guardrails.test.ts`: phase artifact and guardrail signals.
- `tests/sdd-close.test.ts`: close/readiness gate.
- `tests/sdd-preflight-tdd-gate.test.ts` and `tests/tdd-apply-delegation-gate.test.ts`: strict-TDD dispatch/preflight behavior.
- `tests/sdd-check-ux.test.ts`, `tests/sdd-next-dispatcher.test.ts`, and `tests/sdd-preflight-tdd-gate.test.ts` are secondary routing/dispatch seams if the eventual contract change reaches the orchestrator surface.

The bounded codegraph queries did not surface a dedicated command-plan/deduplication symbol or an existing verify-specific command scheduler. That absence is material: the likely first change surface is the verify contract/guidance and its contract tests, not an assumed router refactor.

## Test and evidence map

- Contract tests should distinguish identical command text attached to the same or different behavior seams, distinct commands for distinct seams, and global checks that occur once. The existing named phase-boundary/runtime/flow tests are the closest seams; no existing command-dedup test was found in the bounded graph queries.
- Strict-TDD tests must continue to assert apply-cycle evidence and must not turn apply into a global/full-build phase. Verify tests must assert independent execution/evidence rather than accepting `apply-progress.md` results as a substitute.
- Close tests must continue to require a fresh passing verify report; deduplication must not create a router path that bypasses `lintPhaseArtifact`, `assessCloseReadiness`, or the phase progression gate.
- Since configured global command arrays are empty, the configured installer typecheck is the only concrete global-check example in this repository context; the delta is primarily a workflow/contract behavior until a command planner is identified.

## Blast radius and non-goals

- **High:** `sdd-verify.md` wording and any verify command-plan contract tests; this changes how final evidence is described and evaluated.
- **Medium:** `sdd-apply.md` wording/tests, because it must retain focused cycles and avoid handing global/build work to apply.
- **Guarded/conditional:** router, guardrails, preflight, and close code. They govern deterministic routing and close readiness, but the mapped evidence does not show them executing shell/test commands. Do not expand here unless design identifies a concrete command-planning symbol or artifact signal that belongs there.
- **Out:** installer/application runtime, production builds during apply, caches/timestamps/hashes, and repository-wide refactors.

## Uncertainties for design

1. The command planner/executor seam is not identifiable from the bounded graph results; verify may currently rely on agent instructions rather than a runtime scheduler.
2. The exact representation of a “behavior seam” in apply evidence is not defined by the current agent contracts or config; design must choose a contract-level representation without weakening independent evidence.
3. Because global command lists are empty, the expected “relevant global checks once” behavior needs a deterministic source of commands (config, artifact, or runtime inventory) before implementation is chosen.
4. Test files were identified by bounded inventory and routing references, but no suite was run and no new test ownership is inferred in map phase.

## Phase boundary

No source, schema, config, test, or workflow implementation was changed. No test, build, or full-repository command was run. This artifact recommends `sdd-design` to resolve the command-plan seam and acceptance-test shape.

## Ledger

ledger:
  reads:
    - path: openspec/changes/optimize-tdd-verify/scope.md
      lines: 1-52
      estimated_tokens: 700
    - path: openspec/changes/optimize-tdd-verify/specs/sdd-lifecycle/spec.md
      lines: 1-33
      estimated_tokens: 450
    - path: openspec/config.yaml
      lines: 1-48
      estimated_tokens: 700
    - path: EIN.md
      lines: 1-44
      estimated_tokens: 450
    - path: ein-pi/core/agents/sdd-apply.md
      lines: 1-177
      estimated_tokens: 2600
    - path: ein-pi/core/agents/sdd-verify.md
      lines: 1-101
      estimated_tokens: 1500
    - path: codegraph://explore sdd apply/verify execution, TDD routing, guardrails
      lines: returned source sections in sdd-preflight.ts, tdd.ts, sdd-guardrails.ts
      estimated_tokens: 2100
    - path: codegraph://explore relevant SDD contract and TDD tests
      lines: returned source sections in sdd-preflight.ts, sdd-guardrails.ts
      estimated_tokens: 1500
    - path: codegraph://explore ein-pi/agent/lib/sdd-router.ts routing/close seam
      lines: returned source sections in sdd-router.ts, sdd-guardrails.ts, sdd-close.ts
      estimated_tokens: 1900
  webfetch_used: false
  webfetch_urls: []
  budget_consumed:
    tokens: 11900
    reads: 9
  budget_exceeded: false

skill_resolution: paths-injected
