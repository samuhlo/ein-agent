# Verify report — candidate-receipt-retirement

status: pass
behavior_coverage: verified
strict_tdd: inactive (`openspec/config.yaml` sets `strict_tdd: false`)
skill_resolution: paths-injected

## Executive summary

The bounded candidate-receipt retirement slice closes every required scenario in `openspec/changes/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md`. The pure decision in `ein-pi/agent/lib/delivery-receipt.ts` rejects any non-`MERGED`, cross-repository, fork-head, mismatched OID, missing-merge-result, missing-URL, or identity-divergent observation and only returns `retire` when the active raw-byte fingerprint, attempt fingerprint, `validatedDeliveryHead`, repository/worktree IDs, and normalized same-repository GitHub PR identity all bind exactly. The persistence transition in `ein-pi/agent/lib/candidate-receipt.ts` publishes the exact active bytes to a fingerprint-addressed archive, requires a matching immutable `retirement.json`, revalidates against a second fresh observation, and unlinks the active slot only after all checks pass — every failure path preserves the active receipt and the conservative archive. The `ein_candidate_receipt_retire` tool in `ein-pi/agent/extensions/ein-ai.ts` is the only entry point: it requires `change`, `receiptFingerprint`, `remote`, `baseRef`, `headRef`, and `prNumber` (no inferred values), normalizes the GitHub remote to `owner/repository` (rejecting ambiguity), invokes two fresh `gh pr view` observations through the pure decision, clears the matching session attempt only after a `retired` result, and never touches delivery grants, mechanical declarations, or the four existing identity gates.

No new dependency is added, the receipt payload format is unchanged (`RECEIPT_VERSION = 1`, same field set), and `delivery-gate.ts` and `tests/ein-git-noninteractive.test.ts` are byte-identical to `HEAD`. Production changed lines exceed the design forecast (435 vs. 220–320) and the 400-line review budget by 35 lines; the deterministic Review Workload Guard must therefore choose the delivery shape before any PR.

Live GitHub CLI behavior is not exercised by the test suite: the `gh pr view` adapter is unit-tested for the malformed-response branch only, and the integration tests pass a synthetic observation directly. No real GitHub merge was observed in this verification.

## Commands run

| Command | Result | Evidence |
|---|---|---|
| `timeout 120 bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts` | passed | 104 tests, 229 assertions, 0 failures. |
| `timeout 300 bun test` | passed | 927 tests, 2,530 assertions, 0 failures across 81 files. |
| `git diff --check HEAD` | passed | No whitespace errors reported. |

All commands were executed with the mandatory timeout wrapper. No build, network, real GitHub CLI, or delivery action ran.

## Spec scenario coverage

Every scenario in `openspec/changes/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md` has a focused test.

