# Tasks — fix-cleaner-participant-slicing

status: ready
blocked_by: none

## // 001. Canonical participant receipt contract — `ein-pi/agent/lib/sdd-participants.ts`, `tests/sdd-participants.test.ts`

- [x] 1.1 RED — add compile-time contract fixtures in `tests/sdd-participants.test.ts` for `EinParticipantReceiptV1`, including attempt, generation/passage, unit/slice, exact task digest, expected state reference, bounded output, transport error, and provenance fields.
  - skills: `ein-discipline`, `architecture`
  - why: The Pi adapter and deterministic core need one canonical evidence shape before either consumer is changed.
  - learn: A canonical receipt prevents runtime-specific envelopes from leaking into durable state decisions.
  - architecture: Keep this group to the foundational type and its contract fixture; do not add Pi parsing or completion behavior yet.
  - avoid: Making Pi `details`, UI text, paths, or session tracking part of the canonical contract.
  - verify: `bun run typecheck` (expected RED because the canonical receipt export does not exist yet)

- [x] 1.2 GREEN — define and export the minimal bounded `EinParticipantReceiptV1` contract in `ein-pi/agent/lib/sdd-participants.ts` so the fixture typechecks, without changing slicing or completion transitions.
  - skills: `ein-discipline`, `architecture`
  - why: This establishes the dependency that normalization and pure transitions will consume in later groups.
  - learn: Foundational contracts are easier to review when introduced separately from all consumers.
  - architecture: Portable receipt semantics belong at the deterministic participant boundary; Pi transport variants remain outside it.
  - avoid: Adding provider abstractions, retry behavior, filesystem authority, or new generation identity inputs.
  - verify: `bun run typecheck`

## // 002. RED/GREEN inline and workflow normalization — `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`, `tests/pi-sdd-participant-receipt.test.ts`, `tests/fixtures/pi-sdd-participant-foreground.json`

- [x] 2.1 RED — create a bounded sanitized `tests/fixtures/pi-sdd-participant-foreground.json` from the installed foreground sequence and add failing tests in `tests/pi-sdd-participant-receipt.test.ts` for inline terminal `finalOutput`, workflow-wrapped single-child terminal output, launch handles, ambiguous/multi-child forms, and display-only `workflow · step 1/1` text.
  - skills: `ein-discipline`, `architecture`
  - why: The reopened change must support observed structural evidence rather than another guessed Pi envelope.
  - learn: UI labels describe presentation; only captured child/task/terminal structure can authorize durable completion.
  - architecture: The fixture contains only sanitized `tool_call` input and `tool_result` structure; transcripts, secrets, and unrelated output stay out.
  - avoid: Inventing fixture fields, accepting `subagent_wait`, outer content, or the workflow label as terminal evidence.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts` (expected RED before the normalizer exists)

- [x] 2.2 GREEN — implement Pi-specific direct and one-child-workflow extraction plus shared attempt/child/task/state validation in `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`, returning the canonical receipt or no receipt.
  - skills: `ein-discipline`, `architecture`
  - why: Supported inline transports must converge on identical participant semantics while retaining source-specific provenance.
  - learn: Normalize variants once at the adapter seam, then make unsupported shapes fail closed.
  - architecture: This module translates Pi shapes into `EinParticipantReceiptV1`; it does not mutate checkpoints or inspect arbitrary files.
  - avoid: Parsing Pi envelopes in `sdd-participants.ts`, accepting multiple children, or falling back to display text.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts`

## // 003. RED/GREEN artifact-backed normalization at the Pi edge — `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`, `tests/pi-sdd-participant-receipt.test.ts`

