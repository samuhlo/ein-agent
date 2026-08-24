# Design: fix-cleaner-participant-slicing

**Lane:** standard (unchanged)  
**TDD:** strict (unchanged)

## A. Proposal

### Intent

Replace continuity-backed automatic SDD participation with a same-session, ephemeral advisory coordinator. Keep the useful safety properties—deterministic bounded Cleaner slices, one foreground child at a time, Cleaner-before-Architect ordering, fresh source binding, explicit tools, and honest evidence—while deleting durable participant workflow machinery.

### Scope

**In scope**

- Rebuild automatic coordination as minimal in-memory state keyed by Pi session and change.
- Derive each run from the current complete changed-file scope and start at Cleaner slice 0.
- Remove participant generations, admissions, attempts, receipts, orphans, migrations, and checkpoint writes from continuity.
- Remove canonical persisted receipt normalization and the file-only artifact authority, reader, runtime directory, fixture, and module.
- Keep direct foreground terminal-result recognition only as a private Pi edge needed to advance the current run.
- Preserve explicit Cleaner and Architect tools and their existing audit contracts.
- Keep participant evidence advisory and verification mechanically available after every participant outcome.
- Delete stale participant carry-forward from generic continuity lifecycle refresh and stale participant payload/bootstrap guidance from resume briefs.
- Replace only the obsolete participant expectations in the two focused generic continuity suites and the participant-dependent source assertion hunk in the shared Claude runtime suite.
- In the final authorized test-only slice, update only T2 in `tests/subagent-envelope-contract.test.ts` so its closed-world handler assertion recognizes the live private Pi terminal consumer `recognizePiParticipantTerminal` instead of the removed direct-consumer expectation `completeSddParticipantCall`.

**Out of scope**

- Compatibility layers for participant-bearing continuity checkpoints or durable automatic runs.
- A replacement store, checkpoint, receipt, provider abstraction, phase, or provider-neutral result model.
- Changes to Cleaner/Architect audit internals or existing file-count/source-byte limits.
- Redesign of generic checkpoint hydration, readiness, framing, truncation, privacy, persistence, revision selection, or CAS retry behavior.
- Continuity IPC transport or timeout behavior, installer backup behavior, unrelated hunks in the shared Claude runtime suite, or unrelated dirty documentation/site work.
- Any production export/API change, exposure or relocation of `recognizePiParticipantTerminal`, coordinator sequencing/outcome change, inventory rewrite, or change to unrelated T1, T2 fictitious-detector, T3, scout, reconciliation, or envelope assertions in the final slice.

### Affected areas and exact ownership

