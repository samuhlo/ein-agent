# Design: fix-cleaner-participant-slicing

**Change:** `fix-cleaner-participant-slicing`  
**Lane:** bounded standard SDD  
**TDD:** strict (`preflight.json`)  
**Design input:** `scope.md`, `map.md`, `preflight.json`, and `specs/sdd-participant-routing/spec.md`

## A. Proposal

### Intent

Replace the single Cleaner handoff with a deterministic, durable sequence of bounded Cleaner slices. Architect and verify remain fail-closed until every required slice has a current successful result, and a blocked passage can start a new generation only when its apply or planner identity actually changes.

### Scope

**In scope**

- Partition the complete, validated `apply-progress.md` changed-file scope into stable Cleaner slices using the existing Cleaner limits: 32 files and 128 KiB of UTF-8 source bytes per slice.
- Persist slice identity, admission, terminal result, and state transition so restart or session loss cannot turn missing evidence into pending-good state.
- Persist planning blockers for an individually oversized file or a slice the authoritative Cleaner evidence contract cannot admit.
- Bind Architect once, after the final Cleaner slice, to a newly observed full changed-scope seal.
- Add a versioned participant-checkpoint schema, strict validation, legacy migration, and evidence-preserving blocked-generation reinitialization.
- Keep the current apply-complete requirement, exact-selector task boundary, optimistic checkpoint publication, foreground execution, and `guardSddVerify()` gate.

**Out of scope / non-goals**

- Raising or duplicating Cleaner limits, filtering changed files, weakening Cleaner audit validation, changing Cleaner mutation semantics, or changing canonical `sdd-lifecycle` behavior.
- Parallel Cleaner execution, retrying an unchanged failed/blocked/missing slice, general continuity redesign, lifecycle-router changes, or verify bypasses.
- Broad participant adapter or installer changes. Adapter code changes only if needed to recognize the extended participant marker.

### Affected areas

- `ein-pi/agent/lib/sdd-participants.ts`: scope measurement, deterministic slice planning, passage identity, task/admission/result state machine, Architect binding, and verify gating.
- `ein-pi/agent/lib/continuity-checkpoint.ts`: versioned sliced-participant checkpoint types, validation, revision serialization, legacy compatibility, and bounded prior-generation evidence.
- `ein-pi/agent/lib/cleaner-audit-evidence.ts`: expose one immutable authoritative limits contract for both the existing collector and the participant slicer; collector limits and rejection behavior do not change.
- `ein-pi/agent/lib/sdd-preflight.ts` and `ein-pi/agent/extensions/ein-ai.ts`: only if the slice-qualified marker requires recognition/wiring changes; no participant execution-policy change.
- `tests/sdd-participants.test.ts` and, because the durable schema changes, focused cases in `tests/continuity-checkpoint.test.ts`. Store tests change only if existing revision-conflict coverage does not exercise the new publication path.

### Risks

- A checkpoint with many generations or slices can approach the existing 32 KiB serialization ceiling. The system must reject the new generation rather than evict evidence.
- Persisting admission makes a crash after admission visibly blocked instead of silently retryable. This is deliberate fail-closed behavior, but recovery requires a corrected planner/apply identity.
- A participant-checkpoint schema upgrade is not downgrade-readable by older binaries. Rollback must retain the new reader even if sliced execution is disabled.
- Applying both limits conservatively to every declared changed file may block a scope that the Cleaner collector would partially ignore. This is preferable to silently omitting a declared file.

### Rollback

Disable new sliced passage creation while retaining the new checkpoint parser and evidence renderer. Existing sliced checkpoints must continue to be read and remain gated; downgrading to a binary that cannot parse the new schema is unsafe. No rollback may delete `continuity.json` or its prior-generation evidence. Source behavior can be reverted fully only after active v3 passages finish or are explicitly migrated by a separately reviewed compatibility change.

### Success criteria

