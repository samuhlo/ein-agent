# Tasks — thin-parent-research-routing

status: ready
blocked_by: none

Delivery boundary: one PR; keep the two prompt assets and their focused tests in the same reviewable change. Estimated production delta: 90–160 lines across `ein-pi/agent/assets/orchestrator.md` and `ein-pi/core/agents/ein-scout.md` (≤400-line budget); test delta is separate and must be reported, not counted against that budget. Preserve v0.24.4 scout schema/handoff/validator/smoke and the seven-phase lifecycle.

## // 001. Deterministic parent research routing

production_files: `ein-pi/agent/assets/orchestrator.md`
test_files: `tests/orchestrator-context-diet.test.ts`

- [x] 1.1 RED → add failing static prompt-contract assertions in `tests/orchestrator-context-diet.test.ts` for the `>=4 files` and `>=2 source classes` delegation triggers, no more than two routing reads, no more than two material post-acceptance spot-checks, accepted findings/references/uncertainties forwarding with no automatic rediscovery, at most three distinct fresh scouts, and read-only assessment creating no OpenSpec/SDD state.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Lock the observable parent policy before tightening its authoritative prompt.
  - learn: A routing read decides where research belongs; it never investigates the answer.
  - architecture: `orchestrator.md` owns parent routing and synthesis boundaries; no runtime router or lifecycle implementation is introduced.
  - avoid: Broadening static tests into a model-behavior simulation or changing the closed scout handoff tests.
  - verify: `bun test tests/orchestrator-context-diet.test.ts` (RED: new assertions fail before the prompt edit)

- [x] 1.2 GREEN → update only `ein-pi/agent/assets/orchestrator.md` in its existing Work Routing Ladder, Parent read discipline, and Parallel read-only fan-out sections: define routing read, source class, and material spot-check; enforce the two-read/two-spot-check limits; mandate delegation thresholds; reuse accepted cited evidence and explicit uncertainties; forbid automatic rediscovery and pre-scope `sdd-map`; retain one-to-three independent fresh scouts with distinct angles; state explicitly that read-only assessment creates no SDD/OpenSpec/lifecycle state.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Make the installed parent contract deterministic while retaining the established authoritative sections.
  - learn: Evidence can move forward through a workflow without repeating the research that produced it.
  - architecture: Parent owns routing, acceptance, severity, alternatives, and candidate-slice synthesis; scouts remain evidence-only and `sdd-map` stays behind bounded scope.
  - avoid: Adding a second routing system, speculative map fan-out, or changes to protected handoff, validation, extension-empty, smoke, or lifecycle boundaries.
  - verify: `bun test tests/orchestrator-context-diet.test.ts` (GREEN: all routing assertions pass)

- [x] 1.3 TRIANGULATE → extend `tests/orchestrator-context-diet.test.ts` with boundary-negative assertions that distinguish three files from four, one source class from two, and non-material/broad rediscovery from the permitted bounded material spot-checks; then REFACTOR the test names and prompt wording for one unambiguous policy vocabulary without changing behavior.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Prove thresholds and exceptions rather than only proving favorable phrases are present.
  - learn: Boundary tests prevent policy limits from degrading into suggestions.
  - architecture: Static tests inspect the installed authoritative prompt; they do not claim runtime model compliance.
  - avoid: Relaxing the exact limits into “1–2” or “heavier research” language that makes deterministic routing ambiguous.
  - verify: `bun test tests/orchestrator-context-diet.test.ts` (TRIANGULATE and REFACTOR: focused suite remains green)

## // 002. Bounded packet and scout compatibility

production_files: `ein-pi/agent/assets/orchestrator.md`, `ein-pi/core/agents/ein-scout.md`
test_files: `tests/orchestrator-scope-gate.test.ts`, `tests/readonly-scout-contract.test.ts`

