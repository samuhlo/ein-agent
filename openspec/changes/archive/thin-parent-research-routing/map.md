# Map — thin-parent-research-routing

status: partial
scope_status: bounded
change: thin-parent-research-routing
phase: map
budget_source: scope.md
budget_exceeded: true

## Scope and baseline

Slice 05 is a parent-orchestration prompt/contract change, not a change to the already-repaired scout handoff. Baseline is installer `v0.24.4`; the direct `details.results[0].structuredOutput` path, fail-closed invalid-citation behavior, empty-extension compatibility, and opt-in live smoke remain conforming prerequisites and are out of scope.

The exploration budget was exhausted after the relevant surfaces were identified; this is a partial map, but it contains the smallest identified implementation slice and its focused test surface.

## Existing conforming behavior

- `ein-pi/agent/assets/orchestrator.md` already sends heavier pre-scope investigation to fresh, read-only `ein-scout`; permits only a 1–2-file inline routing peek; forbids speculative phase-agent/map use before a change is scoped; and says a failed scout is not permission for broad parent research.
- Its `Parallel read-only fan-out` section already caps independent scout branches at three, requires distinct angles, and states that scouts create no OpenSpec artifacts.
- Its `Scope Gate` already requires a bounded SCOPE PACKET before `sdd-map`; `ein-pi/core/agents/sdd-map.md` independently fail-closes on missing scope and only maps an existing bounded change.
- `ein-pi/core/agents/ein-scout.md` is read-only, fresh-context, skill-isolated, and requires cited findings plus explicit uncertainties. Runtime normalization in `ein-pi/agent/lib/scout-contract.ts::normalizeScoutLaunch` and result handling in `ein-pi/agent/extensions/ein-ai.ts` retain the fixed direct, validated scout handoff and do not create a phase/lifecycle artifact for a scout call.

## Real gaps and exact change surfaces

### 1. Parent routing policy — primary production surface
`ein-pi/agent/assets/orchestrator.md`

Update the existing **Work Routing Ladder**, **Parent read discipline**, and **Parallel read-only fan-out** guidance rather than adding a second routing system. The prompt does not currently make these behavioral boundaries deterministic enough:

- the `>=4 files` trigger;
- the `>=2` source-class trigger over repository, memory, and external documentation;
- a hard maximum of two routing reads before dispatch and at most two material post-acceptance spot-checks;
- forwarding accepted cited findings and explicit uncertainties without automatic rediscovery;
- a bounded `RESEARCH PACKET` required for each pre-scope scout, including concrete question, allowed roots, optional specific memory query, optional bounded documentation topics, finite read/output/runtime budgets, and bounded requested outputs;
- an explicit read-only-assessment/no-SDD-state rule.

The smallest implementation should make this one authoritative policy section precise and cross-reference the existing scoped-only `sdd-map` gate, rather than changing routing runtime code.

### 2. Scout instruction compatibility — secondary production surface
`ein-pi/core/agents/ein-scout.md`

Its capability and report sections need only the minimum instruction needed to consume a bounded research packet and return evidence/uncertainties within the existing report contract. Preserve its prohibition on decisions, designs, lifecycle actions, and mutations.

**Important design constraint:** the current deterministic schema in `ein-pi/agent/lib/scout-contract.ts` is closed and accepts only `version`, `summary`, `summaryReferenceIds`, `findings`, `references`, and `uncertainties`. It has no `alternatives` or `candidate_slices` fields, while Slice 05 requests those as bounded packet outputs. The scope explicitly excludes scout schema/validator changes. Design must resolve this without expanding the structured report schema—e.g. treat alternatives/candidate slices as bounded research questions/evidence framing for the parent, or narrow/reconcile the delta before apply. Do not silently add fields: validation would fail closed.

### 3. Focused static-contract tests
`tests/orchestrator-context-diet.test.ts`

Extend the existing parent-context/scout routing suite for the numeric routing-read threshold, no-repeat forwarding intent, independent-scout cap, and no-SDD-artifact/read-only wording. It already reads the authoritative orchestrator asset and asserts scout fan-out rather than `sdd-map` fan-out.

`tests/orchestrator-scope-gate.test.ts`

Extend the existing SCOPE PACKET/scoped-map suite to assert that `sdd-map` is not selected pre-scope and that the parent policy names the bounded research packet. Keep its assertion target scoped to the orchestrator asset.

A new dedicated static prompt-contract test is optional only if the two existing suites become materially unclear; the smallest change is to add cases to them. Runtime tests in `tests/readonly-scout-contract.test.ts` already protect the out-of-scope direct handoff and closed schema and should remain unchanged unless a design decision intentionally changes a stated contract (which this scope forbids).

