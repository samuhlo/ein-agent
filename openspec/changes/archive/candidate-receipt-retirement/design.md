# Design — deterministic candidate-receipt retirement

## A. Proposal

### Intent

Add one explicit, fail-closed lifecycle transition that retires the active candidate receipt only after GitHub freshly proves that the exact validated delivery head was merged through one explicitly identified pull request. The transition preserves the active receipt bytes unchanged before removing the active slot, so an old manifest stops affecting later delivery without becoming a bypass.

### Scope

In scope:

- one explicit `ein_candidate_receipt_retire` operation;
- merged, same-repository GitHub pull requests as the only supported terminal boundary;
- exact receipt/attempt/repository/worktree/remote/base/head/PR binding;
- collision-safe byte archive plus separate immutable retirement metadata;
- durable attempt evidence, owner-matched lifecycle serialization, two fresh revalidations, idempotency, and attempt rotation;
- focused Bun coverage of decision, persistence, overlap, failure, and race behavior.

Out of scope:

- retirement after only commit, push, or PR creation/update;
- direct-push-only, fork-PR, non-GitHub, force-push, or caller-supplied completion evidence;
- age, branch-name, keyword, user-prose, local-`HEAD`, or cached-observation inference;
- changes to grants, mechanical declarations, the four existing delivery gates, or verification claims;
- a new dependency, database, daemon, or broad delivery redesign.

### Canonical spec context

| Path | SHA-256 | UTF-8 bytes |
| --- | --- | ---: |
| `openspec/specs/sdd-lifecycle/spec.md` | `caf858c757e77e0f31f1b05f66a8e80d09ca6eff4c8fa6ec19f8c54a55951afa` | 20575 |

Selection: 1 file, 20575 bytes; within the 3-file/32768-byte limit declared in `scope.md`. The archived delta records the post-review scenarios that are already present in this canonical context; it is historical evidence, not a live synchronization gate.

### Affected areas and exact symbol impact

| File | Planned symbol-level change |
| --- | --- |
| `ein-pi/agent/lib/candidate-receipt.ts` | Add raw active-evidence reading, lifecycle-lock handling shared by emission/retirement, retired archive path derivation, exact-byte publication/conflict checks, and `retireCandidateReceipt` ordered persistence. Keep `CandidateReceipt` version and payload unchanged. |
| `ein-pi/agent/lib/delivery-receipt.ts` | Add a normalized merged-PR observation type and a pure `evaluateCandidateReceiptRetirement` decision. Keep the four gate evaluators unchanged. |
| `ein-pi/agent/extensions/ein-ai.ts` | Register sibling tool `ein_candidate_receipt_retire`; add the `gh`/remote observation adapter; pass the session attempt into the pure decision and persistence transition; clear/rotate `deliveryAttemptBySession` in the defined order. |
| `tests/candidate-receipt.test.ts` | Add exact-byte archive, archive conflict/failure, interrupted transition/retry, identity mismatch, and stale-attempt decision coverage. |
| `tests/delivery-gate.test.ts` | Add merged/unmerged/unobserved decision cases and mechanical overlap before versus after retirement. |

`ein-pi/agent/lib/delivery-gate.ts` and `tests/ein-git-noninteractive.test.ts` should remain unchanged: the live slot already controls mechanical overlap, and retirement must not alter declarations or grant semantics.

Production forecast: 220–320 changed lines across the three production files, below the 400-line review budget. Tests are reported separately.

### Risks

- GitHub CLI fields or authentication may be unavailable; retirement then remains blocked.
- A process crash can leave both active and archived evidence, or a lifecycle lock; both are conservative but may require retry or inspected lock recovery.
- Same-repository merged PR support excludes valid fork/direct-push workflows by design.
- Incorrect normalization of Git remote identity could accept the wrong PR; exact owner/repository comparison and tests are mandatory.
- Removing the active slot is the irreversible gate transition; all fallible publication and evidence checks must finish first.

### Rollback

