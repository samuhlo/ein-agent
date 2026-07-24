# Tasks — delivery-receipt-gates

status: ready
blocked_by: none
production_forecast: 180–320 changed lines across `ein-pi/agent/lib/delivery-receipt.ts`, `ein-pi/agent/lib/candidate-receipt.ts`, and `ein-pi/core/agents/ein-git.md` (within the 400-line budget)
tdd: off (tests are required; formal RED/GREEN/TRIANGULATE evidence is not required)

## // 001. Content-authority contract and pure gate decisions

- [x] 1.1 Create `ein-pi/agent/lib/delivery-receipt.ts` with the discriminated `verified-sdd` / `mechanical-unverified` content-authority declaration, requiring the exact `no-verification-receipt-applies` literal, plus pure structured gate pass/fail and verify-reroute decision primitives.
  - skills: `architecture`, `comment-style`, `file-naming`, `bun`, `vitest`
  - why: delivery needs a narrow, explicit content authority that cannot be inferred from a missing receipt or confused with user intent.
  - learn: an authorization to act and evidence for exact bytes are separate facts; neither proves the other.
  - architecture: keep declaration parsing, receipt fingerprint continuity, boundary/reason results, and `sdd-verify` recovery text in one pure delivery-content module; do not import or alter intent-grant state.
  - avoid: adding mode inference to `git-delivery.ts`, extending grant storage, or treating a missing receipt as mechanical delivery.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

## // 002. Foundational receipt and tree identity adapter

- [x] 2.1 Extend `ein-pi/agent/lib/candidate-receipt.ts` and `ein-pi/agent/lib/delivery-receipt.ts` with deterministic adapters for fresh receipt validation, candidate/base/index tree comparison, and post-hook `HEAD^{tree}` comparison; fail closed on absent or unresolvable identity without emitting or replacing a receipt.
  - skills: `architecture`, `comment-style`, `logging-style`, `bun`, `vitest`
  - why: pre-commit and post-commit gates need the receipt and Git tree representations authoritative at their respective boundaries.
  - learn: a reconstructed worktree tree is useful before commit, but only `HEAD^{tree}` proves what a hook actually committed.
  - architecture: preserve `candidate-receipt.ts` as receipt emission/validation owner and use injected deterministic Git observations in `delivery-receipt.ts`; retain only in-process receipt fingerprint and validated delivery-head state for one attempt.
  - avoid: caching an early comparison for later gates, creating a persistent delivery journal, changing receipt version/emission, or changing `guardrails.ts` grant issuance/consumption.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

- [x] 2.2 Extend `tests/candidate-receipt.test.ts` with deterministic temporary-repository coverage for matching and divergent pre-commit candidate/base/index identities, hook-like committed-tree mutation against `HEAD^{tree}`, and missing/malformed/stale/replaced receipt evidence.
  - skills: `bun`, `vitest`, `architecture`, `comment-style`
  - why: the foundational receipt and tree adapter must prove both commit boundaries independently without network access.
  - learn: testing the index before commit and the committed tree after hooks exposes different time-of-check/time-of-use failures.
  - architecture: exercise pure adapters with injected observations and the existing isolated Git fixture; do not turn prompt tests into Git integration tests.
  - avoid: a single happy-path assertion for both gates, a test helper that mutates the real Git index, or networked `gh` tests.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

## // 003. Git, head, and remote identity adapters

- [x] 3.1 Extend `ein-pi/agent/lib/delivery-receipt.ts` with deterministic adapters for SHA-selected push-source comparison and local/remote/existing-PR head comparison; fail closed on absent or unresolvable identity without emitting or replacing a receipt.
  - skills: `architecture`, `comment-style`, `logging-style`, `bun`, `vitest`
  - why: push and PR gates need fresh, boundary-local commit and effective-head observations after post-commit validation.
  - learn: a branch name is mutable, while a validated commit SHA makes the source identity explicit.
  - architecture: use injected deterministic Git/GitHub observation functions in `delivery-receipt.ts` and require every applicable head to equal the in-process validated delivery head.
  - avoid: caching an early comparison for later gates, selecting a different branch on failure, creating a persistent delivery journal, or changing `guardrails.ts` grant issuance/consumption.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

- [x] 3.2 Extend `tests/candidate-receipt.test.ts` with deterministic coverage for changed selected push head/tree and unresolved/divergent effective local, remote, and existing-PR heads.
  - skills: `bun`, `vitest`, `architecture`, `comment-style`
  - why: the Git/head/remote adapters must prove that each later boundary observes current identity rather than relying on prior success.
  - learn: deterministic observation seams make remote races testable without a live GitHub service.
  - architecture: exercise pure adapters with injected observations and the existing isolated Git fixture; keep prompt-contract coverage separate.
  - avoid: networked `gh` tests, a single happy-path assertion for all later gates, or a test helper that mutates the real Git index.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

## // 004. Four visible ein-git delivery boundaries

