# Design — candidate-receipt-retirement-hardening

## A. Proposal

### Intent

Retain the useful candidate-receipt retirement hardening already present at `961aefa`, while restoring the original closed change's evidence and the canonical lifecycle specification to their exact `1f89b0f` provenance before this sibling change takes ownership of the six post-review behaviors. Add the missing merged-PR adapter happy-path test and produce fresh synchronization, verification, summary, and candidate-receipt evidence for the final bytes.

### Canonical spec context

| Domain | Path | SHA-256 | UTF-8 bytes |
|---|---|---:|---:|
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `e74f081c21750fd3535929277fff5a22520a38ea2886cd51739bd815001d09bc` | 22940 |

Selection total: one file and 22,940 bytes. This is the authoritative context snapshot selected by `scope.md`; it includes post-close synchronization and therefore is not the restoration baseline. Apply MUST obtain the baseline bytes directly from `1f89b0f`.

### Scope

In scope:

- Keep the source hardening from `961aefa` in the three mapped production seams. The map confirms that terminal cleanup ownership is already correct; there is no confirmed source defect to repair in this slice.
- Restore exactly six original archived files from `1f89b0f`, byte for byte.
- Restore the canonical `sdd-lifecycle` spec from `1f89b0f`, then synchronize only this sibling delta's exactly six scenarios.
- Add one successful merged-PR JSON normalization test to the remote adapter suite.
- Retain the static public-tool contract test only as a wiring smoke test.
- Regenerate all closing and delivery evidence after review against the final bytes.

Out of scope:

- Reverting useful `961aefa` source hardening or inventing a cleanup defect already disproved by the map.
- Building a generic `ExtensionAPI` execution harness. No bounded runtime harness exists in the current suite; static inspection is not behavioral proof, and that residual wiring risk is accepted explicitly for this slice.
- Adding the original change's eleven scenarios to this sibling delta or declaring `spec_delta: none`.
- Changing grants, the four delivery gates, mechanical declarations, candidate-receipt format/version, remote scope, branch history, or existing PR commits.
- Supporting forks, direct push, non-GitHub remotes, force-push, or history rewriting.

### Affected areas

#### Production bytes retained unchanged unless a real defect is demonstrated

| Path | Ownership |
|---|---|
| `ein-pi/agent/extensions/ein-ai.ts` | Public tool wiring, session cleanup, durable cleanup reporting. |
| `ein-pi/agent/lib/candidate-receipt-retirement-remote.ts` | Push-URL resolution and bounded GitHub observation. |
| `ein-pi/agent/lib/candidate-receipt.ts` | Durable attempts, lock ownership, archive publication, directory durability, immutable metadata, and terminal cleanup state. |

#### Test impact

| Path | Design impact |
|---|---|
| `tests/candidate-receipt-retirement-remote.test.ts` | Add one successful JSON normalization case with an exact result assertion. |
| `tests/candidate-receipt-retirement-tool.test.ts` | Keep as static wiring smoke only; do not describe it as runtime behavior coverage. |
| `tests/candidate-receipt.test.ts` | Retain existing hardening coverage. |
| `tests/delivery-gate.test.ts` | Retain existing delivery-boundary integration coverage. |

The new adapter fixture MUST drive `observeMergedPullRequest` through an injected runner returning valid merged-PR JSON and assert the complete normalized object: `repository`, `prNumber` (PR), `url`, `state`, `headRepository`, `headRef` (head), `baseRef` (base), `headRefOid` (headOID), and `mergeCommitOid` (mergeOID). It SHOULD also assert the exact `gh pr view` argument list, timeout, and propagated signal so the test proves the intended adapter seam rather than only a JSON helper.

#### Historical restoration set

Apply MUST restore these paths from `git show 1f89b0f:<path>` bytes, with no reformatting:

1. `openspec/changes/archive/candidate-receipt-retirement/apply-progress.md`
2. `openspec/changes/archive/candidate-receipt-retirement/design.md`
3. `openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md`
4. `openspec/changes/archive/candidate-receipt-retirement/summary.md`
5. `openspec/changes/archive/candidate-receipt-retirement/sync-report.md`
6. `openspec/changes/archive/candidate-receipt-retirement/verify-report.md`

