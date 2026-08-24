# Tasks — fix-cleaner-participant-slicing

status: ready
blocked_by: none
lane: standard
tdd: strict

<!-- Skill applicability: `ein-discipline` applies to strict TDD and bounded hunk ownership; `architecture` applies to deletion at existing seams without compatibility abstractions; `bun` applies to focused/full test and typecheck commands. `skill-registry` is skipped because no skill changed, and `vitest` is skipped because this repository uses Bun tests. -->

## // 001. Anchor owned hunks without touching production

Production files (apply touches): none.

Test/fixture files (apply touches): none. Recovery anchors and protected hashes are read-only evidence only.

- [x] 1.1 Capture the participant-owned worktree diff as a read-only recovery anchor, then hash the protected continuity-store, Claude IPC, and installer regression boundaries before any edit.
  - skills: `ein-discipline`
  - why: Apply needs evidence that detects accidental overwrite of adjacent active work without treating protected files as production touches.
  - learn: A recovery anchor and protected hashes are evidence only; they are never replayed as a patch or counted as files to modify.
  - architecture: Participant-owned hunks may change in later groups; generic CAS storage, Claude IPC timing, installer backup behavior, and unrelated dirty content remain protected.
  - avoid: Do not edit protected files or use checkout, restore, reset, full-file copies, generated replacement, broad formatting, or anchor replay.
  - verify: `git diff --no-ext-diff -- ein-pi/agent/lib/sdd-participants.ts ein-pi/agent/lib/continuity-checkpoint.ts ein-pi/agent/lib/pi-sdd-participant-receipt.ts ein-pi/agent/extensions/ein-ai.ts ein-pi/agent/lib/sdd-preflight.ts ein-pi/agent/lib/sdd-router.ts ein-pi/agent/assets/orchestrator.md tests/sdd-participants.test.ts tests/pi-sdd-participant-receipt.test.ts tests/continuity-checkpoint.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-router.test.ts tests/agent-tools-contract.test.ts tests/fixtures/pi-sdd-participant-foreground.json > /tmp/fix-cleaner-participant-slicing.before.patch && shasum -a 256 ein-pi/agent/lib/continuity-checkpoint-store.ts cc-ein/continuity-runner.ts tests/claude-continuity-runtime.test.ts tests/installer-backup.test.ts > /tmp/fix-cleaner-participant-slicing.protected.sha256 && test -s /tmp/fix-cleaner-participant-slicing.before.patch && shasum -a 256 -c /tmp/fix-cleaner-participant-slicing.protected.sha256`

## // 002. Delete participant persistence from generic continuity

Production files (apply touches): `ein-pi/agent/lib/continuity-checkpoint.ts`.

Test files (apply touches): `tests/continuity-checkpoint.test.ts`.

- [x] 2.1 Remove participant schema/migration/generation/attempt/receipt cases from `tests/continuity-checkpoint.test.ts` and add RED assertions that current generic checkpoints validate and serialize without participant keys or participant-only versions.
  - skills: `ein-discipline`
  - why: Tests must state the reduced generic continuity contract before the compatibility machinery is deleted.
  - learn: Removing persisted behavior means testing the remaining schema and absent emitted fields, not designing a downgrade bridge.
  - architecture: Continuity retains generic facts, revision, verification, limits, and validation only; old participant checkpoints are intentionally unsupported.
  - avoid: Do not add an ignore-and-carry migration, legacy adapter, tombstone field, or participant parser under a generic name.
  - verify: `! bun test tests/continuity-checkpoint.test.ts`

- [x] 2.2 Delete participant types, limits, validators, serializers, writers, generation history, and v2/v3 participant migrations from `ein-pi/agent/lib/continuity-checkpoint.ts`; keep generic checkpoint behavior intact and leave the protected store byte-identical.
  - skills: `ein-discipline`
  - why: Dead durable schema would continue to imply unsupported participant recovery and preserve the coupling this change removes.
  - learn: Deletion is complete when the surviving contract has one source of truth and no compatibility shell.
  - architecture: Generic serialization remains deterministic and revision-aware; automatic participants have no checkpoint schema or store call path.
  - avoid: Do not change generic CAS behavior, parser limits, continuity IPC semantics, or rewrite an existing checkpoint during participant startup.
  - verify: `bun test tests/continuity-checkpoint.test.ts tests/continuity-checkpoint-store.test.ts && ! grep -nE 'SddParticipant|sddParticipants|withSddParticipants|migrateSddParticipants' ein-pi/agent/lib/continuity-checkpoint.ts && shasum -a 256 -c /tmp/fix-cleaner-participant-slicing.protected.sha256`

