# Verify report — add-stable-alpha-release-contract

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Verification basis

This report is a fresh verification run in the current working tree. The command plan was rebuilt from `openspec/config.yaml`, `design.md`, `tasks.md`, and the completed apply evidence; prior verification outcomes were not reused. No production build was run, and verification did not mutate source files.

## Focused behavior-seam inventory

Each delta requirement has exactly one focused command association:

| Requirement / behavior seam | Focused command | Result |
|---|---|---|
| R1 closed `stable`/`alpha` vocabulary and fail-closed resolution | `bun test tests/release-update-contract.test.ts` | PASS — 22 tests, 171 assertions |
| R2 installation-owned persistence, restart, and client-settings byte isolation | `bun test tests/release-update-contract.test.ts` | PASS — shared execution above |
| R3 stable/alpha eligibility and highest Semantic Version ordering | `bun test tests/release-update-contract.test.ts` | PASS — shared execution above |
| R4 separate persisted/effective status with honest evidence | `bun test tests/release-update-cli.test.ts` | PASS — 22 tests, 110 assertions |
| R5 pending acquisition, digest-derived identity, pre-commit gate, marker read-back | `bun test tests/release-update-state-primitives.test.ts` | PASS — 18 tests, 127 assertions |
| R6 local rollback evidence and successful-recovery finalization | `bun test tests/release-update-state-primitives.test.ts` | PASS — shared execution above |
| R7 local/remote authority separation | `bun test tests/release-update-cli.test.ts` | PASS — shared execution above |
| R8 evidence-gated alpha freshness/expiration | `bun test tests/release-update-cli.test.ts` | PASS — shared execution above |

Additional required focused associations:

| Area | Command | Result |
|---|---|---|
| Acquisition and selected-record asset continuity | `bun test tests/release-update-acquisition.test.ts` | PASS — 6 tests, 28 assertions |
| End-to-end update integration and recovery outcomes | `bun test tests/release-update-integration.test.ts` | PASS — 12 tests, 62 assertions |
| Installer runtime menu | `bun test tests/installer-runtime-menu.test.ts` | PASS — 35 tests, 150 assertions |
| SDD vocabulary | `bun test tests/sdd-vocabulary.test.ts` | PASS — 1 test, 1 assertion |

The real alpha propagation seam is exercised by the state and CLI suites: installation preference resolves alpha before mutation; the effective channel reaches transaction dry-run, candidate-list resolution, acquisition and selected assets, journal evidence, and marker commit/read-back. Tests also cover successful local recovery becoming terminal and allowing the next normal run without a recovery callback.

## Global checks and result evidence

Every relevant configured or explicitly required global check was scheduled and invoked once:

| Order | Normalized command | Role | Result |
|---:|---|---|---|
| 1 | `bun test tests/release-update-contract.test.ts` | focused contract suite | PASS — 22 tests, 171 assertions |
| 2 | `bun test tests/release-update-state-primitives.test.ts` | focused state suite | PASS — 18 tests, 127 assertions |
| 3 | `bun test tests/release-update-cli.test.ts` | focused CLI suite | PASS — 22 tests, 110 assertions |
| 4 | `bun test tests/release-update-acquisition.test.ts` | acquisition suite | PASS — 6 tests, 28 assertions |
| 5 | `bun test tests/release-update-integration.test.ts` | integration suite | PASS — 12 tests, 62 assertions |
| 6 | `bun test tests/installer-runtime-menu.test.ts` | installer runtime menu | PASS — 35 tests, 150 assertions |
| 7 | `bun test tests/sdd-vocabulary.test.ts` | vocabulary check | PASS — 1 test, 1 assertion |
| 8 | `bun run test` | full repository test suite | PASS — 2,399 tests, 9,913 assertions |
| 9 | `bun run typecheck` | root typecheck | PASS — `tsc --noEmit` |
| 10 | `cd installer && bun run typecheck` | installer typecheck | PASS — `tsc --noEmit` |
| 11 | `git diff --check` | whitespace/conflict check | PASS — no output |

The command wrapper’s 300-second execution bound was used. No production build was scheduled or run.

## Spec coverage

- R1: covered and passing — exact vocabulary, defaulted absence, and unavailable malformed/unreadable state.
- R2: covered and passing — installation-scoped atomic persistence, restart reproduction, and unchanged client settings.
- R3: covered and passing — stable finals only; alpha finals plus exact `alpha` prereleases; highest eligible SemVer; drafts/beta/rc/unknown rejected.
- R4: covered and passing — persisted preference and effective channel remain separate; version, identity, and uncertainty are evidenced honestly.
- R5: covered and passing — pending identity survives selection/acquisition; verified digest derives canonical identity; disagreement blocks before marker mutation and read-back preserves it.
- R6: covered and passing — previous/attempted identity, managed tree, backup, state, rollback outcome, and terminal successful recovery are retained/validated.
- R7: covered and passing — output makes rollback local-only and does not claim remote channel or signature changes.
- R8: covered and passing — absent immutable publication evidence/policy leaves alpha freshness unknown or unavailable without clock inference.

## Task completion and strict TDD

`tasks.md` marks groups 001–015 complete. `apply-progress.md` contains `TDD Cycle Evidence` tables for the assigned seams with RED, GREEN, TRIANGULATE, and REFACTOR evidence. Reported test files exist and were rerun successfully. Focused assertions exercise observable outputs, persisted bytes, selected candidates/assets, mutation boundaries, marker/journal state, recovery finalization, and authority wording; no tautological, ghost-loop, type-only, smoke-only, or CSS-only assertion issue was found in the changed focused tests.

Strict-TDD compliance: PASS. All required focused tests and both typechecks remain green; the full repository suite is also green.

## Final assessment

All eight delta requirements are covered by passing current-state tests. Behavior coverage is **verified**, including real alpha propagation through CLI → transaction → candidate list → acquisition → marker and successful-recovery terminal finalization. No blockers remain.
