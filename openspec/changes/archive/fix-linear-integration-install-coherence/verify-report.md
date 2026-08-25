# Verify report — fix-linear-integration-install-coherence

status: pass
behavior_coverage: verified
skill_resolution: paths-injected

## Scope and outcome

Independent verification was planned afresh from the current `openspec/config.yaml`, `design.md`, `tasks.md`, and completed `apply-progress.md`; prior apply results were used only to inventory seams. The current tree passes the focused behavior checks, release contract, full Bun suite, root typecheck, and installer typecheck.

Observable behavior is exercised, not build-only: the real bundle-template path is generated, deployed through `deployTemplate`, persisted for both Linear values, and checked by both installer and runtime doctors across valid, missing-seam, invalid, and unreadable evidence cases.

The post-merge/tag GitHub Actions publication steps were not run: this verify phase is before delivery and the user explicitly prohibited commit, tag, push, and publish. Alpha.4 pointer coherence and the release contract were independently verified.

## Focused behavior-seam inventory

Each apply seam has exactly one final focused association. Exact duplicate commands are merged in first-seen order.

1. **Global Linear authority follows explicit and isolated agent homes** → `bun test tests/linear-integration.test.ts`
2. **Operational compatibility and fail-closed inspection preserve distinct evidence** → `bun test tests/linear-integration.test.ts` (merged exact command)
3. **Staged deploy persists its injected `off/on` selection and payload** → `bun test tests/installed-agent-inventory.test.ts`
4. **Install plans expose canonical Linear integration vocabulary** → `bun test tests/install-plan.test.ts`
5. **Installer selection, defaults, deploy handoff, and summary preserve one canonical Linear decision** → `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts`
6. **Staged installer doctor accepts the current Linear chain and rejects broken deployed evidence** → `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts`
7. **Runtime and installer doctors make matching Linear health decisions** → `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts`
8. **Alpha.4 release pointers are coherent and describe the repaired installation flow** → the release-contract command below.

## Fresh command plan and result evidence

Normalized commands below remove only surrounding whitespace. Every listed command was invoked once in this verify run; the guard used on macOS was a Perl alarm because `timeout` is not installed.

| Order | Normalized command | Covered seams / roles | Source associations | Current result |
|---:|---|---|---|---|
| 1 | `bun test tests/linear-integration.test.ts` | Seams 1, 2 | `tests/linear-integration.test.ts` | PASS — 18 tests, 36 expectations |
| 2 | `bun test tests/installed-agent-inventory.test.ts` | Seam 3 | `tests/installed-agent-inventory.test.ts` | PASS — 6 tests, 66 expectations |
| 3 | `bun test tests/install-plan.test.ts` | Seam 4 | `tests/install-plan.test.ts` | PASS — 15 tests, 388 expectations |
| 4 | `bun test tests/installer-runtime-menu.test.ts tests/install-plan.test.ts tests/installed-agent-inventory.test.ts` | Seam 5 | `tests/installer-runtime-menu.test.ts`, `tests/install-plan.test.ts`, `tests/installed-agent-inventory.test.ts` | PASS — 69 tests, 677 expectations |
| 5 | `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts` | Seam 6 | `tests/installed-agent-inventory.test.ts`, `tests/template-agent-inventory.test.ts` | PASS — 13 tests, 83 expectations |
| 6 | `bun test tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/linear-integration.test.ts` | Seam 7 | `tests/installed-agent-inventory.test.ts`, `tests/template-agent-inventory.test.ts`, `tests/linear-integration.test.ts` | PASS — 31 tests, 119 expectations |
| 7 | <code>bun test tests/release-asset-contract.test.ts && test "$(bun -e 'console.log(require("./installer/package.json").version)')" = "0.82.0-alpha.4" && grep -q 'INSTALLER_VERSION = "0.82.0-alpha.4"' installer/src/core/version.ts && grep -m1 '^## ' CHANGELOG.md | grep -q '0.82.0-alpha.4'</code> | Seam 8; release contract and pointer gate | `tests/release-asset-contract.test.ts`, `installer/package.json`, `installer/src/core/version.ts`, `CHANGELOG.md` | PASS — 13 tests, 136 expectations; all pointer assertions pass |
| 8 | `bun test tests/linear-integration.test.ts tests/installed-agent-inventory.test.ts tests/template-agent-inventory.test.ts tests/install-plan.test.ts tests/installer-runtime-menu.test.ts tests/release-asset-contract.test.ts` | Explicit focused behavior/release suite role; no additional seam association | Six focused test files named by the command | PASS — 107 tests, 866 expectations |
| 9 | `bun test tests/` | OpenSpec config unit, integration, and e2e test roles | `tests/` | PASS — 2,589 tests, 12,514 expectations |
| 10 | `bun test` | OpenSpec `verify.test_command`; explicit full-suite role | Repository test suite | PASS — 2,589 tests, 12,514 expectations |
| 11 | `bun test && bun run typecheck` | Explicit tasks 8.2 full-suite + root typecheck role | Repository test suite; root TypeScript graph | PASS — 2,589 tests; `tsc --noEmit` passed |
| 12 | `cd installer && bun run typecheck` | OpenSpec quality typecheck; explicit task 8.3 role | Installer TypeScript graph | PASS — `tsc --noEmit` passed |
| 13 | `bun run typecheck` | Explicit user-requested root typecheck role | Root TypeScript graph | PASS — `tsc --noEmit` passed |

