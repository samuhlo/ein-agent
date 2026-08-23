status: mapped
scope_status: bounded
change: fix-installer-backup-real-trees
phase: map

## Scope boundary

Map covers the manifest-backed installer backup collector/validator/restore path, snapshot orchestration and its install-plan failure surface, journal validation/execution/startup admission, and focused regression tests. It excludes plan redesign, dependency installation, Claude implementation, update transactions, release work, and broad test/build work.

## Canonical context and behavior delta

- Canonical base: `openspec/specs/installer-runtime/spec.md` (installer-runtime; current base scenarios do not describe this hotfix).
- Delta: `openspec/changes/fix-installer-backup-real-trees/specs/installer-runtime/spec.md` adds `backup-failure-retains-cause`, `pre-mutation-pi-failure-retry`, and `real-pi-tree-backup-safety`.
- Scope evidence requires preserving user-owned state, excluding regenerable dependency payloads, recording safe links without traversal, accepting hardlinks, retaining bounded causes, and supporting only provably pre-mutation recovery. Existing fail-closed/path-safe/atomic semantics are retained.

## Current implementation map

### Backup manifest / filesystem contract

- `installer/src/core/backup-manifest.ts:11-15` defines global `files=10_000`, `bytes=128MiB`, path/manifest limits and a file-only v1 entry (`path`, `type:file`, `size`, digest, mode). There is no symlink representation.
- `isExcluded` (`:18-20`) excludes top-level regenerable/protected areas including `npm`, `node_modules`, `bin`, sessions/auth, and `skills/downloaded`; exclusion is checked before `lstat` traversal.
- `assertSafePath`/`assertSafeParent` (`:34-37`) reject linked path components and non-directory parents, establishing the root/staging safety boundary.
- `collectTree` (`:39-75`) uses sorted `readdirSync` + `lstatSync`, rejects every symlink/non-file/non-directory and regular files with `nlink !== 1`, applies global limits before reading, opens regular files with `O_NOFOLLOW`, verifies identity/size/mode before and after read, writes destination content, then sorts manifest entries.
- `parseManifest`/`validateSnapshot` (`:77-113`) require exact file-only schema, reject excluded/duplicate/path-invalid entries and enforce the same global limits/canonical ordering. Snapshot content is re-collected with exclusions disabled, so any future link representation must also be reflected in validation/digesting and safe content verification.
- `fsyncTree` (`:122-125`) currently rejects symlinks and recursively fsyncs all tree entries; `sealTree`/`unsealTree` (`:127-134`) operate on non-directory entries. These are relevant to any manifest link representation and restore lifecycle.

### Snapshot, restore, and backup error boundary

- `installer/src/core/backup.ts:122-124` `treeHash` delegates to `collectTree`, so unsupported real-tree entries prevent dedupe and return null before snapshot proper.
- `snapshot` (`:244-283`) validates agent root and backup parent, computes dedupe hash, creates `.staging-*`, calls `collectTree(..., true, fault, "snapshot:copy")`, writes canonical manifest/metadata, validates/fsyncs, atomically renames and readback-validates, then prunes. Cleanup removes staging/published artifacts. Errors currently escape with whatever collector/fs error is thrown.
- `restoreBackup` (`:288-337`) validates backup-root containment and live parent, validates manifest snapshots, stages with `collectTree(content, stage, false)`, compares manifests, swaps live tree atomically, copies excluded state back with `cpSync(... dereference:false)`, validates readback/fsyncs, and retains rollback recovery. Current `collectTree` means symlink manifest entries cannot be staged/restored; restore target construction is path-relative but needs the same no-follow/unsafe-link guarantees for the changed representation.
- `installer/src/cli/install.ts:639-649` builds Pi/Claude handlers and invokes `executeInstallPlanJournaled`; handler errors are currently caught by the journal wrapper and the caller only reports generic journal status. `pi.backup-current` is part of the plan inventory (`installer/src/core/install-plan.ts:11-29,133-152`) and precedes Pi deployment/mutation entries.

### Journal and recovery path

- `installer/src/core/install-journal.ts:8-16` journal v1 has ordered entry states plus optional `pendingEntryId` and `recoveryCode` (`handler-failed`/`interrupted`), but no persisted failure detail field.
- `validateInstallJournal` (`:42-53`) enforces exact shape, ordered IDs/runtime contracts, at most one pending, reachable runtime segments, and fail-closed recovery coherence. It already admits failed/pending recovery only when the pending entry points to a failed/pending entry and status sequence is reachable.
- `inspectInstallJournal` (`:67-69`) returns missing/valid/invalid after strict path, mode, size, canonical JSON and schema validation. `publish` (`:71-75`) uses same-directory exclusive temp, fsync, atomic rename, readback, and bounded journal-write errors.
- `executeInstallPlanJournaled` (`:77-91`) currently rejects every existing non-complete journal (`:83-84`), always creates a fresh prepared journal, marks each entry pending before handler invocation, and on thrown/`ok:false` handler result marks only that entry failed with generic `handler-failed`; it discards thrown/result `detail`. The executor stops failed runtime entries but continues later runtimes, allowing Claude to complete after Pi failure. Final completion persists only after all entries succeed.
- `runInstall` (`installer/src/cli/install.ts:581-676`) independently blocks startup on any valid non-complete journal (`:592-599`) before plan creation/banner/handlers. This is the install-facing admission point that must distinguish the narrowly supported pre-mutation `both` + `pi.backup-current` recovery from all other invalid/ambiguous/interrupted states.

