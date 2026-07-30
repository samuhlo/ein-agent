# Tasks — candidate-receipt-retirement-hardening

status: ready
blocked_by: none

## // 001. Restore historical evidence and canonical baseline

- [x] 1.1 Extract, digest, and restore the six archived artifacts byte-for-byte from `1f89b0f`, without touching retained source hardening.
  - skills: `ein-discipline`, `architecture`, `bun`
  - files: before: the current working-tree bytes of `openspec/changes/archive/candidate-receipt-retirement/{apply-progress.md,design.md,specs/sdd-lifecycle/spec.md,summary.md,sync-report.md,verify-report.md}`; after: each path exactly equals `git show 1f89b0f:<path>`.
  - why: Historical reports must describe only the original verified change, not later hardening.
  - learn: Provenance repair restores recorded bytes; it does not undo useful implementation changes.
  - architecture: Archived evidence is immutable historical ownership, separate from the sibling change's evidence.
  - avoid: Do not edit, regenerate, synchronize, or reinterpret the original archive; do not roll back `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`, or `ein-pi/agent/lib/candidate-receipt.ts`.
  - acceptance: `historical evidence integrity` — restored archive bytes are original truth and make no post-review coverage claim.
  - verify: `for path in openspec/changes/archive/candidate-receipt-retirement/apply-progress.md openspec/changes/archive/candidate-receipt-retirement/design.md openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md openspec/changes/archive/candidate-receipt-retirement/summary.md openspec/changes/archive/candidate-receipt-retirement/sync-report.md openspec/changes/archive/candidate-receipt-retirement/verify-report.md; do cmp "$path" <(git show "1f89b0f:$path") || exit 1; done`

- [x] 1.2 Restore `openspec/specs/sdd-lifecycle/spec.md` from the verified `1f89b0f` blob while retaining a temporary pre-apply snapshot for rollback until sibling synchronization succeeds.
  - skills: `ein-discipline`, `architecture`
  - files: before: current canonical `openspec/specs/sdd-lifecycle/spec.md`; after: exact `1f89b0f:openspec/specs/sdd-lifecycle/spec.md` baseline, pending the separate deterministic sibling sync group.
  - why: The canonical spec must begin from clean historical provenance so the sibling owns only its six additions.
  - learn: Baseline restoration and synchronization are separately auditable operations even when performed in one blocked delivery flow.
  - architecture: Canonical lifecycle state is derived from a baseline plus deltas; it is not hand-maintained from an already-polluted result.
  - avoid: Do not manually preserve or copy the sibling scenarios into canonical during restoration, and retain the temporary baseline only until deterministic sibling sync completes.
  - acceptance: `ordered canonical ownership` — canonical restoration precedes sibling synchronization and interruption can restore the pre-apply snapshot.
  - verify: `cmp openspec/specs/sdd-lifecycle/spec.md <(git show '1f89b0f:openspec/specs/sdd-lifecycle/spec.md')`

## // 002. Correct bounded remote-adapter coverage

- [x] 2.1 Add one injected-runner merged-PR JSON fixture and exact normalized-result assertion to the remote adapter test, including command arguments, timeout, and propagated abort signal.
  - skills: `typescript-advanced-types`, `bun`, `comment-style`
  - files: before: `tests/candidate-receipt-retirement-remote.test.ts` has failure-path coverage but no successful merged-PR normalization proof; after: it drives `observeMergedPullRequest` with valid same-repository merged JSON and asserts `repository`, `prNumber`, `url`, `state`, `headRepository`, `headRef`, `baseRef`, `headRefOid`, and `mergeCommitOid`.
  - why: The observable adapter boundary needs a deterministic happy-path proof, not just failure coverage or helper inspection.
  - learn: Injecting the command runner tests external normalization without network-dependent GitHub tests.
  - architecture: `candidate-receipt-retirement-remote.ts` owns GitHub command normalization; its test owns injected-boundary behavior.
  - avoid: Do not add a generic `ExtensionAPI` runtime harness, alter the remote adapter contract, or change receipt format, grants, or delivery gates.
  - acceptance: `honest adapter and wiring evidence` — a valid merged response returns the exact normalized observation.
  - verify: `bun test tests/candidate-receipt-retirement-remote.test.ts`

