# Fresh Verify Report — reviewed-area-ledger

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Executive result

The stale failed report is replaced with fresh evidence after the authorized F-8 remediation. Focused tests, independent runtime probes, B/F regressions, installer typecheck, and the full Bun suite all pass. The ancestor-symlink escape is now fail-closed for both reads and writes; canonical workspaces remain usable.

The five injected skills were read before verification. Bun and Ein discipline applied. Vitest was not used because this repository uses Bun's test runner. Web-design-guidelines and readme-style do not fit this non-UI verification task.

## Freshness and impact review

Codegraph impact review was performed before direct source inspection:

1. `codegraph explore "reviewed-area-ledger change: identify all changed source symbols, tests, ledger writer/readers, workspace path and symlink validation, F-1 through F-8 behavior, and call paths/blast radius"`
2. `codegraph explore "ein-pi/agent/lib/reviewed-area-ledger.ts reviewed-area-ledger-store.ts tests/reviewed-area-ledger.test.ts all exported symbols, callers, symlink checks, write/read APIs, F-8"`
3. `codegraph explore "readWorkspaceLedger replaceWorkspaceLedger workspaceParents workspace confinement ancestor symlink reviewed-area-ledger-store"`
4. `codegraph callers projectGitStateForReviewedArea && codegraph callees projectGitStateForReviewedArea`
5. `codegraph callers replaceWorkspaceLedger && codegraph callers readWorkspaceLedger && codegraph callers evaluateWorkspaceLedger`

The index exposed unrelated indexed symbols and reported the new/untracked ledger symbols as not found; this was recorded rather than treated as proof of no callers. Direct inspection then covered the current untracked modules and changed B projection. A runtime-source scan found no writer caller outside `reviewed-area-ledger-store.ts`.

No source, Git, session, launcher, audit, cleaner, architect, or background mutation was performed by verification. No commit, push, close, or PR-topology decision was made. No files are staged.

## Scope and task completion

Declared scope is Roadmap G only. Current implementation surfaces remain:

- `ein-pi/agent/lib/reviewed-area-ledger.ts`
- `ein-pi/agent/lib/reviewed-area-ledger-store.ts`
- `ein-pi/agent/lib/project-state.ts` (read-only B projection)
- `openspec/.gitignore`
- `tests/reviewed-area-ledger.test.ts`

No launcher, updater, installer, adapter, cleaner, architect, scheduler, session-discovery, background writer, approval path, or H–L surface was added.

All tasks in `tasks.md` are checked complete. The F-8 remediation is represented in `apply-progress.md` and is now independently reproduced by the focused test and external probes.

## Spec coverage

| Requirement | Result | Evidence |
|---|---|---|
| R1 stable bounded areas | **pass** | 17-test focused suite covers typed file/tree selectors, bounds, path safety, ordering, duplicate/redundant rejection, canonical IDs, and persisted ID requirements. |
| R2 canonical v1 persistence | **pass** | Fixed key order, terminal newline, byte/record bounds, unknown fields, duplicate keys/IDs, malformed content, and unsupported versions are exercised. |
| R3 one writer/read-only consumers | **pass** | Explicit CAS writer only; read/evaluate seams are read-only; race ownership, target CAS, temp cleanup, direct symlink rejection, and ancestor confinement pass. |
| R4 privacy-safe evidence | **pass for G contract** | Opaque reference/digest/reviewerRef syntax is strict; malformed IDs/digests fail closed; raw labels/private payloads are rejected; injected F resolution is required. |
| R5 exact B binding | **pass** | `projectGitStateForReviewedArea` exposes only B's bounded current authority; exact complete current `stateRef` is required and dirty equality remains current. |
| R6 transition intersection | **pass** | Added/modified/type-changed/unmerged/untracked, delete, rename/copy, exact/tree boundaries, unsafe paths, overflow, and contradictory transitions are covered. |
| R7 outcomes and precedence | **pass** | `reviewed`, `unreviewed`, `stale`, `invalid`, `unavailable`, and `unknown` outcomes and stable reason codes are exercised. |
| R8 no approval/lifecycle semantics | **pass** | Session/artifact absence does not create review; source and forbidden-scope scans found no approval, session, launcher, cleaner, architect, scheduler, watcher, or H–L integration. |
| R9 corruption/version handling | **pass** | Absent, malformed, oversized, future-version, unreadable/permission, and write-failure cases fail closed without repair or byte mutation. |

### F-1–F-5/F-7 re-verification

- **F-1 / F-3:** persisted records require exact canonical `area.id`; labels and unknown fields are rejected; deterministic canonical serialization passes.
- **F-2:** exclusive UUID/named temp creation, owned-inode cleanup, temp-content validation, final target revalidation, and CAS preconditions preserve competitor and target-race bytes.
- **F-4:** contradictory transition fields are rejected as unverifiable rather than classified unaffected/current.
- **F-5:** B's current projection omits `changes`; G does not reinterpret a current snapshot as a historical transition.
- **F-7:** ignore is anchored to exactly `/reviewed-area-ledger.json`; nested descendants are not ignored.
- **F-8:** ancestor, direct `openspec`, and direct ledger-file symlink paths fail closed before ledger read/proof validation/temp creation; canonical realpath workspace read/write continues to pass.

### F-6 boundary

F-6 remains intentionally external: the existing F owner generates and verifies the privacy-screened evidence manifest. G only validates opaque identifiers/digests and consumes an injected normalized resolution. No F-side generator, raw evidence discovery, session inspection, network call, or evidence payload was added.

