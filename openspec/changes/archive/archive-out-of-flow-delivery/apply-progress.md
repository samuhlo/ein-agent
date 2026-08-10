status: complete

## // 001. Foundational reconciliation contract and pure validator

Completed tasks: 1.1, 1.2.

Implemented a deterministic `scope-only-out-of-flow` evidence contract and pure validator. Eligibility is structural and accepts either a genuinely declarationless record or exactly one valid `spec_delta:none` declaration; no change-name allowlist exists. Validation fails closed across profile/version, identity, reason, summary, check, freshness, and repository-state families. Evidence commands remain inert strings.

Files changed:
- `ein-pi/agent/lib/sdd-reconciliation.ts`
- `tests/sdd-reconciliation.test.ts`
- `openspec/changes/archive-out-of-flow-delivery/tasks.md`
- `openspec/changes/archive-out-of-flow-delivery/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Valid structurally eligible evidence is accepted without name policy | Missing-module failure, 0 pass / 1 fail / 1 error | Happy path and profile/reason seam, 2 pass | Both declarationless and valid `spec_delta:none` names pass | `bun test tests/sdd-reconciliation.test.ts` — 11 pass, 0 fail |
| Malformed, mismatched, or ineligible contract evidence is denied | Missing validator made denial contract unavailable | Minimum profile/reason blockers passed | Unknown version, wrong change, invalid reasons, mixed artifacts/spec states covered | `bun test tests/sdd-reconciliation.test.ts` — 11 pass, 0 fail |
| Summary metadata and required narrative are bound | Missing validator was RED | Valid summary passed | Freshness, path/hash/bytes, excluded gaps, check references, successors; UTF-8 byte mutation exposed missing validation | `bun test tests/sdd-reconciliation.test.ts` — 11 pass, 0 fail |
| Checks are concrete, passing, current, state-identical, and never executed | Missing validator was RED | One current passing check passed | Duplicate/non-concrete/failing/stale/mixed/current-state cases; future completion initially failed as expected | `bun test tests/sdd-reconciliation.test.ts` — 11 pass, 0 fail |

Refactor kept normalization, Markdown section parsing, record eligibility, identity comparison, and blocker de-duplication in small pure helpers. `git diff --check` passed for tracked changes; no filesystem, process, Git, or archive import exists in the validator.

Additional gate: `cd installer && bun run typecheck` — pass.

Deviations: none.
Remaining tasks: groups // 003 through // 006; intentionally not started.

## // 002. Router eligibility and blocker classification

Completed tasks: 2.1, 2.2.

Added explicit router reconciliation classification without changing ordinary close readiness or the declarationless force eligibility. The selected profile accepts generic canonical scope-only records with either no declaration markers or one exact valid `spec_delta:none` declaration; local deltas, sync reports, mixed artifacts, malformed/duplicate/ambiguous declarations, unsupported profiles, and non-canonical records fail closed.

Files changed:
- `ein-pi/agent/lib/sdd-router.ts`
- `tests/sdd-router.test.ts`
- `openspec/changes/archive-out-of-flow-delivery/tasks.md`
- `openspec/changes/archive-out-of-flow-delivery/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Exact generic scope-only records are classified only under the explicit profile | New classification fields were absent: 33 pass, 4 fail | Declarationless and valid declared-none records passed with stable eligibility | Unsupported/absent profile and arbitrary change names covered | `bun test tests/sdd-router.test.ts` — 37 pass, 0 fail |
| Ineligible, mixed, or ambiguous records fail closed | New ineligibility assertions failed on absent classification | Delta, sync-report, lifecycle, malformed and duplicate declaration cases passed | Stray declaration token exposed an ambiguous record incorrectly accepted, then passed after exact outside-block token rejection | `bun test tests/sdd-router.test.ts` — 37 pass, 0 fail |
| Ordinary readiness and declarationless force eligibility remain unchanged | Existing suite stayed green while new contract was RED | Ordinary lifecycle blocker ordering and legacy eligibility retained | Declared-none remains excluded from legacy force; pending/unresolved and synchronized states remain distinct | `bun test tests/sdd-router.test.ts` — 37 pass, 0 fail |

