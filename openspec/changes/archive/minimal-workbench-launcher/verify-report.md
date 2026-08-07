# Verification report — minimal-workbench-launcher

status: pass
behavior_coverage: partial
skill_resolution: paths-injected

## 1. Executive result

The approved remediation is verified as pass for the launcher slice. The full launcher suite, sequential B/C/session/installer compatibility suites, focused privacy/no-write/perimeter checks, CLI help/non-TTY checks, and diff hygiene are green. The exact strict targeted TypeScript command still exits non-zero only on imported/pre-existing diagnostics; its launcher/workbench/focused-test attributable diagnostic set is empty.

Behavioral coverage is partial rather than full: fake seams exercise the launcher behavior and the real adapter compatibility boundary, but no real TTY, default process executor, Pi/Claude runtime, or callable production doctor bridge was invoked by design.

## 2. Scope and spec coverage

The active delta is `openspec/changes/minimal-workbench-launcher/specs/sdd-lifecycle/spec.md`, containing five ADDED scenarios. `openspec/config.yaml` has `strict_tdd: true`. `design.md`, `tasks.md`, and the cumulative `apply-progress.md` were cross-referenced against the implementation and tests.

| Active scenario / launcher requirement | Result | Evidence and residual gap |
|---|---|---|
| Separate entrypoint and explicit project/runtime confirmation | Covered | Focused flow tests prove ordered candidate projection, explicit selection, yes/no confirmation, re-selection after `no`/invalid input, runtime gating, and no adapter calls before confirmation. `--help` and non-TTY entrypoint smoke checks also passed. No real interactive TTY was used. |
| Honest ProjectStateV1 state/freshness presentation | Covered | Focused renderer and B suites cover current, stale, unbound, unavailable, invalid, absent, incomplete, and ambiguous evidence; phase/next, quality/reason, Git status, verification outcome/freshness remain explicit. No visual or screen-reader session was run. |
| Capability-aware Pi/Claude session actions | Covered | Full launcher and C suites cover Pi list, Claude list unsupported, request-only create for both, resume unsupported, normalized outcomes, opaque references, and independently mutated injected Pi/Claude descriptors failing closed before list/create/launch. |
| Private metadata and bounded output | Covered | Focused privacy assertions, B/C privacy tests, doctor bounds, and no-Pi-package-imports suite pass. No real provider output was captured (intentionally). |
| Safe confirmed launch through adapter boundary | Partial | Focused tests prove default-no confirmation, unchanged state/intent handoff, validated-plan-only execution, empty argv/shell-safe result handling, and normalized failure/cancel exits. C tests prove the real adapter launch boundary with a fake executor. The launcher flow was not run with the real adapter factory and no runtime was launched. |
| Partial process-boundary honesty | Covered | Create is rendered as `request prepared (not persisted)`; launch reports normalized outcomes only and does not refresh/re-project state or claim semantic/persistent success. |
| Existing doctor delegation/degradation | Partial | Injected success, unavailable, cancellation, throw, bounded-output, repeated-menu, and read-only paths pass. Production wiring intentionally exposes the bounded `unavailable` fallback because no callable safe doctor bridge is exported; real doctor delegation was not invoked. |
| TTY, cancellation, and closed exit mapping | Partial | Focused tests cover EOF/SIGINT/abort/adapter-cancelled, invalid input, `no`, and exit codes 0/1/2/130; actual `--help` exits 0 and actual non-TTY `--project .` emits one diagnostic and exits 2. No real TTY EOF or OS SIGINT stream was run. |
| Transient/no-write and ownership perimeter | Covered | B/C no-write tests, focused persistence tests, static launcher perimeter, unchanged `installer/package.json`, no bin/dependency registration, and no-Pi-package-imports checks pass. No launcher-owned persistence boundary exists. |
| Linear accessible terminal output | Covered by tests | Stable numbered choices, plain status words, bounded lines, no ANSI/cursor output, and deterministic sequential rendering are asserted. No manual assistive-technology audit was run. |

## 3. Task completion

All task checkboxes `1.1` through `7.1` in `tasks.md` are checked and `apply-progress.md` reports `status: complete`. The implementation/test files named by the apply record exist and were run:

