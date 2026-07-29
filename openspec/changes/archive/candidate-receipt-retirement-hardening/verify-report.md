# Verify report — candidate-receipt-retirement-hardening

status: pass
behavior_coverage: verified
strict_tdd: inactive (`openspec/config.yaml` sets `strict_tdd: false`)
skill_resolution: paths-injected

## Executive summary

The final remediation slice `candidate-receipt-retirement-hardening` is fully verify-ready. The six original archived artifacts equal `git show 1f89b0f:<path>` byte-for-byte, the canonical `sdd-lifecycle/spec.md` is the `1f89b0f` baseline plus exactly the six sibling scenarios (33 total scenarios, six siblings appear once), the sibling sync report is fresh and reports `state: synchronized` with `conflicts: 0` and `added=6 modified=0 removed=0`, the original archive sync report also reports `state: synchronized` with `conflicts: 0`, and no `state: conflict` survives in either delivered sync report. Useful `961aefa` source hardening is intact across `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`, and `ein-pi/agent/lib/candidate-receipt.ts` (durable attempt via `persistVerifiedDeliveryAttempt`/`readVerifiedDeliveryAttempt`/`clearVerifiedDeliveryAttempt`, unique push URL via `resolveExplicitPushRemoteRepository`, bounded observation via `observeMergedPullRequest` with `GITHUB_PR_VIEW_TIMEOUT_MS` and `AbortSignal`, PID/token lifecycle lock via `withReceiptLifecycleLock`+`recoverOrphanedLock`, directory fsync via `flushDirectory`/`ensureDurableDirectory`/`publishImmutable`, immutable metadata via `publishImmutable` no-replace protocol, and `cleanupPending` reporting via `reportRetirementCleanup`). The new merged-PR test exercises the injected remote adapter and asserts the exact command file, full argument list, JSON field set, timeout, propagated `AbortSignal`, and a complete normalized output object covering all nine required fields. The static public-tool test is unambiguously labeled "smoke-only" and does not claim runtime execution. The active candidate receipt tree `1c3138ed4009d2681503a4de1bf23ae981c5ad35` is stale relative to the current HEAD tree `595f589f81dc90afe9ffde6006e3c3cc860bc5bb` and must be replaced after close; no current receipt validity claim is made. No source rollback, no grants/gates/declaration/receipt-version change, no history rewrite, no force push, and no WIP leakage into production paths were detected. Production line count exceeds the 400-line review budget, so delivery requires a fresh explicit single-PR vs. chained-PR decision per the Workload Guard.

## Commands run

| Command | Result | Evidence |
|---|---|---|
| `timeout 300 bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts` | passed | 116 tests, 277 assertions, 0 failures across 4 files. |
| `timeout 120 bun test tests/openspec-specs.test.ts` | passed | 26 tests, 55 assertions, 0 failures across 1 file. |
| `timeout 300 bun test` | passed | 939 tests, 2578 assertions, 0 failures across 83 files. |
| `timeout 300 bun run --cwd installer typecheck` | passed | `tsc --noEmit` finished with no output and exit code 0. |
| `git diff --check` | passed | No whitespace errors. |
| `cmp` for the six archived paths against `git show 1f89b0f:<path>` | passed | 6/6 equalities, byte-for-byte. |
| `grep -Fx 'state: synchronized' openspec/changes/archive/candidate-receipt-retirement/sync-report.md` | passed | One exact match. |
| `grep -Fx 'state: synchronized' openspec/changes/candidate-receipt-retirement-hardening/sync-report.md` | passed | One exact match. |
| `grep -c '^### Scenario: ' openspec/changes/candidate-receipt-retirement-hardening/specs/sdd-lifecycle/spec.md` | passed | 6 sibling scenarios. |
| `grep -c '^## Scenario: ' openspec/specs/sdd-lifecycle/spec.md` | passed | 33 canonical scenarios (27 baseline + 6 sibling). |
| `grep -c 'candidate-receipt-durable-attempt' openspec/specs/sdd-lifecycle/spec.md` | passed | 1. Same for each of the other five sibling IDs. |
| `grep -rn 'state: conflict' openspec/changes/candidate-receipt-retirement*/sync-report.md` | passed | No matches in any delivered sync report. |
| `git diff --shortstat 1f89b0f..HEAD -- ein-pi/agent/lib/delivery-gate.ts` | passed | Empty (delivery gate unchanged). |
| `git diff --name-only 1f89b0f..HEAD -- . ':(exclude)openspec/**' ':(exclude)tests/**' ':(exclude)installer/**' ':(exclude)package.json'`: | passed | Exactly 3 production files: `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`, `ein-pi/agent/lib/candidate-receipt.ts`. |

