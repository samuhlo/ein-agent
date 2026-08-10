status: complete

# Apply progress — duplicate-startup-output-investigation

## // 001. Provenance event contract and recorder — complete

Completed tasks: 1.1 RED, 1.2 GREEN, 1.3 TRIANGULATE, and 1.4 REFACTOR.

Implemented a runtime-agnostic provenance event union and opt-in recorder with injected run/event identities, clocks, process/source evidence, and side-channel sink. The contract distinguishes load, registration, `session_start`, notification-emission, and presentation events; missing facts remain explicit `unknown`/`unavailable` evidence. Disabled and failed recording never reports observed evidence or throws into startup behavior.

Files changed:
- `ein-pi/agent/lib/startup-provenance.ts`
- `tests/startup-provenance.test.ts`
- `openspec/changes/duplicate-startup-output-investigation/tasks.md`
- `openspec/changes/duplicate-startup-output-investigation/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Enabled diagnostics emit deterministic, parent-linkable events with explicit unknown metadata | `bun test tests/startup-provenance.test.ts` failed as expected because the module did not exist (0 pass, 1 fail/error) | Same command passed 2 tests after the contract/recorder was added | Same command passed 4 tests covering repeated IDs, all event shapes, parent links, missing metadata, and digest-only payloads | API/dependencies reviewed and kept narrow/pure; same command passed 4 tests |
| Disabled or failed diagnostics preserve caller behavior without claiming observed evidence | Initial RED file included the disabled-path expectation and failed before implementation with the missing module | Same command passed the disabled-path expectation | Same command passed the throwing-sink non-propagation/unavailable-evidence case | Same final focused command passed 4 tests |

Additional gate: `cd installer && bun run typecheck` passed (`tsc --noEmit`).

Deviations: none. No Pi, terminal, filesystem, global-state, installer, or behavior-changing dependency was introduced.

Remaining tasks at this checkpoint: groups // 002 through // 005 were pending and not started.
Residual risk at this checkpoint: this group defined only the foundational contract; runtime instrumentation and classification were intentionally unimplemented.

## // 002. Deterministic summary and fail-closed classifier — complete

Completed tasks: 2.1 RED, 2.2 GREEN, 2.3 TRIANGULATE, and 2.4 REFACTOR.

Implemented a pure per-run summarizer with independent evidence-aware counts and event identities, plus explicit loader, registration, event-delivery, emission, renderer, and unknown classification results. Supported diagnoses require current same-run evidence, one observed source/process, compatible session provenance, complete typed parent links, matching emission/presentation digests, and known presentation channels.

Files changed:
- `ein-pi/agent/lib/startup-provenance-classifier.ts`
- `tests/startup-provenance-classifier.test.ts`
- `openspec/changes/duplicate-startup-output-investigation/tasks.md`
- `openspec/changes/duplicate-startup-output-investigation/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Linked same-run identities distinguish loader, registration, event-delivery, emission, and renderer multiplicity | `bun test tests/startup-provenance-classifier.test.ts` failed on the missing canonical module (0 pass, 1 fail/error) | Same command passed the first 3 classification tests | Same command passed all six tests after missing-stage and provenance variants were added | Result/count vocabulary and pure helpers were reviewed; final same command passed 6 tests / 47 assertions |
| Missing, stale, unknown-channel/source, or uncorrelated evidence fails closed | A conflicting observed runtime-session fixture failed as expected (5 pass, 1 fail; renderer was incorrectly supported) | Session compatibility validation made the same focused command pass 6 tests | Missing stages retain unknown counts; stale timestamps, unknown metadata, broken parents, mixed runs/sessions all return `unknown` | Final focused command: `bun test tests/startup-provenance-classifier.test.ts` (6 pass, 0 fail) |

Additional gate: `cd installer && bun run typecheck` passed (`tsc --noEmit`).

Deviations: none. No filesystem, runtime, renderer, alias-file, installer, or behavior-changing dependency was introduced.

Remaining tasks: groups // 003 through // 005 are pending and were not started.
Residual risk: real runtime instrumentation and PTY presentation evidence do not exist yet, so the classifier has only fixture evidence at this stage.

## // 003. Extension evaluation and registration provenance — complete

Completed tasks: 3.1 RED, 3.2 GREEN, 3.3 TRIANGULATE, and 3.4 REFACTOR.