- `ein-pi/agent/lib/workbench.ts`
- `ein-pi/workbench.ts`
- `tests/minimal-workbench-launcher.test.ts`
- predecessor compatibility files/tests used by B/C/session verification

The remediation record in `apply-progress.md` is honestly reconciled. Lines 163–179 record that the original group-003 apply attempt timed out twice while pending, produced no progress/TDD evidence, was split with user approval into groups 003 and 004, and was reconciled before later completion. Lines 181–190 record the later remediation RED/GREEN/TRIANGULATE/REFACTOR cycle: four bounded tests failed first, then confirmation loops and exact canonical capability comparison made them pass, followed by the 52-test focused run. The timeout/reconciliation is explicitly not represented as a fabricated RED/GREEN cycle.

## 4. Commands and results

All suite and smoke commands were bounded with `timeout 300` and the suites were run sequentially to avoid the known shared-temp fixture race. No production build, real runtime, real TTY, default process executor, or source edit was performed.

### Sequential full launcher and compatibility suites

1. `timeout 300 bun test tests/minimal-workbench-launcher.test.ts` — PASS, 52 passed, 0 failed.
2. `timeout 300 bun test tests/shared-project-state.test.ts` — PASS, 39 passed, 0 failed.
3. `timeout 300 bun test tests/runtime-session-adapters.test.ts` — PASS, 33 passed, 0 failed.
4. `timeout 300 bun test tests/sessions.test.ts` — PASS, 5 passed, 0 failed.
5. `timeout 300 bun test tests/installer-runtime-menu.test.ts` — PASS, 26 passed, 0 failed.

The sequential run totaled 155 passing tests and 0 failures.

### Focused behavioral/perimeter suites

- `timeout 300 bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'privacy|persistence|no writes|shell|argv|TTY|help|cancellation'` — PASS, 6 passed, 0 failed.
- `timeout 300 bun test tests/shared-project-state.test.ts --test-name-pattern 'private|no file writes|without writes|source degradation'` — PASS, 11 passed, 0 failed.
- `timeout 300 bun test tests/runtime-session-adapters.test.ts --test-name-pattern 'private|persistence|no shell|writes|ownership|isolated'` — PASS, 12 passed, 0 failed.
- `timeout 300 bun test tests/no-pi-package-imports.test.ts` — PASS, 2 passed, 0 failed.
- `timeout 300 bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'project confirmation|capabilities disagree|cancellation|invalid'` — PASS, 9 passed, 0 failed.

These explicitly exercised the bounded project-confirmation `no`/invalid loop, EOF cancellation, invalid-input behavior, and injected-adapter capability mismatch fail-closed behavior. The mismatch tests assert zero list/create/build/execute calls for independently mutated Pi and Claude descriptors.

### CLI observable checks

- `timeout 300 bun ein-pi/workbench.ts --help` — PASS, exit 0; prints usage without requiring TTY or creating dependencies.
- `timeout 300 bun ein-pi/workbench.ts --project .` in the non-TTY executor — PASS as an expected fail-closed check, exit 2; emits one actionable TTY diagnostic and does not enter projection, prompting, doctor, adapter, or executor code.

### Strict targeted TypeScript closure

Exact command:

`timeout 300 bash -c 'cd installer && ./node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ESNext --module ESNext --moduleResolution bundler --moduleDetection force --allowImportingTsExtensions --verbatimModuleSyntax --noUncheckedIndexedAccess --noFallthroughCasesInSwitch --types bun ../ein-pi/agent/lib/workbench.ts ../ein-pi/workbench.ts ../tests/minimal-workbench-launcher.test.ts ../ein-pi/agent/lib/project-state.ts ../ein-pi/agent/lib/runtime-session-adapters.ts ../ein-pi/agent/lib/sessions.ts ../tests/shared-project-state.test.ts ../tests/runtime-session-adapters.test.ts ../tests/sessions.test.ts'`

