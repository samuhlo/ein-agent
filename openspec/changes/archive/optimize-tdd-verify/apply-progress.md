status: complete
change: optimize-tdd-verify
phase: apply
group: // 004. Reassert strict-TDD audit and close-gate invariants (TRIANGULATE/REFACTOR)

## Completed

- Groups 001–003 remain complete; no prior group work was redone.
- Completed task 4.1 across `tests/sdd-tdd-phase-boundary.test.ts`, `ein-pi/core/agents/sdd-apply.md`, and `ein-pi/core/agents/sdd-verify.md`.
- Apply now requires complete RED/GREEN/TRIANGULATE/REFACTOR evidence per behavior seam; verify explicitly blocks missing or ambiguous seams, failed or unscheduled required checks, stale evidence, and incomplete TDD cycles while retaining the current passing-report close gate.
- Updated `tasks.md` by checking task 4.1; all tasks are complete.

## TDD Cycle Evidence

| Group | RED | GREEN | TRIANGULATE / REFACTOR |
| --- | --- | --- | --- |
| 001 | Existing focused contract test was RED before contract changes: 6 expected failures, 6 passes. | Downstream contract work completed in groups 002–004. | Initial contract scope preserved through later triangulation. |
| 002 | Reused group-001 RED assertions for apply evidence ownership. | Focused test passed for apply/orchestration boundaries; verify-plan assertions were intentionally left RED for group 003. | Apply-only ownership and no-build boundary manually checked. |
| 003 | Focused verify-plan assertions were RED before editing: 5 failures. | `bun test tests/sdd-tdd-phase-boundary.test.ts`: 12 passed, 0 failed. | Verify planning and deduplication manually checked; audit/close invariants completed in group 004. |
| 004 | Added strict-TDD audit/close assertions; focused test was RED with 4 failures. | Refined both agent contracts and normalized case-insensitive contract assertions; final focused run: 17 passed, 0 failed. | Triangulated each new assertion against both contracts, then rechecked close-gate, freshness, required-check, and complete-cycle wording. |

## Per-behavior-seam evidence

The rows below map every designed observable seam to the already recorded group evidence. The shared command is one final association per seam; the existing run recorded one execution, not one execution per row.

| Behavior seam | RED already recorded | GREEN already recorded | TRIANGULATE / REFACTOR already recorded | One final focused command association |
| --- | --- | --- | --- | --- |
| Apply names each assigned behavior as an observable seam and gives each seam one final focused command. | Group 001: focused contract test RED (6 failures). | Group 002: apply/orchestration boundary assertions passed. | Group 004: each new assertion triangulated against both contracts; complete-cycle wording rechecked. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Command identity trims only surrounding whitespace and preserves internal characters/order. | Group 003: verify-plan assertions RED (5 failures). | Group 003: focused run passed (12/0). | Groups 003–004: verify planning, normalization, and freshness wording manually rechecked. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Exact normalized duplicates merge many seams/roles while executing once. | Group 003: verify-plan assertions RED (5 failures). | Group 003: focused run passed (12/0). | Groups 003–004: deduplication and retained associations manually rechecked. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Each verify run invokes a fresh plan rather than substituting apply or prior evidence. | Group 001: focused contract test RED (6 failures). | Group 003: focused run passed (12/0). | Group 004: freshness wording rechecked during triangulation/refactor. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Relevant global checks remain verify-owned and execute once; apply does not absorb them. | Group 001: focused contract test RED (6 failures). | Group 003: focused run passed (12/0); group 002 retained apply ownership. | Groups 002 and 004: global ownership and required-check wording rechecked. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Strict TDD audit requires complete RED/GREEN/TRIANGULATE/REFACTOR evidence and preserves the close gate. | Group 004: audit/close assertions RED (4 failures). | Group 004: final focused run passed (17/0). | Group 004: audit, close-gate, and complete-cycle assertions triangulated/refactored. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |
| Apply preserves the no-production-build boundary. | Group 001: focused contract test RED (6 failures). | Group 002: apply/orchestration boundary assertions passed. | Groups 002 and 004: no-build boundary rechecked. | `bun test tests/sdd-tdd-phase-boundary.test.ts` |

## Verification

- `bun test tests/sdd-tdd-phase-boundary.test.ts` — 17 passed, 0 failed after refactor.
- No production build, unrelated full suite, or typecheck run; this remains a focused documentation/contract-test slice.

## Deviations and remaining work

- No deviations from design. Config, lifecycle router/guardrails/close code, and production application code remain untouched.
- Remaining: none; apply is complete and ready for independent verify.