Instrumented the canonical banner module with an explicit `EIN_STARTUP_PROVENANCE=1` NDJSON side channel. Each evaluated module records one unique load; each successful extension registration records a unique child event. Run/process metadata is observed, optional source metadata remains `unknown` when absent, and runtime session metadata remains `unknown`. Disabled/incomplete configuration performs no I/O; recorder/sink failures do not block Pi registration or create successful registration evidence.

Files changed:
- `ein-pi/agent/extensions/ein-banner.ts`
- `tests/ein-banner-updates.test.ts`
- `openspec/changes/duplicate-startup-output-investigation/tasks.md`
- `openspec/changes/duplicate-startup-output-investigation/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Opt-in module evaluation and extension registration produce unique parent-linked provenance while disabled/failed capture preserves startup registration | After runtime-only dependency mocks made the extension importable, `bun test tests/ein-banner-updates.test.ts` failed as expected (14 pass, 2 fail): enabled runs contained zero load/registration records; the disabled characterization remained green | The same command passed 16 tests after canonical boundary instrumentation and correction of the failing-sink fixture | The same command passed 16 tests / 52 assertions for two evaluations, repeated registration, observed/unknown source, disabled capture, and a throwing registration sink | Instrumentation stayed local to `ein-banner.ts`; no lifecycle/notice/renderer path was changed. Final focused command: `bun test tests/ein-banner-updates.test.ts` (16 pass, 0 fail) |

Additional gate: `cd installer && bun run typecheck` passed (`tsc --noEmit`).

Deviations: none. No root alias, loader/discovery, notification, renderer, group // 004/005, or installer file was changed.

Remaining tasks: groups // 004 and // 005 are pending and were not started.
Residual risk: the opt-in synchronous side-channel write can perturb diagnostic timing; disabled startup behavior remains unchanged, and real PTY evidence is intentionally deferred to group // 005.

## // 004. Session-start, asynchronous correlation, and notification emission — complete

Completed tasks: 4.1 RED, 4.2 GREEN, 4.3 TRIANGULATE, and 4.4 REFACTOR.

Each observed `session_start` now receives a unique event linked to its registration, including UI and CLI-filter observations before either early return. The resulting optional correlation is passed explicitly through overlapping asynchronous notice work. Immediately before each real notify call, the notice seam records a unique child emission with an NFC/line-ending-normalized SHA-256 digest. Missing/failed diagnostics never suppress startup or notifications.

Files changed:
- `ein-pi/agent/extensions/ein-banner.ts`
- `ein-pi/agent/lib/ein-update-notice.ts`
- `tests/ein-banner-updates.test.ts`
- `openspec/changes/duplicate-startup-output-investigation/tasks.md`
- `openspec/changes/duplicate-startup-output-investigation/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Every lifecycle entry records unique registration-linked UI/CLI observations before filtering | `bun test tests/ein-banner-updates.test.ts` failed as expected (16 pass, 2 fail): two expected invocation events were absent | Same command passed 18 tests after handler-entry recording and explicit correlation plumbing | Same command passed 19 tests covering repeated delivery, no UI, CLI filtering, unknown session identity, disabled capture, and failed recording | Correlation stayed local and optional; final `bun test tests/ein-banner-updates.test.ts` passed 19 tests / 68 assertions |
| Overlapping notice work emits parent-linked normalized digests immediately before notify without changing fail-open behavior | The same RED run failed because both delayed notices had zero emission events | Same command passed with two uniquely identified emissions in reverse completion order and before-call assertions | Same command passed detector rejection/timeout and failed-sink cases: no synthetic emissions and real notification preserved with unavailable evidence | The five-argument compatibility seam was retained as the smallest additive API; final focused command passed 19 tests |

Additional gate: `cd installer && bun run typecheck` passed (`tsc --noEmit`).

Deviations: none. Notification text, scheduling, filters, detector internals, renderer behavior, and unrelated installer files were not changed.

Remaining tasks: group // 005 only; it was not started.
Residual risk: enabled synchronous side-channel writes can still perturb diagnostic timing; independent PTY presentation evidence remains intentionally uncollected until group // 005.

## // 005. Independent PTY presentation evidence and final focused verification — complete

Completed tasks: 5.1, 5.2, 5.3, and 5.4. The repository gate is green after correcting the authorized cross-suite mock contamination.

