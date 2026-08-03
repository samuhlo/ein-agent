# Tasks — add-installer-runtime-menu

status: ready
blocked_by: none

## // 001. Pi path context and migration seam

- [x] 1.1 Add an explicit Pi install path/context contract that derives legacy and isolated locations from the active home, validates the EIN marker, runs legacy migration before final resolution, and prevents deployment after migration failure.
  - skills: `architecture`, `ein-discipline`
  - why: Prevent stale import-time `AGENT_DIR` use and preserve vanilla `~/.pi/agent` directories.
  - learn: Resolve mutable filesystem state before constructing path-sensitive dependencies.
  - architecture: `install.ts` owns migration gating; a narrow core path/context seam owns final Pi directory identity.
  - avoid: Mutating global `AGENT_DIR` or migrating first and continuing with stale imports.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "legacy|Pi path|migration"` and `cd installer && bun run typecheck`

- [x] 1.2 Thread the resolved Pi context through existing snapshot, deployment, marker, package, rollback, and doctor calls without changing their established behavior.
  - skills: `architecture`, `ein-discipline`
  - why: Ensure every Pi operation uses one isolated target after migration.
  - learn: Context injection is safer than hidden global path resolution when a lifecycle can move state.
  - architecture: The Pi runner owns the context; existing core operations remain responsible for their own domain behavior.
  - avoid: Broadly redesigning backup, deploy, version, or doctor subsystems.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "isolated|Pi"` and `cd installer && bun run typecheck`

## // 002. EIN Fish launcher helper

- [x] 2.1 Add a small launcher-install helper for explicit home/destination inputs that creates `~/.config/fish/functions`, writes only the named EIN launcher, and is idempotent.
  - skills: `architecture`, `ein-discipline`
  - why: Share safe placement semantics between Pi and Claude launchers.
  - learn: A narrow file helper can enforce ownership without becoming a generic deployment framework.
  - architecture: Installer core owns destination calculation and named-file writes; CLI runners choose which asset to install.
  - avoid: Enumerating or rewriting unrelated Fish functions.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "launcher"` and `cd installer && bun run typecheck`

- [x] 2.2 Wire packaged `pi-ein.fish` content into the Pi runner only after the Pi lifecycle reaches its designed success seam.
  - skills: `architecture`, `ein-discipline`
  - why: Meet the Pi launcher acceptance criterion without claiming success after a failed Pi operation.
  - learn: Place user-facing launchers at the end of the owning runtime transaction.
  - architecture: Pi orchestration reports launcher failure as Pi failure; the helper owns only the write.
  - avoid: Installing the Pi launcher during Claude-only runs or touching vanilla runtime state.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "Pi launcher|Pi-only"` and `cd installer && bun run typecheck`

## // 003. Runtime target contract and orchestration

- [x] 3.1 Introduce the typed Pi/Claude Code/both target contract and shared Bun preparation seam, retaining direct `ein install` Pi default behavior.
  - skills: `architecture`, `ein-discipline`
  - why: Give menu and install code an explicit API rather than encoding targets as flags.
  - learn: Keep interactive concerns at the menu edge while preserving existing CLI contracts.
  - architecture: `install.ts` owns target types, shared prerequisite deduplication, and typed per-target results.
  - avoid: Changing non-install actions or adding an undocumented public target flag.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "target|shared Bun|orchestration"` and `cd installer && bun run typecheck`

- [x] 3.2 Implement exactly-once Pi-then-Claude execution for both, continuation after one target fails, independent result reporting, and overall failure aggregation.
  - skills: `architecture`, `ein-discipline`
  - why: Preserve successful independent work while accurately reporting partial failures.
  - learn: Multi-runtime installation is an aggregate operation, not an atomic transaction.
  - architecture: Orchestrator sequences runners and aggregates results; each runner retains local rollback semantics.
  - avoid: Rolling back a successful runtime because the other runtime failed or duplicating shared preparation.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "both|order|failure|exactly once"` and `cd installer && bun run typecheck`

## // 004. Interactive menu selection

