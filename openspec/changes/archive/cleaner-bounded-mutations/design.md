# Design — cleaner-bounded-mutations

## A. Proposal

### Intent

Enable one reviewed cleaner finding to become one explicit, reviewable mutation slice without weakening the read-only H audit or the B/G evidence authorities. The mechanism admits a single predeclared mechanical replacement, fails closed before any write when evidence or boundaries are uncertain, and keeps the slice incomplete until fresh verification is bound to the exact resulting Git state.

### Scope

In scope:

- An explicit I-owned application boundary for exactly one H finding.
- A slice declaration containing one target file, one exact replacement, ownership and behavior attestations, opaque actor/reviewer attribution, expected state/content identities, and verification commands.
- Fresh B/G/H precondition evaluation immediately before one write.
- Before/after state capture, stale-evidence representation, explicit failure outcomes, and a separate completion assessment against fresh verification.
- Strict-TDD contract coverage for admission, rejection, mutation, invalidation, and completion.

Out of scope:

- Autonomous finding selection, loops, retries, neighboring cleanup, or unattended execution.
- Architect/structural mutation, generic patches, AST codemods, file creation/deletion/rename, multi-file mutation, or changes above the 400-production-line review budget.
- Parallel writers, worktree orchestration, conflict resolution, staging, commits, rollback automation, or evidence repair.
- Changing H's read-only report, B's project/Git-state authority, G's ledger/evidence authority, router lifecycle authority, or adding another persistent ledger.
- Workbench, installer, or UI wiring.

### Affected areas

Planned implementation is limited to:

- `ein-pi/agent/lib/cleaner-bounded-mutations.ts` — new I-owned request validation, one-write application result, and completion assessment boundary.
- `tests/cleaner-bounded-mutations.test.ts` — new strict-TDD contract suite using isolated temporary repositories and instrumented dependencies.

Existing compatibility contracts are consumed but SHOULD remain unchanged:

- `ein-pi/agent/lib/cleaner-read-only-audit.ts`
- `ein-pi/agent/lib/project-state.ts`
- `ein-pi/agent/lib/reviewed-area-ledger.ts`
- `ein-pi/agent/lib/reviewed-area-ledger-store.ts`
- `ein-pi/agent/lib/sdd-router.ts`

### Context references

- Generated delta read from `openspec/changes/cleaner-bounded-mutations/specs/sdd-lifecycle/spec.md`.
- `scope.md` selected no canonical `openspec/specs/<domain>/spec.md` reference. Canonical selection is therefore **0 files / 0 UTF-8 bytes**; there is no canonical path, SHA-256, or byte count to claim.
- Design builds on the H/G/B seams and risks recorded in `openspec/changes/cleaner-bounded-mutations/map.md`; it does not create an additional domain hint.

### Risks

- H findings identify reviewed areas and freshness, but do not encode a proposed transformation. The slice declaration must therefore bind reviewer-approved exact before/after bytes to the selected finding; the command MUST NOT infer a cleanup.
- A syntactically small exact replacement can still change behavior. Human attestation plus focused fresh verification is required; uncertainty is denial.
- An unrelated external process can race the final precondition check. The boundary prevents internal fan-out and detects state/content mismatch after writing, but cannot make an unlocked filesystem globally transactional.
- A filesystem error may leave uncertain bytes. The result must distinguish a pre-write rejection from an uncertain post-write failure and must never claim rollback or completion.

### Rollback

There is no automatic rollback because a compensating write could overwrite unrelated work. For a confirmed mutation, a human may restore the exact target from version control or approve an inverse bounded SDD slice after checking current state and ownership. Any rollback changes state again, invalidates the mutation's verification, and requires fresh verification.

### Success criteria

Success means one current reviewed H finding can authorize exactly one bounded write, every denied request performs zero writes, old audit/verification evidence cannot remain current after the state transition, and completion is reported only for attributable passing verification bound to the exact resulting state. H remains observably read-only and no loop, multi-writer, multi-file, architect, or bulk path is exposed.