The same baseline source applies first to `openspec/specs/sdd-lifecycle/spec.md`; unlike the six archived files, the canonical file then receives this sibling's six-scenario synchronization.

#### Sibling-owned OpenSpec evidence

The active change owns `scope.md`, `map.md`, this `design.md`, `specs/sdd-lifecycle/spec.md`, and later phase artifacts `tasks.md`, `apply-progress.md`, `sync-report.md`, `verify-report.md`, and `summary.md`. Close moves the complete sibling change into `openspec/changes/archive/candidate-receipt-retirement-hardening/`. The final candidate-receipt manifest MUST be derived from the final Git diff and name every final changed path explicitly, including both sides of any close-time rename.

### Risks

- Restoring the canonical baseline without immediately applying the sibling delta creates an intermediate file missing current scenarios. This state must remain local to one blocked apply flow and must never be delivered.
- A sync against the currently polluted canonical spec would report `added-existing`/conflict and obscure ownership.
- Filesystem durability and lock recovery are platform-sensitive. Existing fail-closed behavior must not be weakened to make tests easier.
- A terminal unlink cannot be rolled back honestly. Cleanup failure must remain visible as `cleanupPending` and retryable.
- Static source inspection can detect missing registration names but cannot prove public-tool execution.
- Stale verify, summary, or candidate-receipt evidence could bind an older tree. Any covered byte change invalidates the chain.
- The mapped workload is already 1,733 production/documentation lines plus 392 test lines before final sibling artifacts, far above the 400-line review budget.

### Rollback

Before canonical restoration, apply MUST retain a temporary copy and digest of the pre-apply canonical file. Baseline extraction and byte checks happen before replacement. If restoration or sibling synchronization fails, apply restores that pre-apply canonical snapshot so the working tree is not left without the six current scenarios, records the failure, and blocks close and delivery. A `state: conflict` sync report is never an acceptable close state.

The six original archived files may remain at their corrected `1f89b0f` bytes while a failed apply is investigated; they are historical truth, not partial new behavior. To abandon the remediation entirely, use a normal revert commit for sibling-owned changes and verify canonical completeness before delivery. Do not reset, force-push, rewrite branch history, or alter prior PR commits. The retained `961aefa` source hardening is not part of the rollback unless a separately confirmed defect justifies a new change.

### Success criteria

- All six original archived files compare byte-for-byte with `1f89b0f`.
- Canonical `sdd-lifecycle` equals the restored baseline plus only the sibling delta's six scenarios and remains semantically current.
- The sibling sync report is fresh, owned by this change, and says `state: synchronized`; `state: conflict` never permits close or delivery.
- The merged-PR adapter test asserts the exact normalized successful observation.
- Static tool coverage is reported only as wiring smoke, with runtime wiring risk stated rather than hidden.
- Fresh verify, summary, archive, and candidate receipt describe the same final source, test, historical-restoration, and canonical-sync bytes.
- The stale receipt/tree `1c3138ed...` is rejected; a new candidate receipt is emitted for the final HEAD/tree.
- Review workload is recalculated and the user makes a new explicit single-PR versus chained-PR decision before delivery.

## B. Spec

The sibling delta at `specs/sdd-lifecycle/spec.md` MUST contain exactly six `ADDED` scenarios and no original eleven-scenario replay. Those six observable requirements are:

### Requirement: durable attempt identity

The system MUST persist a validated attempt with repository, worktree, receipt fingerprint, and validated delivery HEAD identity, and MUST recover or clear it only for an exact match.

**Scenario**

- **Given** a validated post-commit attempt exists for one active receipt.
- **When** retirement or replacement runs in the same or a later process.
- **Then** only exact matching durable state may authorize retirement, and replacement or completed matching retirement clears durable and in-memory state.

### Requirement: explicit push destination and bounded observation

The system MUST resolve exactly one valid GitHub push URL and MUST make GitHub observations with timeout and `AbortSignal` support, failing closed on ambiguity or failure.

**Scenario**

