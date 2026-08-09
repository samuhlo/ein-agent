# Tasks — beta-launcher-e2e-hardening

status: ready
blocked_by: none

## // 001. Establish the disposable PTY driver contract

- [x] 1.1 RED: Add `tests/beta-launcher-e2e-hardening.test.ts` with a focused Bun test that requires prompt-synchronized PTY input, bounded waits, EOF/SIGINT delivery, exit capture, and teardown; make it fail because the test-owned driver does not yet exist.
  - skills: `ein-discipline`, `vitest`
  - why: The missing guarantee is real terminal behavior rather than boolean TTY flags.
  - learn: Synchronize each write on an observed prompt; never use sleeps or blind scripted input.
  - architecture: The test owns PTY lifecycle and process reaping; production launcher files remain read-only.
  - avoid: Adding a PTY package, production UI layer, or relying on piped stdin.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 1.2 GREEN: Create `tests/fixtures/beta-launcher-e2e-driver.ts` as the minimal Bun child entrypoint and `tests/beta-launcher-e2e-hardening.test.ts` PTY controller (`waitForPrompt`, line writes, EOF, SIGINT, deadline, dispose), launching Bun with argv and no shell.
  - skills: `ein-discipline`, `vitest`
  - why: A child process is required for actual terminal semantics while keeping execution injectable.
  - learn: A disposable child boundary makes terminal cleanup and exit-code assertions observable.
  - architecture: The driver only assembles existing authorities and I/O; the parent test owns orchestration and evidence.
  - avoid: Encoding launcher decisions or provider behavior in the driver.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 1.3 TRIANGULATE/REFACTOR: Exercise normal exit, EOF, SIGINT, timeout cleanup, prompt deadlines, and CRLF/echo normalization; assert child termination and temporary-root deletion in `finally`.
  - skills: `ein-discipline`, `vitest`
  - why: The harness must be reliable across success and cancellation paths before behavior is layered on it.
  - learn: Cleanup is part of the E2E contract, not an afterthought after assertions.
  - architecture: PTY handles, listeners, child processes, and fixture roots have one test-owned lifecycle owner.
  - avoid: Leaving timeout cleanup best-effort or accepting leaked PIDs/roots.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`

## // 002. Build deterministic project/OpenSpec/Git fixtures and manifests

- [x] 2.1 RED: Add a fixture test proving a clean disposable project is projected through `projectProjectState`, exposes canonical OpenSpec/Git/verification fields, and has exact before/after ownership manifests; fail until the fixture factory exists.
  - skills: `ein-discipline`, `vitest`
  - why: E must cross the B authority and prove launcher-owned state is not written.
  - learn: Fixture evidence must live outside project/runtime roots so evidence cannot contaminate freshness.
  - architecture: `tests/beta-launcher-e2e-hardening.test.ts` owns fixture creation, manifests, canaries, and cleanup; B owns projection semantics.
  - avoid: Reimplementing projection logic or using selected-file snapshots as ownership proof.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 2.2 GREEN: Implement deterministic project, isolated runtime-home, OpenSpec, Git, verification, canary, and evidence-root setup plus canonical manifest hashing (bytes, modes, symlinks, Git state) in `tests/beta-launcher-e2e-hardening.test.ts`.
  - skills: `ein-discipline`, `vitest`
  - why: Stable inputs are required for reproducible freshness and no-write assertions.
  - learn: Bind verification evidence to the exact clean `git.stateRef`, not merely to a timestamp or status string.
  - architecture: Fixture helpers are test-only and call `projectProjectState` as the sole project authority.
  - avoid: Creating a second state store or writing protocol files under the project fixture.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 2.3 TRIANGULATE/REFACTOR: Cover current baseline, one named tracked-source mutation, stale/invalid re-projection, incomplete/unavailable evidence, and exact post-run manifests; permit only that mutation.
  - skills: `ein-discipline`, `vitest`
  - why: This proves verification freshness invalidation without silently refreshing or persisting state.
  - learn: Compare baseline, deliberate mutation, and post-launch states separately to identify the only allowed delta.
  - architecture: Existing projector determines freshness; test code only mutates the designated fixture source.
  - avoid: Mutating multiple files, regenerating reports, or asserting freshness from `git status` alone.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`

## // 003. Cross the real runtime adapter and safe executor

