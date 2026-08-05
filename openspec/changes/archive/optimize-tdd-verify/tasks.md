# Tasks — optimize-tdd-verify

status: ready
blocked_by: none

## // 001. Lock the optimized phase-boundary contract (RED)

- [x] 1.1 Update `tests/sdd-tdd-phase-boundary.test.ts` with failing assertions for behavior-seam labels, exactly one final focused command per seam, conservative surrounding-whitespace normalization, many-to-one duplicate merging, fresh verify execution, global-check-once behavior, and preserved strict-TDD/apply-build boundaries.
  - skills: `ein-discipline`, `typescript-advanced-types`, `architecture`
  - why: Establishes executable acceptance before changing the workflow contracts and prevents accidental weakening of apply or verify ownership.
  - learn: Contract tests should distinguish command identity from semantic equivalence and test independent evidence as a separate obligation.
  - architecture: Keep the contract at the existing phase-boundary test seam; do not introduce a helper or lifecycle infrastructure without a runtime caller.
  - avoid: Testing a speculative command planner that the agent workflow does not execute, or accepting apply evidence as final verification.
  - verify: `bun test tests/sdd-tdd-phase-boundary.test.ts` (expected RED before documentation changes)

## // 002. Preserve strict-TDD apply evidence ownership (GREEN)

- [x] 2.1 Update `ein-pi/core/agents/sdd-apply.md` to require concise observable behavior-seam labels and one final focused command association after the last GREEN/REFACTOR check for each seam, while retaining RED → GREEN → TRIANGULATE → REFACTOR, bounded focused checks, no production builds, and no absorption of global checks.
  - skills: `ein-discipline`, `architecture`, `best-practices`
  - why: Supplies verify with traceable seam associations without adding another apply execution or changing the strict-TDD loop.
  - learn: Apply evidence identifies what was exercised; it never substitutes for verify’s fresh current-run evidence.
  - architecture: Keep apply as the focused-cycle owner and keep `apply-progress.md` as audit input only; leave router, guardrails, close code, and config untouched.
  - avoid: Moving global checks into apply, running a production build, or recording task/file names as a substitute for observable behavior seams.
  - verify: `bun test tests/sdd-tdd-phase-boundary.test.ts`
  - dependencies: `001`
  - acceptance: The test passes for apply ownership, strict cycle wording, one final command per seam, and the unchanged no-build boundary.

## // 003. Define independent verify planning and evidence (GREEN)

- [x] 3.1 Update `ein-pi/core/agents/sdd-verify.md` to define a fresh per-run inventory from apply seam evidence plus current config/design/tasks requirements; validate exactly one focused command per seam; trim only surrounding whitespace; omit empty commands; merge exact normalized commands across seams and roles in first-seen order; execute each unique command once; and record covered seams/roles and current results.
  - skills: `ein-discipline`, `architecture`, `best-practices`
  - why: Makes deduplication deterministic while preserving independent execution and complete evidence reporting.
  - learn: Conservative normalization is safer than shell-semantic equivalence because quoting, flags, environment, and working-directory setup can change behavior.
  - architecture: Keep command planning as an agent-contract responsibility; do not add a dead deterministic helper, scheduler, router change, or artifact schema migration.
  - avoid: Reusing apply/previous verify results, timestamps, hashes, workflow caches, or treating one execution as several executions in the report.
  - verify: `bun test tests/sdd-tdd-phase-boundary.test.ts`
  - dependencies: `002`
  - acceptance: The test passes for fresh execution, exact-match merging, seam/role retention, global-check scheduling once, and explicit irrelevant-check reasons.

## // 004. Reassert strict-TDD audit and close-gate invariants (TRIANGULATE/REFACTOR)

- [x] 4.1 Triangulate the contract test against `ein-pi/core/agents/sdd-apply.md` and `ein-pi/core/agents/sdd-verify.md`, then refine wording so missing/ambiguous seam evidence, failed or unscheduled required checks, stale evidence, and incomplete RED/GREEN/TRIANGULATE/REFACTOR evidence block an unqualified pass while close still requires the current passing verify report.
  - skills: `ein-discipline`, `architecture`
  - why: Ensures optimization cannot bypass strict-TDD auditing, behavior coverage, fresh verify evidence, or close readiness.
  - learn: Deduplication changes execution count, not the obligations each command and behavior seam must satisfy.
  - architecture: Preserve existing lifecycle router, guardrails, preflight, close implementation, and `openspec/config.yaml` as unchanged authorities outside this prompt-contract slice.
  - avoid: Adding metadata-only bypasses, cross-run freshness heuristics, or broad full-suite/build requirements when no current requirement exists.
  - verify: `bun test tests/sdd-tdd-phase-boundary.test.ts`
  - dependencies: `003`
  - acceptance: Focused contract tests pass and manual inspection confirms only the two agent contracts plus the named test changed; config, lifecycle code, production app code, and apply build behavior remain untouched.