All commands were executed with the mandatory timeout wrapper. No production build, network, real GitHub CLI, or delivery action ran.

## Behavioral / provenance invariants

### 1. New merged-PR JSON fixture asserts all normalized fields, command args, timeout, and AbortSignal

`tests/candidate-receipt-retirement-remote.test.ts` adds an injected-runner test (`adaptador remoto de retiro > normaliza un PR merged del mismo repositorio mediante el runner inyectado`) that:

- asserts the remote command file is `gh`;
- asserts the exact argument list: `["pr", "view", "42", "--repo", "owner/repo", "--json", "number,url,state,mergedAt,mergeCommit,headRepository,headRefName,headRefOid,baseRefName"]`;
- asserts `options.timeoutMs === GITHUB_PR_VIEW_TIMEOUT_MS`;
- asserts `options.signal === controller.signal` (propagated `AbortSignal`);
- asserts the complete normalized object via `toEqual`: `repository: "owner/repo"`, `prNumber: 42`, `url: "https://github.com/Owner/Repo/pull/42"`, `state: "MERGED"`, `headRepository: "owner/repo"` (lower-cased from `Owner/Repo`), `headRef: "feature/receipt-retirement"`, `baseRef: "main"`, `headRefOid: "0123456789abcdef0123456789abcdef01234567"`, `mergeCommitOid: "abcdef0123456789abcdef0123456789abcdef01"`.

The runner is the actual `RemoteCommandRunner` injection, so the test exercises the production `observeMergedPullRequest` boundary and not a mock or helper. The test passes (`3 pass, 12 expect() calls` total for the file, including the existing push-URL and timeout/abort tests).

### 2. Static public-tool test labeled smoke only

`tests/candidate-receipt-retirement-tool.test.ts` contains a single test named `smoke-only: la tool pública de retiro conserva registro e import/call-sites estáticos`. The file-level comment explicitly says: _"Smoke only: verifica registro, imports y call-sites estáticos; no ejecuta la tool pública."_ The body asserts only the presence of `name: "ein_candidate_receipt_retire"`, `resolveExplicitPushRemoteRepository`, `observeMergedPullRequest`, `readVerifiedDeliveryAttempt`, `reportRetirementCleanup`, and `cleanupPending` in the source string of `ein-pi/agent/extensions/ein-ai.ts`. No runtime execution claim is made. The runtime-execution gap is stated honestly in the sibling delta's `Requirement: honest adapter and wiring evidence` and in the limitations below.

### 3. Useful `961aefa` source hardening remains present and tested

