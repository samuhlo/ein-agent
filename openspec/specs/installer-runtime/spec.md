# OpenSpec Specification
format: openspec-spec/v1
domain: installer-runtime

## Scenario: backup-failure-retains-cause
title: Backup failures retain actionable causes
requirement: The system MUST report the underlying actionable cause when a Pi backup fails.
Given: A backup operation fails while inspecting, reading, copying, validating, or committing an entry.
When: The installer handles the failed `pi.backup-current` operation.
Then: The journal and installer result retain a bounded cause containing the failing operation or entry and the original error detail, rather than replacing it with a generic handler-failed message; the failure remains recovery-required and no uncertain operation is marked complete.

## Scenario: claude-code-complement-installation
title: Claude Code installs only as a complement to the Ein Pi core
requirement: The system MUST install Pi before the optional Claude Code surface, and MUST never create a new Claude-only Ein installation.
Given: Ein with the Claude Code complement is selected
When: installation runs
Then: the Pi core deploys and verifies first; only then `bun ein-cc/sync.ts` runs, `ein-cc.fish` and `ein-cc-sdd` are published, and a Pi failure leaves every Claude step untouched

## Scenario: claude-payload-materializes-canonical-orchestrator
title: Claude payload materializes the canonical orchestrator asset into the installed home
requirement: The system MUST validate and extract the packaged Claude payload, run its existing checkout/runtime sync hand-off, and leave the canonical orchestrator asset at the installed Claude home path `assets/orchestrator.md` with identical bytes.
Given: Given a packaged Claude payload containing the canonical orchestrator asset, an installed Claude home, and the existing transport and checkout sync contracts.
When: When Claude runtime installation stages the payload and invokes the existing sync hand-off.
Then: Then validation rejects an incomplete or checksum-invalid payload, extraction works from a compiled BunFS asset, and the installed home contains byte-identical `assets/orchestrator.md` without reimplementing transport or sync semantics.

## Scenario: cross-platform-installer-version-display
title: Installer version display is consistent on macOS
requirement: The system MUST display the running installer SemVer consistently on macOS without introducing a separate public display version.
Given: A supported macOS installer binary is invoked through its version or interactive banner surface
When: the installer renders its version
Then: the displayed installer version identifies the running binary using the same SemVer contract as Linux, while the existing template-version probe remains available where required

## Scenario: install-journal-canonical-codec-boundary
title: Stored journals cross one canonical codec boundary
requirement: The system MUST accept stored installation journal bytes only when they decode to a structurally valid and reachable journal and exactly match that journal's canonical encoding.
Given: stored bytes contain a canonical valid journal, malformed JSON, a structurally invalid journal, an unreachable journal, or valid but non-canonical JSON
When: the installer decodes the stored journal
Then: only the canonical valid and reachable bytes produce a journal, while every other input produces the stable recovery-required outcome

## Scenario: install-journal-lifecycle-remains-single-owner
title: Journaled execution preserves checkpoints and terminal lifecycle exactly once
requirement: The system MUST coordinate journal transitions, persistence, signals, rollback and finalization through their owning boundaries without changing the observable installation lifecycle.
Given: a fresh plan, an admitted retry, a handler or persistence failure, an interruption, or a successful global commit
When: journaled execution runs
Then: it persists each required reachable checkpoint, executes only admitted handlers, removes its signal listeners, and invokes rollback or finalization at most once according to the proven terminal outcome

## Scenario: install-journal-resume-policy-is-consistent
title: CLI and execution use one fail-closed resume policy
requirement: The system MUST classify installation journal resume eligibility identically before CLI effects and before journaled plan mutation, without broadening the supported recovery cases.
Given: a matching supported pre-mutation Pi retry, a matching supported retirement retry, or any other valid non-complete journal
When: installation startup and journaled execution decide whether work may continue
Then: both admit exactly the same two supported retry kinds and reject every ambiguous case before any handler runs

## Scenario: installer-bootstrap-mandatory-checksum
title: Bootstrap installation requires a verified checksum
requirement: The system MUST install the selected bootstrap release asset only after downloading checksums.txt and verifying exactly one valid checksum entry matches the asset.
Given: the bootstrap has selected and downloaded a platform release asset and requested checksums.txt
When: checksums.txt is unavailable, malformed, missing exactly one entry for the selected asset, or contains a digest that differs from the downloaded asset
Then: the installer exits nonzero before publishing or executing the asset; when checksums.txt is valid and the digest matches, the installer verifies first and then uses the existing successful installation path

## Scenario: noninteractive-runtime-flag-selection
title: Non-interactive installer accepts Ein or Ein with Claude
requirement: The system MUST accept --runtime pi or --runtime both for non-interactive installation, default to Pi when the flag is omitted, and reject Claude-only and unsupported values before running a runtime path.
Given: ein install is invoked with --yes and an optional --runtime value
When: the installer parses the flags and selects runtime targets
Then: Pi always runs as the Ein core, Claude runs only after Pi when `both` is selected, omission preserves the Pi core behavior, and Claude-only or an invalid value fails before installation

## Scenario: pi-runtime-isolated-installation
title: Pi target installs the isolated Ein-first runtime surface
requirement: The system MUST deploy Ein for Pi through the existing isolated-agent resolution, install `ein-pi.fish`, preserve `~/.pi-ein/agent`, and migrate legacy Ein from `~/.pi/agent` only when legacy Ein is detected.
Given: the Pi runtime path is selected
When: installation runs with an isolated or legacy Pi agent state
Then: the template targets the unchanged isolated Pi data directory, the `ein-pi` launcher is installed under the Fish functions directory, and a detected legacy installation is migrated without treating an ordinary vanilla Pi directory as Ein