- [x] 2.1 RED → add failing static contract assertions in `tests/orchestrator-scope-gate.test.ts` for a required `RESEARCH PACKET`: concrete question, allowed roots, optional specific memory query, optional bounded documentation topics, ceilings of `max_reads: 20`, `max_output_bytes: 12288`, and `max_runtime_ms: 300000`, plus scoped-only `sdd-map` and parent ownership of severity, bounded alternatives, and optional candidate slices.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Specify packet bounds and ownership before documenting their consumer.
  - learn: A request budget narrows work; it does not grant tools, schema fields, or a higher runtime limit.
  - architecture: The packet is prompt data, not a parser or new persistent artifact; the existing 120000-ms launch normalizer remains the stricter effective limit.
  - avoid: Treating alternatives or candidate slices as scout-report fields, or opening pre-scope lifecycle state to hold packet data.
  - verify: `bun test tests/orchestrator-scope-gate.test.ts` (RED: new packet assertions fail before prompt edits)

- [x] 2.2 GREEN → update `ein-pi/agent/assets/orchestrator.md` and minimally update `ein-pi/core/agents/ein-scout.md` so each delegated pre-scope scout consumes the bounded packet roots/budgets and returns only existing evidence fields (`findings`, `references`, `uncertainties` and the existing closed report shape); explicitly reserve severity, alternatives, and candidate slices for parent synthesis after validation.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Reconcile the full Slice 05 packet outcome with v0.24.4’s closed report validator without schema expansion.
  - learn: Facts and uncertainty belong to the researcher; recommendations and slices belong to the decision-maker.
  - architecture: `orchestrator.md` creates and consumes packet intent; `ein-scout.md` accepts bounded evidence work only; `ein-scout-report/v1` remains unchanged.
  - avoid: Changing protected handoff, validation, extension-empty, smoke, or lifecycle boundaries; keep the existing regression guard unchanged.
  - verify: `bun test tests/orchestrator-scope-gate.test.ts` (GREEN: packet and scoped-map assertions pass)

- [x] 2.3 TRIANGULATE → add negative/compatibility assertions in `tests/orchestrator-scope-gate.test.ts` that packet parent-synthesis intent is not an unsupported scout top-level field and that pre-scope routing does not select `sdd-map`; REFACTOR duplicated assertions while keeping the two suites targeted. Run the unchanged v0.24.4 regression guard and type guard.
  - skills: `ein-discipline`, `work-unit-commits`, `comment-style`
  - why: Ensure the narrowed prompt contract cannot silently reopen schema or lifecycle scope.
  - learn: A compatibility boundary is strongest when tests assert what must not be added as well as what must exist.
  - architecture: Closed schema, direct handoff, validator, extension-empty behavior, smoke, and seven-phase lifecycle are regression boundaries, not change surfaces.
  - avoid: Rewriting regression tests to accept `severity`, `alternatives`, or `candidate_slices`, or counting test lines toward the production review budget.
  - verify: `bun test tests/orchestrator-scope-gate.test.ts && bun test tests/readonly-scout-contract.test.ts && cd installer && bun run typecheck` (TRIANGULATE and REFACTOR: focused contracts, v0.24.4 guard, and types pass)

## // 003. Work-unit delivery check

production_files: none
test_files: none (delivery measurement only)

- [x] 3.1 Keep Groups 001–002 as one PR with tests in the same work units; before delivery, measure production lines separately from test lines and stop for decomposition if production changes exceed 400 lines. Roll back by reverting the prompt-contract changes and their focused tests together; no state cleanup, migration, or schema rollback is permitted or required.
  - skills: `ein-discipline`, `work-unit-commits`
  - why: Preserve a reviewable, reversible prompt-contract slice within the agreed workload budget.
  - learn: Small reversible units make policy changes safe even when they span parent and worker instructions.
  - architecture: One PR contains the complete contract story; each numbered group is independently resumable and maps to a bounded work-unit commit if commits are created.
  - avoid: Splitting tests from the prompt behavior they prove, adding unrelated protected paths, or silently exceeding the one-PR 400-production-line limit.
  - verify: `git diff --shortstat <base>..HEAD -- . ':(exclude)*.test.*' ':(exclude)*.spec.*' ':(exclude)**/tests/**' ':(exclude)**/__tests__/**' ':(exclude)**/e2e/**' ':(exclude)*.snap' ':(exclude)*-lock.*' ':(exclude)dist/**' ':(exclude).output/**' ':(exclude).nuxt/**' ':(exclude)coverage/**' ':(exclude)*.min.*'`
