status: complete

## Group 001 — Content-authority contract and pure gate decisions

Completed:
- Added `ein-pi/agent/lib/delivery-receipt.ts` with explicit `verified-sdd` and `mechanical-unverified` declarations.
- Mechanical mode accepts only the literal `no-verification-receipt-applies`; absent, malformed, unsafe, ambiguous, or conflicting declarations fail closed.
- Added pure structured pass/fail gate decisions for the four named boundaries and a fixed `sdd-verify` recovery route.
- Kept this module independent of intent grants, grant storage, `git-delivery.ts`, and `guardrails.ts`.

Verification:
- `bun test tests/candidate-receipt.test.ts` — 42 passed.
- `(cd installer && bun run typecheck)` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.

Deviations: none.
Remaining: Groups 002–006 are unchecked; Group 002 was not started.

## Group 002 — Foundational receipt and tree identity adapter

Completed:
- Added fresh receipt validation with a stable in-process fingerprint; every gate rereads and validates current receipt evidence, rejecting replacement without emitting or rewriting it.
- Added injected pre-commit observations for base HEAD, reconstructed candidate tree, and real index tree; all must match the receipt tree where applicable.
- Added injected post-commit HEAD and `HEAD^{tree}` observations; only a matching committed tree retains the validated delivery head.
- Added deterministic temporary-repository coverage for matching/divergent pre-commit identities, post-commit hook-like mutation, and absent/malformed/stale/replaced receipts.

Files changed:
- `ein-pi/agent/lib/candidate-receipt.ts`
- `ein-pi/agent/lib/delivery-receipt.ts`
- `tests/candidate-receipt.test.ts`
- `openspec/changes/delivery-receipt-gates/tasks.md`

Verification:
- `bun test tests/candidate-receipt.test.ts` — 45 passed.
- `(cd installer && bun run typecheck)` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.
Deviations: none. Guardrail grant behavior was not modified.
Remaining: Groups 003–006 are unchecked; Group 003 was not started.

## Group 003 — Git, head, and remote identity adapters

Completed:
- Added fresh pre-push checks for the selected SHA source and its tree against the post-commit validated delivery head and receipt tree.
- Added fresh pre-PR checks for explicit local, effective remote, and applicable existing-PR heads; only an absent existing PR is non-applicable, while unresolved or divergent identity fails closed.
- Preserved the in-process receipt fingerprint and validated head only; no receipt emission/replacement or intent-grant behavior changed.
- Added deterministic temporary-repository coverage for changed push source/tree and unresolved/divergent local, remote, and existing-PR heads.

Files changed:
- `ein-pi/agent/lib/delivery-receipt.ts`
- `tests/candidate-receipt.test.ts`
- `openspec/changes/delivery-receipt-gates/tasks.md`

Verification:
- `bun test tests/candidate-receipt.test.ts` — 47 passed.
- `(cd installer && bun run typecheck)` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.
Deviations: none. Group 004 delivery-command wiring was not started.
Remaining: Groups 004–006 are unchecked.

## Group 004 — Four visible ein-git delivery boundaries

Completed:
- Added one mandatory visible delivery-content declaration: named `verified-sdd` or the exact `mechanical-unverified: no-verification-receipt-applies` declaration.
- Kept the user-intent grant independent and unchanged; mechanical delivery is explicitly unverified, never inferred, and never a fallback after verified-SDD failure.
- Documented independent fresh receipt/identity gates immediately pre-commit, post-commit against `HEAD^{tree}`, pre-push with a captured SHA refspec, and pre-PR with explicit local, effective remote, and existing-PR heads.
- Preserved non-interactive PR flags and mandatory JSON read-back; every verified-SDD identity failure stops with the `sdd-verify` re-verify/new-receipt/restart route.

Files changed:
- `ein-pi/core/agents/ein-git.md`
- `openspec/changes/delivery-receipt-gates/tasks.md`
- `openspec/changes/delivery-receipt-gates/apply-progress.md`

Verification:
- `bun test tests/ein-git-noninteractive.test.ts tests/candidate-receipt.test.ts` — 55 passed.
- `(cd installer && bun run typecheck)` — passed.
- `git diff --check` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.
Deviations: none. Runtime helpers and intent-grant behavior were not modified; Group 005 was not started.
Remaining: Groups 005–006 are unchecked.

## Group 005 — Focused regression coverage without grant-semantic changes

