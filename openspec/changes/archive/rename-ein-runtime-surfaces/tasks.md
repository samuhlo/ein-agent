# Tasks — rename-ein-runtime-surfaces

status: ready
blocked_by: none

strict_tdd: true
delivery: atomic
apply_release_boundary: >-
  sdd-apply MUST NOT change the version, create or move a tag, push a release,
  publish assets, or smoke a published artifact. The post-verify tasks in
  // 029–031 become executable only after `sdd-verify` records every integrated
  gate green for the same commit.

## Global invariants

- Record the pre-apply `HEAD` in `apply-progress.md`. Every group MUST leave
  `openspec/changes/fix-overlay-repaint-recovery/` byte-identical to that base;
  it is a protected independent change even if its implementation is already
  finished.
- `openspec/changes/archive/` is immutable historical evidence. It is excluded
  from the live-name audit by that exact root and MUST never be rewritten.
- Preserve `~/.pi-ein/agent`, `~/.claude-ein`, `PI_CODING_AGENT_DIR`,
  `EIN_PI_AGENT_HOME`, and `CLAUDE_CONFIG_DIR` byte-for-byte in meaning.
- The cut is hard: do not install `pi-ein`, `cc-ein`, or `cc-ein-sdd` aliases.
  Old names may survive only as typed `data-home` or `legacy-migration`
  evidence. `ein` remains the normal door and `ein-install` the repair hatch.
- The RED in // 001 is the one deliberate cross-group sentinel: keep its live
  repository case failing while stale names remain, and close it only in
  // 027. Every other group closes its own RED → GREEN → TRIANGULATE → REFACTOR
  cycle before hand-off.

## // 001. Establish the typed naming audit in RED first

- [x] 1.1 Add the focused retired-name audit contract before any runtime or documentation rename.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Create `tests/runtime-surface-naming-audit.test.ts` and, if separation keeps the test readable, `tests/helpers/runtime-surface-naming-audit.ts`. First prove failure on the real live tree with file, line, context and an `unclassified` result for current-command/path examples.
  - GREEN: Make the audit engine itself pass table cases for exact `data-home` and `legacy-migration` predicates, exact-root exclusions for `.git`, dependency/build caches and `openspec/changes/archive/`, and rejection of directory wildcards or broad source/test/docs exclusions. Keep the real-tree sentinel red until // 027.
  - TRIANGULATE: Add synthetic stale current usage, stable `~/.pi-ein/agent`, exact old launcher cleanup constants, a symlinked candidate, an archived hit, a current-change migration sentence and a hit inside the protected previous change; only the two typed live classes and exact immutable archive exclusion may pass.
  - REFACTOR: Centralize match enumeration and typed reasons once; require `LEGACY` in code-symbol context and exact path/context predicates rather than a raw allowlist of paths.
  - why: A product-wide rename needs a deterministic list of unfinished work and cannot trust a final zero-match grep because the Pi data home and bounded cleanup evidence intentionally keep old text.
  - learn: A typed audit turns exceptions into reviewable evidence instead of hiding them behind exclusions.
  - architecture: The audit owns naming policy only; runtime and installer owners remove stale matches. It scans the current change and protected active-change tree, while archive history stays outside the live result.
  - avoid: Do not exclude `tests/`, docs, generated files, `openspec/changes/rename-ein-runtime-surfaces/`, or `openspec/changes/fix-overlay-repaint-recovery/` wholesale, and do not edit either protected tree to manufacture green.
  - verify: `bun test tests/runtime-surface-naming-audit.test.ts` first fails on the measured live stale references; its focused classifier table passes when run with the test's fixture-only filter documented in the test name.

## // 002. Integrate the Pi launcher into its single owner

- [x] 2.1 Move the three obsolete Pi adapter files into the existing `ein-pi/` tree and expose only `ein-pi`.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Extend `tests/minimal-workbench-launcher.test.ts` and `tests/runtime-test-fixture-isolation.test.ts` to require `ein-pi/ein-pi.fish`, `ein-pi/migrate.ts`, `ein-pi/README.md`, Fish function/error text `ein-pi`, and the unchanged Pi home/env contract; assert that top-level `pi-ein/` is absent.
  - GREEN: Mechanically move `pi-ein/pi-ein.fish`, `pi-ein/migrate.ts`, and `pi-ein/README.md` to the three exact final paths, then rename current launcher/function/help/migration output to Ein-first order without changing state resolution.
  - TRIANGULATE: Cover `app`, `workbench`, unavailable-runner errors and migration dry-run; compare `PI_CODING_AGENT_DIR` and `EIN_PI_AGENT_HOME` values exactly with `$HOME/.pi-ein/agent` and prove vanilla `pi` remains untouched.
  - REFACTOR: Remove the obsolete source directory only after all imports resolve; keep one Pi README and no nested `ein-pi/ein-pi/` abstraction.
  - why: The existing `ein-pi/` core already owns Pi, so the launcher and migration helper must join that owner instead of creating a second product concept.
  - learn: A filesystem rename is safe only when ownership and stable state paths are treated separately.
  - architecture: This is the explicit mechanical-move exception: three owned files move as one unit, while user data stays at `~/.pi-ein/agent`.
  - avoid: Do not rename `.pi-ein`, migrate user state, introduce an alias, or leave a fallback import from top-level `pi-ein/`.
  - verify: `bun test tests/minimal-workbench-launcher.test.ts tests/runtime-test-fixture-isolation.test.ts`

## // 003. Move the Claude adapter root and direct launcher