Additional gate: `cd installer && bun run typecheck` — pass. `git diff --check` — pass.
Deviations: none. Vitest and Vue Router skills were not applicable because this slice uses Bun's test runner and contains no Vue routing; skill-registry was read as injected but no skill inventory changed.
Remaining tasks: groups // 003 through // 006; intentionally not started.

## // 003. Core close and archive integration

Completed tasks: 3.1, 3.2.

The close boundary now accepts only explicit reconciliation profile/evidence options, reads the canonical JSON and summary artifacts, independently resolves current Git HEAD/tree identity, aggregates deterministic blockers before mutation, and returns a dedicated `reconciliation` receipt. Ordinary close and declarationless `force`/`legacyEscape` behavior remain unchanged.

Files changed:
- `ein-pi/agent/lib/sdd-close.ts`
- `tests/sdd-close.test.ts`
- `openspec/changes/archive-out-of-flow-delivery/tasks.md`
- `openspec/changes/archive-out-of-flow-delivery/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Explicit eligible reconciliation archives with a distinct receipt | New close options were ignored: 45 pass, 3 fail | Canonical declarationless fixture archived and returned `reconciliation` | Exact `spec_delta:none` shape also succeeds without `legacyEscape` | `bun test tests/sdd-close.test.ts` — 51 pass, 0 fail |
| Denied reconciliation aggregates blockers and never mutates | Mixed-mode/evidence/state assertions had no reconciliation blockers | Mixed mode, collision, malformed evidence and identity blockers aggregate | Non-canonical paths, lifecycle shape, changed HEAD, reason and summary mismatches stay active | `bun test tests/sdd-close.test.ts` — 51 pass, 0 fail |
| Ordinary and force close behavior is preserved | Existing 45 tests stayed green during RED | Existing normal and declarationless force paths remained unchanged | Full focused suite retained conflict, incomplete, unsafe-name and legacy receipt regressions | `bun test tests/sdd-close.test.ts` — 51 pass, 0 fail |

Additional gates: `cd installer && bun run typecheck` — pass; `git diff --check` — pass.
Deviations: none. Vitest was not applicable because this slice uses Bun's runner; skill-registry required no action because no skill inventory changed. No commit was requested.
Remaining tasks: groups // 004 through // 006; intentionally not started. `docs-site-shell` was not closed or modified.

## // 004. Pi surface wiring

Completed tasks: 4.1, 4.2.

Pi's `ein_sdd_close` tool and `/ein:sdd-close` now expose explicit reconciliation profile, canonical evidence path, and audit reason, translating them into shared `CloseOptions`. The slash parser preserves force/reason, forwards malformed or mixed-mode values for core fail-closed validation, and never infers reconciliation. Check/audit remain read-only and unchanged.

Files changed:
- `ein-pi/agent/extensions/ein-ai.ts`
- `ein-pi/agent/lib/sdd-close-args.ts`
- `tests/agent-tools-contract.test.ts`
- `tests/sdd-close-args.test.ts`
- `openspec/changes/archive-out-of-flow-delivery/tasks.md`
- `openspec/changes/archive-out-of-flow-delivery/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Pi close exposes and delegates explicit reconciliation inputs | Tool schema contract failed: 8 pass, 1 fail | Profile/evidence/reason fields and shared close options passed | Existing force/reason plus unchanged check/audit contracts retained | `bun test tests/agent-tools-contract.test.ts` — 9 pass, 0 fail |
| Slash close parses explicit requests without inference | Missing parser module: 0 pass, 1 error | Explicit profile/evidence/reason and legacy force requests passed | Missing values, unsupported profile, arbitrary evidence, and mixed mode remain explicit for core validation | `bun test tests/sdd-close-args.test.ts tests/sdd-aliases.test.ts tests/sdd-flow-contract.test.ts` — 45 pass, 0 fail |

Additional gates: `bun test tests/sdd-close.test.ts` — 51 pass, 0 fail; `cd installer && bun run typecheck` — pass; `git diff --check` — pass.
Deviations: introduced a small deterministic Pi argument parser module so parser behavior is directly testable; policy and validation remain exclusively in shared close logic. Web-design and Nuxt UI skills were not applicable because no UI was changed; skill-registry required no action because no skill inventory changed.
Remaining tasks: groups // 005 and // 006; intentionally not started. `docs-site-shell` was not closed or modified.

## // 005. Claude CLI surface wiring

