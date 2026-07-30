status: complete

## Group 001 — Deterministic parent research routing

Completed: 1.1, 1.2, 1.3.

- Added static prompt-contract coverage for four-file/two-source-class routing, two routing reads, two material spot-checks, accepted-evidence forwarding, stateless assessment, and one-to-three fresh scouts.
- Tightened the authoritative routing, parent-read, and fan-out sections without touching scout schema, handoff, validator, smoke, or lifecycle implementation.
- Added boundary-negative coverage for three vs. four files, one vs. two source classes, and non-material/broad rediscovery.

TDD Cycle Evidence:

| Cycle | Evidence |
| --- | --- |
| RED | `bun test tests/orchestrator-context-diet.test.ts` failed: 4 new routing-contract assertions absent. |
| GREEN | Updated only `ein-pi/agent/assets/orchestrator.md`; focused suite passed (28 tests). |
| TRIANGULATE | Added boundary-negative assertions; focused suite failed (2 assertions absent), then passed after precise policy wording. |
| REFACTOR | Consolidated policy vocabulary and fan-out test naming; focused suite passed (30 tests). |

Files changed: `ein-pi/agent/assets/orchestrator.md`, `tests/orchestrator-context-diet.test.ts`, `tasks.md`, `apply-progress.md`.

Verification: `timeout 120 bun test tests/orchestrator-context-diet.test.ts` — pass (30 tests).

Deviation: none. Remaining: Groups 002 and 003 only.

## Group 002 — Bounded packet and scout compatibility

Completed: 2.1, 2.2, 2.3.

- Added static packet-contract coverage for inputs, exact ceilings, parent-only synthesis, closed scout fields, and the pre-scope `sdd-map` prohibition.
- Defined the bounded `RESEARCH PACKET` in the parent prompt; it narrows request work while retaining the 120000-ms launch normalizer.
- Updated scout instructions to consume packet boundaries and return only the existing `ein-scout-report/v1` fields; no handoff, validator, smoke, extension, or lifecycle code changed.

TDD Cycle Evidence:

| Cycle | Evidence |
| --- | --- |
| RED | `timeout 120 bun test tests/orchestrator-scope-gate.test.ts` failed: packet inputs/ceilings and parent synthesis contract were absent. |
| GREEN | Added packet and scout boundary wording; focused suite passed (7 tests). |
| TRIANGULATE | Added closed-schema and pre-scope-map negative assertions; focused suite failed (2 assertions absent), then passed (9 tests). |
| REFACTOR | Consolidated repeated static assertions with `expectAll`; focused suite, readonly-scout regression, and installer typecheck passed. |

Files changed: `ein-pi/agent/assets/orchestrator.md`, `ein-pi/core/agents/ein-scout.md`, `tests/orchestrator-scope-gate.test.ts`, `tasks.md`, `apply-progress.md`.

Verification: `timeout 120 bash -c 'bun test tests/orchestrator-scope-gate.test.ts && bun test tests/readonly-scout-contract.test.ts && cd installer && bun run typecheck'` — pass (9 + 12 tests; `tsc --noEmit`); `git diff --check` — pass.

Deviation: none. Remaining: Group 003 only; intentionally not started.

## Group 003 — Work-unit delivery check

Completed: 3.1.

- Measured the current Slice 05 tracked diff only: the two operational prompt assets total 16 changed lines (11 insertions, 5 deletions); focused tests total 73 changed lines (72 insertions, 1 deletion), reported separately.
- The tracked diff contains exactly the four intended files: the two prompt assets and their two focused contract suites. It remains one reversible review unit: revert those prompt-contract assets and tests together, with no schema, state, migration, or lifecycle cleanup.
- Production/operational total is within the 400-line review budget; no decomposition is required. Unrelated untracked paths were left untouched.

Verification: `git diff --shortstat -- ein-pi/agent/assets/orchestrator.md ein-pi/core/agents/ein-scout.md` — 2 files, 11 insertions, 5 deletions; `git diff --shortstat -- tests/orchestrator-context-diet.test.ts tests/orchestrator-scope-gate.test.ts` — 2 files, 72 insertions, 1 deletion; `git diff --name-only` — exactly the four intended tracked files.

Deviation: none. Remaining: none.

## Post-verify remediation

- Restored the canonical `scout-routing` spec header metadata: `format: openspec-spec/v1` and `domain: scout-routing`. Scenario content is unchanged.
- Fresh verification is required because the canonical specification changed after prior verification.

Verification: `bun test tests/openspec-specs.test.ts` — pass (26 tests).
