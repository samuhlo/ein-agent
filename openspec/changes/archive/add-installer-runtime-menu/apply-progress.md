status: complete

## Group 001 — Pi path context and migration seam

- **Status:** complete for tasks 1.1 and 1.2; later groups remain untouched.
- **Implemented:** active-home Pi path derivation; strict EIN marker validation; guarded legacy migration with pre-move tar backup, settings path rewrite, conflict failure, and final post-migration context resolution.
- **Threaded context:** snapshot/restore, template deployment, declared-package installation, marker writing, and doctor now accept the explicit Pi context while preserving no-context defaults.
- **Migration command:** `pi-ein/migrate.ts` reuses the guarded installer migration seam and preserves dry-run behavior.
- **Files:** `installer/src/cli/install.ts`, `installer/src/core/{paths,pi-migration,deploy,deps,engram,version,verify}.ts`, `pi-ein/migrate.ts`, and focused `tests/installer-runtime-menu.test.ts`.
- **Tests:** added focused coverage for isolated/legacy/malformed/conflict states and marker/snapshot/rollback context use.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "legacy|Pi path|migration"` — 5 passed; `cd installer && bun run typecheck` — passed.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no production build or broad test suite run; no later runtime/menu/Claude groups implemented.
- **Remaining:** groups 002, 003, 004, 005, and 006.
- **Risks:** optional secret/dependency helpers outside this group still retain established import-time defaults; final holistic verification should exercise full installer orchestration.

## Group 002 — EIN Fish launcher helper

- **Status:** complete for tasks 2.1 and 2.2; groups 003–006 remain untouched.
- **Implemented:** `installFishLauncher` creates the user Fish functions directory, writes only the requested named file, skips identical rewrites, and supports an explicit destination for isolated tests.
- **Pi wiring:** the packaged `pi-ein.fish` text asset is embedded through Bun's text import and installed only after the Pi doctor reports success; launcher write failures return installer failure.
- **Tests:** focused coverage verifies parent creation, exact Pi/Claude launcher content, idempotence, and preservation of an unrelated Fish function.
- **Files:** `installer/src/core/launcher.ts`, `installer/src/assets.d.ts`, `installer/src/cli/install.ts`, and `tests/installer-runtime-menu.test.ts`; task checkboxes updated in `tasks.md`.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "launcher"` — 1 passed; `cd installer && bun run typecheck` — passed; Bun text-asset import smoke — passed.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no production build or broad test suite run; no Claude wiring or runtime orchestration was started.
- **Remaining:** groups 003, 004, 005, and 006.
- **Risks:** standalone asset packaging/build plumbing is intentionally deferred to group 005; Pi launcher installation is downstream of doctor success but cannot undo a previously completed Pi deployment if its own write fails.

## Group 003 — Runtime target contract and orchestration

- **Status:** complete for tasks 3.1 and 3.2; groups 004–006 remain untouched.
- **Implemented:** typed `InstallTarget` (`pi`/`claude`/`both`), per-runtime result contract, ordered target expansion, and injectable orchestration seams.
- **Shared prerequisite:** Bun preparation is a single pre-run stage; selected runners are never asked to resolve it independently.
- **Ordering/failure:** `both` invokes Pi then Claude once each, continues after a runner failure/throw, and aggregates independent results with overall failure when any selected target fails.
- **Direct CLI:** `runInstall(args)` retains Pi as its default; Claude is fail-closed until the later Claude runner group wires sync and launcher behavior.
- **Tests:** added focused fake-runner coverage for target selection, shared Bun exactly-once preparation, Pi-then-Claude order, and partial failure aggregation.
- **Files:** `installer/src/cli/install.ts`, `tests/installer-runtime-menu.test.ts`, and this change's `tasks.md`.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "target|shared Bun|orchestration"` — 5 passed; `cd installer && bun run typecheck` — passed.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no menu prompt, Claude sync, payload, asset packaging, or production build was added; those remain in groups 004–006.
- **Remaining:** groups 004, 005, and 006.
- **Risks:** the default Claude runner intentionally fails closed until group 006; shared `checkDeps` still reports the full inventory before target-specific work.

## Group 004 — Interactive menu selection

- **Status:** complete for tasks 4.1 and 4.2; groups 005 and 006 remain untouched.
- **Implemented:** Install now immediately prompts for Pi, Claude Code, or Both and forwards the selected `InstallTarget` to `runInstall` once.
- **Cancellation/non-TTY:** runtime cancellation returns cleanly without invoking installation; the existing non-TTY early exit remains before banner or prompts.
- **Tests:** focused menu coverage checks visible option values/labels, single selection forwarding, cancellation, and non-TTY exit behavior.
- **Files:** `installer/src/cli/menu.ts`, `tests/installer-runtime-menu.test.ts`, and this change's `tasks.md`.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "menu|selection"` — 3 passed; `cd installer && bun run typecheck` — passed.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no production build or broad test suite run; no payload, sync-status, or Claude runner work started.
- **Remaining:** groups 005 and 006.
- **Risks:** Claude remains intentionally fail-closed until its later runner group; full non-install action routing is unchanged but should receive final holistic verification.