| Scenario | Result | Evidence |
|---|---|---|
| `candidate-receipt-terminal-boundary` (only merged same-repo PR is terminal) | verified | `tests/delivery-gate.test.ts:440-449` `decisión de retiro: solo el merge ligado es terminal > acepta solo un PR merged del mismo repositorio ligado a la cabeza validada` — OPEN, fork `headRepository`, and mismatched `headRefOid` all return `ok: false`; only `MERGED` with `headRefOid === validatedDeliveryHead` passes. |
| `candidate-receipt-explicit-retirement-trigger` (no inference, explicit tool only) | verified | `ein-pi/agent/extensions/ein-ai.ts:1417-1484` registers exactly one tool (`ein_candidate_receipt_retire`) whose schema requires `change`, `receiptFingerprint`, `remote`, `baseRef`, `headRef`, and `prNumber`; no other code path calls `retireCandidateReceipt`. |
| `candidate-receipt-bound-retirement-evidence` (bind fingerprint + attempt + repo/worktree + identity) | verified | `tests/delivery-gate.test.ts:451-454` `un intento ausente o obsoleto no autoriza el recibo activo` — `attempt: undefined` and `attempt` with a different fingerprint both return `ok: false`. The decision function (`delivery-receipt.ts:145-168`) additionally fails closed on missing `validatedDeliveryHead`, repository/worktree mismatch, missing identity fields, and missing observation. |
| `candidate-receipt-fresh-network-truth` (fresh `gh` observation, no caller-supplied JSON) | verified | `tests/delivery-gate.test.ts:458-510` `solape mecánico tras retirar un recibo > el retiro solo elimina el gate viejo y no autoriza una entrega posterior` exercises the full path with two synthetic observations that match the schema; `tests/candidate-receipt.test.ts:556-568` `una segunda observación distinta conserva el slot activo` proves the second observation differs and the active slot remains. The `observeMergedPullRequest` adapter (`ein-ai.ts:181-201`) returns `null` when the `gh` response is missing `state`, `mergedAt`, `mergeCommit`, `headRepository`, or any typed field. |
| `candidate-receipt-successful-retirement` (merged delivery retires exact active receipt) | verified | `tests/candidate-receipt.test.ts:520-532` `archiva los bytes exactos y desactiva solo después de metadatos` — `retireCandidateReceipt` returns `{ ok: true, result: "retired" }`, the archive bytes equal the former active bytes (`readFileSync(archive)).toEqual(before)`), `retirement.json` exists, the active slot is removed, and a repeat call returns `already-retired`. |
| `candidate-receipt-archive-before-deactivate` (exact bytes archived before unlink; partial publication fails closed) | verified | `tests/candidate-receipt.test.ts:520-532` (success path with archive before unlink) and `tests/candidate-receipt.test.ts:534-543` `un archivo conflictivo conserva el slot activo` — a conflicting archive leaves the active slot present and retirement blocked. |
| `candidate-receipt-idempotent-retirement` (idempotent already-retired, no overwrite) | verified | `tests/candidate-receipt.test.ts:531` — second call after `retired` returns `{ ok: true, result: "already-retired" }`. `candidate-receipt.ts:679-683` short-circuits to the archive-match check when the active slot is absent, never writes. |
| `candidate-receipt-invalid-attempt-or-receipt` (missing/corrupt/replaced evidence blocks retirement) | verified | `tests/delivery-gate.test.ts:451-454` — `attempt: undefined` and mismatched fingerprint return `ok: false`. `tests/candidate-receipt.test.ts:403-470` validates that corrupt, wrong-repo, wrong-worktree, wrong-change, wrong-version, and missing-field receipts are rejected by `validateFreshCandidateReceipt`, which `retireCandidateReceipt` re-reads at three checkpoints. |
| `candidate-receipt-attempt-rotation` (stale attempt cannot authorize another candidate) | verified | `tests/delivery-gate.test.ts:504-509` — after retirement + new emission, the new fingerprint differs and the stale `attempt` plus new `receiptFingerprint` is rejected, leaving the new active receipt present. `delivery-receipt.ts:147-149` compares `attempt.receiptFingerprint` against the active raw-byte fingerprint. |
| `candidate-receipt-mechanical-overlap-lifecycle` (overlap blocked before, evaluated under unchanged gates after) | verified | `tests/delivery-gate.test.ts:458-510` — before retirement, divergent content triggers `pre-push blocked`; with an archive conflict, retirement is blocked and `pre-push` remains blocked; after successful retirement, `pre-push` returns `pass`, `deliveryBoundariesFor("git push origin main")` still returns `["pre-push"]` (mechanical declaration unchanged), and `messageRequestsDelivery` confirms user-intent remains required. |
| `candidate-receipt-retirement-concurrent-revalidation` (concurrent mutation aborts deactivation) | verified | `tests/candidate-receipt.test.ts:545-553` `un bloqueo de ciclo de vida conserva el recibo activo` and `tests/candidate-receipt.test.ts:556-568` `una segunda observación distinta conserva el slot activo` — busy lock and second-observation divergence both keep the active slot effective. `candidate-receipt.ts:679-724` performs three `validateFreshCandidateReceipt` re-reads before unlink. |

