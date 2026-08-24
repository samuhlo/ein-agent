status: complete
change: fix-cleaner-participant-slicing
phase: apply
group: // 010. Remediate deleted changed-file planning at the Cleaner selector seam
strict_tdd: on
skill_resolution: paths-injected

## Completed

- Completed tasks 1.1, 2.1, 2.2, group 003 tasks 3.1–3.5, group 004 tasks 4.1–4.3, group 005 tasks 5.1–5.2, and group 006 tasks 6.1–6.3.
- Captured the participant-owned diff anchor before any repository edit at `/tmp/fix-cleaner-participant-slicing.before.patch`; the anchor is non-empty.
- Captured protected SHA-256 hashes at `/tmp/fix-cleaner-participant-slicing.protected.sha256`; all four protected files verified `OK`.
- Group 001 edited no production or test files; group 002 changed only the scoped checkpoint module and test.

## Files changed

`openspec/changes/fix-cleaner-participant-slicing/tasks.md`
`openspec/changes/fix-cleaner-participant-slicing/apply-progress.md`
`ein-pi/agent/lib/continuity-checkpoint.ts`
`tests/continuity-checkpoint.test.ts`
`ein-pi/agent/lib/sdd-participants.ts`
`tests/sdd-participants.test.ts`
`tests/cleaner-audit-evidence.test.ts`
`ein-pi/agent/extensions/ein-ai.ts`
`ein-pi/agent/lib/sdd-preflight.ts`
`ein-pi/agent/lib/pi-sdd-participant-receipt.ts`
`tests/agent-tools-contract.test.ts`
`tests/sdd-preflight-per-change.test.ts`
`tests/pi-sdd-participant-receipt.test.ts`
`tests/fixtures/pi-sdd-participant-foreground.json`
`ein-pi/agent/lib/sdd-router.ts`
`ein-pi/agent/assets/orchestrator.md`
`tests/sdd-router.test.ts`
`tests/sdd-next-dispatcher.test.ts`
`ein-pi/agent/lib/continuity-handoff-lifecycle.ts`
`tests/continuity-handoff-lifecycle.test.ts`
`ein-pi/agent/lib/continuity-resume-brief.ts`
`tests/continuity-resume-brief.test.ts`
`tests/claude-continuity-runtime.test.ts`
`tests/subagent-envelope-contract.test.ts`

## Verification

- Executed the exact task 1.1 anchor/hash command from `tasks.md` before editing metadata; passed.
- No build, full suite, or typecheck was run.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| The bounded participant anchor is captured and protected adjacent hashes verify before edits. | N/A by design: this evidence-only group permits no production/test behavior change or RED test edit. | Exact planned anchor/hash command passed; the anchor was non-empty and all protected hashes were `OK`. | The exact command covered every listed participant-owned anchor path and all four protected continuity, Claude IPC, and installer boundaries. | N/A by design: no implementation was changed; only SDD metadata was updated after capture. | Exact task 1.1 anchor/hash command from `tasks.md` (passed). |

## Deviations and remaining work

- Group 001 deviations: none.
- Remaining: group 006.

## Group // 002. Delete participant persistence from generic continuity

Status: complete for this group; overall apply remains partial.

Completed tasks: 2.1 removed participant-only continuity cases and added absence/version rejection assertions; 2.2 removed participant schema, limits, validators, serializers, writers, generations, attempts, receipts, and migrations while preserving generic checkpoints.

TDD Cycle Evidence:

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Generic checkpoints serialize with only generic fields and reject participant persistence. | Added version 2/3 and participant-key rejection assertions; the pre-change focused runner failed on accepted v2 input. | Removed participant contract and focused runner passed: 40 tests. | Covered object and JSON input, generic round-trip, extra participant key, and v2/v3 rejection; focused runner passed. | Simplified checkpoint content/parser to one version and retained generic derivation/validation paths; grep and diff checks passed. | `bun test tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts` (40 passed). |

