# Scope — deploy-claude-orchestrator-asset

## Outcome
Deploy the existing canonical `ein-pi/agent/assets/orchestrator.md` through the existing `cc-ein/sync.ts` checkout/runtime sync path into the isolated Claude home, at the adapter-promised relative path `assets/orchestrator.md` (therefore `~/.claude-ein/assets/orchestrator.md` by default). Prove in a temporary isolated Claude home that the destination exists and is byte-identical to the canonical source.

## Scope packet
scope: Add only the Claude sync/deployment of the canonical orchestrator asset to the adapter-promised `assets/orchestrator.md` destination, with isolated temporary-home existence and byte-parity proof. Do not alter the asset content, installer payload, packaging, staging, archive, or smoke flows.
budget_allocated:
  max_tokens: 12000
  max_reads: 20
  max_runtime_ms: 120000

## In scope
- `cc-ein/sync.ts`: the Claude checkout/runtime deployment path only, so the canonical asset reaches `$CC_EIN_HOME/assets/orchestrator.md`.
- A focused test/proof using an isolated temporary Claude home, asserting destination existence and exact byte parity.
- Preserve source bytes unchanged; canonical source evidence is 42,926 bytes, SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`.

## Explicit non-goals and deferred work
- **Deferred to `package-claude-orchestrator-asset`:** installer packaged-payload inventory, archive bundling, packaged staging, payload inventory assertions, and installer smoke changes.
- No installer source, installer tests, archive layout, release payload, or packaged artifact changes in this change.
- No edits to `ein-pi/agent/assets/orchestrator.md`, A1–A3 dirty changes, or `docs/plan-hallazgos-dogfooding-2026-08.md`.
- No changes to Pi deployment, Claude generated coordinator content, agents, skills, hooks, MCP setup, or runtime behavior outside this asset deployment.

## Acceptance boundary
1. Running the existing Claude sync with `CC_EIN_HOME` pointing to an isolated temporary home creates `assets/orchestrator.md`.
2. The destination is a regular file and its bytes equal the canonical source bytes exactly (not merely equivalent text or matching size).
3. Existing sync behavior and unrelated dirty work remain untouched.

## Repository and SDD context
- Stack: TypeScript ESM monorepo, Bun runtime/package manager, Bun test runner.
- Existing SDD config: `strict_tdd: true`; apply/verify runner is `bun test`; installer typecheck is `cd installer && bun run typecheck`. This scope phase records the stance and does not run tests or builds.
- Existing change stance: `preflight.json` records strict TDD; `lane.json` records standard.
- Relevant canonical OpenSpec domain inspected: `openspec/specs/surface-wiring/spec.md` (5,389 bytes, SHA-256 `974b48743bb60c5c7fb32600e4a71f09f744fea09fd8b8dfece3bd1f2e1fbd31`). The behavior delta is persisted under `specs/surface-wiring/spec.md`; no `spec_delta: none` declaration is used.

## Dirty-work protection
At scope time, unrelated dirty A1–A3 files are present in `installer/install.sh`, `installer/src/cli/install.ts`, `installer/src/core/settings.ts`, `tests/deploy-settings.test.ts`, `tests/install-plan.test.ts`, and `tests/install-sh-checksum.test.ts`; the dogfooding plan is untracked at `docs/plan-hallazgos-dogfooding-2026-08.md`. Later phases must not reset, rewrite, stage, or otherwise absorb these paths.

## Phase boundary
This artifact is scope only. Mapping/design/tasks/apply/verify/close artifacts are not authored here; tests, builds, and implementation are deferred to their respective phases.