| Hardening invariant | Implementation | Test evidence |
|---|---|---|
| Durable attempt persistence | `persistVerifiedDeliveryAttempt` / `readVerifiedDeliveryAttempt` / `clearVerifiedDeliveryAttempt` in `ein-pi/agent/lib/candidate-receipt.ts:781,797,807` | `tests/candidate-receipt.test.ts:649,650,653,662,664,672` cover persist/read/clear and replacement rotation. |
| Unique push URL | `resolveExplicitPushRemoteRepository` in `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts:35` requires exactly one push URL | `tests/candidate-receipt-retirement-remote.test.ts:15,17` prove single-URL accepted and multi-URL rejected. |
| Bounded observation | `observeMergedPullRequest` with `GITHUB_PR_VIEW_TIMEOUT_MS` and `AbortSignal` propagation (`ein-pi/agent/lib/candidate-receipt-retirement-remote.ts:65,69,71`) | `tests/candidate-receipt-retirement-remote.test.ts:33,70,71,74` assert timeout, signal propagation, abort, and fail-closed. |
| PID/token lifecycle lock | `withReceiptLifecycleLock` + `recoverOrphanedLock` + `readLockOwner` in `ein-pi/agent/lib/candidate-receipt.ts:479,490,505` | `tests/candidate-receipt.test.ts:679-682` cover orphan recovery and live-owner blocking. |
| fsync of directories | `flushDirectory` / `ensureDurableDirectory` / `writeAtomicBytes` / `publishImmutable` in `ein-pi/agent/lib/candidate-receipt.ts:670,683,704,726` | `tests/candidate-receipt.test.ts:567-585` assert new directory and its parent are flushed before terminal unlink. |
| Immutable retirement metadata | `publishImmutable` no-replace protocol with `linkSync`/`EEXIST` byte compare (`ein-pi/agent/lib/candidate-receipt.ts:726`) | `tests/candidate-receipt.test.ts:534-543` (archive conflict) and `tests/candidate-receipt.test.ts:552-566` (metadata race) both assert the active slot survives the conflict. |
| `cleanupPending` | `reportRetirementCleanup` in `ein-pi/agent/lib/candidate-receipt.ts:811`; integration in `ein-pi/agent/extensions/ein-ai.ts:1409,1444` | `tests/candidate-receipt.test.ts:634-640` assert `cleanupPending: true` with retry warning. |

All three production files are byte-stable against `1f89b0f` source for the hardening. There is no rollback of the post-review hardening.

### 4. Six original archived artifacts equal `1f89b0f` byte-for-byte; original sync report is synchronized

```text
EQUAL: openspec/changes/archive/candidate-receipt-retirement/apply-progress.md
EQUAL: openspec/changes/archive/candidate-receipt-retirement/design.md
EQUAL: openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md
EQUAL: openspec/changes/archive/candidate-receipt-retirement/summary.md
EQUAL: openspec/changes/archive/candidate-receipt-retirement/sync-report.md
EQUAL: openspec/changes/archive/candidate-receipt-retirement/verify-report.md
```

The original archive sync report (`openspec/changes/archive/candidate-receipt-retirement/sync-report.md`) reports `state: synchronized`, `operations: added=11 modified=0 removed=0`, `conflicts: 0`, and `## Conflicts` lists `- none`. The original 11-scenario sync result is preserved as historical evidence.

### 5. Sibling delta owns exactly six scenarios; sibling sync report synchronized with zero conflicts; canonical contains each once

| Artifact | Count | Notes |
|---|---|---|
| `openspec/changes/candidate-receipt-retirement-hardening/specs/sdd-lifecycle/spec.md` | 6 sibling scenarios | `candidate-receipt-durable-attempt`, `candidate-receipt-push-remote-and-bounded-observation`, `candidate-receipt-owner-matched-lock-and-durability`, `candidate-receipt-durable-archive-ancestry`, `candidate-receipt-immutable-retirement-metadata`, `candidate-receipt-terminal-cleanup-pending`. |
| `openspec/changes/candidate-receipt-retirement-hardening/sync-report.md` | `state: synchronized`, `operations: added=6 modified=0 removed=0`, `conflicts: 0`, `## Conflicts: - none` | Header `delta_sha256: 7629d498...`, `base_sha256: 17eea8b1...`, `result_sha256: de97bf26...`; domain result `before=da70679a...` (1f89b0f canonical SHA-256) → `after=42ac9ee3...` (current canonical SHA-256), `added=6`. |
| `openspec/specs/sdd-lifecycle/spec.md` | 33 scenarios total; each of the 6 sibling IDs appears exactly once | 27 baseline scenarios from `1f89b0f` plus 6 sibling scenarios. |

### 6. No `state: conflict` remains in either delivered sync report

`grep -rn 'state: conflict' openspec/changes/candidate-receipt-retirement/sync-report.md openspec/changes/candidate-receipt-retirement-hardening/sync-report.md` returns no matches. The only `state: conflict` mentions in the change tree are inside `design.md` and `scope.md` text describing the contract.