## Group 005 — Deterministic Claude payload and sync status

- **Status:** complete for tasks 5.1, 5.2, and 5.3; group 006 remains untouched.
- **Implemented:** repository-relative `cc-ein` payload inventory, generated archive, SDD CLI import closure, explicit archive resolution, extraction/layout validation, manifest checksum validation, and idempotent staging cleanup.
- **Asset plumbing:** added `bundle-cc-ein.ts`, wired `build-all.ts` to preserve the Pi template and generate the Claude payload, declared the archive asset, and ignored the generated tarball.
- **Sync status:** refactored `cc-ein/sync.ts` around `runSync()`; source reads, core writes, agent/skill sync, settings generation, and SDD CLI compilation are required failures; Context7/Engram MCP setup remains warning-only.
- **Tests:** added focused inventory/staging coverage with explicit temporary archives; no Claude runner or group 006 orchestration coverage was added.
- **Files:** `installer/src/core/cc-payload.ts`, `installer/src/core/cc-payload-inventory.ts`, `installer/scripts/bundle-cc-ein.ts`, `installer/scripts/build-all.ts`, `installer/src/assets.d.ts`, `installer/.gitignore`, `cc-ein/sync.ts`, and focused `tests/installer-runtime-menu.test.ts`.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "payload|staging|asset"` — 2 passed; `cd installer && bun run typecheck` — passed; payload bundler generated 835-file archive; `bun cc-ein/sync.ts --dry` — passed; fake required compile failure exited 1 and fake optional MCP failure exited 0.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no production build or broad test suite run; generated payload tarball remains ignored and is produced by the asset script/build flow.
- **Remaining:** group 006 Claude runner and focused coverage.
- **Risks:** required/optional sync classification is covered by the explicit result seam but still needs group 006 process/runner integration tests; full packaged binary verification belongs to verify.

## Group 006 — Claude runner and focused coverage

- **Status:** complete for tasks 6.1 and 6.2; all change tasks are checked.
- **Implemented:** exported Claude runner stages the packaged payload, invokes `bun cc-ein/sync.ts` with the staged root as cwd through the shared `run()` helper, passes the active home, checks process status, installs `cc-ein.fish` only after sync success, and always cleans returned staging in `finally`.
- **Failure behavior:** staging, required sync, and launcher errors return a failed Claude result; launcher installation is skipped when sync fails. Optional sync warnings remain governed by `cc-ein/sync.ts` status.
- **Coverage:** added fake staged payload/process/launcher tests for staged invocation and ordering, required sync failure, launcher failure, cleanup, and focused target behavior; earlier groups retain target isolation, migration, launcher ownership, payload, optional sync, and aggregation coverage.
- **Files:** `installer/src/cli/install.ts`, `tests/installer-runtime-menu.test.ts`, `openspec/changes/add-installer-runtime-menu/tasks.md`, and this progress artifact.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern "Claude|sync|launcher failure"` — 8 passed; `cd installer && bun run typecheck` — passed.
- **TDD:** OFF per session preflight; no RED/GREEN cycle required.
- **Deviations:** no production build or broad test suite run, per task scope.
- **Remaining:** none for apply; independent final verification should validate packaged execution freshness.
- **Risks:** full packaged binary verification and holistic regression remain outside this focused apply gate.

## Post-verify remediation — Pi mode isolation and menu forwarding

- **Status:** complete; remediation stayed within the requested installer/menu/test slice.
- **Fixed:** Solo/Team prompting and mode logging now run only when Pi is selected (`pi` or `both`); Claude-only `runInstall([], "claude")` does not perform Pi mode interaction.
- **Preserved:** Pi and both retain the existing mode prompt, `skipLinear` behavior, and mode log messages.
- **Coverage:** added a real `runMenu` Install-branch test with injected prompts/runner; it asserts the selected target is forwarded once with empty args.
- **Payload assertion:** left the existing staged payload assertion unchanged; no extra strengthening was necessary for this remediation.
- **Files:** `installer/src/cli/install.ts`, `installer/src/cli/menu.ts`, `tests/installer-runtime-menu.test.ts`, and this progress artifact.
- **TDD stance:** explicitly OFF for this remediation; no retroactive RED/GREEN evidence is claimed.
- **Verification:** `bun test tests/installer-runtime-menu.test.ts --test-name-pattern 'Claude|mode|menu|selection|forward'` — 11 passed, 8 filtered; `cd installer && bun run typecheck` — passed.
- **Deviations:** no production build or broad test suite run, per scope.
- **Remaining:** none for this remediation; independent final verification remains the freshness/holistic gate.
- **Risks:** direct runtime behavior still depends on the independent final verification for full orchestration coverage.
