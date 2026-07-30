# Design: fail-closed forced SDD close

## A. Proposal

### Intent

Make `--force` a narrow, reason-bearing escape for one declarationless legacy record shape. It must never bypass evidence that tasks, apply, verify, summary, and canonical specifications are complete and current.

### Scope

In scope:

- Classify close-readiness blockers deterministically and preserve every non-legacy blocker under force.
- Permit one explicit legacy escape for a declarationless `unresolved` OpenSpec record after every other close gate passes.
- Return and display evidence that distinguishes a normal close from a legacy escape.
- Align the close library, router facts, command/tool help, lifecycle specification, and focused tests.

Non-goals:

- Changing the archive directory, move algorithm, rename/copy-remove fallback, or overwrite protection.
- Synchronizing, rewriting, repairing, or inferring canonical specs during close.
- Recovering `pending`, conflicted, malformed, or stale spec evidence.
- Treating `.sdd/changes/` compatibility as a forced escape; it remains the canonical `legacy` fallback behavior.
- Redesigning OpenSpec state evaluation, archive integrity, installers, or updaters.

### Canonical OpenSpec context

| Domain | Path | SHA-256 | UTF-8 bytes |
| --- | --- | --- | ---: |
| `sdd-lifecycle` | `openspec/specs/sdd-lifecycle/spec.md` | `65aa3ddb7f2a6a1ee9096c6bbcea785b9f1191a8b430845182cd442f23af824f` | 25,739 |

Selection uses 1 of 3 allowed files and 25,739 of 32,768 allowed UTF-8 bytes. The governing references are `canonical-close-readiness` and `legacy-sdd-fallback`.

### Affected areas: minimal candidate files

| File | Intended change |
| --- | --- |
| `ein-pi/agent/lib/sdd-router.ts` | Keep readiness facts in one place; expose stable blocker categories and the exact declarationless-legacy eligibility fact. |
| `ein-pi/agent/lib/sdd-close.ts` | Replace blanket force bypass with the decision table below; validate the reason; return differentiated legacy evidence while leaving movement unchanged. |
| `ein-pi/agent/extensions/ein-ai.ts` | Accept/pass the reason, render normal versus legacy success distinctly, and replace bypass-oriented command/tool help. |
| `openspec/changes/sdd-close-force-guard/specs/sdd-lifecycle/spec.md` | Correct the conflicting delta exactly as described in Decisions before synchronization. |
| `openspec/specs/sdd-lifecycle/spec.md` | Receive the corrected lifecycle contract through the existing OpenSpec synchronization path. |
| `tests/sdd-close.test.ts` | Cover every force blocker, the exact eligible escape, result compatibility, and unchanged movement behavior. |
| `tests/sdd-router.test.ts` | Cover structured blocker classification and declarationless eligibility versus pending/malformed/stale/conflict states. |
| `tests/sdd-flow-contract.test.ts` | Assert the close tool/help no longer advertises force as a general readiness bypass and requires an audit reason for legacy escape. |

### Risks

- A declarationless modern omission can resemble an old record. Eligibility is therefore limited to an exact artifact shape with no spec delta or sync evidence; malformed declaration tokens are not eligible.
- Existing callers may assume `force: true` bypasses all readiness checks. They will now receive an ordinary blocked result until lifecycle evidence is fixed.
- Existing tests deliberately use force with incomplete fixtures. Those fixtures must become genuinely ready; preserving them would preserve the defect.
- String-prefix blocker matching is fragile. Close must consume router-owned categories rather than infer eligibility from localized reason text.
- Legacy audit evidence is returned and surfaced, not stored as a new archive file. This preserves archive integrity but means consumers that need durable external audit must retain the tool/result transcript.

### Rollback

Revert the router classification, close decision, result/help additions, focused tests, and lifecycle spec update together. The archive movement implementation and layout remain unchanged, so no archive migration or data rollback is required.

### Success criteria

