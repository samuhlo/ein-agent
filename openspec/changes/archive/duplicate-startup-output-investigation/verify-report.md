# Verify report — duplicate-startup-output-investigation

status: pass
behavior_coverage: partial
skill_resolution: paths-injected
head_verified: 95ded74b81b1ae59f409d76a1b18c26db8878a4a

## Executive result

All focused checks, the evidence validator, installer typecheck, configured test-layer command, and repository `bun test` pass in the current working tree. The changed recorder, opt-in banner/notice instrumentation, async parent correlation, diagnostic-disabled behavior, sink-failure non-blocking behavior, and fail-closed classifier were exercised.

Behavior coverage is **partial**, not complete: the retained PTY run observed one linked load/registration/session-start and one banner/stdout presentation, but no attributable detector, notification emission, or notification-overlay presentation. The captured diagnosis remains exactly `unknown/missing-evidence`; the original duplicate-output cause was not identified, and no absent stage is interpreted as zero.

No production build was required by the repository contract or this change and none was run.

## Inputs and change coverage

Verified against current `scope.md`, `map.md`, `design.md`, `tasks.md`, `apply-progress.md`, `openspec/config.yaml`, changed implementation/tests, and bounded files under `evidence/`.

Implementation/test areas inspected:

- `ein-pi/agent/lib/startup-provenance.ts`
- `ein-pi/agent/lib/startup-provenance-classifier.ts`
- `ein-pi/agent/extensions/ein-banner.ts`
- `ein-pi/agent/lib/ein-update-notice.ts`
- `tests/startup-provenance.test.ts`
- `tests/startup-provenance-classifier.test.ts`
- `tests/ein-banner-updates.test.ts`
- `openspec/changes/duplicate-startup-output-investigation/evidence/`

Skills: `bun` and `ein-discipline` applied. `vitest` was loaded but skipped because this repository's contract is Bun test. `vueuse` and `web-design-guidelines` were loaded but not applicable because the change contains no Vue or web UI work.

## Fresh focused behavior-seam plan

Each apply behavior seam has exactly one final focused command. Exact command matches are merged in first-seen order while retaining all seam/source associations.

| Order | Final focused command | Covered behavior seams | Source associations |
| ---: | --- | --- | --- |
| 1 | `bun test tests/startup-provenance.test.ts` | Enabled diagnostics emit deterministic parent-linkable events with explicit unknown metadata; disabled/failed diagnostics preserve caller behavior without claiming observed evidence | `apply-progress.md` //001 TDD table; `tasks.md` 1.1–1.4 |
| 2 | `bun test tests/startup-provenance-classifier.test.ts` | Linked identities distinguish loader/registration/event/emission/renderer multiplicity; incomplete, stale, unknown, or uncorrelated evidence fails closed | `apply-progress.md` //002 TDD table; `tasks.md` 2.1–2.4 |
| 3 | `bun test tests/ein-banner-updates.test.ts` | Opt-in load/registration provenance with disabled/failed startup preservation; lifecycle entry observations; overlapping async notice correlation and before-notify emission | `apply-progress.md` //003 and //004 TDD tables; `tasks.md` 3.1–4.4 |
| 4 | `bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` | Controlled PTY provenance; independent presentation evidence; captured incomplete provenance remains unknown | `apply-progress.md` //005 first three seams; `tasks.md` 5.1–5.3 |
| 5 | `bun test tests/ein-banner-updates.test.ts tests/sdd-scope-packet.test.ts` | Ordered suites retain Pi-TUI exports while diagnostic-disabled startup remains unchanged | `apply-progress.md` //005 fourth seam; `tasks.md` 5.4 |

## Global-check disposition

| Candidate | Disposition | Reason/source |
| --- | --- | --- |
| `bun test` | scheduled | Explicit `verify.test_command`, design success criteria, tasks 5.4, and user-required repository gate. |
| `bun test tests/` | scheduled once | Exact duplicate across configured unit/integration/e2e layers; relevant because changed tests live under `tests/`. |
| `cd installer && bun run typecheck` | scheduled | Configured typecheck and explicit design/tasks/user requirement. |
| coverage | not relevant | `coverage.commands` is blank; no command exists to schedule and this change does not authorize inventing one. |
| lint | not relevant | `lint_commands` is blank; no command exists to schedule. |
| format | not relevant | `format_commands` is blank; no command exists to schedule. |
| production build | not relevant | Neither OpenSpec config nor design/tasks requires one; design/tasks explicitly exclude it for this diagnostic change. |

