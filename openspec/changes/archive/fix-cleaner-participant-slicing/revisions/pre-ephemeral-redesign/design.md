# Design: fix-cleaner-participant-slicing

## A. Proposal

### Intent

Remove the dogfooding dead-end between Pi `subagent` completion and the durable SDD participant checkpoint. Pi terminal variants will be normalized once at the adapter edge into a canonical Ein participant receipt, while a pure core transition will preserve deterministic Cleaner slicing and safely recover an orphaned admitted attempt without changing apply bytes or planner identity.

### Scope

In scope:

- Preserve the current deterministic, complete, limit-bounded Cleaner slice plan and post-Cleaner Architect binding.
- Add a Pi-edge normalizer for supported single-child terminal forms: inline `finalOutput`, a workflow-wrapped single child, and validated file-only output artifacts.
- Add durable per-unit attempt identity, canonical receipt consumption, and explicit orphan recovery within the same generation.
- Reject malformed, ambiguous, stale, late, duplicate, or provenance-mismatched results without fabricating completion.
- Add bounded runtime capture and focused contract tests for the observed `workflow · step 1/1` path, file-only output, and restart recovery.

Out of scope:

- Inferring terminality from `workflow · step 1/1`, outer display text, or `subagent_wait` without authoritative matching terminal evidence.
- Raising Cleaner limits, filtering changed files, bypassing Cleaner/Architect/verify, or changing Cleaner mutation semantics.
- Installer backup, release, general continuity, or canonical `sdd-lifecycle` behavior.
- A provider abstraction or runtime-specific result shapes in the portable state transition.

### Affected areas

- `ein-pi/agent/extensions/ein-ai.ts`: Pi hook boundary; invoke normalization and perform validated artifact I/O.
- `ein-pi/agent/lib/pi-sdd-participant-receipt.ts` (new): Pi-specific shape extraction, common identity validation, and canonical receipt construction.
- `ein-pi/agent/lib/sdd-participants.ts`: deterministic planning retained; admission gains attempt identity; completion becomes a pure receipt-driven transition; orphan recovery is exposed explicitly.
- `ein-pi/agent/lib/continuity-checkpoint.ts`: bounded durable attempt fields and validation.
- `tests/pi-sdd-participant-receipt.test.ts` (new), `tests/sdd-participants.test.ts`, and directly necessary `tests/continuity-checkpoint.test.ts` coverage.

### Risks

- The installed Pi runtime envelope is not yet known exactly; accepting guessed fields would recreate the same silent dead-end.
- Artifact locators are untrusted input and introduce traversal, symlink, substitution, oversized-output, and identity-confusion risks.
- Recovery can race a late terminal result; without attempt identity, an old result could complete a newer attempt.
- Checkpoint growth or migration mistakes could invalidate existing durable slicing evidence.

### Rollback

Revert the Pi normalizer, receipt-driven transition, and checkpoint attempt schema together. Existing V3 checkpoints must remain readable during rollout; rollback restores the prior fail-closed admitted-without-result behavior and verify remains blocked rather than accepting uncertain evidence. No apply artifact or planner identity is rewritten during rollout or rollback.

### Success criteria

- The real foreground single-child workflow sequence is captured in a bounded, sanitized fixture and accepted by a contract test without using its UI label as evidence.
- Inline, workflow-wrapped, and validated file-only forms produce the same canonical receipt and the same core transition.
- A restart leaves an admitted attempt blocked, then explicit orphan recovery issues a new attempt in the same generation with unchanged apply/planner identities and no checkpoint advancement.
- Late old-attempt, stale, malformed, and duplicate receipts cannot advance or overwrite durable evidence.
- Existing deterministic slicing, per-slice limits, complete-scope coverage, fresh Architect binding, and verify gating remain intact.

### Canonical spec context

`scope.md` selected no canonical spec domains, and `map.md` supplied no explicit additional `openspec/specs/<domain>/spec.md` path. Therefore no canonical spec file was read for this design.

| Path | SHA-256 | UTF-8 bytes |
|---|---|---:|
| None | N/A | 0 |

Selection total: 0 files, 0 bytes.

## B. Spec

### R1. Deterministic Cleaner slicing remains authoritative

The system MUST represent every declared changed file exactly once across canonically ordered Cleaner slices. Every slice MUST independently satisfy the existing Cleaner file-count and source-byte limits; an impossible or invalid file MUST block planning rather than be omitted. Architect and verify MUST remain unavailable until all required slices complete against the current frontier.

**Scenario:** Given a changed-file scope that requires multiple slices, when participants are planned repeatedly with the same apply and source inputs, then the same ordered slice IDs cover the complete scope exactly once, each slice respects existing limits, and Architect is not admitted before the final complete slice.

### R2. Pi terminal forms normalize to one canonical receipt

The Pi adapter MUST normalize each supported authoritative single-child terminal form—inline `finalOutput`, a structurally workflow-wrapped single child, or file-only output—into one `EinParticipantReceiptV1`. The receipt MUST contain the durable attempt ID, generation/passage ID, participant unit and slice identity, exact admitted-task digest, expected state reference, bounded terminal output, transport error state, and provenance containing adapter/invocation identity, source kind, byte count, and SHA-256 source digest. The adapter MUST return no receipt for launch handles, ambiguous/multi-child forms, unsupported shapes, or display-only text.