Before release, revert the implementation and tests; the unchanged active receipt format remains readable. After a receipt has been retired, rollback is fail-closed: under the lifecycle lock, restore the archived `candidate-receipt.json` bytes to the active slot by atomic publication and leave the archive/history intact. Never reconstruct the active receipt from retirement metadata. A rollback does not restore or fabricate an attempt, so verified delivery must restart from verification before another protected delivery.

## B. Spec

### Requirements

1. The system **MUST** treat only a freshly observed merged same-repository GitHub pull request as a supported terminal boundary for retirement. A successful commit, push, or PR creation/update **MUST NOT** retire a receipt.
2. The system **MUST** expose retirement as an explicit deterministic operation and **MUST NOT** infer it from prose, keywords, command success, age, branch movement, or a later delivery attempt.
3. First-time retirement **MUST** bind the SHA-256 of the current active receipt bytes to the attempt fingerprint, its `validatedDeliveryHead`, current repository/worktree identity, explicit Git remote, explicit base/head refs, explicit PR number, and a fresh normalized GitHub observation.
4. The GitHub observation **MUST** identify the selected remote repository and PR, report `MERGED` with a merge result, and report a PR head OID equal to `validatedDeliveryHead`; absent, unavailable, stale/reused, unmerged, forked, ambiguous, or mismatched evidence **MUST** fail closed.
5. The system **MUST** publish the exact active receipt bytes to a fingerprint-addressed retired archive and publish matching immutable retirement metadata before removing the active slot. A conflicting archive or any partial publication **MUST** leave the active slot effective.
6. Repeating retirement for an already retired fingerprint **MUST** return an `already-retired` success only after exact archive bytes and all stored identities match; it **MUST NOT** overwrite conflicts or claim a new remote observation.
7. The system **MUST** revalidate receipt bytes, attempt state, local identities, and a second fresh remote observation immediately before deactivation. Any concurrent change **MUST** abort deactivation and preserve the active gate.
8. A stale or missing attempt **MUST NOT** authorize an active receipt. Attempt state **MUST** be cleared before a new receipt is published and only after successful deactivation when retiring; every decision **MUST** compare the active raw-byte fingerprint.
9. A later delivery overlapping the retired manifest **MAY** proceed only after successful retirement, under its own unchanged grant and content-authority declaration, and **MUST NOT** be represented as verified merely because the old receipt was retired.

### Scenarios

The complete Given/When/Then scenarios are canonical in `specs/sdd-lifecycle/spec.md` for this change. The acceptance checks in section D mirror them without redefining the domain contract.

## C. Decisions

### Under-the-hood sequence

1. The explicit tool requires `change`, `receiptFingerprint`, `remote`, `baseRef`, `headRef`, and `prNumber`; there are no inferred defaults for delivery identity.
2. Acquire an exclusive receipt-lifecycle lock under the current worktree git admin directory. Receipt emission uses the same lock. A busy or untrusted leftover lock blocks; it is never ignored or age-reaped automatically.
3. Read the active slot once as raw bytes. Hash those bytes, parse/validate the receipt against current SDD evidence, and require equality with both the explicit fingerprint and the session attempt fingerprint. Require a non-empty `validatedDeliveryHead`.
4. Persist the post-commit validated delivery head under the worktree git directory with repository/worktree IDs and receipt fingerprint. Recovery after restart requires every stored value and the active raw fingerprint to match; replacement emission and successful matching retirement clear this record.
5. Resolve the explicit remote through `git remote get-url --push --all`. Normalize exactly one GitHub push URL to `owner/repository`; reject zero or multiple URLs, non-GitHub URLs, and fork PRs in this slice.
6. Invoke `gh pr view` inside the operation, addressed by the explicit repository and PR number, through a testable adapter with a finite timeout and AbortSignal. Normalize only bound fields: repository, PR number/URL, state/merged marker, head repository/ref/OID, base ref, and merge-result OID. Caller-provided JSON and prior pre-PR observations are not accepted.
6. The pure decision requires a same-repository `MERGED` PR, exact remote/base/head/PR identity, non-empty merge result, and `headRefOid === validatedDeliveryHead`.
7. Derive `<gitDir>/ein/retired-candidate-receipts/<receiptFingerprint>/candidate-receipt.json`. Publish a flushed temporary file with immutable no-overwrite semantics, fsync its directory on Linux/macOS, and read it back byte-for-byte. If the final file already exists, accept it only when bytes are identical; never overwrite it.
8. Re-read and compare the active bytes, durable attempt, repository/worktree, and explicit identities. Perform a second mandatory fresh `gh` observation immediately before deactivation and require the same bound normalized values and retirement verdict.
9. Publish separate immutable `retirement.json`, containing the receipt fingerprint, validated delivery head, repository/worktree IDs, normalized remote repository, base/head refs, PR number/URL, merged state, PR head OID, and merge-result OID. Existing metadata must match field-for-field; conflicts block.
10. Re-read the active bytes and attempt once more, then unlink only that still-matching active slot and fsync its parent directory on supported platforms. No fallible work follows deactivation. If unlink fails, active plus archive remains and retry resumes safely.
11. Only after unlink succeeds, clear the session and durable attempt and return `retired`. Release only a lifecycle lock whose PID/token still belongs to this operation; a lock with a proven dead owner is atomically quarantined before recovery.
12. If the active slot is absent, the idempotent path requires the explicit fingerprint and verifies archived payload bytes, parsed repository/worktree/change identity, and retirement metadata. It returns `already-retired` without network mutation or a fresh completion claim. Missing or conflicting local proof fails closed.

