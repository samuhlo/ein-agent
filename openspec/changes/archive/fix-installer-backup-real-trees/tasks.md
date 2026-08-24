# Tasks — fix-installer-backup-real-trees

status: ready
blocked_by: none

## // 001. Manifest v2 contract and dependency classification

- [x] 1.1 Add focused RED tests for canonical v1 compatibility, v2 file/symlink entry shape, bounded opaque targets, canonical ordering/digest discrimination, node_modules/dependency exclusion before lstat/accounting, and hardlink acceptance in `tests/installer-backup.test.ts`; then implement the minimal manifest types/constants/validation/collection changes in `installer/src/core/backup-manifest.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Establishes the foundational backup-manifest contract before snapshot and restore consumers depend on it.
  - learn: Version a changed manifest meaning explicitly; exclude regenerable roots before touching their filesystem entries.
  - architecture: `backup-manifest.ts` owns entry representation, traversal safety, canonicalization, bounds, and content identity; it must not dereference links.
  - avoid: Raising global limits or silently extending v1, which weakens fail-closed bounds and compatibility.
  - verify: `bun test tests/installer-backup.test.ts -t "manifest|exclude|hardlink"`; record RED before implementation, GREEN after, TRIANGULATE with tampered/non-canonical fixtures, and REFACTOR only after behavior is green.

## // 002. Manifest content staging and durable non-following restore

- [x] 2.1 Add RED tests for symlink staging/restoration, external and `..` targets, symlink ancestor/path collisions, linked destination parents, tampered manifests, and v1/v2 snapshot validation before live mutation in `tests/installer-backup.test.ts`; then update `installer/src/core/backup.ts` and `installer/src/core/backup-manifest.ts` to materialize links as nodes, verify real parents, and fsync/seal without following links.
  - skills: `ein-discipline`, `architecture`
  - why: Proves the new foundational representation remains safe through snapshot validation, staging, atomic restore, and durability boundaries.
  - learn: Validate the empty stage and every real parent before creating a link; fsync the containing directory rather than the link target.
  - architecture: Manifest logic validates/copies node content; `backup.ts` retains ownership of staging, excluded-state reinsertion, atomic swap, and rollback.
  - avoid: Using generic recursive copy/chmod/fsync APIs that may follow a symlink or allow a replaced parent to escape the root.
  - verify: `bun test tests/installer-backup.test.ts -t "symlink|restore|tamper|v1|v2"`; require RED, GREEN, TRIANGULATE with path-escape/conflict fixtures, then REFACTOR evidence.

## // 003. Real-tree snapshot orchestration regression

- [x] 3.1 Extend the Omarchy-shaped fixture with external `skills/omarchy`, excluded `.bin` links and oversized dependency payloads, included hardlinked/user files, and no-traversal assertions; prove snapshot/restore success and bounded included-state rejection in `tests/installer-backup.test.ts`, refining `installer/src/core/backup.ts` only where orchestration needs to pass the manifest v2 contract.
  - skills: `ein-discipline`, `architecture`
  - why: Connects the manifest contract to the real snapshot/restore workflow and acceptance fixture without redesigning plan or dependency installation.
  - learn: Large trees are safe when excluded structurally; recoverable user state remains bounded independently.
  - architecture: `backup.ts` coordinates dedupe, staging, publication, restore, and excluded state; dependency policy remains in the manifest collector.
  - avoid: Copying dependency bytes into backups or treating all `.bin` paths as globally excluded.
  - verify: `bun test tests/installer-backup.test.ts -t "Omarchy|real tree|dependency|hardlink"`; capture RED/GREEN, TRIANGULATE via external-target sentinel and over-limit included fixture, then REFACTOR.

## // 004. Bounded actionable backup failure contract

- [x] 4.1 Add RED tests asserting operation/relative-entry/original-detail propagation, UTF-8 <=512-byte sanitization, generic fallback, and truthful failed `pi.backup-current` state in `tests/install-journal.test.ts`; then implement bounded failure context in `installer/src/core/backup.ts` and `installer/src/core/install-executor.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Keeps the backup cause useful at the handler/executor boundary while preventing private-path, stack, or unbounded native error leakage.
  - learn: Sanitize and bound errors at the narrow boundary that first has operation and relative-entry context.
  - architecture: Backup creates actionable domain detail; executor preserves handler detail with a generic fallback and does not reinterpret recovery safety.
  - avoid: Persisting raw thrown errors or making the journal responsible for filesystem error parsing.
  - verify: `bun test tests/install-journal.test.ts -t "backup failure|cause|detail"`; require RED before production edits, GREEN, TRIANGULATE with long/control/absolute-path errors, and REFACTOR evidence.

## // 005. Journal failure schema and pre-mutation retry

- [x] 5.1 Add RED tests for optional bounded failure detail validation and the exact admissible `both` recovery predicate, including completed Claude preservation, failed backup retry, later Pi non-completion, and rejection of interrupted/mutated/migration/ambiguous/plan-mismatched journals in `tests/install-journal.test.ts`; then implement journal schema/validation and execution resume in `installer/src/core/install-journal.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Makes recovery eligibility explicit and fail-closed before the install-facing caller admits it.
  - learn: Resume only from durable evidence of pre-mutation failure; never infer safety from ordering alone.
  - architecture: `install-journal.ts` owns journal invariants, admissibility, state transitions, and truthful completion; completed entries remain immutable evidence.
  - avoid: Restarting a fresh plan or retrying every handler-failed journal, which can rerun uncertain Pi or completed Claude work.
  - verify: `bun test tests/install-journal.test.ts -t "recovery|retry|completed Claude|unsupported|interrupted"`; record RED/GREEN, TRIANGULATE with rejection matrix and repeated failure, then REFACTOR.

## // 006. Install admission and final verification

- [x] 6.1 Add RED caller tests for startup admission of only the supported pre-mutation recovery and blocking all other valid non-complete journals in `tests/install-journal.test.ts`, updating `tests/install-completed-journal-reentry.test.ts` only if its existing complete-journal contract is affected; then update `installer/src/cli/install.ts` to build the same-plan read-only admission and route the supported retry without side effects.
  - skills: `ein-discipline`, `architecture`
  - why: Exposes the supported recovery path at the actual install boundary while preserving startup fail-closed behavior.
  - learn: Admission may inspect and match a plan, but handlers and side effects start only after recovery eligibility is proven.
  - architecture: CLI owns startup/admission and user-facing result reporting; journal core owns recovery predicate and execution truth.
  - avoid: Broad startup recovery, rerunning Claude, changing plan ordering, or weakening invalid-journal blocking.
  - verify: `bun test tests/installer-backup.test.ts tests/install-journal.test.ts tests/install-completed-journal-reentry.test.ts && bun test && bun run typecheck && (cd installer && bun run typecheck)`; require RED/GREEN/TRIANGULATE/REFACTOR evidence for the caller tests, and do not run a production build.