| Area | Owned change | Protected boundary |
|---|---|---|
| `ein-pi/agent/lib/sdd-participants.ts` | Retain/reduce changed-scope sealing and deterministic slicing; replace checkpoint-backed passages with one small session-local run/call tracker; delete generations, attempts, receipt transitions, migration, recovery, and continuity I/O. | Keep canonical changed-file parsing, Cleaner limits, exact selectors, and explicit audit integration semantics. |
| `ein-pi/agent/lib/continuity-checkpoint.ts` | Delete participant types, limits, versions, validators, serializers, writers, and v2/v3 migrations. Restore the continuity contract to generic facts only. | Preserve generic continuity derivation, revision, verification, limits, and validation behavior. Do not add a legacy participant adapter. |
| `ein-pi/agent/lib/continuity-checkpoint-store.ts` | No participant edits expected; automatic coordination must have no call path to it. | Preserve the generic revision/CAS store unchanged. |
| `ein-pi/agent/lib/continuity-handoff-lifecycle.ts` | Remove the `withSddParticipants` import and participant-only carry-forward branch from refresh. | Preserve generic hydration/refresh, expected absent-or-revision selection, one-conflict retry, write ordering, lifecycle coalescing, readiness, preparation, clear, shutdown, and mutation uncertainty. |
| `ein-pi/agent/lib/continuity-resume-brief.ts` | Remove participant payload data, pending-state calculation/parameter, and participant-specific Claude bootstrap guidance. | Preserve generic checkpoint payload fields, trusted/untrusted framing, deterministic hash/bytes, revision metadata, readiness, privacy, truncation order, and byte budget. |
| `ein-pi/agent/lib/pi-sdd-participant-receipt.ts` | Delete the module. | None; its authority and receipt responsibilities are withdrawn. |
| `ein-pi/agent/extensions/ein-ai.ts` | Remove receipt/artifact imports, preallocation, no-follow artifact reader/export, authority maps, and durable completion hooks. Keep a private, bounded recognition path for exactly one foreground direct or one-child workflow terminal result. | Preserve all unrelated extension hooks and explicit Cleaner/Architect tool registrations. |
| `ein-pi/agent/lib/sdd-preflight.ts` | No redesign; update only marker shape if the reduced task identity requires it. | Preserve `ensureParticipantForeground`: participant calls force `async=false` and `foregroundOnly=true`, including one-child workflow input. |
| `ein-pi/agent/lib/sdd-router.ts` | No participant gate; only a narrowly required freshness integration correction is owned if focused tests expose one. | Preserve deterministic SDD routing and generic delivered-file freshness. |
| `ein-pi/agent/assets/orchestrator.md` | Limit edits to the participant advisory paragraph: ephemeral restart, honest outcomes, and non-gating verify wording. | Preserve phase routing, execution mode, and unrelated prompt text. |
| Tests | Replace durable participant assertions with ephemeral coordinator contracts; delete `tests/pi-sdd-participant-receipt.test.ts` and `tests/fixtures/pi-sdd-participant-foreground.json`; remove participant schema/migration cases from continuity tests. | Preserve generic continuity, explicit tool, router, Cleaner evidence, Claude IPC timeout, and installer backup regressions. |
| `tests/continuity-handoff-lifecycle.test.ts` | Remove the `withSddParticipants` import and participant carry-forward/state-ref/CAS expectations; replace only those contracts with generic-fact refresh and CAS assertions. | Preserve hydration, location, privacy, readiness, concurrency, mutation uncertainty, conflict retry/exhaustion, preparation, clear, and shutdown coverage. |
| `tests/continuity-resume-brief.test.ts` | Remove the participant fixture/import and replace its participant-bearing payload/guidance test with generic payload plus participant-absence assertions. | Preserve provider targeting, deterministic framing/hash, readiness failures, privacy, hostile-input handling, truncation, Unicode accounting, canonical arrays, and immutability. |
| `tests/claude-continuity-runtime.test.ts` | Edit only the stale `RESUME_BRIEF` participant-text assertion/import coupling in the static command test. | Preserve every malformed-frame, inactivity, dispatched-response expiry, late-result, handoff serialization, PTY, termination, native-exit, and fail-closed assertion and all adjacent timeout-owned hunks. |
| `tests/subagent-envelope-contract.test.ts` (final slice only) | Replace only T2's stale participant-handler expected identity with `recognizePiParticipantTerminal`. | Preserve the T1 fixtures, T2 fictitious fifth-consumer RED guard, T3 audits, and all unrelated expected consumer identities/assertions. |

For this final slice, `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/subagent-envelope-contract.ts`, and `ein-pi/agent/lib/sdd-participants.ts` are read-only evidence. The private recognizer remains private, the inventory/public contracts remain unchanged, and `completeSddParticipantCall` remains the coordinator transition called after recognition; only T2's direct handler-consumer expectation changes.

Apply must reconcile these exact hunks against the current diff before editing. It MUST NOT use whole-file checkout/restore/reset, generated replacement, broad formatting, or cleanup outside participant-owned hunks. `cc-ein/continuity-runner.ts`, its timeout semantics, installer backup/recovery code, and unrelated docs/docs-site files are not owned by this change.

### Risks