## Current result evidence

All final commands were bounded by the execution tool's 300-second timeout. The host does not provide a `timeout` executable: the initial literal wrappers listed below exited 127 before starting Bun or TypeScript. A new command plan was then constructed and every final command was freshly invoked once with the tool-level timeout.

| First-seen order | Normalized command | Roles/seams | Sources | Current result |
| ---: | --- | --- | --- | --- |
| 1 | `bun test tests/startup-provenance.test.ts` | focused: recorder/disabled/failure | apply //001; tasks 1.1–1.4 | PASS — 4 tests, 13 assertions |
| 2 | `bun test tests/startup-provenance-classifier.test.ts` | focused: classification/fail-closed | apply //002; tasks 2.1–2.4 | PASS — 6 tests, 47 assertions |
| 3 | `bun test tests/ein-banner-updates.test.ts` | focused: opt-in runtime boundary, disabled path, async correlation, non-blocking failure | apply //003–004; tasks 3.1–4.4 | PASS — 19 tests, 68 assertions |
| 4 | `bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` | focused: PTY evidence and unknown diagnosis | apply //005; tasks 5.1–5.3 | PASS — `events=3, presentations=1, classification=unknown/missing-evidence` |
| 5 | `bun test tests/ein-banner-updates.test.ts tests/sdd-scope-packet.test.ts` | focused: ordered-suite isolation/disabled startup | apply //005; task 5.4 | PASS — 31 tests, 87 assertions |
| 6 | `bun test` | global repository gate | `openspec/config.yaml`; design/tasks/user | PASS — 1471 tests across 109 files, 5561 assertions |
| 7 | `bun test tests/` | merged global unit/integration/e2e layer gate | `openspec/config.yaml` testing layers | PASS — 1471 tests across 109 files, 5561 assertions |
| 8 | `cd installer && bun run typecheck` | global typecheck | config/design/tasks/user | PASS — `tsc --noEmit` |

Infrastructure attempts, retained for exact failure reporting (no gate process started):

- `timeout 300 bun test tests/startup-provenance.test.ts` — FAIL/UNAVAILABLE, exit 127: `/bin/bash: timeout: command not found`.
- `timeout 300 bun test tests/startup-provenance-classifier.test.ts` — FAIL/UNAVAILABLE, exit 127: same host limitation.
- `timeout 300 bun test tests/ein-banner-updates.test.ts` — FAIL/UNAVAILABLE, exit 127: same host limitation.
- `timeout 300 bun openspec/changes/duplicate-startup-output-investigation/evidence/verify-evidence.ts` — FAIL/UNAVAILABLE, exit 127: same host limitation.
- `timeout 300 bun test tests/ein-banner-updates.test.ts tests/sdd-scope-packet.test.ts` — FAIL/UNAVAILABLE, exit 127: same host limitation.
- `timeout 300 bash -lc 'cd installer && bun run typecheck'` — FAIL/UNAVAILABLE, exit 127: same host limitation.

The full-suite output includes pre-existing `review-workload-guard` fixture warnings from intentionally invalid `git diff --no-index` pathspec usage; both suite commands still exited 0 with all tests passing.

## Specification coverage

| Requirement | Verification | Status |
| --- | --- | --- |
| R1 correlated diagnostic run | Recorder tests validate run/event IDs, clocks, process/source evidence and explicit unknown session; PTY side channel shares one run | verified |
| R2 load and registration provenance | Banner tests validate repeated evaluations/registrations and parent links; PTY observes one linked pair | verified |
| R3 session-start provenance | Banner tests validate unique invocation IDs, registration parent, UI/CLI observations and early-return recording; PTY observes one invocation | verified |
| R4 notification-emission provenance | Focused tests exercise delayed/reversed async completion, explicit invocation parents, normalized digest, and before-notify ordering | verified in tests; unavailable in retained PTY run |
| R5 independent presentation evidence | PTY artifact independently records one banner/stdout presentation with unknown notification parent and independent clock | partial; no notification-overlay occurrence was attributable |
| R6 fail-closed interpretation | Classifier tests remove critical stages and inject stale/unknown/broken evidence; validator retains actual capture as `unknown/missing-evidence` | verified |
| R7 no behavior change | Disabled-path and exact-notification tests pass; sink failure preserves registration/notification; diagnostics require explicit enablement/config | verified |