- [x] 2.2 Retain the static public-tool test and make its smoke-only limitation explicit without claiming runtime execution coverage.
  - skills: `ein-discipline`, `comment-style`, `bun`
  - files: before: `tests/candidate-receipt-retirement-tool.test.ts` can be read as behavioral wiring proof; after: it remains a static registration/import/call-site smoke test with residual runtime-wiring risk stated accurately.
  - why: Static inspection catches removed wiring cheaply but cannot execute the public tool.
  - learn: A smoke test validates presence; a behavioral test validates execution.
  - architecture: Public-tool execution remains outside this bounded slice; the retained test is intentionally limited to static wiring.
  - avoid: Do not build an extension harness or represent source-string inspection as runtime proof.
  - acceptance: `honest adapter and wiring evidence` — static coverage is labeled smoke only and no generic harness is introduced.
  - verify: `bun test tests/candidate-receipt-retirement-tool.test.ts`

## // 003. Synchronize the sibling-owned six-scenario delta

- [x] 3.1 Run deterministic OpenSpec synchronization for `candidate-receipt-retirement-hardening` against the restored canonical baseline and require a fresh sibling `state: synchronized` report.
  - skills: `ein-discipline`, `architecture`
  - files: before: `openspec/changes/candidate-receipt-retirement-hardening/specs/sdd-lifecycle/spec.md` declares six `ADDED` scenarios and canonical state is restored; after: `openspec/specs/sdd-lifecycle/spec.md` contains the baseline plus only that delta, and `openspec/changes/candidate-receipt-retirement-hardening/sync-report.md` records `state: synchronized`.
  - why: Deterministic sync establishes ownership without disguising already-present scenarios as new evidence.
  - learn: The delta is the authored contract; canonical spec text is generated synchronization output.
  - architecture: The sibling delta owns exactly six scenarios: `candidate-receipt-durable-attempt`, `candidate-receipt-push-remote-and-bounded-observation`, `candidate-receipt-owner-matched-lock-and-durability`, `candidate-receipt-durable-archive-ancestry`, `candidate-receipt-immutable-retirement-metadata`, and `candidate-receipt-terminal-cleanup-pending`.
  - avoid: Do not manually copy delta scenarios into canonical, replay the original eleven scenarios, accept `added-existing`/`conflict`, or proceed if sync fails.
  - acceptance: `ordered canonical ownership` — exactly six sibling scenarios synchronize cleanly with no conflict.
  - verify: `ein_openspec_sync candidate-receipt-retirement-hardening && test "$(grep -c '^state: synchronized$' openspec/changes/candidate-receipt-retirement-hardening/sync-report.md)" -eq 1`

- [x] 3.2 Record the completed apply batch and synchronization evidence in the sibling tracking artifacts.
  - skills: `ein-discipline`
  - files: before: `openspec/changes/candidate-receipt-retirement-hardening/tasks.md` has unchecked groups and `openspec/changes/candidate-receipt-retirement-hardening/apply-progress.md` is absent or lacks this batch; after: both identify the completed restoration/test/sync work, exact files, commands, and synchronized state.
  - why: Apply evidence must make the restoration-to-sync sequence auditable before final verification.
  - learn: Progress records evidence performed work; task checkboxes communicate remaining work.
  - architecture: Sibling operational evidence stays in sibling artifacts and never retroactively changes the original archive.
  - avoid: Do not update the original archive's progress report or treat a planned command as executed evidence.
  - acceptance: `historical evidence integrity` and `ordered canonical ownership` — sibling evidence, not original evidence, owns remediation claims.
  - verify: `test -f openspec/changes/candidate-receipt-retirement-hardening/apply-progress.md && grep -Fx 'state: synchronized' openspec/changes/candidate-receipt-retirement-hardening/sync-report.md`