A close succeeds normally only when all gates pass. Force changes that outcome only for the exact declarationless legacy `unresolved` shape, with a valid reason, and returns visible legacy-escape evidence; every other blocker leaves the live directory untouched and reports all applicable blockers.

## B. Spec

### Requirement 1: completion and freshness gates are absolute

The system **MUST** require valid task evidence with no pending tasks, `apply-progress.md` with `status: complete`, a present passing and fresh `verify-report.md`, and a present fresh `summary.md` for every close. Force **MUST NOT** bypass any of these gates, and the rejection **MUST** report every applicable close-readiness blocker.

**Scenario — force cannot close unfinished or untested work**

- **Given** a change has one or more missing, malformed, incomplete, failing, stale, or pending task/apply/verify/summary conditions
- **When** close is requested with force
- **Then** the change remains active and every applicable close-readiness blocker is reported

### Requirement 2: canonical spec states fail closed

The system **MUST** block normal and forced close for `pending` and `conflict` spec states and for `unresolved` states caused by malformed declarations, malformed deltas, read failures, or any shape other than the eligible declarationless legacy shape. Close **MUST NOT** create or modify canonical specs, declarations, or `sync-report.md`.

**Scenario — pending evidence must be synchronized explicitly**

- **Given** a change has a valid delta but its report is absent, malformed, stale, borrowed, or does not match current canonical bytes
- **When** close is requested normally or with force and any reason
- **Then** close reports the pending spec blocker, performs no synchronization, and leaves the change active

### Requirement 3: one unresolved legacy shape is eligible

The system **MAY** admit a legacy escape only when all of the following are true:

1. The change resolves under canonical `openspec/changes/` and its computed spec state is `unresolved`.
2. `scope.md` is readable but contains no `## Spec delta declaration`, `spec_delta:`, or `spec_delta_reason:` token.
3. The change contains no `specs/<domain>/spec.md` delta and no `sync-report.md`.
4. Every task, apply, verify, summary, naming, source, and archive-destination precondition passes.

A `pending` state is never eligible. A `.sdd/changes/` record remains spec-exempt through normal legacy fallback and does not use this escape.

**Scenario — declarationless old record is recognizable but not silently repaired**

- **Given** an otherwise close-ready canonical change matches the exact declarationless legacy shape
- **When** readiness is assessed
- **Then** normal readiness remains blocked by `unresolved`, legacy-escape eligibility is exposed separately, and no spec artifact is written or reclassified as synchronized

### Requirement 4: legacy use is explicit and reason-bearing

The system **MUST** require both force and a caller-supplied audit reason for the eligible legacy escape. The reason **MUST** be trimmed, non-empty, at most 200 characters, and not one of `none`, `n/a`, `na`, `tbd`, `unknown`, or `-`. A missing or invalid reason **MUST** block the escape at the deterministic `closeChange` boundary, not only in UI parsing.

**Scenario — reason is enforced at the close boundary**

- **Given** an otherwise eligible declarationless legacy record
- **When** a caller requests force without a valid audit reason
- **Then** close rejects the request, reports the reason requirement, and leaves the record active

### Requirement 5: normal and escape results are distinguishable

The system **MUST** preserve the existing normal success fields and **MUST** add legacy evidence only when the escape was actually used. That evidence **MUST** include `used: true`, the prior `unresolved` state, the `declarationless-record` eligibility classification, and the normalized reason. Command and tool output **MUST** identify a legacy escape and show its reason; it **MUST NOT** describe that result as ordinary synchronized completion.

**Scenario — successful escape has truthful evidence**

- **Given** an eligible declarationless record, force, and a valid audit reason
- **When** close succeeds
- **Then** the result and user-visible output identify `legacy escape`, retain the reason and prior unresolved state, and differ from a normal close result

### Requirement 6: movement remains deterministic

The system **MUST** assess readiness before creating or moving archive content and **MUST** retain the existing destination collision check, rename-first movement, and cross-device copy/remove fallback. A rejected close **MUST NOT** move the live change or mutate spec evidence.

