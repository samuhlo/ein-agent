# Verification Report — shared-project-state-contract

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Executive result

Approved remediation was independently re-verified. The focused projector suite and the four compatibility suites pass; the invalid and unreadable OpenSpec-root paths fail closed; public Git records expose index/worktree classifications for unstaged, staged, and mixed states; and the strict targeted TypeScript run reports no errors attributable to `project-state.ts` or the focused test. The targeted TypeScript command remains non-zero only because of pre-existing imported-module baseline errors.

No source was edited by verification. No production build was run, as explicitly prohibited.

## Spec coverage

Selected delta: `openspec/changes/shared-project-state-contract/specs/sdd-lifecycle/spec.md` (`sdd-lifecycle`, `openspec-delta/v1`). All four delta scenarios and the design requirements are covered:

| Requirement/scenario | Result | Evidence |
|---|---|---|
| Deterministic, read-only projection | verified | Focused determinism/no-write test passes; repeated output is equal, source bytes and Git index remain unchanged, and the before/after dirty-file perimeter is identical. |
| OpenSpec authority and ambiguity | verified | Unique, explicit, ambiguous, canonical/legacy, provenance, and absent cases pass; multiple active changes do not select alphabetical intent. |
| Invalid/unreadable OpenSpec root | verified | Focused regular-file regression passes with `quality: unavailable`, `reason: invalid-source`, and no `next`; independent chmod-000 probe returns `quality: unavailable`, `reason: read-error`, no `next`, and no `done` state. |
| EIN.md context metadata | verified | Absent, incomplete, current, malformed AUTO, and unavailable/read-error cases pass; revision/boundary metadata and bytes remain preserved. |
| Exact bounded Git summary | verified | HEAD/unborn/detached, index, tracked worktree, untracked, rename/delete, nested cwd, malformed/error, and overflow transitions pass. Paths are relative, bounded, and content/diff/history/remote data are absent. |
| Public Git classification | verified | Staged records expose `indexStatus: M`, `worktreeStatus: .`; unstaged records expose `indexStatus: .`, `worktreeStatus: M`; mixed records expose `M/M`. |
| Verification fails closed | verified | Matching bound pass is current; mismatch is stale; router-stale evidence remains stale; legacy/unbound, malformed, failed, absent, and incomplete-Git evidence remain non-current. |
| Independent degradation | verified | OpenSpec/EIN values survive Git/verification unavailability, and unaffected Git/OpenSpec or EIN values survive other source degradation. |
| Runtime privacy | verified | Default and normalized runtime tests pass; only normalized capabilities/opaque references/stable errors remain, with private paths, prompts, transcripts, messages, and execution fields omitted. |
| No competing store or mutation | verified | Focused no-write/index-immutability assertions pass; no adapter, launcher, session operation, cache, state file, or writer was added or invoked. |

## Task completion

`tasks.md` marks tasks 1.1 through 5.2 complete. `apply-progress.md` contains RED, GREEN, TRIANGULATE, and REFACTOR evidence for groups 001–005 plus the approved remediation. The reported test files exist and were independently rerun. Task completion is verified.

## Commands and validation

All test/typecheck commands were bounded with `timeout 300`.

- `timeout 300 bun test tests/shared-project-state.test.ts` — **passed**, 39 tests, 160 expectations.
- `timeout 300 bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/project-context.test.ts tests/git-baseline.test.ts` — **passed**, 84 tests, 225 expectations.
- `timeout 300 bash -lc 'cd installer && ./node_modules/.bin/tsc --noEmit --target ESNext --module ESNext --moduleResolution bundler --allowImportingTsExtensions --verbatimModuleSyntax --strict --skipLibCheck --noUncheckedIndexedAccess --noFallthroughCasesInSwitch --types bun ../ein-pi/agent/lib/project-state.ts ../tests/shared-project-state.test.ts'` — **failed with exit 2 due to pre-existing imported-module baseline errors only**. Reported baseline errors are in `lang.ts` (missing `@earendil-works/pi-coding-agent` types), `openspec-spec-parser.ts`, `openspec-spec-sync.ts`, `project-context.ts` (missing Pi types), `sdd-guardrails.ts`, and `sdd-router.ts`. There are **no diagnostics attributable to `project-state.ts` or `tests/shared-project-state.test.ts`**, including no strict indexed-access errors in `project-state.ts`.
- `git diff --check` — **passed**.
- `git diff --cached --check` — **passed**.
- `git diff --cached --quiet` — **passed**; no staged files.
- Supplemental untracked-file checks: `git diff --no-index --check -- /dev/null ein-pi/agent/lib/project-state.ts`, the equivalent check for `tests/shared-project-state.test.ts`, and the equivalent check for `openspec/changes/shared-project-state-contract/apply-progress.md` — **clean**.
- Independent unreadable-root/perimeter probe — **passed**: the chmod-000 OpenSpec root produced `{"quality":"unavailable","reason":"read-error"}` with no `next`, and the full `git status --porcelain=v1 --untracked-files=all` snapshot was byte-identical before and after the probe.

## Strict TDD compliance and assertion quality

`openspec/config.yaml` has `strict_tdd: true`. The apply evidence table is present and records RED, GREEN, TRIANGULATE, and REFACTOR for every implementation group and remediation. `tests/shared-project-state.test.ts`, `tests/sdd-router.test.ts`, `tests/sdd-status-output.test.ts`, `tests/project-context.test.ts`, and `tests/git-baseline.test.ts` all exist and ran. Assertions exercise observable behavior through temporary repositories/files, transition state references, public status classifications, unavailable-source outcomes, exact byte/index preservation, privacy filtering, and deterministic equality. No tautological-only, ghost-loop, type-only, smoke-only, or CSS-detail assertions were relied upon. Final focused and compatibility runs are GREEN; the only RED validation is the targeted TypeScript baseline imported-module set listed above.

## Changed/perimeter audit

The approved remediation surface is `ein-pi/agent/lib/project-state.ts`, `tests/shared-project-state.test.ts`, and `openspec/changes/shared-project-state-contract/apply-progress.md`; this verification overwrote only `openspec/changes/shared-project-state-contract/verify-report.md`. No router, context reader/writer, Git-baseline module, status output, runtime store, or unrelated dirty file changed. Existing unrelated tracked and untracked dirty files were preserved exactly by the independent perimeter comparison. No source mutation, persistence artifact, cache, or state file was observed.

## Findings and blockers

- **Blockers:** none for the approved remediation.
- **Baseline risk (non-blocking for this change):** the strict targeted TypeScript command remains non-zero because imported existing modules and the unavailable Pi package types fail under the requested strict flags. A project-wide clean typecheck would require resolving that pre-existing baseline separately.
- **Validation limitation:** no production build was run per the user instruction.

## Residual risks

- Permission-based unreadability can vary under a privileged/root test process; the deterministic regular-file regression and an actual chmod-000 unreadable-root probe both fail closed in this environment.
- Imported-module strict TypeScript baseline errors remain outside the approved remediation perimeter.
