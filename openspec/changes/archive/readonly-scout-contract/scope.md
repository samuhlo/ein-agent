# Scope: read-only scout contract

Add `ein-scout` as a bounded, fresh-context, read-only research executor outside the seven-phase SDD lifecycle. The change makes research findings inspectable and cited while denying the scout mutation, delegation, lifecycle-state creation, routing membership, and architecture authority.

## Scope packet

```yaml
scope: Add `ein-scout`, a bounded read-only research executor outside the seven-phase SDD state machine. It uses fresh context, a strict non-mutating tool allowlist, bounded reads/runtime/output, cited findings, and explicit uncertainty while leaving the seven-phase flow unchanged.
budget_allocated:
  max_tokens: 15000
  max_reads: 30
  max_runtime_ms: 120000
```

## Outcome

Ein gains a librarian that may inspect and cite information but has no pen, delete key, delegation power, or authority to decide the solution.

## In scope

- Define and install the authoritative `ein-scout` agent contract under `ein-pi/core/agents/`.
- Require a fresh context for every scout run.
- Enforce a strict read-only tool allowlist that rejects file mutation, mutating shell or Git operations, and subagent spawning.
- Bound each run by read count, runtime, and output size.
- Require cited references and explicit uncertainty; reject oversized or unreferenced reports.
- Add the scout to authoritative installed-agent inventory, model recommendations/configuration, doctor diagnostics, and exact inventory/build/install tests.
- Align the `pi-subagents` user-agent contract with the scout's bounded, read-only execution contract.
- Prove the scout remains absent from SDD phase order, router, reconciliation, state, and chain machinery.
- Preserve the existing seven-phase flow exactly.

## Out of scope

- Adding an eighth SDD phase or any OpenSpec lifecycle state.
- Allowing the scout to create or modify files, OpenSpec artifacts, Git state, or external state.
- Letting the scout spawn subagents or participate in orchestration.
- Letting the scout choose architecture, implementation, or delivery decisions.
- External web research (`webfetch` is disabled).
- Implementing unrelated agent, router, model, doctor, or installer changes.

## Acceptance outcomes

- Scout execution cannot create or modify files or OpenSpec artifacts.
- The tool contract rejects mutation and subagent spawning.
- Every run starts with fresh context and has enforced read, runtime, and output bounds.
- Reports require references and reject oversized or unreferenced output while making uncertainty explicit.
- `ein-scout` is absent from every SDD phase/state/chain mechanism.
- Authoritative installed-agent inventory, doctor, model configuration, and exact inventory/build/install tests agree exactly.
- The existing seven-phase SDD flow remains unchanged.

## Known mapping candidates

Mapping must remain bounded to these candidates unless the map phase identifies a directly required adjacent contract:

- `ein-pi/core/agents/`
- `ein-pi/agent/assets/orchestrator.md`
- `ein-pi/agent/settings.json`
- `ein-pi/agent/lib/model-config.ts`
- `ein-pi/agent/extensions/ein-doctor.ts`
- Agent inventory, build, and install tests
- `pi-subagents` user-agent contract

## Constraints and invariants

- Read-only means no write/edit tool and no shell or Git command capable of mutation; denial is fail-closed.
- Research findings are advisory, cited, bounded, and uncertainty-aware.
- The executor starts from fresh context and cannot inherit authority through an SDD phase.
- Inventory updates must not imply lifecycle membership.
- No source, tests, other changes, or preserved untracked paths are modified during scope.

## Canonical OpenSpec context

| Path | SHA-256 | UTF-8 bytes |
| --- | --- | ---: |
| `openspec/specs/sdd-lifecycle/spec.md` | `f895e00282b8efc1b70175b0823d451a0e496ab3ed083d21906f4cb9dd5f12b9` | 30699 |

Selection uses the sole explicit domain hint, `sdd-lifecycle`, and remains within the shared limit of 3 files and 32768 UTF-8 bytes.

## Project SDD configuration

- Stack: Node.js/TypeScript ESM; Bun package manager is detected under `installer/`.
- Strict TDD: disabled in current `openspec/config.yaml`.
- Test runner: not configured; verification commands are currently empty.
- Typecheck signal: `cd installer && bun run typecheck`.
- Artifact store: canonical OpenSpec under `openspec/changes/`.

## Scope risks

- A permissive shell escape could undermine the read-only promise even if write/edit tools are absent.
- Adding the agent to a shared inventory could accidentally make it routable as an SDD phase unless exact negative tests cover lifecycle machinery.
- Bounds that exist only in prompt prose rather than runtime enforcement could permit excessive reads, runtime, or output.
- Inventory, installed assets, model recommendations, and doctor checks can drift unless tests compare the same authoritative set.

## Spec delta

Observable executor and runtime behavior changes in the `sdd-lifecycle` domain. The parser-valid delta at `specs/sdd-lifecycle/spec.md` declares the required behavior; this scope intentionally does not use `spec_delta: none`.