- [x] 4.1 Add the runtime prompt immediately after Install with visible Pi, Claude Code, and both choices, forwarding one selected target exactly once.
  - skills: `ein-discipline`, `architecture`
  - why: Expose B2 selection without altering lifecycle actions.
  - learn: Put new prompts at the narrowest existing action seam.
  - architecture: `menu.ts` owns labels, selection, and cancellation; `install.ts` owns execution.
  - avoid: Moving the prompt into the shared lifecycle menu or changing direct CLI behavior.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "menu|selection"` and `cd installer && bun run typecheck`

- [x] 4.2 Preserve non-TTY exits, menu cancellation semantics, and all Doctor/Update/Uninstall/Restore/Quit paths.
  - skills: `ein-discipline`
  - why: The scope explicitly requires existing non-install behavior to remain unchanged.
  - learn: Regression checks belong beside the seam that introduces new interaction.
  - architecture: Menu remains a thin framework boundary; only Install delegates to target orchestration.
  - avoid: Treating a cancelled runtime prompt as the existing confirmation failure or changing non-TTY handling.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "cancell|non-TTY|non-install"` and `cd installer && bun run typecheck`

## // 005. Deterministic Claude payload and sync status

- [x] 5.1 Add the embedded runtime payload inventory/archive and extraction/resolution seam containing the established `cc-ein` source closure required by `sync.ts` and its SDD CLI.
  - skills: `architecture`, `ein-discipline`
  - why: Standalone and arbitrary-cwd installs need deterministic Claude sources.
  - learn: Package the source closure once rather than reimplementing or resolving from caller cwd.
  - architecture: Build/assets code owns repository-relative payload shape; runtime code receives an explicit staged root.
  - avoid: A cwd-relative fallback or a static-string substitute that cannot execute sync.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "payload|staging|asset"` and `cd installer && bun run typecheck`

- [x] 5.2 Update asset declarations/build plumbing to include the payload while preserving the existing Pi template artifact and excluding B3/update behavior.
  - skills: `architecture`, `ein-discipline`
  - why: Make the new asset available to packaged execution without broad build changes.
  - learn: Add packaging at the artifact boundary, not inside runtime orchestration.
  - architecture: `installer/scripts/*` and `installer/src/assets.d.ts` own generated assets; installer CLI owns consumption.
  - avoid: Running or requiring a production build in this phase or bundling unrelated runtime behavior.
  - verify: `cd installer && bun run typecheck` and `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "asset|payload"`

- [x] 5.3 Make required Claude sync operations fail closed while retaining warning-only classification for optional Context7/Engram work.
  - skills: `architecture`, `ein-discipline`
  - why: Process success must not conceal incomplete required Claude installation.
  - learn: Failure classification belongs where the operation is observable.
  - architecture: `cc-ein/sync.ts` classifies internal operations; installer orchestration observes process status.
  - avoid: Inferring success from log text or turning optional integrations into hard failures.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "sync|optional|required"` and `cd installer && bun run typecheck`

## // 006. Claude runner and focused coverage

- [x] 6.1 Implement Claude execution using staged payload context, the existing `run()` convention, required sync status, cleanup on every outcome, and `cc-ein.fish` installation only after sync succeeds.
  - skills: `architecture`, `ein-discipline`
  - why: Ensure Claude-only has no Pi side effects and cannot report false success.
  - learn: Sequence dependent side effects after the prerequisite operation has been observed successful.
  - architecture: Claude runner owns staging, child-process invocation, launcher sequencing, and target result; it does not own sync internals.
  - avoid: Installing vanilla Claude, invoking from `process.cwd()`, or continuing after payload/sync failure.
  - verify: `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "Claude|sync|launcher failure"` and `cd installer && bun run typecheck`

- [x] 6.2 Add or extend `tests/installer-runtime-menu.test.ts` with focused fakes/temp homes covering all targets, isolation, migration marker states, launcher idempotence/ownership, payload invocation, required/optional sync outcomes, and aggregate failures.
  - skills: `ein-discipline`, `architecture`
  - why: Provide cheap deterministic coverage for every B2 acceptance seam without real homes, network, TUI, or runtime sessions.
  - learn: Test orchestration contracts and injected boundaries instead of external processes.
  - architecture: Tests assert public seams and call order; existing backup/deps/entrypoint suites remain regression support.
  - avoid: Expanding into full installer builds, broad test suites, B3 update behavior, or real Pi/Claude integration.
  - verify: `bun test tests/installer-runtime-menu.test.ts` and `cd installer && bun run typecheck`
