status: complete

## // 001. Foundational workbench IO/result contracts

Completed task 1.1 only. Added transient injected boundaries for candidates/projector,
input, output, runtime adapters, adapter-owned launch functions, doctor, and abort signal.
Added closed workbench result, cancellation reason, exit code, and classification contracts.
No orchestration, persistence, process abstraction, UI, installer import, or source mutation was added.

Files changed:
- `ein-pi/agent/lib/workbench.ts`
- `tests/minimal-workbench-launcher.test.ts`
- `openspec/changes/minimal-workbench-launcher/tasks.md`

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Focused Bun test failed because `workbench.ts` did not exist. |
| GREEN | Minimal contracts and classifiers made 7 focused tests pass. |
| TRIANGULATE | Added operational-unavailable, non-TTY usage, and adapter-cancelled cases; 10 tests passed. |
| REFACTOR | Reviewed the small public surface; no widening/refactor was warranted, and the focused suite remained green. |

Verification: `bun test tests/minimal-workbench-launcher.test.ts --test-name-pattern 'contract|exit|cancellation'` — 10 passed, 0 failed.
No applicable repository type-check covers `ein-pi`; no build or full suite was run.

Deviations: none. Remaining tasks: groups 002–006, intentionally untouched.

## // 002. Deterministic ProjectStateV1 rendering

Completed task 2.1 only. Added pure candidate/confirmation summaries and deterministic,
linear state rendering. Output preserves supplied OpenSpec phase/next and source evidence,
Git status/evidence, and verification effective outcome/freshness/evidence while withholding
paths, refs, branches, change names, and runtime details. Candidate labels strip terminal controls.

Files changed: `ein-pi/agent/lib/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Focused suite failed on missing rendering exports. |
| GREEN | Minimal view models and three-line renderer made current/uncertain fixtures pass. |
| TRIANGULATE | Added stale, unbound, unavailable, invalid, ambiguous, absent, incomplete, privacy, ordering, and hostile-label cases; hostile ANSI/newline label failed before sanitization. |
| REFACTOR | Extracted only the shared safe-label helper; focused group 002 and regression group 001 suites remained green. |

Verification: requested focused command — 9 passed; group 001 regression command — 10 passed.
No build/full suite run. Deviations: none. Remaining tasks: groups 003–006.

## // 003. Confirmed project/runtime selection and capability menu

Completed task 3.1 only. Added ordered candidate projection, explicit selection and
confirmation, Pi/Claude selection, immutable confirmed snapshot/binding pairing, stable
capability rendering, and capability-gated bounded menus. No adapter list/create/resume,
doctor, launch, entrypoint, persistence, pasted identifiers, or private paths were added.

Files changed: `ein-pi/agent/lib/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Requested focused command failed because flow/menu/capability exports were absent. |
| GREEN | Minimal confirmed selection/runtime flow and capability menu made 4 focused tests pass. |
| TRIANGULATE | Covered Pi/Claude asymmetry, confirmation EOF, unavailable candidates, privacy, call gating, and single projection. |
| REFACTOR | Aligned menu ordering with bounded list/create/doctor/exit design; focused and groups 001–002 regression tests stayed green. |

Verification: requested focused command — 4 passed; focused regression command — 23 passed.
No build/full suite run. Deviations: none. Remaining tasks: groups 004–007.

## // 004. Pi listing and request-only session creation outcomes

Completed task 4.1 only. Added privacy-safe Pi session rows (ordinal plus UTC modification
only), normalized adapter outcome presentation, and a recoverable action loop that delegates
Pi list and Pi/Claude request-only create with the unchanged confirmed snapshot/binding.
Opaque references and extra private fields never reach output; no Claude list, resume,
manual reference input, launch, persistence, or runtime process behavior was added.

Files changed: `ein-pi/agent/lib/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Requested focused command failed on missing list/outcome rendering exports before production changes. |
| GREEN | Minimal renderers and list/create action delegation made the focused success paths pass. |
| TRIANGULATE | Added Pi/Claude create, Pi list privacy/binding, and success/unsupported/unavailable/cancelled/error normalization cases; 13 focused tests passed. |
| REFACTOR | Kept one small action loop and shared outcome renderer; the complete focused file remained green (31 tests). |

Verification: requested focused command — 13 passed, 0 failed; focused file regression — 31 passed, 0 failed.
No build/full suite run. Deviations: none. Remaining tasks: groups 005–007.

## // 005. Safe confirmed runtime launch

Completed task 5.1 only. Added default-no launch confirmation after successful create,
unchanged snapshot plus adapter intent plan building, validated-plan-only execution with the
injected executor/signal, stale snapshot labeling, and closed launch result classification.
No re-projection, caller process input, shell, output capture, real runtime, persistence, or
parallel behavior was added.

Files changed: `ein-pi/agent/lib/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Requested focused command had 6 failing launch tests before orchestration existed. |
| GREEN | Minimal confirmation/build/execute path made success and normalized execution outcomes pass. |
| TRIANGULATE | Added plan mismatch/rejection and unavailability gates, stale labeling, signal, nonzero, cancellation, and default-no coverage; 22 focused tests passed. |
| REFACTOR | Kept launch handling inside the existing create branch with one closed mapping; full focused file remained green (39 tests). |