- [x] 3.1 Move the Claude adapter as one mechanical tree and make its Fish entry point `ein-cc`.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/beta-launcher-e2e-hardening.test.ts`, `tests/claude-continuity-runtime.test.ts` and `tests/claude-project-settings.test.ts` to resolve the `ein-cc/` root and `ein-cc/ein-cc.fish`, expect `function ein-cc`, preserve `CLAUDE_CONFIG_DIR=$HOME/.claude-ein`, and reject the old root as a current fallback.
  - GREEN: Mechanically move the whole `cc-ein/` tree to `ein-cc/`, rename `cc-ein.fish` to `ein-cc.fish`, update only launcher behavior/current errors, and change `tsconfig.json` from `cc-ein/**/*.ts` to `ein-cc/**/*.ts`.
  - TRIANGULATE: Exercise normal launch, `app`, surface runner, continuity runner missing/non-executable cases and pass-through arguments; prove the launcher adds `~/.claude-ein/bin` without changing `~/.claude`.
  - REFACTOR: Keep the moved tree's internal shape intact and leave generator/CLI semantic edits to // 004–005; remove any old-root fallback introduced during the mechanical hand-off.
  - why: Claude source, generator input and installed launcher are one adapter owner and cannot ship under two roots.
  - learn: A whole-tree move can be mechanical while behavioral changes remain in later focused cycles.
  - architecture: `ein-cc/` becomes the sole Claude adapter root; `.claude-ein` remains the isolated runtime home.
  - avoid: Do not rename generic Claude `cc` abstractions, `CLAUDE_CONFIG_DIR`, or the data home to `.ein-cc`.
  - verify: `bun test tests/beta-launcher-e2e-hardening.test.ts tests/claude-continuity-runtime.test.ts tests/claude-project-settings.test.ts`

## // 004. Rename the deterministic Claude CLI and continuity argv

- [x] 4.1 Make `ein-cc-sdd` the only current CLI name in dispatch, usage, errors and handoff argv.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/sdd-flow-contract.test.ts`, `tests/sdd-summary-write.test.ts`, `tests/cli-ambiguous-change.test.ts`, `tests/claude-continuity-runtime.test.ts` and `tests/surface-wiring.test.ts` to expect only `ein-cc-sdd` in command lines, missing-change remedies, help and spawned argv.
  - GREEN: Rename current CLI/identifier strings in `ein-cc/sdd-cli/cli.ts` and current handoff argv/errors in `ein-cc/continuity-runner.ts`; update the authoritative command wrappers under `ein-cc/commands/ein/` in the same behavior seam.
  - TRIANGULATE: Cover `status`, `check`, `close`, `sync`, `delta`, `summary`, `settings`, `preflight`, `guard`, an ambiguous change and an invalid/empty summary; assert no output advertises the retired executable.
  - REFACTOR: Share one current executable constant where both runtime files need it; retain old executable text only in explicitly named legacy installer fixtures, never in CLI defaults.
  - why: A renamed binary is unusable if its own remedies, command wrappers or continuity process still spawn the retired name.
  - learn: Executable identity includes every argv and error path, not only the output filename.
  - architecture: The deterministic CLI remains under the Claude adapter; SDD lifecycle semantics and destination validation do not change.
  - avoid: Do not change SDD behavior, add an old-name dispatcher, or weaken invalid-input tests to accommodate mixed vocabulary.
  - verify: `bun test tests/sdd-flow-contract.test.ts tests/sdd-summary-write.test.ts tests/cli-ambiguous-change.test.ts tests/claude-continuity-runtime.test.ts tests/surface-wiring.test.ts`

## // 005. Regenerate the Claude surface from renamed inputs

- [x] 5.1 Switch the generator boundary to Ein-first paths and regenerate checked-in output instead of editing it directly.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/core-parity-coordinator.test.ts`, `tests/core-parity-openspec.test.ts`, `tests/style-parity-claude.test.ts`, `tests/claude-change-stance.test.ts`, `tests/claude-delta-write.test.ts` and `tests/claude-project-settings.test.ts` for the renamed provenance stamp, adapter paths, allowed Bash command and compiled binary name.
  - GREEN: Update `ein-cc/sync.ts`, `ein-cc/CLAUDE.adapter.md` and `ein-pi/core/AGENTS.md` as authoritative inputs, then run the renamed sync/generator path to reproduce `ein-cc/CLAUDE.md` and deployed command text.
  - TRIANGULATE: Verify dry-run, generation to an isolated `EIN_CC_HOME`, required compile failure, optional warning, generated stamp uniqueness and exact `ein-cc-sdd` hook/command wiring while `CLAUDE_CONFIG_DIR` and `~/.claude-ein` remain unchanged.
  - REFACTOR: Rename `CC_EIN_HOME` to internal `EIN_CC_HOME` and other product-coded symbols, but leave the three stable integration environment variables and generic Claude concepts intact.
  - why: The checked-in Claude policy is generated output; source, generator, hooks and output must agree in one reproducible boundary.
  - learn: Generated parity is strongest when the test rebuilds from authoritative inputs and compares bytes.
  - architecture: Shared policy remains in `ein-pi/core`; Claude-specific policy remains in `ein-cc/CLAUDE.adapter.md`; `ein-cc/sync.ts` is the sole compiler.
  - avoid: Do not hand-fix only `ein-cc/CLAUDE.md`, accept an old-root provenance stamp, or add a generator fallback to `cc-ein/`.
  - verify: `bun test tests/core-parity-coordinator.test.ts tests/core-parity-openspec.test.ts tests/style-parity-claude.test.ts tests/claude-change-stance.test.ts tests/claude-delta-write.test.ts tests/claude-project-settings.test.ts`

## // 006. Rename the Pi update evidence contract

- [x] 6.1 Rename the product-coded `PiEin*` update types/functions at their single source before changing consumers.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/ein-banner-updates.test.ts` and `tests/update-probes.test.ts` to import `EinPiUpdateStatus`, `EinPiUpdateObservation`, `collectEinPiUpdateEvidence`, `detectEinPiUpdates`, `isEinPiRuntime` and Ein-first renderer/start names; require advice to say `ein-pi update --all`.
  - GREEN: Rename exports and internal symbols only in `ein-pi/agent/lib/ein-update-notice.ts`, preserving status unions, timeout/freshness logic and the `.pi-ein/agent` runtime test.
  - TRIANGULATE: Cover current, available, unavailable, ambiguous, error and skipped observations plus a non-isolated Pi runtime; prove the runtime predicate still resolves the same data home.
  - REFACTOR: Remove compatibility export aliases with `PiEin` names once all focused consumers move in // 007; if a temporary compile bridge is necessary inside this cycle, it must not survive the group hand-off.
  - why: Product-coded types are part of the repository vocabulary and feed banner, workbench and probe APIs.
  - learn: Renaming the defining contract first makes consumer drift a compile-time failure.
  - architecture: `ein-update-notice.ts` remains the single update-evidence owner; no runtime behavior or state path changes.
  - avoid: Do not treat `EIN_PI_AGENT_HOME` as a retired identifier or rename `.pi-ein` path segments that denote data.
  - verify: `bun test tests/ein-banner-updates.test.ts tests/update-probes.test.ts`

## // 007. Move update-evidence consumers to `EinPi*`

- [x] 7.1 Update the three direct consumers and eliminate temporary old identifier exports.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Make `tests/update-probes.test.ts`, `tests/minimal-workbench-launcher.test.ts` and `tests/ein-banner-updates.test.ts` fail on any imported/exported `PiEin*` symbol or `pi-ein update --all` current command.
  - GREEN: Rename imports, types and functions in `ein-pi/agent/lib/update-probes.ts`, `ein-pi/agent/lib/workbench.ts` and `ein-pi/agent/extensions/ein-banner.ts`; then remove any temporary aliases from the source contract in // 006.
  - TRIANGULATE: Exercise lazy probe resolution, workbench component advice and banner notice scheduling with both Pi and installer update evidence.
  - REFACTOR: Keep one canonical `EinPiUpdateObservation` vocabulary and avoid duplicating adapters at each consumer.
  - why: Leaving old exported symbols would make the product rename incomplete even if user-visible commands changed.
  - learn: Compiler-driven consumer migration is safer than keeping indefinite rename aliases.
  - architecture: Consumers adapt to the unchanged evidence contract; none becomes a second update-policy owner.
  - avoid: Do not change probe IO, banner timing, workbench rendering, or retain aliases solely to reduce the diff.
  - verify: `bun test tests/update-probes.test.ts tests/minimal-workbench-launcher.test.ts tests/ein-banner-updates.test.ts && bun run typecheck`

