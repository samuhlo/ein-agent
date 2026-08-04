# Scope — add-installer-runtime-menu

## SCOPE PACKET

```yaml
scope: Implement HANDOFF Phase 2 item B2 only: add an installer runtime choice for Pi, Claude Code, or both. The Pi path uses B1's isolated deployment, installs pi-ein.fish, and migrates detected legacy EIN; the Claude Code path invokes bun cc-ein/sync.ts and installs cc-ein.fish. B3's update banner is excluded.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Objective

Make the interactive installer select one runtime target—Pi, Claude Code, or both—and execute only the selected installation path. Preserve the existing Bun/TypeScript ESM project conventions, Pi install/deploy safeguards, backup/rollback behavior, optional secrets and doctor flow where applicable, and the existing non-install menu actions.

The behavior delta is declared in `openspec/changes/add-installer-runtime-menu/specs/installer-runtime/spec.md` using the deterministic OpenSpec delta serializer. No canonical existing domain was selected: the available `sdd-lifecycle` and `scout-routing` specs do not describe installer runtime behavior.

## Current project context

- Stack: `installer/` is a private Bun + TypeScript ESM package (`installer/package.json`, `installer/tsconfig.json`); module resolution is TypeScript bundler mode with strict checking.
- Package manager: Bun (`installer/bun.lock` and Bun scripts). The configured typecheck command is `cd installer && bun run typecheck`.
- Testing: root `bunfig.toml` configures Bun's test runner and preload, and focused tests can import installer modules. `openspec/config.yaml` currently records `strict_tdd: true` but no reliable test command; this change packet explicitly takes TDD off while retaining later verification.
- Existing install flow: `installer/src/cli/install.ts` currently assumes Pi, checks/installs Bun and Pi, snapshots `AGENT_DIR`, deploys the embedded template through `deployTemplate`, installs declared Pi packages, writes the marker, and runs doctor. B1's `AGENT_DIR` resolution already prefers the isolated `~/.pi-ein/agent` marker, then legacy `~/.pi/agent`, then the isolated default.
- Existing menu: `installer/src/cli/menu.ts` uses `@clack/prompts` `p.select` for Install, Doctor, Update, Uninstall, Restore, and Quit; Install currently calls `runInstall([])`.
- Pi assets: `pi-ein/pi-ein.fish` sets `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME` to `~/.pi-ein/agent`; `pi-ein/migrate.ts` backs up and moves `~/.pi/agent` to `~/.pi-ein/agent`, then rewrites absolute settings paths. The installer must gate that migration on detected legacy EIN, not merely on an arbitrary vanilla `~/.pi/agent` directory.
- Claude assets: HANDOFF identifies `cc-ein/sync.ts` and `cc-ein/cc-ein.fish` as the source/runtime assets on sibling branch `feat/cc-ein`. They are not present in the current `feat/pi-ein-isolation` worktree, so the map/apply phases must make that source availability and execution context explicit rather than inventing a second Claude implementation.
- Fish launcher destination: the expected user-level destination is `~/.config/fish/functions/{pi-ein,cc-ein}.fish`; installation should be idempotent and create the parent directory when needed.

## In scope

1. Add explicit interactive runtime selection for Pi, Claude Code, and both without changing Doctor, Update, Uninstall, Restore, Quit, non-TTY handling, or the existing prompt cancellation semantics.
2. Make the selected target determine which prerequisite, deployment, package, secret, marker, and doctor work runs. Pi-only behavior retains the current Pi installation safeguards; Claude-only must not deploy or mutate the Pi runtime; both executes both paths once with clear per-runtime failure reporting.
3. For Pi, preserve B1's isolated `AGENT_DIR` behavior, deploy EIN there, install `pi-ein.fish`, and invoke the existing migration flow only when legacy EIN is positively detected under `~/.pi/agent`. A vanilla Pi directory must remain vanilla.
4. For Claude Code, invoke `bun cc-ein/sync.ts` through the project's existing child-process conventions, install `cc-ein.fish`, and fail/report the target if either synchronization or launcher installation fails. The source path/cwd or bundled acquisition mechanism must be deterministic and available in the packaged/repository execution mode selected by design.
5. Keep launcher writes and repeated installs idempotent; do not overwrite unrelated Fish functions or touch vanilla runtime state except the explicitly detected legacy migration.
6. Add or extend only cheap focused coverage for target selection, selected-path isolation, legacy-marker gating, launcher placement, and Claude sync failure propagation. Later verification must include installer typecheck and the focused checks; no tests or builds are run during scope.

## Acceptance criteria

- The interactive installer visibly offers Pi, Claude Code, and both; selecting one target does not run an unselected target, and selecting both runs each target exactly once.
- Pi selection deploys through the B1-resolved isolated agent directory, preserves existing Pi backup/rollback and doctor semantics, installs `~/.config/fish/functions/pi-ein.fish`, and leaves an ordinary vanilla `~/.pi/agent` untouched.
- When a legacy EIN marker is detected in `~/.pi/agent`, Pi selection performs the existing backup-and-migrate behavior before/at the designed deployment seam, including settings-path migration; migration is not attempted for a non-EIN directory and a migration failure is reported fail-closed.
- Claude Code selection invokes `bun cc-ein/sync.ts` from a deterministic source context, installs `~/.config/fish/functions/cc-ein.fish`, and reports failure rather than claiming success when synchronization or launcher installation fails.
- Both selection performs the complete Pi and Claude Code paths once, with independent results and no duplicate dependency/deploy/sync work.
- Existing Bun package-manager commands, user-owned Pi files, non-install menu actions, non-TTY exit behavior, and cancellation behavior remain unchanged.
- Focused tests or equivalent deterministic seams cover all three target choices, Pi isolation and migration gating, launcher installation, and Claude sync invocation/failure; later verification runs `cd installer && bun run typecheck` and the selected focused checks. No test suite or build is run in this scope phase.

## Non-goals

- B3's update banner or any change to `pi-ein update --all`, session-start messaging, or update detection.
- Redesigning `installer/src/core/paths.ts`, the B1 isolated-directory resolution, Pi's embedded template, updater transactions, backups, doctor checks, or runtime agent behavior.
- Installing or configuring vanilla `pi` or vanilla `claude` beyond the minimum prerequisite behavior required by a selected EIN runtime.
- Reimplementing `cc-ein`, translating Claude agents, changing its sync payload, or merging the sibling branch; B2 only invokes the established source and installs its launcher.
- Release/version/changelog changes, broad installer documentation, package-manager migration, or support for runtimes other than Pi and Claude Code.

## Mapping handoff

Map the prompt seam between `menu.ts` and `runInstall`, the conditional dependency/deploy/doctor boundaries in `install.ts`, the existing `run` child-process API, Fish path conventions, legacy marker detection, and how a standalone installer can access `cc-ein/sync.ts` and `cc-ein.fish`. Confirm whether launcher installation belongs in a small reusable installer core helper or remains local to the CLI without broadening the diff. Define ordering and rollback/reporting for both-runtime installs, especially when the Pi path succeeds and the Claude path fails.

The current worktree lacks `cc-ein/`; apply must either run after the sibling branch is available or use an explicitly designed packaged/source acquisition seam. Do not silently fall back to a missing path or report Claude Code success without observing the sync result.

## Verification plan

- Use Bun's existing test conventions for any focused tests; avoid network, real home-directory mutation, and real Claude/Pi sessions by injecting or faking child-process/filesystem seams where the current architecture permits.
- Run `cd installer && bun run typecheck`.
- Run the focused Bun test file(s), then the relevant installer/e2e smoke path if the packaged Claude assets and a safe fixture are available. Record any unavailable packaged Claude source as an explicit residual risk rather than substituting a static string check for execution evidence.
- Do not run tests, builds, or the e2e suite during scope.

## Risks

- The Claude source and launcher exist only on sibling branch `feat/cc-ein`; packaging and arbitrary-cwd execution must be resolved before apply.
- Current `runInstall` interleaves Pi-only prerequisites and doctor work, so conditionalizing it can accidentally weaken backups, secrets, or failure handling.
- Legacy detection must distinguish EIN's install marker from a vanilla Pi directory to avoid moving user state unexpectedly.