Verification: protected continuity-store, Claude IPC, and installer hashes remained OK; participant-symbol scan of `continuity-checkpoint.ts` passed; `git diff --check` passed. No full suite, build, or typecheck run.

Deviations: none. Protected `continuity-checkpoint-store.ts` remained byte-identical.

## Group // 003. Rebuild the participant module as an ephemeral coordinator

Status: complete for this group; overall apply remains partial.

Completed tasks: 3.1 replaced durable participant assertions with observable ephemeral session behavior; 3.2 removed continuity/store, historical lifecycle, receipt, and recovery paths; 3.3 retained canonical exact-once bounded slicing and whole-run unavailable planning; 3.4 implemented one in-flight identity, Cleaner-before-Architect sequencing, seal advancement, honest outcomes, and cleanup reset; 3.5 triangulated ordering, byte/file boundaries, mutation drift, blocked results, and missing evidence.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Ephemeral participant runs do not create or mutate continuity and restart at slice 0. | Rewritten tests failed before the coordinator existed/imports were removed. | No-file and pre-existing-byte continuity tests passed. | Cleanup/restart and generic checkpoint revision/bytes were both observed. | Removed all durable state and kept only session-local maps. | `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts` (16 passed). |
| Complete deterministic Cleaner slicing retains limits and fail-closed impossible paths. | Behavioral slicing/unavailable tests were RED against the previous durable contract. | Lexical contiguous exact-once slices and 32/128 KiB boundaries passed. | Reordered scope, exact UTF-8 byte boundary, oversized, and non-UTF-8 cases passed. | Planner remains pure and uses authoritative Cleaner limits/evidence. | Focused command above (16 passed). |
| Same-session foreground order, source frontier, and honest outcomes are identity-bound. | New sequencing/seal/outcome tests failed before the ephemeral lifecycle existed. | Cleaner slices precede Architect; complete/blocked/unavailable and in-flight identity passed. | Post-Cleaner mutation advanced the seal; later drift, explicit blockage, and missing evidence failed closed. | Coordinator reduced to immutable slices, current seal, ordinal, and one call identity. | Focused command above plus deletion scan and `git diff --check` (passed). |

Verification: focused runner passed (16 tests, 87 assertions); forbidden participant persistence scan passed; `git diff --check` passed. No full suite, build, or typecheck run.

Deviations: none. Pi adapter/preflight and protected adjacent files were not touched. Remaining work: groups 004–006.

## Group // 004. Delete receipt authority and simplify the Pi terminal adapter

Status: complete for this group; overall apply remains partial.

Completed tasks: 4.1 added registered Pi-edge contracts and retained explicit Cleaner/Architect assertions; 4.2 deleted the receipt authority, receipt tests, and foreground fixture; 4.3 removed artifact/digest/durable completion paths and connected a private bounded recognizer to the ephemeral coordinator.

## TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| One foreground direct or one-child workflow terminal result advances the admitted call. | New hook contracts were written; the focused runner first failed on the stale receipt import after group 003 removed its consumer API. | Direct `single` and one-child `workflow` results passed with foreground flags forced. | Both result modes were exercised through the registered extension hooks with exact child identity. | Kept recognition private to `ein-ai.ts`; coordinator owns sequencing and completion policy. | `bun test tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts` (30 passed). |
| Unsupported, background, missing, multiple, ambiguous, and failed evidence is unavailable. | New fail-closed cases were included in the same RED contract before adapter repair. | Multiple children, missing output, ambiguous status, unsupported mode/tool, `subagent_wait`, and transport error all ended unavailable. | Explicit blocked output remained blocked with its reason; invalid delivery never remained in flight. | Deleted artifact authority and forwarded only bounded terminal status/error to `completeSddParticipantCall`. | `bun test tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts` (30 passed). |
| Explicit Cleaner/Architect tools remain registered independently of automatic recognition. | Existing static registration assertions were retained alongside new adapter tests. | Cleaner and Architect registration checks passed. | Deletion scan and focused coordinator suite passed without receipt imports. | Removed only participant receipt/authority paths; unrelated extension hooks remained unchanged. | `bun test tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts` (30 passed). |

