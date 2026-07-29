# Map: align `sdd-apply` acceptance contract

status: partial
scope_status: bounded
change: sdd-apply-contract-drift
phase: map
skill_resolution: paths-injected
budget_source: scope.md
budget_exceeded: true

## Outcome

The runtime already implements the intended default. `ensureApplyAcceptance()` injects `acceptance: { level: "none" }` only for a direct `sdd-apply` delegation that omitted acceptance, while preserving any explicit `verified` value. The written `sdd-apply` prompt contradicts that implementation by saying verified is normal and by requiring an `acceptance-report` unconditionally.

The smallest coherent behavior change is prompt-and-regression alignment, not a runtime behavior change. `sdd-verify` remains the independent final gate.

## Traced call path

1. `ein-pi/agent/extensions/ein-ai.ts` registers the `tool_call` hook. For `subagent`, it calls `ensurePlanningAcceptance(event.input)`, then `ensureApplyAcceptance(event.input)`, then `ensureApplyTurnBudget(event.input)` before TDD gating and delegation.
2. `ein-pi/agent/lib/sdd-preflight.ts` exports `ensureApplyAcceptance(input)`:
   - returns without mutation for invalid input, any explicit `input.acceptance`, or a non-`sdd-apply` agent;
   - otherwise injects `level: "none"` with the reason that `sdd-verify` re-runs the suite as the runtime gate.
3. An explicit `acceptance: { level: "verified", verify: [...] }` therefore survives runtime normalization. Its runner re-execution and evidence/report requirements remain an exceptional opt-in path.
4. `ein-pi/agent/assets/orchestrator.md` already describes that default injection and identifies dedicated `sdd-verify`, plus close freshness, as the real gate.

## Contradiction and exact edit boundary

| Path | Relevant symbol/section | Finding | Map decision |
|---|---|---|---|
| `ein-pi/core/agents/sdd-apply.md` | `## Runtime Acceptance Verification` | Says the parent *normally* delegates `verified` and says to *ALWAYS* emit fenced `acceptance-report`. Both conflict with the injected `none` default. | Change. Split the contract by mode: default `none` requires no acceptance report; explicit `verified` retains fresh runner re-execution, honest evidence, and blocked-on-failure behavior. |
| `ein-pi/agent/lib/sdd-preflight.ts` | `ensureApplyAcceptance` | Already supplies the desired default and preserves explicit overrides. | No behavior change. Keep as the executable authority. |
| `ein-pi/agent/extensions/ein-ai.ts` | `tool_call` hook | Calls the normalization function on every `subagent` call before dispatch. | No behavior change. |
| `ein-pi/agent/assets/orchestrator.md` | `Acceptance verdicts` | Already says apply defaults to injected `none`, names `sdd-verify` as the runtime gate, and limits `verified` to an explicit per-group override. | No required semantic change. At most make wording parallel with the revised apply prompt if design finds a precise ambiguity; do not reintroduce a general report requirement. |
| `tests/sdd-phase-runtime-contract.test.ts` | P3 `sdd-apply conoce el contrato...` | Currently requires `sdd-apply.md` to contain `acceptance-report`, but does not distinguish default `none` from explicit `verified`. | Change focused prompt-contract assertions to prove the two paths and retained verify authority. |
| `tests/sdd-cost-block-e.test.ts` | E1 `ensureApplyAcceptance` | Direct unit coverage for injection and non-overwrite of `verified`; it is outside the initially named focused-test list but is the minimum runtime regression surface. | Retain; add/adjust only if needed to make the explicit override/evidence boundary clearer. |
| `tests/sdd-planning-acceptance.test.ts` | `ensurePlanningAcceptance` | Covers planning-only injection, not apply injection. It deliberately verifies that applies are not planning work. | No edit expected; retain as a focused non-regression check. |
| `tests/subagent-build-hygiene.test.ts` | apply/orchestrator build-hygiene assertions | Does not assert acceptance semantics. | No edit expected; retain as a focused non-regression check. |

## Candidate task groups