**Scenario:** Given equivalent terminal output delivered by direct inline, one-child workflow, and file-only forms for the same admitted attempt, when the Pi edge normalizes each captured form, then all three receipts carry the same participant semantics and identity while provenance distinguishes their source kind.

### R3. Artifact-backed output is validated before read

Before reading artifact-backed output, the Pi adapter MUST verify that the tool call maps to the currently admitted durable attempt; the child agent and exact task digest match that attempt; the locator equals the adapter-preallocated attempt-owned output path under an approved Ein runtime root; every path component is non-symlink and canonical; and the target is a bounded regular file. The adapter MUST read through a no-follow, identity-checked handle, MUST reject substitution during read, oversized or non-UTF-8 bytes, and MUST hash the accepted bytes. A failed check MUST perform no artifact content read, emit no receipt, and leave participant completion blocked.

**Scenario:** Given a file-only terminal event with a mismatched attempt, task, path, symlink, or oversized target, when normalization is attempted, then the content reader is not invoked, no receipt is emitted, and the admitted attempt remains incomplete.

### R4. Core transition consumes only canonical evidence

The participant state transition MUST be a pure function of the existing validated checkpoint state, current bounded scope seal, and `EinParticipantReceiptV1`. It MUST NOT inspect Pi event envelopes, UI labels, outer tool text, session maps, paths, or files. It MUST accept exactly one `status: complete` or `status: blocked` claim from the receipt output; errors, missing/ambiguous status, identity mismatch, or stale state MUST remain fail-closed.

**Scenario:** Given a valid checkpoint and two raw Pi envelopes that normalize to the same canonical receipt, when the core transition receives that receipt, then it produces the same deterministic checkpoint decision without access to either envelope or the filesystem.

### R5. Attempts are durable and orphan recovery does not alter planning identity

Each planned participant unit MUST have a deterministic next attempt ID derived from generation ID, unit/slice identity, expected state reference, and a durable attempt ordinal. Admission MUST persist that attempt ID and exact task digest before launch. Attempt identity and ordinal MUST NOT contribute to apply ID, planner ID, slice ID, or generation ID.

An admitted attempt with no result after session restart MUST remain blocked by default. The system MUST offer an explicit orphan-recovery transition only when the caller supplies the exact active attempt ID, the durable unit still has no result, the bounded source frontier is unchanged, and the Pi edge has no live tracked invocation for that attempt. Recovery MUST mark the old attempt abandoned, increment the durable ordinal, and return the unit to pending without marking it complete or changing apply/planner/generation identity. Terminal blocked, failed, or stale results are not orphans and MUST retain the existing identity-change recovery rule.

**Scenario:** Given an admitted Cleaner attempt whose session ended before terminal evidence, when a new session explicitly recovers that exact orphan and replans, then verify remains blocked, a different attempt ID is issued for the same slice, and apply ID, planner ID, slice ID, generation ID, and apply artifact bytes are unchanged.

### R6. Late, stale, and duplicate results are fail-closed

A receipt MUST advance only the currently active attempt for the current generation, expected unit/slice, exact task digest, expected frontier, and next admissible sequence position. A receipt for an abandoned or superseded attempt MUST be rejected as late. A repeated byte-identical receipt for an already accepted attempt MUST be an idempotent no-op; a conflicting duplicate MUST be rejected and preserve the first durable result. A current-attempt receipt observed against a changed scope seal MUST record or return a stale outcome without advancing the frontier. Unknown, future, out-of-order, or malformed receipts MUST NOT mutate checkpoint evidence.

**Scenario:** Given attempt A is abandoned after restart and attempt B is admitted for the same slice, when A arrives late, B arrives twice, and the second B receipt conflicts, then A changes nothing, the first valid B result is retained once, and the duplicate/conflict cannot overwrite it.

### R7. Runtime uncertainty is captured, not guessed

Acceptance MUST include a bounded sanitized capture of the installed Pi foreground single-child sequence, covering `tool_call` input and `tool_result` structure and identifying whether terminal bytes are inline, wrapped, or artifact-only. The capture MUST exclude transcripts, secrets, and unrelated content, and MUST become a contract fixture. Until a captured form passes identity and provenance validation, it MUST remain unsupported and fail closed. `subagent_wait` MUST remain non-authoritative unless a future separately designed contract supplies matching durable attempt, child, task, and terminal evidence.

**Scenario:** Given dogfooding renders `workflow · step 1/1` but the underlying envelope is uncertain, when the bounded capture is made, then support is decided from the captured structural evidence and contract test—not from the label—and an unrecognized variant emits no receipt or completion.

## C. Decisions

### 1. Normalize at the Pi edge; remove envelope parsing from core

`ein-ai.ts` passes raw Pi events to the Pi-specific normalizer. Variant extractors may locate a direct child, a single workflow child, or an artifact locator, but all candidates then pass one shared identity/provenance validator and produce the same receipt. `sdd-participants.ts` receives only that receipt. This fixes the boundary instead of adding another envelope-shaped conditional to the state machine.

