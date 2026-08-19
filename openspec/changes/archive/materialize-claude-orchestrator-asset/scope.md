# Scope — materialize-claude-orchestrator-asset

## Scope packet
scope: Final A4 slice: validate and extract the packaged Claude payload, materialize it through the existing installer hand-off, and prove the canonical orchestrator asset reaches the installed Claude home at `assets/orchestrator.md`, including compiled BunFS smoke portability. Reuse the archived transport contract from `package-claude-orchestrator-asset` and checkout sync contract from `deploy-claude-orchestrator-asset`; do not reimplement either.
budget_allocated:
  max_tokens: 12000
  max_reads: 24
  max_runtime_ms: 120000

## Context and configuration
- Stack: Bun-managed TypeScript/ESM monorepo; installer code is under `installer/`, Claude checkout sync under `cc-ein/`, and tests under `tests/`.
- Existing `openspec/config.yaml`: `strict_tdd: true`; runner `bun test`; installer typecheck `cd installer && bun run typecheck`. The project also requires root `bun run typecheck` (covers `ein-pi/` and `cc-ein/`) and both typechecks must be run in verify, not scope.
- Existing runtime path already stages the payload with `stageCcEinPayload`, invokes `cc-ein/sync.ts` from the staged root, and cleans up. The release workflow already wires compiled BunFS smoke at `.github/workflows/installer-release.yml`; change workflow only if focused implementation proves an existing required command is not wired.
- No tests, builds, or typechecks were run in this scope phase. No source was edited.

## Canonical OpenSpec context
Only the explicitly relevant canonical domains were consulted:
- `openspec/specs/claude-payload-transport/spec.md` — 905 bytes; SHA-256 `ddadb8ae71d370758cd814e62ab04dbfcce00db10354bbb62dfde09ba785c747`.
- `openspec/specs/surface-wiring/spec.md` — 6036 bytes; SHA-256 `2229a2dc97b905b083d5e77a3ee4a3555dce581205447b047510fa5d1a054b0c`.

The active behavior delta is persisted under `specs/installer-runtime/spec.md`; no `spec_delta: none` declaration is used.

## Bounded production scope
1. Validate the packaged payload using the existing required-path and manifest/checksum checks; reject incomplete, malformed, or invalid payloads fail-closed.
2. Extract/materialize the packaged archive using the existing `stageCcEinPayload` seam, including the archive copy that makes BunFS-embedded assets available as a real filesystem path.
3. Hand the staged checkout to the existing `cc-ein/sync.ts` runtime path so the installed Claude home receives `assets/orchestrator.md` at the promised path with byte parity.
4. Add focused coverage for the final hand-off and compiled BunFS portability only where existing tests do not already prove it. Preserve transport inventory/bundler files and tests rather than duplicating their contract.

## Focused verification targets
- `bun test tests/cc-payload-entrypoints.test.ts tests/cc-payload-bundle.test.ts tests/installer-runtime-menu.test.ts tests/surface-wiring.test.ts tests/release-asset-contract.test.ts`
- Compiled smoke (same existing workflow command): from `installer/`, `bun build scripts/cc-payload-smoke.ts --compile --target=bun-linux-x64 --outfile /tmp/ein-cc-payload-smoke`, then `(cd /tmp && /tmp/ein-cc-payload-smoke)`.
- `bun run typecheck`
- `cd installer && bun run typecheck`

## Explicit non-goals
- Do not reimplement or alter the archived payload transport contract or checkout sync contract.
- No publication, release, checksums, versioning, or broader release mechanics; workflow edits are permitted only to wire an already-required smoke command if genuinely missing.
- No changes to canonical asset content, Pi behavior, unrelated installer behavior, or Cleaner parser hardening. Cleaner risks (relative-import traversal outside `repoRoot` and unsupported static side-effect-only imports) remain out of scope.

## Preservation constraints
Preserve byte-for-byte and without reset/revert/staging:
- canonical `ein-pi/agent/assets/orchestrator.md` (42,926 bytes; SHA-256 `0e051f27e1d4e9a6e9d67e014f47496ce4a0a5ee2a3e027b53eced0b32784de1`);
- archived transport inventory/bundler files and tests;
- archived checkout sync files and tests;
- A1–A3 dirty files, including `installer/install.sh`, `installer/src/cli/install.ts`, `installer/src/core/settings.ts`, `installer/src/core/cc-payload-inventory.ts`, `tests/cc-payload-entrypoints.test.ts`, and other existing dirty tests;
- generated `installer/src/assets/cc-ein-runtime.tar.gz` (disposable output, not source);
- untracked `docs/plan-hallazgos-dogfooding-2026-08.md`.

## Phase boundary
Scope only: implementation, tests, archive generation, smoke execution, typechecks, and apply/verify artifacts are deferred to later phases.
