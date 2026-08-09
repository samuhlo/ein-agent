status: ready
change: beta-launcher-e2e-hardening
phase: design

# Design — beta launcher E2E hardening

## A. Proposal

### Intent

Add reproducible launcher evidence that drives the real line-oriented workbench through a pseudo-terminal, projects disposable projects through the B authority, and crosses the C adapter and launch-plan boundaries without executing Pi or Claude. The change hardens tests and diagnostics only; it preserves the completed launcher contract.

### Problem statement

The D launcher has focused fake-boundary coverage but lacks one reproducible path through a real TTY, real project projection, and real runtime adapters with safe execution. Verification freshness, production doctor unavailability, failure diagnostics, process cleanup, and proof that the launcher leaves exact fixture state unchanged also need end-to-end evidence.

### Scope

In scope:

- A Bun-native pseudo-terminal harness that drives exact prompts, input, EOF, SIGINT, and bounded child-process completion.
- Disposable Git/OpenSpec/runtime-home fixtures with deterministic content, timestamps, executable metadata, and test-owned evidence.
- Real `projectProjectState`, `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` composition with a recording `LaunchExecutor` that never spawns a provider.
- Pi/Claude capability asymmetry, request-only creation, Pi listing, unsupported listing/resume evidence, default-no confirmation, normalized launch results, and closed exit codes.
- A current verification baseline followed by one explicit tracked-code mutation and proof that the next projection/render is stale or invalid, never current.
- Bounded doctor success/failure tests and a real entrypoint PTY case for the production no-bridge `unavailable` fallback.
- Exact before/after manifests and cleanup assertions for project, runtime-home, terminal, listeners, and child processes.

Out of scope:

- New launcher actions, runtime capabilities, resume behavior, provider execution, or production doctor delegation.
- Installer, updater, release, package/bin, Docker, network, or external-provider work.
- Persistence, session indexes, transcripts/history, caches, selection memory, or a second project-state store.
- Production UI dependencies, universal PTY certification, or post-beta behavior.

### Affected areas

- `tests/beta-launcher-e2e-hardening.test.ts` — PTY controller, fixture lifecycle, scenario assertions, exact-state manifests, timeouts, and focused integration cases.
- `tests/fixtures/beta-launcher-e2e-driver.ts` — test-only child entrypoint that binds real launcher/project/adapter seams to actual terminal I/O and a safe recording executor.
- `tests/minimal-workbench-launcher.test.ts`, `tests/shared-project-state.test.ts`, and `tests/runtime-session-adapters.test.ts` — unchanged regression authorities.
- `ein-pi/workbench.ts` and `ein-pi/agent/lib/{workbench,project-state,runtime-session-adapters}.ts` — read-only production dependencies.

No package or production-source change is planned. A production edit is not an acceptable shortcut for a harness limitation.

### Canonical spec context

`scope.md` declares `spec_delta: none` and records no canonical `openspec/specs/<domain>/spec.md` reference. `map.md` adds no mapped domain spec, so the design reads no domain spec and does not reconstruct one from archived changes.

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| None selected | n/a | 0 |

Selection total: 0 files and 0 bytes, within the 3-file/32 KiB limit.

### Risks

- PTY scheduling can make tests flaky if input uses sleeps instead of prompt synchronization.
- A fixture could accidentally reach the default executor or a real provider executable.
- Git/OpenSpec fixture setup can produce false freshness evidence if the report is not bound to the exact pre-mutation `stateRef`.
- Failed scenarios can leak terminal handles, signal listeners, child processes, or temporary data.
- Full filesystem snapshots can become noisy if test evidence is written inside the project or runtime fixture.

### Rollback

Delete the two new test-owned files. No production behavior, dependency, schema, package surface, or persistent data requires rollback. Temporary roots are always removed in fixture teardown; a failed run may be cleaned by deleting its uniquely prefixed directory under the system temporary directory.

### Success criteria

The focused E2E command completes without hangs, no Pi/Claude executable starts, every child is reaped, and all temporary roots are removed. Transcripts and sidecar evidence prove real B/C wiring, closed exit codes, privacy-safe diagnostics, stale verification after the sole allowed mutation, bounded doctor behavior, and byte-exact fixture preservation outside that mutation.

## B. Spec

