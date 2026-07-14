# Handoff — banner-git-semantics → readme-release-ia

APPLY evidence is available; independent SDD VERIFY remains pending. `summary.md` remains owned by CLOSE.

## Copy and widths

- The actual banner adapter renders separate `HEAD`, `LOCAL`, and `UPSTREAM` rows in Spanish and English: full mode at 80 columns and minimal mode at 60 and 40 columns.
- Wide (`>=80`), medium (`52–79`), and narrow (`40–51`) variants preserve text labels; below 40 columns Git rows are skipped.
- Narrow LOCAL labels logical porcelain totals as `entradas locales` / `local entries`; upstream counts retain `commits`, including both sides of divergence.

## Semantics available to document

- Local worktree quantities are logical `git status --porcelain=v1 -z` entries. Staged, unstaged, and untracked categories can overlap: `MM + ??` is two entries although category hits total three.
- Rename/copy source paths are consumed as part of one porcelain entry, not counted twice.
- Ahead, behind, equal, and diverged commit counts compare `HEAD...@{upstream}` against the configured local tracking ref.
- That tracking ref can be stale without a fetch; equal does not promise live remote synchronization.
- A server OID different from the local tracking OID renders server-changed/counts-unavailable and hides counts. It does not claim behind or diverged.
- Explicit DNS/network-unreachable evidence may render offline. Timeout, auth, and generic process failures render unavailable/error, not offline.

## Boundaries and status

- The probe uses read-only local Git metadata and optional `ls-remote`; it does not fetch, pull, push, or mutate Git. Rendering and `getSnapshot()` invoke no runner.
- Tests use only fake process results, snapshots, and deferred promises: no repository, remote, network, or Git mutation.
- The installer version banner is excluded. README remains untouched.
- APPLY ran `bun test` and `bun test tests/banner-git-semantics.test.ts`; independent SDD VERIFY is still pending and must not claim remote-live synchronization or final verification.