Verification: deletion checks, forbidden-symbol scan, and `git diff --check` passed. No full suite, build, or typecheck run. Protected adjacent files were not touched. Remaining work: groups 005–006.

Deviations: none. The overall apply status remains `partial` as required; no preflight or routing work was started.

## Group // 005. Preserve foreground enforcement at preflight

Status: complete for this group; overall apply remains partial because group 006 is pending.

Completed tasks: 5.1 added direct and one-child workflow foreground assertions, fail-closed marker recognition, multiple-child rejection, and unsupported background delivery coverage. 5.2 anchored the reduced participant marker at the task start without changing unrelated preflight behavior.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Automatic participant calls are foreground-only for direct and one-child workflow inputs. | New direct/workflow assertions were added; the focused runner initially exposed the missing workflow test harness shape. | Hook tests passed with `async=false` and `foregroundOnly=true` for both forms. | Direct and one-child workflow terminal results both completed through the registered Pi edge. | Kept foreground mutation in the existing preflight helper; no unrelated preference or TDD code changed. | `bun test tests/sdd-preflight-per-change.test.ts tests/agent-tools-contract.test.ts --test-name-pattern 'participant|foreground|workflow|multiple|background'` (14 passed). |
| Unsupported multiplicity/background delivery fails closed and only the reduced marker identity is recognized. | Embedded marker assertion failed before anchoring the marker regex; existing preflight/record/TDD contracts were green. | Focused four-file run passed: multiple children block before normalization; `subagent_wait` becomes unavailable; embedded marker stays unrecognized. | Covered direct, one-child workflow, multiple-child, unsupported delivery, and background wait paths. | Marker recognition is one anchored reduced-shape regex; participant progress remains in the ephemeral coordinator. | `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-record.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/agent-tools-contract.test.ts` (54 passed). |

Verification: focused RED was run with the task's negated command and failed only on the new embedded-marker assertion; GREEN and final triangulation commands passed. `git diff --check` passed. No full suite, build, or typecheck run.

Deviations: none. Remaining work: group 006 only.

## Group // 006. Keep routing advisory and close the integration proof

Status: blocked for this group; tasks 6.1–6.3 complete, task 6.4 blocked by protected adjacent failures.

Completed tasks: 6.1 added routing contracts for complete/blocked/unavailable advisory outcomes, Cleaner mutation staleness, and prompt wording; 6.2 edited only the participant advisory paragraph; 6.3 passed the planned integration proof.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Participant outcomes remain advisory and leave `sdd-verify` available. | Added outcome contracts; the negated focused command failed on the new prompt assertion while routing assertions passed. | Focused router/dispatcher run passed: 59 tests, 234 assertions. | Outcome loops cover complete, blocked, and unavailable in both router and dispatcher; no participant blocker is handed to verify. | Kept generic router routing unchanged; removed no unrelated gates and compacted prompt wording to the existing byte budget. | `bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts` (59 passed). |
| Accepted Cleaner mutation invalidates prior generic verification. | Added a post-verify changed-delivered-file contract. | Router test passed with `verifyStale: true` and `nextRecommended: verify`. | Existing real-file mutation coverage and the new Cleaner-labeled case both pass. | No `sdd-router.ts` edit was required by the focused RED. | `bun test tests/sdd-router.test.ts --test-name-pattern 'Cleaner|mutation|verify'` (10 passed in triangulation command). |
| Prompt explains ephemeral restart, honest outcomes, foreground order, and non-gating verify. | New exact wording assertions failed before the advisory paragraph edit. | Prompt-budget plus dispatcher checks passed: 21 tests. | Required phrases remain after compaction under the 43,011-byte budget. | Edited only the participant paragraph; no other orchestrator text changed. | `bun test tests/sdd-next-dispatcher.test.ts tests/prompt-budget.test.ts` (21 passed). |

