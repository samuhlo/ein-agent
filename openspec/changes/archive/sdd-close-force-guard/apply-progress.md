status: complete

## // 001. Classify close readiness and declarationless legacy eligibility

Completed 1.1.

- Added router-owned close blocker codes while retaining the existing lifecycle messages in `reasons`.
- Added `legacyEligibility: "declarationless-record" | null`; it is true only for canonical, readable declarationless unresolved records with no delta/sync artifacts and all existing non-spec gates passing.
- Added focused router regressions for blocker shape, message preservation, eligible declarationless records, and declaration/sync/delta/incomplete negatives.
- Changed: `ein-pi/agent/lib/sdd-router.ts`, `tests/sdd-router.test.ts`, `tasks.md`.
- Verified: `bun test tests/sdd-router.test.ts` — 29 pass, 0 fail.
- TDD: off (per session task).
- No force policy, archival movement, close/extension/spec files, or group 002+ work changed.

Remaining: groups 003–005.

## // 002. Enforce fail-closed close policy and truthful escape results

Completed 2.1 and 2.2.

- Added optional `legacyReason` validation at `closeChange`: trimmed, non-empty, ≤200 characters, and rejects placeholder audit values.
- Force now succeeds only for router-proven `declarationless-record` eligibility with no non-spec blockers; all other readiness blockers remain absolute and are returned structurally.
- Successful escapes add `legacyEscape` with the normalized reason and prior unresolved eligibility; normal and unused-force success retain the original result shape.
- Added table-driven force rejection coverage, source/archive no-movement assertions, invalid-reason coverage, multiple blockers, normal result compatibility, and legacy fallback readiness coverage.
- Changed: `ein-pi/agent/lib/sdd-close.ts`, `tests/sdd-close.test.ts`, `tasks.md`.
- Verified: `bun test tests/sdd-close.test.ts tests/sdd-router.test.ts` — 73 pass, 0 fail.
- TDD: off (per `openspec/config.yaml`).
- Deviations: none. Groups 003–005 remain pending and extension/help/spec files were not changed.

## // 003. Wire audited force arguments and narrow help/output

Completed 3.1.

- Wired slash-command `--reason` and tool `reason` through to `closeChange` as `legacyReason`; validation remains solely in the close library.
- Replaced bypass-oriented tool help with the narrow declarationless-record rule, its audit-reason syntax, absolute gates, and no-sync guarantee.
- Distinguished normal verified-close output from the required legacy-escape message in both command and tool output.
- Changed: `ein-pi/agent/extensions/ein-ai.ts`, `tests/sdd-flow-contract.test.ts`, `tasks.md`.
- Verified: `bun test tests/sdd-flow-contract.test.ts tests/sdd-close.test.ts` — 72 pass, 0 fail.
- TDD: off (per `openspec/config.yaml`). Deviations: none.

Remaining: groups 004–005.

## // 004. Correct and synchronize the lifecycle contract

Completed 4.1.

- Deterministic sync evidence in `sync-report.md` is authoritative: `state: synchronized`, `conflicts: 0`, and `domains: sdd-lifecycle`.
- Its `Domain Results` entry reports `domain=sdd-lifecycle` with the synchronized result; the canonical lifecycle scenario matches the reported declarationless-unresolved contract.
- No raw file digest was compared with `delta_sha256`, which is a manifest digest rather than a delta-file digest.
- Changed: `tasks.md`, `apply-progress.md` only in this completion pass.
- Verified: `bun test tests/sdd-flow-contract.test.ts` — 28 pass, 0 fail.
- TDD: off (per `openspec/config.yaml`).

Remaining: none.

## // 005. Review workload forecast and focused regression gate

Completed 5.1.

- Measured only the three in-scope production paths against `HEAD`: +126/-49, 175 changed lines, within both the task forecast (≤280) and 400-line review gate.
- Measured focused tests separately: +150/-57, 207 changed lines. Docs/specs: +47/-5, 52 changed lines. Generated files: 0.
- Verified: `bun test tests/sdd-close.test.ts tests/sdd-router.test.ts tests/sdd-flow-contract.test.ts` — 101 pass, 0 fail.
- Verified: `git diff --check --` on the six in-scope production/test paths — clean.
- TDD: off (per `openspec/config.yaml`). Deviations: none. No source, tests, or specs were modified by this group.

Remaining: none.