## // 008. Repair live runtime argv, remedies and source-local paths

- [x] 8.1 Replace remaining current command/root references in behavior-bearing Pi sources without touching stable data-home evidence.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Extend `tests/terminal-app.test.ts`, `tests/sdd-remedies.test.ts`, `tests/git-baseline.test.ts` and `tests/sdd-preflight-per-change.test.ts` to expect `ein-pi` package argv, `ein-cc-sdd` remedies and Ein-first source references.
  - GREEN: Update current strings in `ein-pi/agent/surfaces/terminal-app-entrypoint.ts`, `ein-pi/agent/lib/sdd-remedies.ts`, `ein-pi/agent/lib/git-baseline.ts` and `ein-pi/agent/extensions/ein-ai.ts`.
  - TRIANGULATE: Cover Pi package update dispatch, Claude sync/summary remedies, git status text and preflight guidance; assert legacy/data-home literals are not consumed as current commands.
  - REFACTOR: Reuse current command constants where an existing owner exists; otherwise keep exact local literals rather than adding a broad naming abstraction.
  - why: These strings reach subprocesses or user remedies and can silently route users back to removed entry points.
  - learn: Comments are low risk, but argv and recovery advice are observable product behavior.
  - architecture: Each existing feature retains ownership; this group changes only the runtime-surface names it emits or invokes.
  - avoid: Do not rewrite `.engram-cc-ein` historical measurement, stable `.pi-ein` home text, or unrelated feature semantics.
  - verify: `bun test tests/terminal-app.test.ts tests/sdd-remedies.test.ts tests/git-baseline.test.ts tests/sdd-preflight-per-change.test.ts`

## // 009. Clean remaining source-local product vocabulary

- [x] 9.1 Update current Claude-root/launcher prose in live code comments and exact-path contracts, classifying every preserved old match.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Add focused assertions to `tests/guardrails.test.ts`, `tests/subagent-envelope-contract.test.ts` and `tests/engram-single-store.test.ts` for `ein-cc` source ownership while preserving explicitly historical Engram evidence and stable home paths.
  - GREEN: Update current source references in `ein-pi/agent/lib/guardrails.ts`, `ein-pi/agent/lib/subagent-envelope-contract.ts` and `ein-pi/agent/lib/agent-home.ts`; classify rather than rewrite `memory-contract.ts`, `session-accounting-store.ts` and runtime-home assertions when they describe preserved state or measured legacy stores.
  - TRIANGULATE: Prove guard policy, generated-envelope boundary and agent-home resolution are behaviorally unchanged; the naming audit must distinguish current root prose from `data-home`/measured `legacy-migration` text.
  - REFACTOR: Remove stale comments and keep reasons that explain a real boundary; register only exact surviving contexts in the audit.
  - why: Live comments and exact-path contracts guide maintainers and generators, so stale ownership wording can reintroduce old names later.
  - learn: A rename audit should classify historical facts rather than mechanically erase them.
  - architecture: Runtime state and historical Engram evidence remain stable; only current product/source ownership becomes Ein-first.
  - avoid: Do not rewrite history, broaden the audit registry, or change guardrail/session/accounting behavior.
  - verify: `bun test tests/guardrails.test.ts tests/subagent-envelope-contract.test.ts tests/engram-single-store.test.ts tests/runtime-session-adapters.test.ts tests/session-accounting-store.test.ts`

## // 010. Rename the payload inventory contract

- [x] 10.1 Make the payload inventory and types Ein-first before changing packagers and consumers.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/cc-payload-entrypoints.test.ts` to expect `EIN_CC_PAYLOAD_*`, `EinCcPayloadManifest*`, roots `ein-cc`/`ein-pi/core`, direct files under `ein-pi/`, entry `ein-cc/sdd-cli/cli.ts`, sync `ein-cc/sync.ts` and no old current member.
  - GREEN: Rename product-coded constants/types and exact inventory paths only in `installer/src/core/cc-payload-inventory.ts`; retain its generic filename because it denotes a Claude Code payload abstraction.
  - TRIANGULATE: Assert the source-entry closure includes continuity and SDD CLI, the required paths include generator/command/core assets, and stable Pi launcher data-home content is not mistaken for an old member name.
  - REFACTOR: Keep one typed inventory consumed by bundling and staging; do not duplicate member arrays in tests or scripts.
  - why: Inventory is the foundational schema for bundle, stage, manifest and compiled asset behavior.
  - learn: Renaming a shared inventory first lets downstream stale imports fail loudly.
  - architecture: `cc-payload-inventory.ts` remains generic by filename but all product identities in its API become Ein-first.
  - avoid: Do not change manifest format `ein-cc-payload/v1` unless its schema changes, and do not keep old exported aliases.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts`

## // 011. Rename the bundle producer and build callers

