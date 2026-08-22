# Scope: fix-cleaner-participant-slicing

**Change:** `fix-cleaner-participant-slicing`  
**Phase:** scope  
**Lane:** standard  
**TDD:** strict (change preflight and project default)  
**Scope status:** ready

## Problem statement

Automatic SDD participant coordination has grown into a continuity-backed workflow with durable generations, attempts, receipts, recovery, and verification gates. Replace that machinery with a same-session, ephemeral advisory run while preserving deterministic Cleaner slicing, foreground Cleaner-before-Architect execution, explicit participant tools, honest outcomes, and source-seal freshness behavior.

The working tree contains participant edits alongside active continuity IPC timeout and installer backup changes. This change must reconcile only participant-owned behavior and preserve adjacent work without whole-file restoration or broad cleanup.

Apply group 6.4 exposed obsolete generic continuity consumers that still persist or render the intentionally deleted participant checkpoint fields. The user explicitly authorized this bounded scope correction so those stale consumers and their focused tests can be repaired without restoring participant persistence.

The final group 009 verification exposed one remaining stale test-only participant handler contract. The user explicitly authorized a final one-file expansion limited to `tests/subagent-envelope-contract.test.ts`: replace its removed `completeSddParticipantCall` expectation with the live private Pi edge `recognizePiParticipantTerminal`, without changing production or unrelated envelope assertions.

## Bounded scope

- Remove automatic participant state from `continuity.json`, including generations, admissions, attempts, receipts, orphan recovery, blocked-passage recovery, and participant checkpoint writes.
- Remove dedicated durable participant receipt machinery and file-only participant artifact normalization where they exist solely to support continuity-backed automatic coordination.
- Derive a fresh participant plan from the current changed-file scope when an eligible same-session advisory run starts. A later session safely starts again from the first Cleaner slice rather than resuming durable progress.
- Deterministically assign every changed file exactly once to ordered Cleaner slices under the existing file-count and source-byte limits. Do not filter files or raise limits; report an impossible file as unavailable.
- Execute exactly one foreground participant child at a time. Complete all Cleaner slices in deterministic order before admitting Architect in that same advisory run.
- End the current advisory run honestly when a Cleaner result is blocked, failed, missing, stale, or unavailable. Do not fabricate completion and do not allow Architect to run after that terminal result.
- Recompute the source identity after Cleaner completes. Bind Architect to the fresh post-Cleaner identity and abandon stale advisory work if the source changes unexpectedly.
- Treat Cleaner source mutation as invalidating the prior source seal and prior verification freshness.
- Keep explicit Cleaner and Architect tools and their established audit contracts available independently of automatic advisory coordination.
- Remove participant-specific mechanical verify gates. Participant disabled, pending, blocked, stale, unavailable, interrupted, or complete states remain reportable advisory evidence and never prevent `sdd-verify` from running.
- Repair obsolete participant persistence consumers in `ein-pi/agent/lib/continuity-handoff-lifecycle.ts` and `ein-pi/agent/lib/continuity-resume-brief.ts`: generic refresh and handoff briefs must no longer import `withSddParticipants`, read `checkpoint.sddParticipants`, carry participant evidence through CAS retries, emit participant payload data, or add participant-pending bootstrap guidance.
- Update only the corresponding obsolete contracts in `tests/continuity-handoff-lifecycle.test.ts` and `tests/continuity-resume-brief.test.ts`; preserve their generic continuity hydration, refresh, readiness, framing, truncation, privacy, and CAS coverage.
- Update only stale participant-dependent assertions/import coupling in protected adjacent `tests/claude-continuity-runtime.test.ts`; preserve all Claude IPC transport inactivity, dispatched-response expiry, preparation timing, PTY handoff, termination, and fail-closed timing semantics.
- Update only the stale participant handler expectation in `tests/subagent-envelope-contract.test.ts` from removed `completeSddParticipantCall` coupling to the live private Pi edge `recognizePiParticipantTerminal`; preserve every unrelated subagent envelope assertion.

## Acceptance criteria