## Implementation invariants

Every invariant in the verification contract was audited directly against the implementation.

| Invariant | Evidence |
|---|---|
| No caller-provided GitHub observation | `observeMergedPullRequest` (`ein-ai.ts:181-201`) is the only path that builds a `NormalizedMergedPullRequestObservation`, and it parses the live `gh pr view --repo <repository> --json ...` output. `evaluateCandidateReceiptRetirement` (`delivery-receipt.ts:157`) rejects `observation: undefined`. |
| No keyword/branch/age inference | `delivery-receipt.ts:143-170` checks only normalized identity fields. No branch name, elapsed time, local `HEAD`, or user-prose path participates in the decision. |
| No grant, force-push, mechanical declaration, or four-gate weakening | `git diff --shortstat HEAD -- ein-pi/agent/lib/delivery-gate.ts` returns empty; `tests/ein-git-noninteractive.test.ts` is unchanged. The retirement tool clears `deliveryAttemptBySession` only when the result is `retired` and the attempt fingerprint matches (`ein-ai.ts:1475-1477`); it never calls `confirmDelegatedDelivery`, `nextDeliveryIntent`, or any grant-intent helper. |
| No receipt payload format change | `RECEIPT_VERSION = 1` (`candidate-receipt.ts:36`); `CandidateReceipt` field set and `serializeReceipt`/`parseReceipt` are unchanged. |
| No new dependency | `git diff --name-only HEAD` lists exactly five files (three production, two tests). No `package.json`, `bunfig.toml`, `tsconfig.json`, or installer manifest modified. |
| Archive path is fingerprint-safe | `retiredCandidateReceiptPath` (`candidate-receipt.ts:261-266`) requires `isReceiptFingerprint(value)` (64-hex regex), derives the path from the resolved worktree `gitDir`, and the unit test `tests/candidate-receipt.test.ts:489` proves `retiredCandidateReceiptPath(dir, "../escape")` returns `null`. |
| Active receipt remains on all failure paths | `retireCandidateReceipt` (`candidate-receipt.ts:678-723`) returns `{ ok: false, reason }` for: missing archive match, fresh-validation failure, missing/invalid decision, attempt-binding failure, archive-path derivation failure, active-replacement detection, archive-publication failure, second revalidation failure, observation divergence, metadata conflict, metadata-publication failure, final revalidation failure, and unlink failure. The `unlinkSync(activePath)` call is the only path that removes the active slot and is reached only after every prior check returned success. The `withReceiptLifecycleLock` (`candidate-receipt.ts:451-465`) serializes emission and retirement; a busy lock short-circuits before any I/O. |

## Task completion

`tasks.md` marks groups 001 through 004 complete. The four acceptance scenarios listed per group (`candidate-receipt-bound-retirement-evidence`, `candidate-receipt-invalid-attempt-or-receipt`, `candidate-receipt-attempt-rotation`, `candidate-receipt-terminal-boundary`, `candidate-receipt-successful-retirement`, `candidate-receipt-archive-before-deactivate`, `candidate-receipt-idempotent-retirement`, `candidate-receipt-retirement-concurrent-revalidation`, `candidate-receipt-explicit-retirement-trigger`, `candidate-receipt-fresh-network-truth`, `candidate-receipt-mechanical-overlap-lifecycle`) all map to passing tests in the matrix above.

## Assertion quality

The retirement tests assert on observable behavior, not type-only or smoke-only checks:

