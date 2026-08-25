# Verify report — `fix-overlay-repaint-recovery`

status: blocked
verification_state: automated-gates-pass-manual-acceptance-blocked
behavior_coverage: partial
skill_resolution: paths-injected

## Executive result

Fresh focused contracts, the adaptive Git-abbreviation regression contract, the full test suite, root typecheck, and the exact composite `bun test && bun run typecheck` gate all pass. Automated gate health is therefore **green**.

The user continues to decline deployment/update and interactive acceptance. Deployment propagation, terminal composition, fleet liveness, and keypress-free WORKING updates remain blocked rather than failed. The change is not eligible for an unqualified passing verify result or close until those manual tasks are authorized and performed.

## Spec coverage

The current delta in `specs/sdd-overlay/spec.md` adds `active-subagent-output-precedes-todo`.

| Requirement / acceptance | Result | Fresh evidence or blocker |
|---|---|---|
| Fleet output and TODO occupy deterministic ordered regions | **covered at owned-input level** | Focused layout contract passes `fleetViewPlacement: "aboveEditor"` and TODO `placement: "belowEditor"` in distinct regions. Final Pi terminal composition was not exercised. |
| One live async surface | **covered at shipped-policy level** | Focused layout contract passes `asyncWidget: false`; installed runtime liveness remains unverified. |
| Startup repaint, unchanged-content deduplication, stable identity | **pass** | Fresh repaint contract passes startup repaint, same-session deduplication, stable `ein-sdd` identity, and below-editor placement. |
| Live WORKING updates without a keypress | **blocked / unverified** | Requires an interactive deployed `pi-ein` session; deployment was declined. |
| No-UI contexts issue no overlay call | **pass** | Fresh repaint contract passes the no-UI empty-call assertion. |
| Owned configuration survives supported install/update propagation | **blocked** | No supported install/update was run because the user chose build-only. The active `~/.pi-ein/agent/extensions/subagent/config.json` was inspected read-only and still lacks the new fields, consistent with no deployment. |
| No installed dependency or home mutation | **pass for this verify run** | No deployment/update command ran. Repository status contains no `node_modules`, `.pi-ein`, `.claude-ein`, or installer-template changes; home inspection was read-only. |
| Frozen corpus remains byte-stable under Git abbreviation-policy drift | **pass** | Fresh corpus contract passes exact regeneration bytes, digest/recount invariants, and an isolated `core.abbrev=8` fixture; no corpus or snapshot path changed. |

The corpus abbreviation correction is a bounded verification follow-up represented by apply evidence and current tests. It changes only the corpus I/O boundary and does not weaken frozen data or snapshot assertions.

## Task completion

- **Tasks 1.1–3.5:** complete; fresh focused and repository gates pass.
- **Task 4.1:** **blocked by user decision.** The supported install/update path was intentionally not run, so deployed propagation cannot be claimed from tracked source or a build artifact.
- **Task 4.2:** **blocked by user decision.** No interactive session with WORKING, TODO, and one live async subagent was run against the changed installation.

The blocked tasks are manual acceptance constraints, not automated gate failures.

## Fresh focused command plan and evidence

The command plan was rebuilt from the current `apply-progress.md` behavior seams, `openspec/config.yaml`, `design.md`, and `tasks.md`. Commands are normalized by removing only surrounding whitespace. Each seam has exactly one final focused command association; the first two seams intentionally share one exact command, which was executed once.

| Order | Normalized command | Behavior seam(s) / role(s) | Source associations | Current result |
|---:|---|---|---|---|
| 1 | `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts` | `Tracked config ships one fleet surface above the editor`; `TODO paints below the fleet boundary without losing repaint guards`; focused | `ein-pi/agent/extensions/subagent/config.json`, `ein-pi/agent/extensions/ein-sdd-overlay.ts`, `tests/subagent-widget-layout.test.ts`, `tests/sdd-overlay-repaint.test.ts` | **exit 0** — 5 passed, 0 failed, 10 expectations across 2 files |
| 2 | `bun test tests/apply-corpus-frozen.test.ts` | `Frozen corpus bytes ignore repository abbreviation policy`; focused | `evals/build-corpus.ts`, `tests/apply-corpus-frozen.test.ts`, `evals/apply-corpus.json` (read-only fixture) | **exit 0** — 12 passed, 0 failed, 252 expectations |

Both focused commands were invoked fresh in the current working tree with streaming bounded subprocess wrappers because this macOS host has no `timeout` executable. The report rows retain the exact normalized executable commands.

## Fresh global-check plan and evidence

