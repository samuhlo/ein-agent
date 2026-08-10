status: pass
behavior_coverage: verified
skill_resolution: paths-injected

# Verify report — surface-wiring

## Result

The required exact top-level status signal is present above. The completed surface-wiring tasks pass their focused seams, direct regression set, full Bun suite, installer typecheck, launcher syntax checks, and fresh compiled-Claude clean-home smoke.

No implementation was modified during this VERIFY retry. This retry writes only `openspec/changes/surface-wiring/verify-report.md`.

## Behavior coverage

`behavior_coverage: verified`.

A real Claude runner was freshly compiled with `bun build --compile` into a temporary isolated `HOME/.claude-ein/bin/ein-surface-runner`. The copied real `cc-ein` Fish launcher invoked that compiled executable, not a source shim, for valid `cleaner.audit`, `cleaner.mutate`, and `cleaner.complete` requests. Observable results:

- `cleaner.audit`: exit `0`; `cleaner-surface-result/v1`, `status: processed`, `reason: audit-processed`; payload was `cleaner-audit-report/v1`, `mode: read-only`, `classification: observed-fact`, `g.outcome: reviewed`, and `appliedChanges: 0`.
- `cleaner.mutate`: exit `0`; `status: processed`, `reason: verification-required`; one bounded exact replacement produced a transition and changed only the temporary project target.
- `cleaner.complete`: exit `0`; `status: processed`, `reason: verification-unavailable`, payload `status: verification-required`. Completion remained a separate call and did not execute verification.
- A separately compiled runner through the same temporary `cc-ein` launcher reached workbench non-TTY gating: bounded guidance was emitted and exit was `2`.

The temporary project, isolated Claude home, config, cache, and Git configuration were all under fresh temporary directories. No developer `~/.claude`, `~/.claude-ein`, `~/.pi`, or `~/.pi-ein` home was used.

## Inputs and scope

Crossed:

- `openspec/changes/surface-wiring/scope.md`
- `openspec/changes/surface-wiring/map.md`
- `openspec/changes/surface-wiring/design.md`
- `openspec/changes/surface-wiring/tasks.md`
- `openspec/changes/surface-wiring/apply-progress.md`
- `openspec/config.yaml`
- current surface runner, workbench seam, launcher, sync, and test files
- the prior `verify-report.md` as audit input only

`strict_tdd: true` remains active. No implementation or test source was changed in this retry.

## Spec coverage

| Requirement | Current evidence | Result |
|---|---|---|
| R1 explicit clean-session activation | Fresh installed Pi/Claude focused seam plus compiled Claude launcher exercise cleaner namespaces, workbench, passthrough, and isolation | pass |
| R2 shared audit semantics | Fresh authority/audit focused seam and compiled Claude audit preserve `cleaner-audit-report/v1`, read-only mode, zero changes, and reviewed/unavailable semantics | pass |
| R3 separate mutation stages | Fresh mutation/completion focused seam and compiled Claude mutate/complete calls preserve one write, transition output, and verification-required separation | pass |
| R4 fail-closed mutation safety | Fresh surface suite covers stale/unavailable, symlink, writer-failure, malformed, unsafe, oversized, and no-unauthorized-write outcomes | pass |
| R5 workbench preservation | 55-test workbench seam plus compiled Claude non-TTY invocation preserve TTY gating and exit `2` | pass |
| R6 runtime parity | Fresh Pi/Claude installed outputs and the compiled Claude matrix preserve version/status/reason semantics; packaging difference is only the declared compiled payload | pass |
| R7 bounded versioned protocol | Focused protocol tests and compiled payload reject malformed/unsafe/oversized input and emit bounded versioned diagnostics | pass |
| R8 installed seam and isolation | Fresh installed surface suite and compiled Claude temporary-home matrix invoke real Fish adapters and leave vanilla homes untouched | pass |

## Task completion

`tasks.md` remains complete: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 6.2, and 7.1 are checked `[x]`. No pending task or apply deviation remains.

## Focused behavior-seam plan and current results

The plan was rebuilt from the final behavior-seam rows in `apply-progress.md`, current `design.md`/`tasks.md`, and `openspec/config.yaml`. Exactly one final focused command is retained for each apply seam. Commands are normalized by trimming only surrounding whitespace; Perl alarm wrappers are documented separately because this macOS host has no `timeout` or `gtimeout`.