- [x] 11.1 Move the product-coded bundle script and produce the new archive from the renamed inventory.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/cc-payload-bundle.test.ts` and `tests/release-asset-contract.test.ts` to import/call `installer/scripts/bundle-ein-cc.ts`, require `bundleEinCcPayload`/Ein-first types, and inspect only `ein-cc-runtime.tar.gz` members.
  - GREEN: Mechanically rename `installer/scripts/bundle-cc-ein.ts` to `installer/scripts/bundle-ein-cc.ts`, rename product-coded symbols, update `installer/scripts/build-all.ts`, and regenerate the new payload asset from the renamed inputs.
  - TRIANGULATE: Bundle from a clean temporary checkout fixture, verify deterministic manifest order/checksums and fail on a missing renamed source entry; prove no output archive contains `cc-ein/` or top-level `pi-ein/`.
  - REFACTOR: Keep source-closure collection generic and rename only product identity; remove the retired script and archive after tests consume the new producer.
  - why: Source moves are not delivered until build-all and the archive producer agree on their new paths.
  - learn: Generated delivery assets should always be reproduced from renamed authoritative inputs.
  - architecture: `bundle-ein-cc.ts` is the sole archive producer; `build-all.ts` orchestrates it before compiled installers.
  - avoid: Do not copy/rename the old tarball bytes, retain a compatibility build target, or weaken manifest assertions.
  - verify: `bun test tests/cc-payload-bundle.test.ts tests/release-asset-contract.test.ts`

## // 012. Stage and validate the Ein-first Claude payload

- [x] 12.1 Rename staging/archive identity and embedded asset resolution without weakening validation.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/cc-payload-entrypoints.test.ts` and `tests/cc-payload-bundle.test.ts` to require `ein-cc-runtime.tar.gz`, Ein-first errors/types/functions, `syncPath` under `ein-cc/`, and rejection of old archive/member/current paths.
  - GREEN: Rename product-coded API and archive/member strings in `installer/src/core/cc-payload.ts`, update `installer/src/assets.d.ts`, consume the generated `installer/src/assets/ein-cc-runtime.tar.gz` from // 011, and remove `installer/src/assets/cc-ein-runtime.tar.gz` only after validation succeeds.
  - TRIANGULATE: Preserve malformed manifest, missing member, checksum mismatch, duplicate entry, symlink/non-regular member and path-escape cases; ensure cleanup removes staging after every failure.
  - REFACTOR: Keep generic `cc-payload.ts` ownership and one archive constant; keep no compatibility read of the retired archive in fresh staging.
  - why: BunFS asset names and staging paths are compile-time delivery contracts, not cosmetic labels.
  - learn: Payload renames must retain fail-closed integrity checks through every path change.
  - architecture: The payload module owns materialization/validation; inventory owns members; the preceding bundler group owns archive creation.
  - avoid: Do not hand-edit a tarball, accept an old archive fallback on fresh builds, or rename generic `cc-payload` filenames without a product reason.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts`

## // 013. Align payload smoke, CI and E2E delivery contracts

- [x] 13.1 Move every delivery caller and fixture to Ein-first current surfaces.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/cc-payload-entrypoints.test.ts`, `tests/release-asset-contract.test.ts` and `tests/beta-launcher-e2e-hardening.test.ts` to inspect the smoke, CI and Docker contracts for `ein-cc`, `ein-pi`, `ein-cc-sdd` and the new archive, with no old current alias.
  - GREEN: Update `installer/scripts/cc-payload-smoke.ts`, `.github/workflows/ci.yml`, `.github/workflows/installer-release.yml` and `e2e/docker-test.sh`; update `installer/.gitignore` only if its generated-asset rule encodes the retired archive.
  - TRIANGULATE: Cover Pi-only, Claude-only and both E2E inventories, executable SDD help, exact-one Fish functions, stable homes and absence of old launchers; compile/run the smoke from `/tmp` so it cannot fall back to checkout sources.
  - REFACTOR: Keep the smoke script's generic Claude payload filename and centralize current executable/member names through the inventory owner when practical.
  - why: CI can stay green on source tests while a compiled BunFS payload or Docker install still expects retired paths.
  - learn: Delivery identity must be asserted at the compiled and installed boundaries, not only in TypeScript imports.
  - architecture: Workflows orchestrate existing build/smoke owners; E2E observes installed artifacts and does not become cleanup logic.
  - avoid: Do not make E2E accept either spelling, skip compiled smoke, or alter release version metadata in this apply group.
  - verify: `bun test tests/cc-payload-entrypoints.test.ts tests/release-asset-contract.test.ts tests/beta-launcher-e2e-hardening.test.ts`

## // 014. Define one fail-closed legacy artifact classifier

- [x] 14.1 Add the pure `absent | owned | collision` contract and exact `0.91.0-alpha.2` proof registry as its own foundation.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Create `tests/legacy-runtime-artifacts.test.ts` with exact shipped old Fish bytes/hashes, modified/unrelated same-name functions, old SDD managed inventory, invalid/missing marker, disallowed version, symlink, directory, FIFO/other non-regular kind, path escape and substring-neighbor cases.
  - GREEN: Add only `installer/src/core/legacy-runtime-artifacts.ts` with typed exact inventory and pure classification returning `absent`, `owned` with proof, or `collision` with bounded reason. Prefix all old-name constants with `LEGACY_`.
  - TRIANGULATE: Prove Fish ownership requires versioned known bytes rather than journal/path alone; prove the old SDD binary requires exact real path under marked `.claude-ein`, allowlisted `0.91.0-alpha.2`, managed-inventory membership and no symlink/escape; prove staging cleanup accepts only exact entries inside its private root.
  - REFACTOR: Separate filesystem observations from pure policy so install/update/uninstall tests can inject lstat/hash/marker facts without touching real homes.
  - why: The old filename alone never proves Ein owns a user's function, so cleanup must fail closed at one reusable boundary.
  - learn: Ownership is evidence about bytes and containment, not a guess from a familiar path.
  - architecture: This module owns classification only; transaction modules decide when to quarantine, restore or finalize an `owned` result.
  - avoid: Do not follow symlinks, accept user confirmation as proof, use substring matching, or classify a modified file from a completed journal step.
  - verify: `bun test tests/legacy-runtime-artifacts.test.ts`

## // 015. Add the recoverable runtime-surface quarantine transaction

- [x] 15.1 Implement exact move/read-back/restore/finalize behavior independently of installer callers.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Create `tests/runtime-surface-transaction.test.ts` for new-first eligibility, exact private recovery paths, metadata/byte restoration after injected failures, collision no-op with one diagnostic, interrupted manifest recovery and final cleanup only after commit.
  - GREEN: Add only `installer/src/core/runtime-surface-transaction.ts`, consuming the classifier results from // 014 and recording exact original/recovery paths in a private transaction manifest under the existing installer recovery owner.
  - TRIANGULATE: Inject failure before any move, after first quarantine, after combined-runtime quarantine, during restore and during final cleanup; success/failure must leave either coherent old or coherent new surfaces and never move a data home.
  - REFACTOR: Make recovery replay the recorded exact move set instead of rescanning directories; keep diagnostics bounded and collisions outside the move manifest.
  - why: Immediate deletion cannot restore a usable old command when a later runtime step fails.
  - learn: Quarantine converts destructive cleanup into a reversible transaction until the new installation commits.
  - architecture: Classification proves ownership; this module owns reversible file movement; install/update/uninstall own sequencing.
  - avoid: Do not use recursive cleanup, rescan by filename during recovery, include runtime homes, or erase recovery evidence when rollback fails.
  - verify: `bun test tests/runtime-surface-transaction.test.ts tests/legacy-runtime-artifacts.test.ts`

## // 016. Make fresh install publish only current entry points