## // 004. Audit final bytes and complete apply readiness

- [x] 4.1 Run the focused retirement suites, OpenSpec checks, full suite, installer typecheck, whitespace check, and historical byte comparisons after the last covered change; record the apply evidence only in `tasks.md` and `apply-progress.md`.
  - skills: `bun`, `typescript-advanced-types`, `ein-discipline`
  - files: before: `openspec/changes/candidate-receipt-retirement-hardening/{tasks.md,apply-progress.md}` lacks final-HEAD apply evidence; after: those two artifacts record final-HEAD results for focused tests, OpenSpec tests, full tests, typecheck, diff-check, six historical comparisons, and synchronized sibling state.
  - why: Earlier green results cannot prove the final restored, synchronized, and tested tree.
  - learn: Any covered-byte change invalidates the verification chain.
  - architecture: Apply evidence records execution progress; the independent verification report is owned by the subsequent `sdd-verify` phase.
  - avoid: Do not write `verify-report.md` or `summary.md`, archive the change, invoke close, emit a candidate receipt, run a production build, or accept stale results.
  - acceptance: `final evidence freshness` — apply evidence covers final remediation bytes; `historical evidence integrity` — all six byte comparisons pass.
  - verify: `bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts && bun test tests/openspec-specs.test.ts && bun test && bun run --cwd installer typecheck && git diff --check && for path in openspec/changes/archive/candidate-receipt-retirement/apply-progress.md openspec/changes/archive/candidate-receipt-retirement/design.md openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md openspec/changes/archive/candidate-receipt-retirement/summary.md openspec/changes/archive/candidate-receipt-retirement/sync-report.md openspec/changes/archive/candidate-receipt-retirement/verify-report.md; do cmp "$path" <(git show "1f89b0f:$path") || exit 1; done && grep -Fx 'state: synchronized' openspec/changes/candidate-receipt-retirement-hardening/sync-report.md`

- [x] 4.2 Mark every group complete and record apply readiness only when the restoration byte comparisons, focused and full tests, installer typecheck, diff-check, and sibling synchronization state all pass; record that verify, close, and a fresh receipt remain subsequent orchestrator-owned phases.
  - skills: `ein-discipline`
  - files: before: `openspec/changes/candidate-receipt-retirement-hardening/{tasks.md,apply-progress.md}` has incomplete groups or lacks final readiness status; after: all groups are checked only after every required apply check passes, and `apply-progress.md` records readiness plus the handoff to `sdd-verify`, then `sdd-close`/`ein_sdd_close`, followed by parent invocation of `ein_candidate_receipt` after fresh close evidence.
  - why: Apply can declare implementation readiness, but it cannot replace independent verification, close ownership, archival, or final receipt issuance.
  - learn: Passing apply evidence authorizes the next phase; it is not proof of a closed change or a reusable receipt.
  - architecture: `sdd-apply` owns task and progress completion, `sdd-verify` owns `verify-report.md`, `sdd-close` owns `summary.md`, `ein_sdd_close` archives, and the parent invokes `ein_candidate_receipt` only after fresh close evidence.
  - avoid: Do not write `verify-report.md` or `summary.md`, archive the change, invoke close, emit a candidate receipt, plan delivery, or mark any group complete when a required check fails.
  - acceptance: `apply readiness` — all required apply checks pass before every group is complete, with verify → close → fresh receipt explicitly deferred to their owners.
  - verify: `grep -Fq 'verify → close → fresh receipt' openspec/changes/candidate-receipt-retirement-hardening/apply-progress.md && grep -Eq '^- \[x\] [1-4]\.' openspec/changes/candidate-receipt-retirement-hardening/tasks.md`