Verification: integration proof passed (118 tests, 502 assertions); protected hashes and deletion scan passed; installer typecheck passed. The exact protected-adjacent command stopped at `tests/claude-continuity-runtime.test.ts` because removed `withSddParticipants` is still imported from the changed generic checkpoint module. Final full suite: 2,254 passed, 13 failed, 6 errors. Root typecheck fails on the same stale continuity consumers plus existing participant/test typing errors; no protected repair was attempted.

Historical blocker note: task 6.4 was blocked at this point by stale continuity consumers and type errors. That blocker is resolved by groups 7–8, which repaired only the authorized lifecycle/resume-brief consumers and the Claude participant-text assertion; the protected IPC/installer boundaries remain green. The final group 009 blocker is independent and recorded below.

## Group // 007. Recover generic continuity handoff lifecycle

Status: complete for this group; overall apply remains partial because groups 008–009 remain.

Completed tasks: 7.1 replaced obsolete participant state-ref/CAS carry-forward assertions with generic-only refresh contracts; 7.2 removed the stale lifecycle import and branch; 7.3 retained absent/revision selection, one-conflict reread/retry, exhausted conflict, hydration, privacy, readiness, concurrency, and shutdown coverage; 7.4 removed stale imports and passed scoped hygiene checks.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Generic refresh republishes facts across a state-ref change without participant fields. | `! bun test tests/continuity-handoff-lifecycle.test.ts` failed on the removed `withSddParticipants` export. | Replaced the obsolete state-ref contract; focused suite passed (14 tests, 93 assertions). | Same focused suite covered SDD state-ref, absent/revision, hydration, privacy, readiness, concurrency, and shutdown paths. | Removed the participant import/branch only; final suite plus grep and diff checks passed. | `bun test tests/continuity-handoff-lifecycle.test.ts && ! grep -nE 'withSddParticipants|checkpoint\.sddParticipants' ein-pi/agent/lib/continuity-handoff-lifecycle.ts && git diff --check -- ein-pi/agent/lib/continuity-handoff-lifecycle.ts tests/continuity-handoff-lifecycle.test.ts` (passed). |
| Revision-bound refresh retries one conflict and closes exhausted conflicts without participant carry-forward. | Same RED command failed before the production deletion. | Generic CAS contract passed after replacing participant update injection. | Assertions covered reread expectation change, successful retry, and the existing two-attempt exhausted conflict path. | Kept checkpoint-store calls and retry loop unchanged. | Same final focused command above (passed). |

Verification: exact task commands 7.1 RED, 7.2 GREEN, 7.3 TRIANGULATE, and 7.4 REFACTOR were run; only the RED command failed as required. No checkpoint-store, resume-brief, Claude runtime, installer, build, full-suite, or typecheck changes/runs were made.

Deviations: none. Remaining tasks: groups 008–009; next apply task is 8.1 (resume-brief generic-only RED and stale Claude assertion removal).

## Group // 008. Recover generic resume briefs and remove Claude participant-text coupling

Status: complete for this group; overall apply remains partial because group 009 remains.