## // 003. Rebuild the participant module as an ephemeral coordinator

Production files (apply touches): `ein-pi/agent/lib/sdd-participants.ts`.

Test files (apply touches): `tests/sdd-participants.test.ts`, `tests/cleaner-audit-evidence.test.ts`.

- [x] 3.1 Rewrite `tests/sdd-participants.test.ts` into a behavioral RED contract for fresh session/change runs, complete deterministic bounded slicing, impossible-file unavailability, one foreground call, Cleaner-before-Architect order, honest outcomes, source-seal advancement/drift rejection, continuity independence, and cleanup restarting at slice 0.
  - skills: `ein-discipline`
  - why: Observable same-session behavior must replace assertions tied to generations, attempts, durable receipts, migrations, and recovery.
  - learn: Under strict TDD, RED should fail because required behavior is absent, not because obsolete names no longer compile.
  - architecture: Exercise the public participant surface and temporary roots; prove absent `continuity.json` remains absent and existing checkpoint bytes/revision remain unchanged.
  - avoid: Do not preserve legacy assertions behind aliases, mock a replacement store, infer terminal state from UI text, or weaken Cleaner limits.
  - verify: `! bun test tests/sdd-participants.test.ts`

- [x] 3.2 Delete checkpoint/store imports and generation, attempt, durable receipt, orphan recovery, migration, and durable publication paths from `ein-pi/agent/lib/sdd-participants.ts`, retaining canonical changed-scope parsing, authoritative Cleaner limits/evidence, exact selectors, and explicit audit integration semantics.
  - skills: `ein-discipline`
  - why: Deleting persistence-shaped concepts first prevents the replacement coordinator from inheriting hidden history and recovery semantics.
  - learn: A smaller lifecycle is easier to specify after historical states are removed rather than renamed.
  - architecture: The module may own only session/change-local planning and progress, with no continuity store dependency.
  - avoid: Do not rename generations to runs while keeping history, add a provider/store abstraction, or omit an impossible path.
  - verify: `! grep -nE 'continuity-checkpoint-store|generation|orphan|receipt|migration|abandonedAttempt|activeAttempt' ein-pi/agent/lib/sdd-participants.ts`

- [x] 3.3 GREEN the pure planner contract in `ein-pi/agent/lib/sdd-participants.ts`: canonical lexical paths, contiguous ordered slices, exact-once coverage, `maxFiles=32`, `maxSourceBytes=128*1024`, and whole-run `unavailable` with path/reason when any file is impossible.
  - skills: `ein-discipline`
  - why: Complete deterministic slicing is the safety property retained after durable workflow removal.
  - learn: Exact partitioning is stronger than best-effort batching because omitted files cannot masquerade as covered work.
  - architecture: Planning is pure over the complete current changed scope and writes no state while deriving slices.
  - avoid: Do not raise limits, pre-filter files, create overflow slices, use filesystem order, or reuse a prior session plan.
  - verify: `bun test tests/sdd-participants.test.ts --test-name-pattern 'slice|scope|limit|impossible'`

- [x] 3.4 GREEN the minimal session/change coordinator in `ein-pi/agent/lib/sdd-participants.ts`: immutable initial slices, next Cleaner ordinal, current full-scope seal, one optional in-flight identity, enabled Cleaner/Architect order, terminal `complete|blocked|unavailable`, and cleanup that discards the run.
  - skills: `ein-discipline`
  - why: Automatic work still needs identity-bound, fail-closed sequencing during one live Pi session.
  - learn: Only an explicit bound audit result is `blocked`; missing, failed, ambiguous, stale, interrupted, unsupported, or background evidence is `unavailable`.
  - architecture: Admission checks the frontier; only accepted Cleaner completion may advance it; Architect follows all Cleaner slices and binds to the final seal.
  - avoid: Do not retain attempt history, cross-session recovery, parallel/background calls, fabricated completion, or Architect admission after terminal Cleaner failure.
  - verify: `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts`

- [x] 3.5 TRIANGULATE with reordered scopes, exact boundary sizes, post-Cleaner mutation plus later drift, explicit bound blockage, and missing/ambiguous terminal evidence; then refactor only inside `ein-pi/agent/lib/sdd-participants.ts` while tests remain GREEN.
  - skills: `ein-discipline`
  - why: Boundary examples distinguish real invariants from behavior that happens to satisfy one fixture.
  - learn: Triangulation should protect observable order, frontier, and fail-closed semantics without freezing private map shape.
  - architecture: Tests observe advisory outcomes and source identities, never participant status as a verification gate.
  - avoid: Do not snapshot private coordinator state or introduce a durable/provider-neutral result model while refactoring.
  - verify: `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts && ! grep -n 'continuity-checkpoint-store' ein-pi/agent/lib/sdd-participants.ts`