### Requirement 1 — Reproducible TTY flow

The test harness **MUST** run the repository-local workbench entrypoint in a real Bun pseudo-terminal, wait for exact prompts before sending input, and bound every prompt and process wait with deterministic timeouts. It **MUST** cover project selection and confirmation, Pi and Claude selection, a supported action, default-no launch confirmation, normal exit, EOF, SIGINT/abort, invalid input, and exit codes `0`, `1`, `2`, and `130` without relying only on `stdinTTY: true`.

**Scenario:** Given a disposable usable project and a PTY child, when the harness confirms the project, chooses each runtime, performs a bounded action, and exits or cancels, then the transcript contains the stable plain-text prompts and status, the expected closed exit code is returned before the deadline, and no process remains alive.

### Requirement 2 — Real adapter boundary and safe execution

The launcher E2E **MUST** use `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` rather than copied adapter behavior. Only the validated adapter plan **MUST** reach a test-owned `LaunchExecutor`; that executor **MUST** record the confirmed binding, fixed provider executable, empty `argv`, isolated provider environment, `shell: false`, and signal, then return a configured exit, signal, throw, or cancellation result without resolving or spawning Pi or Claude.

The evidence **MUST** preserve Pi/Claude capability asymmetry, request-only create behavior, Pi listing, Claude unsupported listing, unsupported resume, plan rejection, and normalized success/unavailable/error/cancelled outcomes. Operations that are not exposed by the D menu **MUST** be checked at the real adapter boundary and **MUST NOT** be added to the menu for test convenience.

**Scenario:** Given fixed test executables named for Pi and Claude and a recording executor, when a confirmed create request is launched through the real workbench and C plan/execution functions, then exactly one validated provider plan reaches the executor, the normalized result and exit code match the fixture outcome, and no provider process is created.

### Requirement 3 — Project/OpenSpec state and freshness invalidation

The E2E fixture **MUST** use `projectProjectState` as the only project authority and **MUST** expose canonical OpenSpec selection, phase, next action, incomplete/unavailable source quality, Git identity, and verification status through existing workbench rendering. A verification pass **MUST** bind to the exact clean baseline `git.stateRef`; after one explicit tracked-code mutation, a new run **MUST** render that evidence as `stale` or `invalid` with a non-current effective result.

Each launcher run **MUST** project each candidate once, retain the confirmed snapshot for the run, and avoid any launch-triggered reprojection or verification refresh. The test **MUST NOT** create a project-state store or rewrite verification evidence.

**Scenario:** Given a clean fixture whose pass report binds to baseline state reference R0, when the harness first observes current verification, changes only the designated tracked source file, and starts a second run, then the new projection has R1 different from R0, renders prior evidence as non-current, records one projection for the confirmed candidate, and launch leaves the stale snapshot and report unchanged.

### Requirement 4 — Bounded doctor behavior

The workbench doctor path **MUST** delegate at most once per selected action, render at most ten sanitized check rows, and return control to the same action menu after success, unavailable, cancelled, or thrown failure. The production entrypoint’s absent callable bridge **MUST** render the existing actionable `unavailable` message and **MUST NOT** fabricate checks or expose raw errors and paths.

**Scenario:** Given both a bounded fixture delegate and the actual production no-bridge wiring, when Doctor succeeds, throws a private-path error, or is unavailable, then output remains compact and sanitized, the menu returns without termination, and neither provider nor installer code executes.

### Requirement 5 — Failure diagnostics and privacy

The E2E suite **MUST** cover unavailable candidates, invalid selections, adapter unavailable/error/cancelled results, rejected/unavailable plans, fixture-executor nonzero exit/signal/throw/cancel, EOF, and SIGINT. Output **MUST** state the normalized failure meaning and closed exit code while omitting absolute fixture roots, opaque session references, executable paths, transcripts, exception text, ANSI cursor controls, and provider output.

**Scenario:** Given deterministic private markers in project paths, session metadata, executor exceptions, and doctor failures, when each failure crosses the TTY flow, then the transcript contains only existing normalized labels and actionable fallback text, returns the expected `1`, `2`, or `130`, and contains none of the private markers.

### Requirement 6 — Exact ownership and cleanup evidence