A preliminary `timeout 300 ...` wrapper attempt returned 127 before launching Bun because this macOS environment has no `timeout`; it is not a test result. One initial shell-quoting attempt for the release compound exited 2 before launching Bun; the exact underlying command was then rerun successfully through a bounded Python shell invocation. All required commands were freshly invoked with a bound (Perl alarm, or Python timeout for that compound).

## Observable behavior confirmed

- **Canonical selection and persistence:** installer tests exercise interactive `off` and `on`, `--yes` and `--no-linear` defaulting to `off`, exact summary text, direct canonical deploy handoff, plan vocabulary, and staged persistence as `{ "linear": "off" | "on" }`.
- **Authority and compatibility:** canonical module tests exercise explicit `agentDir`, `EIN_PI_AGENT_HOME` precedence over `PI_CODING_AGENT_DIR`, fallback isolated home, `linear` precedence over `mode`, legacy `solo → off` and `team → on`, and no mutation of legacy evidence.
- **Fail-closed evidence:** resolver tests distinguish tolerant operational fallback from strict inspection. Unknown values, malformed JSON, and unreadable global evidence remain invalid/unreadable; staged doctor tests verify both doctors return FAIL for those cases.
- **Installer/runtime doctor parity:** the generated staged archive is deployed before each real doctor call. Valid `off/on`, missing `linear-integration.ts`, missing dynamic read, missing directive, unknown, malformed, and unreadable evidence are compared across both doctors with matching focal PASS/FAIL levels.
- **Current bundled template:** staged inventory confirms `lib/linear-integration.ts` is present, `lib/mode.ts` is absent, and the deployed dynamic prompt chain is checked. Source marker inspection also finds no current installer/runtime `Modo Solo/Team`, `/ein:mode team`, or static `work mode` wording.
- **Release pointers:** package metadata, `INSTALLER_VERSION`, leading changelog heading, and the version-agnostic release asset contract all agree on `0.82.0-alpha.4`.

## Spec coverage

| Requirement | Result | Evidence |
|---|---|---|
| 1. Canonical `off/on` selection, persistence, and reporting | PASS | Focused seams 3–5; staged `off/on` tests |
| 2. Isolated global path and legacy compatibility | PASS | Focused seams 1–2 |
| 3. Both doctors validate current dynamic Linear runtime contract | PASS | Focused seams 6–7; real staged bundle |
| 4. Invalid/unreadable evidence fails closed | PASS | Focused seams 1, 6, and 7; explicit unknown/malformed/unreadable cases |
| 5. Clean staged deployment reaches post-deploy doctor success for `off/on` | PASS | Real generated archive, extraction/deploy, persistence, and real post-deploy doctors |
| 6. Alpha.4 pointer preparation and release contract | PASS for preparation/contract | Focused seam 8 |
| 6. Remote tag/workflow/assets | DEFERRED by phase and explicit user prohibition | No tag/push/publish performed; delivery task group 9 is post-verify |

## Task completion

- Tasks 1–8: complete in `tasks.md` and independently reverified here.
- Task group 9 (post-merge remote delivery): intentionally not executed. No source, commit, tag, push, release, or publication action was performed.
- No production build was run; the staged fixture is the required behavioral bundle check, not a release build.

## Strict-TDD audit

Strict TDD is active (`openspec/config.yaml: strict_tdd: true`, `preflight.json: tdd=strict`). `apply-progress.md` contains a `TDD Cycle Evidence` table for every eight apply behavior seams, with RED, GREEN, TRIANGULATE, and REFACTOR/final focused command evidence. Reported test files exist in the current tree, and all relevant focused tests are GREEN in this run.

Assertion-quality audit: no tautological assertions, ghost loops, type-only assertions, or smoke-only substitutes were found in the changed tests. The staged tests exercise real bundle generation, archive injection, extraction, deployment, persistence, and both doctor implementations; mutation cases target one contractual seam at a time. Source-string assertions in the template inventory are supplementary and are backed by the real staged doctor/deploy regression.

## Global-check disposition

- **Scheduled:** `bun test tests/` for all three configured test layers (exact command merged as one execution), `bun test`, `bun test && bun run typecheck`, `bun run typecheck`, `cd installer && bun run typecheck`, the explicit six-file focused suite, and the release-contract/pointer command.
- **Not relevant:** coverage because OpenSpec config has an empty command and no coverage commands; lint because the configured lint command/list is empty and changed behavior is covered by focused tests/typechecks; format because its configured command/list is empty and no formatting acceptance criterion exists. No invented build or coverage command was substituted.
- **Not relevant to this verify phase:** tag/push/GitHub Actions watch/release asset commands. They are post-merge delivery tasks and explicitly prohibited by the user for this phase; this does not downgrade the code verification result.

Cleaner advisory participation was unavailable because `CHANGELOG.md` exceeded its size bound and `installer/package.json` scope was rejected. This is recorded as non-gating; the independent focused and full verification evidence above does not depend on that advisory.

## Blockers and risks

No blocker to this verify phase. Remote alpha.4 delivery remains pending the separate post-merge workflow and asset verification, which must not be substituted with local publication.