- [x] 3.1 RED — add temp-filesystem fixtures in `tests/pi-sdd-participant-receipt.test.ts` for valid file-only output with byte-count/SHA-256 provenance and for mismatched attempt/task/path, invalid locator, out-of-root path, symlink component/target, oversized file, non-UTF-8 bytes, and substitution during read; assert a reader spy is not invoked when pre-read validation fails.
  - skills: `ein-discipline`, `architecture`
  - why: Artifact locators are untrusted and must not become arbitrary read authority or uncertain completion evidence.
  - learn: Validate authority and identity before reading content, then verify the opened object did not change while being read.
  - architecture: Tests exercise an adapter-owned, preallocated attempt path under an approved Ein runtime root; no installer path is involved.
  - avoid: Trusting a child-selected path, following symlinks, reading before identity checks, or touching installer backup files.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts` (expected RED for file-only and rejection fixtures)

- [x] 3.2 GREEN — add the bounded artifact capability at `ein-pi/agent/extensions/ein-ai.ts` and its normalization seam in `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`: exact preallocated path match, canonical non-symlink components, bounded regular-file no-follow open, handle identity checks before/after read, UTF-8 validation, byte count, and SHA-256 provenance.
  - skills: `ein-discipline`, `architecture`
  - why: Valid file-only terminal output must become canonical evidence without weakening filesystem or provenance guarantees.
  - learn: The adapter owns I/O authority; the pure core receives accepted bytes and provenance, never a path.
  - architecture: Keep filesystem effects in `ein-ai.ts`; keep shape/identity normalization in `pi-sdd-participant-receipt.ts` and emit no receipt on any failed check.
  - avoid: Broad filesystem helpers, installer backup/release changes, post-read-only validation, or partial receipts after errors.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts`

## // 004. Durable attempt checkpoint schema — `ein-pi/agent/lib/continuity-checkpoint.ts`, `tests/continuity-checkpoint.test.ts`

- [x] 4.1 RED — add checkpoint fixtures in `tests/continuity-checkpoint.test.ts` for bounded attempt ordinal, active attempt ID, exact admitted-task digest, and abandoned-attempt evidence, including malformed/unbounded rejection and readability of existing V3 checkpoints.
  - skills: `ein-discipline`, `architecture`
  - why: Restart-safe recovery and late-result rejection require attempt identity to survive beyond Pi session memory.
  - learn: Retry identity records execution history without redefining the planned apply or slice.
  - architecture: This group changes only durable schema validation/serialization; it does not admit, recover, or complete participants.
  - avoid: Adding attempts to apply ID, planner ID, slice ID, or generation ID, or invalidating legacy V3 checkpoints.
  - verify: `bun test tests/continuity-checkpoint.test.ts` (expected RED before attempt fields are supported)

- [x] 4.2 GREEN — extend `ein-pi/agent/lib/continuity-checkpoint.ts` with bounded backward-compatible attempt fields and validation sufficient to preserve one active attempt and bounded abandonment evidence.
  - skills: `ein-discipline`, `architecture`
  - why: The later pure transitions need trustworthy durable compare-and-swap inputs after restart.
  - learn: Schema migration should preserve known evidence and reject malformed uncertainty rather than silently upgrading it to success.
  - architecture: Existing deterministic slicing/frontier invariants remain authoritative; attempt metadata is subordinate execution evidence.
  - avoid: General continuity redesign, automatic migration that fabricates an active attempt, or checkpoint growth without bounds.
  - verify: `bun test tests/continuity-checkpoint.test.ts`

## // 005. Pure admission, receipt completion, and orphan recovery — `ein-pi/agent/lib/sdd-participants.ts`, `tests/sdd-participants.test.ts`