- **Given** a caller names a local remote and pull request.
- **When** the system resolves the push destination or observes the pull request.
- **Then** zero, multiple, malformed, timed-out, cancelled, failed, or malformed-output observations leave the active receipt effective.

### Requirement: owner-matched lock and durable transitions

The system MUST serialize lifecycle mutation with PID-and-token ownership, MUST recover only a proven dead owner through atomic quarantine, and MUST request supported directory durability before reporting success.

**Scenario**

- **Given** a lifecycle operation needs to publish, replace, or remove receipt evidence.
- **When** lock ownership or filesystem durability is evaluated.
- **Then** live or untrusted locks block, stale owners cannot release replacement locks, and unsupported or failed directory synchronization blocks success.

### Requirement: durable archive ancestry

The system MUST create and synchronize every missing archive ancestor and its parent before terminal active-slot removal.

**Scenario**

- **Given** retirement needs a fingerprint archive directory that does not exist.
- **When** archive evidence is published and the active slot is deactivated.
- **Then** all new ancestors and parents are synchronized in order before unlink, and any unsupported or failed synchronization blocks the transition.

### Requirement: immutable retirement metadata

The system MUST publish retirement metadata with a no-replace protocol and MUST compare existing bytes rather than overwrite a concurrent writer.

**Scenario**

- **Given** archived receipt bytes are complete and retirement metadata is ready to publish.
- **When** another writer wins the publication race.
- **Then** matching bytes may be reused, while conflicting or unreadable bytes block retirement and preserve the active slot.

### Requirement: truthful terminal cleanup

The system MUST report `cleanupPending` after terminal unlink when durable-attempt cleanup fails and MUST allow an already-retired retry without permitting stale authorization.

**Scenario**

- **Given** archive publication and active-slot unlink completed for the matching receipt.
- **When** durable-attempt cleanup fails.
- **Then** retirement remains terminal but pending cleanup is explicit, session state is discarded, retry is available, and replacement emission remains blocked until stale state can be cleared.

The remediation process also has these acceptance requirements:

### Requirement: historical evidence integrity

The apply flow MUST restore the six named original archived files to exact `1f89b0f` bytes and MUST NOT let old reports claim coverage of post-review behavior.

**Scenario**

- **Given** the original archived change contains post-close edits.
- **When** remediation restoration completes.
- **Then** each named file is byte-identical to `1f89b0f`, and all new claims live only in the sibling change.

### Requirement: ordered canonical ownership

The apply flow MUST restore canonical `sdd-lifecycle` from `1f89b0f` and then synchronize only the sibling six-scenario delta as one delivery-blocking flow.

**Scenario**

- **Given** the working canonical file already contains unowned post-close additions.
- **When** restoration and sibling synchronization run.
- **Then** the final canonical behavior is current, the sibling report is `state: synchronized`, and any interruption or conflict blocks close and delivery.

### Requirement: honest adapter and wiring evidence

The test suite MUST execute successful merged-PR JSON through the remote adapter and assert its exact normalized output; static tool inspection MUST be labeled only as wiring smoke.

**Scenario**

- **Given** an injected command runner returns a valid same-repository merged-PR response.
- **When** `observeMergedPullRequest` parses it.
- **Then** the exact repository/PR/URL/state/head/base/headOID/mergeOID result is returned, while no generic extension harness or runtime-tool proof is claimed.

### Requirement: final evidence freshness

The system MUST generate new verify, summary, and candidate-receipt evidence after all review fixes, historical restoration, and canonical synchronization affecting final delivery bytes.

**Scenario**

- **Given** the old receipt identifies tree `1c3138ed...` and the final tree differs.
- **When** close readiness and delivery are evaluated.
- **Then** the old evidence is invalid, fresh verification and summary cover the final remediation, and a new receipt binds the final archived change and exact path manifest.

### Requirement: delivery invariants and workload gate

The remediation MUST preserve existing grants, gates, declarations, receipt format, remote scope, history, and commits, and MUST require a renewed delivery decision after workload recalculation.

**Scenario**

- **Given** the mapped diff exceeds the 400-line production review budget and prior approval covered smaller counts.
- **When** delivery is proposed.
- **Then** no delivery proceeds until fresh production/documentation and test counts are reported and the user explicitly chooses a single or chained PR strategy.

