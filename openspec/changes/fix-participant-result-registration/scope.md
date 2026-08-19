# Scope: fix-participant-result-registration

**Change**: fix-participant-result-registration  
**Issue ID**: fix-participant-result-registration  
**Lane**: micro (skips map, tasks; design, verify, close remain hard gates)  
**TDD**: strict (RED → GREEN → TRIANGULATE → REFACTOR; record evidence in apply-progress.md)  
**Artifact language**: Spanish (default)

---

## // 001. PROBLEM STATEMENT

Release 0.72.0 fixed the participant-passage self-invalidation (Cleaner was now admitted). The fix works: in live logs, the passage seal is `sdd-scope-v1:` and `ein-cleaner` is admitted, executes, and returns `status: complete`. What remains broken is the result registration that follows.

### Failure A (critical — blocks the flow today)

**The participant result is never registered** when the Cleaner completes.

Root cause chain:

1. **Bifurcated invocation path**: With modern pi-subagents, the Cleaner is not invoked with a single `tool_call`. It is:
   - Launched with `subagent` (returns a run handle: "Run fan-out: 0/64 used")
   - Actual result arrives later via `subagent_wait` ("Outcome: 1 complete")

2. **Filter rejects both arrivals**:
   - **Line `ein-ai.ts:911`**: `if (event.toolName !== "subagent") return undefined;`
   - At launch: `tool_result` event arrives with `toolName === "subagent"`. Handler calls `completeSddParticipantCall()` with the handle text, which contains no `status:` → guard `statuses.length !== 1` discards it AND already deleted `callPassages.delete(toolCallId)` + `running.delete(...)`.
   - At result arrival: `tool_result` event arrives with `toolName === "subagent_wait"` and is rejected before the handler is ever called — no code path handles `subagent_wait` anywhere in `ein-pi/agent`.

3. **Observable symptom**: Live logs show Cleaner audited three times with `status: complete`; `ein_sdd_participants` returned the same pending passage each time. Infinite loop; `sdd-verify` unreachable.

4. **Missing canary**: `ein-ai.ts:837–839` already has a drift canary for the ADMISSION step (`"es lo que pasó al mover la ejecución a workflowScript"`). No equivalent exists on the RESULT-COLLECTION side. That is part of the failure.

**Evidence references**:
- `ein-ai.ts:911` — filter rejects `subagent_wait`
- `ein-ai.ts:837–839` — existing admission canary (no collection equivalent)
- Grep result: `subagent_wait` does not appear anywhere in `ein-pi/agent/` (verified: no occurrences)

### Failure B (high — user impact: operator action has no effect)

**Disabling the Cleaner does not free an already-issued passage.**

Root cause:

- **File**: `ein-pi/agent/lib/sdd-participants.ts`, function `passage()` (line 66–80)
- **When `order` is recalculated**: Only when the checkpoint is re-minted — i.e., when `change`, `applyId`, `scopeId`, or the seal changes (line 76–78).
- **How it is read**: `planSddParticipants` reads `value.order` from the persisted checkpoint, never recalculates it in-flight.
- **Observable symptom**: User runs `/ein:cleaner off`; the passage still demands `ein-cleaner`, because `order` is frozen at the moment of passage issuance. No way to exit.

**Design constraint (do not solve, signal as a restriction)**:

- `participantId()` includes `order` in its hash (line 63: `{ change, applyId, scopeId, beforeStateRef, order }`).
- Recalculating `order` **changes the `passageId`**, which would:
  - Break idempotence within the same passage (same passage ID should mean same participants).
  - Risk dropping evidence already registered under the old passage ID.
- **Decision to record in design**: How to free a disabled participant WITHOUT losing prior registrations under the old passage ID and WITHOUT breaking idempotence. Likely requires a transitional state or a two-phase release; scope is not to implement, only to acknowledge the tradeoff.

### Failure C (minor — one-line prompt clarification)

**The SDD close agent (Claude) produces `summary.md` but refuses to write it.**

Context:

- `sdd-close` in Claude produced `summary.md` content but declined to write it, citing a policy against creating `.md` files on the agent's own initiative.
- Root cause: **Not an Ein guardrail**. The only `PreToolUse` hook in the adapter (`cc-ein/sync.ts:526`) matches `Bash` only; nothing intercepts `Write`. The agent prompt already declares `summary.md` as the primary output with the tool granted.
- This is the base Claude Code policy against proactive markdown generation.

**Authorized fix (one line)**: Amend `ein-pi/core/agents/sdd-close.md` to explicitly state that writing `summary.md` is an EXPLICITLY REQUESTED task by the SDD workflow, not proactive documentation. The amendment will be reflected in the generated Claude adapter prompt.

**Evidence**:
- `ein-pi/core/agents/sdd-close.md:18` declares `summary.md` as "Your primary output"
- `cc-ein/sync.ts:526` confirms only Bash is intercepted, not Write

---

## // 002. SCOPE BOUNDARIES

### In scope (to fix)

- **Fix A**: Capture and correctly register results from `subagent_wait` events (line `ein-ai.ts:911` and result-collection logic). Add a canary drift detector on the result-collection side (parallel to the existing admission canary).
- **Fix B**: Design how to release a participant that was disabled after passage issuance, accounting for `participantId()` hash change and idempotence. Likely outcome: defer to a design decision (acknowledge the tradeoff but do not implement liberation in this change).
- **Fix C**: One-line amendment to `sdd-close.md` declaring that `summary.md` is an explicitly requested workflow output.