### Terminal boundary decision

| Boundary | Evidence available | Retirement decision |
| --- | --- | --- |
| Successful commit | Post-commit tree match creates `validatedDeliveryHead`; content is local. | Not terminal. It proves exact committed bytes, not publication or integration. |
| Successful push | Current gate is pre-push and does not observe command success or destination integration. | Not terminal. Even observed publication would not prove the intended PR completed. |
| Successful PR creation/update | Current gate is pre-PR; an open PR remains mutable and unmerged. | Not terminal. Creation/update success is not delivery completion. |
| Merge | Fresh GitHub PR state can bind immutable PR identity and its recorded head OID to `validatedDeliveryHead`. | Sole supported terminal boundary. `MERGED` plus exact head binding proves GitHub completed that PR for the validated head. |

Replay is prevented by the conjunction, not by a mutable name: the archive key is the SHA-256 of the exact active bytes; those bytes already bind repository, worktree, change, candidate tree, manifest, and verify report; the attempt binds that fingerprint to one `validatedDeliveryHead`; and retirement metadata binds that head to one normalized remote/base/head/PR tuple. A changed candidate changes the raw fingerprint. Byte-identical evidence is the same candidate identity, not a different candidate that can borrow the proof.

### Trigger decision

Use the explicit `ein_candidate_receipt_retire` tool. Automatic pre-delivery retirement is rejected because it would combine a new delivery authorization path with network observation and state deletion, making overlap itself an implicit trigger. Keyword/prose inference is rejected because it is neither identity-bound nor fail-closed. The explicit tool has a narrow schema, a separately inspectable result (`retired`, `already-retired`, or blocked), and no grant side effects.

### Network-truth decision

Fresh network truth is required twice for first-time retirement and for resuming an interrupted transition while the active slot remains. Both observations occur inside the tool through timeout- and AbortSignal-aware `gh`; no supplied/cached observation is accepted. Authentication failure, timeout, cancellation, non-zero exit, malformed/missing fields, unresolved or ambiguous push remote, wrong repository, unmerged/closed state, deleted or mismatched head identity, fork head, or differing revalidation observations blocks removal.

The already-retired idempotent path uses the immutable local archive and retirement metadata produced by a prior successful fresh observation. It does not need the network because it performs no transition and makes no new claim; its result explicitly means “the matching retirement is already recorded.”

### Historical OpenSpec evidence

The archived delta is completed with the three post-review scenarios for durable attempts across processes, one explicit push URL with bounded `gh` observation, and PID/token owner-matched locking with directory durability. Recomputing its sync receipt against the current canonical spec correctly produces `state: conflict`: each archived `ADDED` scenario is already canonical and is reported as `added-existing`. This receipt documents historical consistency only; it is not an active close or synchronization gate and must not be described as a clean completed sync.