Completed:
- Added prompt-contract assertions for the explicit unverified mechanical declaration, all four ordered delivery boundaries, the visible `sdd-verify` route-back, and pre-PR required-head mismatch failure.
- Strengthened the sticky-intent regression to retain the same live intent object across neutral messages.
- Locked grant emission to the existing 10-minute, cwd-scoped, three-use shape; existing focused coverage retains legacy one-use grants, confirmation modes, and force-push denial.

Files changed:
- `tests/ein-git-noninteractive.test.ts`
- `tests/git-delivery.test.ts`
- `tests/guardrails.test.ts`
- `openspec/changes/delivery-receipt-gates/tasks.md`
- `openspec/changes/delivery-receipt-gates/apply-progress.md`

Verification:
- `bun test tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts` — 55 passed.
- `(cd installer && bun run typecheck)` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.
Deviations: none. `git-delivery.ts` and `guardrails.ts` production code were untouched.
Remaining: Group 006 is unchecked and was not started.

## Group 006 — Synchronize lifecycle record and complete roadmap slice

Completed:
- Confirmed generated `sync-report.md` is synchronized and conflict-free (`conflicts: 0`); its domain result hash matches the current canonical lifecycle spec (`1dd2574c…`).
- Confirmed the delta retains `ADDED` before `MODIFIED`; canonical spec and generated sync evidence were not edited.
- Marked the roadmap slice completed with evidence for Groups 001–005 and the final focused verification.

Files changed:
- `docs/quality-roadmap/04-delivery-receipt-gates.md`
- `openspec/changes/delivery-receipt-gates/tasks.md`
- `openspec/changes/delivery-receipt-gates/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts tests/openspec-specs.test.ts` — 128 passed.
- `(cd installer && bun run typecheck)` — passed.
- `git diff --check` — passed.

TDD Cycle Evidence: not required; session and change declare TDD off.
Deviations: none. No production runtime, agent contract, tests, canonical spec, or sync evidence changed in this group.
Remaining: none.

## Group 007 — Archived receipt evidence resolution

Completed:
- Resolved receipt preconditions and verify evidence through exactly one live or archived change location; absent or duplicate locations fail closed.
- Required archived evidence to retain complete apply, fresh passing verify, and a current close summary; receipt format and administrative storage remain unchanged.
- Added deterministic coverage for archived and live success, absent/ambiguous locations, failing/stale archived evidence, and archived manifest/tree validation.
- Reconciled the OpenSpec delta after deterministic sync reported five `added-existing` conflicts: removed `## ADDED` and placed the five already-canonical delivery-gate scenarios, `candidate-receipt-delivery-limit`, and the archived-evidence update for `candidate-receipt-emission-preconditions` under one `## MODIFIED` section.

Files changed:
- `ein-pi/agent/lib/candidate-receipt.ts`
- `tests/candidate-receipt.test.ts`
- `openspec/changes/delivery-receipt-gates/specs/sdd-lifecycle/spec.md`
- `openspec/changes/delivery-receipt-gates/tasks.md`
- `openspec/changes/delivery-receipt-gates/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts` — 52 passed.
- `(cd installer && bun run typecheck)` — passed.
- Late reconciliation: no tests or build run (classification-only delta repair); parent will rerun deterministic sync and full verify.

TDD Cycle Evidence: not required; TDD is off.
Deviations: the prior delta named the archived-evidence update `delivery-receipt-archive-resolution`; it now targets the canonical `candidate-receipt-emission-preconditions` scenario so the MODIFIED operation has a canonical base. Canonical spec, sync report, summary, and verify report were not edited.
Remaining: none.

## Group 008 — Compact review-budget remediation

Completed:
- Deduplicated boundary identity comparisons in `delivery-receipt.ts` through one typed, data-driven helper while retaining four independent gate functions, fresh per-boundary observations, fail-closed reasons, receipt fingerprint continuity, and explicit mechanical-unverified handling.
- Preserved live/archive unique resolution and archived evidence requirements in `candidate-receipt.ts` without changes.
- Reduced the untracked delivery helper from 219 to 186 lines: the active change production workload drops from the reported 430 to 397 changed lines, within the `<=400` limit.

Files changed:
- `ein-pi/agent/lib/delivery-receipt.ts`
- `openspec/changes/delivery-receipt-gates/tasks.md`
- `openspec/changes/delivery-receipt-gates/apply-progress.md`

Verification:
- `bun test tests/candidate-receipt.test.ts tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts tests/openspec-specs.test.ts` — 133 passed.
- `(cd installer && bun run typecheck)` — passed.
- `git diff --check` — passed.

TDD Cycle Evidence: not required; TDD is off.
Deviations: none. `verify-report.md` and `summary.md` were intentionally left stale for regeneration.
Remaining: none.
