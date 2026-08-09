# Tasks — reviewed-area-ledger

status: ready
blocked_by: none

## // 001. Foundational area, evidence, and ledger schema

- [x] 1.1 Add `ein-pi/agent/lib/reviewed-area-ledger.ts` v1 types and pure normalization for typed file/tree selectors, bounded records, strict opaque evidence identifiers, Git bindings, and immutable result types; add RED/GREEN tests in `tests/reviewed-area-ledger.test.ts` for path safety, ordering, duplicate/redundant selectors, bounds, privacy, and area ID (`area-v1:sha256:`).
  - skills: `ein-discipline`, `architecture`
  - why: Establishes the sole stable contract before any evaluator or adapter consumes it.
  - learn: Identity must hash canonical boundaries, never labels or ambient repository state.
  - architecture: Keep domain validation and canonical identity pure in `ein-pi/agent/lib`; tests own fixtures and do not invoke Git or sessions.
  - avoid: Glob expansion, named seams, silent deduplication, or class-heavy schema machinery.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

- [x] 1.2 Implement pure canonical v1 parse/serialize in `ein-pi/agent/lib/reviewed-area-ledger.ts`; test fixed key order, byte-identical permutation output, terminal newline, size/record limits, unknown fields, duplicate keys/IDs, unsupported versions, malformed content, and absence semantics.
  - skills: `ein-discipline`, `architecture`
  - why: Makes persistence bytes deterministic and prevents partial trust of corrupt or future data.
  - learn: Absent means empty valid ledger; read errors and unsupported versions are unavailable, while malformed known-v1 bytes are invalid.
  - architecture: Serialization is a pure boundary over injected bytes/data and never reads or writes files.
  - avoid: JSON round-tripping that accepts unknown fields or stores derived freshness.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

## // 002. Pure fail-closed transition intersection

