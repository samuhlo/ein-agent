# Scope — fix-installer-backup-real-trees

## Scope packet
scope: Hotfix installer backup and install recovery for v0.81.x against a real existing Pi tree on Omarchy/Linux: safely snapshot user-owned state while excluding regenerable dependencies, preserve legitimate symlinks without traversal, retain backup causes, and support fail-closed retry when Pi fails before mutation while Claude work is already complete.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000

## Problem

The reproduced `~/.pi-ein/agent` is 603,885,388 bytes and 13,105 files. It contains a user-owned `skills/omarchy -> ~/.local/share/omarchy/default/omarchy-skill` symlink, npm/node_modules `.bin` symlinks, and esbuild hardlinks. Current manifest backup rejects symlinks, hardlinks, more than 10,000 files, and more than 128 MiB. The `pi.backup-current` handler discards the underlying error. A valid recovery-required install journal with `recoveryCode: handler-failed`, `pendingEntryId: pi.backup-current`, all later Pi entries `not-run`, and completed Claude entries blocks startup without a supported retry/recovery route.

## Smallest bounded change

Limit implementation to the manifest backup collector/restore contract, the installer execution journal's pre-mutation recovery/retry path and actionable error propagation, plus focused regression fixtures. Keep the existing isolated Pi target, plan ordering, Claude execution, journal fail-closed validation, atomic publication, and excluded-state semantics unless directly required by these outcomes.

Likely touchpoints (to confirm during map):
- `installer/src/core/backup-manifest.ts` — entry kinds, exclusions, safe non-following traversal, limits, validation and restore representation.
- `installer/src/core/backup.ts` — snapshot/restore orchestration and error propagation from `pi.backup-current`.
- `installer/src/core/install-journal.ts` and its install-facing caller — valid pre-mutation handler failure recovery without completing uncertain work.
- `tests/installer-backup.test.ts` and `tests/install-journal.test.ts` — Omarchy-shaped tree and journal recovery fixtures.

## Acceptance criteria

1. A fixture models the reported shape: external `skills/omarchy` symlink, npm/node_modules `.bin` symlinks, hardlinked files, dependency payload exceeding current file/byte thresholds, and user-owned files. Snapshot succeeds, does not traverse external symlink targets, excludes regenerable payloads, and protects/restores user-owned state.
2. Safe symlink entries are handled deterministically according to the manifest contract; restoring cannot follow a link or write outside the agent root. Hardlinked regular files do not fail merely because `nlink > 1`.
3. Backup limits no longer reject the intended real-tree case solely due to regenerable dependency payloads or the old global 10,000-file/128 MiB caps; non-excluded user-owned content remains bounded and fail-closed.
4. A forced backup failure preserves a bounded actionable cause (operation and/or relative entry plus original detail) in the returned failure and persisted recovery journal; it never reports success or marks `pi.backup-current` complete.
5. A valid `both` journal failed at `pi.backup-current` before Pi mutation can be resumed/recovered through a supported path. Completed Claude entries remain completed; later and uncertain Pi entries remain non-complete; the journal is cleared only after verified full completion.
6. Invalid, ambiguous, interrupted-after-mutation, path-escaping, unsafe-link, malformed-manifest, and unsupported recovery states remain blocked (fail closed).
7. Focused tests cover success, rejection/no traversal, actionable failure, retry, preservation of completed Claude work, and no false completion. No broad suite/build work is part of scope.

## Explicit non-goals

- No redesign of the installer plan, runtime selection, Claude installer, Pi deployment templates, or update transaction journal.
- No attempt to back up regenerable dependency payload bytes; no dependency installation/cache manager redesign.
- No dereferencing or copying of external symlink targets, and no support for arbitrary sockets, FIFOs, devices, archives, or unsafe filesystem objects.
- No recovery that guesses whether Pi mutation occurred; uncertain work stays blocked/non-complete.
- No migration of existing backup formats beyond the minimum compatibility needed for this hotfix.
- No performance benchmark, production-tree snapshot, release/version bump, or unrelated working-tree cleanup.

## Configuration and project evidence

- Stack: Bun + TypeScript ESM; installer package at `installer/`; tests are repository-level Bun tests.
- Runner: `bun test`; typecheck: `cd installer && bun run typecheck` (root also exposes `bun run typecheck`).
- `strict_tdd: true` in `openspec/config.yaml`; this scope phase records configuration only and does not run tests, build, or typecheck.
- Relevant architecture: deterministic filesystem logic in `installer/src/core/`, adapters/CLI at edges, fail-closed recovery and provenance-preserving errors.
- Skills: `nuxt-modules` and `web-design-guidelines` do not fit this filesystem/installer hotfix; `ts-library`, `architecture`, and `ein-discipline` informed stack/design constraints.

## Canonical context

- `openspec/specs/installer-runtime/spec.md`
  - sha256: `8612807e4f0b5be419bc38ecbb4f33683e8e959adea62d726128f461671c20c5`
  - bytes: `6237`

## Phase boundary

This artifact scopes only. Mapping must verify exact call sites and current tests before design; design must choose the smallest safe representation for symlink metadata, exclusions, and retry semantics. Apply/verify own implementation and test execution.
