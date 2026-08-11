# OpenTUI + SolidJS Spike Plan

## Decision Summary

Run a packaging-first, independently reversible spike. Use OpenTUI and SolidJS only for the interactive TTY path, preserve the current plain renderer for non-TTY output and `--once`, and make no migration decision until packaged Pi and Claude artifacts pass on all four supported targets.

This is a spike, not a rewrite. EIN already has the product boundaries that must remain authoritative: project state, settings, sessions, runtime adapters, update probes, and model/effect behavior. OpenTUI is being evaluated only as a replacement for interactive presentation, input, layout, repainting, and terminal ownership.

The first question is distribution, not UI quality. Current Pi and Claude payloads stage repository-relative TypeScript source closures and compile `ein` on the consumer machine without external packages or `node_modules`. OpenTUI adds native and package-resolution requirements that this model does not currently satisfy. The primary packaging hypothesis is therefore a precompiled, target-specific terminal application binary; shipping or installing dependencies is only a comparison hypothesis.

No production migration is authorized by this plan.

## Spike Baseline

### OpenTUI assumptions to verify at spike start

| Area | Spike-time assumption |
|---|---|
| Packages | Pin `@opentui/core@0.5.1`, `@opentui/solid@0.5.1`, and `solid-js@1.9.12` for reproducibility. Reconfirm these versions immediately before implementation; they are observed candidates, not timeless recommendations. |
| Version alignment | Keep `@opentui/core`, `@opentui/solid`, and the selected target-specific native package on aligned compatible versions. Record the resolved lockfile inventory. |
| Runtime | OpenTUI supports Bun. Reconfirm the selected packages' Bun engine requirement against EIN's build and consumer runtime before installing anything. |
| TypeScript | The Solid entrypoint requires `jsx: "preserve"` and `jsxImportSource: "@opentui/solid"`. Scope this configuration to the spike build path rather than changing unrelated TypeScript compilation. |
| Renderer lifecycle | Create the interactive renderer with `createCliRenderer`. Choose main-screen versus alternate-screen behavior deliberately; the spike should use alternate-screen ownership for the dashboard while leaving static output on the main screen. |
| Resize | Subscribe to renderer resize events and prove responsive layout at fixed narrow and wide dimensions. |
| Cleanup | Destroy the renderer on every owned exit path. OpenTUI destruction restores terminal state, and the Solid root is expected to dispose with renderer destruction. Verify rather than assume this behavior. |
| Tests | Use `testRender` with fixed width and height for deterministic Solid rendering and interaction tests. |
| Native toolchain | Normal consumers should receive published native packages and should not need Zig. Zig is relevant only when building OpenTUI itself or when a target lacks a usable prebuilt package; either case is a packaging exception, not an accepted consumer prerequisite. |