- [x] 5.1 RED — add focused tests in `tests/sdd-participants.test.ts` for deterministic attempt admission and task digest, restart with an orphaned admitted attempt, default blocking, exact-ID explicit recovery, unchanged apply/planner/slice/generation identities and apply/source bytes, replacement attempt admission, late abandoned completion, stale completion after seal drift, byte-identical duplicate no-op, conflicting duplicate preservation, and blocked/failed/ambiguous/out-of-order receipts.
  - skills: `ein-discipline`, `architecture`
  - why: These fixtures pin fail-closed behavior before replacing raw-envelope completion with canonical evidence.
  - learn: Recovery reopens execution only; it never synthesizes success or rewrites planning identity.
  - architecture: Tests call pure checkpoint transitions with `EinParticipantReceiptV1` and bounded scope seals only—no Pi envelopes, paths, filesystem, UI text, or session maps.
  - avoid: Timeout retries, fake apply mutations, accepting a late old attempt, or overwriting the first durable result.
  - verify: `bun test tests/sdd-participants.test.ts` (expected RED for attempt/recovery/receipt cases)

- [x] 5.2 GREEN — update `ein-pi/agent/lib/sdd-participants.ts` so admission persists deterministic attempt identity and exact task digest, completion consumes only a canonical receipt, and an explicit compare-and-swap orphan transition abandons the exact active attempt and increments its ordinal without advancing the frontier.
  - skills: `ein-discipline`, `architecture`
  - why: The core must deterministically distinguish current, stale, late, duplicate, and conflicting evidence across restarts.
  - learn: Attempt identity closes the race between orphan recovery and a late terminal event.
  - architecture: Preserve Cleaner slice ordering/limits, frontier chaining, fresh Architect binding, identity-change recovery for terminal blocked/failed/stale results, and verify gating unchanged.
  - avoid: Inspecting Pi event shapes in core, making recovery automatic, or treating orphan abandonment as completion/failure.
  - verify: `bun test tests/sdd-participants.test.ts`

## // 006. Pi hook integration, triangulation, and repository verification — `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/pi-sdd-participant-receipt.ts`, `ein-pi/agent/lib/sdd-participants.ts`, `tests/pi-sdd-participant-receipt.test.ts`, `tests/sdd-participants.test.ts`, `tests/continuity-checkpoint.test.ts`, `tests/fixtures/pi-sdd-participant-foreground.json`

- [x] 6.1 RED — add hook-level fixtures in `tests/sdd-participants.test.ts` for direct inline terminal delivery, workflow-wrapped single-child delivery, launch-handle-then-terminal delivery on the tracked call, file-only delivery, no-receipt unsupported output, and restart recovery refusal while the exact attempt still has a live tracked Pi invocation.
  - skills: `ein-discipline`, `architecture`
  - why: Unit-normalizer and pure-core tests do not prove that the Pi hook passes authoritative evidence across the boundary correctly.
  - learn: Integration tests should prove ownership transfer: tracking authorizes normalization, and only a receipt may reach durable completion.
  - architecture: Exercise `ein-ai.ts` as the Pi edge while assertions remain against durable checkpoint outcomes.
  - avoid: Supplying participant state from `subagent_wait`, consuming launch handles, or advancing from outer display content.
  - verify: `bun test tests/sdd-participants.test.ts` (expected RED until hook wiring is complete)