- `tests/candidate-receipt.test.ts:520-532` reads the archive back byte-for-byte and compares against the original active file (`expect(readFileSync(archive)).toEqual(before)`), asserts the active slot is removed, and asserts the second call returns `already-retired`.
- `tests/candidate-receipt.test.ts:534-543` writes a conflicting archive before retirement and asserts the active slot is preserved on failure.
- `tests/candidate-receipt.test.ts:545-553` creates the lifecycle lock directory and asserts retirement is blocked while the active slot is preserved.
- `tests/candidate-receipt.test.ts:556-568` feeds a divergent `mergeCommitOid` through `revalidate` and asserts the active slot is preserved.
- `tests/delivery-gate.test.ts:440-449` iterates three malformed observations (OPEN, fork, mismatched OID) and asserts each returns `ok: false`; the happy-path observation returns `ok: true`.
- `tests/delivery-gate.test.ts:451-454` covers `attempt: undefined` and an attempt with a different fingerprint.
- `tests/delivery-gate.test.ts:458-510` is the lifecycle integration test: it exercises divergent content, archive conflict, successful retirement, mechanical overlap before/after, mechanical-declaration stability, user-intent requirement, attempt rotation, and stale-attempt rejection.

No tests are pure tautologies, ghost loops, type-only assertions, smoke-only assertions, or implementation-detail CSS assertions.

## Strict TDD

`openspec/config.yaml` sets `strict_tdd: false`. The TDD Cycle Evidence table is therefore not mandatory. `apply-progress.md` correctly states "TDD Cycle Evidence: not applicable; Strict TDD is OFF" in every group and the focused tests named in each group exist and passed in this verification.

## Behavioral coverage

`behavior_coverage: verified` — the focused tests cover the changed decision, persistence, and tool paths end-to-end with observable assertions (file content, decision verdict, lifecycle result, gate kind, declaration stability). The pure decision is unit-tested for the merged/non-merged, fork/same-repo, and OID-match cases; the persistence transition is tested for exact-byte archive, archive conflict, lifecycle-lock contention, observation divergence, and full retirement lifecycle; the integration test exercises divergent content → blocked, archive conflict → blocked, successful retirement → pass, mechanical declaration unchanged, attempt rotation, and stale-attempt rejection.

Limitation: live GitHub network behavior is NOT exercised. The `gh pr view` adapter (`ein-ai.ts:181-201`) is unit-tested only for the malformed-response branch; the integration tests supply a synthetic `NormalizedMergedPullRequestObservation` directly rather than running `gh`. A real GitHub merge, authentication failure, timeout, malformed CLI output, fork-PR detection, or merge-result OID resolution has no test coverage. The retry path after an interrupted unlink is also exercised only against the same synthetic observation, not against a real CLI invocation.

## Workload

`git diff --shortstat HEAD -- ein-pi` reports 3 files changed, 425 insertions, 10 deletions (435 total changed lines). Production exceeds the 220–320 line forecast in `design.md` by 115–215 lines and exceeds the 400-line review budget by 35 lines. The change stays within the bounded implementation slice (the three planned production files), and the test diff is 2 files, 216 insertions, 1 deletion (217 lines) — reported separately as required. The deterministic Review Workload Guard must therefore determine the delivery shape (single PR vs. chained PRs) before any PR is opened. This VERIFY pass does not waive that guard.

## Files touched

Production:

- `ein-pi/agent/lib/candidate-receipt.ts` — archive path derivation, lifecycle lock, byte-identity read, `withReceiptLifecycleLock`, `retiredCandidateReceiptPath`, `readActiveCandidateReceiptEvidence`, `retireCandidateReceipt`, `publishImmutable`, `writeAtomicBytes`, `RetirementMetadata` type, `RetireCandidateReceiptInput`/`Result` types, `archivedReceiptMatches`, `metadataFromDecision`, `matchingMetadata`.
- `ein-pi/agent/lib/delivery-receipt.ts` — `CandidateReceiptRetirementIdentity`, `NormalizedMergedPullRequestObservation`, `CandidateReceiptRetirementInput`, `CandidateReceiptRetirementDecision`, `evaluateCandidateReceiptRetirement`.
- `ein-pi/agent/extensions/ein-ai.ts` — `RetirementToolParams`, `normalizeGitHubRepository`, `explicitRemoteRepository`, `observeMergedPullRequest`, `pi.registerTool("ein_candidate_receipt_retire", ...)`, attempt cleanup after `retired`.

