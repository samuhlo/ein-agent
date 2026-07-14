# Verify report — banner-git-semantics

status: pass
behavior_coverage: partial
strict_tdd: inactive (`openspec/config.yaml` sets `strict_tdd: false`)
skill_resolution: paths-injected

## Executive summary

The bounded minimal-layout remediation closes the prior blocker. The real adapter in `ein-pi/agent/extensions/ein-banner.ts` uses its shared `addGitBannerRows()` layout path in the full branch (80 columns) and minimal branch (60 and exactly 40 columns); `<40` continues to return no header rows. The focused source-contract test follows those actual branches, and the pure/fake suites verify the semantic rows, Git model, lifecycle, and read-only boundary.

Deterministic behavior is verified by pure renderer, fake-process/controller, and banner source-contract tests. No real TUI mount/render, real repository/remote, network deployment, Git mutation, build, web check, or TUI automation was run by design. Therefore observable terminal and remote-live behavior remain unconfirmed despite the passing deterministic coverage.

## Commands run

| Command | Result | Evidence |
|---|---|---|
| `timeout 300 bun test` | passed | 576 tests, 1,728 assertions, 0 failures. |
| `timeout 300 bun test tests/banner-git-semantics.test.ts` | passed | 48 tests, 346 assertions, 0 failures. |
| `timeout 300 git diff --check` | passed | No whitespace errors reported. |

No other validation commands were run. No build, web check, real Git/remote/network probe, mutation, or TUI automation was run.

## Previous blocker disposition

**Closed.** The former CRITICAL defect—semantic rows emitted only in full mode—has been remediated and is covered by `tests/banner-git-semantics.test.ts` under `ein-banner Git adapter`:

- 80 columns follows the actual full-layout branch and emits `HEAD`, `LOCAL`, `UPSTREAM`.
- 60 and exactly 40 columns follow the actual minimal-layout branch and emit the same semantic labels.
- Below 40 columns retains the skip path.
- The adapter splits only the renderer's explicit `↵` continuation marker into physical rows; it does not generically truncate critical Git copy.
- The source-contract asserts the render body contains neither `gitController.refresh` nor `gitProcessRunner.run`; controller tests additionally prove repeated `getSnapshot()`/renderer use creates zero runner calls.
- `handoff.md:7-8` now accurately states full 80-column and minimal 60/40-column output.

## Requirement and scenario coverage

| Requirement/scenario | Result | Evidence |
|---|---|---|
| Independent `HEAD`, `LOCAL`, `UPSTREAM` model and rows | verified | `banner-git.ts` types/renderer and 80/60/40 renderer matrix; actual full/minimal source-contract branch coverage. |
| Porcelain v1 `-z` logical entries: clean, staged, unstaged, untracked, `MM`, rename/copy, `RM`, malformed input | verified | Parser matrix passes; `MM + ??` remains two logical entries despite three category hits. |
| Equal/ahead/behind/diverged local-tracking-ref commit counts; no `pull`/`○` ambiguity | verified | Count parser and bilingual 80/60/40 renderer tests pass, including both divergence counts and explicit `commits`. |
| Detached, no-upstream, loading, uncomputable, timeout/error, DNS offline, server-changed | verified | Fake probe and final renderer matrix pass; mismatch hides local counts and is not rendered as behind/diverged. |
| Read-only injected runner; no fetch/pull/push/mutation | verified | Fake allowlist accepts only `rev-parse`, `symbolic-ref`, `status`, `config`, `rev-list`, and `ls-remote`. |
| Deferred, cached lifecycle; stale generation and invalidate protection | verified | Controller tests pass for deferred loading, coalesced repaint, stale-generation rejection, and invalidation. |
| Repeated render/getSnapshot performs no runner/process/network call | verified | Controller test measures zero calls before/after cached rendering; adapter source contract excludes refresh/runner invocation from `render`. |
| Full/minimal layout, non-Git preservation, `<40` skip, installer exclusion | verified by source-contract | Adapter checks preserve path/recent-session surroundings, full/minimal Git-row calls, and `<40` skip; no `installer/**` change is in the change ledger. No mounted TUI observation was run. |
| Handoff 60/40 claims and README boundary | verified | `handoff.md` matches implementation; it says README is untouched and limits downstream claims to deterministic evidence. |

## Task completion

`tasks.md` marks 1.1, 2.1, 3.1, and 4.1 complete. The independent verification confirms their stated parser, model, probe, controller, copy, lifecycle, adapter, and handoff acceptance conditions within deterministic test coverage.

## Review findings

No blocking findings.

| Severity | Finding |
|---|---|
| INFO | `ein-pi/agent/extensions/ein-banner.ts` now calls `addGitBannerRows()` in both `full` and `minimal` layout modes; the prior 60/40 omission is closed. |
| INFO | `tests/banner-git-semantics.test.ts` provides source-contract integration coverage of the actual branch selection, but not a mounted TUI render. |

## Workload

Per `apply-progress.md` current ledger: production is `+466/-62` across `ein-pi/agent/lib/banner-git.ts` and `ein-pi/agent/extensions/ein-banner.ts` (528 changed lines); tests are `+386/-0`; handoff is `+25/-0`. Production exceeds the 400-line review forecast by 128 lines. This VERIFY pass does not waive the delivery Review Workload Guard.

## Residual risks

- Local tracking refs can be stale without fetch; the implementation intentionally does not claim live remote synchronization.
- A changed server OID intentionally reports counts unavailable rather than inventing ancestry.
- No real terminal rendering at 80/60/40, real repository/remote, or deployment evidence exists. A Pi/TUI smoke render at those widths using a controlled fake runner would close the remaining UI-observable gap without contacting a remote.
- Production changed-line workload exceeds the forecast and must be evaluated by the delivery guard before any PR.

## README gate

**Open, with scope restriction.** `readme-release-ia` may document only the verified deterministic facts in `handoff.md`: logical porcelain entries, local-tracking-ref commit basis and staleness, server-changed/counts-unavailable semantics, no fetch/mutation during the feature, 80 full and 60/40 minimal semantic rows, and installer exclusion. It must not claim live remote synchronization or real TUI/deployment validation. README remains untouched by this change.

## Exact next recommendation

Proceed to `readme-release-ia` only within the README gate above; afterwards run the normal CLOSE phase. If UI-observable assurance is required before documentation, add a controlled Pi/TUI 80/60/40 smoke render that uses the existing fake runner and performs no real Git or network operation.
