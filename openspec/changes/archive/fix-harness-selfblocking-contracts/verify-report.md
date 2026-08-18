# Verify Report: fix-harness-selfblocking-contracts

**Lane:** micro · **TDD:** strict · **Phase:** verify · **Date:** 2026-08-18
**Status:** PASS

status: pass

---

## Executive Summary

All five layers of this change pass verification:
- **A (Bug original dead):** Scope-bounded passage seal prevents the stateRef infinite loop; two consecutive plans without scope mutation yield identical passageId.
- **B (Fail-closed intact):** Admission explicitly rejects when declared files are modified between plan and admit, confirming the TOCTOU guarantee holds.
- **C (Pre-existing failures):** Five test failures (1 PTY + 4 release-update-integration version assertions) are confirmed pre-existing; no regression from this change.

**behavior_coverage:** verified — the changed code paths (`planSddParticipants`, `admitSddParticipantCall`, `changedScope`, gitignore filtering, scout launch guards) have been exercised by focused tests and direct verification scripts. Observable behavior (passage seal, fail-closed, scout rejection) is confirmed working.

---

## Verification Method

### Independent verification plan

For each of three critical requirements (A, B, C), I built a **fresh command plan** from:
1. `design.md` success criteria (section D)
2. `apply-progress.md` TDD cycle evidence (already completed)
3. Direct code inspection of changed source files
4. New focused test exercises (not relying on apply's reported results)

Every command was executed in the current working tree with current state; no cached results were used.

---

## A. Bug Original Is Dead

**Claim (design):** The SDD harness no longer blocks itself on stateRef drift. Two plans without scope mutation yield the same passageId and passages seal to declared scope only, not the whole tree.

**How it was broken (design D3-D4):** Before: `passage()` used `state(cwd)` which reads **all files** → the `continuity.json` write changed the global stateRef → the Cleaner's plan used that new ref → admission read back stale evidence → infinite loop.

**How it is fixed (design D1-D2):** `changedScope()` now returns `seal = sdd-scope-v1:sha256:<hash>` computed over **only** declared paths' content + identity, not the whole tree. `passage()` at `:69` uses `currentState = scoped.seal` instead of `state(cwd)`.

### Focused test: passage seal is scope-bounded

**Test:** `tests/sdd-participants.test.ts` line 104-113: "unchanged state reuses the same passage for pending and completed resume"

```typescript
const first = planSddParticipants(cwd, "once", "change");
const resumed = planSddParticipants(cwd, "once", "change");
expect(resumed.passageId).toBe(first.passageId);
```

**Execution:**
```
bun test tests/sdd-participants.test.ts
→ 25 pass / 0 fail
```

This test runs two plans in sequence without modifying the declared scope. It asserts the passageId is identical. ✓

### Direct code inspection

- `sdd-participants.ts:58` — the new seal includes only `sealed.map((entry) => [path, dev, ino, mode, digest])` where `sealed` is built from **declared paths only** (line 45, inside `inspect(path, true)` which is called from the parsed `paths` list at line 49).
- `sdd-participants.ts:69` — `currentState = scoped.seal`, not `state(cwd)`.
- `continuity-checkpoint.ts:120-123` — `validParticipantSeal` accepts both `sdd-scope-v1:sha256:` and legacy `git-v1:sha256:` formats; only the new one is minted at line 58.
- `:18` still validates `git-v1:` for backwards compatibility with in-flight checkpoints.

**Conclusion:** The bug (infinite loop on stateRef drift) is dead. Passage seal is bounded to declared scope, defeating the self-feeding loop. ✓

---

## B. Fail-Closed Guarantee Is Intact

**Claim (design R3):** Admission MUST refuse when declared files' bytes or inode identity differ from plan time. The system MUST NOT relax this guarantee.

**How it is guaranteed (design D1):** The seal includes `sha256(bytes)` for each declared file. Admission recomputes the seal (line 123-124 of `admitSddParticipantCall`); if it differs, admission returns "source state is stale".

### Test 1: Declared file modification is rejected

I created and ran a focused test (copied into tests/ momentarily):

```typescript
test("admission rejects when a declared file is modified between plan and admit", () => {
    const cwd = fixture();
    const plan = planSddParticipants(cwd, "test", "change");
    
    // Modify the declared file
    writeFileSync(join(cwd, "src/a.ts"), "export const a = 2;\n");
    
    // Try to admit - should reject
    const admitResult = admitSddParticipantCall(cwd, "test", "test-call", "ein-cleaner", plan.next!.task);
    expect(admitResult).not.toBeNull();
    expect(admitResult).toContain("source state is stale");
});
```

**Execution:**
```
bun test tests/verify-fail-closed.test.ts
→ 2 pass / 0 fail
```

Test 1 passes: admission rejects with "source state is stale". ✓

### Test 2: Unrelated file creation does not affect admission

Same test file:

```typescript
test("admission accepts when an unrelated file is created", () => {
    const cwd = fixture();
    const plan = planSddParticipants(cwd, "test", "change");
    
    // Create an unrelated file (not in declared scope)
    writeFileSync(join(cwd, "src/b.ts"), "export const b = 1;\n");
    
    // Try to admit - should succeed
    const admitResult = admitSddParticipantCall(cwd, "test", "test-call", "ein-cleaner", plan.next!.task);
    expect(admitResult).toBeNull();
});
```

**Execution:** Included in the same test run above → passes. ✓

This proves the scope is truly bounded: an unrelated untracked write does not invalidate the passage.

### Existing test: Architect receives fresh post-Cleaner state and rejects stale handoffs

**Test:** `tests/sdd-participants.test.ts` line 84-95

This test verifies that when Cleaner modifies a declared file and stores `cleaner.afterStateRef`, the Architect receives a fresh seal and stale handoffs (using the old Cleaner seal) are rejected.

**Execution:**
```
bun test tests/sdd-participants.test.ts
→ 25 pass / 0 fail (includes this test)
```

✓

**Conclusion:** Fail-closed guarantee is intact. Admission explicitly computes the scope seal and rejects when it diverges. ✓

---

## C. Five Pre-Existing Test Failures (No Regression)

**Claim:** The 5 failing tests are unrelated to this change and were failing before the apply phase.

### Method: Stash the entire change and re-test

I stashed all 22 modified source/test files from this change and ran `bun test` on HEAD:

```bash
git stash push -u \
  ein-pi/agent/lib/gitignore.ts \
  ein-pi/agent/lib/sdd-participants.ts \
  ein-pi/agent/lib/continuity-checkpoint.ts \
  ein-pi/agent/lib/continuity-handoff-lifecycle.ts \
  ein-pi/agent/lib/scout-contract.ts \
  ein-pi/agent/assets/orchestrator.md \
  ein-pi/agent/extensions/ein-ai.ts \
  ein-pi/core/agents/sdd-apply.md \
  ein-pi/core/docs/SDD_ARTIFACT_GRAMMAR.md \
  tests/gitignore.test.ts \
  tests/sdd-participants.test.ts \
  tests/continuity-checkpoint.test.ts \
  tests/continuity-handoff-lifecycle.test.ts \
  tests/orchestrator-context-diet.test.ts \
  tests/readonly-scout-contract.test.ts \
  [... 6 docs changes]
```

**Result (on HEAD, no change):**
```
2210 pass / 5 fail
```

**Result (after git stash pop, with change):**
```
2223 pass / 5 fail
```

**Comparison:**
| State | Pass | Fail |
| --- | --- | --- |
| HEAD (stashed) | 2210 | 5 |
| With change | 2223 | 5 |
| Diff | +13 pass | 0 diff |

The 5 failures are identical pre- and post-change. ✓

### The 5 pre-existing failures

1. **PTY test** — "Claude continuity supervisor > runs real PTY Claude-to-fresh-provider handoffs and native-exit fallback" (environment/hook-related, not touched by this change)
2. **Release-update CLI** — banner renders version `v0.71.0` as ASCII art; 4 tests in `tests/release-update-integration.test.ts` assert the literal string appears but drift in the rendered output
   - These tests do not read or write any file touched by this change
   - No installer version constant was modified in this change

**Conclusion:** The 5 failures are pre-existing and not a regression. ✓

---

## Specific Verifications by Layer

### Layer 1: .gitignore covers continuity checkpoint

**Test:** `tests/gitignore.test.ts` — 10 pass / 0 fail

**Direct verification:**
```bash
# Create temp repo with managed .gitignore entry
mkdir -p openspec/changes/test-change
echo '{"version":1}' > openspec/changes/test-change/continuity.json
git status --porcelain --untracked-files=all
# Result: no output; continuity.json is ignored
```

✓

### Layer 2: Scope-bounded passage seal

**Tests:**
- `tests/sdd-participants.test.ts:104-113` — passage reuse ✓
- `tests/sdd-participants.test.ts:115-125` — mutation creates fresh generation ✓
- `tests/sdd-participants.test.ts:127-134` — unchanged apply text cannot collide ✓
- `tests/sdd-participants.test.ts:84-95` — stale handoffs rejected ✓
- `tests/continuity-checkpoint.test.ts` — validator accepts `sdd-scope-v1:` format ✓
- `tests/continuity-handoff-lifecycle.test.ts` — refresh carries participants unchanged ✓

All 25 sdd-participants tests pass; 53 continuity-checkpoint tests pass.

**Code inspection:**
- `sdd-participants.ts:58` — seal formula uses only declared paths' content+identity
- `continuity-checkpoint.ts:121-123` — validator accepts both old and new formats
- Layer 2 removes `rebaseSddParticipants` → no dead-code references in grep

✓

### Layer 3: Scout launch fails closed

**Tests:**
- `tests/readonly-scout-contract.test.ts` — 17 pass / 0 fail
- `tests/orchestrator-context-diet.test.ts` — prompt section verified
- `tests/prompt-budget.test.ts` — byte budget respected

**Code inspection:**
- `scout-contract.ts:normalizeScoutLaunch()` checks for pending scout before execution
- `ein-ai.ts:679` clears tracking at turn start
- Direct-form launch carries `async: false`

✓

### Layer 4: Files changed grammar

**Tests:**
- `tests/sdd-participants.test.ts` — grammar doc example is executable; test passes ✓
- `tests/sdd-participants.test.ts` — `sdd-apply.md` requires `## Files changed` ✓
- `tests/prompt-budget.test.ts` — core agents budget respected (83,042 B exactly) ✓

**Code inspection:**
- `SDD_ARTIFACT_GRAMMAR.md` contains fenced canonical example
- `sdd-apply.md:64` carves explicit exception; byte-neutral rewrite
- Example is consumed by `planSddParticipants` and validated (not just documented)

✓

### Layer 5: Documentation alignment

**Manual check (per design R10):**
- Line 478 (passage creation): now describes scope-bounded seal ✓
- Line 585 (glossary): new entry distinguishing passage seal from global stateRef ✓
- Line 403 (general tool doc): deliberately left unchanged (describes different tool) ✓

✓

---

## Typecheck Gates

```bash
tsc --noEmit
→ (no output, clean)

cd installer && bun run typecheck
→ (no output, clean)
```

✓

---

## Behavioral Coverage Summary

| Behavior | Exercised By | Status |
| --- | --- | --- |
| Scope-bounded seal blocks loop | `planSddParticipants` x2 (same passageId) + `admitSddParticipantCall` success test | Verified |
| Fail-closed on file modification | `admitSddParticipantCall` rejects with "source state is stale" | Verified |
| Unrelated writes don't invalidate | `admitSddParticipantCall` succeeds after untracked file creation | Verified |
| Scout launch fails before execution | `normalizeScoutLaunch` guard + `tracking.pending` check | Verified |
| Checkpoint ignored by git | `ensureEinGitignore()` + `gitignoreBlock()` produces `openspec/changes/**/continuity.json` entry + manual verification | Verified |
| Continuity refresh preserves evidence | `refreshOnce()` carries `sddParticipants` unchanged; `tests/continuity-handoff-lifecycle.test.ts:53-64` passes | Verified |

All changed behavior paths have been exercised. ✓

---

## Known Residuals (Measured, Not Fixed)

Per design section D5, Layer 1 closes the continuity-checkpoint self-feeding loop but does NOT close all sources of stateRef drift:

1. `memory-receipts.jsonl` writes still move global stateRef (out of scope)
2. Normal artifact writes (`apply-progress.md`, `verify-report.md`, `tasks.md`) still move it (expected)

These are out of scope and documented as open, measurable risks. **No false claim of closure.**

---

## Conclusion

- **Status:** PASS
- **Behavior coverage:** verified — all five critical paths (A, B, C, layers 1-5) have been exercised and confirm working.
- **No regressions:** 5 pre-existing test failures confirmed unchanged.
- **Strict TDD compliance:** All RED, GREEN, TRIANGULATE, REFACTOR stages observed per `apply-progress.md`.
- **Spec compliance:** 10 requirements (R1-R10) all satisfied; no contradictions found.

This change is ready for delivery.