- [x] 3.1 RED: Add a failing PTY scenario that composes the real `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` but expects a recording fixture executor to receive a validated plan, with a zero-call sentinel on default-no.
  - skills: `ein-discipline`, `vitest`
  - why: Existing C tests do not prove the workbench-to-adapter integration.
  - learn: Mock the unsafe execution edge only; retain real plan validation and normalized result behavior.
  - architecture: C owns capability, binding, plan, and normalization; the E fixture executor owns deterministic outcomes and recording.
  - avoid: Calling production `Bun.spawn`, resolving Pi/Claude, or copying adapter validation into tests.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 3.2 GREEN: Add the test-owned recording `LaunchExecutor` and driver dependency assembly; assert confirmed binding, fixed executable metadata, empty argv, isolated environment, and `shell: false` without spawning a provider.
  - skills: `ein-discipline`, `vitest`
  - why: The safe seam must prove exactly what would execute while making real execution impossible.
  - learn: A recording executor is safer than a fake adapter because it observes the adapter-produced plan.
  - architecture: Only the fixture executor is injected; `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` remain real.
  - avoid: Replacing the adapter or plan builder with mocks in critical launch cases.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 3.3 TRIANGULATE/REFACTOR: Cover Pi and Claude asymmetry, Pi listing, Claude unsupported listing, request-only creation, unsupported resume, plan rejection, and normalized success/unavailable/error/cancelled executor outcomes with privacy assertions.
  - skills: `ein-discipline`, `vitest`
  - why: Cross-boundary evidence must cover both providers and failure semantics without adding menu capabilities.
  - learn: Unsupported operations belong at the adapter boundary and should not be added to the launcher menu for testing.
  - architecture: Tests invoke non-menu adapter operations directly while the PTY covers only existing launcher actions.
  - avoid: Inventing resume behavior, persistence, or provider output assertions.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`

## // 004. Prove doctor ownership and bounded menu return

- [x] 4.1 RED: Add failing scenarios for a bounded fixture doctor delegate and the actual production no-bridge doctor path, requiring sanitized output, menu return, and actionable `unavailable` behavior.
  - skills: `ein-discipline`, `vitest`
  - why: Doctor behavior must be evidenced without fabricating a production bridge.
  - learn: An unavailable production capability is an honest result and should remain observable.
  - architecture: Fixture delegate is injected once; production wiring remains the existing unavailable fallback.
  - avoid: Exporting/replacing production dependencies or implementing doctor checks in the launcher.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 4.2 GREEN: Implement bounded success, thrown-error, cancelled, and unavailable doctor scenarios through the existing workbench/entrypoint seams, capping rows at ten and returning to the same action menu.
  - skills: `ein-discipline`, `vitest`
  - why: Success and failure doctor ownership must be bounded and privacy-safe.
  - learn: Normalize private errors at the boundary; never print raw paths or exception text.
  - architecture: Existing workbench owns rendering/menu return; tests own delegate outcomes and assertions.
  - avoid: Touching installer, updater, project/session stores, transcripts, caches, or runtime history.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 4.3 TRIANGULATE/REFACTOR: Assert production unavailable output and fixture doctor outcomes contain no private markers, ANSI controls, or installer/provider activity, then simplify shared scenario helpers.
  - skills: `ein-discipline`, `vitest`
  - why: The ownership perimeter must be proven for both injected and production wiring.
  - learn: Privacy assertions should use deliberate canary markers, not only visual inspection.
  - architecture: No production source changes are permitted; cleanup and evidence remain test-owned.
  - avoid: Treating a successful fixture delegate as proof of production doctor delegation.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`

## // 005. Complete failure matrix and repository verification

- [x] 5.1 RED: Add failing table-driven PTY cases for invalid selection, unavailable candidate/project, adapter rejection, plan rejection, nonzero/signal/throw/cancel executor results, EOF, SIGINT, and closed exit codes `0/1/2/130`.
  - skills: `ein-discipline`, `vitest`
  - why: BE-05 requires reproducible launcher-specific failure and cancellation evidence.
  - learn: Assert normalized meaning and exit contract rather than provider-specific implementation details.
  - architecture: Existing `classifyWorkbenchExit` remains authoritative; the E suite only drives and observes it.
  - avoid: Broadening launcher actions or changing production behavior to make a case reachable.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 5.2 GREEN: Implement the smallest scenario data and assertions in `tests/beta-launcher-e2e-hardening.test.ts` and driver configuration needed to pass the matrix, including bounded deadlines and no-hang checks.
  - skills: `ein-discipline`, `vitest`
  - why: Deterministic fixture outcomes make every failure path reproducible and safe.
  - learn: Keep scenario configuration declarative so each outcome has one focused assertion.
  - architecture: Driver configuration controls only test outcomes; production dependencies and ownership boundaries stay unchanged.
  - avoid: Running installer E2E, Docker, network, Pi, Claude, or production `Bun.spawn`.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts`
- [x] 5.3 TRIANGULATE/REFACTOR: Run focused E2E, then the D/B/C regression suites together; inspect that production launcher/projector/adapter files are unchanged and retain exact cleanup/rollback behavior.
  - skills: `ein-discipline`, `vitest`, `architecture`
  - why: Final evidence must show new coverage did not regress predecessor contracts or widen ownership.
  - learn: Test-only rollback is deleting the two new test files; no production migration is required.
  - architecture: The change remains limited to `tests/beta-launcher-e2e-hardening.test.ts` and `tests/fixtures/beta-launcher-e2e-driver.ts`.
  - avoid: Treating installer typecheck as a substitute for launcher tests or claiming universal native PTY support.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts && bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/beta-launcher-e2e-hardening.test.ts && cd installer && bun run typecheck`
