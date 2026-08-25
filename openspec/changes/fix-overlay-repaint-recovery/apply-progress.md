status: blocked

## Completed tasks

Tasks 1.1–3.5 are complete. Ein now ships the persistent fleet above the editor with the legacy async widget disabled, while TODO requests the below-editor region. The remaining automatable blocker was also removed: frozen corpus commit IDs no longer depend on Git's adaptive abbreviation policy.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Tracked config ships one fleet surface above the editor | `bun test tests/subagent-widget-layout.test.ts` failed: `fleetViewPlacement` was absent. | The same command passed after adding the two supported config fields. | The contract reads the canonical tracked path and asserts only the exact policy fields. | No production refactor was needed; the final combined check passed. | `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts` |
| TODO paints below the fleet boundary without losing repaint guards | `bun test tests/sdd-overlay-repaint.test.ts` failed only because placement remained `aboveEditor`; repaint and no-UI cases passed. | The same command passed after the one-value placement change. | The layout contract proves fleet-above and TODO-below are distinct regions, while the repaint contract preserves identity, deduplication, startup repaint, and no-UI behavior. | The fake UI call record was typed explicitly after typecheck exposed an invalid sentinel; the final combined check passed. | `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts` |
| Frozen corpus bytes ignore repository abbreviation policy | An isolated repo with `core.abbrev=8` made `bun test tests/apply-corpus-frozen.test.ts` fail: an 8-character commit was received instead of the fixed 7-character value. | The collector now reads full object IDs and slices exactly seven characters; the focused file passed (12/12). | The fixture checks both base and delivering commit IDs under non-default Git policy without touching root config. | A single `frozenCommitId` helper owns the width; no corpus/snapshot bytes changed. | `bun test tests/apply-corpus-frozen.test.ts` |

## Verification

- Focused final: `bun test tests/subagent-widget-layout.test.ts tests/sdd-overlay-repaint.test.ts` — 5 passed, 0 failed.
- Repository gate from the implementation cycle: `bun test` — 2544 passed, 0 failed.
- Exact composite pre-PR gate after corpus fix: `bun test && bun run typecheck` — 2545 passed, 0 failed; root `tsc --noEmit` passed.
- Official host artifact build: `cd installer && bun run bundle-template:host` — passed and generated `installer/src/assets/template.tar.gz` (29,058,978 bytes; SHA-256 `97c7cc2cdbe7ec493b60e1c08474b22962becdba96159951d054d0d37a9a3a4b`).
- Direct tar inspection of `./extensions/subagent/config.json` — passed with `fleetViewPlacement=aboveEditor` and `asyncWidget=false`; no deployment or installed/home path was used.
- Installer typecheck: `cd installer && bun run typecheck` — passed.
- Scope audit preserved unrelated dirty work and found no installed-home, dependency, settings, installer production, renderer, or repaint-lifecycle edit.

## Blocked acceptance

Task 4.1 remains unchecked because the user explicitly chose BUILD ONLY and declined install/update. The generated official deployment artifact contains the expected policy, but it was intentionally not deployed anywhere.

Task 4.2 remains pending because the active installation was intentionally unchanged; interactive fleet liveness and final terminal ordering cannot be confirmed against the new artifact without deployment.

## Deviations and remaining tasks

The corpus I/O correction is a justified verification follow-up outside the original layout design: Git `%h`/`--short` was proven repository-policy-dependent. No frozen corpus or snapshot was updated. Build-only artifact verification is complete; only tasks 4.1 and 4.2 remain unchecked under the user's delivery constraint.

## Files changed

`ein-pi/agent/extensions/subagent/config.json`
`ein-pi/agent/extensions/ein-sdd-overlay.ts`
`tests/subagent-widget-layout.test.ts`
`tests/sdd-overlay-repaint.test.ts`
`evals/build-corpus.ts`
`tests/apply-corpus-frozen.test.ts`
`installer/src/assets/template.tar.gz`
`openspec/changes/fix-overlay-repaint-recovery/tasks.md`
`openspec/changes/fix-overlay-repaint-recovery/apply-progress.md`
