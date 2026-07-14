status: complete

# Apply progress — release-update-semantics

## Completed slices

- Completed all checkboxes in groups `// 001`, `// 002`, `// 003`, `// 004`, `// 005`, and `// 006`.
- Group `// 003` validates a same-owner regular executable destination, stages verified bytes beside it, preserves executable mode without setuid/setgid bits, fsyncs the destination directory, and retains a same-directory rollback copy across atomic rename.
- Group `// 004` adds the durable transaction journal under the backup boundary. Each irreversible boundary persists intent before execution and its completed state after execution; failure and signals reverse registered steps, retain journal/artifacts when recovery cannot be proven, and remove scoped signal handlers.
- Template rollback snapshots only managed paths, cleans them before restoration, and leaves user-owned credentials and downloaded skills intact. The deployed manifest is validated against the selected release before marker work can be considered coherent.
- Marker v2 accepts legacy v1 reads, fail-closes ambiguous ownership, gates migration on executable/template/deployed-manifest coherence, writes atomically, and reads back the exact identity. It does not derive version from the compile-time constant or advance a mismatched binary/template state.
- Group `// 005` adds deterministic outcome rendering with stable numeric exits, rewires `runUpdate` through recovery plus the verified resolver/acquisition/transaction machine, and preserves its asynchronous numeric exit-code contract for dispatch and menu callers.
- The public path now covers latest and explicit selectors, dry-run, verified already-current, acquisition/validation failures, pending-journal recovery-required failures, and verified success. Package-manager ownership resolves the target but refuses executable/template/marker mutation and names the owning manager.
- Banner version text now derives from a parsed v2 committed marker; pending journals render `recovery required`, and absent/legacy markers render an explicit unverified label. It no longer uses `INSTALLER_VERSION` as installed-state truth.
- Group `// 006` adds the integration layer that composes groups 1–5 across fake seams (no real network, no real release publication, no replacement of the active test executable), pins the asset/checksums contract between `.github/workflows/installer-release.yml` + `installer/scripts/build-all.ts` and `asset-selector.ts` + `checksum.ts`, and produces a factual downstream handoff at `handoff.md` consumed by `homebrew-install-channel` and `readme-release-ia`.
- No real GitHub/network, active executable replacement, release publishing, Homebrew implementation, agent Git indicator/banner semantics workstream, or production code change in `// 006` was made.

## Files changed

Production (groups `// 001`–`// 005`, unchanged by group `// 006`):

- `installer/src/core/release-types.ts`
- `installer/src/core/release-resolver.ts`
- `installer/src/core/update-caps.ts`
- `installer/src/core/asset-selector.ts`
- `installer/src/core/checksum.ts`
- `installer/src/core/acquisition.ts`
- `installer/src/core/release-record.ts`
- `installer/src/core/executable.ts`
- `installer/src/core/binary-probe.ts`
- `installer/src/core/child-continuation.ts`
- `installer/src/core/transaction.ts`
- `installer/src/core/template-transaction.ts`
- `installer/src/core/marker-v2.ts`
- `installer/src/cli/result.ts`
- `installer/src/cli/update.ts`
- `installer/src/tui/banner.ts`

Tests (groups `// 001`–`// 006`):

- `tests/release-update-contract.test.ts`
- `tests/release-update-acquisition.test.ts`
- `tests/release-update-exec.test.ts`
- `tests/release-update-transaction.test.ts`
- `tests/release-update-cli.test.ts`
- `tests/release-update-integration.test.ts` (new in group `// 006`)
- `tests/release-asset-contract.test.ts` (new in group `// 006`)

Checklist/artifact:

- `openspec/changes/release-update-semantics/tasks.md` (group `// 006` checkboxes marked complete)
- `openspec/changes/release-update-semantics/apply-progress.md` (status updated to `complete`)
- `openspec/changes/release-update-semantics/handoff.md` (new in group `// 006`)

## Verification evidence

| Command | Result |
| --- | --- |
| `bun test tests/release-update-contract.test.ts tests/release-update-acquisition.test.ts tests/release-update-exec.test.ts tests/release-update-transaction.test.ts tests/release-update-cli.test.ts tests/release-update-integration.test.ts tests/release-asset-contract.test.ts tests/installer-backup.test.ts tests/deploy-clean-managed.test.ts tests/deploy-settings.test.ts` | passed: 66 tests, 294 assertions |
| `cd installer && bun run typecheck` | passed: `tsc --noEmit` |
| `git diff --check` | passed: no whitespace errors in tracked changes |
| `git diff --cached --name-only` | passed: no staged files |

Strict TDD is off in `openspec/config.yaml`; this slice used standard implementation with focused behavioral regression tests. No production build or full suite ran.

## Budget and ledger

- Scope production review budget: 400 changed lines.
- Group `// 006` adds zero production lines (handoff doc + tests only) — design forecast confirmed.
- Group `// 006` test additions: `tests/release-update-integration.test.ts` and `tests/release-asset-contract.test.ts` together add 314 test lines (`wc -l`).
- Cumulative source tally for groups `// 001`–`// 005` stands at 2,047 production lines and 753 focused-test lines; group `// 006` adds 0 production and 314 test lines.
- Budget state: cumulative production source tally remains 1,647 lines above the 400-line single-PR budget. The Review Workload Guard remains applicable if/when a delivery phase is requested. Group `// 006` does not change this state.
- Baseline reconciliation: `HEAD` `06f6a92` matches `origin/main`. Existing untracked groups `// 001`–`// 004`, `EIN.md`, roadmap artifacts, and unrelated tests were preserved.
- No staged files: confirmed with `git diff --cached --name-only`.

## Remaining tasks

- None. All 26 tasks across groups `// 001`–`// 006` are complete.

## Deviations from design

- None. Group `// 005` previously added `runUpdateTransaction` as the narrow public orchestration seam in `core/transaction.ts` (recorded in the prior progress slice). Group `// 006` makes no production change and adds no behaviour outside the existing seams; the new tests exercise only modules already in `// 001`–`// 005` and the handoff doc only cites the existing design and test artifacts.
