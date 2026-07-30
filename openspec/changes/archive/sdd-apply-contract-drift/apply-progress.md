status: complete

# Apply progress — sdd-apply-contract-drift

## // 001. Align the apply acceptance prompt and its drift contract

- **Status:** complete
- **Completed:** 1.1
- **Changed:** `ein-pi/core/agents/sdd-apply.md` now distinguishes normal runtime-injected `acceptance: none` (no report or verified claim) from exceptional explicit `acceptance: verified` (fresh runner checks, honest evidence, and blocked/rejected failure handling). It preserves `sdd-verify` as the independent behavioral and freshness gate.
- **Regression coverage:** `tests/sdd-phase-runtime-contract.test.ts` now asserts both modes, failure handling, and retained `sdd-verify` authority. Adjacent listed tests required no changes.
- **Verification:** `timeout 120 bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts` — passed (54 tests, 0 failures).
- **TDD:** off by task instruction; focused regression tests added/updated and run after implementation.
- **Deviation:** none.
- **Remaining tasks:** none.
