status: complete
scope_status: mapped
change: beta-launcher-e2e-hardening
phase: map

# Map — beta-launcher-e2e-hardening

## Current baseline

Roadmap items B–D are present in the current checkout. The former baseline-gap blocker is removed: the D launcher, projector, adapter boundary, and focused contract suites exist and are the read-only dependencies for E. No D restoration or production behavior change belongs in this slice.

Codegraph is indexed and was used for the bounded symbol/file queries. The four D seam files were also inspected directly because path-specific codegraph queries did not return their symbols despite the files being present; this is an indexing/query limitation, not a missing-baseline finding.

## E scope boundary

E hardens coverage of the completed workbench with reproducible TTY-driven input/output, disposable project/OpenSpec/Git fixtures, real project projection and runtime-adapter/plan wiring, safe fixture execution, verification freshness invalidation, bounded doctor behavior, and cleanup/ownership assertions. It does not add launcher capabilities, provider execution, persistence, session indexes, transcripts/history, installer/updater/release behavior, network/Docker E2E, or a production doctor bridge.

## Present D production seams

### `ein-pi/agent/lib/workbench.ts`

- `runWorkbench(dependencies)` owns the bounded flow: candidate projection and availability, explicit project selection/confirmation, runtime selection, canonical capability comparison, action menu, request-only create, launch confirmation (default no), adapter plan build/execute handoff, EOF/abort cancellation, and closed result reasons.
- `WorkbenchInput.read` and `WorkbenchOutput.write` are the line-oriented I/O seams. The PTY harness should exercise the real prompts and output through these boundaries rather than only calling pure renderers.
- `WorkbenchDependencies` injects project projection, adapter factory, launch `build`/`execute`/`executor`, doctor delegate, abort signal, and transient candidates. It owns no global state.
- `renderProjectState`, `renderRuntimeCapabilities`, `renderActionMenu`, `renderAdapterOutcome`, `renderDoctorResult`, and `renderPiSessionList` are the plain-text/privacy projection seams.
- `classifyWorkbenchExit` maps normal/operational/usage/cancelled results to `0/1/2/130`.

### `ein-pi/workbench.ts`

- `parseWorkbenchArgs` resolves and deduplicates `--project` roots and caps candidates at 20.
- `runWorkbenchEntrypoint` is the repository-local TTY-facing entrypoint. It rejects non-TTY input/output before dependency creation, runs the injected/real orchestration, classifies the exit code, and disposes dependencies in `finally`.
- `productionDependencies` wires `projectProjectState`, `createRuntimeSessionAdapter`, `buildLaunchPlan`, `executeLaunchPlan`, the real line reader/output, SIGINT abort, and the production `Bun.spawn` executor. E must replace only this execution with a test-owned fixture executor through the existing dependency seam and must never invoke the provider path.
- Production doctor wiring intentionally returns `{ outcome: "unavailable", overall: "unavailable" }`; E must assert the actionable fallback, not implement a bridge.

### `ein-pi/agent/lib/project-state.ts`

- `projectProjectState({ cwd, selectedChange, runtime })` is the single B projector used by the launcher.
- It supplies identity/repository binding, OpenSpec active selection/phase/next/artifacts/blockers, EIN context, bounded Git state and `stateRef`, verification outcome/freshness, and default runtime metadata for Pi/Claude.
- `projectVerificationState` binds a verification report to `git.stateRef` and returns `current`, `stale`, `unbound`, `unavailable`, or `invalid`; E should mutate only a disposable fixture code/Git state and observe this authority rather than reimplementing freshness.
- The projector is read-only and deterministic. E should assert no second state store, silent reprojection, or launch-triggered verification refresh.

### `ein-pi/agent/lib/runtime-session-adapters.ts`

- `RUNTIME_CAPABILITY_MATRIX` and `getRuntimeCapabilities` define the asymmetric provider surface: Pi list/create(request-only)/launch, Claude create(request-only)/launch, and unsupported resume for both; Claude listing is unsupported.
- `createRuntimeSessionAdapter`, `createPiSessionAdapter`, and `createClaudeSessionAdapter` are the factory/adapter boundary to exercise.
- `createSessionRequest`, `listSessionRequest`, and `resumeSessionRequest` validate the supplied `ProjectStateV1`/`ProjectBinding`, preserve request-only creation, scope Pi session metadata, and fail closed for unsupported/mismatched references.
- `buildLaunchPlan` is the adapter-owned validated plan boundary: provider-owned executable, empty argv, confirmed project cwd, isolated provider environment, and `shell: false`; it rejects stale/mutated bindings and unavailable executables before execution.
- `executeLaunchPlan` accepts `LaunchExecutor`, normalizes exit/signal/spawn/cancel outcomes, and suppresses provider output/exception details. E's fixture executor must record this plan and return deterministic outcomes without resolving or spawning Pi/Claude.
- `toProjectRuntimeMetadata` is the transient, bounded translation back into B's runtime metadata; E must not duplicate it or persist adapter state.