Completed tasks: 8.1–8.4 replaced the participant-bearing brief test with generic payload and absence assertions, removed participant payload/pending computation/bootstrap guidance, and changed only the stale Claude source assertion coupling.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Resume briefs emit generic checkpoint/revision data without participant payload or bootstrap guidance. | Exact task 8.1 negated command failed on the new absence assertion (`sddParticipants: null`) and stale source assertion. | Exact task 8.2 command passed: 17 tests, 75 assertions. | Exact task 8.3 command passed: 29 tests, 181 assertions, covering framing/hash, readiness, privacy, truncation, Unicode, and Claude runtime behavior. | Exact task 8.4 command passed with absence scans and scoped diff check. | `bun test tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts` plus scans and `git diff --check` (29 passed). |
| Claude runtime remains independent of participant brief text while IPC timing, expiry, PTY, termination, and fail-closed behavior stay green. | Exact task 8.1 negated command failed on the stale source assertion as expected. | The participant source assertion was updated without touching runtime production; Claude coverage passed in the focused triangulation run. | Exact task 8.3 full Claude runtime suite passed (12 tests), including preparation inactivity and dispatched-response expiry. | Exact task 8.4 retained only the participant-dependent assertion hunk; scoped diff check passed. | `bun test tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts` plus scans and `git diff --check` (29 passed). |

Verification: exact task commands 8.1 RED, 8.2 GREEN, 8.3 TRIANGULATE, and 8.4 REFACTOR were run; only the RED command failed as required. No build, full suite, or typecheck was run. Protected Claude runner, timing fixtures/constants, installer files, and unrelated shared-test hunks were not edited.

Deviations: none. Remaining task: group 009 final verification.

## Group // 009. Re-run the blocked final verification with corrected protection evidence

Status: complete; task 9.1 passed after recovery group 008A. The prior 6.4 stale-continuity-consumer blocker was resolved by groups 7–8, and the independent full-suite envelope-contract failure was resolved by group 008A.

Completed in this group: repaired two participant-owned typecheck regressions exposed by the exact gate: narrowed the post-completion Architect check to its retained call identity and annotated four participant test callback parameters. No unrelated production/test failure was changed.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Accepted Architect completion validates the retained call identity without impossible `inFlight` narrowing. | Exact gate root typecheck failed at `sdd-participants.ts:468` (`agent` on `never`). | Replaced the already-cleared `run.inFlight` branch with `tracked.call.unit`; root typecheck passed. | Participant coordinator and Pi-edge focused tests passed (31 tests). | Kept the one-line identity check and all terminal/seal behavior unchanged. | `bun run typecheck` (passed). |
| Pi participant terminal-result fixtures typecheck with explicit callback inputs. | Exact gate root typecheck reported four implicit-`any` callback parameters in `agent-tools-contract.test.ts`. | Added `task: string` annotations only; root typecheck passed. | Direct/workflow, unsupported, blocked, and transport-error edge tests passed (31 tests). | No fixture or assertion behavior changed. | `bun test tests/sdd-participants.test.ts tests/agent-tools-contract.test.ts` (31 passed). |

Verification evidence:
- `bun test tests/continuity-handoff-lifecycle.test.ts tests/continuity-resume-brief.test.ts` — 31 passed.
- `bun test tests/claude-continuity-runtime.test.ts tests/installer-backup.test.ts` — 44 passed; protected IPC timing/PTY and installer regressions green.
- `bun test tests/sdd-participants.test.ts tests/agent-tools-contract.test.ts` — 31 passed after the in-scope type fixes.
- `bun run typecheck` — passed after the in-scope fixes; `cd installer && bun run typecheck` — passed.
- After group 008A, the exact unchanged task 9.1 command passed: full `bun test` — 2,352 passed, 0 failed; the repaired `tests/subagent-envelope-contract.test.ts` was included.
- Corrected still-protected hashes for `continuity-checkpoint-store.ts`, `cc-ein/continuity-runner.ts`, and `tests/installer-backup.test.ts` — all `OK`; deletion/stale-symbol scans and `git diff --check` — passed.
- `/tmp/fix-cleaner-participant-slicing.claude-test-hunks.patch` is non-empty; focused Claude suite passed, and the authorized participant-text assertion is the only group-owned hunk reviewed (adjacent timeout/PTY hunks remain pre-existing protected work).

Final task 9.1 evidence: focused continuity recovery (31 passed), Claude/installer adjacent regressions (44 passed), root and installer typechecks passed, corrected still-protected hashes all `OK`, Claude test hunk patch non-empty, deletion/stale-symbol scans passed, and `git diff --check` passed. Both prior blockers are explicitly resolved; remaining tasks: none. Do not run `sdd-verify` or close.