| Order | Normalized command | Role / source association | Current result |
|---:|---|---|---|
| 3 | `bun test` | OpenSpec verify test command; repository-wide test gate; `openspec/config.yaml` | **exit 0** — 2,545 passed, 0 failed across 184 files |
| 4 | `bun test tests/` | OpenSpec unit, integration, and e2e configured commands; exact duplicate role association merged; `openspec/config.yaml` | **exit 0** — 2,545 passed, 0 failed across 184 files |
| 5 | `bun run typecheck` | Explicit root typecheck from `design.md` and `tasks.md` 3.2; root `tsc --noEmit` | **exit 0** — passed |
| 6 | `bun test && bun run typecheck` | Explicit composite pre-PR gate from `tasks.md` 3.5 and design success criteria | **exit 0** — 2,545 passed, 0 failed; root `tsc --noEmit` passed |
| 7 | `git status --short --untracked-files=all` | Current-tree and mutation audit; `tasks.md` 3.3 | **exit 0** — expected change artifacts/tests only; no dependency, installed-home, or installer-template path appears |
| 8 | `git diff --name-only` | Final scope audit; `tasks.md` 3.3 | **exit 0** — only the pre-existing documentation edit plus the mapped production/config and corpus-test files are tracked changes |
| 9 | `git diff --check` | Diff hygiene audit | **exit 0** — no whitespace errors |

### Global-check disposition

- `bun test`: **scheduled and executed once**.
- `bun test tests/`: **scheduled and executed once**; its unit/integration/e2e roles were exact duplicates and were merged.
- `bun run typecheck`: **scheduled and executed once**.
- `bun test && bun run typecheck`: **scheduled and executed once** because it is an explicit required composite check; it is green.
- `cd installer && bun run typecheck`: **not relevant**. No installer production source or installer template asset is in the current changed area, and the design explicitly excludes installer verification unless the map expands. This is not an explicit required command for this change.
- Configured lint and coverage command lists are blank; no command was invented.
- Deployment propagation and interactive liveness are manual acceptance tasks, not silently converted into source-only evidence.

## Strict TDD compliance

Strict TDD is active in `openspec/config.yaml` and `preflight.json`.

- `apply-progress.md` contains the required **TDD Cycle Evidence** table with three behavior-seam rows.
- Every reported test file exists in the current tree: `tests/subagent-widget-layout.test.ts`, `tests/sdd-overlay-repaint.test.ts`, and `tests/apply-corpus-frozen.test.ts`.
- RED, GREEN, TRIANGULATE, and REFACTOR evidence is recorded for each seam, including the adaptive-abbreviation seam added by the follow-up.
- The fresh focused commands are green, and the fresh composite/global gates are green.
- No stale apply result or previous verify result is used as current command evidence.

### Assertion-quality audit

No tautologies, ghost loops, type-only assertions, smoke-only tests, or implementation-detail CSS assertions were found.

- Layout assertions read the canonical tracked extension config and the actual TODO placement request, and assert the exact policy without duplicating a fixture.
- Repaint assertions exercise the fake UI boundary, positive paint count, stable key, below-editor placement, startup repaint, deduplication, and no-UI guard.
- Corpus assertions preserve exact byte regeneration, digest/count invariants, runtime-isolation scanning, and add a real isolated Git repository with `core.abbrev=8`; they do not update or relax the frozen corpus.

## Corpus/snapshot and mutation audit

- `tests/apply-corpus-frozen.test.ts` freshly passed the exact-byte regeneration test (`regenerar ... produce los MISMOS bytes`), stable digest test, corpus counts, and Git-fact shape checks.
- The isolated regression fixture proves both base and delivering IDs are exactly seven hexadecimal characters despite `core.abbrev=8`.
- `git diff --name-only -- evals/apply-corpus.json ':(glob)**/*snapshot*' ':(glob)**/*snap*'` produced no paths.
- The corresponding untracked-path scan produced no corpus/snapshot paths.
- The only corpus-related tracked changes are `evals/build-corpus.ts` and its regression test; no frozen corpus or snapshot bytes were changed.
- No source was modified by this verify phase. Tests used temporary fixtures; no deployment/update command ran.
- The current installed config at `~/.pi-ein/agent/extensions/subagent/config.json` remains the pre-change configuration (no fleet fields), confirming this run did not deploy the change. Inspection was read-only.

## Behavior coverage

`behavior_coverage: partial`

Automated behavior coverage is green for the owned configuration seam, TODO placement, startup repaint recovery, deduplication, stable identity, no-UI behavior, and deterministic frozen-corpus abbreviation. Observable behavior in the deployed Pi runtime is not confirmed: the final fleet-before-TODO composition, single live fleet row, live fleet updates, and keypress-free WORKING updates require deployment and an interactive session, both declined by the user.

## Exact blockers and next verification

1. **Task 4.1 / deployment propagation — blocked by user decision:** authorize the supported install/update path, then inspect the resulting `<agent-dir>/extensions/subagent/config.json` without hand-editing installed state.
2. **Task 4.2 / interactive acceptance — blocked by user decision:** after deployment, run one interactive `pi-ein` session with WORKING, TODO, and one live async subagent; confirm fleet-before-TODO order, one live fleet row, live updates, startup repaint, and keypress-free WORKING updates.

Until those two manual tasks are authorized and pass, retain `status: blocked` and `behavior_coverage: partial` despite green automated gate health.