## Independent behavioral probes

### Workspace confinement probe

`bun run /tmp/reviewed-area-ledger-final-probe.ts` (after correcting the probe fixture to canonicalize macOS `/var` temporary paths) passed:

- ancestor symlink: read returned unavailable; write threw before touching the external ledger;
- direct `openspec` symlink: read/write failed closed;
- direct ledger-file symlink: read/write failed closed;
- external bytes remained byte-identical after every rejected read/write;
- no `.tmp` residue remained in external parents;
- canonical workspace returned absent, then explicit write succeeded and returned valid on read.

The first execution of that probe failed only because the probe itself passed a lexical macOS temporary path (`/var/...`) where the implementation deliberately requires canonical realpath input; the probe was corrected with `realpathSync` and passed. This was a fixture/setup failure, not a source failure.

### Permission, corruption, version, and opaque evidence probe

`bun run /tmp/reviewed-area-ledger-permission-probe.ts` passed. It independently verified mode-000 read as unavailable, unwritable-parent write failure with prior bytes preserved and no temp residue, malformed/future/oversized parsing outcomes, strict opaque evidence reference/digest/reviewerRef rejection, and explicit-writer precondition behavior.

## Strict TDD compliance

`openspec/config.yaml` has `strict_tdd: true`. `apply-progress.md` contains the required `TDD Cycle Evidence` table. Reported test files exist, including `tests/reviewed-area-ledger.test.ts`, `tests/shared-project-state.test.ts`, and `tests/shared-config-update-advisor.test.ts`. Relevant tests remain GREEN.

The focused test suite has 17 tests and 114 Bun assertions. The assertion audit found no tautological `expect(true|false)`, skipped/only tests, ghost loops, type-only assertions, smoke-only checks, or implementation-detail CSS assertions. Assertions check outcomes, reasons, bytes, immutability, race preservation, symlink confinement, and residue. The F-8 ancestor regression is present and GREEN.

## Commands and validation

The host has no `timeout` or `gtimeout` executable (`command -v timeout || true; command -v gtimeout || true` returned no path), so long-running commands were bounded with a Perl alarm wrapper and streamed directly rather than piped through a pager.

| Command | Result | Summary |
|---|---|---|
| `perl -e 'alarm 300; exec @ARGV' bun test tests/reviewed-area-ledger.test.ts` | passed | 17 tests, 114 assertions. |
| `perl -e 'alarm 300; exec @ARGV' bun test tests/shared-project-state.test.ts tests/shared-config-update-advisor.test.ts` | passed | 57 tests, 220 assertions. |
| `perl -e 'alarm 300; exec @ARGV' bun test tests/reviewed-area-ledger.test.ts -t 'persisted records|workspace ledger symlink|explicit writer owns|fails closed for a workspace|evaluation output'` | passed | 5 race/symlink/privacy/immutability tests, 33 assertions; 12 filtered. |
| `perl -e 'alarm 300; chdir "installer" or die $!; exec @ARGV' bun run typecheck` | passed | `tsc --noEmit` passed. |
| `perl -e 'alarm 300; exec @ARGV' bun test` | passed | 1307 tests, 4744 assertions, 0 failures. |
| `perl -e 'alarm 60; exec @ARGV' bun run /tmp/reviewed-area-ledger-final-probe.ts` | failed (probe fixture) | Initial lexical-temp-path fixture was rejected as intended; corrected canonical-path rerun passed. |
| `perl -e 'alarm 60; exec @ARGV' bun run /tmp/reviewed-area-ledger-final-probe.ts` | passed | Ancestor/direct symlink confinement, external-byte preservation, residue, and canonical read/write. |
| `perl -e 'alarm 60; exec @ARGV' bun run /tmp/reviewed-area-ledger-permission-probe.ts` | passed | Permission, corruption/version, opaque evidence, explicit writer, byte preservation, and cleanup. |
| `git check-ignore -v --no-index openspec/reviewed-area-ledger.json` plus anchored descendant negative check | passed | Canonical file ignored; `openspec/nested/reviewed-area-ledger.json` is not ignored. |
| residue scan for `*.tmp`, `*.partial`, `.reviewed-area-ledger*`, and `reviewed-area-ledger.json` outside `.git` | passed | No repository residue. |
| writer-caller and forbidden-scope scan over `ein-pi/agent` and ledger modules | passed | No runtime writer callers outside explicit store; no forbidden integration terms. |
| `git diff --check` plus untracked changed-file trailing-whitespace scan | passed | No whitespace errors. |
| assertion audit over `tests/reviewed-area-ledger.test.ts` | passed | No tautologies, skip/only tests, or weak assertion patterns. |
| `git status --short --untracked-files=all` / staged-file check | passed | No staged files; verification did not edit source. |

No production build was run: the repository root has no `package.json` or root build script, and the declared scope requires Bun tests plus installer typecheck rather than a production build. Installer typecheck passed.

## Findings

- **No blockers found.** F-8 is resolved by current evidence.
- **Residual design boundary (non-blocking):** F-6 evidence-manifest generation/ownership remains external by design; invalid, missing, mismatched, unavailable, or opaque-invalid evidence fails closed.
- **Delivery gate (parent-owned):** review workload/diff topology was not decided here, per request.

## Final disposition

Fresh independent verification passes. Observable behavior is confirmed by the focused suite, independent ancestor/direct symlink and canonical-workspace probe, permission/corruption/version/evidence probe, B/F regressions, installer typecheck, and full Bun suite. The prior stale failed status is superseded by this report.
