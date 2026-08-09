# Scope — beta-launcher-e2e-hardening

## Outcome

Harden the completed minimal workbench launcher with reproducible, TTY-driven end-to-end coverage while never launching a real Pi or Claude process. The slice closes the concrete coverage gaps recorded by roadmap item D, using the existing launcher, project-state, and runtime-adapter contracts plus safe fixture executors; it does not broaden launcher behavior.

## Scope packet

scope: Harden the completed minimal workbench launcher with TTY-driven end-to-end tests, real project/adapter wiring, verification-staleness checks, and safe fixture executors without running Pi or Claude. Preserve all existing launcher behavior and keep this slice limited to reproducible test coverage of roadmap E gaps.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## Execution configuration

execution: interactive
webfetch: false
strict_tdd: true

`openspec/config.yaml` is already present and remains authoritative. It identifies a TypeScript/ESM project using Bun, enables strict TDD, records no reliable automatic test runner or configured unit/integration/E2E command, and provides `cd installer && bun run typecheck` as the only configured typecheck. Existing focused tests use `bun:test`; later phases should establish the bounded Bun invocation without rewriting project configuration. This scope phase does not run tests, builds, typechecks, Pi, Claude, or any runtime process.

## Problem statement

Roadmap item D delivered a separate workbench and focused fake-boundary tests, but its verification explicitly reports partial behavioral coverage. The missing evidence is not a new launcher feature: it is an end-to-end test seam that drives the real TTY-facing flow, connects the workbench to the real C adapter boundary while intercepting execution safely, and exercises the actual project-state/freshness transition. The production doctor path must remain honest: where no callable production bridge exists, the test must prove the bounded `unavailable` fallback rather than fabricate real doctor delegation.

## Authoritative scope and gap evidence

The task declares A–D complete and merged at `fe33ccb`; this scope treats that completed D implementation and its archived records as the baseline. The following repository artifacts define the bounded work:

| Artifact | Scope evidence |
|---|---|
| `docs/roadmap-features-ein.md` | E (`beta-launcher-e2e-hardening`) covers project/runtime selection, OpenSpec reading, session operations, doctor, failure paths, and verification invalidation; it excludes new launcher functionality. |
| `docs/roadmap-beta.md` | BE-05 requires launcher-specific, reproducible success/failure/stale-verification evidence and separates it from installer E2E; the installer’s E2E cannot stand in for launcher coverage. |
| `README.md` | The existing installer E2E is explicitly not launcher evidence; future launcher E2E must cover project flow, sessions, and state freshness. |
| `openspec/changes/archive/minimal-workbench-launcher/verify-report.md` | D records `behavior_coverage: partial` and names the residual gaps: no real TTY, no default executor/runtime, no callable production doctor bridge, and no single workbench-to-real-adapter-with-fake-executor integration. |
| `openspec/changes/archive/minimal-workbench-launcher/apply-progress.md` | D’s final remediation records that no real runtime, TTY, default executor, or doctor implementation was exercised; this is the boundary to close with safe tests, not permission to run providers. |
| `openspec/changes/archive/minimal-workbench-launcher/summary.md` | D hands off `beta-launcher-e2e-hardening` and preserves the partial-coverage caveat. |
| `ein-pi/agent/lib/workbench.ts` and `ein-pi/workbench.ts` | D’s pure orchestration and thin TTY entrypoint are the behavior under test; they remain read-only production dependencies for this test-hardening slice. |
| `tests/minimal-workbench-launcher.test.ts` | D’s focused fake-seam suite is the regression baseline; extend only where an end-to-end gap cannot be proven from the existing unit seam. |
| `ein-pi/agent/lib/project-state.ts` and `ein-pi/agent/lib/runtime-session-adapters.ts` | B/C authorities to exercise at their public boundaries; do not duplicate projection, capability, plan, or process semantics in the E tests. |
| `tests/shared-project-state.test.ts` and `tests/runtime-session-adapters.test.ts` | Predecessor B/C contract suites remain regression evidence and should not be rewritten as launcher E2E. |
| `e2e/docker-test.sh` | Installer-only deployment evidence; explicitly excluded as a substitute for this launcher change. |

## In scope

1. **TTY-driven launcher flow**
   - Add a test-only pseudo-terminal harness or equivalent platform-supported PTY driver for the repository-local workbench entrypoint/orchestration boundary.
   - Drive deterministic project selection, explicit confirmation, Pi/Claude selection, bounded actions, launch confirmation, EOF/cancellation, and failure returns through actual line-oriented TTY input/output.
   - Assert no hangs, stable prompts, plain-text status meaning, and the existing exit contract (`0`, `1`, `2`, `130`).
   - Keep the harness disposable and test-owned; do not add a production UI framework or global packaging dependency.

2. **Real adapter seam with safe execution**
   - Wire the completed workbench flow to the real runtime-adapter factory/plan boundary in tests.
   - Inject a fixture `LaunchExecutor` that records and returns deterministic exit/signal/cancel outcomes; never resolve or execute a real Pi or Claude executable.
   - Prove that only the adapter-produced validated plan reaches the fixture executor, with the confirmed project binding, fixed executable metadata, empty argv where required by C, isolated environment, `shell: false`, and the existing normalized result semantics.
   - Cover request-only creation, Pi listing, Claude unsupported listing, unsupported resume, unavailable/error/cancelled adapter results, and privacy-safe output without duplicating C internals.