Verification: requested focused command — 22 passed, 0 failed; focused file regression — 39 passed, 0 failed.
Root `bun run tsc --noEmit --pretty false` was unavailable (`tsc` script not found); no configured type-check covers `ein-pi`.
No build/full suite run. Deviations: none. Remaining tasks: groups 006–007.

## // 006. Compact delegated doctor bridge

Completed task 6.1 only. The action loop now invokes the injected read-only doctor bridge,
renders bounded overall/check statuses, normalizes unavailable/throw/cancellation without raw
details, and always returns to the same menu. It imports no doctor or installer lifecycle code.

Files changed: `ein-pi/agent/lib/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Focused command failed because `renderDoctorResult` was not exported. |
| GREEN | Minimal compact renderer and doctor action made success, unavailable, cancellation, and throw paths pass. |
| TRIANGULATE | Added repeated-menu, ten-check bound, control/path privacy, and read-only marker coverage; 13 focused matches passed. |
| REFACTOR | Shared the actionable unavailable text; focused command remained green. |

Verification: requested focused command — 13 passed, 0 failed.
No type-check is configured for `ein-pi`; no build/full suite run. Deviations: none.
Remaining task: group 007 only, intentionally untouched.

## // 007. Separate Bun entrypoint and integration gate

Completed task 7.1. Added the thin repository-local Bun entrypoint with strict argv
parsing, normalized ordered candidate dedupe/max-20, help and fail-closed TTY gates,
built-in readline/stdio, EOF/SIGINT abort handling, production projector/adapter/launch
wiring, unavailable doctor fallback, cleanup, and deterministic exit mapping.

Files changed: `ein-pi/workbench.ts`, focused test, tasks checklist.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Focused command failed because `ein-pi/workbench.ts` did not exist. |
| GREEN | Minimal parser/entrypoint seam made argv, help, TTY, dedupe, and exit tests pass. |
| TRIANGULATE | Added invalid/missing/max-20 args, non-TTY no-effects, help without TTY, and cancellation exit coverage; focused command passed 11 matches. |
| REFACTOR | Kept production-only readline/process wiring behind the tested seam; focused and full workbench suites remained green. |

Verification: focused command — 11 passed; full workbench file — 48 passed; shared
project-state plus runtime-adapter B/C suites — 72 passed; `git diff --check` passed.
Root `bun run tsc --noEmit --pretty false` is unavailable (`tsc` script not found).
A targeted installer-local tsc attempt was not attributable-green because repository/imported
baseline type errors and unavailable Pi package types remain; no package config was changed.
Deviations: production doctor safely degrades to unavailable because no callable exported bridge exists.
Remaining tasks: none.

## // 008. Verification remediation and incident recovery

status remains complete. Verification remediation corrected the entrypoint/output fixture
`void | Promise<void>` contracts, supplied the missing fake executor, and replaced readonly
launch mutation with fixture-time dependency construction. Project confirmation now loops on
invalid yes/no input and returns `no` to bounded project selection. Selected adapters now fail
closed when their capability descriptors differ from the canonical provider matrix, before
list/create/launch calls.

### Incident and reconciliation

The original group 003 apply attempt timed out twice at the 30-minute limit while its task
was still pending and produced no progress/TDD evidence. The user approved splitting that
work; `tasks.md` was then revised into groups 003 and 004. Revised group 003 subsequently
completed with focused GREEN evidence, followed by group 004. Those operational timeouts
and checklist reconciliation are not RED/GREEN evidence and are not represented as such;
the TDD evidence below belongs only to this later verification-remediation cycle.

### TDD Cycle Evidence

| Stage | Evidence |
|---|---|
| RED | Four bounded new tests failed: `no`/invalid confirmation exited usage, and Pi/Claude capability mismatches reached later input instead of failing closed. |
| GREEN | Confirmation loops and exact canonical capability comparison made all four new tests pass without adapter/session/launch calls on mismatch. |
| TRIANGULATE | Covered `no`, invalid→`no`, existing `yes`/EOF cancellation, and independently mutated Pi and Claude create descriptors; focused file passed 52 tests. |
| REFACTOR | Kept comparison local to adapter selection, repaired fixture contracts without readonly mutation, and reran 24 relevant focused matches green. |

Verification: full focused file — 52 passed; relevant focused patterns — 24 passed;
`git diff --check` passed. The exact strict targeted TypeScript command reports zero
diagnostics in the launcher, workbench, or focused test. Its remaining diagnostics are the
same imported baseline missing Pi declarations and existing strict parser/router/guardrail
errors classified in `verify-report.md`.

Files changed: workbench core, thin entrypoint, focused test, and this cumulative record.
Deviations: none. Remaining tasks: none. No real runtime, TTY, default executor, build,
dependency, installer, doctor implementation, docs, specs, or unrelated dirty files touched.