### Out of scope (explicitly denied by directive)

- Rewrite pi-subagents invocation model (outside Ein scope, owned by pi-agents).
- Modify passage seals or the 0.72.0 passage self-invalidation fix (already correct).
- Address the `fresh` → `stale` degradation (known risk declared in prior change, separate backlog item).
- Changes to Claude Code's base harness or `PreToolUse` hook system.

---

## // 003. ACCEPTANCE CRITERIA

### Criteria for Fix A (critical)

1. **Capture**: `subagent_wait` events are passed to a result handler, not silently discarded.
2. **Extract status**: The handler extracts `status:` from the arrival event (not the launch event). If no status is found, it is logged as a drift condition (not an error; mirrors existing canary at line 837).
3. **Registration**: Once extracted, `completeSddParticipantCall()` is invoked with the actual status text, and the passage is advanced.
4. **Idempotence**: Running the same Cleaner result twice does not double-register the passage.
5. **Verification**: Live test or log shows `ein_sdd_participants` reports the passage as complete after the Cleaner's real result arrives.

### Criteria for Fix B (high)

1. **Analysis**: Design document (in `design.md`) identifies the hash-change risk and idempotence constraint.
2. **Decision**: Explicit choice recorded: either (a) defer liberation to a follow-up, or (b) implement a transitional-state approach. If (a), must include a backlog ticket/note. If (b), must include the tradeoff and how idempotence is preserved.
3. **Code**: If implemented, passage liberation does not silently drop prior registrations or break within-passage idempotence.

### Criteria for Fix C (minor)

1. **Prompt amendment**: `sdd-close.md` line 18 (or nearby) is amended to explicitly state that writing `summary.md` is a workflow-requested task (not proactive documentation).
2. **Effect**: The generated Claude Code adapter prompt now includes this clarification, so the agent no longer refuses to write `summary.md`.
3. **Verification**: A dry run of `sdd-close` with Claude writes `summary.md` without refusal.

---

## // 004. TESTING STRATEGY (Strict TDD)

### Test runner and configuration

- **Runner**: `bun test`
- **Typecheck**: `tsc --noEmit` (root, covers ein-pi and cc-ein)
- **Test files**: `tests/` directory (94 test files, all passing in current run)
- **Existing coverage**: Unit, integration, and E2E tests present; no selective skip for this change.

### RED phase (failing tests, before fix)

1. **For Fix A**: Write a test that simulates `subagent_wait` arrival and verifies the passage is advanced. This test must fail before the fix (the handler is never called because the filter rejects it).
2. **For Fix B**: Write a test that emits a passage with `order: ["ein-cleaner", "ein-architect"]`, then disables the cleaner and re-checks the passage. Expected behavior is deferred to design decision (test may be a blocking assertion or a documentation comment).
3. **For Fix C**: No new test needed (this is a prompt clarification, not executable code). Verification is by inspection and manual agent run.

### GREEN phase (passing tests, after fix)

- Fix A: `subagent_wait` handler test passes; passage advances correctly.
- Fix B: Test either passes (if liberation is implemented) or is marked as blocked with a rationale (if deferred).
- Fix C: Dry run or log inspection shows `summary.md` is written by Claude without refusal.

### TRIANGULATE phase

- Verify no regression in existing participant flow (Cleaner admits, executes, returns `status: complete`, passage advances).
- Verify the drift canary on result collection works (logs a warning if `toolName` is neither `subagent` nor `subagent_wait`).

### REFACTOR phase

- Clean up any debug logging or scaffolding.
- Remove unused imports/variables in touched files.
- Ensure code comments explain *why* (bifurcated invocation model required special handling), not *what* (the code already shows that).

---

## // 005. MANIFEST AUTHORITY

**Source**: MANIFIESTO.md at repository root.  
**Endorsed patterns**:
- Strict TDD discipline applied to multi-path event handling (admission + result collection must be symmetric in observability).
- Drift canaries on both sides of a bifurcated invocation to catch shape changes.
- Design decisions (like idempotence vs. liberation tradeoff) recorded in design.md before implementation.

---

## // 006. PROJECT CONTEXT (OpenSpec Config)

- **Stack**: Node.js/TypeScript ESM (ein-installer)
- **Package manager**: Bun (bun.lock)
- **Test runner**: `bun test` (v1.3.14)
- **Typecheck**: `tsc --noEmit` at root
- **Test coverage**: 94 test files, all layers (unit, integration, E2E), all passing
- **Strict TDD**: ON (overrides config.yaml)
- **Lane**: micro (skips map, tasks; design, verify, close are hard gates)

---

## // 007. NEXT PHASE (SDD FLOW)

**Current phase**: scope (this document)  
**Next phase**: design  
**Reason**: Lane is micro; map and tasks are skipped. Design phase is the first implementation-facing phase after scope.

---

scope: Three bug fixes in SDD participant result registration: (A) capture `subagent_wait` events so Cleaner results are registered (critical); (B) design how to free a disabled participant without breaking idempotence (high, likely deferred); (C) add one-line clarification to sdd-close.md so Claude writes summary.md without refusal (minor).

budget_allocated:
  max_tokens: 18000
  max_reads: 35
  max_runtime_ms: 120000
