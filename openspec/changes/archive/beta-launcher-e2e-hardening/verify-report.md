status: pass
behavior_coverage: verified
skill_resolution: paths-injected

# Verification report — beta-launcher-e2e-hardening

## Executive result

Fresh independent verification passes after remediation. The focused E suite, three repeated E stress runs, B–D regressions, installer typecheck, and full Bun suite are green. The requested former blockers are now exercised by observable PTY, sidecar-evidence, fixture-manifest, exit-code, and privacy assertions; no production/dependency change was found.

No source, production, dependency, lockfile, commit, push, or close action was performed by this verification phase.

## Codegraph impact review

The required impact review ran before current-source inspection:

```text
codegraph explore "beta-launcher-e2e-hardening changed installer launcher PTY provider sentinels recording executor manifest PID listener doctor EOF SIGINT timeout report projection refresh Claude PTY"
codegraph explore "tests/beta-launcher-e2e-hardening.test.ts PTY controller fixture manifest provider sentinel recording executor stale second run projection count report bytes Claude doctor cleanup exit privacy"
```

The first query returned the current D/doctor/launcher blast radius (`installer/src/core/launcher.ts`, `installer/src/core/verify.ts`, `installer/src/cli/doctor.ts`, `ein-pi/agent/extensions/ein-doctor.ts`, and `cc-ein/sdd-cli/cli.ts`). The second index query did not expose the new E test symbols reliably, so the current E test and driver were then read directly as allowed by the map's indexing limitation. No production launcher/projector/adapter files are modified in the workspace.

## Scope/spec coverage

| Requirement | Result | Fresh evidence |
|---|---|---|
| R1 — reproducible PTY flow | PASS | `tests/beta-launcher-e2e-hardening.test.ts:211-342` uses `Bun.Terminal`, argv spawning, prompt-synchronized writes, bounded prompt/exit waits, EOF, SIGINT, and teardown. Normal exit, real Claude launch, EOF, SIGINT, invalid input, unavailable candidate, and timeout are exercised. `plain()` deliberately normalizes ANSI, CRLF, and echo bytes (`:203-205,471-475`). |
| R2 — real adapters/plan/safe executor | PASS | `tests/fixtures/beta-launcher-e2e-driver.ts:91-105,124-133` composes real `createRuntimeSessionAdapter`, `buildLaunchPlan`, and `executeLaunchPlan`, injecting only a recording executor. The Claude PTY test asserts one exact recording event (`tests/beta-launcher-e2e-hardening.test.ts:447-468`); executor-failure PTY cases assert one event (`:833-839`); default-no and rejected-plan paths assert zero (`:613-621,704-712`). Both fake provider scripts remain byte-for-byte `untouched`. Direct boundary tests cover both providers, fixed executable/cwd, empty argv, isolated environment, `shell: false`, request-only create, Pi listing, Claude unsupported listing, unsupported resume, normalized outcomes, and plan rejection. |
| R3 — project/OpenSpec/freshness | PASS | The fixture calls `projectProjectState` as the sole authority and verifies canonical OpenSpec/Git/current verification (`:517-528`). One tracked mutation changes the state ref and yields stale/unknown evidence (`:531-545`). A second fresh PTY run renders `Verification: outcome=unknown freshness=stale`, launches with `freshness=stale`, preserves report bytes, records exactly one `project-start` and one `project`, and records exactly one executor event (`:548-579`); the report is not refreshed. Invalid, incomplete, and unavailable evidence remain explicit (`:582-597`). |
| R4 — bounded doctor behavior | PASS | Fixture doctor success is capped to ten rows and returns to the same menu (`:725-744`); cancelled, unavailable, and thrown outcomes return to the menu with normalized privacy-safe labels (`:783-813`). The actual production no-bridge entrypoint PTY renders the actionable unavailable message and returns to the menu without writes (`:750-780`). |
| R5 — failure diagnostics/closed exits/privacy | PASS | PTY executor exit/signal/throw/invalid results, invalid selection, unavailable candidate, invalid runtime, EOF, and SIGINT are exercised (`:820-873`). Observed exit codes are asserted as `[2, 1, 130]` from the actual invalid/unavailable/EOF runs, while successful PTY paths observe `0`; no self-comparison tautology remains. `runDriver` checks every wrapped transcript for fixture roots, `PRIVATE`, and ANSI controls after deliberate normalization (`:386-394`); doctor and production fallback paths have equivalent privacy assertions. |
| R6 — ownership and cleanup | PASS | `manifest()` hashes sorted project/runtime entries including bytes, modes, symlink targets, and Git HEAD/status/stateRef (`:177-201`). `runDriver()` captures and compares exact project and home manifests, both provider sentinel bytes, PID liveness, terminal closure, prompt-listener count, and driver SIGINT/pending-read cleanup for every wrapped success/failure/doctor/EOF/SIGINT scenario (`:358-394`). Timeout teardown separately verifies PID death, terminal/listener closure, and exact manifests (`:496-515`). Final residue scan is clean. |
| R7 — strict TDD evidence | PASS | `openspec/config.yaml` has `strict_tdd: true`; `apply-progress.md` contains the required `TDD Cycle Evidence` table with RED/GREEN/triangulation evidence for provider safety, freshness, cleanup, PTY normalization, and exit/privacy. All reported E test/driver paths exist. Relevant tests and full suite are green. Assertion audit found no tautology, type-only assertion, ghost loop, smoke-only critical path, or CSS implementation-detail assertion. |

