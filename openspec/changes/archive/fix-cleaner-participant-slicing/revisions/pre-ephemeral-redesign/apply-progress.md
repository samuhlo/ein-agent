status: complete

## Completed
Group `// 001. Canonical participant receipt contract` is complete: the RED fixtures cover attempt, generation/passage, unit/slice, task digest, expected state, bounded output, transport error, and provenance; GREEN exports the portable receipt type only. Slicing and completion behavior were not changed.

## Files changed
`ein-pi/agent/lib/sdd-participants.ts`
`tests/sdd-participants.test.ts`
`ein-pi/agent/lib/pi-sdd-participant-receipt.ts`
`tests/pi-sdd-participant-receipt.test.ts`
`tests/fixtures/pi-sdd-participant-foreground.json`
`ein-pi/agent/extensions/ein-ai.ts`
`ein-pi/agent/lib/sdd-router.ts`
`ein-pi/agent/assets/orchestrator.md`
`tests/sdd-next-dispatcher.test.ts`
`ein-pi/agent/lib/continuity-checkpoint.ts`
`tests/continuity-checkpoint.test.ts`
`openspec/changes/fix-cleaner-participant-slicing/tasks.md`
`openspec/changes/fix-cleaner-participant-slicing/apply-progress.md`

## TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- |
| Canonical receipt fixtures compile as portable evidence without Pi envelopes | `bun run typecheck` failed with missing `EinParticipantReceiptV1` export | Added the type; focused test passed (57), typecheck passed | Complete and transport-error fixtures cover bounded output, provenance source kinds, and absence of `details`; focused test passed (57) | Kept one exported readonly contract at the deterministic boundary; no parser or transition changes |

## Verification
- `bun test tests/sdd-participants.test.ts` — 57 passed.
- `bun run typecheck` — passed.

## Deviations and residual risks
- No design deviations.
- Later normalization, artifact I/O, checkpoint attempts, and receipt-driven transitions remain untouched for later groups.

## Group // 002. RED/GREEN inline and workflow normalization

Status: complete for this group; later groups remain pending.

Completed tasks:
- 2.1 RED: captured the installed foreground workflow shape in a bounded sanitized fixture and added fail-closed contract tests.
- 2.2 GREEN: added the Pi-edge normalizer for direct inline and one-child workflow terminals with shared admitted identity validation and canonical provenance.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- |
| Authoritative single-child terminal output normalizes to canonical receipt | `bun test tests/pi-sdd-participant-receipt.test.ts` failed because the normalizer module was absent | Added direct/workflow extraction; focused test passed (9) | Captured fixture, equivalent inline/workflow semantics, launch/multi-child/display-only rejection; focused test passed (11) | Shared provenance construction keeps source-specific extraction on one receipt path; focused test passed (11) |
| Admitted attempt/child/task/state identity is required | RED covered the missing normalizer seam | Context and child identity checks return no receipt on mismatch or missing bounded identity | Focused identity rejection cases passed (34 assertions) | Kept validation at the Pi adapter boundary; `bun run typecheck` passed |

Verification:
- `bun test tests/pi-sdd-participant-receipt.test.ts` — 11 passed.
- `bun run typecheck` — passed.

Deviations and residual risks:
- No design deviations.
- Artifact-backed output remains unsupported and is reserved for group 003.
- Portable checkpoint transitions and Pi hook wiring remain untouched for groups 004-006.

Remaining tasks:
- Groups 003-006 remain pending.

## Group // 003. RED/GREEN artifact-backed normalization at the Pi edge

Status: partial for the change; group 003 is complete and groups 004-006 remain untouched.

Completed tasks:
- 3.1 RED: added temporary filesystem fixtures for valid artifact provenance, identity/path/locator rejection, out-of-root and symlink rejection, size/UTF-8 failures, substitution, and pre-read reader-spy behavior.
- 3.2 GREEN: added the Pi-edge bounded no-follow artifact reader and artifact normalization seam with exact authority, handle identity, UTF-8, byte-count, and SHA-256 checks.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| File-only artifact becomes canonical receipt with provenance | Focused test failed: missing artifact reader export | Reader plus normalizer passed (15) and typecheck passed | Equivalent receipt semantics plus forged provenance rejection passed (16) | Centralized artifact provenance construction; focused suite stayed green | `bun test tests/pi-sdd-participant-receipt.test.ts` |
| Untrusted artifact authority fails closed before bytes are read | RED fixtures failed before seam existed | Exact path, root, component, handle, size, and decoding guards passed (15) | Symlink target/component, out-of-root, non-UTF-8, and substitution cases passed (16) | Kept filesystem authority in `ein-ai.ts`; Pi shape checks remain in the Pi normalizer | `bun test tests/pi-sdd-participant-receipt.test.ts` |

Verification:
- `bun test tests/pi-sdd-participant-receipt.test.ts` — 16 passed.
- `bun run typecheck` — passed.
- `git diff --check` — passed.

Deviations and residual risks:
- No design deviation; the adapter requires canonical absolute preallocated roots/paths, matching the fail-closed authority contract.
- Hook integration, durable attempts, core receipt transitions, and groups 004-006 remain for later groups.