## B. Spec

### Requirement 1 — Single-finding admission

The system **MUST** accept a mutation request only when an explicitly selected finding ID resolves exactly once in a freshly recomputed H report and the finding is an `observed-fact` with high confidence, no uncertainty, current B state, current G reviewed status, exact Git binding, and verified evidence. Zero, duplicate, unknown, changed, stale, invalid, unavailable, ambiguous, or unresolved selections **MUST** be denied before any write.

**Scenario — stale selected finding is denied**

- **Given** a request names a finding from an earlier H report
- **When** fresh B/G/H evaluation produces a different state or finding identity
- **Then** the request is returned as blocked with a stable reason code and the writer is not invoked

### Requirement 2 — Explicit ownership and behavioral boundary

The system **MUST** require an explicit SDD change identity, one canonical G area, one existing regular non-symlink repository-relative target file, one declared affected seam, opaque actor and reviewer references, and an attestation that behavior is preserved. The target **MUST** be inside both the finding's canonical selectors and the declaration's exact path allowlist. Missing, ambiguous, expanded, generated/private/runtime, or out-of-area ownership **MUST** be denied.

**Scenario — target escapes ownership**

- **Given** a current reviewed finding and a declaration whose target is not contained by its canonical area
- **When** mutation admission is evaluated
- **Then** the system returns an ownership-boundary failure and performs zero writes

### Requirement 3 — One mechanical mutation only

The system **MUST** expose only one supported operation in this slice: replace one non-empty exact byte sequence occurring exactly once in one existing valid UTF-8 text file, where the full before-file SHA-256 matches the declaration and the full expected after-file SHA-256 is predeclared. It **MUST** reject no-op, zero-match, multi-match, multi-file, create/delete/rename, generic patch, inferred, structural, or over-budget changes. The computed diff **MUST** be one contiguous hunk and no more than 400 changed production lines. The boundary **MUST NOT** accept a collection of findings, operations, writers, or targets.

**Scenario — a second occurrence would broaden the change**

- **Given** all evidence is current but the declared old bytes occur twice in the target
- **When** the operation is validated
- **Then** the system returns a behavioral-boundary failure without choosing an occurrence and performs zero writes

### Requirement 4 — Compare immediately before one write

The system **MUST** reproject authoritative B state and reread the target immediately before mutation. That state reference and target digest **MUST** equal the admitted preconditions, the repository **MUST** be complete and unconflicted, and the selected SDD change **MUST** be explicit and unambiguous. If they differ, the system **MUST** stop. After validation, the command **MAY** invoke exactly one synchronous writer for the fully computed resulting bytes and **MUST NOT** stage, commit, retry, expand, or invoke another writer.

**Scenario — state changes during admission**

- **Given** initial evidence and target content pass validation
- **When** the final B projection no longer equals the finding's observed state reference
- **Then** the system returns `precondition-changed`, invokes no writer, and requires a new audit rather than retrying

### Requirement 5 — State transition invalidates prior evidence

When target bytes may have changed, the system **MUST** obtain a fresh B projection and return the observed-before and resulting-after state references with the selected finding and target identities. Prior H audit and verification evidence **MUST** be treated as stale or invalid and **MUST NOT** be presented as current for the resulting state. The I boundary **MUST NOT** rewrite H reports or the G ledger; G/B remain responsible for evaluating their own evidence against the new state.

**Scenario — successful write makes prior evidence stale**

- **Given** a validated request is bound to state A
- **When** the one write produces state B
- **Then** the result is `verification-required`, records A and B, marks prior audit/verification as non-current, and does not update G-owned evidence

### Requirement 6 — Fresh attributable verification gates completion

The system **MUST** separate mutation application from completion assessment. A slice is complete only when fresh B state still equals the recorded resulting state, router verification is not stale, and attributable verification records a passing outcome, opaque actor reference, executed command(s), and the same exact resulting state reference. Missing, failed, stale, unbound, invalid, unavailable, or differently bound verification **MUST** leave the slice incomplete. Session resume, runtime/provider change, elapsed time, or an earlier pass **MUST NOT** refresh evidence.