| # | normalized command | covered seam / role | source association | current result |
|---:|---|---|---|---|
| 1 | `bun test tests/surface-wiring.test.ts --test-name-pattern 'protocol|request|diagnostic'` | versioned protocol and bounded diagnostics / focused | apply Group 1; task 1.1 | passed — 8 tests, 0 fail |
| 2 | `bun test tests/surface-wiring.test.ts --test-name-pattern 'audit|authority'` | fresh authority audit / focused | apply Group 2; task 2.1 | passed — 11 tests, 0 fail |
| 3 | `bun test tests/surface-wiring.test.ts --test-name-pattern 'mutate|complete'` | bounded mutation and separate completion / focused shared command | apply Group 3; task 3.1 | passed — 7 tests, 0 fail |
| 4 | `bun test tests/minimal-workbench-launcher.test.ts` | shared workbench entrypoint and behavior preservation / focused | apply Group 4; task 4.1; design required check | passed — 55 tests, 0 fail |
| 5 | `bun test tests/surface-wiring.test.ts --test-name-pattern 'Pi|pi-ein|passthrough'` | Pi launcher dispatch and passthrough / focused | apply Group 5; task 5.1 | passed — 8 tests, 0 fail |
| 6 | `bun test tests/surface-wiring.test.ts --test-name-pattern 'Claude|sync|payload|compile'` | Claude launcher, sync, payload compilation / focused shared command | apply Group 6; tasks 6.1–6.2 | passed — 8 tests, 0 fail |
| 7 | `bun test tests/surface-wiring.test.ts` | real installed Pi/Claude seams, parity, safety, and isolation / focused | apply Group 7; task 7.1; design required check | passed — 30 tests, 0 fail |

## Global-check disposition

| Candidate | Disposition | Reason |
|---|---|---|
| `bun test` | scheduled | Explicit `openspec/config.yaml` verify gate; passed fresh sequentially with 1,453 tests / 0 failures |
| `bun test tests/` | scheduled | Explicit configured unit, integration, and e2e command; passed fresh sequentially with 1,453 tests / 0 failures |
| `cd installer && bun run typecheck` | scheduled | Explicit config typecheck and design/task requirement; passed |
| Direct engine regression command | scheduled | Explicit design required verification command; passed 106 tests / 0 failures |
| `fish -n pi-ein/pi-ein.fish cc-ein/cc-ein.fish` | scheduled | Launcher syntax is an explicit surface validation requirement; passed |
| `git diff --check` | scheduled | Apply recorded scoped whitespace validation; passed |
| Real compiled Claude runner and clean-home smoke | scheduled | Explicit design packaging requirement and user-requested coverage retry; passed |
| lint | not relevant | No lint command or lint command list is configured |
| format | not relevant | No format command or format command list is configured |
| coverage | not relevant | Coverage command and command list are blank; no coverage command is required by design/tasks |
| full application production build | not relevant | No repository production-build command is configured or required for this surface-only change; the required standalone runner compilation was scheduled separately |

## Current command results

All Bun test/typecheck commands below were invoked fresh with `perl -e 'alarm 300; exec @ARGV' -- ...` (the host lacks `timeout`/`gtimeout`).

| normalized command | result | current outcome |
|---|---|---|
| `bun test tests/cleaner-read-only-audit.test.ts tests/cleaner-bounded-mutations.test.ts tests/minimal-workbench-launcher.test.ts tests/reviewed-area-ledger.test.ts` | passed | 106 tests, 0 failures |
| `bun test` | passed | 1,453 tests, 0 failures |
| `bun test tests/` | passed | 1,453 tests, 0 failures |
| `cd installer && bun run typecheck` | passed | `tsc --noEmit` exited 0 |
| `fish -n pi-ein/pi-ein.fish cc-ein/cc-ein.fish` | passed | both launcher files parsed successfully |
| `git diff --check` | passed | no whitespace errors reported |
| `bun build --compile ein-pi/agent/surfaces/surface-runner.ts` in an isolated temporary Claude home | passed | 22 modules bundled; executable payload was non-empty |
| real temporary-home `cc-ein cleaner audit`, `mutate`, and `complete` through that compiled payload | passed | exits `0`, processed versioned results; audit/mutate/complete observations recorded above |
| real temporary-home `cc-ein workbench` through a freshly compiled payload | passed | bounded non-TTY guidance and exit `2` |

The compiled-Claude checks used temporary canonicalized roots (`mktemp` followed by `pwd -P`) because the production ledger adapter intentionally rejects non-canonical workspace paths. This validates the real boundary rather than weakening it.

The first attempted concurrent invocation of `bun test` and `bun test tests/` produced fixture-collision failures in unrelated installer/runtime tests. Those concurrent outputs were not used as evidence. Each exact global command was then rerun alone with the required alarm bound and passed; the current rows above are the only final evidence.

## Strict-TDD audit

- `apply-progress.md` contains a `TDD Cycle Evidence` table for every Groups 1–7 seam.
- Every table records RED, GREEN, TRIANGULATE, REFACTOR, and exactly one final focused command.
- Reported test files exist: `tests/surface-wiring.test.ts` and `tests/minimal-workbench-launcher.test.ts`.
- Relevant focused tests, direct engine regressions, and the full suite were rerun fresh and remain GREEN.
- Assertion review found behavioral assertions for protocol/status/reason payloads, adapter call bounds, one-write behavior, content/symlink protection, exit codes, passthrough arguments, parity, missing deployment, isolation, and compiled Claude results. No tautologies, ghost loops, type-only-only checks, smoke-only replacement for the seam, or implementation-detail CSS assertions were found.
- Strict-TDD compliance: **pass**.