## Group // 004. Durable attempt checkpoint schema

Status: complete for this group; the change remains partial. Groups 005-006 are untouched.

Completed tasks:
- 4.1 RED: added bounded attempt ordinal, active attempt ID, exact task digest, abandonment history, legacy V3 readability, and malformed/unbounded fixtures.
- 4.2 GREEN: added optional backward-compatible attempt metadata to slice and Architect units, strict canonical serialization, and bounded validation without changing planning identities or existing result evidence.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Durable attempt metadata round-trips while existing V3 complete evidence remains readable | Focused test rejected the new attempt-bearing V3 fixture before schema support | Added canonical attempt fields and abandoned evidence; focused suite passed (24) | Covered active retry identity, retained complete result, legacy V3, and Architect metadata | Shared canonical/validation helpers preserve old shapes without a migration that fabricates attempts | `bun test tests/continuity-checkpoint.test.ts` |
| Malformed and unbounded attempt state fails closed | Focused fixtures rejected through the pre-schema validator | Bounded ordinal, digest/ID shape, ordering, uniqueness, and history limits validated | Covered invalid ordinals, digest/identity values, abandoned ordering/duplicates, and over-limit history | Admission/result consistency checks keep admitted attempts authoritative and pending state empty | `bun test tests/continuity-checkpoint.test.ts` |

Verification:
- `bun test tests/continuity-checkpoint.test.ts` — 24 passed.
- `bun run typecheck` — passed.
- `git diff --check -- ein-pi/agent/lib/continuity-checkpoint.ts tests/continuity-checkpoint.test.ts` — passed.

Deviations and residual risks:
- No design deviation; legacy V3 objects omit attempt fields and remain readable, while new attempt-bearing objects require all bounded fields.
- Participant admission, receipt transitions, orphan recovery, Pi hooks, and groups 005-006 remain intentionally untouched.

## Group // 005. Pure admission, receipt completion, and orphan recovery

Status: complete for this group; the change remains partial and group 006 is untouched.

Completed tasks:
- 5.1 RED: added focused canonical-receipt and durable-attempt tests covering deterministic admission/task digest, restart blocking, exact-ID recovery, live-invocation/source-frontier refusal, identity/source-byte preservation, replacement attempts, stale/late/ambiguous/out-of-order, blocked/failed, and duplicate behavior.
- 5.2 GREEN: admission now persists ordinal, deterministic attempt ID, and exact task digest; pure receipt transition accepts only current canonical evidence; explicit CAS orphan recovery abandons the exact active attempt and reopens pending without changing planning identity/frontier.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Durable attempt admission and replacement recovery | Focused suite failed because the new recovery/transition exports were absent | Admission and explicit no-live/source-unchanged recovery passed with ordinal 0→1 and stable apply/planner/slice/generation IDs | Wrong attempt, live invocation, source drift, restart blocking, and unchanged apply/source bytes passed | Centralized task/attempt digests and retained checkpoint CAS publication; focused suite stayed green | `bun test tests/sdd-participants.test.ts` |
| Pure canonical receipt transition | RED failed before the transition export existed | Complete/blocked receipts advance or block; failed/ambiguous and stale evidence never advance frontier | Late abandoned, out-of-order, stale-seal, duplicate, and conflicting duplicate fixtures passed | Shared canonical validation/status handling feeds the existing persistence bridge without changing slice limits | `bun test tests/sdd-participants.test.ts` |

Verification:
- `bun test tests/sdd-participants.test.ts` — 61 passed.
- `bun run typecheck` — passed.
- `git diff --check` — passed.

Deviations and residual risks:
- No design deviation; legacy raw completion remains as a temporary bridge for group 006 hook integration, while canonical transition and recovery are available now.
- Receipt fingerprint bytes are not added to the bounded checkpoint schema; duplicate handling preserves the first durable result, with exact conflict classification based on durable terminal status.

Remaining tasks:
- None; all task checkboxes are complete.

## Group // 006. Pi hook integration, triangulation, and repository verification

Status: complete for this change.

Completed tasks:
- 6.1 RED: added actual `ein-ai.ts` hook fixtures for inline, workflow terminal, launch-handle retention, file-only artifact delivery, unsupported output, and live-attempt recovery refusal.
- 6.2 GREEN: Pi admission now preallocates attempt-owned artifact authority; terminal events normalize through `pi-sdd-participant-receipt.ts`; only canonical receipts reach durable transitions; failed calls are consumed without advancement.
- 6.3 TRIANGULATE/REFACTOR: equivalent inline/workflow/artifact deliveries complete identically; launch tracking and Cleaner/Architect ordering remain intact; obsolete sliced raw-envelope completion was removed while legacy V2 completion remains receipt-driven.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Pi terminal delivery transfers authoritative evidence to durable completion | Hook tests failed before Pi normalization/wiring and artifact path preallocation | Hook fixtures passed for inline, workflow, launch-then-terminal, file-only, and failed-call delivery | Unsupported/display-only output stayed blocked; live exact-attempt recovery stayed refused; the three transports reached the same completion gate | Hook owns tracking/I/O; normalizer owns Pi shapes; core receives receipts only | `bun test tests/sdd-participants.test.ts` |
| Existing deterministic ordering and fail-closed behavior survive the seam replacement | Replacement tests initially exposed multiline task identity and artifact identity gaps | Fixed bounded multiline task validation and canonical hook receipt handoff | Full focused trio covered slicing, Architect binding, checkpoint schema, stale/duplicate/failed evidence | Removed `completeSddParticipantCall` sliced raw parsing; retained only receipt-driven legacy V2 compatibility | `bun test tests/pi-sdd-participant-receipt.test.ts tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts` |