- [x] 16.1 Switch fresh Pi/Claude handlers, progress and completion to `ein-pi`, `ein-cc`, `ein-cc-sdd`, with normal guidance centered on `ein`.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Update `tests/install-plan.test.ts`, `tests/installer-plan-progress.test.ts`, `tests/installer-runtime-options.test.ts`, `tests/installer-runtime-menu.test.ts` and `tests/public-entry-story.test.ts` for new Fish filenames/source imports, `ein-cc/sync.ts`, internal `EIN_CC_HOME`, no old alias creation and completion text whose primary command is only `ein`.
  - GREEN: Update `installer/src/cli/install.ts`, `installer/src/cli/runtime-options.ts`, `installer/src/tui/progress.ts` and launcher API documentation in `installer/src/core/launcher.ts` to install the renamed current assets and use Ein-first product identifiers.
  - TRIANGULATE: Exercise Pi-only, Claude-only and both fresh installs, repeat/idempotent launcher writes, sync failure, launcher failure and a neighboring user Fish function; verify applicable new files and SDD executable while old names are never created.
  - REFACTOR: Deduplicate current launcher constants at the narrow installer seam and keep `ein`/`ein-install` roles explicit; advanced shims may appear only in secondary detail/help.
  - why: A fresh install is the clearest product contract and must never publish compatibility debris.
  - learn: Installation completion should teach one normal entry while still supporting advanced direct access.
  - architecture: `install.ts` orchestrates runtime handlers; `launcher.ts` writes one exact owned function and never enumerates neighbors.
  - avoid: Do not install old aliases, advertise runtime shims as required next steps, or let current launcher writes delete any old/user file.
  - verify: `bun test tests/install-plan.test.ts tests/installer-plan-progress.test.ts tests/installer-runtime-options.test.ts tests/installer-runtime-menu.test.ts tests/public-entry-story.test.ts`

## // 017. Extend install/journal ordering with bounded legacy cleanup

- [x] 17.1 Put classified cleanup after validated new surfaces in the managed install plan and recover it on later failure.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Extend `tests/install-plan.test.ts`, `tests/install-journal.test.ts`, `tests/install-completed-journal-reentry.test.ts` and `tests/legacy-runtime-artifacts.test.ts` with exact cleanup plan entries after current launcher/runtime validation, collision preservation, combined-runtime later failure and interrupted quarantine replay.
  - GREEN: Extend `installer/src/core/install-plan.ts` and `installer/src/core/install-journal.ts`, then wire the transaction into `installer/src/cli/install.ts`; only classifier result `owned` may create a cleanup entry, and journal completion finalizes recovery copies.
  - TRIANGULATE: Cover fresh `absent`, managed alpha Pi-only/Claude-only/both, modified old Fish collision, old SDD marker mismatch, failure before new validation and failure after one legacy quarantine; compare old/user bytes and both homes exactly.
  - REFACTOR: Keep cleanup entry ids explicit and ordered, reuse the single classifier/transaction, and avoid special-case unlink logic inside runtime handlers.
  - why: Fresh installation and reinstall/upgrade through `ein-install` share the plan/journal boundary and need new-first recoverability.
  - learn: Ordering becomes enforceable when cleanup is a named journaled plan step rather than a tail-side effect.
  - architecture: The plan chooses order, the journal persists progress, and the runtime-surface transaction owns reversible moves.
  - avoid: Do not treat a completed install journal as Fish ownership proof, finalize quarantine before global success, or block on a preserved collision.
  - verify: `bun test tests/install-plan.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts tests/legacy-runtime-artifacts.test.ts tests/runtime-surface-transaction.test.ts`

## // 018. Upgrade managed old alphas through the verified new binary

- [x] 18.1 Deploy and validate selected renamed surfaces in the child continuation before retiring owned `0.91.0-alpha.2` artifacts.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Create `tests/runtime-surface-upgrade.test.ts` and extend `tests/release-update-transaction.test.ts`, `tests/release-update-integration.test.ts` and `tests/release-update-cli.test.ts` for Pi-only/Claude-only/both marker discovery, new launcher read-back, `ein-cc-sdd --help`, collision diagnostic, quarantine rollback and unchanged homes.
  - GREEN: Add `installer/src/core/runtime-surface-upgrade.ts` and wire it through `installer/src/core/child-continuation.ts`, `installer/src/core/transaction.ts` and `installer/src/cli/update.ts` so assets come from the verified new installer/payload and cleanup commits only after continuation success.
  - TRIANGULATE: Inject failure while materializing each new launcher/runtime, after new validation, after first legacy quarantine, after template deployment and before marker commit; each result must be a coherent old or new installation with collision bytes untouched.
  - REFACTOR: Infer selected installed runtimes only from exact valid Pi/Claude markers, reuse payload/current-launcher owners, and return one typed upgrade result to the existing transaction journal.
  - why: The old updater process cannot safely publish new embedded assets; the verified child must own the renamed-surface continuation.
  - learn: Self-updating software must let the newly verified binary deploy its own embedded contract.
  - architecture: Release transaction owns candidate identity and child continuation; runtime-surface upgrade owns runtime assets; the shared quarantine transaction owns reversible legacy moves.
  - avoid: Do not deploy from old process bytes, scan homes heuristically, clean before read-back/help validation, or turn user collisions into fatal/destructive prompts.
  - verify: `bun test tests/runtime-surface-upgrade.test.ts tests/release-update-transaction.test.ts tests/release-update-integration.test.ts tests/release-update-cli.test.ts`

## // 019. Make uninstall recognize current and proven legacy assets safely

- [x] 19.1 Update uninstall inventory and recovery to remove new assets plus only classifier-proven retired artifacts.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Extend `tests/installer-uninstall.test.ts` with current Pi/Claude/both assets, managed alpha old launcher/SDD, modified/user collision, symlink/non-regular old path, interrupted move and rollback byte/metadata equality.
  - GREEN: Update `installer/src/core/uninstall-plan.ts`, `installer/src/core/uninstall-recovery.ts` and `installer/src/cli/uninstall.ts` to list current names normally, admit retired entries only after the shared classifier returns `owned`, and replay exact recorded moves.
  - TRIANGULATE: Verify no marker, invalid marker, current-only, mixed managed legacy, collision and recovery-required states; auth, sessions, history, secrets, memory, backups and both runtime-home roots remain present.
  - REFACTOR: Reuse classification/quarantine primitives rather than introducing an uninstall-specific old-name allowlist; keep dry-run/rendering aligned with actual selected entries.
  - why: Uninstall is another destructive owner and must not blindly add retired paths to a removal allowlist.
  - learn: The same ownership proof should govern install cleanup, update cleanup and uninstall cleanup.
  - architecture: Uninstall plan selects exact proven files; recovery performs reversible moves; CLI only presents/dispatches the plan.
  - avoid: Do not delete whole runtime homes, follow links, remove collisions, or rescan the directory during rollback.
  - verify: `bun test tests/installer-uninstall.test.ts tests/legacy-runtime-artifacts.test.ts tests/runtime-surface-transaction.test.ts`

## // 020. Synchronize the five authorized canonical specifications