Primary references: [OpenTUI Solid README](https://github.com/anomalyco/opentui/blob/main/packages/solid/README.md), [renderer lifecycle](https://github.com/anomalyco/opentui/blob/main/packages/web/src/content/docs/core-concepts/lifecycle.mdx), [layout and resize](https://github.com/anomalyco/opentui/blob/main/packages/web/src/content/docs/core-concepts/layout.mdx), and [`@opentui/core` package inventory](https://github.com/anomalyco/opentui/blob/main/packages/core/package.json).

## Hypotheses And Unknowns

### Hypotheses

- A target-specific compiled `ein` binary can embed or reliably resolve the matching published OpenTUI native package without install-time networking or Zig.
- Solid/OpenTUI can consume the existing model and effects without moving product rules into components.
- OpenTUI can improve interactive layout, focus, input, resize behavior, and testability while preserving runtime handoff and terminal cleanup.
- The legacy renderer can remain the complete static-output implementation, avoiding regressions in pipes, `NO_COLOR`, non-TTY execution, and `--once`.

### Explicit unknowns

- Whether `bun build --compile` includes the OpenTUI native artifact correctly for every cross-compiled target.
- Whether one build host can produce trustworthy artifacts for all targets or each target requires a native runner/build job.
- Whether OpenTUI's published prebuilt matrix exactly covers EIN's four glibc/macOS targets and deployment minimums.
- Whether Pi and Claude installation/sync can select and install a precompiled terminal binary without weakening current manifest, checksum, ownership, and rollback guarantees.
- Whether compiled binaries, vendored dependencies, or dependency installation produce the smallest controlled package and simplest update path.
- Whether OpenTUI terminal ownership remains correct across normal exit, Ctrl+C, exceptions, unavailable runtimes, runtime return, resize, and command handoff.
- Whether the interactive value justifies the measured startup and distribution cost.

Unknowns must be answered with package inventories, commands, measurements, and target-specific results. A repository-only demo is insufficient.

## Scope

- Prove native dependency resolution and packaging before integrating the application.
- Extract a renderer/controller seam without changing current behavior.
- Implement one representative interactive dashboard vertical slice for TTY only.
- Exercise keyboard navigation, resize, Pi/Claude launch handoff, cleanup, and deterministic rendering.
- Build and inspect both Pi and Claude distribution surfaces for macOS ARM64, macOS x64, Linux ARM64, and Linux x64.
- Compare candidate and baseline startup latency, compressed artifact size, installed size, package inventory, tests, and maintained complexity.
- Produce a decision report recommending retain, continue by vertical slices, or stop.

## Non-Goals

- Rewriting project state, settings, session discovery, runtime adapters, update probes, model transitions, or effects.
- Replacing the legacy renderer for non-TTY output or `--once`.
- Migrating every view, changing product behavior, or redesigning the information architecture.
- Making Solid components read disk, perform update probes, spawn commands, or launch runtimes.
- Requiring Zig, a package manager, `node_modules`, or uncontrolled network access on consumer machines.
- Changing installer ownership, release policy, supported targets, or runtime authority.
- Selecting OpenTUI for production before packaged evidence exists.

## Architecture Boundary

| Concern | Action | Current seam | Spike seam and invariant |
|---|---|---|---|
| Project state | Keep | `projectProjectState` and `ProjectStateV1` in `ein-pi/agent/lib/project-state.ts` | Controller reads the existing projection. Components receive view data only and never infer project truth. |
| Settings | Keep | `readSettings` / `applySetting` in `ein-pi/agent/lib/project-settings.ts`; injected through `TerminalAppOptions.settings` | Effects continue to call the existing adapter and re-read persisted state after writes. |
| Sessions | Keep | `collectRuntimeSessions` in `ein-pi/agent/lib/runtime-sessions.ts`; runtime normalization in `runtime-session-adapters.ts` | Components receive normalized session rows and opaque references only. |
| Runtime create/resume | Keep | `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan` in `runtime-session-adapters.ts`; `productionLaunch` at the surface edge | Controller retains launch effects and outcomes. UI never constructs commands or resolves private session IDs. |
| Update probes/system facts | Keep | `startUpdateEvidenceSnapshot` and probe functions in `ein-pi/agent/lib/update-probes.ts`; `systemComponentsFrom` at the surface | Probes remain non-blocking edge work. Components render declared observations only. |
| Model and effects | Keep/adapt | `AppModel`, `AppEffect`, `initialModel`, `handleKey`, and view builders in `ein-pi/agent/lib/terminal-app.ts` | Preserve transition and effect semantics. Adapt OpenTUI key events into the existing input vocabulary; do not duplicate behavior in JSX handlers. |
| Plain rendering | Keep | `renderApp` in `ein-pi/agent/lib/terminal-app.ts` | Remains authoritative whenever `--once`, non-TTY, or no interactive input applies. Existing static snapshots are regression contracts. |
| Driver/controller | Extract | `runTerminalApp` in `ein-pi/agent/surfaces/terminal-app-entrypoint.ts` currently owns data reads, model mutation, effects, rendering, and terminal handoff | Separate controller state/effect execution from presentation. Both renderers consume the same controller; only the interactive renderer subscribes to updates. |
| Interactive presentation | Replace in spike | `paint`, manual clearing, and `renderApp` calls inside the interactive branch | Solid components render one dashboard view through `@opentui/solid`. No source-of-truth logic enters components. |
| Input and resize | Replace in spike | `TerminalAppIO.onKey`, `setRawMode`, `setAltScreen`, `onResize` | OpenTUI owns interactive input, screen mode, and resize events. Input is translated into controller actions. |
| Terminal handoff/cleanup | Adapt | `own`, `restore`, `handOver`, and `resume` in `runTerminalApp` | One lifecycle adapter destroys/releases OpenTUI before child handoff and recreates/resumes only when the current outcome requires it. Cleanup is idempotent. |
| Entrypoint routing | Adapt | `ein-pi/agent/app.ts` invokes `runTerminalApp` | Route `--once` or non-TTY to the legacy renderer; route eligible TTY sessions to the spike renderer behind one removable selection point. |
| Pi packaging | Adapt only after proof | `bundle-template.ts` stages `app.ts`, `lib/`, and `surfaces/`; `promoteCommandNames` compiles `app.ts` on the consumer | Compare the current source-compile flow with selecting a precompiled target binary. Preserve atomic promotion and rollback. |
| Claude packaging | Adapt only after proof | `bundle-cc-ein.ts` follows relative imports from `CC_EIN_PAYLOAD_SOURCE_ENTRIES`; `cc-ein/sync.ts` compiles staged entrypoints | Add no dependency assumption until Work Package 0 proves it. Candidate binary selection must work without an adjacent checkout or `node_modules`. |

## Ordered Work Packages

Complete packages in order. Each package has its own evidence and rollback boundary; failure stops later packages.

### 0. Dependency And Native Packaging Proof

**Goal:** prove a controlled OpenTUI/Solid artifact can be built, selected, shipped, and started on every supported target through both Pi and Claude surfaces.

**Progress:** implementation and evidence are available at [`spikes/opentui-solid-packaging/`](../spikes/opentui-solid-packaging/). Status is **pass**: workflow run `31509930916`, attempt 2, produced verified native artifacts for all eight Pi/Claude-by-target runtime cells. The linux-arm64 job conclusion field remains stale despite terminal run success and complete successful steps; its PASS is based on the validated uploaded native artifact, not that stale field. Baseline startup and size deltas remain Work Package 3 follow-up.

**Implementation outline**

- Reconfirm package versions and Bun compatibility, then pin the three direct packages for the spike. Record all transitive and target-native packages.
- Build a minimal renderer lifecycle probe using `createCliRenderer`, render, resize observation, and destroy. It must contain no EIN product code.
- Test the primary hypothesis: produce one target-specific terminal binary for each existing `BUILD_TARGETS` entry: `darwin-arm64`, `darwin-x64`, `linux-arm64`, and `linux-x64`.
- Prove the matching published OpenTUI native package is present and that no runtime download, `node_modules`, or Zig installation is required.
- Stage each candidate through both the Pi template path and Claude payload/sync path. Verify target selection, checksums, executable mode, atomic replacement, and uninstall/update inventory behavior.
- Compare against one documented alternative: shipping the pinned package/native files and resolving them at runtime or install time. An alternative may use already-shipped files but must not rely on uncontrolled install-time networking.
- Capture archive contents and installed-file inventories for all eight surface/target combinations.

**Evidence and gate**

- [ ] Eight package cells start the lifecycle probe on their intended target.
- [ ] No cell performs an install-time network request or requires Zig.
- [ ] Every native artifact has a declared source package, version, target, and checksum.
- [ ] Pi and Claude update/rollback ownership remains explicit and atomic.
- [ ] Primary and comparison hypotheses have measured compressed and installed sizes.

**Rollback:** remove the isolated probe, spike-only package pins/build path, candidate binaries, and packaging selection branch. Existing source payloads and consumer compilation remain unchanged.

### 1. Renderer/Controller Seam Extraction

**Goal:** separate controller state and effect execution from painting while preserving all existing output and behavior.

**Progress:** implementation and evidence are available at [`spikes/opentui-solid-packaging/evidence-wp1/`](../spikes/opentui-solid-packaging/evidence-wp1/). The renderer-neutral controller now backs both legacy static and interactive paths; OpenTUI/Solid remain isolated to WP0, and Work Package 2 has not started.

**Implementation outline**

- Move model ownership, view refresh, setting application, launch/run effects, and status outcomes behind a controller contract that accepts normalized keys/actions and publishes immutable model snapshots.
- Keep state/settings/session/runtime/update dependencies injected through the existing `TerminalAppOptions` seams.
- Keep terminal ownership and rendering outside the controller.
- Route the current interactive renderer through the controller before adding Solid.
- Preserve the exact branch: `--once || !isTTY || no interactive input` uses the plain renderer once and exits.

**Evidence and gate**

- [ ] Existing terminal app unit and driver tests pass without changed behavioral expectations.
- [ ] Static and `--once` golden output is byte-for-byte unchanged at representative dimensions with color disabled.
- [ ] Existing keyboard, setting, refresh, command confirmation, Pi/Claude launch, and unavailable-runtime outcomes remain covered.
- [ ] The extraction can be reverted without touching domain/runtime modules.

**Rollback:** revert only the controller extraction and restore the current `runTerminalApp` orchestration; no package or payload format changes are required.

### 2. Interactive Dashboard Vertical Slice

**Goal:** render one representative dashboard with Solid/OpenTUI on eligible TTYs while all other execution modes remain on the legacy path.

**Implementation outline**

- Add a Solid entrypoint with scoped TSX settings: `jsx: "preserve"` and `jsxImportSource: "@opentui/solid"`.
- Create the renderer with `createCliRenderer` and use alternate-screen ownership only for interactive mode.
- Render dashboard summary, navigation rows, cursor/focus, status, and one launch action from controller snapshots.
- Translate OpenTUI keyboard events into the existing key/action semantics, including arrows, `j`/`k`, `q`, Enter, and Ctrl+C.
- Subscribe to resize events and prove narrow/wide layout behavior.
- Destroy the renderer before Pi, Claude, or command handoff; recreate/resubscribe only when an unavailable runtime returns control to EIN.
- Use `testRender` at fixed dimensions for render and interaction assertions.

**Evidence and gate**

- [ ] Interactive TTY uses OpenTUI; non-TTY and `--once` demonstrably do not load or initialize it.
- [ ] Keyboard and resize behavior match the acceptance matrix.
- [ ] All cleanup paths restore raw mode, cursor/screen state, listeners, and the main terminal screen.
- [ ] Components contain presentation and event translation only; product reads/effects remain in the controller and existing adapters.

**Rollback:** remove the TTY renderer selection and Solid entrypoint. The controller-backed legacy renderer remains a complete application.

### 3. Packaged Acceptance And Decision Report

**Goal:** test the real packaged application, compare it with the released baseline, and make an evidence-backed migration decision.

**Implementation outline**

- Produce Pi and Claude candidate packages for all four targets using the proven Work Package 0 strategy.
- Run the complete acceptance matrix from installed/staged payloads, not repository paths.
- Record package inventories, checksums, startup samples, compressed artifact sizes, installed sizes, cleanup stress results, and operator observations.
- Compare maintained complexity: dependency/build paths, lifecycle code, tests, and renderer-specific code removed or added.
- Publish one decision: **stop and retain legacy**, **continue with another bounded slice**, or **propose migration**. Continuing still requires a separate approved implementation plan.

**Evidence and gate**

- [ ] Every mandatory matrix cell passes or has a documented stop decision.
- [ ] Measurements use the same host class, command, fixtures, warmup, sample count, and calculation for baseline and candidate.
- [ ] The report identifies the exact packaging strategy and rejects alternatives with evidence.
- [ ] No migration code is merged merely because the spike UI works locally.

**Rollback:** discard candidate release artifacts and remove the TTY selection point. Published/current source payload behavior remains the baseline.

## Acceptance Matrix

Run functional checks on packaged Pi and Claude installations. Run target checks on native or equivalent controlled runners for each target; cross-compilation success alone is not acceptance.

| Area | Required scenarios | Pass evidence |
|---|---|---|
| TTY routing | Interactive TTY with and without intro | OpenTUI starts only in the eligible interactive branch; dashboard is usable and exits 0. |
| Static/no-color | Pipe, redirected output, `--once`, `NO_COLOR`, narrow dimensions | Legacy renderer output remains stable; no raw mode, alternate-screen, cursor-control, or color escapes leak. |
| Resize | Fixed 40x10 and 100x40 tests plus live narrow/wide resize | `testRender` is deterministic; live layout updates without stale content, crash, or input loss. |
| Keyboard | Arrows, `j`/`k`, Enter, `q`, Ctrl+C, confirmation cancellation | Existing model/effect outcomes are preserved and each key is consumed once. |
| Pi handoff | Create and resume; unavailable runtime; runtime exit | Renderer is destroyed before launch. Terminal is clean; unavailable returns to EIN, successful child exit follows current outcome semantics. |
| Claude handoff | Create and resume; unavailable runtime; runtime exit | Same guarantees as Pi, using existing opaque session references and launch-plan guards. |
| Command handoff | Doctor/update-style declared command, success and failure | No stale renderer remains; command inherits a normal terminal; EIN follows current exit semantics. |
| Cleanup | Normal quit, Ctrl+C, thrown render/effect error, failed launch, 100 start/quit cycles | Zero observed terminal-state leaks; listeners and Solid roots do not accumulate. SIGKILL is excluded because no process can run cleanup after it. |
| Package inventory | Pi and Claude archives plus installed trees | Every file is declared and checksummed; no undeclared `node_modules`, source-checkout fallback, runtime download, or Zig dependency. |
| Targets | macOS ARM64, macOS x64, Linux ARM64, Linux x64 | All eight surface/target cells install, start, hand off, clean up, update, and roll back from packaged artifacts. |
| Startup latency | Baseline and candidate static start plus interactive first usable frame | On each target: 5 warmups and 30 measured runs; report median and p95 with identical fixtures and network probes controlled. |
| Size delta | Compressed Pi/Claude artifact and installed terminal application | Report absolute and percentage deltas per target, separated into JS/package/native/binary contributions where inspectable. |

### Surface/target package grid

| Surface | macOS ARM64 | macOS x64 | Linux ARM64 | Linux x64 |
|---|---:|---:|---:|---:|
| Pi template/install | Required | Required | Required | Required |
| Claude payload/sync | Required | Required | Required | Required |

## Stop/Go Thresholds

These are practical initial thresholds and **reviewable assumptions**. Confirm or revise them before Work Package 0; do not relax them after seeing results without recording the reason.

### Mandatory stop conditions

Stop the spike and retain the legacy renderer if any of these remains true after a bounded fix attempt within the current work package:

- Packaging requires uncontrolled install-time networking, an undeclared package manager operation, or Zig on an ordinary supported consumer target.
- Any supported Pi/Claude-by-target package cell cannot select, verify, start, update, and roll back its native artifact.
- Non-TTY, `NO_COLOR`, or `--once` behavior regresses from the legacy renderer contract.
- Terminal cleanup is unreliable: any terminal-state leak occurs in 100 normal/Ctrl+C/error/handoff cycles after the cause is addressed.
- Runtime or command handoff bypasses existing launch-plan guards or leaves OpenTUI owning the terminal.
- Product rules or source-of-truth reads must move into Solid components to make the slice work.

### Initial measured thresholds

| Metric | Go threshold | Review rule |
|---|---|---|
| Static startup | Candidate p95 is no more than baseline p95 + 25 ms | Static mode should not initialize OpenTUI. Any larger regression is a stop until explained and removed. |
| Interactive startup | Candidate first-usable-frame p95 is no more than baseline p95 + 100 ms and no more than 500 ms absolute | A breach is a stop unless the decision report demonstrates a compelling, user-visible benefit and reviewers explicitly accept the cost. |
| Installed size | Target-specific installed `ein` delta is at most 15 MiB per target | A breach requires attribution by package/native/binary component and explicit benefit acceptance; otherwise stop. |
| Release size | Compressed Pi and Claude payload delta is at most 10 MiB each and at most 25% over baseline | Both bounds apply. A breach without compelling benefit is a stop. |
| Cleanup | 0 failures in 100 lifecycle cycles per tested surface/target class | Any reproducible leak is a stop; averages are not acceptable. |
| Packaging | 8/8 surface/target cells pass with controlled offline installation | No partial platform migration in this spike. |
| Static compatibility | 100% of existing static/`--once` snapshots and driver assertions pass unchanged | Intentional static redesign is outside scope and cannot waive this threshold. |

### Go decision

Recommend another bounded migration slice only when all mandatory thresholds pass and the report shows a concrete improvement in at least two of these areas: interactive layout maintainability, focus/input correctness, resize behavior, deterministic UI testing, or visual capability. Passing packaging alone is necessary but not sufficient.

## Risks And Rollback

| Risk | Control | Rollback boundary |
|---|---|---|
| Native binary omitted or mismatched during cross-compile | Target inventory, checksum, offline startup, and native runner tests in Work Package 0 | Remove target binary selection; retain source payload and consumer compile. |
| Package versions drift independently | Exact spike pins and resolved inventory; align OpenTUI core/Solid/native versions | Delete spike dependency path; no domain code depends on it. |
| Installer/payload complexity expands | Prefer one precompiled artifact per existing target; compare alternatives before integration | Revert packaging adapter only; current manifests and source closures remain authoritative. |
| Static output accidentally enters OpenTUI | Branch before renderer initialization and assert module/lifecycle absence | Route all modes back to legacy renderer. |
| Double ownership corrupts terminal state | Single idempotent lifecycle adapter; destroy before every handoff | Remove OpenTUI TTY selection; controller and legacy renderer remain. |
| Solid components absorb product behavior | Keep model/effects and injected adapters outside JSX; review imports and effects | Delete components without changing product modules. |
| Resize or event subscriptions leak | Fixed-dimension tests, lifecycle stress test, listener/root accounting | Remove interactive renderer and retain extracted controller. |
| Startup or size cost outweighs benefit | Measure from installed artifacts against the same baseline and fixtures | Stop after report; publish no migration artifacts. |

## Deliverables

- [ ] Work Package 0 packaging proof with package/native inventories, checksums, commands, and the eight-cell result grid.
- [ ] Primary versus comparison packaging analysis with a selected strategy or stop decision.
- [ ] Renderer/controller contract and unchanged legacy behavior evidence.
- [ ] One TTY-only Solid/OpenTUI dashboard slice with fixed-dimension tests.
- [ ] Packaged Pi and Claude acceptance results for all four targets.
- [ ] Baseline/candidate startup and size measurements with raw samples or machine-readable summaries.
- [ ] Cleanup and runtime/command handoff stress evidence.
- [ ] Final decision report: retain, continue by bounded slice, or propose migration.
- [ ] Exact rollback instructions for every changed package/build/UI seam.

## Next Recommended Action

Review and approve this plan's Work Package 0 package grid and reviewable thresholds. After approval, begin only the isolated dependency/native packaging proof; do not extract the controller or build the dashboard until all eight packaging cells have a credible offline path.
