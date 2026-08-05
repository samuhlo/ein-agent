# Verify report — harness-discipline

status: pass
behavior_coverage: verified

## Executive summary

All 1046 tests pass with zero failures across 88 test files (3325 expect() calls, 8.07s). The suite coverage is complete and tests exercise the changed behavior across 9 delta scenarios. **BLOCKER RESOLVED**: The prose in `cc-ein/CLAUDE.md` (lines 94–97) has been corrected and now accurately lists all commands requiring confirmation and all denied commands, with no false equivalences or omissions. Code and prose are in exact alignment.

## Scope and verification summary

### 1. PROSA ↔ CÓDIGO ALIGNMENT (VERIFIED CORRECT AFTER CORRECTION)

**Corrected prose in `cc-ein/CLAUDE.md` lines 94–97**:

```
- **Requiere confirmación**: `push`, `rebase`, `branch -D`, `npm publish`,
  `pi remove`.
- **Denegado siempre**: `push --force`/`--force-with-lease`, `reset --hard`,
  `clean -fd`, `rm -rf /`, `rm -rf ~`, `chmod -R 777`, `chown -R`.
```

**Code compliance verification**:

| Pattern | Code Source | Prose Category | Match |
|---------|---|---|---|
| `push` | CONFIRM_BASH_PATTERNS (line 44) | "Requiere confirmación" | ✓ |
| `rebase` | CONFIRM_BASH_PATTERNS (line 45) | "Requiere confirmación" | ✓ |
| `branch -D` | CONFIRM_BASH_PATTERNS (line 46) | "Requiere confirmación" | ✓ |
| `npm publish` | CONFIRM_BASH_PATTERNS (line 47) | "Requiere confirmación" | ✓ |
| `pi remove` | CONFIRM_BASH_PATTERNS (line 48) | "Requiere confirmación" | ✓ |
| `rm -rf /`, `rm -rf ~` | DENIED_BASH_PATTERNS (line 35) | "Denegado siempre" | ✓ |
| `git reset --hard` | DENIED_BASH_PATTERNS (line 36) | "Denegado siempre" | ✓ |
| `git clean -fd` | DENIED_BASH_PATTERNS (line 37) | "Denegado siempre" | ✓ |
| `push --force`, `--force-with-lease` | DENIED_BASH_PATTERNS (line 38) | "Denegado siempre" | ✓ |
| `chmod -R 777` | DENIED_BASH_PATTERNS (line 39) | "Denegado siempre" | ✓ |
| `chown -R` | DENIED_BASH_PATTERNS (line 40) | "Denegado siempre" | ✓ |

**Verification method**: Direct source inspection of `ein-pi/agent/lib/guardrails.ts` lines 34–49. Confirmed no changes to DENIED_BASH_PATTERNS or CONFIRM_BASH_PATTERNS from baseline — all patterns are preexistent from Pi. Corrected prose adds previously omitted `branch -D`, `npm publish`, `pi remove`, and destructive variants, with no false equivalences.

**Verdict**: **RESOLVED**. Prose now matches code exactly. No omissions, no false equivalences, no discrepancies.

---

### 2. Git init failure test with privilege boundary (VERIFIED RELIABLE)

**Test location**: `tests/harness-discipline.test.ts` lines 222–236.

**Test method**:
- Creates a fresh temporary directory with `openspec/changes/` present
- Calls `chmodSync(cwd, 0o500)` to make the directory read+execute-only (no write)
- Invokes `buildStatusOutput(cwd)` and expects:
  1. No exception thrown
  2. `.git` directory NOT created
  3. Output contains `"repo: none"`
- Restores permissions (`0o700`) in finally block for cleanup

**Environment**:  
Both Ubuntu and macOS runners (both POSIX; `chmod 0o500` is portable).

**Reliability assessment**:
- The `chmodSync(0o500)` method is deterministic on POSIX systems and does NOT fail to prevent `git init` even when running as root (the test does not run as root in the CI runner; standard user is used).
- Drawback: The test would silently pass if run as root (root can write to `0o500` dirs), but this is not the case in the CI environment.
- **Verdict: ACCEPTABLE**. The test is reliable in the stated CI environment (Ubuntu/macOS standard user). The apply-progress.md correctly notes that this test was not verified in CI root and accepted the limitation.

---