- Removing v2/v3 participant checkpoint parsing intentionally makes old durable participant state non-resumable; accidentally retaining part of it would create a misleading half-compatibility contract.
- A terminal child envelope could be ambiguous or missing. It must become `unavailable`, never inferred from UI text or a launch handle.
- Cleaner may mutate source between slices. The coordinator must accept mutation only at the admitted Cleaner completion boundary, advance the source seal, and force generic verification freshness to be recomputed.
- Removing participant carry-forward could accidentally alter generic expected-revision selection or conflict retry behavior if the branch deletion crosses the checkpoint-store boundary.
- Broad edits to the shared Claude runtime suite could silently weaken the distinct inactivity and dispatched-response expiry contracts.
- Mixed-worktree edits could overwrite adjacent continuity timeout or installer backup work unless hunk ownership is enforced.
- A broad T2 rewrite could weaken the closed-world detector or conflate private envelope recognition with coordinator completion; the final slice must change only the participant identity expected from direct `event.details` consumption.

### Rollback

Revert only the participant-owned hunks and restore the deleted receipt module/tests/fixture as one changeset. For the corrected stale-consumer slice, restore only the removed lifecycle branch, resume-brief fields/guidance, and their exact test hunks; do not restore or rewrite adjacent Claude IPC timing work or installer work. No data rollback or migration is required: the ephemeral coordinator never writes `continuity.json`, existing checkpoint bytes are left untouched, and a rolled-back runtime can recreate its previous participant state through its former code. Any in-memory advisory run is intentionally discarded and restarts from slice 0. The final test-only expansion rolls back by reverting only its T2 participant-identity expectation; it requires no production rollback.

### Success criteria

- Automatic participation succeeds with no `continuity.json`, leaves a pre-existing checkpoint byte-for-byte unchanged, and has no import/call path to the continuity store.
- A new session starts a newly derived plan at Cleaner slice 0 rather than resuming progress.
- Every changed path occurs in exactly one deterministic slice and each slice obeys `maxFiles=32` and `maxSourceBytes=128 KiB`; one impossible file yields `unavailable` without filtering or limit inflation.
- Only one participant child is admitted in foreground; all Cleaner slices complete in order before Architect is offered.
- Terminal advisory outcomes are only `complete`, `blocked`, or `unavailable`; no failure shape fabricates progress.
- Cleaner mutation advances the source seal, binds subsequent work to the new seal, and makes older verify evidence stale through the generic router.
- Explicit Cleaner/Architect tools retain their audit contracts, and `sdd-verify` remains runnable for every advisory outcome.
- Generic lifecycle refresh hydrates and republishes generic facts without participant APIs, preserving expected revision selection and one-conflict CAS retry semantics.
- Resume briefs contain generic checkpoint/revision data but no participant key, pending summary, or instruction to continue participant work in Pi.
- The shared Claude runtime test loses only its participant-text dependency; all IPC timing, PTY handoff, termination, and fail-closed assertions remain.
- Focused adjacent regressions show continuity IPC timeout and installer backup behavior unchanged.
- T2 reports the real handler's participant envelope consumer as private `recognizePiParticipantTerminal`, not `completeSddParticipantCall`, while its other consumer identities and every unrelated envelope assertion remain unchanged and no production file is edited for this expansion.

### Spec context

- Canonical `openspec/specs/<domain>/spec.md` references supplied by scope/map: **none** (`0` files, `0` bytes); therefore there are no canonical path/SHA-256/byte records to add.
- Persisted delta declaration: `openspec/changes/fix-cleaner-participant-slicing/specs/sdd-participant-routing/spec.md` — SHA-256 `dfb90c1403b7d5b183f5428958d4ab127cc7575dbada94eb5495a00e2538e65d` — `3,322` bytes.

### Skill application

- `ein-discipline`: applied to the bounded SDD correction, strict-TDD posture, and adjacent-change protection.
- `architecture`: applied to prefer deletion at the existing seams over compatibility or replacement abstractions.
- `skill-registry`: skipped because no skill was installed, removed, moved, renamed, or re-indexed.
- `vitest`: skipped because this repository uses Bun tests and design neither writes nor runs tests.
- `vue-best-practices`: skipped because the final expansion touches no Vue source or behavior.
- `motion`: skipped because the final expansion adds no animation behavior.
- `nuxt-content`: skipped because the final expansion touches no Nuxt Content surface.
- `nuxt-modules`: skipped because no Nuxt module is involved.

## B. Spec

### Requirement 1: Ephemeral continuity-independent runs

The system **MUST** derive automatic participant state from the current changed-file scope, keep progress only in the current session, and neither require, create, read for participant progress, nor mutate `continuity.json`.