- [x] 20.1 Apply the five persisted deltas through structured sync and prove no unselected canonical domain was hand-edited.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Extend `tests/openspec-specs.test.ts`, `tests/public-entry-story.test.ts`, `tests/surface-wiring.test.ts`, `tests/sdd-summary-write.test.ts`, `tests/sdd-flow-contract.test.ts` and `tests/style-parity-claude.test.ts` to expect the delta scenarios for Ein-first installer surfaces, secondary direct shims, owned legacy cleanup, `ein-cc-sdd summary`, current SDD lifecycle commands and the renamed Claude style-delivery boundary.
  - GREEN: Run the renamed structured command for `rename-ein-runtime-surfaces` so only `openspec/specs/installer-runtime/spec.md`, `openspec/specs/public-entry/spec.md`, `openspec/specs/surface-wiring/spec.md`, `openspec/specs/sdd-lifecycle/spec.md` and `openspec/specs/style-delivery/spec.md` receive their persisted delta operations.
  - TRIANGULATE: Verify each of the five selected scenarios against its focused behavioral test, run a second structured sync to prove idempotence, and confirm no sixth canonical domain changes.
  - REFACTOR: Remove duplicated current wording only through the five selected scenario merges and retain canonical formatting plus stable scenario identities.
  - why: Observable command and installer behavior belongs in canonical specs, but archive provenance and unselected domains cannot be modernized ad hoc.
  - learn: Structured deltas make spec mutation reviewable and repeatable.
  - architecture: The five persisted delta files for `installer-runtime`, `public-entry`, `surface-wiring`, `sdd-lifecycle` and `style-delivery` are the only authorities for canonical sync in this design.
  - avoid: Do not hand-edit canonical scenarios to bypass sync, touch `openspec/changes/archive/`, or mutate any unselected canonical domain.
  - verify: `bun ein-cc/sdd-cli/cli.ts sync rename-ein-runtime-surfaces && bun test tests/openspec-specs.test.ts tests/public-entry-story.test.ts tests/surface-wiring.test.ts tests/sdd-summary-write.test.ts tests/sdd-flow-contract.test.ts tests/style-parity-claude.test.ts`

## // 021. Rewrite root, runtime and internal documentation

- [x] 21.1 Make the repository narrative teach `ein` first and Ein-first advanced shims everywhere current.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Update `tests/readme-release-ia.test.ts`, `tests/public-entry-story.test.ts` and `tests/template-agent-inventory.test.ts` to require `ein` as first-run/post-install command, `ein-install` as repair hatch, advanced `ein-pi`/`ein-cc`, deterministic `ein-cc-sdd`, final runtime README paths and no old current examples.
  - GREEN: Rewrite current vocabulary in `README.md`, `EIN.md`, `ein-pi/README.md`, `ein-cc/README.md`, `docs/comparativa-pi-config-2026-08.md`, `docs/plan-hallazgos-dogfooding-2026-08.md`, `docs/roadmap-features-ein.md` and `docs/valoracion-estado-y-rumbo-2026-08.md`; reserve the pending changelog release entry for post-verify // 029.
  - TRIANGULATE: Check headings, commands, file trees, links, installation/update/uninstall/recovery guidance and migration notes; old commands may appear only in a clearly labelled hard-cut/legacy explanation and homes remain unchanged.
  - REFACTOR: Consolidate duplicated start instructions around `ein`, keep direct launchers in an advanced section and repair links broken by source-root moves.
  - why: Product naming is learned primarily from README and operational docs, so code-only coherence would still ship the old mental model.
  - learn: One primary door reduces cognitive load while advanced escape hatches remain discoverable.
  - architecture: Root docs own product hierarchy; runtime READMEs own direct-runtime detail; historical/current internal docs state their time context explicitly.
  - avoid: Do not advertise old aliases, rename data homes, rewrite archived OpenSpec evidence, or insert the release version before verification.
  - verify: `bun test tests/readme-release-ia.test.ts tests/public-entry-story.test.ts tests/template-agent-inventory.test.ts`

## // 022. Rewrite the public landing and start journey

- [x] 22.1 Update the landing plus the three start pages as one non-production narrative batch.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Extend `tests/docs-site-drift-detector.test.ts` and `tests/docs-site-drift-report.test.ts` with landing/overview/getting-started/first-run expectations for primary `ein`, repair `ein-install`, secondary current shims and no old current command.
  - GREEN: Update `docs-site/src/components/Landing.astro` and `docs-site/src/content/docs/00-start/{overview,getting-started,first-run}.md`.
  - TRIANGULATE: Check CTA labels, copy, install completion, first direct launch, code blocks, links and search-visible headings for Pi-only, Claude-only and both readers.
  - REFACTOR: Deduplicate introductory wording and keep runtime-specific commands out of the primary path unless explicitly labelled advanced.
  - why: Landing and first-run are the highest-impact surfaces for the new product hierarchy.
  - learn: A naming migration succeeds when the shortest user journey never requires knowing internal runtime names.
  - architecture: These four files own acquisition/onboarding copy, not runtime implementation detail.
  - avoid: Do not present `ein-pi` or `ein-cc` as required post-install commands or retain old terms in metadata/headings.
  - verify: `bun test tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts && cd docs-site && bun run build`

## // 023. Rewrite public concepts and workflow guidance

- [x] 23.1 Update the two concept and two workflow pages with the renamed deterministic/runtime boundaries.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Extend docs drift tests to expect Ein-first source roots and `ein-cc-sdd` in deterministic-boundary, SDD/OpenSpec, artifacts and workflow examples.
  - GREEN: Update `docs-site/src/content/docs/01-concepts/deterministic-boundaries.md`, `docs-site/src/content/docs/01-concepts/sdd-openspec.md`, `docs-site/src/content/docs/02-workflow/artifacts.md` and `docs-site/src/content/docs/02-workflow/workflow-overview.md`.
  - TRIANGULATE: Check diagrams/text flows, command examples, generated-vs-authoritative paths, phase persistence and cross-runtime handoff wording.
  - REFACTOR: Keep conceptual explanations runtime-neutral until a direct Claude SDD channel must be named.
  - why: Concepts and workflows can perpetuate old command names even when onboarding is correct.
  - learn: Architecture documentation should name ownership boundaries, not incidental historical paths.
  - architecture: Shared SDD semantics remain runtime-neutral; `ein-cc-sdd` is named only as Claude's deterministic transport.
  - avoid: Do not change lifecycle semantics or suggest old commands as compatibility routes.
  - verify: `bun test tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts && cd docs-site && bun run build`

## // 024. Rewrite the public runtime matrix and runtime pages

- [x] 24.1 Make all four runtime pages agree on current direct entries and stable isolated homes.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Extend docs drift tests for `runtime-overview`, `runtime-matrix`, `pi-coding-agent` and `claude-code`, including current launch/help examples, source owners and exact unchanged home/env values.
  - GREEN: Update the four files under `docs-site/src/content/docs/03-runtimes/` together as a non-production narrative batch.
  - TRIANGULATE: Compare Pi/Claude rows for normal entry `ein`, advanced `ein-pi`/`ein-cc`, Claude CLI `ein-cc-sdd`, vanilla runtime commands, isolation homes, auth/session behavior and no alias promise.
  - REFACTOR: Use one consistent vocabulary/table dimension across the four pages and repair links to `ein-pi/` and `ein-cc/` owners.
  - why: The runtime matrix is where inverse noun order is most visible and most likely to confuse users.
  - learn: Symmetric names work best when their asymmetric implementation details remain explicit.
  - architecture: Public runtime docs explain direct escape hatches while retaining `ein` as the product door.
  - avoid: Do not rename homes for visual symmetry or imply that old command aliases remain installed.
  - verify: `bun test tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts && cd docs-site && bun run build`