**Scenario — prior passing verification is not reusable**

- **Given** state A had a passing verification and the mutation produced state B
- **When** completion is assessed without a new passing verification bound to B
- **Then** the system reports `verification-required` or `verification-failed`, never complete

### Requirement 7 — Explicit failure outcomes

The system **MUST** return a discriminated, immutable outcome with a stable reason code. Failures before the writer **MUST** report `blocked` and guarantee zero writes. A writer error, unreadable post-state, unexpected post-write digest, unchanged state reference after changed bytes, or any post-write ambiguity **MUST** report `mutation-uncertain`, invalidate prior evidence conservatively, and require human inspection. The system **MUST NOT** auto-retry, auto-rollback, repair evidence, resolve conflicts, or continue to verification after an uncertain mutation.

**Scenario — writer fails after invocation**

- **Given** every precondition passes
- **When** the sole writer throws or returns an indeterminate result
- **Then** the system returns `mutation-uncertain` with available before/after observations and performs no retry or compensating write

## C. Decisions

### 1. Add a separate I command seam; preserve H as read-only

`auditCleanerReadOnly` remains unchanged and capability-free. A new module consumes fresh H/G/B projections and a declarative mutation request. This makes the transition from evidence to mutation explicit and prevents an audit call from becoming permission to write.

**Trade-off:** one more public module is preferable to hiding side effects in H, workbench, router, or ledger code.

### 2. Constrain the first mutation primitive to one exact replacement

The command supports one target, one exact occurrence, one contiguous hunk, predeclared full-file digests, and the 400-production-line ceiling. It computes complete resulting bytes before invoking the writer. This is intentionally narrower than a generic patch engine and makes single-write, stale-content, and bulk-change behavior measurable.

**Trade-off:** legitimate multi-file or structural cleanup requires another reviewed SDD design rather than broadening this boundary.

### 3. Recompute authority-owned inputs instead of trusting a carried report

Admission uses B for current project/Git state, G for canonical area and evidence evaluation, and H for the fresh finding identity. A caller-supplied old report can identify intent but cannot establish freshness. Final state and target checks occur immediately before the write.

**Trade-off:** repeated reads are deliberate; they close the stale-evidence gap and avoid a second authority.

### 4. Represent invalidation as an exact transition, not an evidence rewrite

The application result records finding ID, area ID, target, observed state, resulting state, post-target digest, attribution, and `verification-required`. Existing immutable H output is not modified, and the cleaner does not call `replaceWorkspaceLedger`. B/G determine freshness from exact state mismatch; the SDD verify artifact owns new verification evidence.

**Trade-off:** the result does not make evidence current. Human review and verification remain explicit later lifecycle responsibilities.

### 5. Keep apply and verify as separate ownership phases

The application function can end only in `blocked`, `mutation-uncertain`, or `verification-required`. A separate pure completion assessment may produce `complete` after consuming fresh B/router state and attributable verification. The mutation function does not run tests itself.

**Trade-off:** there is no one-call “clean and verify” convenience, which is intentional to preserve strict TDD evidence and lifecycle ownership.

### 6. Use injected narrow dependencies for deterministic tests, not a class hierarchy

A small functional boundary may receive project-state projection, file read/write, and clock/attribution adapters. Production defaults remain single-threaded; tests can count writer calls and force state transitions. No strategy/factory hierarchy is justified.

### Ownership boundaries

| Owner | Responsibility | Must not own |
|---|---|---|
| H audit | Deterministic immutable read-only findings | Writer or mutation result |
| B project state | Exact current project/Git and verification freshness | Cleaner policy |
| G ledger/evidence | Canonical area, reviewed evidence, transition freshness | Source-code mutation |
| I bounded mutation | Admission, exact one-write operation, transition/result, completion predicate | Ledger update, router state, autonomous selection, verification execution |
| SDD apply | Human-approved declaration and strict-TDD mutation invocation | Freshness authority |
| SDD verify | Commands, outcomes, attribution, exact resulting-state binding | Retrospective mutation expansion |