## Review findings and residual risks

- **No blocker (severity: none; paths reviewed: `ein-pi/agent/surfaces/surface-runner.ts`, `cc-ein/sync.ts`, `cc-ein/cc-ein.fish`, `pi-ein/pi-ein.fish`, and `tests/surface-wiring.test.ts`).** No implementation defect was found in the completed change.
- **Low residual risk (`cc-ein/sync.ts`):** top-level `runSync()` was not run against a real developer home because it can invoke optional Claude MCP setup. The required compiler/promotion helpers and the real standalone compiled payload were exercised in temporary homes; no developer home was used.
- **Low residual risk (`git diff --check`):** Git whitespace validation covers tracked diff entries; newly created apply files are covered by Bun parsing/tests and the standalone compile, not by Git's tracked-diff check.

## Acceptance evidence

- review-findings: no blocker; the concrete severity-tagged review finding and residual risks above name the relevant production/test paths.
- residual-risks: only low, explicitly bounded sync-side-effect and untracked-whitespace-validation limitations remain; the reported medium compiled-Claude valid-request gap is closed by the fresh real compiled audit/mutate/complete matrix.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "This report begins with the exact top-level `status: pass` signal and records concrete path-based findings with severity plus residual risks; no blocker was found."
    }
  ],
  "changedFiles": [
    "openspec/changes/surface-wiring/verify-report.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "bun test tests/surface-wiring.test.ts",
      "result": "passed",
      "summary": "30 tests passed; real installed Pi/Claude seams, safety, parity, passthrough, and isolation."
    },
    {
      "command": "bun test tests/minimal-workbench-launcher.test.ts",
      "result": "passed",
      "summary": "55 tests passed."
    },
    {
      "command": "bun test tests/cleaner-read-only-audit.test.ts tests/cleaner-bounded-mutations.test.ts tests/minimal-workbench-launcher.test.ts tests/reviewed-area-ledger.test.ts",
      "result": "passed",
      "summary": "106 direct regression tests passed."
    },
    {
      "command": "bun test",
      "result": "passed",
      "summary": "1,453 tests passed, 0 failed in the final sequential run."
    },
    {
      "command": "bun test tests/",
      "result": "passed",
      "summary": "1,453 tests passed, 0 failed in the final sequential run."
    },
    {
      "command": "cd installer && bun run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit passed."
    },
    {
      "command": "fish -n pi-ein/pi-ein.fish cc-ein/cc-ein.fish",
      "result": "passed",
      "summary": "Both launcher files parsed successfully."
    },
    {
      "command": "bun build --compile ein-pi/agent/surfaces/surface-runner.ts; isolated cc-ein cleaner audit/mutate/complete and workbench smoke",
      "result": "passed",
      "summary": "Fresh real compiled Claude payload ran valid cleaner requests with exit 0 and workbench non-TTY with exit 2 under temporary isolated homes."
    }
  ],
  "validationOutput": [
    "status: pass",
    "behavior_coverage: verified",
    "Compiled Claude audit returned cleaner-surface-result/v1 processed/audit-processed with cleaner-audit-report/v1, read-only mode, observed-fact, reviewed/current evidence, and appliedChanges 0.",
    "Compiled Claude mutate returned processed/verification-required with one transition; compiled Claude complete returned processed/verification-unavailable and remained verification-required.",
    "No developer runtime home was used; vanilla homes remained untouched in installed seam fixtures."
  ],
  "residualRisks": [
    "low: cc-ein/sync.ts runSync was not run against a real home because optional MCP setup has external side effects; compiler/promotion and real payload execution passed in temporary homes.",
    "low: git diff --check does not include untracked apply files; Bun tests and compiled execution cover those files."
  ],
  "noStagedFiles": true,
  "diffSummary": "Corrected verify-report.md with the exact status signal, fresh final command results, strict-TDD audit, and real compiled-Claude clean-home evidence; no implementation changes were made.",
  "reviewFindings": [
    "none (severity: none): no blocker found in ein-pi/agent/surfaces/surface-runner.ts, cc-ein/sync.ts, cc-ein/cc-ein.fish, pi-ein/pi-ein.fish, or tests/surface-wiring.test.ts."
  ],
  "manualNotes": "The first parallel global-test attempt collided in unrelated shared fixtures and was discarded; the same exact commands were rerun sequentially and passed. All build/test commands were alarm-bounded with Perl because timeout/gtimeout is unavailable on this macOS host."
}
```