## C. Decisions

### Under-the-hood sequence

1. **Prepare without mutation.** Extract the seven `1f89b0f` blobs to temporary files, verify all blobs exist, byte-count/digest them, and snapshot the pre-apply canonical file for failure recovery.
2. **Restore historical truth.** Replace the six original archive files with the verified temporary bytes. Do not edit, regenerate, or resynchronize that archived change.
3. **Restore then synchronize canonical state.** Replace canonical `sdd-lifecycle` with its verified `1f89b0f` blob and, in the same apply flow, run deterministic OpenSpec synchronization for `candidate-receipt-retirement-hardening`. Only the six sibling scenarios may be added. A failed or conflicting sync restores the pre-apply canonical snapshot and blocks progression.
4. **Retain production hardening.** Keep the mapped `961aefa` implementations. No source cleanup is planned because the map confirms `ein-ai.ts` already owns cleanup for both `retired` and `already-retired` results.
5. **Close the one known test gap.** Add the successful merged-PR fixture and exact normalized-object assertion to the remote adapter test. Keep existing fail-closed, persistence, locking, durability, metadata-race, cleanup, and delivery-gate tests.
6. **Verify after review.** Run focused tests, OpenSpec tests, full Bun tests, installer typecheck, byte comparisons, whitespace checks, and sync-state checks only after all source/test/spec review fixes are complete.
7. **Finalize evidence.** Write a fresh verify report from those runs, write a summary that references the new report and synchronized canonical state, close/archive this sibling, derive the final explicit Git path manifest, and emit a new candidate receipt for the final HEAD/tree. Any subsequent covered-byte change restarts verification, summary, and receipt emission.
8. **Gate delivery.** Recalculate production/documentation and test workload. Delivery remains blocked until the renewed user decision and all normal grants and four delivery gates pass.

Restoration and synchronization are distinct auditable operations but one apply flow: this makes provenance visible without allowing delivery between them.

### Responsibility boundaries

| Owner | Responsibility |
|---|---|
| `candidate-receipt-retirement-remote.ts` | External Git/GitHub normalization, timeout, cancellation, and fail-closed observation. |
| `candidate-receipt.ts` | Durable local state, lock ownership, immutable archive publication, fsync ordering, terminal transition, and cleanup state. |
| `delivery-receipt.ts` | Existing pure identity/retirement decision contract; unchanged in this remediation. |
| `ein-ai.ts` | Public tool registration, adapter orchestration, session-state cleanup, and user-visible `cleanupPending`. |
| Remote adapter test | Observable success and failure behavior at the injected command boundary. |
| Static tool test | Registration/import/call-site smoke only. |
| Sibling delta | Exactly the six post-review behavioral scenarios. |
| Apply flow | Exact historical restoration and ordered canonical synchronization. |
| Verify/close flow | Fresh evidence, sibling archive, final manifest, and candidate receipt. |
| `ein-git` delivery flow | Existing grants, four gates, workload decision, commit/push/PR; unchanged. |

### Decisions and trade-offs

- **Retain `961aefa` hardening.** It addresses real durability and concurrency risks, and the map found no cleanup defect. Reverting it would remove protection while doing nothing to repair evidence provenance.
- **Use baseline restoration before sync.** This prevents `added-existing` from being misrepresented as sibling ownership. The cost is a temporary local baseline state, controlled by the single-flow delivery block and canonical snapshot rollback.
- **Test the adapter seam, not GitHub.** An injected runner gives deterministic coverage of command shape and normalization without network flakiness.
- **Keep static tool smoke with an explicit limitation.** It cheaply catches deleted registration/import wiring, but it does not execute `ExtensionAPI` or prove runtime behavior.
- **Emit the receipt after close.** Candidate receipt resolution already supports archived changes, and this ordering lets the receipt bind final close paths and summary bytes rather than a pre-close tree.
- **Fail closed on freshness.** No prior green CI run, old summary, old sync report, or stale receipt substitutes for final verification.

### Alternatives rejected

