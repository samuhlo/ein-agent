# Scope — thin-parent-research-routing

## SCOPE PACKET

scope: Restart public-beta Slice 05 from the v0.24.4 baseline by routing broad pre-scope research from the parent to read-only `ein-scout`, while retaining only bounded routing peeks and material spot-checks. Forward accepted cited findings and explicit uncertainties without automatic rediscovery, and reserve `sdd-map` for changes that are already scoped.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 1800000

## Source and baseline

- Canonical roadmap: `docs/public-beta-plan.md`, section `Slice 05 — thin-parent-research-routing` and its acceptance criteria.
- Baseline: installer v0.24.4.
- Fixed prerequisite: the readonly scout structured handoff is complete and a live parent delegation succeeded; this change does not reopen or redesign it.
- Execution mode: interactive.
- Delivery: one reviewable PR, with a 400-production-line review budget.
- Web fetch: disabled.

## Canonical OpenSpec context

| path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| `openspec/specs/scout-routing/spec.md` | `092046def4134777dd7f1ade247c37d2a8ea11b3498f5b4453b11d49fafa9a9f` | 2458 |

Selection total: 1 file, 2458 bytes (within the 3-file / 32 KiB phase limit).

## Behavioral scope

- Delegate to read-only `ein-scout` when understanding requires four or more files.
- Delegate when research combines at least two source classes among repository, memory, and external documentation.
- Permit the parent at most two routing reads before delegation.
- After accepting a scout report, permit only one or two material spot-checks; do not automatically repeat accepted cited research.
- Replace speculative pre-scope `sdd-map` fan-out with no more than three independent scouts, each assigned a distinct research angle.
- Keep `sdd-map` available only after the change has a bounded scope.
- Define a bounded `RESEARCH PACKET` carrying a concrete question, allowed roots, optional specific memory query, optional bounded documentation topics, explicit read/output/runtime budgets, and bounded output fields for cited findings, uncertainties, alternatives, and optional candidate slices.
- Forward accepted cited findings and explicit uncertainties into subsequent reasoning.
- Ensure read-only assessment creates no SDD change or lifecycle state.

## Acceptance criteria

1. A request combining roadmap/document evidence, memory, external documentation, and candidate-slice research routes to scout rather than broad parent exploration.
2. Four-or-more-file understanding and two-source-class research deterministically trigger delegation.
3. Parent activity is bounded to two routing reads before delegation and one or two material spot-checks afterward.
4. Accepted cited scout findings and uncertainties are forwarded without automatic rediscovery by the parent.
5. Pre-scope parallel research uses at most three independent scouts and does not invoke `sdd-map`.
6. `sdd-map` remains scoped-only.
7. Read-only assessment creates no OpenSpec/SDD state.
8. Focused contract/runtime tests cover routing boundaries, packet bounds, no-repeat behavior, and lifecycle non-creation under strict TDD.

## Non-goals

- Structured-result handoff, scout schema or validator changes.
- Extension-empty compatibility or live-smoke infrastructure.
- SDD lifecycle changes.
- Release metadata.
- Engram or Context7 adapters.
- Application feature work.

## Constraints and safeguards

- Preserve unrelated untracked paths: `.sdd/changes/ein-sdd-state-machine-map/`, `EIN.md`, `docs/ein-multiagente-plan.md`, and `openspec/config.yaml` (except the explicitly requested safe `strict_tdd` setting update).
- Do not redesign the existing readonly scout contract.
- Keep production changes within the 400-line review budget; if implementation forecasting exceeds it, return for decomposition rather than silently expanding scope.
- Strict TDD is configured for this behavioral prompt/runtime contract; test execution belongs to apply/verify, not scope.

## Current SDD configuration

`openspec/config.yaml` describes a Node.js/TypeScript ESM installer using Bun, with typecheck command `cd installer && bun run typecheck`. Its test runner commands remain unspecified. This scope safely changes only `strict_tdd` to `true` as explicitly required; later phases must identify and use focused existing test conventions without destructively rewriting configuration.

## Skill application

- `ein-discipline`: applied for bounded SDD scope, strict-TDD recording, lifecycle separation, and review-budget constraints.
- `work-unit-commits`: applied to constrain delivery to one reviewable behavioral work unit with tests kept alongside implementation; no commit is created in scope.
- Skill registry exists at `.pi/ein/atl/skill-registry.md`.

## Delta location

Behavior deltas are declared in `openspec/changes/thin-parent-research-routing/specs/scout-routing/spec.md`; therefore this scope intentionally has no `spec_delta: none` declaration.