- A feasible changed-file scope appears exactly once, in sorted order, across deterministic slices; every slice is at or below both authoritative limits.
- Slice and passage identities are stable across repeated planning and restart for equivalent apply/planner inputs.
- Oversized, rejected, failed, blocked, missing, and stale units cannot produce another Cleaner slice, Architect, or verify admission.
- Architect is emitted only after every required Cleaner slice is complete and is bound to the freshly recomputed final full-scope seal.
- An unchanged blocked generation remains blocked; a changed apply/planner identity creates one fresh generation while preserving the old evidence.

## B. Spec

### Spec context provenance

- Canonical spec references selected by `scope.md`: none (`0` files, `0` UTF-8 bytes). Therefore there are no canonical paths, SHA-256 values, or byte counts to record.
- Behavioral delta read: `openspec/changes/fix-cleaner-participant-slicing/specs/sdd-participant-routing/spec.md`. This change-local delta is not a canonical `openspec/specs/<domain>/spec.md` reference.

### Requirement 1 — Deterministic complete slicing

The system **MUST** validate the complete changed-file scope before slicing, sort paths by one explicit locale-independent lexical order, and greedily form contiguous slices in that order. Adding a file **MUST** close the current slice before either the authoritative file-count or source-byte limit would be exceeded. Every feasible changed file **MUST** occur in exactly one slice, and equivalent apply/planner inputs **MUST** produce the same boundaries, ordinals, and identities.

- **Given** the same changed files are declared in different input orders,
- **When** the Cleaner plan is created twice,
- **Then** both plans contain identical ordered selectors, boundaries, slice IDs, and passage ID, with exact once-only coverage.

### Requirement 2 — One limit authority and impossible-file blocking

The participant slicer **MUST** consume the same exported Cleaner limit values used by `collectCleanerAuditEvidence()` and **MUST NOT** copy, raise, or reinterpret them. Byte accounting **MUST** use raw UTF-8 byte length from the validated file snapshot, not JavaScript character count. A single file over the source-byte limit, a non-UTF-8 file, or a generated slice rejected by the authoritative Cleaner scope contract **MUST** become a durable planning blocker; it **MUST NOT** be dropped or issued as runnable work.

- **Given** one declared file is larger than 128 KiB while the remaining files fit,
- **When** the passage is planned,
- **Then** the blocker identifies the repository-relative file and measured reason, no Cleaner task is admitted, all declared-path coverage remains represented by the plan/blocker evidence, and verify remains blocked.

### Requirement 3 — Durable slice identity and result

Each required Cleaner slice **MUST** have a durable identity derived from the fixed planner identity, ordinal, and exact selector range. The checkpoint **MUST** distinguish pending, admitted-without-result, complete, participant-blocked, failed/ambiguous, and stale outcomes. Only one current pending slice **MAY** be admitted, and only an unambiguous `status: complete` result observed against its expected full-scope state **MUST** advance the frontier.

- **Given** a Cleaner slice was admitted and the process restarts before a recognized terminal result is stored,
- **When** planning resumes,
- **Then** that slice is reported as missing-result/blocked, later slices and Architect are unavailable, and the slice is not silently rerun.

### Requirement 4 — Sequential state binding and stale rejection

Slice zero **MUST** bind to the passage `beforeStateRef`; every later slice **MUST** bind to the preceding completed slice's `afterStateRef`. Admission and completion **MUST** recompute the full changed-scope seal and reject or record stale evidence when it does not equal the expected frontier. A stale task or result **MUST NOT** complete a different slice even if its agent and passage match.

- **Given** slice N is next but a task marker for slice N-1 or an old state is submitted,
- **When** admission or completion is evaluated,
- **Then** the call is rejected as stale, slice N remains incomplete, and neither Architect nor verify becomes available.

### Requirement 5 — Architect after all Cleaner slices

When Cleaner is a durably required participant, the system **MUST NOT** prepare or admit Architect until every planned Cleaner slice is complete and current. After the final slice completes, the planner **MUST** freshly recompute the full changed-scope seal, persist one Architect binding to that seal, and use the binding in Architect task identity, admission, and completion. A later source change **MUST** stale-block Architect.