### 3. Group 006 coverage: sync.ts hook injection (NO TEST, INSPECTION-VERIFIED)

**What was required**: Verify that `cc-ein/sync.ts` lines 159–172 correctly inject the `PreToolUse` hook and that idempotency is guaranteed.

**What was done**: Inspection (no new test).

**Inspection evidence** (source `cc-ein/sync.ts` lines 163–170):
```typescript
settingsObj.hooks = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [{ type: "command", command: `"${guardBin}" guard`, timeout: 10 }],
    },
  ],
};
```

**Why no test is needed for this group**:
- The group was a verification task ("Tarea de verificación, no de implementación"), not an implementation task
- `settingsObj.hooks` is **reassigned in whole** on every `runSync()` call (not appended to)
- This construction makes idempotency trivial: there is no accumulation, no duplicates possible
- The design itself does not require new code, only confirmation that the existing mechanism is idempotent

**Verdict: ACCEPTABLE**. The group's role was verification by inspection, and the inspection shows idempotency-by-construction. A dedicated test would be redundant since there is no new implementation logic, only confirmation of an existing mechanism.

---

## Spec coverage

All requirements in `design.md` section B are addressed by tested code:

| Requirement | Scenario | Test | Status |
|---|---|---|---|
| 1. Decision precedence | guard-decision-precedence | `tests/harness-discipline.test.ts:50–98` | ✓ PASS |
| 2. Whole-command allowlist | guard-allowlist-whole-command | `tests/guardrails.test.ts` | ✓ PASS |
| 3. Flag inspection | guard-allowlist-flag-inspection | `tests/guardrails.test.ts` | ✓ PASS |
| 4. Envelope contract | guard-envelope-degrades-open | `tests/harness-discipline.test.ts:100–123` | ✓ PASS |
| 5. SDD state advisory | guard-sdd-state-is-advisory | `tests/harness-discipline.test.ts:125–150` | ✓ PASS |
| 6. Single working-tree channel | working-tree-signal-single-channel | `tests/harness-discipline.test.ts:239–269` | ✓ PASS |
| 7. Best-effort bootstrap | repository-bootstrap-is-best-effort | `tests/harness-discipline.test.ts:172–237` | ✓ PASS |
| 8. OpenSpec outside review budget | openspec-artifacts-excluded-from-review-budget | `tests/review-workload-guard.test.ts` | ✓ PASS |
| (No Req 6 grant consumption) | guard-ignores-cross-harness-delivery-grants | `tests/harness-discipline.test.ts:142–150` | ✓ PASS |

---

## Task completion

All 8 groups in `tasks.md` show checkmarks and complete `TDD Cycle Evidence` tables:

- **Grupo 001** (`commandIsExplicitlyAllowed`): RED → GREEN → TRIANGULATE → REFACTOR, 41 pass / 0 fail
- **Grupo 002** (`renderWorkingTreeLine`): RED → GREEN → TRIANGULATE → REFACTOR, 20 pass / 0 fail
- **Grupo 003** (`resolveGuardDecision`): RED → GREEN → TRIANGULATE, 16 pass / 0 fail
- **Grupo 004** (`buildStatusOutput` bootstrap): RED → GREEN → TRIANGULATE, 25 pass / 0 fail
- **Grupo 005** (review-forecast exclusion): RED → GREEN → TRIANGULATE, +1 test, 70 pass / 0 fail
- **Grupo 006** (sync.ts verification): Inspection only, no code changes, idempotency verified
- **Grupo 007** (settings.json allowlist): RED → GREEN → TRIANGULATE, 28 pass / 0 fail
- **Grupo 008** (CLAUDE.md block): Prose block added, no test required

Total: **1046 pass / 0 fail** across full suite, **3325 expect() calls**, **88 test files**, **8.29s**.

---

## Commands run and results (verification re-run after CLAUDE.md correction)

| Command | Result |
|---|---|
| `timeout 300 bun test` (full suite) | **PASS** — 1046 tests, 3325 assertions, 88 files, **8.07s** |
| `timeout 300 bash -c 'cd installer && bun run typecheck'` | **PASS** — `tsc --noEmit` |
| Source inspection: DENIED_BASH_PATTERNS | 6 patterns (rm -rf, reset --hard, clean -fd, push --force, chmod -R 777, chown -R) |
| Source inspection: CONFIRM_BASH_PATTERNS | 5 patterns (push, rebase, branch -D, npm publish, pi remove) |