### Alternatives rejected

- **Add `apply` to `auditCleanerReadOnly`:** breaks H's tested read-only contract and turns observation into permission.
- **Reuse `replaceWorkspaceLedger`:** that guarded writer owns G's ledger file, not cleaner source code; reuse would cross evidence ownership.
- **Generic unified diff, AST transform, callback, or arbitrary command:** too expressive to make architect, multi-file, or inferred cleanup impossible through this boundary.
- **Automatically choose the first/highest-severity finding:** autonomous behavior and ordering would become accidental authorization.
- **Run verification inside the mutation command:** obscures RED/GREEN evidence, encourages retry loops, and conflates apply with verify.
- **Persist a cleaner freshness ledger:** duplicates B/G authority and creates reconciliation problems.
- **Automatic rollback:** a second write can destroy concurrent or unrelated work and cannot restore evidence freshness.
- **Filesystem locking/worktree orchestration:** not needed for the single-writer contract and explicitly outside this slice; external races remain fail-detectable rather than orchestrated.

## D. Success Criteria

### Observable acceptance checks

| Check | Acceptable observation |
|---|---|
| One-finding success | One fresh, current reviewed finding plus a valid declaration invokes the writer exactly once for one file and returns `verification-required` with distinct valid before/after state refs. |
| Cardinality | Zero, unknown, duplicate, changed, or multiple selections invoke the writer zero times. |
| Evidence preconditions | Every stale/invalid/unavailable/ambiguous/unbound B, G, H, or verification fixture fails closed with a stable reason. |
| Ownership | Traversal, absolute, symlink, generated/private/runtime, non-canonical, undeclared, and out-of-area paths perform zero writes. |
| Behavioral boundary | No-op, zero/multiple matches, multi-file, create/delete/rename, non-contiguous, over-400-line, architect-declared, or uncertain operations perform zero writes. |
| State race | A changed final precondition state/content is rejected without retry. |
| Invalidation | A write result records observed/resulting refs and prior H/verification is non-current immediately; G ledger bytes remain unchanged. |
| Fresh verification | Completion is impossible until a passing attributable verification and fresh B/router view bind to the exact resulting state. Resume/runtime changes alone never complete it. |
| Failure behavior | Pre-write errors guarantee zero writer calls; post-write ambiguity returns `mutation-uncertain`, never `complete`, and invokes neither retry nor rollback. |
| Compatibility | Existing H read-only assertions, G ownership/evaluation, B exact-state binding, and router stale verification remain passing without widening their APIs. |

### Strict-TDD evidence

The apply phase must preserve command output showing:

- **RED:** the focused contract test fails for the missing/incorrect I behavior before production implementation.
- **GREEN:** the smallest implementation makes the focused contract pass.
- **TRIANGULATE:** at least stale selection, out-of-area path, multiple occurrence, state-race, writer-error, and wrong verification-binding cases fail for their distinct reasons while writer-call counts remain correct.
- **REFACTOR:** any cleanup occurs only while the focused and compatibility suites remain green.

Known verification commands (not executed in design):

```sh
bun test tests/cleaner-bounded-mutations.test.ts
bun test tests/cleaner-read-only-audit.test.ts tests/reviewed-area-ledger.test.ts tests/shared-project-state.test.ts tests/sdd-router.test.ts
cd installer && bun run typecheck
```

Because `openspec/config.yaml` has no reliable configured test command, apply/verify must record the actual Bun command and result rather than claiming config-driven execution. The configured installer typecheck remains a compatibility check; if it does not cover the new module, that limitation must be reported rather than treated as full type coverage.

### Manual review checks

The resulting diff must show no mutation capability added to H, no G ledger write from I, no workbench/installer wiring, no collection-valued target/writer API, and no source edits beyond the approved bounded implementation slice. Verification evidence must visibly include the resulting `git-v1` state reference, actor attribution, commands, and outcomes.