- **Given** all but the final Cleaner slice are complete,
- **When** the next participant is requested,
- **Then** the final Cleaner slice is returned; only after its successful completion and a fresh final seal is persisted can Architect be returned.

### Requirement 6 — Fail-closed passage recovery

An existing blocked generation **MUST** remain blocked when both `applyId` and the recomputed candidate `plannerId` are unchanged. If either identity changes, the system **MAY** create one deterministic fresh generation through the existing revision-conditional checkpoint write, but it **MUST** preserve the superseded generation's planner blocker, slice admissions/results, Architect binding/result, and identities. Failure to preserve or publish that evidence **MUST** leave the old generation blocked.

- **Given** a passage is blocked by an oversized file or blocked Cleaner result,
- **When** planning is repeated before and after a corrected planner/source snapshot or changed `apply-progress.md` changes the corresponding identity,
- **Then** the unchanged attempt returns the same blocker and passage, while the changed attempt archives the old evidence and creates a fresh gated passage without admitting Architect or verify.

### Requirement 7 — Checkpoint compatibility and bounded migration

The continuity reader **MUST** continue to accept existing v1 checkpoints and legacy v2 single-Cleaner participant checkpoints. New sliced writes **MUST** use a strictly validated new participant-checkpoint version. Legacy evidence **MUST NOT** be treated as completion for multiple new slices; it **MAY** be carried into one slice only when the recomputed new plan has exactly one identical full-scope slice and all old state relationships remain valid. Otherwise it **MUST** be preserved as prior-generation evidence and the new slices remain gated. Serialization/history overflow **MUST** fail closed without eviction.

- **Given** a valid legacy v2 checkpoint contains a blocked single Cleaner result for a scope now split by the corrected planner,
- **When** the new planner first reads it,
- **Then** the legacy evidence is retained in bounded history, a fresh sliced generation is created because the planner contract identity changed, and verify remains blocked until all new slices and any required Architect complete.

### Requirement 8 — Verify and participant controls do not bypass acquired work

`guardSddVerify()` **MUST** continue to derive its decision only from the durable participant plan. Slicing, migration, reinitialization, or a later session-level participant disablement **MUST NOT** convert an already acquired pending/blocked Cleaner slice or Architect into successful evidence. A participant disabled before passage acquisition **MAY** remain absent according to the existing acquisition contract.

- **Given** Cleaner was acquired and at least one slice is incomplete,
- **When** verify is requested or Cleaner is disabled after acquisition,
- **Then** the durable passage remains incomplete/blocked and Architect and verify are not admitted.

## C. Decisions

### 1. Stable contiguous greedy partition

`changedScope()` will return one validated snapshot containing sorted path, byte length, and digest facts as well as `applyId`, `scopeId`, and the full-scope seal. The slicer scans that sorted snapshot once. It closes a non-empty slice before adding the next file would exceed either limit; equality is accepted. If an empty slice cannot accept the next file, planning produces an oversized-single-file blocker instead of a runnable slice.

This is deterministic, linear, easy to test, and preserves review order. Bin-packing/first-fit-decreasing was rejected because it reorders files, is harder to inspect, and provides no required benefit.

### 2. Limits remain owned by Cleaner audit evidence

`cleaner-audit-evidence.ts` will expose an immutable `CLEANER_AUDIT_LIMITS` value and continue using it internally. `sdd-participants.ts` consumes that value. Exact file selectors still pass through the Cleaner audit contract at execution; any unsupported/rejected slice blocks. Duplicating numeric constants or probing by intentionally triggering exceptions was rejected because either can drift from the authority.

### 3. Fixed planner identity, moving execution frontier

`plannerId` hashes a versioned canonical plan: planner-contract version, authoritative limits, sorted path/byte/digest facts, deterministic boundaries, and any planning blocker. It is fixed when the generation is created. `passageId` hashes change, apply identity, scope identity, planner identity, and initial state; participant order remains excluded.