## No-change / blast-radius boundaries

- Do **not** modify `ein-pi/agent/lib/scout-contract.ts`, `ein-pi/agent/extensions/ein-ai.ts`, `tests/readonly-scout-contract.test.ts`, or `tests/scout-live-smoke.ts`: they own the completed structured handoff, closed report validation, extension truth, and opt-in smoke.
- Do **not** modify SDD lifecycle/router implementation. The desired lifecycle non-creation is achieved by keeping pre-scope assessment in `ein-scout` and retaining the existing `sdd-map` scope gate.
- Do **not** touch protected unrelated untracked paths: `.sdd/changes/ein-sdd-state-machine-map/`, `EIN.md`, `docs/ein-multiagente-plan.md`, or `openspec/config.yaml` (apart from the already-scoped later `strict_tdd` update, if still required by the accepted design).
- Estimated production blast radius is two Markdown source classes (parent orchestrator and scout agent), with two focused TypeScript static-test classes. No installer runtime, schema, or release surface is needed for the smallest compliant slice.

## Focused verification for later phases (not run in map)

- `bun test tests/orchestrator-context-diet.test.ts`
- `bun test tests/orchestrator-scope-gate.test.ts`
- Regression guard only: `bun test tests/readonly-scout-contract.test.ts`
- Type guard when source/test edits are complete: `cd installer && bun run typecheck` (as declared by current configuration/scope).

## Smallest-change recommendation

Use one reviewable prompt-contract work unit: tighten the existing parent routing policy, minimally align the scout’s packet-reading instruction without altering its report schema, and add boundary assertions to the two existing static contract suites. Keep the expected production diff well below the 400-line budget. `sdd-design` must first resolve the packet-output/schema tension explicitly; otherwise the change risks asking the scout for fields its deterministic validator rejects.

## Ledger

ledger:
  reads:
    - { path: "/home/samuhlo/.pi/agent/skills/local/ein-discipline/SKILL.md", lines: 101, estimated_tokens: 1300 }
    - { path: "/home/samuhlo/.pi/agent/skills/local/work-unit-commits/SKILL.md", lines: 58, estimated_tokens: 700 }
    - { path: "openspec/changes/thin-parent-research-routing/scope.md", lines: 60, estimated_tokens: 1100 }
    - { path: "openspec/changes/thin-parent-research-routing/** (find)", lines: 4, estimated_tokens: 40 }
    - { path: "EIN.md", lines: 39, estimated_tokens: 500 }
    - { path: "docs/public-beta-plan.md:247-361", lines: 115, estimated_tokens: 1300 }
    - { path: "openspec/changes/thin-parent-research-routing/specs/scout-routing/spec.md", lines: 48, estimated_tokens: 850 }
    - { path: "codegraph explore: v0.24.4 research routing", lines: 328, estimated_tokens: 2400 }
    - { path: "codegraph explore: ein-scout routing", lines: 255, estimated_tokens: 1600 }
    - { path: "ein-pi/**/*scout* (find/grep)", lines: 100, estimated_tokens: 2200 }
    - { path: "tests/**/*scout* (grep)", lines: 100, estimated_tokens: 2400 }
    - { path: "ein-pi/agent/assets/orchestrator.md", lines: 260, estimated_tokens: 5800 }
    - { path: "ein-pi/core/agents/ein-scout.md", lines: 32, estimated_tokens: 500 }
    - { path: "tests/sdd-phase-runtime-contract.test.ts", lines: 200, estimated_tokens: 2600 }
    - { path: "tests/readonly-scout-contract.test.ts:1-150", lines: 150, estimated_tokens: 2400 }
    - { path: "tests/orchestrator-context-diet.test.ts", lines: 115, estimated_tokens: 1400 }
    - { path: "installer/package.json", lines: 18, estimated_tokens: 250 }
    - { path: "ein-pi/agent/lib/scout-contract.ts (grep)", lines: 43, estimated_tokens: 1100 }
    - { path: "ein-pi/core/agents/sdd-map.md", lines: 113, estimated_tokens: 1900 }
    - { path: "tests scope/map contracts (grep)", lines: 54, estimated_tokens: 1000 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts (grep)", lines: 26, estimated_tokens: 700 }
    - { path: "tests/orchestrator-scope-gate.test.ts", lines: 55, estimated_tokens: 650 }
  webfetch_used: false
  budget_consumed: { tokens: 30690, reads: 22 }