## // 004. Delete receipt authority and simplify the Pi terminal adapter

Production files (apply touches): `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/pi-sdd-participant-receipt.ts` (delete).

Test/fixture files (apply touches): `tests/agent-tools-contract.test.ts`, `tests/pi-sdd-participant-receipt.test.ts` (delete), `tests/fixtures/pi-sdd-participant-foreground.json` (delete).

- [x] 4.1 Add RED contracts in `tests/agent-tools-contract.test.ts` for one foreground direct terminal result and one foreground one-child workflow result, plus `unavailable` for multiple children, background/unsupported delivery, missing output, and ambiguous output; retain explicit Cleaner/Architect tool assertions.
  - skills: `ein-discipline`
  - why: The receipt suite is being deleted, so the supported Pi edge needs observable coverage without preserving receipt APIs.
  - learn: A thin runtime adapter recognizes only exact owned shapes and fails closed instead of guessing from display text.
  - architecture: Test the registered extension/tool boundary; keep extraction private to Pi and sequencing in the coordinator.
  - avoid: Do not export a provider-neutral envelope or infer success from labels, launch handles, `subagent_wait`, or outer UI text.
  - verify: `! bun test tests/agent-tools-contract.test.ts`

- [x] 4.2 Delete `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`, `tests/pi-sdd-participant-receipt.test.ts`, and `tests/fixtures/pi-sdd-participant-foreground.json` before adapting consumers.
  - skills: `ein-discipline`
  - why: Deletion-first sequencing makes any remaining receipt or fixture dependency fail visibly instead of surviving as dead compatibility code.
  - learn: Removing a persistence boundary starts with deleting its authority module and contract fixtures, then repairing only legitimate consumers.
  - architecture: No participant receipt module, persisted fixture, or file-only authority survives.
  - avoid: Do not leave stubs, re-export shims, skipped receipt tests, or renamed compatibility fixtures.
  - verify: `test ! -e ein-pi/agent/lib/pi-sdd-participant-receipt.ts && test ! -e tests/pi-sdd-participant-receipt.test.ts && test ! -e tests/fixtures/pi-sdd-participant-foreground.json`

- [x] 4.3 Remove receipt imports, artifact preallocation/readers, authority maps, runtime participant paths, digest normalization, and durable completion hooks from `ein-pi/agent/extensions/ein-ai.ts`; GREEN a bounded private recognizer that forwards exactly one supported foreground terminal result/error to the admitted coordinator call.
  - skills: `ein-discipline`
  - why: The coordinator still needs trustworthy same-call Pi evidence after file-only receipts disappear.
  - learn: Runtime-specific extraction belongs at the edge; ordering and outcome policy remain in the participant domain module.
  - architecture: `ein-pi/agent/extensions/ein-ai.ts` recognizes supported Pi shapes only and never stores participant artifacts or creates provider abstractions.
  - avoid: Do not retain fallback output files, cleanup machinery, multiple-child acceptance, delayed background completion, or changes to unrelated extension hooks.
  - verify: `bun test tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts && ! grep -nE 'pi-sdd-participant-receipt|runtime/sdd-participants|participantArtifact|output\.txt' ein-pi/agent/extensions/ein-ai.ts`

## // 005. Preserve foreground enforcement at preflight

Production files (apply touches): `ein-pi/agent/lib/sdd-preflight.ts`.

Test files (apply touches): `tests/sdd-preflight-per-change.test.ts`, `tests/sdd-preflight-record.test.ts`, `tests/sdd-preflight-tdd-gate.test.ts`, `tests/agent-tools-contract.test.ts`.

- [x] 5.1 Add or tighten RED preflight assertions that automatic participant direct and one-child workflow inputs force `async=false` and `foregroundOnly=true`, reject unsupported multiplicity/background delivery, and use only the reduced call identity required by the ephemeral coordinator.
  - skills: `ein-discipline`
  - why: Foreground single-child enforcement must remain explicit after receipt-shaped identity fields disappear.
  - learn: Runtime scheduling constraints are safest when tested at admission rather than inferred after delivery.
  - architecture: Preflight owns foreground normalization and supported call shape, not participant progress or terminal outcome policy.
  - avoid: Do not add history, persistence, provider abstractions, or weaken existing per-change and TDD gates.
  - verify: `! bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-record.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/agent-tools-contract.test.ts`