## Former blocker verification

- **Provider safety:** provider sentinels are created with a deterministic `spawned` append trap and are byte-compared before/after each PTY scenario. The real Claude launch has exactly one recording event with exact executable, empty argv, project cwd, isolated env, `shell: false`, and `AbortSignal`; executor failure launches also have exactly one. Default-no and rejected-plan paths have zero executor calls/events. No provider script was executed.
- **Freshness:** after exactly one tracked-source mutation, the second independent PTY process renders stale verification, retains the stale confirmed snapshot through launch, leaves report bytes unchanged, emits one projection, and emits no launch-triggered reprojection.
- **Ownership/cleanup:** exact normalized manifests and Git identity are checked for wrapped success, failure, doctor, invalid/unavailable, EOF, and SIGINT flows; timeout has a dedicated PID/listener/manifest check. Driver evidence confirms signal-listener removal and zero pending reads; PTY disposal confirms no live child and closed terminal/listeners.
- **Claude and normalization:** Claude is selected and launched through the real PTY; the recording event is inspected exactly. A deliberate ANSI + CRLF + echo byte sample is normalized to stable plain text without guessing sleeps.
- **Exit/privacy:** actual observed invalid/unavailable/EOF results produce `2/1/130`, successful flows produce `0`, and no tautological matrix assertion remains. Normalized transcripts exclude fixture-root, `PRIVATE`, and ANSI markers; raw exception/provider details are not rendered.

## Task completion and SDD ownership

- `tasks.md` contains 15/15 checked boxes (`1.1` through `5.3`); no unchecked task remains.
- `apply-progress.md` is `status: complete`, `blocked_by: none`, and includes strict-TDD cycle evidence.
- `tasks.md` retains `status: ready`; this header is owned by the tasks phase and is non-blocking because deterministic SDD guard/TDD checks in the full suite pass and all checkboxes are complete.

## Validation commands and fresh results

The host has no `timeout` executable, so each long-running command below used this bounded equivalent (alarm 300 seconds); no command was piped through a pager or truncating filter.

1. `perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test tests/beta-launcher-e2e-hardening.test.ts` — **PASS**, 26 tests / 325 expectations.
2. `perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bash -lc 'for i in 1 2 3; do echo "--- E run $i ---"; bun test tests/beta-launcher-e2e-hardening.test.ts || exit 1; done'` — **PASS**, 3/3 E runs, 26 tests / 325 expectations each; no timeout instability.
3. `perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/beta-launcher-e2e-hardening.test.ts` — **PASS**, 151 tests / 850 expectations.
4. `cd installer && perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun run typecheck` — **PASS**, `tsc --noEmit`.
5. `perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test` — **PASS**, 1,259 tests / 4,534 expectations / 0 failures across 96 files.
6. Residue scan: `set -eu; TMP_ROOT="${TMPDIR:-/tmp}"; found=0; for root in "$TMP_ROOT" /tmp; do [ -d "$root" ] || continue; matches=$(find "$root" -maxdepth 1 -type d \( -name 'ein-beta-launcher-e2e-*' -o -name 'ein-runtime-test-owner-*' -o -name 'ein-runtime-test-*' \) -print 2>/dev/null || true); if [ -n "$matches" ]; then printf '%s\\n' "$matches"; found=1; fi; done; [ "$found" -eq 0 ]; printf 'fixture residue scan: clean\\n'` — **PASS**, clean.
7. `git diff --check` — **PASS**, no output.
8. `set -eu; git diff --exit-code -- ein-pi/agent ein-pi/workbench.ts cc-ein installer package.json bun.lock; test -z "$(git ls-files --others --exclude-standard -- ein-pi/agent ein-pi/workbench.ts cc-ein installer package.json bun.lock)"; printf 'forbidden production/dependency diff: empty\\n'` — **PASS**, empty.
9. `git diff --cached --quiet` — **PASS**, no staged files.
10. `grep -cE '^[-] \\[x\\] ' openspec/changes/beta-launcher-e2e-hardening/tasks.md` plus total-checkbox count — **PASS**, 15 checked / 15 total (0 unchecked).