Completed tasks: 5.1, 5.2.

Claude's `cc-ein-sdd close` now translates `--reconciliation-profile`, `--reconciliation-evidence`, and `--reason` into the shared `closeChange` options. Existing force handling, success/failure exits, blocker reports, and non-archival check behavior remain intact; flag values cannot become implicit change names.

Files changed:
- `cc-ein/sdd-cli/cli.ts`
- `tests/core-parity-openspec.test.ts`
- `openspec/changes/archive-out-of-flow-delivery/tasks.md`
- `openspec/changes/archive-out-of-flow-delivery/apply-progress.md`

### TDD Cycle Evidence

| Behavior seam | RED | GREEN | TRIANGULATE | REFACTOR / final focused command |
| --- | --- | --- | --- | --- |
| Explicit Claude reconciliation flags delegate to shared close success | CLI ignored all three flags: focused suite 4 pass, 3 fail | Valid canonical request archived through shared close | Reason mismatch and force/profile mixed mode retained shared blocker codes and failure exits | `bun test tests/core-parity-openspec.test.ts` — 8 pass, 0 fail |
| Invalid Claude evidence requests fail closed without mutation | CLI emitted ordinary apply/verify/spec blockers instead of reconciliation classification | Exact profile/evidence/reason translation exposed shared validation | Non-canonical evidence path returns `reconciliation-evidence-path-invalid` and leaves source active | `bun test tests/core-parity-openspec.test.ts` — 8 pass, 0 fail |
| Claude check remains non-archival | Initial assertion expected success, exposing the fixture's pre-existing lint failure exit | Existing lint report and exit 1 were retained | Check leaves both source and archive unchanged while close/sync subprocess regressions pass | `bun test tests/core-parity-openspec.test.ts` — 8 pass, 0 fail |

Additional gates: `cd installer && bun run typecheck` — pass; `git diff --check` — pass.
Deviation: the planned `tests/sdd-cli.test.ts` does not exist. The existing focused subprocess Claude SDD CLI suite is `tests/core-parity-openspec.test.ts`, confirmed before RED and extended in place. Vitest was not applicable because the repository uses Bun's runner; documentation skills applied only to the compact progress record.
Remaining task: group // 006 only; intentionally not run. `docs-site-shell` was not closed or modified.

## // 006. Integrated regression and repository verification

Completed task: 6.1.

The integrated regression gate is green. Ordinary close guards, declarationless legacy escape, denied reconciliation non-mutation, and Pi/Claude shared-policy parity remain covered. No production or test files were edited in this verification-only group, and `docs-site-shell` remained untouched.

Verification evidence:
- `bun test tests/sdd-reconciliation.test.ts tests/sdd-router.test.ts tests/sdd-close.test.ts tests/agent-tools-contract.test.ts tests/sdd-cli.test.ts` — pass, 108 tests across 4 discovered files. The listed `tests/sdd-cli.test.ts` path does not exist and Bun ignored it; Claude reconciliation parity was independently exercised by the repository suite in `tests/core-parity-openspec.test.ts`.
- `bun test` — pass, 1415 tests across 105 files, 0 failures.
- `cd installer && bun run typecheck` — pass.
- `git diff --check` — pass.
- `git status --short -- openspec/changes/docs-site-shell` and scoped diff listing — clean; no migration or mutation occurred.

TDD evidence: RED → GREEN → TRIANGULATE → REFACTOR evidence for all behavior seams is retained in groups // 001–// 005 above. This verification-only group added no behavior seam and performed the final integrated focused and repository regressions.

Deviations: the task-listed `tests/sdd-cli.test.ts` remains absent as already documented in group // 005; no file was added or changed to chase that mismatch. The existing Claude subprocess coverage passed in the full suite.
Remaining tasks: none. Post-verify migration of `docs-site-shell` remains intentionally outside this apply.

## Post-verify reconciliation

Reconciled the completed task plan with the actual focused Claude parity suite: all planned `tests/sdd-cli.test.ts` references now point to `tests/core-parity-openspec.test.ts`, including task 5.2 and the aggregate verification command. Completion checkboxes and `status: complete` remain unchanged.

Focused evidence: `bun test tests/core-parity-openspec.test.ts` — 8 pass, 0 fail. No production, test, or verify-report files were modified.