Cleaner mutations advance only the execution frontier (`afterStateRef` chain); they do not repartition an active passage. On restart, slice selector ranges are reconstructed from the unchanged sorted apply scope and durable offsets/counts, avoiding repeated path storage while preserving exact task identity.

### 4. Durable admission is evidence

A slice record stores compact descriptor facts (`sliceId`, ordinal/range, file/source-byte totals), admission state, result status, expected/after state references, and no free-form participant output. Admission is published by compare-and-swap before delegation. A crash therefore leaves an admitted-without-result record that blocks honestly. Failed tools, malformed/multiple terminal statuses, and state mismatches become fail-closed result states rather than being reset to pending.

The in-memory `running` and `callPassages` keys become passage-unit identities, not only agent identities. They remain concurrency aids; the checkpoint is authoritative after restart.

### 5. Slice-qualified task marker

Keep the existing participant marker family but add a required deterministic unit/slice identity. Admission compares passage, unit, agent, exact next task, and expected state. Legacy markers without a unit are rejected as expired and require replanning. The existing foreground guarantee remains in force; adapter changes are unnecessary if its prefix recognition remains valid.

### 6. Architect binding is a separate durable transition

After the last Cleaner result is published, planning reads the current full-scope seal again and conditionally writes an Architect binding. It does not merely reuse a task generated before Cleaner or infer freshness from slice count. Architect is read-only: its completion is accepted only when observed state still equals that binding.

### 7. Versioned schema and evidence-preserving migration

Introduce outer continuity checkpoint v3 for sliced participant state; retain parsers for v1 and v2. The v3 participant payload contains the fixed plan, slice records, Architect binding/result, current generation, and a bounded `priorGenerations` collection. Validation enforces exact keys, canonical order/ranges, unique IDs, contiguous coverage, limit compliance, legal state transitions, Cleaner state chaining, Architect-after-all, and serialized size.

A legacy planner identity is deterministically derived with a legacy contract tag. The new slice-planner contract tag therefore supplies the explicit corrected planner-identity change needed to recover an old blocked passage. Migration publishes v3 by revision CAS, archives old Cleaner/Architect evidence, and starts pending sliced work. A legacy complete result is carried forward only for one identical bounded slice; it is never fanned out over multiple slices. Prior generations are never evicted; reaching the existing list/serialized bound blocks reinitialization.

### 8. Acquired gates are durable

Participant enablement is sampled when a generation is acquired. A later disable can pause issuance but cannot erase acquired slice requirements or evidence. This intentionally tightens the current effective-order behavior where an evidence-less participant can disappear mid-passage; retaining that behavior would directly violate all-slices-before-Architect and no-bypass requirements.

### Boundaries

| Responsibility | Owner |
| --- | --- |
| Cleaner numeric limits and scope rejection | `cleaner-audit-evidence.ts` |
| Changed-scope authority, slicing, unit tasks, state machine, Architect/verify gating | `sdd-participants.ts` |
| Durable schema, migration validation, canonical revision, size bound | `continuity-checkpoint.ts` |
| Atomic revision-conditional persistence | existing `continuity-checkpoint-store.ts` contract |
| Foreground participant execution / tool wiring | existing `sdd-preflight.ts` and `ein-ai.ts` edges |
| TDD execution and evidence | later `sdd-apply`; not this design phase |

### Alternatives rejected

- **Raise limits or filter files:** explicitly violates scope and can produce false completion.
- **One task with internal Cleaner pagination:** pagination would not have durable per-slice admission/results and could still let Architect observe partial work.
- **Replan after each Cleaner mutation:** changes boundaries mid-passage and invalidates completed evidence.
- **Store only an aggregate completed count:** cannot detect stale, reordered, duplicated, or missing slice evidence.
- **Treat crash/ambiguous output as pending:** allows unproven work to rerun or advance after restart.
- **Delete/rewrite a blocked checkpoint:** loses evidence and can bypass verify.
- **Unbounded history:** violates the checkpoint's existing 32 KiB safety contract.
- **New class hierarchy or generic workflow engine:** unnecessary; deterministic functions plus the existing checkpoint CAS are sufficient.