### Atomicity and concurrency decision

Filesystem publication is conservatively ordered rather than presented as a multi-file atomic transaction. The safe intermediate state is “active plus complete/partial archive,” because the active gate still applies. “Neither active nor verified archive” is forbidden. Exclusive lifecycle locking serializes active receipt emission and retirement; exact byte/attempt/identity revalidation catches mutation outside that cooperating path. Any mismatch aborts before unlink. There is no fallback to deletion, `mechanical-unverified`, or archive overwrite.

### Attempt rotation decision

- New emission: clear the current session attempt before acquiring/publishing the replacement receipt. If publication fails, losing the attempt is conservative.
- First retirement: keep the matching attempt through all archive and remote checks; clear it only after active unlink succeeds.
- Other sessions/processes: every gate and retirement check must compare its attempt fingerprint with the current active raw-byte fingerprint, so stale memory cannot authorize replacement bytes.
- Already retired: no attempt is reconstructed from metadata.

### Security invariants

- Uncertainty never removes the active content gate.
- User intent authorizes actions; candidate evidence authorizes content; retirement authorizes neither.
- The archived payload is exactly the source bytes, not reserialization or a summary.
- Archive conflicts are evidence conflicts, never overwrite opportunities.
- A merged PR proves retirement only for its exact repository/PR/head tuple.
- The active slot remains authoritative throughout any interrupted transition.
- No stale attempt, remote snapshot, prose, or local branch movement substitutes for current bound evidence.

### Rejected alternatives

- **Retire after commit:** rejected because the candidate has not left the worktree.
- **Retire after push:** rejected because push publication is not PR completion and current hooks do not observe successful destination state.
- **Retire after PR creation/update:** rejected because an open PR is mutable and may never merge.
- **Automatic pre-delivery cleanup:** rejected because overlap would become an implicit bypass and a network failure would be coupled to unrelated delivery.
- **Infer PR from branch/current repository:** rejected because names are mutable and ambiguous; all remote/base/head/PR identities are explicit.
- **Move active directly with one rename:** rejected because the active slot disappears at the same instant as first archive publication, violating archive-before-deactivate ordering and complicating interrupted verification metadata.
- **Delete then write archive or summarize the receipt:** rejected because evidence can be lost or altered.
- **Persist attempts in a database or service:** rejected; a small worktree-local immutable identity record is enough to recover safely after restart without adding a dependency or widening the trust boundary.
- **Support forks/direct pushes now:** rejected to keep the proof narrow and deterministic under the production-line budget.

## D. Success Criteria

### Observable acceptance checks

- Given an active receipt after only a successful commit, push, or PR create/update, when retirement is requested, then the active bytes remain and the operation reports that no supported terminal boundary is proven.
- Given matching active bytes, attempt, identities, and a freshly and repeatedly observed merged PR whose head OID is the validated delivery head, when retirement runs, then the exact bytes exist in the fingerprint archive before the active slot disappears and the result is `retired`.
- Given the same completed retirement, when the explicit operation is repeated with the same identity, then it verifies archived bytes and metadata and returns `already-retired` without overwriting evidence.
- Given missing/corrupt/mismatched receipt or attempt evidence, unavailable/unmerged/mismatched GitHub evidence, archive conflict/failure, or concurrent mutation, when retirement runs, then it fails closed and the active gate remains effective.
- Given a mechanical delivery touching an active receipt manifest, when its gate is evaluated before retirement, then it remains blocked; after successful retirement it is evaluated under its own unchanged declaration and grant, without a verification claim.
- Given a new receipt after attempt rotation, when stale attempt state is presented, then fingerprint mismatch blocks it and cannot authorize retirement or delivery.

### Verification plan

Focused behavior:

```bash
bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts
```

Full regression gate:

```bash
bun test
```

Manual/fixture checks should inspect that the archived `candidate-receipt.json` is byte-for-byte equal to the former active file, `retirement.json` is separate, no temporary archive file remains, archive conflicts are unchanged, and an unavailable `gh` observation leaves the active slot present. No test or build is run during design; these commands belong to apply/verify.