- [x] 6.2 GREEN — wire `ein-pi/agent/extensions/ein-ai.ts` to preallocate attempt-owned artifact authority, invoke `pi-sdd-participant-receipt.ts` for terminal events, pass only canonical receipts to `sdd-participants.ts`, retain launch tracking, consume failed calls without advancement, and expose live-invocation evidence to explicit orphan recovery.
  - skills: `ein-discipline`, `architecture`
  - why: The real Pi adapter must use the same fail-closed contract proven by the normalizer and core tests.
  - learn: Session tracking is an adapter authorization aid, not durable participant evidence.
  - architecture: Keep Pi envelope/session concerns at the extension edge and deterministic checkpoint decisions in the pure participant module.
  - avoid: Duplicating normalizer branches in hooks, changing Cleaner limits, bypassing Architect/verify, or touching installer backup files.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts`

- [x] 6.3 TRIANGULATE/REFACTOR — remove obsolete raw-envelope completion paths only after all focused fixtures are green, deduplicate shared identity checks without broad abstractions, confirm deterministic multi-slice/fresh-Architect regressions, then run the full suite, both repository typechecks, and the bounded manual restart dogfood scenario.
  - skills: `ein-discipline`, `architecture`
  - why: The final pass must prove the new transport seam did not weaken slicing, checkpoint, Architect, or verify invariants.
  - learn: Triangulation tests behavior across equivalent transports; refactoring comes only after RED/GREEN evidence is stable.
  - architecture: Refactor only the three named production modules in this group; `installer/**` remains read/typechecked but unmodified, especially backup files.
  - avoid: Provider layers, general continuity/router cleanup, lifecycle-spec edits, limit changes, filtered files, or unrelated installer changes.
  - verify: `bun test tests/pi-sdd-participant-receipt.test.ts tests/sdd-participants.test.ts tests/continuity-checkpoint.test.ts && bun test && bun run typecheck && (cd installer && bun run typecheck)`; then manually run one multi-slice foreground passage, restart after an admitted file-only attempt, explicitly recover it, reject the late old result, complete the replacement, and confirm Architect then verify stay gated until valid completion

## // 007. Advisory automatic participation remediation — `ein-pi/agent/extensions/ein-ai.ts`, `ein-pi/agent/lib/sdd-participants.ts`, `ein-pi/agent/lib/sdd-router.ts`, `ein-pi/agent/assets/orchestrator.md`, focused tests

- [x] 7.1 RED — add focused tests proving an apply-complete change can delegate `sdd-verify`, and `/ein:sdd-next` does not inject an automatic-participant blocker when continuity is absent, participants are pending, or an audit is blocked; retain explicit participant planning/order coverage.
  - skills: `ein-discipline`, `architecture`
  - why: Optional audits must not become a second mechanical verify gate.
  - verify: `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` (expected RED before the remediation)
- [x] 7.2 GREEN — remove `guardSddVerify` from the verify delegation hook and `/ein:sdd-next` handoff path while preserving the apply-complete route check and explicit sequential participant admission.
  - skills: `ein-discipline`, `architecture`
  - why: Verify remains available whenever its own deterministic route is ready.
  - verify: focused participant and dispatcher tests
- [x] 7.3 GREEN — remove the hard-gate export and obsolete hard-gate assertions from the participant core/tests; preserve explicit participant tools, ordering, source-freshness invalidation, and fail-closed audit results internally.
  - skills: `ein-discipline`, `architecture`
  - why: Automatic participation is advisory at the orchestration boundary, not erased internally.
  - verify: focused participant tests
- [x] 7.4 GREEN — update the `ein_sdd_participants` description and orchestrator guidance to attempt enabled audits best-effort, report unavailable/blocked honestly, continue to verify, and state the measured-defect withdrawal condition.
  - skills: `ein-discipline`, `architecture`
  - why: Prompt/tool contracts must express the simplified responsibility boundary.
  - verify: `bun run typecheck`
- [x] 7.5 TRIANGULATE/REFACTOR — keep `/ein:sdd-next` handoff free of participant blockers, run focused tests plus both repository typechecks, and record that no bootstrap, checkpoint, store, or phase was added.
  - skills: `ein-discipline`, `architecture`
  - why: The remediation must stay a routing simplification rather than another lifecycle mechanism.
  - verify: `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts`, `bun run typecheck`, and `(cd installer && bun run typecheck)`

- [x] 7.6 CLOSED PATCH — remove the obsolete `sdd-verify` delegation hard gates for multiple apply-complete changes and one-shot apply+verify with enabled participants; retain unrelated delegation guards and explicit participant admission safety.
  - skills: `ein-discipline`, `architecture`
  - why: Advisory participation has no mechanical consumer at the delegation boundary.
  - verify: `bun test tests/sdd-participants.test.ts tests/sdd-next-dispatcher.test.ts` and `bun run typecheck`