## Changed files and boundaries

E artifacts:

- `tests/beta-launcher-e2e-hardening.test.ts`
- `tests/fixtures/beta-launcher-e2e-driver.ts`
- `openspec/changes/beta-launcher-e2e-hardening/scope.md`
- `openspec/changes/beta-launcher-e2e-hardening/map.md`
- `openspec/changes/beta-launcher-e2e-hardening/design.md`
- `openspec/changes/beta-launcher-e2e-hardening/tasks.md`
- `openspec/changes/beta-launcher-e2e-hardening/apply-progress.md`
- `openspec/changes/beta-launcher-e2e-hardening/memory-receipts.jsonl`

The workspace also contains the pre-existing fixture-isolation prerequisite artifacts and generated `EIN.md`/test changes listed by `git status`; they are not attributed to production/dependency scope. No forbidden production/dependency or staged files were found.

## Residual risks

- Native `Bun.Terminal` behavior is evidenced on Bun 1.3.14/macOS only; universal Windows/Linux PTY certification is not claimed.
- The test deliberately normalizes terminal control/CRLF/echo bytes for stable comparison; this is the documented E harness behavior rather than a claim of native PTY byte identity across platforms.
- No production build was run: it was not requested/configured for this test-only change, and installer typecheck plus the full Bun suite passed.

## Acceptance report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Fresh codegraph impact review, current design/tasks/apply evidence, and fresh focused/regression/full validation confirm the remediated E harness exercises real Pi/Claude PTY boundaries safely, stale second-run projection, exact ownership cleanup, observed exits, normalization, and privacy without production/dependency changes."
    }
  ],
  "changedFiles": [
    "tests/beta-launcher-e2e-hardening.test.ts",
    "tests/fixtures/beta-launcher-e2e-driver.ts",
    "openspec/changes/beta-launcher-e2e-hardening/apply-progress.md",
    "openspec/changes/beta-launcher-e2e-hardening/verify-report.md"
  ],
  "testsAddedOrUpdated": [
    "tests/beta-launcher-e2e-hardening.test.ts",
    "tests/fixtures/beta-launcher-e2e-driver.ts"
  ],
  "commandsRun": [
    {
      "command": "perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test tests/beta-launcher-e2e-hardening.test.ts",
      "result": "passed",
      "summary": "26 tests, 325 expectations"
    },
    {
      "command": "perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bash -lc 'for i in 1 2 3; do bun test tests/beta-launcher-e2e-hardening.test.ts || exit 1; done'",
      "result": "passed",
      "summary": "3/3 repeated E runs passed"
    },
    {
      "command": "perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test tests/minimal-workbench-launcher.test.ts tests/shared-project-state.test.ts tests/runtime-session-adapters.test.ts tests/beta-launcher-e2e-hardening.test.ts",
      "result": "passed",
      "summary": "151 tests, 850 expectations"
    },
    {
      "command": "cd installer && perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun run typecheck",
      "result": "passed",
      "summary": "tsc --noEmit"
    },
    {
      "command": "perl -e '$SIG{ALRM}=sub{exit 124}; alarm 300; exec @ARGV' -- bun test",
      "result": "passed",
      "summary": "1,259 tests, 4,534 expectations, 0 failures"
    },
    {
      "command": "fixture residue scan",
      "result": "passed",
      "summary": "no matching E/runtime roots"
    },
    {
      "command": "git diff --check",
      "result": "passed",
      "summary": "clean"
    },
    {
      "command": "forbidden production/dependency diff",
      "result": "passed",
      "summary": "empty"
    },
    {
      "command": "git diff --cached --quiet",
      "result": "passed",
      "summary": "no staged files"
    }
  ],
  "validationOutput": [
    "Provider sentinels remained untouched; launch and no-launch PTY event counts matched their expected one/zero contracts.",
    "Second fresh stale PTY run preserved report bytes, projected once, and did not refresh on launch.",
    "Exact project/runtime manifests and child/listener cleanup passed across the tested success/failure/doctor/EOF/SIGINT/timeout paths."
  ],
  "residualRisks": [
    "Bun native PTY portability beyond Bun 1.3.14/macOS is not certified.",
    "Terminal bytes are deliberately normalized for cross-platform comparison."
  ],
  "noStagedFiles": true,
  "diffSummary": "Fresh verification artifact replacement only; E test/driver and SDD artifacts are test-owned, with no production or dependency diff.",
  "reviewFindings": [
    "none"
  ],
  "manualNotes": "tasks.md status: ready is a tasks-phase header ownership detail; 15/15 checkboxes are complete, apply-progress is complete, and deterministic SDD checks are green."
}
```