Trade-off: one small adapter module is added, but runtime drift becomes isolated and contract-testable. Nuxt UI, VueUse, and Nuxt Modules guidance does not apply because this change has no Vue/Nuxt surface.

### 2. Preallocate artifact authority per attempt

The adapter, not the child envelope, owns the approved artifact root and expected attempt path. The envelope may point to that exact path but cannot choose arbitrary filesystem authority. Identity and path validation precede opening; bounded read, UTF-8 decoding, and digesting follow. The core sees bytes and provenance, never a path.

Trade-off: file-only support requires an attempt-specific output contract, but it avoids trusting child-controlled paths or installer backup machinery.

### 3. Separate generation identity from retry identity

Slices and generations continue to identify audited apply/source planning. Attempts identify executions of one already-planned unit. Explicit abandonment changes only attempt ordinal/state, so recovery does not require fake edits to `apply-progress.md` or source bytes. Actual terminal blocked/failed/stale evidence still needs changed apply or planner identity to create a fresh generation.

Trade-off: checkpoint validation gains bounded attempt fields, but recovery semantics become honest and late results become unambiguous.

### 4. Recovery never synthesizes success

Recovery is an explicit compare-and-swap transition on the exact active attempt. It only abandons an orphan and reopens admission; it does not infer failure, completion, or source freshness. The Pi edge must have no live tracked invocation, and the current bounded seal must still match. A late abandoned result is harmless because its attempt ID no longer matches.

Trade-off: an operator or orchestrator must explicitly request recovery after restart, preserving fail-closed behavior over automatic timeout heuristics.

### 5. Keep deterministic slicing and fresh Architect binding unchanged

The existing canonical path ordering, file/source-byte limits, planning blockers, slice frontier chaining, and post-final-slice Architect binding remain the authoritative behavior. Receipt acceptance supplies terminal evidence to that state machine; it does not redesign Cleaner planning.

### Boundaries

- Pi event shape discovery and artifact I/O: `pi-sdd-participant-receipt.ts`, called by `ein-ai.ts`.
- Portable receipt semantics, attempt state, ordered slice transition, and verify gate: `sdd-participants.ts` plus checkpoint contracts.
- Durable schema validation and bounded serialization: `continuity-checkpoint.ts`.
- Runtime fixture capture: test support only; no transcript becomes durable state.
- Installer backup/release logic: untouched.

### Alternatives rejected

- **Add one more `details.*` branch inside `completeSddParticipantCall`:** rejected because it repeats the failed coupling and leaks Pi shapes into core.
- **Treat `workflow · step 1/1`, outer `content`, or `subagent_wait` text as terminal:** rejected because presentation text lacks durable child/task/attempt provenance.
- **Read any artifact path reported by the runtime:** rejected because identity and path authority would be attacker-controlled.
- **Recover by editing apply bytes, source bytes, or planner inputs:** rejected because it falsifies change identity and obscures an execution-transport failure.
- **Automatically retry admitted attempts after a timeout:** rejected because elapsed time cannot prove the prior attempt is dead and can create concurrent mutation.
- **Broaden into installer backup or a generic provider layer:** rejected as unrelated and contrary to the smallest portable seam.

## D. Success Criteria

Acceptance requires all of the following observable checks:

- Existing deterministic slicing tests still prove complete exact-once coverage, canonical ordering/IDs, unchanged limits, impossible-file blockers, frontier chaining, final Architect binding, and verify gating.
- Pi adapter contract tests cover direct inline output, one-child workflow output, launch-handle-then-terminal delivery, file-only output, unsupported/multi-child forms, and no reliance on `workflow · step 1/1` text.
- Artifact tests prove identity/path/symlink/size/UTF-8/substitution failures occur before content acceptance; a reader spy proves no content read on pre-read validation failure.
- Core tests use only canonical receipts and cover complete, blocked, failed/ambiguous, stale, late abandoned attempt, out-of-order, byte-identical duplicate, and conflicting duplicate behavior.
- A restart test persists an admitted attempt, clears session memory, confirms default blocking, explicitly abandons the exact orphan, and admits a new attempt while asserting unchanged apply ID, planner ID, slice ID, generation ID, source/apply bytes, and verify blocking.
- A bounded sanitized fixture from the installed Pi runtime reproduces the real foreground `workflow · step 1/1` sequence plus file-only terminal delivery; its structural contract test passes. If capture reveals a different shape, that shape remains unsupported until the adapter contract is updated explicitly.

Known verification commands for apply/verify:

```sh
bun test tests/pi-sdd-participant-receipt.test.ts tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts
bun test
bun run typecheck
cd installer && bun run typecheck
```

A manual dogfooding check must run one multi-slice Cleaner passage through the captured Pi foreground workflow, restart after one admitted file-only attempt before registration, use explicit orphan recovery, complete the replacement attempt, and confirm Architect then verify remain correctly gated. No tests, build, typecheck, or runtime capture were executed during this design phase.