3. **Project/OpenSpec and verification freshness**
   - Use disposable project fixtures and the existing `ProjectStateV1` projector to exercise project identity, OpenSpec selection/phase/next, incomplete or unavailable state, Git state, and verification evidence.
   - Capture a verified baseline, apply a deliberate fixture-only code/Git change, and prove the subsequent projection/rendering marks prior verification stale/invalid rather than current.
   - Assert that the workbench does not re-project silently, invent state, persist a second state store, or claim that launch refreshes verification.

4. **Doctor and ownership perimeter**
   - Exercise the actual workbench menu’s compact doctor path through a bounded fixture delegate where available.
   - Exercise the production wiring’s current no-bridge behavior as an actionable bounded `unavailable` result, returning control to the menu without exposing raw paths/errors.
   - Assert that no installer install/update/repair/release function, project/session store, transcript, cache, or runtime history is touched.

5. **Failure and cleanup matrix**
   - Cover TTY EOF/SIGINT/abort, invalid selection, unavailable candidate/project state, adapter rejection, plan rejection, fixture-executor nonzero/signal/cancel, and doctor failure.
   - Snapshot disposable fixture state before and after each scenario; permit only the deliberate test mutation used to demonstrate freshness invalidation.
   - Keep all child processes limited to the workbench/test harness and fixture commands; no Pi, Claude, external provider, network, or installer E2E invocation.

## Acceptance criteria for later phases

- A pseudo-terminal test drives the completed launcher through project confirmation, runtime selection, an action, and exit without relying on `stdinTTY: true` alone or running Pi/Claude.
- The end-to-end workbench flow reaches the real C adapter/plan boundary and a safe fixture executor; assertions prove the plan and normalized outcome without provider execution.
- A disposable project/OpenSpec/Git fixture demonstrates that verification tied to an earlier code state becomes stale after the deliberate state change and is never presented as current.
- Pi/Claude capability asymmetry, request-only creation, unsupported operations, privacy bounds, default-no launch confirmation, cancellation, and closed exit codes remain observable through the TTY path.
- Doctor success/unavailable/error behavior is bounded and returns to the menu; absent production callable access remains an explicit unavailable result, not a duplicated or fabricated doctor implementation.
- No launcher-owned project, OpenSpec, installer, updater, session, transcript, cache, or persisted selection state is written; the only fixture mutation is isolated and intentional for the freshness scenario.
- Existing D focused tests and B/C contract tests remain green when the repository-supported focused Bun command is established in later phases.
- No production launcher behavior, runtime capability, installer ownership, packaging, release, or roadmap scope is changed by this test-hardening slice.

## Explicitly out of scope

- Executing Pi, Claude, or any real runtime/provider process.
- Calling the default production `Bun.spawn` path for a provider; fixture executors are mandatory.
- Implementing a new doctor bridge, duplicating doctor checks, or changing the existing unavailable fallback merely to make a test pass.
- Adding runtime capabilities, resume semantics, persistence, session indexes, transcript/history handling, or cross-runtime continuity.
- Expanding the installer TUI, installer E2E, updater/release/package wiring, global bins, network workflows, or Docker release scenarios.
- Changing production launcher files during scope; later phases should prefer test-only additions and may not alter behavior outside this bounded coverage slice.
- A manual screen-reader audit, native macOS/Windows PTY certification, or claims of universal platform coverage without platform-specific evidence.

## Test seams and likely artifact changes

The expected implementation surface is test-only and should be kept to the smallest reviewable unit:

- `tests/beta-launcher-e2e-hardening.test.ts` (or the repository’s established focused-test location): PTY driver, disposable fixtures, safe executor, real adapter/projector integration, freshness mutation, doctor fallback, and ownership assertions.
- `tests/minimal-workbench-launcher.test.ts`: only narrowly scoped regression additions if the PTY harness requires a missing injectable seam already implied by D; do not rewrite existing D coverage.
- `ein-pi/agent/lib/workbench.ts`, `ein-pi/workbench.ts`, `ein-pi/agent/lib/project-state.ts`, and `ein-pi/agent/lib/runtime-session-adapters.ts`: read-only dependencies by default; any proposed production edit must demonstrate a testability defect and preserve the existing observable contract.
- `openspec/changes/beta-launcher-e2e-hardening/`: subsequent map/design/tasks/apply/verify artifacts only; no unrelated change directories.

## Strict-TDD and phase boundary

Strict TDD is active. Later implementation must show RED for each newly introduced E2E seam, the smallest GREEN fixture behavior, TRIANGULATE across both providers and stale/error/cancel paths, and REFACTOR without widening production ownership. This scope artifact is the only phase output: no implementation, tests, builds, typechecks, `apply-progress.md`, or `verify-report.md` are produced here.

## Spec delta declaration
spec_delta: none
spec_delta_reason: This slice adds only TTY-driven E2E coverage and safe fixture executors for existing launcher behavior; it changes no observable launcher contract.