Retained one bounded final PTY run (`b7dc0533-758b-4511-8ae0-a91718520fb8`) through the real `pi-ein` Fish launcher with no Pi argv, diagnostics explicit, automatic discovery configured to the current source in a temporary isolated home, and a 120×40 timed raw capture. Pi 0.84.1 exited cleanly on Ctrl-D after 9.2 s; PID/PPID, cwd, effective homes/`AGENT_DIR`, source URI/hash/inode, configuration, discovery evidence, process snapshots, and raw/side-channel hashes are recorded under `evidence/`. No process or temporary home remained.

Independent PTY evidence observed one complete stable banner presentation (`banner-stdout-redraw`) with its own capture ID, timestamp, digest, and process/run provenance. Its notification parent and compatible Pi monotonic clock remain unknown. The structured side channel observed one linked load, registration, and unfiltered UI invocation; detector, notification-emission, and notification-overlay counts remain unknown, never zero. The pure classifier therefore retained `unknown/missing-evidence`; no loader, intermediate, or renderer diagnosis was accepted.

Files changed in this group:
- `openspec/changes/duplicate-startup-output-investigation/evidence/` (raw/timed capture, metadata, independent presentation, summary, procedure, validator)
- `openspec/changes/duplicate-startup-output-investigation/tasks.md`
- `openspec/changes/duplicate-startup-output-investigation/apply-progress.md`
- `tests/ein-banner-updates.test.ts` (test-only mock isolation correction)

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| A controlled Pi-Ein startup preserves complete run/process/discovery provenance | Before group 005 there was no PTY or runtime evidence, so the interpretation gate was unsatisfied | The retained no-argument launcher capture produced one run with linked load/registration/invocation identities and a clean exit | Raw hash, timed chunks, process snapshots, configured source, startup extension list, and side-channel PID/PPID were cross-checked | Evidence checks were extracted to a bounded validator; final `bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` passed |
| Visible startup output is counted independently without guessed notification parentage | No external presentation identity existed before capture | One stable banner presentation received an independent capture identity, timestamp, digest, process/run identity, and observed channel | Notification-overlay count, parent, runtime session, and cross-clock correlation remain explicit unknowns | Final `bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` passed |
| Incomplete captured provenance fails closed instead of diagnosing duplication | A supported classification could not be justified without detector/emission/overlay evidence | The real captured input was summarized with observed and unknown stages | The pure classifier returned `unknown/missing-evidence`; artifact validation rejects zero-filled missing stages | Final `bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` passed |
| Ordered suites retain the Pi-TUI export surface while diagnostic-disabled startup stays unchanged | `bun test tests/ein-banner-updates.test.ts tests/sdd-scope-packet.test.ts` reproduced the leak (19 pass, 1 fail/error): the banner suite's process-wide Pi-TUI mock omitted `matchesKey` | Adding `matchesKey` to that test-only mock made the same ordered pair pass 31/31 | `bun test tests/sdd-scope-packet.test.ts` passed 12/12 alone; the ordered pair passed 31/31; the disabled-path filter passed 1/1 | No refactor was needed; final focused command: `bun test tests/ein-banner-updates.test.ts tests/sdd-scope-packet.test.ts` (31 pass) |

Final gates: `bun test` passed 1471 tests across 109 files; `cd installer && bun run typecheck` passed; the focused disabled-path test passed 1/1. `git status --short` preserved pre-existing change files and EIN.md; staged and unstaged `git diff -- installer` were empty. No production build ran.

Resolved blocker: Bun retains `mock.module` registrations across suite order. The banner test's partial `@earendil-works/pi-tui` mock leaked an export-incomplete module namespace into `sdd-scope-packet`; completing the mock's required `matchesKey`/`truncateToWidth` surface is test-only and changes no production behavior.

Deviations: the installed banner lacked this change's diagnostics, so the retained run used a temporary isolated Pi-Ein home whose actual settings discovered exactly the current repository source; the installed user home/manifest were neither modified nor treated as active evidence. Offline probes intentionally leave detector/emission evidence unknown.

Remaining tasks: none. Installer diff/status remained exactly empty; unrelated dirty files were preserved. The PTY classification remains `unknown/missing-evidence`; no diagnosis was upgraded.