### Skill applicability

- `ein-discipline` and `architecture` apply: the design preserves SDD boundaries, strict TDD, fail-closed evidence, and uses the smallest deterministic modules rather than a new framework.
- `vitest` is skipped because this repository's focused contracts use `bun:test`; its general test-design guidance is reflected only in the matrix below.
- `next-best-practices` and `nuxt-modules` are not applicable because this change has no Next/Nuxt or UI surface.
- `comment-writer` is not applicable because this phase writes a design artifact, not a human collaboration comment.

## D. Success Criteria

### Strict-TDD matrix for apply

| Contract | RED evidence that must fail first | GREEN behavior | Triangulation / regression |
| --- | --- | --- | --- |
| Stable partition and exact coverage | Reordered input, 33 small files, dual-limit crossing, and repeated planning currently yield one whole-scope task | Ordered contiguous slices, each path once, stable IDs | Exact 32-file and exact 128-KiB boundaries stay one slice; multibyte UTF-8 uses bytes, not characters |
| Authoritative limits | A test imports the shared limit contract and proves planner/collector use it | One exported immutable authority, no copied values | Existing Cleaner limit rejection tests remain unchanged |
| Oversized/rejected scope | One file over 128 KiB currently reaches the whole Cleaner handoff | Durable planning blocker, no runnable task | Oversized first/middle/last file and unsupported/non-UTF-8 scope all remain fail-closed without omission |
| Durable slice progression | Restart after slice completion/admission currently has only aggregate Cleaner evidence | Per-slice IDs, admission, result, and state chain survive restart | Failed tool, ambiguous status, blocked status, missing terminal result, duplicate/late result, and CAS conflict never advance |
| Stale task/result | A prior slice task can share passage/agent state with the next slice | Unit-qualified admission and completion reject stale identity/state | No-mutation Cleaner still cannot replay an old slice marker |
| Architect freshness | Architect is currently gated by one Cleaner slot | Architect appears only after every slice and persists a fresh final seal | Mutation in each slice, mutation after final binding, and stale Architect task/result all reject |
| Blocked recovery | Current state mismatch can replace a blocked checkpoint | Same apply/planner identities retain the exact blocker; changed identity archives then reinitializes | Source correction with same byte length changes digest/planner ID; apply-only change changes apply ID; unchanged repeat is idempotent |
| Schema compatibility | Existing parser knows only single Cleaner/Architect evidence | v1/v2 read, strict v3 read/write, legal one-slice carry-forward | Multi-slice legacy complete cannot fan out; old blocked evidence survives; malformed ranges/chains/history and overflow reject |
| Verify/control gates | Effective order can currently remove evidence-less acquired work | Durable required units remain gates | Pre-acquisition disabled participant remains absent; post-acquisition disable, blocked slice, and pending Architect cannot unblock verify |

No existing assertion should be weakened merely to pass the new matrix. RED, GREEN, triangulation, and refactor evidence belongs in `apply-progress.md`, not this artifact.

### Required verification

1. Focused: `bun test tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts` (and `tests/continuity-checkpoint-store.test.ts` only if store behavior is touched).
2. Full gate from repository root: `bun test` / configured `bun run test` equivalent.
3. Root typecheck: `bun run typecheck`.
4. Installer CI typecheck: `cd installer && bun run typecheck`.
5. Manual checkpoint inspection: restart between Cleaner slices, confirm the same passage/slice IDs and retained completed evidence; inspect a legacy blocked migration and confirm old evidence remains while verify is still blocked.
6. Manual stale-call check: retain an old Cleaner and Architect task, advance the passage, and confirm both are rejected.

No tests, build, or typecheck were run in this design phase.