The harness **MUST** hash a canonical manifest of project and isolated runtime-home entries before and after every scenario, including file bytes, modes, symlink targets, and Git state. Manifests **MUST** match exactly except for the named freshness source mutation; test protocol/evidence files **MUST** live in a separate harness root.

The harness **MUST** close the PTY, remove signal/abort listeners, terminate and await a timed-out child, verify the PID is no longer live, and recursively remove every temporary root in `finally`. No launcher-owned installer, updater, project/session store, transcript, cache, history, or persisted selection artifact **MAY** appear.

**Scenario:** Given canary files in all forbidden ownership locations and a separate evidence directory, when success, failure, EOF, SIGINT, and timeout cleanup paths complete, then project/runtime manifests are byte-identical outside the one whitelisted source mutation, canaries are unchanged, forbidden artifacts are absent, all child PIDs are reaped, and temporary roots are deleted.

### Requirement 7 — Strict TDD evidence

Implementation **MUST** proceed through observable RED, GREEN, TRIANGULATE, and REFACTOR cycles at the PTY/session, real adapter/executor, freshness, doctor, and cleanup seams. RED evidence **MUST** demonstrate the missing E2E guarantee rather than alter production behavior; GREEN **MUST** add only test infrastructure or fixtures; triangulation **MUST** vary both providers and success/failure/cancel outcomes.

**Scenario:** Given the new focused test command, when each seam is introduced under strict TDD, then recorded phase evidence shows a failing behavioral assertion first, the smallest test-only change that passes it, provider/failure triangulation, and a final refactor run with production launcher files unchanged.

## C. Decisions

### 1. Use Bun’s native pseudo-terminal and a test-only child driver

`tests/beta-launcher-e2e-hardening.test.ts` owns a small PTY session abstraction over `Bun.Terminal`: `waitForPrompt`, `writeLine`, `sendEOF`, `sendSIGINT`, `waitForExit`, and `dispose`. It launches Bun directly with an argv array and never a shell. The driver uses actual readline input/output and calls `runWorkbenchEntrypoint`, so TTY evidence is stronger than passing boolean TTY flags in-process.

A separate child driver earns its place because a real PTY requires a subprocess and safe launch injection cannot use production `Bun.spawn`. It contains no launcher decisions; it only assembles existing authorities, terminal I/O, scenario data, and test evidence.

### 2. Synchronize on prompts, never timing guesses

The PTY controller accumulates bytes, normalizes terminal echo and CRLF only for comparison, and sends the next input after an exact expected prompt appears. Each wait has a short per-step deadline and each scenario has a hard overall deadline. Teardown closes input first, escalates to termination on timeout, awaits exit, closes the terminal, and then removes fixtures.

Rejected alternative: piped stdin with `stdinTTY: true`. It repeats D’s fake seam and cannot prove terminal behavior. Rejected alternative: sleeps or blind scripted input. It is race-prone and weakens failure diagnostics. Rejected alternative: a new PTY package or production TUI framework. Bun already supplies the bounded test primitive.

### 3. Keep adapter and executor ownership explicit

The driver composes the real adapter factory and launch functions. The plan builder receives a test-only executable resolver and isolated `HOME`/`PATH`; executable fixture files use fixed names and modes but are never run. The recording executor is the only execution dependency and writes structured JSON evidence outside the project/runtime roots before returning its configured normalized fixture result.

The parent test validates both the adapter-produced plan and the executor input. It asserts exact project binding, executable, environment, empty arguments, and `shell: false`; an executor-call count of zero proves default-no and rejected-plan paths. No mock may replace `buildLaunchPlan` or `executeLaunchPlan` in the critical launch cases.

Rejected alternative: invoking the production provider executor. It violates scope and safety. Rejected alternative: copying C validation into the fixture. It can drift and would test the copy. Rejected alternative: adding resume/list actions to Claude’s menu. Existing capability boundaries own that behavior.

### 4. Separate project state, runtime state, and harness evidence

Each scenario receives three unique temporary roots: project, isolated runtime home, and harness control/evidence. Fixture creation uses fixed content and timestamps, initializes local Git identity, creates canonical OpenSpec artifacts, and binds the ignored verification report to the projector’s exact clean state reference. Pi session metadata is deterministic and private canaries are pre-created.