Tests:

- `tests/candidate-receipt.test.ts` — fingerprint + archive-path contract, archive-publication, archive-conflict, lifecycle-lock contention, revalidation divergence, atomic publication, identity adapters, fresh validation, verify-vigency.
- `tests/delivery-gate.test.ts` — retirement decision unit cases, mechanical-overlap lifecycle integration test.

Unchanged: `delivery-gate.ts`, `tests/ein-git-noninteractive.test.ts`, all `package.json`, `bunfig.toml`, `tsconfig.json`, and installer manifests.

Untracked WIP (not part of this change, not modified by this verification): `EIN.md`, `.sdd/changes/ein-sdd-state-machine-map/`, `openspec/changes/release-experience-roadmap/`, `openspec/changes/zero-friction-sdd-start/`, `openspec/config.yaml`, `tests/sdd-config-bootstrap.test.ts`.

## Review findings

No blockers.

| Severity | Finding |
|---|---|
| INFO | Production changed lines total 435 (425 insertions + 10 deletions) across 3 files, exceeding the 400-line review budget by 35 lines and the 220–320 design forecast by 115–215 lines. The deterministic Review Workload Guard must decide delivery shape (single PR vs. chained PRs) before any PR is opened. |
| INFO | Live GitHub CLI behavior (`gh pr view` against a real merged PR, authentication, timeout, fork detection, merge-result resolution) is not exercised by the test suite; the adapter is unit-tested only for the malformed-response branch and the integration tests inject a synthetic observation. |
| INFO | The decision function's explicit guards for missing `observation`, empty `mergeCommitOid`, empty `url`, mismatched `repository`, mismatched `prNumber`, mismatched `baseRef`, mismatched `headRef`, and non-`MERGED` state are all implemented in `delivery-receipt.ts:157-167` but only OPEN, fork-head, and mismatched-OID branches are exercised by `tests/delivery-gate.test.ts:440-449`. Coverage is complete for the policy but the explicit unit-level matrix is narrower than the integration-level assertions. |
| INFO | `delivery-gate.ts` and `tests/ein-git-noninteractive.test.ts` are byte-identical to `HEAD`, confirming the no-four-gate-weakening and no-mechanical-declaration-changes invariants. |
| INFO | `RECEIPT_VERSION` remains `1` and the `CandidateReceipt` field set is unchanged, confirming the no-format-change invariant. |

## Residual risks

- Real `gh pr view` against a merged same-repository PR, authentication failure, CLI timeout, malformed JSON response, fork-head detection, and merge-result OID resolution are untested at runtime; the implementation covers them by rejecting missing fields and `null` return, but no live CLI evidence was gathered.
- Production line workload exceeds both the design forecast and the 400-line review budget; the delivery workflow must run the Review Workload Guard and choose single-PR vs. chained-PR delivery shape.
- The interrupted-transition retry path (`unlinkSync` fails after archive publication) is tested only via the conflict-then-success sequence in `tests/delivery-gate.test.ts:458-510`; a real concurrent write racing the archive publish is not exercised.
- A fork-PR, force-push, or non-GitHub remote is rejected by `normalizeGitHubRepository` and `evaluateCandidateReceiptRetirement` but is not unit-tested directly; rejection is verified through `evaluateCandidateReceiptRetirement`'s fork-head test only.
- Existing focused tests pass in this verification, but no full delivery was performed (no commit, push, or PR was created).

## Next recommendation

Send this report to the required reviewer. Before any PR is opened, the delivery workflow must run the deterministic Review Workload Guard against the 435-line production diff; the budget overrun is 35 lines, which may be resolved either with a single-PR exception or by splitting the implementation into chained PRs (e.g., the pure decision + persistence transition as one slice, the `gh pr view` adapter + tool registration as a second slice). No commit, push, or PR was performed by this verification.