## // 025. Rewrite public CLI, filesystem and doctor reference

- [x] 25.1 Align reference tables and diagnostics with installed current artifacts.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Extend docs drift tests for current CLI names, Fish function filenames, Claude binary path, source roots, stable homes and doctor output expectations.
  - GREEN: Update `docs-site/src/content/docs/04-reference/cli.md`, `docs-site/src/content/docs/04-reference/filesystem.md` and `docs-site/src/content/docs/05-debug/doctor.md`.
  - TRIANGULATE: Cross-check reference rows against installer inventory for Pi-only, Claude-only and both, including `ein-install`, `ein-cc-sdd --help` and absence of old aliases.
  - REFACTOR: Keep exact paths in filesystem reference and user-level commands in CLI reference; link rather than duplicate long explanations.
  - why: Reference pages are copied verbatim during support, so one stale filename can send users to a nonexistent artifact.
  - learn: Operational docs should be validated against the same inventory that installation tests assert.
  - architecture: CLI reference owns commands; filesystem reference owns artifacts; doctor owns observable diagnosis.
  - avoid: Do not conflate source directories with data homes or list old assets as current fallback locations.
  - verify: `bun test tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts tests/installer-uninstall.test.ts && cd docs-site && bun run build`

## // 026. Rewrite public troubleshooting and recovery guidance

- [x] 26.1 Explain the hard cut, safe collision behavior and recovery without teaching destructive manual cleanup.
  - skills: `ein-discipline`, `documentation`, `bun`
  - RED: Extend docs drift tests for current launcher repair, owned legacy cleanup, preserved collisions, transaction recovery, unchanged homes and no manual recursive deletion advice.
  - GREEN: Update `docs-site/src/content/docs/05-debug/troubleshooting.md` and `docs-site/src/content/docs/05-debug/uninstall-recovery.md`.
  - TRIANGULATE: Cover missing new launcher, managed old alpha, modified old homonymous function, interrupted quarantine, invalid marker, Pi/Claude state preservation and how to use `ein-install` when `ein` is broken.
  - REFACTOR: Separate automatic managed cleanup from manual inspection/recovery steps and keep commands exact/copyable.
  - why: The rename's highest safety risk appears during recovery, where vague instructions can cause user data loss.
  - learn: A hard command cut can coexist with conservative artifact cleanup.
  - architecture: Installer classifier/transaction owns mutation; documentation explains diagnostics and recovery, not alternate deletion logic.
  - avoid: Do not tell users to `rm` old functions blindly, move runtime homes, or invoke retired commands as a repair path.
  - verify: `bun test tests/docs-site-drift-detector.test.ts tests/docs-site-drift-report.test.ts tests/installer-uninstall.test.ts tests/runtime-surface-transaction.test.ts && cd docs-site && bun run build`

## // 027. Close the live naming audit and active contract fixtures

- [x] 27.1 Update remaining tests/evaluations/current fixtures, type every intentional old match and turn the initial repository sentinel GREEN.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Run the audit from // 001 and use its full path/context report as the only residual-work list; inject one stale current example and prove the gate fails with that exact location.
  - GREEN: Update active fixtures such as `evals/apply-corpus.json`, `tests/apply-corpus-frozen.test.ts`, `tests/apply-packet-compile.test.ts`, `tests/template-agent-inventory.test.ts` and other audit-reported live test/help text to current names; add exact typed reasons only for stable data homes, classifier/upgrade fixtures and clearly labelled migration/release text.
  - TRIANGULATE: Run every test file touched by residual cleanup, then re-inject stale command, stale source root, wildcard registry and old-name current heading cases; all must fail while archive hits remain excluded and protected-tree hits remain visible.
  - REFACTOR: Sort the exact registry deterministically, remove temporary rename bridges and ensure every accepted line reports class and reason. If the protected previous change still has an unclassified hit, stop release and coordinate its owner/archive without editing it here.
  - why: Broad renames often leave frozen corpora, help fixtures and active evaluations that re-teach the retired vocabulary.
  - learn: A final audit is useful only when a pass still explains every intentional exception.
  - architecture: The typed audit is the release naming gate; archives are immutable exclusions and the previous active change remains a protected non-target.
  - avoid: Do not bless stale current examples as `legacy-migration`, exclude the protected tree, rewrite archive history, or update frozen expected bytes without regenerating them through their owner.
  - verify: `bun test tests/runtime-surface-naming-audit.test.ts tests/apply-corpus-frozen.test.ts tests/apply-packet-compile.test.ts tests/template-agent-inventory.test.ts`

## // 028. Run integrated pre-release gates without changing release identity

- [x] 28.1 Verify the complete atomic worktree and produce release-ready evidence while all version pointers remain `0.91.0-alpha.2`.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Before the integrated run, prove the gate rejects an injected stale name, a payload with an old member, a user-function collision selected for cleanup, mismatched generated Claude output and disagreement among the three existing version pointers.
  - GREEN: Run focused runtime, installer, upgrade, uninstall, payload, docs and release-contract suites; then run full tests, root/installer typechecks, installer build, compiled BunFS payload smoke, docs build, fresh/managed-upgrade E2E and manual help/completion inspection.
  - TRIANGULATE: Exercise fresh and managed `0.91.0-alpha.2` Pi-only, Claude-only and both paths plus collision and injected rollback; compare homes/state bytes and inspect archive members/executables/output for only current vocabulary.
  - REFACTOR: Remove test-only bridges/temp artifacts, regenerate owned outputs one final time and rerun the same gates from a clean worktree candidate; do not repair failures by weakening audit/classifier assertions.
  - why: The rename is atomic only when runtime, payload, installer, specs and docs pass together in the exact state that will be released.
  - learn: Release readiness is evidence from one coherent commit, not the sum of earlier partial green runs.
  - architecture: This group mutates no production/version/release state; it verifies the union of all apply groups and records results for `sdd-verify`.
  - avoid: Do not bump versions, tag, push, publish, skip generated/payload/docs gates, or touch the protected/archived trees.
  - verify: `bun test && bun run typecheck && cd installer && bun run typecheck && bun run build:all && cd ../docs-site && bun run build`