1. Automatic participant planning and execution neither requires nor creates `continuity.json`, and it does not mutate an existing continuity checkpoint.
2. No automatic participant generation, attempt, receipt, orphan, blocked-passage, or cross-session recovery state remains in the continuity contract.
3. Restarting the runtime or session causes an eligible advisory run to derive a fresh plan and restart from the first Cleaner slice.
4. The complete changed-file scope is deterministically partitioned exactly once across ordered Cleaner slices, and every slice respects the existing Cleaner file-count and source-byte limits.
5. An individually impossible file produces an honest unavailable advisory result without filtering the file, raising limits, or manufacturing progress.
6. Only one foreground participant child runs at a time, and Architect is not admitted until every Cleaner slice in that same run completes.
7. A blocked, failed, missing, stale, or unavailable Cleaner result terminates the advisory run without starting Architect and without blocking mechanical verify.
8. Architect binds to a freshly recomputed post-Cleaner source identity. Unexpected source drift abandons stale work rather than accepting it.
9. Cleaner mutation invalidates the previous source seal and prior verification freshness.
10. Explicit Cleaner and Architect tools remain available and preserve their audit behavior.
11. `sdd-verify` remains available regardless of automatic participant availability or outcome, while participant evidence is reported honestly.
12. Focused contracts cover no-continuity execution, session restart, deterministic multi-slice ordering, foreground Cleaner-to-Architect sequencing, impossible files, terminal advisory outcomes, source mutation/freshness invalidation, explicit tools, and non-gating verify.
13. Reconciliation preserves the adjacent continuity IPC timeout and installer real-tree backup changes.
14. Generic continuity lifecycle refresh and resume-brief generation compile and operate without participant checkpoint APIs or fields, while generic checkpoint CAS, hydration, readiness, framing, truncation, privacy, and handoff behavior remain unchanged.
15. The protected Claude continuity runtime contract no longer depends on participant-bearing resume-brief text, while its IPC timing, preparation, expiry, PTY handoff, termination, and fail-closed semantics remain unchanged.
16. `tests/subagent-envelope-contract.test.ts` expects terminal participant handling through the live private Pi edge `recognizePiParticipantTerminal`, no longer expects removed `completeSddParticipantCall` coupling, and preserves all unrelated envelope contracts.

## Non-goals

- Redesign Cleaner or Architect audit internals.
- Raise participant request, result, file-count, or source-byte limits.
- Add a replacement participant store, checkpoint schema, durable receipt, provider abstraction, or SDD phase.
- Change continuity IPC request/response transport, timeout semantics, or supervisor preparation behavior.
- Change installer backup manifests, filesystem traversal, recovery journals, retry behavior, or error propagation.
- Preserve compatibility with the removed durable automatic-participant workflow.
- Redesign generic continuity checkpoint storage, revision/CAS retry policy, lifecycle concurrency, resume-brief framing/budgets, readiness classification, or handoff transport.
- Change `ein-pi/agent/extensions/ein-ai.ts`, the private Pi terminal recognizer, coordinator behavior, or any unrelated subagent envelope contract as part of the final test-only expansion.
- Run tests, builds, typechecks, implementation, apply, or verify work during scope.

## Likely implementation boundary

Map must identify exact symbols before edits. Expected participant seams are the deterministic coordinator, Pi participant wiring, continuity checkpoint participant schema/validation, SDD preflight/router advisory behavior, participant-only receipt or normalization modules, and focused Bun contracts. The bounded correction additionally owns only stale participant references in `ein-pi/agent/lib/continuity-handoff-lifecycle.ts`, `ein-pi/agent/lib/continuity-resume-brief.ts`, `tests/continuity-handoff-lifecycle.test.ts`, `tests/continuity-resume-brief.test.ts`, and `tests/claude-continuity-runtime.test.ts`. The final expansion owns only the stale handler expectation hunk in `tests/subagent-envelope-contract.test.ts`; it owns no production file. Shared files require hunk-level ownership classification; this scope does not authorize blanket replacement.

## Adjacent active-change protection

