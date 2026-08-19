# Scope — package-claude-orchestrator-asset

## Scope packet
scope: Transport half only: extend the Claude payload inventory and bundle/staging/archive pipeline to carry the canonical `ein-pi/agent/assets/orchestrator.md` at its stable payload-relative path, with fail-closed archive and manifest coverage.
budget_allocated:
  max_tokens: 10000
  max_reads: 18
  max_runtime_ms: 120000

## Context and configuration
- Project stack: Bun-managed TypeScript/ESM monorepo; Claude adapter sources live in `cc-ein/`, payload transport and bundling logic live in `installer/src/core/cc-payload-inventory.ts`, `installer/src/core/cc-payload.ts`, and `installer/scripts/bundle-cc-ein.ts`.
- SDD config: `strict_tdd: true`; test runner is `bun test`; typecheck is `cd installer && bun run typecheck`. Apply/verify commands are recorded by config, but this scope phase does not run tests, builds, or typechecks.
- Existing payload format is `ein-cc-payload/v1` with a generated archive and checksum manifest. Generated archives are verification output, never source.

## Bounded production scope
1. Add the canonical orchestrator asset to the payload inventory/required transport contract.
2. Ensure the bundle staging pipeline copies it to exactly `ein-pi/agent/assets/orchestrator.md` without rewriting bytes.
3. Ensure generated archive/manifest output includes the path and digest and fails closed when the canonical input is absent or unreadable.
4. Add or adjust transport-focused tests only as needed by later phases; this phase writes no source and no tests.

The behavior delta is declared in `specs/claude-payload-transport/spec.md`.

## Explicit non-goals
- No extraction or materialization behavior.
- No installer runtime hand-off or checkout/runtime synchronization semantics.
- No compiled BunFS smoke test.
- No release workflow changes.
- No implementation of downstream runtime consumption; those concerns belong to the future SDD change `materialize-claude-orchestrator-asset`.

## Preservation constraints
Do not overwrite, revert, stage, or otherwise alter existing work outside this change. In particular preserve:
- canonical `ein-pi/agent/assets/orchestrator.md` (observed 42,926 bytes; SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`);
- dirty `cc-ein/sync.ts`;
- dirty `tests/surface-wiring.test.ts`;
- A1–A3 work files: `installer/install.sh`, `installer/src/cli/install.ts`, and `installer/src/core/settings.ts`;
- the untracked dogfooding document `docs/plan-hallazgos-dogfooding-2026-08.md`.

## Existing-worktree boundary
The worktree already contains unrelated modifications and an untracked archive change. The apply phase must isolate its edits to the bounded transport implementation/tests and this change directory; generated `installer/src/assets/cc-ein-runtime.tar.gz` remains disposable verification output and must not be treated as source.

## Phase boundary
This is scope only. No source was edited, no generated archive was produced, and no test/build/typecheck command was run.
