# Design: runtime-test-fixture-isolation

## A. Proposal

### Intent

Make the runtime/session tests deterministic by giving each Bun import-cache owner a unique disposable runtime home before production modules load, then isolating each session fixture inside that home and serializing only the session write/scan critical section that cannot be isolated from the cached global scanner. Production runtime behavior and the beta-launcher E2E contract remain unchanged.

### Scope

In scope:

- Test-only ownership of `EIN_PI_AGENT_HOME`, its cached `AGENT_DIR`/`SESSIONS_DIR`, session fixture directories, relevant environment values, cwd, i18n global state, optional registered child handles, and cleanup.
- Removing test-file top-level assignments that can overwrite the preload-owned agent home in `sessions`, `runtime-session-adapters`, `model-config`, `lang`, and `tdd` tests.
- A focused fixture helper and regression/probe coverage for unique homes, cache binding, contention, failure cleanup, interruption, and residue.
- Narrow serialization around callbacks that write session entries or invoke whole-home session scans within one import-cache owner.

Out of scope:

- Any file under `ein-pi/agent/**`, `cc-ein/**`, or `installer/**`; package manifests, lockfiles, and dependencies.
- Changes to session ordering, filtering, limits, opaque references, launcher behavior, or beta-launcher assertions.
- Global module-cache resets, retries/skips, or serialization of whole files/the whole suite.
- Refactoring unrelated config-home or locale tests except where a touched test must stop leaking a process-global value that can rebind this runtime fixture.

### Affected areas

- `tests/preload-env.ts`: establish one unique runtime owner before any cached production import.
- A small helper under `tests/fixtures/`: expose the owner paths, session leases, narrow mutex, exact restoration, and disposal without becoming production API.
- `tests/runtime-test-fixture-isolation.test.ts` and a narrowly scoped probe under `tests/fixtures/`: behavioral regression and stress coverage.
- `tests/sessions.test.ts` and `tests/runtime-session-adapters.test.ts`: replace shared-root setup/destructive cleanup with owned leases.
- `tests/model-config.test.ts`, `tests/lang.test.ts`, and `tests/tdd.test.ts`: remove competing top-level `EIN_PI_AGENT_HOME` assignments; preserve their existing behavior and locally restore any other global they mutate.

### Risks

- Bun may load the preload in more than one worker/realm; owner creation must be idempotent within a realm and unique across realms/processes.
- `AGENT_DIR` and `SESSIONS_DIR` are immutable ESM-cache bindings. Restoring the environment while cached modules are still callable would create a path mismatch.
- A session scanner enumerates the complete cached sessions root, so directory uniqueness alone does not prevent one fixture from observing another; removing serialization prematurely would reintroduce the defect.
- Signal cleanup is best-effort for catchable signals; uncatchable process termination cannot run JavaScript cleanup, so uniqueness must also guarantee that a later run never reuses residue.

### Rollback

Revert only the test helper, preload, probe/regression, and touched test files. There is no production migration or persistent data to reverse. Rollback intentionally restores the known shared-fixture blocker, so `beta-launcher-e2e-hardening` must return to blocked status until another isolation fix lands.

### Success criteria

- The nine mapped session-listing failures disappear without weakening their assertions.
- Focused ownership, coordinated concurrency, interruption/failure cleanup, targeted E concurrency, three repository-default full-suite runs, and installer typecheck all pass.
- Every concurrently active import-cache owner reports a distinct runtime home; within one owner, no two session write/scan leases overlap.
- No temporary root, session entry, environment override, cwd change, global value, registered child, or test-owned cache survives its documented lifetime.
- The diff contains no production, installer, manifest, lockfile, or beta E2E assertion change.

### Canonical spec context

`scope.md` declares `spec_delta: none` and records no canonical `openspec/specs/<domain>/spec.md` references; `map.md` adds no explicit mapped domain hint. Therefore the canonical selection is **0 files / 0 UTF-8 bytes**, with no path, SHA-256, or byte-count row to record.

## B. Spec

### R1. Runtime-home ownership

The test harness **MUST** create a unique disposable runtime root for each Bun import-cache owner before any module that caches `EIN_PI_AGENT_HOME` is imported. The owner **MUST** keep `EIN_PI_AGENT_HOME` stable for the entire lifetime of those cached modules, and test files **MUST NOT** overwrite it at module top level.

**Scenario — independent cached owners**

- **Given** two concurrently started probe processes with no explicit shared test home
- **When** each loads the test preload and then imports `ein-paths`, `sessions`, and the runtime-session adapter
- **Then** their runtime homes are distinct, each cached `AGENT_DIR`/session path resolves inside its own home, and neither observes the other owner’s marker or session files.

### R2. Session fixture isolation and minimal serialization

Each session test case **MUST** receive a uniquely named owned namespace and **MUST** remove only that namespace. Because production scanners enumerate the complete cached sessions root, every callback that writes session entries or performs a whole-root session scan within the same import-cache owner **MUST** hold one shared single-writer lease from setup through assertion and cleanup. Tests that do not touch session storage **MUST NOT** be serialized.