- [x] 28.2 Verify compiled payload, E2E, manual command story and protected-tree immutability as separate explicit gates.
  - skills: `ein-discipline`, `architecture`, `bun`
  - RED: Demonstrate each gate observes its intended failure using an isolated fixture or existing negative test; do not mutate the release candidate to simulate failure.
  - GREEN: Compile/run `installer/scripts/cc-payload-smoke.ts` outside the checkout fallback, run the repository E2E/release-asset commands, inspect `ein --help`, `ein-install --help`, install completion, `ein-pi`, `ein-cc`, `ein-cc-sdd --help`, and compare protected roots with the pre-apply base recorded in `apply-progress.md`.
  - TRIANGULATE: Repeat smoke from `/tmp`, inspect all four target asset contracts and confirm no current output/path/member uses a retired name; every old live audit result must carry its exact typed reason.
  - REFACTOR: Consolidate verification commands/evidence in `verify-report.md` without changing source, generated artifacts or the release identity.
  - why: Full Bun tests do not prove compiled BunFS resolution, interactive help, Docker install or protected historical bytes.
  - learn: Different boundaries need different gates even when they ship in one release.
  - architecture: `sdd-verify` owns the final evidence and decision; apply hands off an unchanged release candidate.
  - avoid: Do not accept checkout fallback smoke, manual claims without recorded output, or a plain current-working-tree diff that ignores committed changes since the pre-apply base.
  - verify: `cd installer && bun build scripts/cc-payload-smoke.ts --compile --outfile /tmp/ein-cc-payload-smoke && cd /tmp && ./ein-cc-payload-smoke`; `bun test tests/release-asset-contract.test.ts tests/beta-launcher-e2e-hardening.test.ts`; `git diff --exit-code <pre-apply-head> -- openspec/changes/fix-overlay-repaint-recovery openspec/changes/archive`

## // 029. Prepare `0.91.0-alpha.3` only after successful SDD verify

- [x] 29.1 POST-VERIFY: create the release metadata commit from the verified tip; this task is forbidden during `sdd-apply`.
  - skills: `ein-discipline`, `release`, `bun`
  - RED: With an isolated fixture or the release contract test, prove the metadata gate rejects any disagreement among tag, `installer/package.json`, `installer/src/core/version.ts` and the leading `CHANGELOG.md` version.
  - GREEN: After `verify-report.md` records `status: verified` for the exact candidate commit, update only the authoritative version in `installer/package.json`, `installer/src/core/version.ts` and the leading `CHANGELOG.md` entry to `0.91.0-alpha.3`; document Ein-first surfaces, hard cut, owned-only cleanup and unchanged data homes.
  - TRIANGULATE: Run release metadata/channel tests for canonical tag `installer-v0.91.0-alpha.3`, prerelease classification and all three pointers; rerun naming audit, full tests, typechecks, build and payload/docs smoke on the metadata commit.
  - REFACTOR: Keep release notes concise and migration wording explicitly `legacy-migration`; ensure the metadata-only change did not alter generated/runtime behavior.
  - why: Version identity must describe a fully verified candidate, never an in-progress apply tree.
  - learn: Delaying the bump prevents intermediate commits from masquerading as a releasable alpha.
  - architecture: Exactly three authoritative pointers define release identity; the existing workflow enforces their agreement.
  - avoid: Do not execute before SDD verify, add a fourth version source, rewrite old changelog entries, or tag an uncommitted/dirty tree.
  - verify: `bun test tests/release-asset-contract.test.ts tests/runtime-surface-naming-audit.test.ts && bun test && bun run typecheck && cd installer && bun run typecheck && bun run build:all`

## // 030. Tag and publish the immutable alpha from main

- [x] 30.1 POST-VERIFY: deliver `installer-v0.91.0-alpha.3` only from the clean verified metadata commit at the tip of `main`.
  - skills: `ein-discipline`, `release`
  - RED: Before tagging, make the delivery guard fail if the worktree is dirty, local `HEAD` differs from `origin/main`, the tag exists locally/remotely, version pointers disagree, or required gates are not attached to this commit.
  - GREEN: Commit and push the verified metadata change through the repository delivery owner, confirm the pushed commit is `origin/main`, create the new annotated tag once, push it once, and let `.github/workflows/installer-release.yml` publish the prerelease.
  - TRIANGULATE: Confirm the workflow checkout/tag commit equals main tip, prerelease channel is alpha, and the release contains four installer binaries, `checksums.txt` and `install.sh` with no asset/member using an old runtime identity.
  - REFACTOR: Record commit, tag and workflow URLs/identities in the release handoff; no source refactor is permitted after tag creation.
  - why: The release workflow is tag-driven and an old-main or moved tag would publish stale bytes under a new identity.
  - learn: An immutable tag is a claim about one exact reviewed commit.
  - architecture: Git main owns source truth; the tag selects that commit; the existing GitHub workflow owns building and publishing assets.
  - avoid: Do not force/move/reuse the tag, dispatch with `allow_non_main_tag`, publish manually around a failed gate, or repair a published tag in place.
  - verify: `git status --short`; `test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"`; `gh run watch <installer-release-run-id> --exit-status`; `gh release view installer-v0.91.0-alpha.3 --json isPrerelease,tagName,targetCommitish,assets`

## // 031. Smoke the published artifact and close delivery

- [x] 31.1 POST-PUBLISH: verify checksums plus fresh and managed-upgrade behavior from downloaded release assets.
  - skills: `ein-discipline`, `release`, `bun`
  - RED: Prove the published-smoke harness rejects a checksum mismatch, missing asset, old launcher/archive member, unowned collision deletion and changed runtime-home path using isolated fixtures.
  - GREEN: Download `checksums.txt`, `install.sh` and the host-matching binary from `installer-v0.91.0-alpha.3`; verify checksum, then exercise fresh Pi-only/Claude-only/both and managed `0.91.0-alpha.2` upgrade fixtures from the published binary.
  - TRIANGULATE: Confirm current launchers/SDD help, `ein`-centered completion, owned old cleanup, collision preservation, rollback injection and byte-identical Pi/Claude homes/state; inspect all published asset names and prerelease metadata.
  - REFACTOR: Remove local smoke fixtures and retain only the evidence/report links required by close; if any published smoke fails, open the next-version recovery path and never mutate this tag.
  - why: Local builds cannot prove the bytes users download are the bytes that passed the naming and safety contract.
  - learn: Publication is complete only after the released artifact reproduces the verified behavior.
  - architecture: GitHub release assets are the final delivery boundary; failures after publication advance to a new version rather than rewriting history.
  - avoid: Do not smoke checkout binaries, bypass checksums, modify real user homes, or force-republish `installer-v0.91.0-alpha.3`.
  - verify: `gh release download installer-v0.91.0-alpha.3 --pattern 'checksums.txt' --pattern 'install.sh' --pattern 'ein-installer-*' --dir <isolated-smoke-dir>` followed by checksum verification and the repository published-artifact fresh/upgrade smoke harness for Pi-only, Claude-only and both.