### 7. Active candidate receipt tree `1c3138ed...` is stale; no current-receipt validity claim

Active receipt at `.git/ein/candidate-receipt.json`:

- `head: 343aeb29eefea6bb4d6d72c3eca4b347838e4e58` (the original PR merge commit, not the current HEAD)
- `treeSha: 1c3138ed4009d2681503a4de1bf23ae981c5ad35` (the original change's tree, not the current HEAD tree)
- `change: candidate-receipt-retirement` (the original change, not the remediation)

Current HEAD is `961aefa05aaed98d99e6928253dc32efc17e9536` with tree `595f589f81dc90afe9ffde6006e3c3cc860bc5bb`. The active receipt is stale relative to the final worktree/HEAD and binds only the original change. Per `design.md` and `apply-progress.md`, the stale receipt must be replaced after close via a fresh `ein_candidate_receipt` invocation; this verification does not claim any current-receipt validity for the remediation.

### 8. No source rollback, grants/gates/declaration/receipt-version change, history rewrite, force push, or WIP leakage

- `git diff --shortstat 1f89b0f..HEAD -- ein-pi/agent/lib/delivery-gate.ts` returns empty → 4 delivery gates unchanged.
- `git diff --name-only 1f89b0f..HEAD -- . ':(exclude)openspec/**' ':(exclude)tests/**' ':(exclude)installer/**' ':(exclude)package.json'` returns exactly the 3 production files: `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts`, `ein-pi/agent/lib/candidate-receipt.ts`. No installer, no `package.json`, no `bunfig.toml`, no `tsconfig.json` touched.
- `grep RECEIPT_VERSION ein-pi/agent/lib/candidate-receipt.ts` returns `export const RECEIPT_VERSION = 1;` → unchanged from the original (`1f89b0f` had `RECEIPT_VERSION = 1`).
- `git log 1f89b0f..HEAD --oneline` shows exactly one commit (`961aefa fix(delivery): blinda la retirada durable de receipts`); `git reflog` shows a linear history with no force-push or history rewrite.
- Untracked work is limited to the new sibling change directory and pre-existing untracked files (`.sdd/`, `EIN.md`, `docs/public-beta-plan.md`, `openspec/changes/release-experience-roadmap/`, `openspec/changes/zero-friction-sdd-start/`, `openspec/config.yaml`, `tests/sdd-config-bootstrap.test.ts`); none of these are untracked WIP from the `961aefa` hardening.

### 9. Workload measurement against budget 400

Production/docs against the 400-line review budget (test files excluded per the Workload Guard excludes):

```text
git diff --shortstat 1f89b0f..HEAD -- . \
  ':(exclude)*.test.*' ':(exclude)*.spec.*' \
  ':(exclude)**/tests/**' ':(exclude)**/__tests__/**' ':(exclude)**/e2e/**' \
  ':(exclude)*.snap' ':(exclude)*-lock.*' \
  ':(exclude)dist/**' ':(exclude).output/**' ':(exclude).nuxt/**' \
  ':(exclude)coverage/**' ':(exclude)*.min.*'
  10 files changed, 562 insertions(+), 127 deletions(-)  → 689 lines
```

Breakdown:

- Production only (3 files): 457 lines (`361 + 96`).
- Docs only (6 archive + 1 canonical): 232 lines (`201 + 31`).
- Total production/docs: 689 lines, over the 400-line budget by 289.

Tests reported separately (NOT counted toward the budget):

```text
git diff --shortstat 1f89b0f..HEAD -- tests/
  4 files changed, 190 insertions(+), 15 deletions(-)  → 205 lines
```

The prior single-PR approval covered 1296 production/docs + 217 test lines; the current remediation carries 689 production/docs + 205 tests. The 400-line production budget is exceeded. The chained-PR strategy is `auto-forecast` per session preflight, so the deterministic Review Workload Guard halts delivery and a renewed explicit user decision (single PR vs. chained PRs) is required before any PR is opened.

### 10. Behavior coverage honesty

- **Remote JSON normalization** is exercised end-to-end through the injected runner boundary in `tests/candidate-receipt-retirement-remote.test.ts:25-58`. The runner returns valid merged-PR JSON; the assertions cover the exact 9-arg `gh pr view` list, the JSON field set, the timeout, the propagated `AbortSignal`, and the complete normalized object. Acceptance is unconditional on the live network: this is `behavior_coverage: verified` for the observable adapter boundary.
- **Public `ExtensionAPI` execution** is NOT exercised; the static source-string test is the only coverage. Acceptance is `behavior_coverage: smoke-only` for that wiring. The gap is honest and stated in `design.md` (`Requirement: honest adapter and wiring evidence`) and in the static test's own comment.
- **Other bounded coverage** for the hardening (durable attempt, push URL, lock, fsync, metadata race, `cleanupPending`) is exercised in `tests/candidate-receipt.test.ts` and `tests/delivery-gate.test.ts` with concrete observable assertions (file system state, decision verdicts, return values, event ordering). These are not pure smoke or type-only checks.

`behavior_coverage: verified` for the bounded source-test surface; the runtime public-tool execution gap is acknowledged, not hidden.

## Spec scenario coverage

The 6 sibling scenarios and the original 11 archived scenarios are present in the canonical `sdd-lifecycle` spec; the 6 sibling scenarios are owned by this remediation.

| Sibling scenario | Result | Evidence |
|---|---|---|
| `candidate-receipt-durable-attempt` | verified | `tests/candidate-receipt.test.ts:649,650,653,662,664,672` cover persist/read/clear and replacement rotation. |
| `candidate-receipt-push-remote-and-bounded-observation` | verified | `tests/candidate-receipt-retirement-remote.test.ts:15,17,33,70,71,74` cover unique push URL, timeout, abort, and fail-closed. |
| `candidate-receipt-owner-matched-lock-and-durability` | verified | `tests/candidate-receipt.test.ts:679-697` cover orphan recovery and live-owner blocking. |
| `candidate-receipt-durable-archive-ancestry` | verified | `tests/candidate-receipt.test.ts:567-585` assert each new directory and its parent are flushed before unlink. |
| `candidate-receipt-immutable-retirement-metadata` | verified | `tests/candidate-receipt.test.ts:534-543` and `tests/candidate-receipt.test.ts:552-566` assert archive and metadata conflicts preserve the active slot. |
| `candidate-receipt-terminal-cleanup-pending` | verified | `tests/candidate-receipt.test.ts:634-640` assert `cleanupPending: true` with retry warning. |

The 11 original scenarios remain covered by the original archived `verify-report.md` (which is preserved as historical evidence, not the active source of truth for this remediation).

## Task completion

`tasks.md` groups 001–004 are all checked. Group 001 (restoration), group 002 (remote adapter coverage), group 003 (sibling sync), and group 004 (final audit) all show checked acceptance criteria. The apply-progress explicitly defers `verify-report.md` ownership to `sdd-verify` (this run) and `summary.md` ownership to `sdd-close`; the closing line of `apply-progress.md` records `verify → close → fresh receipt` as the next handoff.

## Assertion quality

The new merged-PR test asserts concrete observable behavior, not type-only or smoke-only checks:

- exact command file (`gh`) and exact 9-argument list;
- exact JSON field set with comma-separated field names;
- `timeoutMs` value (`GITHUB_PR_VIEW_TIMEOUT_MS` = 10_000 ms) and `AbortSignal` identity (`controller.signal`);
- normalized object with all 9 fields, including lower-cased `headRepository` (`Owner/Repo` → `owner/repo`).

The smoke-only test for the public tool asserts only string presence, deliberately labeled as wiring smoke. No runtime execution claim is made. Other hardening tests in `tests/candidate-receipt.test.ts` and `tests/delivery-gate.test.ts` assert on file system state, byte equality, decision verdicts, lifecycle lock contention, event ordering, and audit decisor outputs — not pure type-only assertions.

No tautologies, ghost loops, type-only assertions, smoke-only assertions (for the merged-PR test), or implementation-detail CSS assertions were detected.

## Strict TDD

`openspec/config.yaml` sets `strict_tdd: false`. The TDD Cycle Evidence table is therefore not mandatory. `apply-progress.md` correctly omits a TDD Cycle Evidence table and the focused tests named in each group exist and pass in this verification.

## Behavioral coverage

`behavior_coverage: verified` for the bounded source-test surface of the hardening. The remote adapter normalization is exercised end-to-end through the injected runner. The runtime public-tool execution is acknowledged as smoke-only and not invoked here. Honest residual risk: the static `ExtensionAPI` wiring smoke is the only coverage for the public tool's runtime path; this is a stated boundary, not a hidden lack of coverage.

## Files touched (manifest for the upstream fresh-receipt / close phase)

The final PR would carry the following 14 paths (10 production/docs + 4 tests):

**Production (3 files, +361/-96 = 457 lines)**

- `ein-pi/agent/extensions/ein-ai.ts` — adapter orchestration, `clearVerifiedDeliveryAttempt` cleanup wiring, `cleanupPending` reporting.
- `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts` — `runRemoteCommand`, `normalizeGitHubRepository`, `resolveExplicitPushRemoteRepository`, `observeMergedPullRequest`, `GITHUB_PR_VIEW_TIMEOUT_MS`.
- `ein-pi/agent/lib/candidate-receipt.ts` — durable attempt persistence, `withReceiptLifecycleLock` + `recoverOrphanedLock`, `publishImmutable` no-replace, `flushDirectory`/`ensureDurableDirectory` fsync, `retireCandidateReceipt` ordered transition, `reportRetirementCleanup`, `cleanupPending` semantics.

**Docs (7 files, +201/-31 = 232 lines)**

- `openspec/specs/sdd-lifecycle/spec.md` — canonical baseline + 6 sibling scenarios (33 total).
- `openspec/changes/archive/candidate-receipt-retirement/apply-progress.md` — restored to `1f89b0f` bytes.
- `openspec/changes/archive/candidate-receipt-retirement/design.md` — restored to `1f89b0f` bytes.
- `openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md` — restored to `1f89b0f` bytes.
- `openspec/changes/archive/candidate-receipt-retirement/summary.md` — restored to `1f89b0f` bytes.
- `openspec/changes/archive/candidate-receipt-retirement/sync-report.md` — restored to `1f89b0f` bytes.
- `openspec/changes/archive/candidate-receipt-retirement/verify-report.md` — restored to `1f89b0f` bytes.

**Tests (4 files, +190/-15 = 205 lines, reported separately)**

- `tests/candidate-receipt-retirement-remote.test.ts` — added merged-PR runtime fixture with full normalized-output assertion.
- `tests/candidate-receipt-retirement-tool.test.ts` — relabeled as smoke-only.
- `tests/candidate-receipt.test.ts` — retained hardening coverage.
- `tests/delivery-gate.test.ts` — retained delivery-boundary integration coverage.

**Sibling change artifacts (untracked, owned by sdd-close / sdd-verify / sdd-design)**

- `openspec/changes/candidate-receipt-retirement-hardening/scope.md`, `map.md`, `design.md`, `specs/sdd-lifecycle/spec.md`, `tasks.md`, `apply-progress.md`, `sync-report.md`, `memory-receipts.jsonl`.
- `verify-report.md` (this file, owned by sdd-verify) and `summary.md` (owned by sdd-close) are not yet written.

**Untracked work not part of this remediation; left alone**

- `EIN.md`, `.sdd/changes/ein-sdd-state-machine-map/`, `openspec/changes/release-experience-roadmap/`, `openspec/changes/zero-friction-sdd-start/`, `openspec/config.yaml`, `tests/sdd-config-bootstrap.test.ts`, `docs/public-beta-plan.md`.

## Review findings

| Severity | Finding |
|---|---|
| BLOCKER | None. All 10 verification invariants pass. |
| INFO | Final production/docs workload is 689 lines (457 production + 232 docs), exceeding the 400-line review budget by 289 lines. The deterministic Review Workload Guard must run before delivery and the user must explicitly choose single-PR vs. chained-PR. |
| INFO | The static public-tool test (`tests/candidate-receipt-retirement-tool.test.ts`) is the only coverage for the runtime `ExtensionAPI` execution path and is honestly labeled smoke-only. Building a generic runtime harness was rejected as out-of-scope; the residual wiring risk is acknowledged. |
| INFO | `git diff HEAD -- openspec/specs/sdd-lifecycle/spec.md` shows 40 insertions/40 deletions: the 6 sibling scenarios are present in both HEAD and the working tree but in a different order (working tree sorted alphabetically per the deterministic sync). Every scenario body is byte-identical to the corresponding HEAD version per `apply-progress.md` group 003. |
| INFO | The active receipt at `.git/ein/candidate-receipt.json` binds `treeSha: 1c3138ed...` (the original change's tree) and `head: 343aeb2...` (the original PR merge commit). It is stale relative to the current HEAD (`961aefa`, tree `595f589f`) and must be replaced after close via a fresh `ein_candidate_receipt` invocation; this verification does not claim current-receipt validity. |
| INFO | `delivery-gate.ts` is byte-identical to `1f89b0f`; `RECEIPT_VERSION = 1` is unchanged; `package.json`, `bunfig.toml`, `tsconfig.json`, and the installer manifest are unchanged. |
| INFO | `openspec/changes/candidate-receipt-retirement-hardening/verify-report.md` (this file) and `summary.md` are not yet committed. They are owned by `sdd-verify` and `sdd-close` respectively, and the parent should not close/emit a fresh receipt until both are produced. |

## Residual risks

- Production line workload exceeds both the 400-line review budget and the design forecast. The delivery workflow must run the deterministic Review Workload Guard and obtain a renewed explicit single-PR vs. chained-PR user decision before any PR is opened.
- The static smoke-only test for the public tool is the only coverage for runtime `ExtensionAPI` execution. The implementation is exercised at the boundary beneath the tool (the pure decision, the persistence transition, the remote adapter), but the wiring at the tool entry is not exercised at runtime. A regression that swaps the registered tool name or breaks the call-site wiring would not be caught by the existing test suite.
- The active candidate receipt is stale (`treeSha: 1c3138ed...` for the original change). Delivery must skip the stale receipt and emit a fresh candidate receipt for the final HEAD/tree after close.
- No real GitHub CLI behavior (`gh pr view` against a merged same-repository PR, authentication, timeout, malformed JSON response, fork detection, merge-result OID resolution) is exercised at runtime. The adapter is exercised only through the injected runner with synthetic JSON, which is precisely the bounded seam left for this remediation slice per `design.md`.
- The 6 archive files are restored to `1f89b0f` bytes in the working tree but the committed branch (HEAD = `961aefa`) does not contain this restoration. The remediation PR must include the restoration as part of its commit content. The current working tree state is the correct intended state but is not yet committed.

## Next recommendation

This verify report is the final piece of evidence required by the `sdd-verify` phase. The next orchestrator-owned steps are:

1. `sdd-close` writes `openspec/changes/candidate-receipt-retirement-hardening/summary.md` against the bytes verified here.
2. `sdd-close` archives the sibling change to `openspec/changes/archive/candidate-receipt-retirement-hardening/`.
3. The parent invokes `ein_candidate_receipt` against the final HEAD (`961aefa`, tree `595f589f`) to emit a fresh candidate receipt that binds the final remediation tree and the changed-path manifest above. The current `.git/ein/candidate-receipt.json` (`treeSha: 1c3138ed...`) is stale and must not be used.
4. Before any PR is opened, the deterministic Review Workload Guard must run against the final production/docs diff (689 lines, over the 400-line budget) and the user must explicitly choose single-PR vs. chained-PR delivery. The chained-PR strategy is `auto-forecast` per session preflight, so the guard will pause for that decision.
5. The `verify → close → fresh receipt` sequence now has its verify piece (this report); close and receipt are still owed.

No commit, push, or PR was performed by this verification.