## Existing focused tests and required extension seams

- `tests/installer-backup.test.ts` is the existing snapshot/restore contract suite (codegraph caller map confirms `snapshot`, `restoreBackup`, listing/pruning coverage). Add fixture coverage there for: external Omarchy symlink, `.bin` symlinks, hardlinked regular files, large excluded dependency payload, user files, no external traversal, deterministic manifest/link behavior, unsafe-link/path rejection, restore containment, and bounded non-excluded limits.
- `tests/install-journal.test.ts:18-70` already covers canonical/bounded journals, ordered reachable recovery states, generic handler failure without raw detail, publication faults, symlink/private journal stores, startup blocking, complete-journal reentry, and interruption. Extend the existing helpers (`plan`, `handlers`, `recovery`, `fsOps`) rather than introducing a second journal model. Required focused assertions: returned and persisted backup cause identifies operation/relative entry while bounded; `pi.backup-current` remains failed/non-complete; a valid `both` pre-mutation recovery retries through the supported path while completed Claude remains completed; later/uncertain Pi entries do not become complete; invalid, interrupted-after-mutation, path-escaping, unsafe-link, malformed-manifest and unsupported recovery remain blocked.
- `tests/install-completed-journal-reentry.test.ts` is a caller-adjacent regression suite for completed-journal behavior; inspect only if a recovery admission change affects its existing complete-journal expectation. `tests/installer-runtime-menu.test.ts` is an existing backup caller but is outside the focused change unless public install behavior must be asserted.

## Dependency / blast-radius summary

Primary production files: `installer/src/core/backup-manifest.ts`, `installer/src/core/backup.ts`, `installer/src/core/install-journal.ts`, and the install-facing admission/handler surface in `installer/src/cli/install.ts`. Supporting contract context: `installer/src/core/install-plan.ts` and `installer/src/core/install-executor.ts` (ordering, handler result detail, runtime stop behavior); do not redesign them unless the acceptance criteria cannot be met at the identified seams. Primary tests: `tests/installer-backup.test.ts`, `tests/install-journal.test.ts`.

Important invariants to carry into design: no symlink target dereference; no arbitrary filesystem object support; path roots must remain canonical and non-linked; manifest/metadata/content digests remain linked and canonical; excluded state is not backed up but is preserved during restore; only verified complete execution clears the journal; uncertain Pi mutation remains blocked.

## Mapping decisions / questions for design

1. Choose the smallest backward-compatible manifest representation for safe symlink metadata and update canonical/content digest, validation, copy, fsync, and restore consistently; do not infer link targets by reading them.
2. Replace global limits only insofar as excluded dependency payloads are skipped before accounting; retain a bounded fail-closed budget for recoverable user content and manifest/path sizes.
3. Propagate a bounded, sanitized operation/relative-entry/original-detail cause through handler result, executor failure detail, and persisted journal without exposing arbitrary environment/private data or allowing journal growth.
4. Recovery admission must prove the exact pre-mutation state from journal shape/entry identity, preserve completed Claude entries, retry from the failed Pi backup boundary, and reject interrupted/ambiguous/after-mutation/unsupported states. Journal state transitions must not falsely complete skipped or uncertain entries.

No tests, builds, typechecks, or production-tree operations were run in map phase.

ledger:
  reads:
    - { path: "openspec/changes/fix-installer-backup-real-trees/scope.md", lines: "1-61", estimated_tokens: 1500 }
    - { path: "openspec/specs/installer-runtime/spec.md", lines: "1-48", estimated_tokens: 900 }
    - { path: "openspec/changes/fix-installer-backup-real-trees/specs/installer-runtime/spec.md", lines: "1-25", estimated_tokens: 550 }
    - { path: "installer/src/core/backup-manifest.ts", lines: "11-134", estimated_tokens: 2600 }
    - { path: "installer/src/core/backup.ts", lines: "119-344", estimated_tokens: 2500 }
    - { path: "installer/src/core/install-journal.ts", lines: "8-91", estimated_tokens: 2300 }
    - { path: "installer/src/cli/install.ts", lines: "581-676", estimated_tokens: 1100 }
    - { path: "installer/src/core/install-plan.ts", lines: "1-30,133-180", estimated_tokens: 1200 }
    - { path: "installer/src/core/install-executor.ts", lines: "10-53", estimated_tokens: 650 }
    - { path: "tests/installer-backup.test.ts", lines: "caller map only; focused suite", estimated_tokens: 300 }
    - { path: "tests/install-journal.test.ts", lines: "1-70", estimated_tokens: 2200 }
  webfetch_used: false
  budget_consumed: { tokens: 15800, reads: 11 }
  budget_exceeded: true
