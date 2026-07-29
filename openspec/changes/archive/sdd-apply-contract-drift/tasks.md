# Tasks — sdd-apply-contract-drift

status: ready
blocked_by: none

## Review workload forecast

| Category | Forecast | Paths |
|---|---:|---|
| Production | 0 lines | none — runtime surfaces remain unchanged |
| Tests | 15–30 lines | `tests/sdd-phase-runtime-contract.test.ts` |
| Docs/prompt contract | 15–30 lines | `ein-pi/core/agents/sdd-apply.md` |
| Generated | 0 lines | none |

Production change is 0 lines, comfortably below the 400-line review budget. TDD is off; focused regression coverage is required.

## // 001. Align the apply acceptance prompt and its drift contract

- [x] 1.1 State the two acceptance modes in the apply prompt and protect them with focused mode-specific assertions.
  - production/doc paths: `ein-pi/core/agents/sdd-apply.md`
  - test paths: `tests/sdd-phase-runtime-contract.test.ts`, `tests/sdd-cost-block-e.test.ts`, `tests/sdd-planning-acceptance.test.ts`, `tests/subagent-build-hygiene.test.ts`
  - acceptance: Omitted acceptance is described as the runtime-injected `none` default and requires neither an `acceptance-report.md` nor a claim that one exists; only explicit `acceptance: verified` requires fresh declared-check re-execution, honest recorded acceptance evidence, and blocked/rejected failure handling; the prompt and regression assertions retain `sdd-verify` as the independent final behavioral and freshness gate. The existing E1 test continues to prove default injection and preservation of explicit `verified`; planning and build-hygiene tests remain focused non-regression checks.
  - skills: `bun`, `cognitive-doc-design`, `ein-discipline`
  - why: The written apply contract currently makes the exceptional verified/report path appear universal even though runtime normalization already defaults normal direct apply work to `none`.
  - learn: A prompt contract must distinguish defaults from opt-in exceptions so reviewers can see which evidence is required in each path.
  - architecture: `sdd-apply.md` owns executor obligations by received acceptance mode; runtime normalization remains the executable default/override authority and is not modified; `sdd-verify` retains independent final verification and close-freshness authority.
  - avoid: Do not alter runtime normalization, orchestration, verify/close behavior, or delete acceptance-report language wholesale—`verified` still needs its evidence-bearing report.
  - verify: `bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts`