1. **Apply prompt contract**: replace the unconditional verified/report language with explicit default-`none` and opt-in-`verified` branches. Preserve the no-gaming/blocked guidance for verified failures and do not alter chain progress reporting.
2. **Prompt/runtime regression contracts**: update P3 assertions to require default injection, no general report obligation under `none`, explicit verified evidence/report behavior, and `sdd-verify` as the independent final gate. Preserve E1 normalization/non-overwrite coverage.
3. **Focused non-regression validation**: run the planning and build-hygiene contracts without broadening their scopes.

## Focused verification command

```bash
bun test tests/sdd-phase-runtime-contract.test.ts tests/sdd-planning-acceptance.test.ts tests/subagent-build-hygiene.test.ts tests/sdd-cost-block-e.test.ts
```

`tests/sdd-cost-block-e.test.ts` is included because it is the direct unit contract for `ensureApplyAcceptance`; omitting it would leave the default/override runtime behavior unverified.

## Risks

- Removing `acceptance-report` language wholesale would weaken the explicit `verified` override. The revised text and tests must make the requirement conditional, not delete it.
- Treating apply acceptance as final verification would bypass the lifecycle boundary. Keep `sdd-verify` and its fresh-result/close guard language authoritative.
- The injected default currently applies only to a single direct `sdd-apply` delegation. Do not broaden normalization to chains or other agents without a separate scoped change.
- `apply-progress.md` remains a chain artifact and is not an acceptance report; avoid conflating the two.

## Next phase

Proceed to `sdd-design` with the minimum edit set: `sdd-apply.md`, `sdd-phase-runtime-contract.test.ts`, and, only if the design needs stronger direct evidence, `sdd-cost-block-e.test.ts`. Treat the runtime injector, orchestrator, planning test, and build-hygiene test as preserved/non-regression surfaces unless design identifies a wording-only inconsistency.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/bun/SKILL.md", lines: "1-208", estimated_tokens: 2080 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/branch-pr/SKILL.md", lines: "1-204", estimated_tokens: 2100 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/chained-pr/SKILL.md", lines: "1-47", estimated_tokens: 700 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/cognitive-doc-design/SKILL.md", lines: "1-62", estimated_tokens: 650 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/comment-writer/SKILL.md", lines: "1-65", estimated_tokens: 600 }
    - { path: "/home/samuhlo/.pi/agent/skills/downloaded/document-writer/SKILL.md", lines: "1-89", estimated_tokens: 1050 }
    - { path: "codegraph explore: runtime default acceptance injection and sdd-apply contract", lines: "returned excerpts", estimated_tokens: 2200 }
    - { path: "openspec/changes/sdd-apply-contract-drift/scope.md", lines: "1-64", estimated_tokens: 1050 }
    - { path: "tests/subagent-build-hygiene.test.ts", lines: "1-42", estimated_tokens: 650 }
    - { path: "openspec/specs/sdd-lifecycle/spec.md", lines: "1-24622 bytes", estimated_tokens: 6200 }
    - { path: "codegraph explore: sdd-router acceptance default", lines: "returned excerpts", estimated_tokens: 1900 }
    - { path: "ein-pi acceptance grep", lines: "matching excerpts", estimated_tokens: 1200 }
    - { path: "tests/sdd-phase-runtime-contract.test.ts", lines: "1-158", estimated_tokens: 1900 }
    - { path: "tests/sdd-planning-acceptance.test.ts", lines: "1-157", estimated_tokens: 1950 }
    - { path: "ein-pi/core/agents/sdd-apply.md", lines: "1-197", estimated_tokens: 3500 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: "90-119", estimated_tokens: 2900 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: "580-659", estimated_tokens: 1100 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: "750-804", estimated_tokens: 750 }
    - { path: "tests acceptance grep", lines: "matching excerpts", estimated_tokens: 1200 }
    - { path: "tests/sdd-cost-block-e.test.ts", lines: "1-112", estimated_tokens: 1600 }
  webfetch_used: false
  budget_consumed: { tokens: 33680, reads: 20 }
