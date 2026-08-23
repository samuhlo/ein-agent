# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: backup-failure-retains-cause
title: Backup failures retain actionable causes
requirement: The system MUST report the underlying actionable cause when a Pi backup fails.
Given: A backup operation fails while inspecting, reading, copying, validating, or committing an entry.
When: The installer handles the failed `pi.backup-current` operation.
Then: The journal and installer result retain a bounded cause containing the failing operation or entry and the original error detail, rather than replacing it with a generic handler-failed message; the failure remains recovery-required and no uncertain operation is marked complete.

### Scenario: pre-mutation-pi-failure-retry
title: Pre-mutation Pi failure supports fail-closed retry
requirement: The system MUST provide a supported fail-closed retry or recovery path when a Pi install fails before any Pi mutation, while preserving completed Claude work.
Given: A `both` install journal is valid and recovery-required with `recoveryCode` `handler-failed`, `pendingEntryId` `pi.backup-current`, every later Pi entry is `not-run`, and Claude entries are completed.
When: The installer starts or explicitly resumes recovery for the same plan.
Then: It preserves completed Claude entries, retries or safely recovers the failed Pi backup before any Pi mutation, keeps failed or uncertain work non-complete until success is proven, and removes or completes the journal only after the whole plan reaches a verified complete state; unsupported or ambiguous journals remain blocked.

### Scenario: real-pi-tree-backup-safety
title: Real Pi trees snapshot user state without dependency payloads or symlink traversal
requirement: The system MUST snapshot recoverable user-owned Pi state from a real existing agent tree while excluding regenerable dependency payloads and preserving legitimate symlink entries without following their targets.
Given: A Pi agent tree contains more than 10,000 files and 128 MiB in regenerable npm/node_modules payloads, an Omarchy-shaped `skills/omarchy` symlink to an external directory, package-manager `.bin` symlinks, and esbuild hardlinks alongside user-owned files.
When: The installer creates and validates a current-state backup.
Then: The backup succeeds without reading external symlink targets, records or restores safe symlink entries according to the backup contract, accepts safe hardlinked files, excludes regenerable dependency payloads, and restores user-owned regular files without escaping the agent tree.
