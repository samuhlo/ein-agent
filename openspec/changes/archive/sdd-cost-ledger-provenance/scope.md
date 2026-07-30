# Truthful, attributable SDD cost accounting

Make every SDD cost receipt belong to its exact structured run identity, preserve provider metric provenance, and expose the exact run set behind each aggregate. This slice changes accounting and status behavior without introducing numeric token gates or replacing conservative timeout reconciliation.

## Scope packet

```yaml
scope: Make SDD cost accounting attributable and truthful by binding runs to structured flowId/changeId/phase/runId metadata, preserving timestamps and metric provenance, and aggregating reproducible run sets without double counting. Keep provider-reported values distinct from estimates, represent missing values as unavailable, preserve timeout reconciliation, and defer numeric token gates.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 900000
```

## Outcome

Each receipt belongs to the correct shopping basket: exact structured identity, not task prose or substring matching, determines attribution. Similar change names and later textual mentions cannot steal or contaminate another change's cost.

## In scope

- Identify runs using structured `flowId`, `changeId`, `phase`, and `runId` metadata across router, extension, and pi-subagents run/session boundaries.
- Record timestamps and provenance for reported metrics.
- Preserve input, output, cache-read, and cache-write as separate fields when available.
- Represent unavailable provider values explicitly as `unavailable`, never as invented zero.
- Keep provider-reported cost separate from estimates and label each truthfully.
- Aggregate by phase, retry, and change without counting a run more than once.
- Retain the exact run identifiers supporting every aggregate so the ledger is reproducible.
- Preserve the existing conservative timeout reconciliation behavior.

## Acceptance outcomes

- Changes `foo` and `foo-bar` never share runs.
- Later textual mentions of a change do not affect attribution.
- Input, output, cache-read, and cache-write remain separate fields.
- Missing provider data is `unavailable`, not zero.
- Every aggregate exposes enough run identity to reproduce its exact run set.
- Billing estimates are never presented as provider-reported truth.
- Phase, retry, and change aggregates do not double count a run.
- Existing timeout reconciliation remains the single implementation used.

## Explicit non-goals

- No numeric token or cost budget gates in this slice.
- No reimplementation or semantic redesign of timeout reconciliation.
- No attribution based on searching task prose, prefixes, substrings, or later mentions.
- No collapsing cache metrics into generic input/output totals when the provider reports them separately.
- No provider-cost fabrication from estimates or unavailable values.

## Mapping boundary

Map only the known candidates unless deterministic call-path evidence requires a directly connected metadata boundary:

- `docs/sdd-cost-plan.md`
- `ein-pi/agent/lib/sdd-router.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- pi-subagents run/session metadata boundaries
- `tests/sdd-real-cost-provenance.test.ts`
- `tests/sdd-cost-block-e.test.ts`
- `tests/sdd-cost-block-g.test.ts`

## Canonical OpenSpec context

| Path | SHA-256 | UTF-8 bytes |
| --- | --- | ---: |
| `openspec/specs/sdd-lifecycle/spec.md` | `69a39d0fffdeb64f71e29b3183cf7d7e6230b5b4efd8ecb22ff5f10a06c4a6d4` | 28121 |

Selection uses 1 of 3 files and 28,121 of 32,768 bytes. The behavior delta is declared at `specs/sdd-lifecycle/spec.md` and must be refined during design without changing domains casually.

## Project and SDD configuration

- Stack: Node.js/TypeScript ESM; Bun is the detected package manager for `installer/`.
- `strict_tdd`: `false` in the existing configuration.
- Test runner: not reliably detected; configured test commands are currently empty.
- Typecheck evidence: `cd installer && bun run typecheck`.
- Scope-phase rule: do not run tests, builds, or implementation checks here.
- Artifact store: canonical OpenSpec under `openspec/changes/`; optional Engram notebook is unavailable.

## Constraints and risks

- Metadata must cross process/session boundaries intact; a missing field must fail attribution truthfully rather than trigger prose fallback.
- Retries and timeout reconciliation may expose duplicate observations of one run; deduplication needs a stable identity while retaining auditable membership.
- Providers differ in metric availability and naming, so the model must preserve unavailable state and provenance without normalization that invents facts.
- The current config is untracked and user-maintained; this scope does not rewrite it.

## Review path

1. Verify structured identity excludes prefix and prose contamination.
2. Verify the metric model distinguishes provider facts, estimates, and unavailable values.
3. Verify aggregate membership is reproducible and deduplicated.
4. Verify timeout reconciliation is reused and numeric gates remain absent.