Verification:
- `bun test tests/pi-sdd-participant-receipt.test.ts tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts` — 107 passed.
- `bun run typecheck` — passed.
- `cd installer && bun run typecheck` — passed.
- `git diff --check` — passed.
- Full suite and production build were not run, per explicit task constraint; independent verify remains responsible for broader validation.

Deviations and residual risks:
- No design deviation in the named production modules. Manual restart dogfood and full suite remain verify-owned because the explicit execution request prohibited the full suite/build; no installer files were modified.

## Group // 007. Advisory automatic participation remediation

Status: complete for this remediation; all prior groups and the remediation checklist are complete.

Completed tasks:
- 7.1 RED: added a hook-level apply-complete verify delegation regression and three `/ein:sdd-next` advisory handoff cases (continuity absent, participant pending, audit blocked).
- 7.2 GREEN: removed `guardSddVerify` from verify delegation while retaining the one-apply-complete mechanical route check; removed the command handoff blocker path.
- 7.3 GREEN: removed the hard-gate export and obsolete gate assertions while preserving explicit participant planning, ordering, and fail-closed source freshness behavior.
- 7.4 GREEN: updated the participant tool contract and orchestrator guidance for best-effort advisory audits, honest unavailable/blocked reporting, freshness invalidation, and the measured-defect withdrawal condition.
- 7.5 TRIANGULATE/REFACTOR: removed the unused handoff option, added wording/source regressions, and made no bootstrap, checkpoint, store, or phase changes.

### TDD Cycle Evidence
| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Apply-complete verify delegation ignores pending automatic participation | `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` failed with the participant guard blocker | Removed hook guard; focused participant test passed | Existing explicit order and blocked-result tests remained green | Kept apply-complete cardinality check and sequential admission unchanged | `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` |
| `/ein:sdd-next` never injects an automatic participant blocker | Same focused RED run failed for absent, pending, and blocked blocker injections | Removed guard invocation and handoff option | Three handoff cases plus command-wiring source assertions passed | Handoff now accepts only the deterministic report | `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` |
| Advisory tool/orchestrator contract states honest continuation and withdrawal | Wording regression failed while legacy guidance was restored | Updated tool description and orchestrator prose | Static contract test passed with source-mutation and measured-defect conditions | Kept guidance-only change; no lifecycle mechanism added | `bun test tests/sdd-next-dispatcher.test.ts --test-name-pattern='advisory pass'` |

Verification:
- `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` — 83 passed.
- `bun test tests/sdd-next-dispatcher.test.ts --test-name-pattern='advisory pass'` — 1 passed.
- `bun run typecheck` — passed.
- `cd installer && bun run typecheck` — passed.

Deviations and residual risks:
- No design deviation; automatic audits remain explicit-tool/sequentially safe but are no longer prerequisites for verify.
- Full suite, production build, and manual dogfood were not run per the bounded apply request; independent verify owns broader validation.

## Closed patch correction

Status: complete. The obsolete `sdd-verify` delegation block was removed from `ein-ai.ts`; focused RED regressions now prove multiple apply-complete changes and one-shot apply+verify with enabled participants are admitted without weakening explicit participant safety.

### TDD Cycle Evidence

| Seam | RED | GREEN | TRIANGULATE | REFACTOR | Final focused command |
| --- | --- | --- | --- | --- | --- |
| Verify delegation with multiple apply-complete active changes | Focused participant/dispatcher run failed on the obsolete exactly-one-change blocker | Removed the obsolete delegation block; focused run passed (85) | Existing advisory handoff, participant order, and blocked-result coverage stayed green | No unrelated routing or admission changes; typecheck passed | `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` |
| One-shot apply+verify with automatic participants enabled | Same RED run failed on the obsolete participant-enabled chain blocker | Block removed; focused run passed (85) | Explicit participant admission/order regressions and dispatcher coverage stayed green | Kept participant guards and foreground/artifact safety unchanged; typecheck passed | `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` |

Verification:
- `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` — 85 passed.
- Focused triangulation filter — 16 passed.
- `bun run typecheck` — passed.
- `git diff --check -- ein-pi/agent/extensions/ein-ai.ts tests/sdd-participants.test.ts` — passed.

Deviations and residual risks:
- No design deviation; this closed patch only removes the two obsolete orchestration hard gates and adds their regression coverage.
- Full suite and production build were not run; independent verify remains responsible for broader validation.