**Scenario — a blocked force request has no movement side effect**

- **Given** a change has an absolute blocker and no existing archive destination
- **When** forced close is attempted
- **Then** no archive entry is created, the source remains in place, and the blocker result is deterministic

## C. Decisions

### Decision table

“All other gates pass” is required for every success row.

| Readiness fact | Normal close | Force close |
| --- | --- | --- |
| Fully ready; spec is `synchronized` or valid `spec_delta: none` | Archive as normal close | Archive as normal close; force is unused and no legacy marker is emitted |
| Valid `.sdd/changes/` fallback record, all non-spec gates pass | Archive as normal legacy-compatible close | Same result; this is not the declarationless escape |
| `tasks.md` absent, unreadable, malformed, blocked, or has pending checkboxes | Block and report task blocker(s) | Absolute block; report the same blocker(s) |
| Apply absent, `partial`, `blocked`, `unknown`, or otherwise not exactly `complete` | Block | Absolute block |
| Verify absent | Block | Absolute block |
| Verify `fail` | Block | Absolute block |
| Verify unknown or without clear `status: pass` | Block | Absolute block |
| Verify pass but stale relative to apply | Block | Absolute block |
| Summary absent | Block | Absolute block |
| Summary stale relative to apply or verify | Block | Absolute block |
| Spec `conflict` | Block | Absolute block |
| Spec `pending`, including absent/malformed/stale/mismatched sync report or mismatched canonical bytes | Block; direct caller to explicit sync/remediation | Absolute block; reason does not change outcome |
| Spec `unresolved` from malformed declaration tokens, malformed delta, read failure, or mixed spec artifacts | Block | Absolute block |
| Exact declarationless legacy `unresolved` shape | Block and explain the narrow escape | Archive only with valid audit reason; return legacy marker |
| Exact declarationless shape plus any task/apply/verify/summary blocker | Block and report all blockers | Absolute block and report all blockers; legacy eligibility cannot erase them |
| Invalid change name, missing source, or occupied archive destination | Block before readiness/movement | Absolute block; force does not alter movement preconditions |

### Readiness ownership

- `sdd-router.ts` owns filesystem-derived facts, blocker codes/messages, and the exact legacy eligibility classification.
- `sdd-close.ts` owns policy: all blockers are absolute except one eligible spec blocker when force plus valid reason are present. It also owns result truthfulness and movement.
- `ein-ai.ts` owns argument/tool wiring and wording only; it must not independently decide eligibility.
- OpenSpec owns the observable lifecycle contract. Tests own regression evidence.

This avoids duplicating apply/verify freshness logic or matching localized strings in close.

### Compatibility and result shape

The public option remains backward compatible and gains one optional field:

```ts
type CloseOptions = {
  force?: boolean;
  legacyReason?: string;
};
```

Existing result keys remain valid. Only a successful escape adds evidence:

```ts
type CloseResult = {
  ok: boolean;
  from: string;
  to: string;
  reason?: string;
  blockers?: Array<{ code: string; message: string }>;
  legacyEscape?: {
    used: true;
    priorSpecState: "unresolved";
    eligibility: "declarationless-record";
    reason: string;
  };
};
```

Normal success remains `{ ok: true, from, to }` with no `legacyEscape`. A ready change passed with `force: true` still returns normal success because no escape was used. Failures retain the human-readable `reason`; an additive `blockers` collection permits complete deterministic reporting without requiring consumers to parse prose.

The slash command accepts:

```text
/ein:sdd-close <change> --force --reason "<audit reason>"
```

The tool accepts additive `force: boolean` and `reason: string` parameters and passes `reason` to `legacyReason`. The deterministic library validates it again.

### Required help wording

Command/tool help must communicate this meaning, without “bypass readiness guard” language:

> `--force` is only for an otherwise complete, freshly verified declarationless legacy record and requires `--reason "<audit reason>"`. It never bypasses tasks, apply, verify, summary, pending spec synchronization, or conflicts, and close never synchronizes specs.