## Scenario: pi-template-includes-all-shared-typescript
title: Pi template includes every shared TypeScript module
requirement: The system MUST derive the Pi template shared-module overlay from every regular TypeScript source in shared/contracts and shared/sdd instead of a duplicated hand-maintained inventory.
Given: the shared runtime roots contain regular TypeScript modules, an invalid TypeScript-shaped entry, or duplicate flat overlay names
When: the installer builds the Pi template archive
Then: every valid shared module is copied byte-identically into the installed lib overlay, while invalid sources and name collisions fail before an apparently complete archive is produced

## Scenario: pi-template-runtime-graph-is-closed
title: Pi template validates its installed runtime graph
requirement: The system MUST publish a Pi template only when every shared module has a pure checkout facade and the staged TypeScript graph resolves and links from the entrypoints Pi loads or executes.
Given: a shared module is missing its facade, a facade contains runtime composition, a relative value or type import is missing or escapes the staged payload, or an entrypoint imports an absent named export
When: the installer builds the Pi template archive
Then: the build fails before publishing the archive; a valid flat overlay resolves entirely inside the payload and all Pi runtime entrypoints compile from the installed layout

## Scenario: pre-mutation-pi-failure-retry
title: Pre-mutation Pi failure supports fail-closed retry
requirement: The system MUST provide a supported fail-closed retry or recovery path when a Pi install fails before any Pi mutation, while accepting both current deferred-Claude journals and completed-Claude journals written by alpha.3/alpha.4.
Given: A `both` install journal is valid and recovery-required with `recoveryCode` `handler-failed`, `pendingEntryId` `pi.backup-current`, every later Pi entry is `not-run`, and all Claude entries are either `not-run` or all `completed`.
When: The installer starts or explicitly resumes recovery for the same plan.
Then: It preserves legacy completed Claude entries or defers untouched Claude entries until Pi succeeds, retries the failed Pi backup before any Pi mutation, and completes the journal only after the whole selected installation is verified; unsupported or ambiguous journals remain blocked.

## Scenario: real-pi-tree-backup-safety
title: Real Pi trees snapshot user state without dependency payloads or symlink traversal
requirement: The system MUST snapshot recoverable user-owned Pi state from a real existing agent tree while excluding regenerable dependency payloads and preserving legitimate symlink entries without following their targets.
Given: A Pi agent tree contains more than 10,000 files and 128 MiB in regenerable npm/node_modules payloads, an Omarchy-shaped `skills/omarchy` symlink to an external directory, package-manager `.bin` symlinks, and esbuild hardlinks alongside user-owned files.
When: The installer creates and validates a current-state backup.
Then: The backup succeeds without reading external symlink targets, records or restores safe symlink entries according to the backup contract, accepts safe hardlinked files, excludes regenerable dependency payloads, and restores user-owned regular files without escaping the agent tree.

## Scenario: claude-complement-failure-preserves-pi
title: A failed Claude complement does not trap the working Pi core
requirement: The system MUST keep a verified Pi deployment usable when the optional Claude complement fails and MUST admit a fresh, ownership-proven Pi or Pi-plus-Claude transaction on retry.
Given: a `both` install journal completed every shared and Pi entry, failed in a Claude entry, and a fresh observation proves the Pi tree is installer-owned and isolated
When: the user retries Ein alone or Ein with the Claude complement
Then: the installer starts a fresh transaction from the verified Pi core, never treats Claude as the core, and either completes Pi alone or retries Claude only after Pi is ready; ambiguous ownership remains blocked.

## Scenario: runtime-menu-target-selection
title: Installer offers Ein with an optional Claude complement
requirement: The system MUST offer Ein and Ein with Claude Code, with Pi present in every install choice.
Given: the interactive installer menu is opened
When: the user selects Ein or Ein with Claude Code
Then: the installer runs Pi exactly once and runs Claude exactly once only for the complement choice

## Scenario: runtime-surface-rename-cleans-owned-legacy-entrypoints
title: Upgrade removes only installer-owned retired runtime entry points
requirement: The system MUST publish the Ein-first runtime launchers and SDD command before removing retired installer-owned entry points, and MUST NOT delete unrelated user-owned files or migrate runtime data homes.
Given: an existing managed alpha installation contains retired runtime launcher or SDD executable names
When: the supported install or update path deploys the renamed runtime surfaces
Then: the new entry points are usable, each retired installer-owned entry point is removed through a bounded explicit cleanup, unrelated functions remain byte-identical, and the Pi and Claude data homes stay in place

## Scenario: safe-secret-file-writes
title: Installer safely writes secret files
requirement: The system MUST write non-empty secrets only to the configured regular, non-symbolic secret target, create or replace it with restrictive permissions, and commit the trimmed value atomically without exposing partial content.
Given: A configured secret target is missing or is an existing regular file, symbolic link, directory, or other non-regular filesystem object
When: `writeSecret` is called with a non-empty secret value
Then: The installer MUST create or atomically replace only the safe regular target with mode 0600 from creation, write the trimmed value followed by one newline, and reject unsafe targets or any failed write/rename without following or partially modifying the destination; same-directory temporary files MUST be cleaned up.

## Scenario: safe-shell-rc-writes
title: Installer safely updates the shell RC
requirement: The system MUST update a shell RC through a same-directory atomic commit only when its target is missing or an existing regular, non-symbolic file, preserving idempotency and unrelated content.
Given: A shell RC target is missing, an existing regular file with or without the Ein sentinel, a symbolic link, a directory, or another non-regular filesystem object
When: `ensureContext7Export` is called for a supported platform
Then: The installer MUST create or update the safe target without following unsafe paths, preserve existing bytes while adding at most one shell-specific sentinel block, return changed false without writing when the sentinel already exists, surface write/rename failures, and clean temporary files while leaving the destination unchanged on failure.