## Group // 008A. Recover the final closed-world participant handler contract

Status: complete for this recovery group; task 9.1 subsequently passed. Only the participant-specific T2 expectation in the owned test file changed; no production file, inventory, detector, or coordinator code was edited.

Completed tasks: 8.5–8.7. T2 now maps the obsolete direct-consumer expectation `completeSddParticipantCall` to the live private Pi terminal recognizer `recognizePiParticipantTerminal`, preserving the other declared identities and cardinality.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE/REFACTOR | Final focused command |
| --- | --- | --- | --- | --- |
| T2 identifies the private Pi function that directly consumes terminal `event.details` while preserving the closed-world envelope contract. | `! bun test tests/subagent-envelope-contract.test.ts --test-name-pattern 'T2'` failed as expected: found `recognizePiParticipantTerminal`, expected `completeSddParticipantCall`; 1 pass, 1 fail. | Replaced only T2's participant-specific expected identity mapping in `tests/subagent-envelope-contract.test.ts`; focused T2 run passed (2 tests). | Entire envelope contract passed (8 tests, 11 assertions); T1, fictitious-consumer guard, T3, unrelated identities, and cardinality remained green. `git diff --check` and one-file diff review passed. | `bun test tests/subagent-envelope-contract.test.ts && git diff --check -- tests/subagent-envelope-contract.test.ts && git diff --no-ext-diff -U3 -- tests/subagent-envelope-contract.test.ts` (passed). |

Files changed:
`tests/subagent-envelope-contract.test.ts`
`openspec/changes/fix-cleaner-participant-slicing/tasks.md`
`openspec/changes/fix-cleaner-participant-slicing/apply-progress.md`

Deviations: none. The exact unchanged task 9.1 command was rerun after this recovery and passed; no production changes were needed.

## Group // 010. Remediate deleted changed-file planning at the Cleaner selector seam

Status: complete; tasks 10.1–10.4 complete. The registered-tool rerun is an explicitly unobserved parent-owned post-apply gate, not an apply task.

Completed: missing declared paths are retained in the canonical scope identity, recorded as path-bound `scope-unavailable` blockers, excluded from Cleaner selectors, and kept alongside lexical exact-once inspectable slices. Added deleted-path integration coverage before/between/after inspectable files beyond the file limit. Refactored the local missing-path classification without changing Cleaner limits, source seals, or fail-closed validation.

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Deleted declared paths are path-bound unavailable evidence while inspectable files remain canonical, contiguous, exact-once bounded slices. | `! bun test tests/sdd-participants.test.ts --test-name-pattern 'deleted changed-file'` failed as expected: blocker paths were empty. | `bun test tests/sdd-participants.test.ts --test-name-pattern 'deleted changed-file'` passed (1 test) after missing-path classification. | `bun test tests/sdd-participants.test.ts` passed: 12 tests, 79 assertions; deleted paths before/between/after were absent from slices, each appeared once in blockers, and the existing impossible/non-UTF-8/source-seal/32-file/128 KiB contracts stayed green. | Consolidated missing-path blocker construction in the existing inspection seam; the Cleaner contract and public APIs were untouched. | `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts && bun run typecheck && git diff --check -- ein-pi/agent/lib/sdd-participants.ts tests/sdd-participants.test.ts` (passed). |

Verification: exact task commands 10.1 RED, 10.2 GREEN, 10.3 TRIANGULATE, and 10.4 REFACTOR were run. The 10.4 gate passed with 18 focused tests, root typecheck, and scoped diff hygiene. No full suite, build, or registered `ein_sdd_participants` rerun was performed.

Deviations: none. Apply is complete. Next: the parent must invoke the registered `ein_sdd_participants` post-apply gate and record its observed result before `sdd-verify`.