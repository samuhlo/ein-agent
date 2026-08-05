# OpenSpec Delta
format: openspec-delta/v1
domain: installer-runtime

## ADDED
### Scenario: safe-secret-file-writes
title: Installer safely writes secret files
requirement: The system MUST write non-empty secrets only to the configured regular, non-symbolic secret target, create or replace it with restrictive permissions, and commit the trimmed value atomically without exposing partial content.
Given: A configured secret target is missing or is an existing regular file, symbolic link, directory, or other non-regular filesystem object
When: `writeSecret` is called with a non-empty secret value
Then: The installer MUST create or atomically replace only the safe regular target with mode 0600 from creation, write the trimmed value followed by one newline, and reject unsafe targets or any failed write/rename without following or partially modifying the destination; same-directory temporary files MUST be cleaned up.

### Scenario: safe-shell-rc-writes
title: Installer safely updates the shell RC
requirement: The system MUST update a shell RC through a same-directory atomic commit only when its target is missing or an existing regular, non-symbolic file, preserving idempotency and unrelated content.
Given: A shell RC target is missing, an existing regular file with or without the Ein sentinel, a symbolic link, a directory, or another non-regular filesystem object
When: `ensureContext7Export` is called for a supported platform
Then: The installer MUST create or update the safe target without following unsafe paths, preserve existing bytes while adding at most one shell-specific sentinel block, return changed false without writing when the sentinel already exists, surface write/rename failures, and clean temporary files while leaving the destination unchanged on failure.
