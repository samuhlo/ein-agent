# Tasks — runtime-test-fixture-isolation

status: ready
blocked_by: none

## // 001. Reproduce the shared-owner contention (RED)

- [x] 1.1 Add the deterministic failing probe in `tests/fixtures/runtime-test-fixture-isolation-probe.test.ts`, using two independently started owners that write distinct markers, synchronize before scanning, and assert contamination/equal homes against the current fixed preload behavior.
  - skills: `bun`, `vitest`
  - why: Establishes a deterministic RED reproducer for the nine mapped session-listing failures rather than relying on probabilistic suite overlap.
  - learn: A contention regression must prove the interleaving and observed contamination, not merely run tests concurrently.
  - architecture: The probe owns only test orchestration and reports owner paths/markers; production modules remain untouched.
  - avoid: Do not weaken assertions, retry, skip, reset the global module cache, or serialize the whole suite.
  - verify: `bun test tests/fixtures/runtime-test-fixture-isolation-probe.test.ts` — expected RED with shared homes or cross-owner observation.

## // 002. Establish the test-owned runtime owner contract

- [x] 2.1 Add the smallest helper under `tests/fixtures/` (the owner/lease helper specified by the design) for one Bun import-cache owner: unique disposable home, exact env/cwd/global snapshots, owner lifetime, idempotent disposal, registered child/resource cleanup, and misuse failure after disposal.
  - skills: `bun`, `architecture`
  - why: The cached `AGENT_DIR`/`SESSIONS_DIR` bindings require ownership at process/worker/realm lifetime, before cached production imports.
  - learn: Restoring an environment variable does not repair an already-imported immutable cache binding; ownership must outlive its users.
  - architecture: Test helper owns lifecycle mechanics and snapshots; it is not a production API and must delete only paths it created.
  - avoid: Do not introduce production dependency injection, cache-busting imports, or a shared fixed temp directory.
  - verify: `bun test tests/fixtures/runtime-test-fixture-isolation.test.ts` — expected RED until the behavior tests in the next task are present, then GREEN for unique owner/cache binding and disposal invariants.

- [x] 2.2 Add `tests/runtime-test-fixture-isolation.test.ts` covering unique owner homes, cached path coherence, exact absent-vs-empty env restoration, owner disposal, and clean successor behavior.
  - skills: `bun`, `vitest`
  - why: Proves the foundational ownership contract independently from session behavior.
  - learn: Cleanup assertions should inspect both values and absence, because `delete` and `= ""` are observably different states.
  - architecture: Regression tests consume the helper and cached runtime modules; they do not mutate production implementation.
  - avoid: Do not assert only that a directory exists; assert distinct homes, cache-bound paths, and no residue after disposal.
  - verify: `bun test tests/runtime-test-fixture-isolation.test.ts` — all ownership, cache, restoration, and successor checks pass.

## // 003. Add the owner-local session lease

- [x] 3.1 Extend the test-only helper with a shared awaited mutex and uniquely named session lease that spans setup, writes, whole-root scan/assertion, namespace-only cleanup, and release; prove non-session fixtures do not acquire it.
  - skills: `bun`, `architecture`
  - why: Unique roots prevent cross-owner sharing, but cached scanners enumerate the complete sessions root within one owner.
  - learn: Serialize only the smallest critical section whose scanner observes shared state; unrelated tests must remain concurrent.
  - architecture: Lease state is owner-local and released in `finally`; lease cleanup cannot steal another active lease.
  - avoid: Do not mark entire files or the entire Bun suite serial, and do not release before cleanup.
  - verify: `bun test tests/runtime-test-fixture-isolation.test.ts` — overlapping lease users never overlap, cleanup completes, unrelated users proceed.

## // 004. Migrate session fixtures (GREEN)

- [x] 4.1 Migrate only `tests/sessions.test.ts` from top-level `EIN_PI_AGENT_HOME`, shared-root rebuilds, and destructive root cleanup to the preload-owned home and helper-owned unique session leases; preserve all existing record builders and assertions.
  - skills: `bun`, `architecture`
  - why: Removes the direct shared-root writer/reader race while retaining the session behavioral oracle.
  - learn: Fixture ownership belongs in test infrastructure; domain assertions should continue to describe session semantics.
  - architecture: `sessions.test.ts` owns records/assertions; the helper owns namespace and lifecycle cleanup.
  - avoid: Do not change ordering, filtering, limits, dedupe, opaque references, or production `sessions.ts`.
  - verify: `bun test tests/sessions.test.ts` — the three mapped cases pass with unchanged expectations and no shared-root deletion.

- [x] 4.2 Migrate only `tests/runtime-session-adapters.test.ts` to owned leases and namespace cleanup, removing its top-level home assignment and shared-root `beforeEach`/`afterAll` deletion; preserve lifecycle listing and all adapter assertions.
  - skills: `bun`, `architecture`
  - why: Removes the second bounded fixture owner that can scan while another test deletes or writes the same root.
  - learn: Adapter tests may share the active cached owner but must lease every write/whole-root scan critical section.
  - architecture: Adapter tests retain fixture data and behavior ownership; helper owns only paths, lease, restoration, and disposal.
  - avoid: Do not serialize pure adapter tests or alter runtime adapter implementation and beta-launcher assertions.
  - verify: `bun test tests/runtime-session-adapters.test.ts` — all mapped adapter cases and lifecycle assertions pass.