No canonical spec delta was declared (`spec_delta: none`), so there is no base/delta synchronization work to verify.

## Task completion

- `tasks.md` is `status: ready`, `blocked_by: none`, with all tasks 1.1 through 5.4 checked complete.
- Current files and tests cross-reference every claimed implementation/test path in `apply-progress.md`.
- The retained evidence files and validator exist and validate successfully.
- No source, test, apply artifact, evidence file, installer file, git ref, or unrelated file was modified during verify. This report is the only write.

## Strict TDD audit

strict_tdd: compliant

- `apply-progress.md` contains a `TDD Cycle Evidence` table for each apply group and every named behavior seam retains RED, GREEN, TRIANGULATE, and REFACTOR/final-focused evidence.
- Reported test files exist and their relevant final commands are freshly GREEN.
- Groups //001–//004 record failing pre-implementation RED evidence, passing GREEN, edge-case triangulation, and final focused commands.
- Group //005's evidence-collection seams use the pre-capture absence of runtime evidence as the RED condition, then retained capture/validator evidence for GREEN/triangulation/refactor; its test-only mock-isolation seam records a concrete failing ordered-suite RED and passing GREEN/final command.

Assertion quality: no critical issues. The changed tests assert observable event records, unique identities, exact parent links, disabled-path absence of side-channel I/O, real notification preservation, reverse async completion, digest equality and before-call order, and explicit unknown classification. No tautologies, ghost loops, type-only-only assertions, implementation-detail CSS assertions, or smoke-only tests were found.

## Findings

- **WARNING — diagnosis remains inconclusive:** `evidence/startup-run-summary.json` records detector, notification-emission, notification-overlay, and emission-to-presentation correlation as unknown. `evidence/pty-presentations.jsonl:1` is one `banner-stdout-redraw` with unknown notification parent. This does not reproduce or explain the duplicate startup output and cannot support loader or renderer duplication.
- **LOW — validator attests persisted classification rather than recomputing it:** `evidence/verify-evidence.ts:40-47` checks that the stored summary says `unknown/missing-evidence` and preserves unknown counts, but it does not invoke `classifyStartupProvenance` over transformed captured events. Unit tests independently verify the production classifier, but the retained PTY classification remains an artifact-level attestation rather than a fresh classifier computation.
- **LOW — opt-in timing perturbation remains possible:** `ein-pi/agent/extensions/ein-banner.ts:68` uses synchronous append-only side-channel I/O when diagnostics are enabled. It is disabled by default and failures are non-blocking, but it can perturb a timing-sensitive reproduction.
- **No blocker:** all required final commands passed and no assertion-quality or strict-TDD blocker was found.

## Residual risks and exact next evidence

The original duplicate-output cause remains unknown. A regression or cause specific to real notification-overlay rendering can remain unseen because the retained offline PTY capture produced no attributable notification emission or overlay.

To close that evidence gap, capture a reproducible session that actually exhibits the duplicate startup notification while update evidence triggers `ctx.ui.notify`, record renderer/overlay presentation identities and compatible parent/clock provenance, then feed the captured event graph into the production classifier. Until then, do not infer zero counts, upgrade the diagnosis, or claim a cause.

## Repository preservation

Final audit command:

`git rev-parse HEAD && git status --short && printf '%s\n' '--- staged ---' && git diff --cached --name-only && printf '%s\n' '--- installer diff ---' && git diff -- installer`

Result: HEAD remains `95ded74b81b1ae59f409d76a1b18c26db8878a4a`; pre-existing dirty/untracked work remains; no files are staged; installer diff is empty.
