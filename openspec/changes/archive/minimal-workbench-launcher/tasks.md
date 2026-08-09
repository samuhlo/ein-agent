# Tasks — minimal-workbench-launcher

status: ready
blocked_by: none

## // 001. Foundational workbench IO/result contracts

- [x] 1.1 Define the transient injected boundaries and closed outcomes in `ein-pi/agent/lib/workbench.ts`: candidate/projector, prompt/input, output sink, adapter/launch, doctor bridge, `WorkbenchResult`, cancellation, and exit classification.
  - skills: `ein-discipline`, `architecture`
  - why: Consumers need a stable, privacy-safe contract before orchestration behavior is added.
  - learn: Keep the workbench a pure transient coordinator; dependencies enter through parameters rather than globals.
  - architecture: `workbench.ts` owns orchestration contracts only; ProjectStateV1, adapters, doctor, and process execution remain external authorities.
  - avoid: Do not create persistence, session stores, shell/process abstractions, UI dependencies, or installer imports.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'contract|exit|cancellation'`
  - TDD: RED contract tests first → GREEN minimal types/constructors → TRIANGULATE cancellation, operational, usage, and normal outcomes → REFACTOR without widening the public surface.

## // 002. Deterministic ProjectStateV1 rendering

- [x] 2.1 Add pure safe view-model/rendering symbols in `ein-pi/agent/lib/workbench.ts` (project candidate summary, confirmed project summary, and state rendering) that preserve OpenSpec phase/next, quality/reason, Git status quality, verification outcome/freshness, and explicit unknown/non-current tokens.
  - skills: `architecture`, `cognitive-doc-design`, `ein-discipline`
  - why: The launcher must present the confirmed projector snapshot honestly without becoming a second projector.
  - learn: Render source quality and freshness as data, not as inferred green/unknown status.
  - architecture: `projectProjectState` remains the sole projector; rendering is deterministic, lossy, linear plain text, and never prints private paths or runtime details.
  - avoid: Do not recompute state, refresh/re-project during a run, promote stale evidence, add color/cursor UI, or auto-select a lone candidate.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'selection|confirmation|state|freshness|privacy|accessibility'`
  - TDD: RED fixtures for current, stale, ambiguous, unavailable, invalid, absent, and incomplete values → GREEN exact labels/view model → TRIANGULATE ordering and privacy across variants → REFACTOR shared formatting helpers only after behavior is covered.

## // 003. Confirmed project/runtime selection and capability menu

- [x] 3.1 Implement confirmed candidate selection and runtime selection in `ein-pi/agent/lib/workbench.ts` (the main flow symbol, candidate projector boundary, confirmation input, `projectBindingFromState`, and `getRuntimeCapabilities`/capability rendering), retaining the immutable `ProjectStateV1` snapshot and safe identity through the bounded action menu.
  - skills: `architecture`, `ein-discipline`, `cognitive-doc-design`
  - why: Runtime/session actions must be gated by explicit project confirmation and evidence-based Pi/Claude capabilities.
  - learn: Selection establishes ownership of the confirmed snapshot; capability descriptors, not method names, define visible actions.
  - architecture: `workbench.ts` orchestrates only; `projectProjectState`, `projectBindingFromState`, and runtime adapters remain authorities, with no session calls in this group.
  - avoid: Do not auto-select, re-project, call `listSessionRequest`/`createSessionRequest`, infer parity, expose paths, or add persistence.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'confirmed project|runtime selection|capabilit(y|ies)|menu gating'`
  - TDD: RED tests for ordered candidates, explicit confirmation, cancellation, Pi/Claude capability differences, and no adapter list/create calls → GREEN bounded flow/menu → TRIANGULATE unavailable/invalid candidates and privacy/accessibility → REFACTOR without adding session behavior.

## // 004. Pi listing and request-only session creation outcomes

- [x] 4.1 Add supported Pi list rendering and request-only create for Pi/Claude in `ein-pi/agent/lib/workbench.ts`, using `listSessionRequest`, `createSessionRequest`, opaque internal references, same-provider selection, and normalized `AdapterOutcome` rendering; keep launch orchestration out of scope.
  - skills: `architecture`, `ein-discipline`, `cognitive-doc-design`
  - why: The action menu must expose only current provider support while keeping references and adapter failures privacy-safe.
  - learn: Show bounded ordinal/recency metadata and “request prepared (not persisted)” rather than claiming a session was created.
  - architecture: Adapters own validation and session semantics; the workbench keeps opaque references internal and owns only safe menu/result presentation.
  - avoid: Do not list Claude, offer resume, accept pasted/raw references, expose private fields/raw errors, or call `buildLaunchPlan`/`executeLaunchPlan`.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'Pi list|request-only create|opaque reference|adapter outcome|unsupported|unavailable|cancelled|normalized error'`
  - TDD: RED list/create and privacy tests → GREEN Pi rows plus both-provider request-only handling → TRIANGULATE Claude unsupported listing, normalized failure/cancellation, same-provider opaque selection, and no launch calls → REFACTOR session menu helpers without widening scope.