## // 005. Remove adjacent competing top-level mutations

- [x] 5.1 Update only `tests/model-config.test.ts`, `tests/lang.test.ts`, and `tests/tdd.test.ts` to remove competing top-level `EIN_PI_AGENT_HOME` assignments and locally restore any other globals/env values they mutate, preserving their existing behavior.
  - skills: `bun`, `architecture`
  - why: Prevents unrelated import-time consumers from rebinding the preload-owned cached home or leaving residue visible to follow-on fixtures.
  - learn: A test can consume a harness-owned cache owner without becoming its owner; adjacent global state still needs local restoration.
  - architecture: Preload owns runtime home; each adjacent test owns and restores only its non-session globals (`EIN_PI_CONFIG_HOME`, locale, and related values as applicable).
  - avoid: Do not refactor unrelated config/locale semantics, migrate non-session fixtures, or touch production files.
  - verify: `bun test tests/model-config.test.ts tests/lang.test.ts tests/tdd.test.ts` — existing assertions pass and no top-level runtime-home mutation remains.

## // 006. Failure, interruption, and residue triangulation

- [x] 6.1 Expand `tests/runtime-test-fixture-isolation.test.ts` and the focused probe to cover assertion/setup-spawn/cancellation-timeout unwinding plus SIGINT/SIGTERM cleanup, exact restoration, child/resource cleanup, lease release, unique-root non-reuse, and no-residue successor checks.
  - skills: `bun`, `vitest`
  - why: Validates the lifecycle contract under every catchable abnormal path named by the design.
  - learn: Idempotent disposal must be safe after partial setup and must complete cleanup before releasing ownership.
  - architecture: Catchable signal handling and registered disposers stay in test infrastructure; SIGKILL safety is provided by non-reused generated roots, not impossible JS cleanup.
  - avoid: Do not claim cleanup for uncatchable termination or leave orphaned probe processes; parent-side cleanup must remove known probe residue.
  - verify: `bun test tests/runtime-test-fixture-isolation.test.ts tests/fixtures/runtime-test-fixture-isolation-probe.test.ts` — all lifecycle paths pass and no owned root/child/lease remains.

## // 007. Stress and acceptance gate

- [x] 7.1 Run focused ownership/session stress with default Bun scheduling ten times and then run the targeted E concurrency command; retain original assertions and record zero mapped regressions.
  - skills: `bun`
  - why: Demonstrates the narrow lease is stable under repeated overlap and does not conceal the neighboring E contract.
  - learn: Repetition under the repository’s default scheduler is evidence against timing-sensitive fixture races.
  - architecture: Only cache-bound session write/scan sections serialize; unrelated suites remain eligible for concurrency.
  - avoid: Do not use retries inside tests, `--serial`, skips, or altered test selection to hide failures.
  - verify: `for i in 1 2 3 4 5 6 7 8 9 10; do bun test tests/runtime-test-fixture-isolation.test.ts tests/sessions.test.ts tests/runtime-session-adapters.test.ts || exit 1; done` and `bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/beta-launcher-e2e-hardening.test.ts` — all pass.

- [x] 7.2 Run installer typecheck and three consecutive repository-default full suites; inspect the diff for the test-only boundary and document rollback readiness.
  - skills: `bun`, `architecture`
  - why: Confirms repository-wide stability and that no production, installer, manifest, lockfile, or beta E assertion changed.
  - learn: The handback gate requires repeated clean full suites, not one lucky run.
  - architecture: Rollback is limited to the helper, preload, probe/regression, and touched test files; reverting restores the known blocker and must not alter production.
  - avoid: Do not hand back on partial success, unrelated-failure ambiguity, or any recurrence of the nine mapped failures.
  - verify: `cd installer && bun run typecheck`; `cd .. && for i in 1 2 3; do bun test || exit 1; done`; `git diff -- ein-pi/agent cc-ein installer package.json bun.lock tests/beta-launcher-e2e-hardening.test.ts` — typecheck and all three suites pass, with no forbidden diff.

- [x] 7.3 Hand back to phase E only after every acceptance check is green: focused ownership/session command, ten-run stress, targeted E concurrency, cleanup probes, installer typecheck, three zero-failure full suites, zero recurrence of all nine mapped failures, and a clean no-production/no-E-assertion diff.
  - skills: `bun`, `ein-discipline`
  - why: Makes the explicit prerequisite for resuming `beta-launcher-e2e-hardening` auditable and prevents premature E execution.
  - learn: A blocked downstream phase resumes only on its stated invariant, not merely because the changed tests pass.
  - architecture: `sdd-apply` records RED/GREEN/triangulation evidence; `sdd-verify` confirms the boundary; E reruns its existing checks without changing assertions.
  - avoid: Do not resume E if any mapped session failure recurs; classify only demonstrably unrelated failures separately.
  - verify: Manual handback checklist against `design.md` success criteria and recorded apply/verify evidence — explicit RESUME E decision only when all criteria are green.