- [x] 2.1 Add pure `intersects(area, transition)` behavior to `ein-pi/agent/lib/reviewed-area-ledger.ts`, consuming bounded B-shaped transitions and applying exact/tree matching to added, modified, type-changed, unmerged, deleted, renamed, copied, index, tracked-worktree, and explicit in-area untracked paths; add fixtures and RED/GREEN/TDD triangulation in `tests/reviewed-area-ledger.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: Prevents snapshot-difference guessing and makes affected-area invalidation deterministic.
  - learn: Rename/copy crosses invalidate both endpoints; deletion invalidates the deleted path.
  - architecture: G owns only pure path intersection; B remains owner of transition meaning and state references.
  - avoid: Treating `ProjectGitState.changes` as “since review,” running Git, or interpreting `GitBaseline`.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

- [x] 2.2 Implement pure evaluator precedence in `ein-pi/agent/lib/reviewed-area-ledger.ts` and tests for `reviewed/current`, `unreviewed`, `stale`, `invalid`, `unavailable`, and `unknown`, including exact state equality, dirty equality, mismatch/unaffected, absent/unbound/unsafe/overflowed transitions, and evidence results `verified|missing|mismatch|invalid|unavailable`.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures no fail-closed condition can be upgraded to reviewed and no ambiguity is falsely called stale.
  - learn: No session, artifact, automation, or cleanliness signal is evidence of approval or review.
  - architecture: Evaluator accepts immutable B/F normalized inputs and returns deeply immutable bounded reasons/references; it has no I/O, clock, session, or writer capability.
  - avoid: Implicit evidence discovery, approval/lifecycle wording, or returning raw Git/evidence payloads.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

## // 003. Workspace-local read adapter and exclusion contract

- [x] 3.1 Create the narrow rule in `openspec/.gitignore` for `reviewed-area-ledger.json` and add `ein-pi/agent/lib/reviewed-area-ledger-store.ts` read-only byte loading for workspace-local `openspec/reviewed-area-ledger.json`; test absent, unreadable, oversized, malformed, future-version, and workspace-local (not global) resolution without mutation.
  - skills: `ein-discipline`, `architecture`
  - why: Gives audits one canonical local source while preserving B-owned Git projection and fail-closed authority states.
  - learn: The ledger is ignored locally but is not a second project-state source; source workspace selection must be explicit.
  - architecture: Store adapter owns bounded filesystem reads only; evaluator remains pure and receives parsed/injected data.
  - avoid: Global home-directory stores, migration/repair/truncation, automatic ignore changes, or reader-side writes.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

- [x] 3.2 Add focused store tests proving repeated reads/evaluations leave ledger bytes, source bytes, index/worktree, and SDD artifacts unchanged, and that privacy-safe output excludes prompts, transcripts, commands, secrets, session IDs, private paths, and reviewer names.
  - skills: `ein-discipline`, `architecture`
  - why: Locks the read-only and privacy boundaries before consumers are connected.
  - learn: Observability must not become an implicit persistence or evidence-resolution side effect.
  - architecture: Tests use temporary workspace-local fixtures and injected F lookup results, never process/session discovery.
  - avoid: Snapshotting raw evidence or adding caches/watchers/background refresh.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

## // 004. Explicit atomic persistence owner

- [x] 4.1 Add explicit atomic compare-and-swap replacement to `ein-pi/agent/lib/reviewed-area-ledger-store.ts`, requiring B-owned exclusion proof, validating the complete bounded snapshot, checking prior digest, exclusive sibling temp creation, sync, atomic rename, and parent-directory sync where supported; test permissions, cleanup, concurrent/precondition failure, and every failure preserving prior bytes.
  - skills: `ein-discipline`, `architecture`
  - why: Makes the sole human-invoked recording seam safe without granting writers to audits.
  - learn: Atomicity includes precondition and cleanup behavior, not merely rename.
  - architecture: Writer is an explicit adapter API separate from reads/evaluation; it never checks or changes Git ignore state itself.
  - avoid: Merge-on-conflict, fallback overwrite, autonomous mutation, parallel writers, or wiring a scheduler/watcher.
  - verify: `bun test tests/reviewed-area-ledger.test.ts`

## // 005. Read-only B/F integration and invariants

- [x] 5.1 Integrate read-only ledger evaluation at the existing project-state/evidence consumer seam (`ein-pi/agent/lib/project-state.ts` and `ein-pi/agent/lib/shared-config-update-advisor.ts`, only where their existing contracts expose B/F inputs); extend `tests/reviewed-area-ledger.test.ts` with injected B/F fixtures and evidence-resolution unavailable states.
  - skills: `ein-discipline`, `architecture`
  - why: Connects G to authoritative B/F inputs without duplicating Git or evidence ownership.
  - learn: Missing session never implies review, and unavailable evidence resolution never becomes current.
  - architecture: Consumers receive read/evaluate capability only; no writer, session discovery, launcher, lifecycle, or approval behavior is added.
  - avoid: Expanding B/F APIs, importing raw sessions, or changing H–L/installer/launcher behavior.
  - verify: `bun test tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts`

- [x] 5.2 Add no-session-implies-review and no-approval invariants plus rename/delete/dirty/untracked/unknown triangulation and deep-immutability/repeatability checks; assert no file or Git mutation.
  - skills: `ein-discipline`, `architecture`
  - why: Verifies the central safety claims across integration rather than only pure unit paths.
  - learn: A completed session or SDD artifact cannot create, upgrade, or approve a ledger record.
  - architecture: Keep assertions at the consumer contract; G remains metadata evaluation, not lifecycle governance.
  - avoid: Treating “reviewed” as approval, merge readiness, verification, or SDD completion.
  - verify: `bun test tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts`

## // 006. Focused and full verification

- [x] 6.1 Run focused verification and then the full relevant Bun suite; confirm production surfaces remain limited to the G domain module/store, narrow ignore rule, and read-only integration, with no H–L or autonomous mutation changes.
  - skills: `ein-discipline`, `architecture`
  - why: Confirms executable acceptance criteria and guards scope/rollback boundaries before delivery.
  - learn: Full verification must preserve fail-closed outcomes and workspace-local semantics under the project’s actual runner.
  - architecture: Verification inspects only declared G surfaces and their focused consumers; rollback is additive revert plus separate ignored-file cleanup.
  - avoid: Installer/build changes, migration, cleanup, Git mutation, or broad unrelated refactors.
  - verify: `bun test tests/reviewed-area-ledger.test.ts && bun test tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts`