## // 005. Safe confirmed runtime launch

- [x] 5.1 Add launch confirmation and execution orchestration in `ein-pi/agent/lib/workbench.ts`: require default-no confirmation, pass the confirmed state and adapter-produced intent through `buildLaunchPlan`, then pass only a successful plan to `executeLaunchPlan` with the injected executor/signal and normalized exit result.
  - skills: `architecture`, `ein-discipline`
  - why: Launch must remain state-bound and non-shell while honestly handling a snapshot that may be stale before handoff.
  - learn: A launcher can confirm snapshot identity and report process-boundary outcomes without claiming refreshed state or persisted sessions.
  - architecture: Runtime adapter C owns executable, argv, cwd, environment, shell, validation, and normalization; workbench owns confirmation and result classification only.
  - avoid: Do not re-project into a second state owner, accept command/argv/executable input, guess resume flags, capture child output, run real runtimes, or use parallelism.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'launch|stale|plan|executor|shell|argv|cancel|exit'`
  - TDD: RED fake-executor and default-no confirmation tests → GREEN validated create launch path → TRIANGULATE mismatch, unavailable, rejection, signal, nonzero, cancellation, and stale-snapshot labeling → REFACTOR keep adapter calls isolated and output normalized.

## // 006. Compact delegated doctor bridge

- [x] 6.1 Implement the injected compact doctor action in `ein-pi/agent/lib/workbench.ts`, delegating to the established read-only `ein_pi_doctor`/doctor contract, rendering bounded check/overall statuses or actionable unavailable, and returning to the same action menu.
  - skills: `architecture`, `ein-discipline`, `cognitive-doc-design`
  - why: Doctor access is required without duplicating diagnostics or acquiring installer lifecycle ownership.
  - learn: A boundary adapter should degrade explicitly when a safe callable surface is unavailable.
  - architecture: Doctor remains owned by `ein-doctor.ts`; workbench receives only a bounded bridge result and never imports installer install/update/repair flows.
  - avoid: Do not recompute checks, mutate files, expose raw diagnostics/private paths, or make doctor terminal to the workbench flow.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'doctor|unavailable|returns to menu|no writes'`
  - TDD: RED delegate success/unavailable/throw tests → GREEN bounded rendering and menu return → TRIANGULATE cancellation and repeated-menu paths plus mutation/privacy assertions → REFACTOR keep bridge presentation compact.

## // 007. Separate Bun entrypoint and integration gate

- [x] 7.1 Implement `ein-pi/workbench.ts` symbols for `--project`/`--help` parsing, ordered deduplication and max-20 validation, TTY gating, built-in line input/stdio wiring, signal handling, and process exit mapping into the pure workbench flow; leave installer/package/release files untouched.
  - skills: `bun`, `ein-discipline`, `architecture`
  - why: The feature needs a repository-local separate entrypoint without installer TUI ownership or global packaging.
  - learn: Keep framework/terminal concerns at the thin edge and make non-TTY behavior fail closed before side effects.
  - architecture: `ein-pi/workbench.ts` is the only production entrypoint boundary; `installer/src/main.ts`, menu, package metadata, updater/config/dashboard, and global bins remain unchanged.
  - avoid: Do not add UI dependencies, global packaging, shell interpolation, real runtime execution, or filesystem writes.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'entrypoint|argv|TTY|help|exit' && bun run tsc --noEmit --pretty false`
  - TDD: RED CLI/TTY/cancel/privacy integration tests with fakes → GREEN thin Bun wiring → TRIANGULATE help, invalid args, non-TTY, EOF/SIGINT, compatibility/no-write and Pi/Claude end-to-end paths → REFACTOR keep production entrypoint minimal and the focused suite deterministic.