## Focused regression authorities

- `tests/minimal-workbench-launcher.test.ts` covers D's workbench/entrypoint contracts: argv and TTY fail-closed behavior, candidate confirmation, capability gating, plain-text/privacy rendering, request-only create, Pi listing/Claude unsupported listing, launch confirmation default-no, adapter plan handoff, launch failure/cancel outcomes, doctor success/unavailable/error fallback, menu return, cancellation, and exit codes. E should add only the missing real-PTY/real-adapter/projector integration cases.
- `tests/shared-project-state.test.ts` is the B projector contract suite. Its fixture helpers and freshness cases establish the disposable Git/OpenSpec pattern: bound pass, state-ref mismatch, router staleness, absent/invalid/unavailable evidence, no-write determinism, and bounded Git identity. Reuse the authority and fixture shape; do not rewrite B tests.
- `tests/runtime-session-adapters.test.ts` is the C adapter contract suite. It covers capability asymmetry, scoped/opaque Pi listing, request-only creation, unsupported resume, project binding validation, metadata translation, fixed isolated plans, injectable executor outcomes, cancellation, shell/argv/environment validation, and privacy bounds. E should cross the real boundary without duplicating these internals.

## Exact E integration seams/files

Preferred test-only artifact: `tests/beta-launcher-e2e-hardening.test.ts`.

It should own the disposable PTY/equivalent line driver, temporary project/OpenSpec/Git fixtures, deterministic input/output capture and timeouts, safe `LaunchExecutor`, snapshot/diff ownership checks, deliberate freshness mutation, and entrypoint dependency factory. It should invoke `runWorkbenchEntrypoint` with `stdinTTY/stdoutTTY: true`, not merely set `stdinTTY` on a pure orchestration call, and should verify prompts, no hangs, exit codes, and bounded output.

The test factory should compose the real `projectProjectState`, `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` with the fixture executor. It should cover both providers, Pi listing/Claude unsupported listing, request-only creation, unsupported resume, unavailable/error/cancelled adapter and executor outcomes, confirmed binding, fixed executable metadata, empty argv, isolated env, and `shell: false`.

The same fixture should capture a bound verification baseline, mutate only the intended fixture code/Git state, re-project through `projectProjectState`, and prove `verification.freshness=stale` or `invalid` is rendered as non-current. It should snapshot before/after state and assert no launcher-owned project/OpenSpec/installer/session/transcript/cache/history writes beyond the deliberate mutation.

`tests/minimal-workbench-launcher.test.ts` may receive only a narrowly scoped addition if the PTY driver exposes a missing D injectable seam. `ein-pi/agent/lib/workbench.ts`, `ein-pi/workbench.ts`, `ein-pi/agent/lib/project-state.ts`, and `ein-pi/agent/lib/runtime-session-adapters.ts` remain read-only unless a later design proves a concrete testability defect without changing behavior.

## Out of scope

No real Pi or Claude process, production `Bun.spawn` provider execution, external provider/network, installer E2E or Docker release scenario, new doctor bridge, duplicated doctor checks, runtime capability/resume/persistence/session-index/transcript/history feature, updater/release/package wiring, production UI framework, or universal native PTY certification. No production launcher behavior changes under E.

## Design handoff

The baseline is usable and the E implementation surface is bounded to a new test-owned E2E file, with optional narrow regression additions. `sdd-design` should decide the smallest supported PTY strategy and fixture lifecycle while preserving the seams and no-scope above.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/beta-launcher-e2e-hardening/scope.md", lines: 109, estimated_tokens: 2100 }
    - { path: "ein-pi/agent/lib/workbench.ts", lines: 300, estimated_tokens: 3000 }
    - { path: "ein-pi/workbench.ts", lines:  ninety, estimated_tokens: 1100 }
    - { path: "ein-pi/agent/lib/project-state.ts", lines: 690, estimated_tokens: 7600 }
    - { path: "ein-pi/agent/lib/runtime-session-adapters.ts", lines: 760, estimated_tokens: 8500 }
    - { path: "tests/minimal-workbench-launcher.test.ts", lines: 430, estimated_tokens: 5200 }
    - { path: "tests/shared-project-state.test.ts", lines: 670, estimated_tokens: 8200 }
    - { path: "tests/runtime-session-adapters.test.ts", lines: 650, estimated_tokens: 7800 }
    - { path: "codegraph status/explore/query: bounded D seam and symbol searches", lines: 0, estimated_tokens: 700 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 15000, reads: 9 }
  budget_exceeded: true