- [x] 5.2 Update only the participant marker/call shape in `ein-pi/agent/lib/sdd-preflight.ts` as required, preserving forced foreground execution and every unrelated preflight contract; triangulate direct and one-child workflow inputs before refactoring.
  - skills: `ein-discipline`
  - why: Adapter cleanup must not accidentally reopen background or multi-child automatic participation.
  - learn: A narrow marker migration is preferable to redesigning a stable preflight boundary.
  - architecture: `ein-pi/agent/lib/sdd-preflight.ts` enforces one foreground child; `ein-pi/agent/lib/sdd-participants.ts` alone advances the ephemeral run.
  - avoid: Do not alter execution-mode, per-change, explicit-tool, or strict-TDD behavior outside the participant marker hunk.
  - verify: `bun test tests/sdd-preflight-per-change.test.ts tests/sdd-preflight-record.test.ts tests/sdd-preflight-tdd-gate.test.ts tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts`

## // 006. Keep routing advisory and close the integration proof

Production files (apply touches): `ein-pi/agent/lib/sdd-router.ts` (only if focused freshness RED exposes the owned defect), `ein-pi/agent/assets/orchestrator.md`.

Test files (apply touches): `tests/sdd-router.test.ts`, `tests/sdd-next-dispatcher.test.ts`.

- [x] 6.1 Add or retain RED routing contracts proving participant `complete`, `blocked`, and `unavailable` never gate `sdd-verify`, while accepted Cleaner mutation makes prior generic verification stale and routes to verify; add a RED prompt assertion for ephemeral restart and honest non-gating wording.
  - skills: `ein-discipline`
  - why: Durable workflow removal must not weaken mechanical freshness or turn advisory evidence into phase eligibility.
  - learn: Verification routing depends on delivered-file evidence, not whether an advisory participant succeeded.
  - architecture: The generic router owns apply/verify/close freshness; prompt text explains advisory behavior but owns no state.
  - avoid: Do not add a participant phase, blocker, remediation loop, or outcome-specific verification guard.
  - verify: `! bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts`

- [x] 6.2 Edit only the participant advisory paragraph in `ein-pi/agent/assets/orchestrator.md` for same-session restart, honest outcomes, Cleaner-before-Architect foreground order, and non-gating verify; edit `ein-pi/agent/lib/sdd-router.ts` only when the focused RED demonstrates the narrow generic freshness defect.
  - skills: `ein-discipline`
  - why: Guidance and deterministic routing must describe the reduced coordinator without disturbing unrelated phase or execution-mode behavior.
  - learn: A listed production file can remain untouched when characterization proves its protected contract already holds.
  - architecture: Prompt wording remains advisory, and generic delivered-file freshness remains independent of participant state.
  - avoid: Do not rewrite the prompt/router wholesale, fold participant outcomes into route eligibility, or restore mixed files from the anchor.
  - verify: `bun test tests/sdd-router.test.ts tests/sdd-next-dispatcher.test.ts`