**Scenario — restart starts fresh**

- **Given** an eligible advisory run completed one or more Cleaner slices and the Pi session ends,
- **When** a later session starts automatic participation for the same change,
- **Then** it derives a new plan from current files and starts at Cleaner slice 0 without consulting or changing continuity state.

### Requirement 2: Complete deterministic bounded slicing

The system **MUST** sort the complete changed-file scope canonically and partition every path exactly once into contiguous ordered Cleaner slices under the existing file-count and raw UTF-8 source-byte limits.

**Scenario — one file cannot fit**

- **Given** the changed scope contains a file that individually exceeds the Cleaner byte limit or cannot satisfy the authoritative Cleaner scope contract,
- **When** the coordinator plans the run,
- **Then** it returns `unavailable` naming the path and reason, without omitting it, increasing limits, or offering a Cleaner task.

### Requirement 3: Foreground single-child sequencing

The system **MUST** admit exactly one automatic participant child at a time, force foreground execution, run Cleaner slices in ordinal order, and offer Architect only after every Cleaner slice in that run completes.

**Scenario — Cleaner precedes Architect**

- **Given** Cleaner and Architect are enabled and the plan contains multiple Cleaner slices,
- **When** the coordinator is repeatedly asked for the next participant,
- **Then** it offers one foreground Cleaner slice at a time in order and offers Architect only after the final Cleaner completes.

### Requirement 4: Honest advisory outcomes

The system **MUST** expose `ready` only as an in-progress next-action state and terminate an advisory run with exactly one honest outcome: `complete`, `blocked`, or `unavailable`.

- `complete` means every enabled participant in this run returned an accepted complete result.
- `blocked` means the admitted participant returned an identity-bound explicit blocked audit result.
- `unavailable` means safe planning or completion evidence cannot be obtained, including disabled required capability, impossible scope, transport failure, missing/ambiguous result, stale identity, interruption, or unsupported/background delivery.

**Scenario — Cleaner result is not safely complete**

- **Given** a Cleaner call is admitted,
- **When** it returns blocked, fails, is missing or ambiguous, is stale, or becomes unavailable,
- **Then** the current run ends as `blocked` only for an explicit bound blocked result and otherwise as `unavailable`, Architect is not offered, and verify remains available.

### Requirement 5: Source-seal frontier and Architect freshness

The system **MUST** bind each admitted child to the current source seal, recompute the full changed-scope seal after each accepted Cleaner completion, and bind Architect to the fresh post-Cleaner seal.

**Scenario — source changes around Cleaner**

- **Given** a Cleaner slice was admitted against seal A and returns complete after mutating an in-scope file,
- **When** the coordinator processes that terminal result,
- **Then** it records no durable receipt, recomputes seal B as the session frontier, binds the next slice or Architect to B, and abandons the run as `unavailable` if source later drifts outside an accepted Cleaner completion boundary.

### Requirement 6: Verification freshness remains mechanical

The system **MUST** treat Cleaner mutation as invalidating the prior source seal and prior verification freshness, while participant status itself **MUST NOT** gate `sdd-verify`.

**Scenario — verified source is cleaned**

- **Given** a fresh passing verify report predates an accepted Cleaner source mutation,
- **When** SDD status is resolved after the mutation,
- **Then** generic delivered-file freshness marks verification stale and routes to verify regardless of whether the advisory run is complete, blocked, or unavailable.

### Requirement 7: Explicit tools remain independent

The system **MUST** keep explicit Cleaner and Architect tools available with their existing selector, mutation/read-only, provenance, and audit-validation contracts, independent of automatic coordinator availability.

**Scenario — automatic advisor is unavailable**

- **Given** automatic participation cannot plan or recognize a safe terminal result,
- **When** a caller invokes an explicit Cleaner or Architect tool directly,
- **Then** the tool executes under its existing audit contract without requiring participant session state or continuity state.

### Requirement 8: Durable participant machinery is removed

The system **MUST NOT** retain participant checkpoint fields or versions, migrations, generations, attempts, admissions, orphan recovery, canonical persisted receipts, file-only artifact authority, or a replacement persistence abstraction.

