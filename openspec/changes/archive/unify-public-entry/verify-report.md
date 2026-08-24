# Verify report: unify-public-entry

**status: pass**

## Acceptance criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Lifecycle verbs execute `ein-install <verb>`, forward argv, propagate exit code | pass | `tests/terminal-app-driver.test.ts`: every verb delegates; `update --release-channel alpha` arrives intact; child code 3 is returned as 3 |
| 2 | A missing installer is a bounded named failure, never silent success | pass | Same file: a throwing spawner and a child returning 127 both yield 127 with `ein-install` named in the output |
| 3 | `ein-install` with no arguments installs, asking only for the runtime; non-TTY stays bounded | pass | `tests/installer-runtime-menu.test.ts`: install forwarded once with the selected target; cancel installs nothing; non-TTY explains `--runtime` and returns 0 |
| 4 | No surface offers the lifecycle actions twice | pass | Source-level contract: no `runMenu`, no action prompt, no `menu.ts` under `installer/src/cli/` |
| 5 | `ein` with no arguments opens the dashboard, launching first with a direct key | pass | `tests/terminal-app.test.ts`: first row is `{kind:"launch", provider:"pi"}`, keeps `DASHBOARD_KEYS.pi`, answers Enter |
| 6 | README, both helps, and post-install messages tell one story | pass | `tests/public-entry-story.test.ts` (new, 4 contracts including the negatives) |
| 7 | Strict TDD evidence per group | pass | `apply-progress.md`: RED → GREEN → TRIANGULATE → REFACTOR for groups 001–004 |

## Gates

- `bun test`: **2503 pass, 0 fail**, 12248 assertions, 179 files. Baseline before
  the change was 2493 pass / 0 fail. Re-run after the OpenSpec delta and the
  apply status line were written, so this evidence is newer than every artifact
  it certifies; both runs agree.
- `bun run typecheck` (root): pass.
- `cd installer && bun run typecheck`: pass.
- `git diff --check`: pass.

## Prerequisite worth recording

The root suite needs `cd installer && bun run bundle-template:host` first. Without
it the run reports 16–19 failures that have nothing to do with the change under
test; CI does it and that is why CI stayed green while a local run looked broken.
This is not documented in `EIN.md`, and it cost trust in the gate.

## Scope adherence

Production edits stayed inside the four seams named in `design.md`:
`terminal-app-entrypoint.ts`, `terminal-app.ts` (row order only),
`installer/src/main.ts`, `installer/src/cli/runtime-prompt.ts` (new, replacing
`menu.ts`), plus the told-story surfaces `README.md` and one `install.ts` outro.
The C1 rename, the on-disk homes, and merging the binaries stayed out.

## Residual risk

- Anyone typing `ein-install` expecting the action list now gets an install
  prompt. That is the intended retirement; the help text says so.
- `@clack/prompts` remains declared in `installer/package.json` with zero
  imports left in the tree. Removing it is a separate, provable edit.