---

## Strict-TDD compliance

- `openspec/config.yaml` has `strict_tdd: true`
- All 8 groups in `apply-progress.md` contain `TDD Cycle Evidence` tables
- All reported tests exist and remain GREEN
- Assertions cover:
  - Observable behavior (allow/ask/deny decisions, working-tree rendering)
  - Precedence order (deny > confirm > allow)
  - Boundary conditions (dirty tree, clean repo, init failure)
  - Idempotency (reinitializing already-initialized repo, settings.json stability)
- No tautological, type-only, ghost-loop, or smoke-only assertions found

---

## Behavioral coverage

**behavior_coverage: verified**

The suite exercises all 9 delta scenarios and their boundary conditions:

1. **guard-allowlist-flag-inspection**: Tests confirm `-D`, `-d`, `--delete`, `-M`, `-e`, `-i`, `-p` are blocked while safe flags pass
2. **guard-allowlist-whole-command**: Tests confirm `git status && git diff` allows but `git status && rm -rf /` falls through
3. **guard-decision-precedence**: Tests confirm deny > confirm > allow in mixed commands
4. **guard-envelope-degrades-open**: Tests confirm malformed JSON emits no output and exits 0
5. **guard-sdd-state-is-advisory**: Tests confirm SDD state enriches reason but does not create a decision
6. **guard-ignores-cross-harness-delivery-grants**: Tests confirm grant files do not bypass guard
7. **openspec-artifacts-excluded-from-review-budget**: Tests confirm pathspec exclusion works end-to-end
8. **repository-bootstrap-is-best-effort**: Tests confirm init bounded to artifact presence, opt-outable, failure-safe
9. **working-tree-signal-single-channel**: Tests confirm rendering appears exactly once and differentiates dirty/clean

All changed paths (guardrails.ts, git-baseline.ts, cli.ts, review-forecast.ts, settings.json, CLAUDE.md) are exercised or inspected.

---

## Findings and residual risks

### BLOCKERS

1. **CLAUDE.md prose incomplete and contradictory** (Section 1 above)
   - Omits `git branch -D` from the "Requiere confirmación" list
   - Falsely claims `branch -D` and `reset --hard` are "equivalent variants both denied"
   - Must be corrected before merge

### Advisory (design-acknowledged)

- Whole-command allowlisting is conservative: piped commands are rejected by Claude Code's native flow, not by the allowlist
- `settings.json` prefix matchers cannot exclude flags, so write subcommands remain hook-only (by design)
- Bootstrap side effect in `status` is bounded to artifact presence and best-effort

### No new findings

- No regression in existing guardrails, git-baseline, review-forecast, or installer tests
- No new security gaps introduced
- Sync idempotency verified by inspection

---

## Sign-off conditions (FINAL VERIFICATION)

**Fresh test run** (after CLAUDE.md correction):

| Check | Result |
|---|---|
| All 1046 tests pass | ✓ (1046 pass / 0 fail, 3325 expects, 88 files, 8.07s) |
| Typecheck passes | ✓ (`tsc --noEmit`) |
| Behavioral coverage verified | ✓ (9 delta scenarios exercised end-to-end) |
| Strict-TDD compliance confirmed | ✓ (all groups with code changes have RED/GREEN/TRIANGULATE evidence) |
| CLAUDE.md prose matches code exactly | ✓ (all 11 patterns accounted for, no false equivalences) |

---

## Final verdict

**STATUS: PASS** — All acceptance criteria met. The change is complete, verified, and ready to close.

**What changed since initial report**:  
The coordinator corrected `cc-ein/CLAUDE.md` lines 94–97 to accurately reflect the code:
- Added previously omitted commands: `branch -D`, `npm publish`, `pi remove` under "Requiere confirmación"
- Expanded denied list to explicitly include: `clean -fd`, `chmod -R 777`, `chown -R`
- Removed false equivalence between `branch -D` (confirm) and `reset --hard` (deny)

**Verification**: Source code inspection (guardrails.ts DENIED_BASH_PATTERNS and CONFIRM_BASH_PATTERNS) confirms no code changes to pattern tables; prose now correctly documents existing patterns.

---

## Next step

Ready for `cc-ein-sdd close harness-discipline`.
