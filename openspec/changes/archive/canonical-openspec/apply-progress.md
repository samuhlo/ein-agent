status: complete

## Group 001 — Foundational OpenSpec contract and canonical grammar

Completed task: 1.1.

- Added the pure `openspec-spec/v1` contract in `ein-pi/agent/lib/openspec-spec-contract.ts`.
- Defined domain/scenario document types, `<domain>/<scenario-id>` identity, canonical LF serialization, SHA-256, and sorted length-prefixed manifest digests.
- Added focused coverage in `tests/openspec-specs.test.ts` for stable ordering, identity, and digest determinism/boundaries.

Verification: `bun test tests/openspec-specs.test.ts` — passed (4 tests).

## Group 002 — Strict spec and delta parser

Completed task: 2.1.

- Added pure canonical spec/delta grammar validation in `openspec-spec-parser.ts` with structured deterministic errors.
- Covered CRLF, allowed operations, invalid headers, duplicates, and incomplete scenarios.

Verification: `bun test tests/openspec-specs.test.ts` — passed (7 tests).

## Group 003 — Deterministic synchronization and evidence report

Completed tasks: 3.1 and 3.2.

- Added pure all-domain planning, conflict reports, report parsing, deterministic digests, and the filesystem sync adapter.
- Covered deterministic plans, conflict preservation, and idempotent synchronization.

Verification: `bun test tests/openspec-specs.test.ts` — passed (10 tests).

## Group 004 — Delta guardrails, routing state, and close guard

Completed tasks: 4.1 and 4.2.

- Added canonical-only declaration validation: exactly one valid delta mode or consecutive justified `spec_delta: none`; `.sdd` fallback remains legacy.
- Added pure evaluated states (`unresolved`, `pending`, `conflict`, `synchronized`) to router status and close readiness.
- Close now always rejects a non-synchronized canonical spec state, including with `force`; it performs no sync or writes.
- Extended focused guardrail/router/close tests for none/delta conflict, unresolved, pending, malformed, stale report, force rejection, and legacy fallback.

Verification:

- `bun test tests/sdd-guardrails.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts` — passed (72 tests).
- `bun test tests/sdd-router.test.ts` — passed (27 tests) after stale/malformed coverage.
- `cd installer && bun run typecheck` — passed.

TDD Cycle Evidence: not applicable; strict TDD is disabled. Deterministic behavioral tests were added for this group.

Deviations: none. Group 005 was not started.

Remaining tasks: group 005 and 006 remain unchecked.

## Group 005 — Bounded canonical-spec context for scope and design

Completed tasks: 5.1 and 5.2.

- Added scope/design prompt context selection in `ein-ai.ts`: it accepts explicit domain hints, reads only exact `openspec/specs/<domain>/spec.md` paths, records path/SHA-256/bytes, and blocks rather than truncating above 3 files or 32 KiB.
- Design reuses scope references and admits only additional map hints under the same aggregate budget.
- Updated `sdd-scope`, `sdd-design`, and orchestrator contracts; focused tests cover the runtime contract and agent/orchestration wording.

Verification:

- `bun test tests/sdd-scope-packet.test.ts` — passed (12 tests).
- `bun test tests/sdd-flow-contract.test.ts` — passed (22 tests).

TDD Cycle Evidence: not applicable; strict TDD is disabled. Deterministic behavioral/contract coverage was added for exact canonical paths, digests, limits, blocking, and scope/design reuse.

Deviations: none. Group 006 was not started.

Remaining tasks: group 006 remains unchecked.

## Group 006 — Initial sdd-lifecycle canonical specification and change delta

Completed task: 6.1.

- Added the initial `sdd-lifecycle` canonical spec with three confirmed lifecycle scenarios: canonical close readiness, bounded scope/design context, and `.sdd` fallback preservation.
- Added the change-local `openspec-delta/v1` delta with only `ADDED` operations; no other domain or historical change was adopted.
- Ran the deterministic filesystem synchronizer. It created the canonical spec and the versioned local report with `state: synchronized`, three additions, and zero conflicts.

Verification:

- `bun test tests/openspec-specs.test.ts` — passed (10 tests).
- `bun test tests/sdd-flow-contract.test.ts` — passed (22 tests).
- `git diff --check` — passed.

TDD Cycle Evidence: not applicable; strict TDD is disabled. Existing deterministic behavioral and flow-contract tests passed.

Deviations: none. Remaining tasks: none.

## Corrective action — out-of-scope close edit

- Restored the pre-existing placeholder for `openspec/` in `EIN.md`; its descriptive index update belongs to quality-roadmap slice 07, not this change.
- No task checkboxes were modified.

Verification: focused textual check confirmed the restored line and absence of the out-of-scope description.