- [x] 6.3 Run the focused integration proof for continuity independence, explicit tool preservation, participant ordering/outcomes, and generic verification freshness.
  - skills: `ein-discipline`
  - why: Acceptance requires observable non-creation and byte-for-byte non-mutation of continuity across the full advisory path.
  - learn: Absence claims need both no-file and existing-file tests; serialized shape checks alone are insufficient.
  - architecture: Automatic state is session-local, explicit tools retain their audit contracts, and continuity remains a separate generic subsystem.
  - avoid: Do not satisfy the proof by deleting a created file afterward, mocking writes away, or repairing unrelated failures.
  - verify: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts tests/sdd-next-dispatcher.test.ts tests/sdd-router.test.ts tests/cleaner-audit-evidence.test.ts tests/architect-read-only.test.ts tests/agent-tools-contract.test.ts`

Historical apply note: the former task 6.4 was not completed. Its protected-adjacent/full-suite/typecheck run exposed stale participant consumers that were then authorized by the corrected scope, map, and design. The superseding final verification is task 9.1; tasks 6.1–6.3 remain completed as originally recorded.

## // 007. Recover generic lifecycle refresh without participant carry-forward

Production files (apply touches): `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`.

Test files (apply touches): `tests/continuity-handoff-lifecycle.test.ts`.

- [x] 7.1 RED — replace only the obsolete participant state-ref and CAS carry-forward contracts with assertions that refresh republishes generic facts without participant fields and retains revision-bound conflict behavior.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: The lifecycle suite must define the reduced generic refresh contract before the stale production branch is removed.
  - learn: A deletion RED should preserve the surrounding algorithm and fail on the obsolete dependency, not redesign the checkpoint store.
  - architecture: Lifecycle owns hydration and refresh orchestration; the protected checkpoint store continues to own absent/revision expectations and CAS writes.
  - avoid: Do not add casts, legacy participant fixtures, compatibility shims, checkpoint-store edits, or broad test cleanup.
  - verify: `! bun test tests/continuity-handoff-lifecycle.test.ts`

- [x] 7.2 GREEN — remove the `withSddParticipants` import and participant-only carry-forward branch from `continuity-handoff-lifecycle.ts`, leaving generic derivation, write ordering, and one-conflict retry unchanged.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: Generic refresh cannot compile or operate safely while it still consumes the intentionally deleted participant checkpoint API.
  - learn: Removing a stale branch is safer than translating its data into another field or hidden side channel.
  - architecture: Refresh derives only generic continuity facts and passes them through the existing revision-conditional store boundary.
  - avoid: Do not change hydration, readiness, location selection, coalescing, retry count, mutation uncertainty, clear, shutdown, or store result handling.
  - verify: `bun test tests/continuity-handoff-lifecycle.test.ts`

- [x] 7.3 TRIANGULATE — cover generic facts across state-ref refresh, absent and revision expectations, one-conflict reread/retry, and exhausted conflict while retaining the suite’s hydration, privacy, readiness, concurrency, and shutdown cases.
  - skills: `ein-discipline`, `bun`
  - why: Multiple revision paths prove participant deletion did not accidentally weaken generic CAS safety.
  - learn: Triangulation protects the invariant at both the ordinary refresh path and its concurrency boundary.
  - architecture: Participant evidence influences neither derived facts nor expectation selection; concurrent generic updates remain authoritative.
  - avoid: Do not snapshot private lifecycle state, alter checkpoint-store calls, or weaken existing conflict assertions to obtain GREEN.
  - verify: `bun test tests/continuity-handoff-lifecycle.test.ts`

- [x] 7.4 REFACTOR — remove obsolete lifecycle/test imports and fixtures, simplify only the newly touched participant-owned hunks, and keep the focused lifecycle suite GREEN.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: The recovery should end with no dead participant coupling and no unrelated lifecycle churn.
  - learn: Refactoring after triangulation means reducing local residue while preserving already-proven generic behavior.
  - architecture: The public lifecycle result shapes and the generic checkpoint-store boundary remain unchanged.
  - avoid: Do not rename generic APIs, broadly format either file, or introduce a participant tombstone or alias.
  - verify: `bun test tests/continuity-handoff-lifecycle.test.ts && ! grep -nE 'withSddParticipants|checkpoint\.sddParticipants' ein-pi/agent/lib/continuity-handoff-lifecycle.ts && git diff --check -- ein-pi/agent/lib/continuity-handoff-lifecycle.ts tests/continuity-handoff-lifecycle.test.ts`

## // 008. Recover generic resume briefs and remove Claude participant-text coupling

Production files (apply touches): `ein-pi/agent/lib/continuity-resume-brief.ts`.

Test files (apply touches): `tests/continuity-resume-brief.test.ts`, participant-dependent hunks only in `tests/claude-continuity-runtime.test.ts`.

- [x] 8.1 RED — replace the participant-bearing resume-brief contract with generic payload plus explicit participant-absence assertions, and change only the stale Claude source assertion so it no longer requires participant bootstrap text.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: Tests must reject participant payload/guidance while retaining the generic cross-runtime handoff contract.
  - learn: A protected mixed test file is edited by hunk ownership: remove one stale dependency, not neighboring timing coverage.
  - architecture: Resume briefs summarize generic continuity only; the Claude runtime test remains the owner of IPC timing and fail-closed behavior.
  - avoid: Do not edit `cc-ein/continuity-runner.ts`, timing fixtures, PTY assertions, installer files, or add a null/legacy participant field.
  - verify: `! bun test tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts`

- [x] 8.2 GREEN — remove participant payload data, pending-state computation/parameter, obsolete imports, and the Claude bootstrap instruction from `continuity-resume-brief.ts` without changing generic framing or metadata.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: Cross-runtime continuity must stop advertising same-session ephemeral participant work as durable handoff state.
  - learn: Removing behavior completely is clearer than emitting an empty compatibility value that implies continued ownership.
  - architecture: The brief retains generic checkpoint/revision data, trusted/untrusted framing, deterministic bytes/hash, privacy, and budget enforcement.
  - avoid: Do not add compatibility parsing, replacement summaries, provider abstractions, or change readiness and truncation policy.
  - verify: `bun test tests/continuity-resume-brief.test.ts`

- [x] 8.3 TRIANGULATE — prove generic payload/revision output, deterministic framing/hash, readiness, privacy, truncation, Unicode accounting, and participant absence; run the complete Claude runtime suite to preserve IPC timing, expiry, PTY handoff, termination, and fail-closed semantics.
  - skills: `ein-discipline`, `bun`
  - why: The participant-text deletion is safe only when both brief invariants and protected adjacent runtime behaviors remain observable.
  - learn: Full behavioral coverage replaces a whole-file hash when one narrowly authorized hunk in that file must change.
  - architecture: Brief generation may change only its participant-owned content; Claude transport and timing remain untouched adjacent ownership.
  - avoid: Do not weaken or skip timing tests, broadly rewrite static source assertions, or repair unrelated runtime failures.
  - verify: `bun test tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts`

- [x] 8.4 REFACTOR — remove obsolete imports/fixtures and simplify only the touched resume-brief and Claude assertion hunks while all focused contracts stay GREEN.
  - skills: `ein-discipline`, `architecture`, `bun`
  - why: The corrected slice should leave no dead participant summary coupling and no collateral shared-test edits.
  - learn: Hunk-level diff review is the appropriate protection when the file itself can no longer remain byte-identical.
  - architecture: Generic brief construction remains the sole production change; Claude runtime implementation and timing semantics remain protected.
  - avoid: Do not broad-format, rename unrelated helpers, modify timeout constants, or use whole-file restore/replacement.
  - verify: `bun test tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts && ! grep -nE 'withSddParticipants|sddParticipants|continue participant work in Pi' ein-pi/agent/lib/continuity-resume-brief.ts && ! grep -nE 'withSddParticipants|continue participant work in Pi' tests/claude-continuity-runtime.test.ts && git diff --check -- ein-pi/agent/lib/continuity-resume-brief.ts tests/continuity-resume-brief.test.ts tests/claude-continuity-runtime.test.ts`

## // 008A. Recover the final closed-world participant handler contract

Production files (apply touches): none.

Test files (apply touches): `tests/subagent-envelope-contract.test.ts` only.

- [x] 8.5 RED — reproduce the existing focused T2 failure showing that the participant-specific expected direct handler still names removed `completeSddParticipantCall` instead of live private `recognizePiParticipantTerminal`.
  - skills: `ein-discipline`, `architecture`
  - why: The already-observed focused failure is the authorized strict-TDD RED for this final one-file recovery.
  - learn: A stale source-contract expectation should fail on the exact ownership mismatch before its smallest assertion-level repair.
  - architecture: T2 observes the private Pi function that directly consumes terminal `event.details`; production recognition, coordinator completion, and inventory ownership remain unchanged.
  - avoid: Do not edit any file during RED, broaden the failure, or treat a different test failure as valid evidence.
  - verify: `! bun test tests/subagent-envelope-contract.test.ts --test-name-pattern 'T2'`

- [x] 8.6 GREEN — update only T2's participant-specific expected handler inventory/name from `completeSddParticipantCall` to `recognizePiParticipantTerminal` in `tests/subagent-envelope-contract.test.ts`.
  - skills: `ein-discipline`, `architecture`
  - why: The direct closed-world consumer contract must follow the current private Pi recognition edge without widening the authorized test-only boundary.
  - learn: A downstream coordinator transition is not the same contract seam as the handler that directly recognizes an envelope.
  - architecture: Keep `recognizePiParticipantTerminal` private and leave production exports, `ENVELOPE_CONSUMER_INVENTORY`, detector logic, and coordinator behavior untouched.
  - avoid: Do not edit production, export the recognizer, remove `completeSddParticipantCall` from its real downstream role, change inventory cardinality, or weaken closed-world detection.
  - verify: `bun test tests/subagent-envelope-contract.test.ts --test-name-pattern 'T2'`

- [x] 8.7 TRIANGULATE/REFACTOR — rerun the entire envelope contract file and inspect the one-file diff, retaining T1, the fictitious-consumer RED guard, T3, all unrelated consumer identities, and closed-world inventory cardinality unchanged.
  - skills: `ein-discipline`, `architecture`
  - why: Full-file evidence must prove the one-name repair did not make the detector permissive or disturb unrelated envelope contracts.
  - learn: For a closed-world contract, triangulation means preserving both known-consumer equality and rejection of an undeclared extra consumer.
  - architecture: The test remains a source-contract observer; no production surface, shared inventory, detector, or audit boundary moves during refactor.
  - avoid: Do not reorder or delete unrelated assertions, replace exact equality with subset matching, reduce expected cardinality, broad-format the file, or add compatibility aliases.
  - verify: `bun test tests/subagent-envelope-contract.test.ts && git diff --check -- tests/subagent-envelope-contract.test.ts && git diff --no-ext-diff -U3 -- tests/subagent-envelope-contract.test.ts`

## // 009. Re-run the blocked final verification with corrected protection evidence

Production files (apply touches): none.

Test files (apply touches): none. This group executes verification and records evidence only.

- [x] 9.1 After recovery group 008A completes, re-run focused recovery and protected adjacent regressions, the full Bun suite, root and installer typechecks, deletion scans, still-protected hashes, and focused behavioral/hunk proof for the authorized Claude test edit.
  - skills: `ein-discipline`, `bun`
  - why: The superseded 6.4 gate must be rerun after recovery while recognizing that one formerly hash-protected test now has an authorized narrow edit.
  - learn: Immutable hashes remain useful for untouched files; an intentionally edited shared file needs focused diff review plus its complete behavioral suite instead.
  - architecture: `continuity-checkpoint-store.ts`, `cc-ein/continuity-runner.ts`, and `tests/installer-backup.test.ts` remain byte-protected; Claude runtime behavior is protected by its full suite and hunk-level review.
  - avoid: Do not regenerate the original hash manifest, require the old full-file Claude test hash, repair unrelated failures, install dependencies, or pre-decide PR splitting.
  - verify: `bun test tests/continuity-handoff-lifecycle.test.ts tests/continuity-resume-brief.test.ts && bun test tests/claude-continuity-runtime.test.ts tests/installer-backup.test.ts && bun test && bun run typecheck && (cd installer && bun run typecheck) && grep -E ' (ein-pi/agent/lib/continuity-checkpoint-store\.ts|cc-ein/continuity-runner\.ts|tests/installer-backup\.test\.ts)$' /tmp/fix-cleaner-participant-slicing.protected.sha256 > /tmp/fix-cleaner-participant-slicing.still-protected.sha256 && test "$(wc -l < /tmp/fix-cleaner-participant-slicing.still-protected.sha256 | tr -d ' ')" -eq 3 && shasum -a 256 -c /tmp/fix-cleaner-participant-slicing.still-protected.sha256 && git diff --no-ext-diff -U3 -- tests/claude-continuity-runtime.test.ts > /tmp/fix-cleaner-participant-slicing.claude-test-hunks.patch && test -s /tmp/fix-cleaner-participant-slicing.claude-test-hunks.patch && test ! -e ein-pi/agent/lib/pi-sdd-participant-receipt.ts && test ! -e tests/pi-sdd-participant-receipt.test.ts && test ! -e tests/fixtures/pi-sdd-participant-foreground.json && ! grep -R -nE 'pi-sdd-participant-receipt|runtime/sdd-participants' ein-pi/agent/extensions/ein-ai.ts ein-pi/agent/lib/sdd-participants.ts tests/agent-tools-contract.test.ts tests/sdd-participants.test.ts && ! grep -nE 'withSddParticipants|checkpoint\.sddParticipants' ein-pi/agent/lib/continuity-handoff-lifecycle.ts && ! grep -nE 'withSddParticipants|sddParticipants|continue participant work in Pi' ein-pi/agent/lib/continuity-resume-brief.ts && ! grep -nE 'withSddParticipants|continue participant work in Pi' tests/claude-continuity-runtime.test.ts && git diff --check`

## // 010. Remediate deleted changed-file planning at the Cleaner selector seam

Production files (apply touches): `ein-pi/agent/lib/sdd-participants.ts`.

Test files (apply touches): `tests/sdd-participants.test.ts`.

- [x] 10.1 RED — add a coordinator integration contract with one tracked file intentionally deleted after apply and at least one inspectable changed file; require a non-throwing whole-run `unavailable` plan whose blocker names the deleted path and concrete missing-path reason, whose slices retain every inspectable path exactly once, and whose `next` participant is absent.
  - skills: `ein-discipline`, `architecture`
  - why: The observed participant gate currently collapses the deleted receipt-module path into a generic scope failure instead of the designed path-bound impossible-file outcome.
  - learn: A deletion is still part of changed scope, but it is evidence of non-inspectability—not a valid Cleaner file selector.
  - architecture: Exercise `planSddParticipants` as the integration seam; keep scope parsing, inspectability classification, deterministic planning, and advisory outcome policy inside the existing participant module.
  - avoid: Do not resurrect the deleted file, add a compatibility receipt, mock Cleaner acceptance, weaken the assertion to any `unavailable`, or edit Cleaner audit internals.
  - verify: `! bun test tests/sdd-participants.test.ts --test-name-pattern 'deleted changed-file'`

- [x] 10.2 GREEN — in `sdd-participants.ts`, classify a declared path that cannot be inspected because it is missing as a path-bound planning blocker before Cleaner contract validation; retain the complete canonical declared scope identity, pass only sealed inspectable files into slice selectors, and return the existing whole-run advisory `unavailable` result with path/reason.
  - skills: `ein-discipline`, `architecture`
  - why: Missing changed paths must be represented honestly without being offered to `collectCleanerAuditEvidence` or escaping as a hard orchestration exception.
  - learn: Separate “declared changed scope” from “inspectable Cleaner input”; the blocker accounts for the former while slices account exactly once for the latter.
  - architecture: Keep the fix local to changed-scope sealing and the existing `SddPlanningBlocker`/slice planner; preserve symlink, restricted, noncanonical, non-regular, authority-drift, and fail-closed checks.
  - avoid: Do not filter the deleted path silently, catch every validation error as a deletion, add a new store/status/provider abstraction, raise limits, or send the absent path to Cleaner audit.
  - verify: `bun test tests/sdd-participants.test.ts --test-name-pattern 'deleted changed-file'`

- [x] 10.3 TRIANGULATE — cover deleted paths before, between, and after inspectable canonical paths, including more than `maxFiles` inspectable files, and assert that slices remain lexical, contiguous, exact-once, and within both `maxFiles=32` and `maxSourceBytes=128 KiB` while each deleted path appears exactly once in path-bound unavailable evidence and never in a slice.
  - skills: `ein-discipline`, `architecture`
  - why: Mixed deleted/existing scope must not shift slice boundaries, lose inspectable coverage, duplicate blockers, or weaken either explicit Cleaner limit.
  - learn: Exact-once accounting spans two disjoint sets: inspectable paths in slices and impossible paths in blockers.
  - architecture: Reuse the existing fixture and public plan result; preserve pure deterministic planning and avoid exposing private sealing state.
  - avoid: Do not snapshot private arrays, relax canonical ordering, test only the single-file deletion case, or replace the existing byte-boundary coverage.
  - verify: `bun test tests/sdd-participants.test.ts`

- [x] 10.4 REFACTOR — simplify only the new missing-path classification and focused fixtures after GREEN, preserving full declared-scope identity, inspectable slice identities, source-seal behavior, all explicit Cleaner audit limits, and the existing oversized/non-UTF-8/scope-rejection outcomes.
  - skills: `ein-discipline`, `architecture`
  - why: The remediation should finish as a local distinction at the current seam, not grow a second planner or compatibility model.
  - learn: Refactoring is complete when the path provenance remains visible and the existing planner owns all batching invariants.
  - architecture: Production ownership remains one deterministic participant module; `cleaner-audit-evidence.ts`, Pi wiring, routing, continuity, and deleted receipt surfaces remain untouched.
  - avoid: Do not broaden source APIs, rename unrelated coordinator contracts, recreate deleted artifacts, broad-format files, or alter advisory/non-gating routing.
  - verify: `bun test tests/sdd-participants.test.ts tests/cleaner-audit-evidence.test.ts && bun run typecheck && git diff --check -- ein-pi/agent/lib/sdd-participants.ts tests/sdd-participants.test.ts`

Post-apply parent handoff (not an apply checklist item; evidence not yet observed): once apply is complete, the parent invokes registered `ein_sdd_participants({"change":"fix-cleaner-participant-slicing"})` in a refreshed runtime. The expected evidence is a whole-run `unavailable` result, no Cleaner/Architect participant task, and a path-bound blocker naming `ein-pi/agent/lib/pi-sdd-participant-receipt.ts` with its concrete missing-path reason. The parent then follows normal advisory, non-gating routing; this outcome does not block mechanical verify eligibility.