Result: exit 2 due imported/pre-existing diagnostics only. The command reports no diagnostics in the changed launcher files `ein-pi/agent/lib/workbench.ts`, `ein-pi/workbench.ts`, or `tests/minimal-workbench-launcher.test.ts`; a follow-up exact-command capture/filter independently confirmed `attributable launcher diagnostics: zero`.

Remaining diagnostics are outside this change: missing `@earendil-works/pi-coding-agent` declarations in `ein-pi/agent/extensions/ein-paths.ts`, `ein-pi/agent/lib/lang.ts`, and `ein-pi/agent/lib/project-context.ts`; strict indexed-access/union diagnostics in `ein-pi/agent/lib/openspec-spec-parser.ts`, `openspec-spec-sync.ts`, `sdd-guardrails.ts`, and `sdd-router.ts`. These are imported baseline diagnostics, not launcher findings.

### Integrity and ownership checks

- `timeout 300 git diff --check` — PASS.
- `timeout 300 git diff --cached --quiet` — PASS; no staged files.
- `timeout 300 git diff --quiet -- installer/package.json` — PASS; installer package metadata unchanged.
- Corrected JSON/static perimeter check — PASS: no installer lifecycle imports, launcher persistence calls, shell-enabled execution, raw process error forwarding, global bin field, or new dependency/bin registration in the launcher slice.
- `tests/no-pi-package-imports.test.ts` — PASS as listed above.

Two exploratory perimeter greps were initially over-broad and returned false positives (`workbench` in the installer description and `dependencies.signal` in launcher code). The corrected JSON/token checks above passed; neither was a product diagnostic.

## 5. Strict-TDD compliance and assertion-quality audit

- Strict TDD is active (`openspec/config.yaml: strict_tdd: true`).
- `apply-progress.md` contains TDD Cycle Evidence tables for groups 001–007 and the later verification-remediation cycle 008.
- The approved group-003 split, the two old timeout incidents, reconciliation, and later evidence are recorded as operational history, not fabricated cycles.
- Every reported test file exists and was executed in this verification.
- Assertions are substantive: they verify exact safe output tokens, quality/reason/freshness preservation, provider asymmetry, explicit confirmation and prompt counts, adapter/build/execute call counts, immutable state/intent handoff, normalized outcomes, no writes, private-field absence, no shell/argv leakage, bounded doctor output, and exit classification. Fixture casts (`as any`) do not replace behavioral assertions. No tautological assertion, ghost loop, type-only-only test, smoke-only test, or CSS implementation-detail assertion was found.

## 6. Findings and blockers

No attributable blocker or high-severity launcher finding remains. The previous report's blockers are closed:

- `ein-pi/workbench.ts` output writer now returns `void` rather than leaking `stdout.write`'s boolean.
- Focused fixtures now satisfy the output contract, supply the executor, and construct launch dependencies without readonly mutation.
- Project confirmation loops on `no`/invalid input and returns to bounded selection.
- Selected adapters with capability descriptors differing from the canonical matrix fail closed before list/create/launch.
- The strict-TDD incident/split/reconciliation evidence is now present in `apply-progress.md` without claiming the timed-out attempts as TDD cycles.

## 7. Explicit residual gaps and risks

1. Production doctor wiring intentionally degrades to `unavailable`; a callable existing doctor bridge was not available and no doctor implementation was duplicated.
2. No real TTY, OS SIGINT stream, Pi/Claude runtime, or default `Bun.spawn` executor was invoked. This is required by the task's safety boundary, not a failed test.
3. The launcher flow's injected launch test and C adapter launch test are separate seams; an end-to-end workbench-to-real-adapter-with-fake-executor integration would close that remaining seam without launching a runtime.
4. The exact strict TypeScript command remains non-green because of imported baseline diagnostics listed above. There are zero attributable launcher diagnostics, but repository-wide strict typing is not clean.
5. The working tree contains unrelated dirty/deleted/untracked project files (including `installer/README.md`); no staged files exist, and `installer/package.json` plus launcher ownership boundaries remain unchanged.

## 8. Recommendation

The launcher remediation is ready to close as `status: pass` with `behavior_coverage: partial`. Retain the residual-gap notes above; do not claim real runtime, TTY, doctor delegation, or repository-wide strict TypeScript closure that was not exercised.