Canonical manifests sort normalized relative paths and hash type, mode, file bytes, and symlink target. They include Git metadata and a projector-derived Git `stateRef`. The freshness test compares three points: pristine baseline, the one named code mutation, and post-launch state; only the baseline-to-mutation delta is allowed.

Rejected alternative: snapshots of selected files or `git status` alone. They cannot prove absence of launcher-owned stores or runtime-history writes. Rejected alternative: evidence inside the project. It would contaminate freshness and ownership results.

### 5. Test the actual production doctor fallback without adding a bridge

A non-launch PTY scenario invokes `ein-pi/workbench.ts` directly against the disposable project, chooses Doctor, verifies the existing `unavailable` text, and exits. Because the scenario never confirms launch, the production executor remains unreachable. Separate fixture-driver cases cover bounded successful checks and thrown/cancelled delegates.

Rejected alternative: export or replace `productionDependencies` for the test. The direct safe doctor scenario already proves the current wiring and avoids a production API change. Rejected alternative: implement doctor checks in the launcher. Doctor ownership remains external.

### 6. Strict TDD seams and boundaries

The RED/GREEN seam order is behavioral rather than file-oriented:

- PTY transcript and timeout/cleanup contract.
- Real projector plus real adapter request-only/list/capability behavior.
- Real plan builder/executor handoff with a zero-call safety sentinel.
- Exact current-to-stale verification transition and one-projection invariant.
- Production unavailable doctor and fixture doctor normalization.
- Failure/exit/privacy matrix and exact-state teardown.

Tests may introduce only the harness and driver needed for GREEN. Existing D focused tests remain the authority for pure rendering/menu branches; B/C suites remain the authority for internal projector and adapter permutations. E tests cover cross-boundary behavior and do not duplicate those suites.

### 7. Responsibility boundaries

| Responsibility | Owner |
|---|---|
| Selection, confirmation, menus, snapshot retention, rendering, exit classification | Existing D workbench |
| TTY parsing, prompt synchronization, deadlines, process reaping | New E test harness |
| Project/OpenSpec/Git/verification projection | Existing B projector |
| Capabilities, requests, binding validation, plans, result normalization | Existing C adapters |
| Deterministic process outcome without provider spawn | New E fixture executor |
| Doctor result production | Injected fixture delegate or existing production unavailable fallback |
| Exact-state manifests and allowed-mutation comparison | New E test harness |
| Installer/updater/provider/persistence behavior | Outside E |

## D. Success Criteria

The change is acceptable when all of the following observable checks hold:

- A real pseudo-terminal transcript proves exact project confirmation, both runtime capability displays, bounded actions, default-no launch, EOF/SIGINT handling, stable plain text, and exit codes `0`, `1`, `2`, and `130` without hangs.
- Critical launch cases cross the real adapter, plan, and execution functions; sidecar evidence proves only a valid fixed plan reaches the safe executor and no Pi/Claude process starts.
- Real disposable Pi metadata lists only bounded UTC recency; Claude list and both resume operations remain unsupported at the C boundary; create remains request-only and non-persistent.
- A clean bound pass renders `freshness=current`; after the sole tracked-source mutation, a new projection has a different state reference and renders stale/invalid non-current evidence. Launch does not re-project or rewrite the report.
- Fixture doctor success is capped at ten sanitized rows, failure/cancellation returns to the menu, and the actual production entrypoint renders its current actionable unavailable fallback.
- Failure transcripts contain normalized meanings but no fixture root, opaque reference, executable path, transcript, exception detail, provider output, or terminal control sequence.
- Project and runtime-home manifests remain exact for every scenario, except the named freshness mutation; forbidden stores/history/cache/installer artifacts never appear.
- Every PTY and child process closes on success, EOF, SIGINT, failure, and timeout; teardown removes all temporary roots.
- Production launcher, projector, and adapter files remain unchanged.

Required verification commands once implementation reaches the apply/verify phases:

```bash
bun test tests/beta-launcher-e2e-hardening.test.ts
bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/beta-launcher-e2e-hardening.test.ts
cd installer && bun run typecheck
```

The installer typecheck is the only repository-configured typecheck and does not substitute for the focused launcher tests. No build, test, typecheck, provider, installer E2E, Docker, or network command runs during this design phase.