**Scenario — generic continuity is serialized**

- **Given** continuity facts are captured after this change,
- **When** the generic checkpoint is validated and serialized,
- **Then** it contains no participant key or participant-only version and no automatic participant runtime file is created.

### Requirement 9: Generic lifecycle refresh remains revision-safe

The system **MUST** derive and write lifecycle refreshes from generic continuity facts only, without reading or carrying participant checkpoint state, and **MUST** preserve current absent/revision expectations, conflict rereads, retry count, and write ordering.

**Scenario — refresh encounters one CAS conflict**

- **Given** a valid generic checkpoint and a concurrent generic update causes the first conditional write to conflict,
- **When** lifecycle refresh retries,
- **Then** it rereads the current checkpoint, derives generic facts again, writes against the new revision, and returns the existing refresh outcome without participant data influencing the retry.

### Requirement 10: Resume briefs are generic-only

The system **MUST** emit generic checkpoint and revision data in continuity resume briefs, **MUST NOT** emit a participant key or pending-participant summary, and **MUST NOT** instruct Claude to continue participant work in Pi. Existing readiness, framing, hashing, privacy, truncation, and byte-budget behavior **MUST** remain unchanged.

**Scenario — Claude brief is built from a ready checkpoint**

- **Given** a ready generic continuity checkpoint targeted to Claude,
- **When** the resume brief is built,
- **Then** its framed payload contains the generic checkpoint data and revision but no participant field or participant bootstrap instruction, with the existing deterministic metadata and safety framing intact.

### Requirement 11: Adjacent Claude and installer behavior is protected

The correction **MUST** remove only participant-dependent assertion coupling from the shared Claude runtime contract and **MUST NOT** change continuity IPC timing, handoff, termination, fail-closed, installer backup, or unrelated test behavior.

**Scenario — protected adjacent regressions are reviewed**

- **Given** the shared Claude runtime suite contains participant text assertions beside IPC timing and PTY contracts,
- **When** the stale participant dependency is removed,
- **Then** the timing, expiry, late-response, PTY handoff, termination, native-exit, and fail-closed assertions remain unchanged, and no installer file or assertion is edited.

### Requirement 12: T2 tracks the live private Pi terminal recognizer

The T2 closed-world envelope contract **MUST** identify `recognizePiParticipantTerminal` as the participant consumer that directly receives terminal `event.details` in the current Pi `tool_result` handler and **MUST NOT** substitute the downstream coordinator transition `completeSddParticipantCall` for that recognition edge. The correction **MUST** remain test-only, preserve every unrelated envelope expectation, and require no public export of the private recognizer.

**Scenario — real handler recognition is distinguished from completion**

- **Given** the Pi handler privately recognizes one foreground participant terminal envelope and then forwards the recognized terminal value to the coordinator,
- **When** T2 extracts the real handler and computes its closed-world direct envelope consumers,
- **Then** the participant identity is `recognizePiParticipantTerminal`, not `completeSddParticipantCall`, all other declared consumers still match, and T1, the fictitious-consumer RED guard, and T3 remain unchanged.

## C. Decisions

### 1. One minimal session-local coordinator

`lib/sdd-participants.ts` owns deterministic planning and the ephemeral run frontier. Its minimum state is the current session/change identity, immutable initial slices, next Cleaner ordinal, current source seal, optional single in-flight call identity, enabled order, and terminal outcome. Session cleanup deletes this memory. No generation, attempt ordinal, prior history, orphan record, or durable receipt survives.

Trade-off: a restart repeats advisory work from slice 0. This is intentional and safer than recovery machinery for non-gating advice.

### 2. Deletion over compatibility

Participant-bearing continuity v2/v3 schema and migration code are deleted rather than translated, ignored, or copied into another store. The automatic advisor never rewrites an old checkpoint. Generic continuity remains responsible only for generic continuity facts; old automatic participant progress is intentionally not resumable.

Trade-off: old participant checkpoints are not a compatibility target. Retaining parsers or downgrade migration would preserve the coupling this change exists to remove.

### 3. Deterministic planner remains pure and complete