**Scenario — concurrently eligible fixture users**

- **Given** a `listRecentSessions` fixture and a runtime-adapter listing fixture become eligible concurrently in one owner
- **When** both request the session lease
- **Then** exactly one enters the write/scan section at a time, each sees only its own deterministic fixture data, cleanup removes only its namespace, and unrelated adapter tests continue without the lease.

### R3. Exact restoration and cleanup

The fixture **MUST** snapshot exact prior values, including the distinction between an absent environment key and an empty/string value, before mutation. Setup and use **MUST** be enclosed by guaranteed disposal so pass, assertion failure, timeout/cancellation that unwinds, setup/spawn failure, and catchable interruption restore owned environment/global values and cwd, reap registered children, close registered resources, remove owned paths, and release the lease. Cleanup **MUST** be idempotent and **MUST NOT** delete another owner’s path.

**Scenario — abnormal lifecycle**

- **Given** a fixture with sentinel prior env/global/cwd values, an owned root, and a registered long-lived child/resource
- **When** the fixture is exercised separately through assertion throw, setup/spawn throw, cancellation/timeout, SIGINT, and SIGTERM paths
- **Then** the prior values are byte-for-byte restored, the child/resource is closed or reaped, the lease is not left held, and the owned root no longer exists after process completion.

### R4. Cache lifecycle

The harness **MUST NOT** reset or mock the production ESM module cache globally. Its runtime-home owner **MUST** live at least as long as cached `AGENT_DIR` and `SESSIONS_DIR`; only test-owned owner/lease state **MAY** be invalidated at teardown, after all users finish. Calls after owner disposal **MUST** fail as fixture misuse rather than silently reading a restored or unrelated path.

**Scenario — cached path remains coherent**

- **Given** production path/session modules were imported after owner activation
- **When** multiple session leases run sequentially and the process environment is inspected between them
- **Then** the cached paths and `EIN_PI_AGENT_HOME` continue to identify the same active owner, while each completed lease leaves no session namespace behind.

### R5. No residue in a follow-on test

A follow-on test **MUST** start from the owner baseline and **MUST NOT** observe a previous fixture’s session files, config/runtime artifact, cwd, locale global, environment override, active child, open registered resource, or held lease.

**Scenario — clean successor**

- **Given** a preceding fixture completed through either success or failure
- **When** a fresh fixture lease runs immediately afterward
- **Then** it sees an empty owned namespace, the expected owner-level environment and cwd baseline, no prior sentinel, and can acquire and release the session lease normally.

### R6. Production and E invariance

The change **MUST** remain test-only and **MUST NOT** alter production runtime/session semantics or the beta-launcher E2E assertions. Existing session ordering, dedupe, project-scope, scan-limit, path tie-break, lifecycle-listing, and privacy assertions **MUST** remain the behavioral oracle.

**Scenario — unchanged observable contract**

- **Given** the isolated fixtures contain the same records and mtimes as the existing tests
- **When** existing session and runtime-adapter assertions execute
- **Then** they produce the same expected results as before, with no production or E assertion diff.

## C. Decisions

### D1. Align ownership with the immutable import cache

The smallest safe runtime-home owner is the Bun process/worker/realm that shares one ESM cache, not an individual test. `ein-paths.ts` captures `AGENT_DIR` at import time and `sessions.ts` derives `SESSIONS_DIR` from it; a per-test environment swap would therefore lie about the path actually used. The preload creates the unique root first, records prior env/cwd, sets the path, and stores one idempotent test-owned owner record. Production modules are imported only afterward.

The owner root is unique across concurrent processes, while per-test session namespaces are unique within it. Environment restoration and root deletion occur only after the cache owner has no remaining users. Test-owned state is then invalidated; production module-cache state is neither reset nor reused.

### D2. Eliminate shared paths first; serialize only global scans

The current fixed `/tmp/ein-agent-tests/agent` path and root-level deletion are removed. A session lease creates a high-entropy namespace and deletes exactly that namespace in `finally`. This eliminates cross-process and cross-run sharing.

Serialization remains necessary only because `listRecentSessions` and `scanProjectSessions` enumerate all project directories under the cached root. One owner-local, awaited mutex covers `fixture setup → writes → scan/assertion → namespace cleanup`; release is in `finally`, and there is no unsafe lease stealing. Pure functions and adapter tests that do not touch session storage stay parallel. This is narrower than serializing either test file or Bun’s suite.

### D3. Centralize mutation; keep assertions in their domain tests

The helper owns lifecycle mechanics only: paths, snapshots, lease state, disposers, and cleanup. Session-record builders and the existing behavioral assertions remain in `sessions.test.ts` and `runtime-session-adapters.test.ts`. Adjacent tests consume the preload-owned agent home instead of assigning it; unrelated locale/config semantics remain locally owned and restored.

A separate behavioral probe is justified because uniqueness and interruption cannot be proven reliably inside a single cache owner. It starts independent owners, coordinates overlap deterministically, and reports only paths/markers needed for assertions.

