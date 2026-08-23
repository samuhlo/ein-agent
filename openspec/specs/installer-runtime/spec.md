# OpenSpec Specification
format: openspec-spec/v1
domain: installer-runtime

## Scenario: backup-failure-retains-cause
title: Backup failures retain actionable causes
requirement: The system MUST report the underlying actionable cause when a Pi backup fails.
Given: A backup operation fails while inspecting, reading, copying, validating, or committing an entry.
When: The installer handles the failed `pi.backup-current` operation.
Then: The journal and installer result retain a bounded cause containing the failing operation or entry and the original error detail, rather than replacing it with a generic handler-failed message; the failure remains recovery-required and no uncertain operation is marked complete.

## Scenario: claude-code-runtime-installation
title: Claude Code target installs cc-ein
requirement: The system MUST install the Claude Code EIN runtime by invoking bun cc-ein/sync.ts and installing cc-ein.fish under the Fish functions directory.
Given: the Claude Code runtime path is selected
When: installation runs
Then: cc-ein/sync.ts is invoked with Bun, cc-ein.fish is installed, and the installer reports a failed Claude Code path when either operation fails

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

## Scenario: installer-bootstrap-mandatory-checksum
title: Bootstrap installation requires a verified checksum
requirement: The system MUST install the selected bootstrap release asset only after downloading checksums.txt and verifying exactly one valid checksum entry matches the asset.
Given: the bootstrap has selected and downloaded a platform release asset and requested checksums.txt
When: checksums.txt is unavailable, malformed, missing exactly one entry for the selected asset, or contains a digest that differs from the downloaded asset
Then: the installer exits nonzero before publishing or executing the asset; when checksums.txt is valid and the digest matches, the installer verifies first and then uses the existing successful installation path

## Scenario: noninteractive-runtime-flag-selection
title: Non-interactive installer accepts an explicit runtime
requirement: The system MUST accept --runtime pi, --runtime claude, or --runtime both for non-interactive installation, default to Pi when the flag is omitted, and reject unsupported values before running a runtime path.
Given: ein install is invoked with --yes and an optional --runtime value
When: the installer parses the flags and selects runtime targets
Then: Pi, Claude Code, or both run in the existing Pi-then-Claude order exactly as selected, omission preserves the current Pi-only behavior, and an invalid value fails before installation

## Scenario: pi-runtime-isolated-installation
title: Pi target installs the isolated EIN runtime
requirement: The system MUST deploy Pi EIN through the existing isolated-agent resolution, install pi-ein.fish, and migrate legacy EIN from ~/.pi/agent only when legacy EIN is detected.
Given: the Pi runtime path is selected
When: installation runs with an isolated or legacy Pi agent state
Then: the template targets the isolated Pi directory, the pi-ein launcher is installed under the Fish functions directory, and a detected legacy installation is migrated without treating an ordinary vanilla Pi directory as EIN

## Scenario: pre-mutation-pi-failure-retry
title: Pre-mutation Pi failure supports fail-closed retry
requirement: The system MUST provide a supported fail-closed retry or recovery path when a Pi install fails before any Pi mutation, while preserving completed Claude work.
Given: A `both` install journal is valid and recovery-required with `recoveryCode` `handler-failed`, `pendingEntryId` `pi.backup-current`, every later Pi entry is `not-run`, and Claude entries are completed.
When: The installer starts or explicitly resumes recovery for the same plan.
Then: It preserves completed Claude entries, retries or safely recovers the failed Pi backup before any Pi mutation, keeps failed or uncertain work non-complete until success is proven, and removes or completes the journal only after the whole plan reaches a verified complete state; unsupported or ambiguous journals remain blocked.

## Scenario: real-pi-tree-backup-safety
title: Real Pi trees snapshot user state without dependency payloads or symlink traversal
requirement: The system MUST snapshot recoverable user-owned Pi state from a real existing agent tree while excluding regenerable dependency payloads and preserving legitimate symlink entries without following their targets.
Given: A Pi agent tree contains more than 10,000 files and 128 MiB in regenerable npm/node_modules payloads, an Omarchy-shaped `skills/omarchy` symlink to an external directory, package-manager `.bin` symlinks, and esbuild hardlinks alongside user-owned files.
When: The installer creates and validates a current-state backup.
Then: The backup succeeds without reading external symlink targets, records or restores safe symlink entries according to the backup contract, accepts safe hardlinked files, excludes regenerable dependency payloads, and restores user-owned regular files without escaping the agent tree.

## Scenario: runtime-menu-target-selection
title: Installer offers explicit runtime targets
requirement: The system MUST offer Pi, Claude Code, and both as installer runtime choices and execute only the selected runtime path or paths.
Given: the interactive installer menu is opened
When: the user selects Pi, Claude Code, or both
Then: the installer runs the corresponding target path exactly once and does not run an unselected runtime path

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