The planner continues to use the authoritative Cleaner limits and canonical path/source evidence. It plans from all declared changed paths, not a feasible subset. If any path is impossible, the whole advisory run is unavailable; partial cleaning would falsely imply full-scope coverage.

### 4. Tiny Pi edge, not a provider abstraction

`ein-ai.ts` may privately recognize only an exact single foreground terminal child from the supported direct or one-child workflow result shape and pass its output/error to the coordinator. It does not mint a receipt, allocate a file, digest durable evidence, or normalize providers. UI labels, outer display text, launch handles, `subagent_wait`, multiple children, and ambiguous shapes cannot complete work.

A new provider interface or shared envelope module is rejected: Pi is the reference runtime, there is no demonstrated third implementation, and MANIFIESTO //003 forbids speculative provider layers.

### 5. Accepted Cleaner completion is the only mutable frontier

Admission verifies the current seal. An accepted Cleaner completion is the sole boundary where changed source may establish a new seal; subsequent admission checks that frontier again. Architect is read-only and must finish against its admitted post-Cleaner seal. Any other drift terminates the run as unavailable.

The generic router—not participant state—owns verify freshness. Re-resolving status after mutation is sufficient; no participant-specific verify gate or freshness store is added.

### 6. Outcome semantics separate audit blockage from unavailable evidence

Only an explicit, identity-bound `status: blocked` child result becomes `blocked`. Infrastructure failure, missing output, stale source, unsupported delivery, and impossible planning become `unavailable`. This keeps uncertainty honest and prevents operational failures from masquerading as audit findings.

### 7. Responsibility boundaries

- Planner/coordinator: changed scope, slices, order, source frontier, one in-flight child, advisory outcome.
- Pi extension edge: foreground enforcement hookup and exact terminal child extraction.
- Explicit tools: Cleaner/Architect audit evidence and mutation/read-only enforcement.
- SDD router: apply/verify/close routing and generic verification freshness.
- Continuity: cross-runtime generic facts only; no automatic participants.
- Tests: observable contracts and absence of deleted durable/file-only surfaces.

### 8. Alternatives rejected

- **Keep participant fields but stop writing them:** leaves dead schema and migration complexity that implies unsupported recovery.
- **Add lifecycle or brief compatibility shims:** reading legacy participant fields through casts, carrying them across refresh, or emitting a null/legacy summary would preserve the persistence contract and conceal stale consumers instead of deleting them.
- **Migrate old participant state into session memory:** is a compatibility bridge and violates fresh restart from slice 0.
- **Persist a smaller receipt or JSON file:** recreates a store for advisory work.
- **Keep file-only output as a fallback:** requires path authority, cleanup, and receipt normalization solely for durability that no longer exists.
- **Run slices concurrently/background:** loses deterministic order and authoritative same-call terminal evidence.
- **Make participant success a verify prerequisite:** blocks delivery without a mechanical downstream consumer.

### 9. Generic continuity owns no participant carry-forward

`continuity-handoff-lifecycle.ts` removes the participant import and branch rather than replacing them. Lifecycle continues to own generic fact hydration and refresh orchestration; `continuity-checkpoint-store.ts` continues to own revision-conditional persistence. The correction may delete participant influence on a retry, but it may not alter expectation selection, reread cadence, retry count, or store result handling.

### 10. Resume briefs summarize generic continuity only

`continuity-resume-brief.ts` removes the participant payload member, pending computation, frame parameter, and Claude bootstrap line as one cohesive deletion. It does not emit a replacement status, a compatibility alias, or an explanatory participant tombstone. Same-session participant advice belongs to the ephemeral coordinator, not cross-runtime continuity.

### 11. Focused contract replacement, not broad test cleanup

The lifecycle and resume-brief suites replace participant carry-forward/summary expectations with generic facts, revision/CAS, and explicit absence assertions. In `tests/claude-continuity-runtime.test.ts`, ownership is hunk-level: only the stale `RESUME_BRIEF` participant-text dependency changes. Strict TDD remains the posture for the later apply correction, and the standard lane remains unchanged.

### 12. Measured withdrawal condition