### D4. Cleanup contract

Fixture creation follows “create root first, then publish env/cache ownership”; any later setup failure runs the same idempotent disposer. Per-lease disposal runs registered child/resource cleanup before removing files, restores globals/cwd exactly, removes only owned paths, then releases the mutex. Owner disposal waits for leases, removes the root, restores exact prior environment/cwd, unregisters catchable-signal hooks, and deletes test-owned cache state.

SIGINT/SIGTERM probes verify interruption cleanup. SIGKILL is not treated as catchable; safety under it comes from never reusing a generated root, while ordinary suite teardown and parent-side probe cleanup remove known residue.

### D5. Strict TDD evidence model

RED is a deterministic coordinated reproducer, not a probabilistic full-suite failure: two independent cached owners are started concurrently, each writes a distinct sentinel/session and waits at a barrier before scanning. Against the current fixed preload path, both bind to the same home and at least one observes contamination/removal or the homes compare equal.

GREEN requires unique owner homes, owned namespace cleanup, and the narrow session lease while retaining all existing assertions. Triangulation covers repeated concurrent probes, same-owner lease contention, clean-successor behavior, assertion/setup/spawn/cancellation/timeout cleanup, SIGINT/SIGTERM cleanup, focused ownership tests, targeted E concurrency, and three full-suite runs before refactoring.

### Boundaries

- Test preload/helper: owns process/cache-aligned home lifecycle and serialization mechanics.
- Session/runtime test files: own fixture records and behavioral assertions.
- Adjacent test files: own and restore their non-session globals; they may only consume, never redefine, the active agent home.
- Production modules: own runtime behavior and remain read-only.
- `sdd-apply`: records RED/GREEN/triangulation evidence and the exact failing/pass counts; this design does not execute tests.
- `sdd-verify`: confirms reproducibility, cleanup evidence, and the no-production/no-E diff boundary.

### Alternatives rejected

- **Per-test env swapping after import:** rejected because cached `AGENT_DIR`/`SESSIONS_DIR` would still point at the first value.
- **Cache-busting dynamic imports or global module-cache reset:** rejected because transitive static imports retain shared bindings and global resets can perturb unrelated Bun tests.
- **Unique project directories without serialization:** rejected because whole-root scanners would still observe concurrent records and alter lengths/order/limits.
- **One fixed suite-wide temp path:** rejected because concurrent Bun processes and interrupted prior runs can share residue.
- **Serializing complete files or `bun test`:** rejected as broader than the session write/scan critical section.
- **Production dependency injection/path changes:** rejected because the defect is fixture ownership, and production behavior is explicitly read-only.
- **Retries, skips, weakened counts, or excluding E:** rejected because they conceal contention rather than remove it.

## D. Success Criteria

Acceptance requires observable evidence of all of the following:

- The focused command passes with the original behavioral assertions intact:
  - `bun test tests/runtime-test-fixture-isolation.test.ts tests/sessions.test.ts tests/runtime-session-adapters.test.ts`
- Concurrency stress passes repeatedly with default Bun scheduling:
  - `for i in 1 2 3 4 5 6 7 8 9 10; do bun test tests/runtime-test-fixture-isolation.test.ts tests/sessions.test.ts tests/runtime-session-adapters.test.ts || exit 1; done`
- The targeted repository/E concurrency command passes:
  - `bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/sessions.test.ts tests/beta-launcher-e2e-hardening.test.ts`
- Cleanup probes demonstrate unique homes and exact restoration for success, assertion failure, setup/spawn failure, cancellation/timeout, SIGINT, and SIGTERM; a successor cannot observe the prior sentinel/root and no registered child remains alive.
- The following nine mapped failures are absent: the three `sessions.test.ts` cases (`ordena por mtime descendente y deriva project del cwd`, `respeta limit y excludePath`, `mantiene dedupe por project y los campos legacy`) and the six runtime adapter cases (`filters repository scope before limiting and emits opaque recency metadata`, `requires exact cwd equality for non-repository sessions`, `rejects duplicate matching opaque references`, `fails closed when more than 4,096 candidates remain outside the scan window`, `normalizes exact project boundaries and rejects invalid result limits`, `uses a deterministic path tie-breaker without reading beyond the first line`).
- The full suite passes three consecutive clean runs at repository-default concurrency:
  - `for i in 1 2 3; do bun test || exit 1; done`
- Typecheck passes:
  - `cd installer && bun run typecheck`
- Diff inspection shows no changes under production/installer surfaces, no manifest or lockfile change, and no change to `tests/beta-launcher-e2e-hardening.test.ts` assertions.

`beta-launcher-e2e-hardening` may resume **only when** all checks above are green, each of the three full-suite runs has zero failures (including zero recurrence of the mapped nine), and the no-production/no-E-diff boundary holds. E then reruns its existing focused command, regression command, installer typecheck, and full `bun test`; a remaining unrelated failure is classified separately, while any recurrence of these nine keeps E blocked on this prerequisite.
