status: complete

# Apply progress — zero-friction-sdd-start

## Completed tasks

- 1.1–1.2: Extracted the OpenSpec detector, renderer, directory setup, and exclusive create-if-absent boundary into `openspec-config-bootstrap.ts`; added isolated raw-byte preservation coverage.
- 2.1–2.2: Composed bootstrap after cached SDD preflight for explicit input and lazy SDD-agent startup while preserving `action: "continue"`; documented initial scope entry and retained later interactive gates.
- 3.1–3.2: Made absent `tasks.md` non-actionable only while scope/map/design is current; tasks and later failure paths remain visible.
- 4.1–4.2: Kept `/sdd-init` registered with its created/preserved notifications and moved its filesystem semantics to the shared module; preserved exactly one `sdd-scope` inventory row.
- 5.1: Completed required focused tests, typecheck, whitespace validation, and config/inventory checks.

## Files changed

- `ein-pi/agent/lib/openspec-config-bootstrap.ts`
- `ein-pi/agent/extensions/sdd-init.ts`
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/lib/sdd-router.ts`
- `ein-pi/agent/assets/orchestrator.md`
- `tests/sdd-config-bootstrap.test.ts`
- `tests/sdd-router.test.ts`
- `tests/sdd-status-output.test.ts`
- `tests/sdd-flow-contract.test.ts`
- `openspec/changes/zero-friction-sdd-start/tasks.md`
- `openspec/changes/zero-friction-sdd-start/apply-progress.md`

## TDD Cycle Evidence

| Work unit | RED | GREEN | TRIANGULATE / REFACTOR |
| --- | --- | --- | --- |
| Shared bootstrap | `bun test tests/sdd-config-bootstrap.test.ts` failed because the new module did not exist. | Same test passed: 3 tests / 11 expectations. | Covers generated config/directories, arbitrary CRLF raw-byte preservation, and repeated preservation; manual command was refactored to delegate after this green boundary. |
| Startup continuation | `bun test tests/sdd-flow-contract.test.ts` failed because `ein-ai.ts` lacked the bootstrap import/composition and orchestrator wording. | `bun test tests/sdd-config-bootstrap.test.ts tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts` passed: 20 tests. | Validated explicit continuation, lazy SDD-agent bootstrap, exactly one inventory row, and retained later phase gate wording. |
| Phase-relative status | `bun test tests/sdd-router.test.ts tests/sdd-status-output.test.ts` failed on visible `tasks.md ausente.` during scope. | Same tests passed: 36 tests / 79 expectations. | Covers scope/map/design suppression plus actionable tasks absence, partial/blocked apply, and failed verify behavior. |
| Integrated refactor | Shared-boundary RED/GREEN above preceded the `/sdd-init` extraction; no additional behavior was introduced by the refactor. | `bun test tests/sdd-config-bootstrap.test.ts tests/sdd-flow-contract.test.ts` passed: 18 tests. | Static contract confirms `/sdd-init` registration, shared delegation, and distinct created/preserved output. |

## Verification

- `bun test tests/sdd-config-bootstrap.test.ts tests/sdd-router.test.ts tests/sdd-status-output.test.ts tests/sdd-flow-contract.test.ts tests/sdd-preflight-tdd-gate.test.ts` — passed: 57 tests, 132 expectations.
- `cd installer && bun run typecheck` — passed (`tsc --noEmit`).
- `git diff --check` — passed.
- `git diff -- openspec/config.yaml` — empty; the config was not mutated.
- Inventory check `grep -c '| \`sdd-scope\` |' ein-pi/agent/assets/orchestrator.md` — `1`.

## Deviations from design

None. The existing `openspec/config.yaml` was not changed, and no later-phase artifact was created.

## Remaining tasks

None.