Per MANIFIESTO //004, the advisory-only/non-gating guardrail may be withdrawn and participant evidence reconsidered as a gate **only** after a reproducible measured defect demonstrates all of the following: a fresh `sdd-verify` passed, required evidence that verify was expected to consume was absent or wrong, and the participant found that same defect under a focused regression. Suspicion, participant failure, or one unavailable run is not sufficient evidence. Until then, the participant coordinator remains advisory and removable without affecting phase routing.

### 13. T2 observes the private recognition edge without widening production surface

The final expansion belongs only to T2's expected direct-consumer view. It distinguishes the function that consumes `event.details` (`recognizePiParticipantTerminal`) from the downstream coordinator transition that consumes the already-recognized terminal value (`completeSddParticipantCall`). The test may adapt only that participant identity at its assertion boundary; the production inventory, recognizer visibility, coordinator API, sequencing, and outcomes remain unchanged.

Exporting the recognizer, renaming the completion API, changing the inventory, or rewriting the detector is rejected because none is needed to correct the stale test dependency and each would exceed the authorized test-only boundary.

## D. Success Criteria

Acceptance requires observable evidence that:

1. Planning/execution works when continuity is absent and does not change the bytes or revision of an existing checkpoint.
2. Session cleanup/restart discards progress and a new run starts with newly derived slice 0.
3. Reordered identical scope yields identical lexical slices; boundaries obey 32 files and 128 KiB raw UTF-8, with exact-once path coverage.
4. Oversized, non-UTF-8, rejected, or otherwise impossible files produce `unavailable` with the concrete path and no partial plan.
5. Foreground flags override async input, multiple participant children are rejected, and Cleaner slices precede Architect.
6. Explicit blocked results produce `blocked`; failed, missing, stale, interrupted, background, and ambiguous results produce `unavailable`; none admits Architect after Cleaner failure.
7. Cleaner mutation establishes a fresh seal for the next child; later drift is rejected; Architect uses the final post-Cleaner seal.
8. A Cleaner mutation after verify makes generic verification stale and routes to verify, while every participant outcome leaves verify callable.
9. Explicit Cleaner and Architect audit tool contracts remain unchanged.
10. No participant schema/migration/receipt/orphan symbol, file-only artifact path/runtime directory, deleted fixture, or import of the receipt module remains.
11. Bounded diff review confirms no participant-owned edit changes Claude continuity IPC timing, installer backup/recovery, or unrelated worktree content.
12. Lifecycle refresh compiles without `withSddParticipants` or `checkpoint.sddParticipants`, preserves generic hydrated facts across state-ref refreshes, and retains absent/revision expectation selection plus one-conflict retry and exhausted-conflict outcomes.
13. Resume-brief output retains generic checkpoint fields, revision, deterministic bytes/hash, framing, readiness, privacy, truncation, and size behavior while containing neither `sddParticipants` nor participant bootstrap guidance.
14. Diff review of `tests/claude-continuity-runtime.test.ts` shows only the participant-dependent `RESUME_BRIEF` assertion coupling changed; preparation inactivity, dispatched-response expiry, late-result rejection, PTY handoff, termination, native exit, and fail-closed assertions remain intact.
15. No installer source or test hunk is changed by this correction, and strict TDD plus the standard lane remain recorded unchanged.
16. Focused T2 evidence identifies `recognizePiParticipantTerminal` as the current direct participant envelope consumer and excludes `completeSddParticipantCall` from that direct-consumer role; diff review shows no other assertion or any production file changed in the final expansion.

Known verification commands for later phases (not executed during design):

```bash
bun test tests/continuity-handoff-lifecycle.test.ts tests/continuity-resume-brief.test.ts
bun test tests/claude-continuity-runtime.test.ts
bun test tests/subagent-envelope-contract.test.ts
bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-router.test.ts tests/cleaner-audit-evidence.test.ts tests/architect-read-only.test.ts tests/agent-tools-contract.test.ts
bun test tests/claude-continuity-runtime.test.ts tests/installer-backup.test.ts
bun test
bun run typecheck
cd installer && bun run typecheck
```

Before delivery, run the configured review forecast against the PR base. If production changes exceed 400 lines, the parent must ask the user whether to keep one PR or split it; this design does not pre-decide delivery shape.