- **Revert all post-review source changes:** rejected because useful hardening would be lost and no confirmed implementation defect warrants it.
- **Edit the original archive to describe `961aefa`:** rejected because historical evidence must describe only the bytes originally verified.
- **Sync onto the current canonical file:** rejected because the six scenarios are already present there without clean sibling ownership and can produce conflict/`added-existing` evidence.
- **Accept `state: conflict` and force close:** rejected. `state: conflict` is never an acceptable close state, including with force.
- **Replay the original eleven scenarios:** rejected because this sibling owns only six post-review behaviors.
- **Declare `spec_delta: none`:** rejected because the sibling must own and synchronize a real six-scenario delta.
- **Build a generic extension harness:** rejected as broad infrastructure work without an existing bounded seam; it would expand review workload and architecture for one wiring risk.
- **Treat static source strings as behavior proof:** rejected because they cannot execute registration, parameter validation, orchestration, or cleanup.
- **Rewrite history or force-push:** rejected because provenance is repaired by normal content changes and fresh evidence, not by altering branch/PR history.

## D. Success Criteria

### Observable acceptance checks

- The sibling delta parser sees exactly six scenarios, all under `ADDED`, with no original eleven-scenario replay and no `spec_delta: none` declaration.
- `cmp` reports equality for each of the six restored original archive paths against `git show 1f89b0f:<path>`.
- The final canonical spec passes OpenSpec tests and contains the restored baseline plus only the six sibling additions.
- The new sibling `sync-report.md` is fresh and reports `state: synchronized`; any `state: conflict`, malformed, stale, or missing report blocks close/delivery.
- The merged-PR happy path returns exactly the normalized object fields named above, including lower-cased repository identities and exact OIDs.
- Existing focused hardening tests and the full suite pass after the last source/test/spec review change.
- The fresh verify report records the final commands and historical/canonical checks; the fresh summary agrees with it; the new candidate receipt binds the final HEAD/tree, reports, commands, and explicit changed-path manifest.
- No use is made of the stale tree `1c3138ed...` receipt.
- Final workload numbers are reported separately for production/documentation and tests, and delivery waits for renewed explicit user choice.

### Required verification commands and deterministic checks

Run from the repository root after all review edits:

```bash
bun test tests/candidate-receipt.test.ts tests/delivery-gate.test.ts tests/candidate-receipt-retirement-remote.test.ts tests/candidate-receipt-retirement-tool.test.ts
bun test tests/openspec-specs.test.ts
bun test
bun run --cwd installer typecheck
git diff --check
```

Verify exact historical bytes without rewriting them:

```bash
for path in \
  openspec/changes/archive/candidate-receipt-retirement/apply-progress.md \
  openspec/changes/archive/candidate-receipt-retirement/design.md \
  openspec/changes/archive/candidate-receipt-retirement/specs/sdd-lifecycle/spec.md \
  openspec/changes/archive/candidate-receipt-retirement/summary.md \
  openspec/changes/archive/candidate-receipt-retirement/sync-report.md \
  openspec/changes/archive/candidate-receipt-retirement/verify-report.md
do
  cmp "$path" <(git show "1f89b0f:$path") || exit 1
done
```

Invoke deterministic OpenSpec synchronization for `candidate-receipt-retirement-hardening`, then inspect its generated report and require `state: synchronized`. This invocation is part of apply/close evidence, not a manual canonical edit.

Before delivery, run the configured production workload calculation against the actual PR base and report tests separately:

```bash
git diff --shortstat <base>..HEAD -- . \
  ':(exclude)*.test.*' ':(exclude)*.spec.*' \
  ':(exclude)**/tests/**' ':(exclude)**/__tests__/**' ':(exclude)**/e2e/**' \
  ':(exclude)*.snap' ':(exclude)*-lock.*' \
  ':(exclude)dist/**' ':(exclude).output/**' ':(exclude).nuxt/**' \
  ':(exclude)coverage/**' ':(exclude)*.min.*'
```

The delivery decision is not implied by passing verification. If any final source, test, restored archive, canonical spec, sync report, verify report, summary, or close path changes after these checks, the affected checks and the verify/summary/candidate-receipt chain MUST be regenerated before delivery.