- [x] 4.1 Update `ein-pi/core/agents/ein-git.md` to require exactly one visible delivery-content declaration and place four independent verified-SDD gates immediately before commit, after `git commit`, immediately before SHA-pinned push, and immediately before PR create/update; retain the unchanged intent-grant gate and label mechanical delivery as unverified.
  - skills: `architecture`, `comment-style`, `logging-style`, `bun`, `vitest`
  - why: the delivery agent contract is the mapped execution seam that must prevent a valid early check from authorizing later divergent content.
  - learn: boundary-local checks reduce time-of-check/time-of-use gaps caused by hooks, branch movement, and remote changes.
  - architecture: require named staging plus a matching real index tree before commit; after hooks capture `HEAD` only when `HEAD^{tree}` matches; push the captured SHA rather than a branch name; never let this contract mint, consume, or reinterpret the user-intent grant.
  - avoid: collapsing the four checks into pre-commit, pushing a mutable branch ref, or describing mechanical delivery as verified SDD.
  - verify: `bun test tests/ein-git-noninteractive.test.ts tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

- [x] 4.2 In `ein-pi/core/agents/ein-git.md` require pre-PR resolution of the explicit local `--head`, effective remote branch head, and existing PR head when applicable, all equal to the validated delivery head; retain post-mutation JSON read-back and make every receipt/identity failure visibly stop and return to `sdd-verify` to re-verify, emit a new receipt, and restart.
  - skills: `architecture`, `comment-style`, `logging-style`, `bun`, `vitest`
  - why: a matching local branch does not prove the actual PR head, and a non-transactional remote read still needs mandatory read-back.
  - learn: fail-closed recovery must tell the operator the single safe next action instead of silently repairing evidence.
  - architecture: resolve remote/PR state through the deterministic adapter contract before `gh` mutation, preserve explicit non-interactive flags and existing JSON read-back, and never downgrade a failed verified-SDD attempt to mechanical mode.
  - avoid: relying on current `HEAD` alone, checking PR state only after mutation, automatically refreshing the receipt, or retrying with a different head.
  - verify: `bun test tests/ein-git-noninteractive.test.ts tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

## // 005. Focused regression coverage without grant-semantic changes

- [x] 5.1 Extend `tests/ein-git-noninteractive.test.ts`, `tests/git-delivery.test.ts`, and `tests/guardrails.test.ts` to assert the four prompt boundaries, explicit mechanical declaration, verify route-back, and pre-PR head mismatch language while regression-locking unchanged sticky intent, confirmation modes, 10-minute cwd-scoped three-use/legacy grants, and force-push denial.
  - skills: `bun`, `vitest`, `architecture`, `comment-style`
  - why: the new content authority must be visible without changing the independent user-intent authority.
  - learn: regression tests protect non-goals when two security controls sit beside each other.
  - architecture: keep delivery-mode/parser assertions only where their owner changes; leave `git-delivery.ts` and `guardrails.ts` production code untouched unless typed context is demonstrably necessary.
  - avoid: asserting only new text while losing existing grant invariants, or coupling receipt validation to grant consumption in tests or production.
  - verify: `bun test tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts && (cd installer && bun run typecheck)`

## // 006. Synchronize the lifecycle record and complete the roadmap slice

- [x] 6.1 Only after groups 001–005 are green, synchronize `openspec/changes/delivery-receipt-gates/specs/sdd-lifecycle/spec.md` into `openspec/specs/sdd-lifecycle/spec.md`, retain the generated `openspec/changes/delivery-receipt-gates/sync-report.md`, and update `docs/quality-roadmap/04-delivery-receipt-gates.md` from planned to completed with its acceptance/checklist evidence.
  - skills: `ein-discipline`, `architecture`, `bun`, `vitest`, `work-unit-commits`
  - why: the canonical lifecycle and roadmap must record delivered behavior only after its focused evidence passes.
  - learn: an OpenSpec delta is a proposal until deterministic synchronization records the canonical result.
  - architecture: preserve the delta’s ADDED-before-MODIFIED order and change only the mapped lifecycle/roadmap records; keep generated sync evidence tied to this change.
  - avoid: marking the roadmap complete before behavior is green, editing unrelated lifecycle scenarios, or treating documentation completion as a substitute for verification.
  - verify: `bun test tests/candidate-receipt.test.ts tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts tests/openspec-specs.test.ts && (cd installer && bun run typecheck)`

## // 007. Archived receipt evidence resolution

- [x] 7.1 Resolve candidate receipt evidence from exactly one live or archived SDD location; reject absent and duplicate locations, while requiring complete apply, fresh passing verify, and a current close summary for archived evidence.
  - skills: `ein-discipline`, `architecture`, `comment-style`, `bun`, `vitest`
  - why: normal delivery follows deterministic close, so a receipt must retain its evidence path after the change moves to archive.
  - architecture: keep archive lookup local to candidate-receipt; do not alter active-change listing, status routing, grants, or delivery gates.
  - avoid: silently preferring live evidence, changing receipt format/location, or editing canonical spec/sync output.
  - verify: `bun test tests/candidate-receipt.test.ts && (cd installer && bun run typecheck)`

## // 008. Compact review-budget remediation

- [x] 8.1 Refactor only the delivery receipt implementation to reduce this change's production review workload to at most 400 changed lines while preserving every receipt, archive-resolution, and four-gate contract.
  - skills: `architecture`, `comment-style`, `bun`, `vitest`
  - verify: `bun test tests/candidate-receipt.test.ts tests/ein-git-noninteractive.test.ts tests/git-delivery.test.ts tests/guardrails.test.ts tests/openspec-specs.test.ts && (cd installer && bun run typecheck) && git diff --check`