A legacy success message must say:

> `Closed through legacy escape (spec state remained unresolved): <reason>`

A normal success must continue to say that the verified change was closed without mentioning an escape.

### Exact correction required in the current delta

The existing delta conflicts with the chosen design in two exact ways:

1. `forced-close-explicit-legacy-escape` currently admits `pending or unresolved`; `pending` must be removed. Eligibility must be the declarationless `unresolved` shape defined above.
2. Canonical `canonical-close-readiness` says “only synchronized evidence permits close” including force. Adding a contradictory scenario is insufficient; the delta must explicitly modify that canonical scenario.

Before synchronization, the delta must contain a `MODIFIED` `canonical-close-readiness` scenario whose requirement states:

> The system MUST block close when canonical spec evidence is unresolved, pending, malformed, stale, or conflicted, except that force MAY admit only an unresolved declarationless legacy record after all non-spec close gates pass and a valid audit reason is supplied; assessment and close MUST NOT synchronize or rewrite specs.

Its Given/When/Then must state that ordinary close still requires synchronized evidence, pending/conflict/malformed/stale evidence always blocks, and the exact declarationless unresolved exception returns legacy evidence without reclassification. The added legacy scenario must replace “recoverable legacy pending or unresolved spec state” with “unresolved spec state caused solely by the declarationless legacy record shape,” and its Given clause must include the absence of delta and sync artifacts. No delta file is edited in this design phase.

### Alternatives rejected

- **Keep general force with a denylist:** rejected because every newly added readiness reason would become bypassable by default.
- **Allow pending with a reason:** rejected because pending represents unapplied or unproven canonical delta synchronization, not an old declaration-format defect.
- **Allow every unresolved state:** rejected because unresolved also covers malformed declarations, invalid deltas, and read failures.
- **Infer legacy in `sdd-close.ts` from reason strings:** rejected as localized, brittle, and duplicative.
- **Write a new archive audit file:** rejected for this slice because the result/tool transcript can carry explicit evidence without changing archive contents or integrity semantics.
- **Synchronize during close:** rejected because close must remain a deterministic move boundary and synchronization already has an explicit tool.

## D. Success Criteria

### Observable acceptance checks

- Force leaves the source active and creates no archive destination for each task, apply, verify, summary, pending-spec, unresolved-ineligible, conflict, name, source, and destination blocker.
- A request with multiple blockers returns all applicable blocker codes/messages rather than only the conflict or first failure.
- Exact declarationless `unresolved` eligibility is true only with readable declarationless scope, no delta documents, no sync report, and every non-spec gate passing.
- Pending is never eligible, including missing, malformed, borrowed, stale, or canonical-byte-mismatched sync evidence.
- Eligible legacy close fails without force, fails without a valid reason, and succeeds only with both.
- Legacy success contains the normalized reason and legacy marker; normal success keeps the prior minimal shape and has no marker.
- Force on an already ready synchronized change is reported as normal close, not as an escape.
- `.sdd/changes/` fallback still closes normally only when its non-spec gates pass; force cannot rescue an incomplete fallback record.
- Neither readiness assessment nor close changes canonical specs, deltas, declarations, or `sync-report.md`.
- Existing rename-first, collision refusal, and copy/remove fallback behavior remains unchanged.
- Command/tool help contains the required narrow wording and no longer describes force as bypassing readiness.
- The lifecycle delta is corrected before synchronization, and the resulting canonical scenarios agree with runtime behavior.

### Focused verification commands

```bash
bun test tests/sdd-close.test.ts tests/sdd-router.test.ts tests/sdd-flow-contract.test.ts
```

Focused tests must include table-driven cases for every row above, including multiple simultaneous blockers, invalid reasons, normal-result compatibility, declarationless eligibility negatives, unchanged source on rejection, and differentiated command/tool wording. No test or build is run during this design phase.