- `fix-continuity-ipc-response-timeout` owns Claude continuity IPC response timing in `cc-ein/continuity-runner.ts` and timing-focused hunks of `tests/claude-continuity-runtime.test.ts`. This correction may remove only stale participant-dependent imports/assertions from that test; it must not alter transport deadlines, preparation-duration distinction, dispatched-response expiry, PTY handoff timing, or fail-closed timeout behavior.
- `fix-installer-backup-real-trees` owns installer backup manifest traversal, backup orchestration, install recovery/journal behavior, and focused installer tests. Participant work must not alter those files or semantics.
- Preserve unrelated dirty documentation and docs-site changes.
- `ein-pi/agent/lib/continuity-checkpoint-store.ts` and its generic revision/CAS behavior remain protected. Removing stale participant carry-forward logic from lifecycle consumers must not alter expectation selection, conflict retries, write ordering, or store result handling.
- Do not use whole-file checkout, restore, reset, generated replacement, or broad formatting on mixed files. Before editing, map must distinguish participant-owned hunks from adjacent active-change hunks; verification must include focused regressions for the shared continuity boundary.
- In `tests/subagent-envelope-contract.test.ts`, only the stale participant-handler expectation is authorized. Preserve all unrelated envelope assertions byte-for-byte where practical, and do not edit the live private handler in `ein-pi/agent/extensions/ein-ai.ts` or any other production file for this expansion.

## Constraints and project configuration

- `MANIFIESTO.md` remains authoritative: deterministic computation, honest uncertainty, advisory harness behavior, bounded reviewable changes, and minimal self-referential workflow machinery apply.
- Existing `openspec/config.yaml` was preserved. It records TypeScript ESM on Bun, `bun test`, strict TDD, tests under `tests/`, and installer typecheck configuration.
- `EIN.md` additionally requires root `bun run typecheck` and `cd installer && bun run typecheck`; those commands belong to later phases.
- The 400-production-line review workload guard applies before delivery. If the forecast exceeds it, the parent must obtain the user's single-PR versus split decision.
- No web access was used. No test, build, or typecheck command was run in this phase.

## Persisted-delta preflight

The complete persisted delta set was read through `readSpecDeltaDeclaration` and validated successfully with the strict OpenSpec delta parser. Rebuilding the parsed document through the same deterministic serializer produced byte-identical content, confirming the approved writer-generated form. The authoritative bytes were preserved without invoking `ein_openspec_delta_write`:

- `specs/sdd-participant-routing/spec.md` — 3,322 bytes — SHA-256 `dfb90c1403b7d5b183f5428958d4ab127cc7575dbada94eb5495a00e2538e65d` — 6 operations — canonical byte equality: true.

The validated delta declares ephemeral, continuity-independent participant state; deterministic Cleaner slicing; same-run Cleaner-before-Architect ordering; fresh post-Cleaner Architect binding; and advisory participant outcomes that do not gate verify. Because the persisted delta is the declaration, this scope contains no `spec_delta: none` block.

No canonical OpenSpec context paths were supplied, so no `openspec/specs/<domain>/spec.md` file was read, hashed, or referenced.

## Skill application

- `ein-discipline`: applied for the bounded SDD scope correction, strict-TDD recording, and hunk-level adjacent-change protection.
- `skill-registry`: skipped because no skill was installed, removed, moved, renamed, or re-indexed.
- `vitest`: skipped because this repository uses Bun test and this scope phase neither writes nor runs tests.
- `next`: skipped because the authorized expansion is a Bun contract test and contains no Next.js work.
- `vue-best-practices`: skipped because the authorized expansion contains no Vue files or behavior.
- `work-unit-commits`: skipped because this correction does not plan commits or delivery slicing.
- `nuxt-modules`: skipped because the change has no Nuxt module work.

## SCOPE PACKET

scope: Complete the removal of continuity-backed automatic SDD participant persistence by retaining the prior five-file stale-consumer correction and adding one final test-only contract repair in `tests/subagent-envelope-contract.test.ts`. Replace only its removed `completeSddParticipantCall` expectation with live private Pi edge `recognizePiParticipantTerminal`, preserving strict TDD, the standard lane, all production boundaries, generic continuity and Claude IPC behavior, installer behavior, unrelated envelope assertions, and unrelated dirty hunks.
budget_allocated:
  max_tokens: 20000
  max_reads: 30
  max_runtime_ms: 120000
