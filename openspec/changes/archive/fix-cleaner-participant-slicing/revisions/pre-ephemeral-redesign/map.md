status: ready
scope_status: partial
budget_exceeded: true
change: fix-cleaner-participant-slicing
phase: map

# Map notes

Reopened after dogfooding. Scope is the boundary from Pi `subagent` envelopes to the durable participant checkpoint: deterministic Cleaner slices under existing limits; every slice complete before Architect; fresh post-Cleaner Architect binding; identity-gated blocked recovery. No implementation, tests, builds, typechecks, lifecycle-spec changes, limit changes, filtering, participant bypass, or verify bypass.

## Manifesto constraints

- Pi-specific result shapes remain at `ein-ai.ts`; portable core decisions stay deterministic.
- Durable evidence retains provenance through scope/apply/planner/generation/state identities.
- Unknown, malformed, stale, missing, or unrecognized evidence is fail-closed; recovery uses a real changed planner/apply identity and never fake apply mutations.
- Checkpoint on disk is the bridge; transcripts and UI labels are not durable evidence.

## Exact boundary and current facts

### Pi adapter edge (`ein-pi/agent/extensions/ein-ai.ts`)

- `tool_call` on `subagent` collects direct, legacy, and `workflowScript` children, admits a slice-qualified participant marker through `admitSddParticipantCall`, then invokes `ensureParticipantForeground`.
- `ensureParticipantForeground` (in `sdd-preflight.ts`) overwrites participant `async` to `false` and sets `foregroundOnly: true`, including one-child `workflowScript` forms. Non-participant async calls remain unchanged.
- `tool_result` calls `completeSddParticipantCall` with `event.details`, `event.isError`, and concatenated text content. `subagent_wait` never supplies participant state; it only triggers the drift warning when tracked calls exist.
- Therefore the durable boundary is the tracked tool-call identity plus a structurally recognized terminal envelope, not the Pi rendering `workflow · step 1/1`.

### Envelope recognition (`sdd-participants.ts`)

- `terminalResultsOf(details)` accepts only an object with an array `results` containing at least one record with string `finalOutput`; it returns filtered terminal records. `results: []` is a launch handle, not terminal.
- `completeSddParticipantCall` leaves a non-error launch handle tracked/running, allowing the later terminal result on the same tool call to complete it. A failed call consumes tracking but cannot advance durable state. A terminal result with mismatched child `agent`/`task`, ambiguous/missing status, or incomplete status cannot advance.
- Sole `finalOutput` takes precedence over outer `content` text. `publishSlicedResult` accepts exactly one `status: complete` or `status: blocked`; other/failed forms persist failed/blocked outcomes. Stale generation, wrong admission, out-of-order slice, changed seal, duplicate, or unknown calls do not fabricate evidence.
- Current focused fixtures model launch `{mode:"single", runId, asyncId, results:[]}` and terminal `{mode:"single", results:[{agent,task,finalOutput}]}`.

### Deterministic core and checkpoint

- `changedScope` validates the canonical `Files changed` section, real non-symlink files, UTF-8/digests, canonical ordering, and bounded scope seal/apply identity. `planCleanerSlices` uses `CLEANER_AUDIT_LIMITS.maxFiles` and `.maxSourceBytes`; oversized/non-UTF8 files become blockers rather than being filtered. Cleaner scope is rechecked through `collectCleanerAuditEvidence`.
- V3 generations contain contiguous ordered slices, admission/result, before-state frontier, planner/apply/scope identities, bounded prior generations, and optional Architect binding. `validV3Generation` enforces Cleaner presence, limits, frontier chaining, one admitted-without-result gap, and Architect only after all slices complete.
- `planSlicedParticipants` blocks planning blockers, stale source, disabled acquired gates, admitted-without-result, non-complete slices, and running units. `bindArchitectIfReady` rereads checkpoint/scope and binds Architect only at a fresh final frontier. Cleaner completion advances the next slice’s `beforeStateRef`; blocked/failed/stale slices keep verify blocked.
- `freshGenerationAfterIdentityChange` archives a blocked generation and creates a new one only when `applyId` or `plannerId` changes. Same identities remain blocked and immutable.

## Focused evidence

`tests/sdd-participants.test.ts` covers deterministic ordering/IDs, file/byte limits, oversized and non-UTF8 blockers, durable admission, handle-to-terminal retry, stale/duplicate results, final Architect binding, stale Architect, identity recovery, `ensureParticipantForeground` for direct and workflow forms, and `participantResultIsUnrecognized` for subagent handles/wait/terminal/no tracked calls.

## Dogfooding gap / design handoff

The repository does not expose the Pi SDK implementation that produces the `workflow · step 1/1` label or any separate completion channel. Current tests prove the intended envelope fixtures, not every installed runtime shape. Before design fixes a contract, capture the actual foreground single-child sequence: `tool_call` input, `tool_result` details/content, and whether terminal evidence is in `details.results`, another field, or only a custom completion message. If a valid variant exists, normalize it at the adapter edge with an explicit unknown branch; never infer terminality from UI text. Preserve the rule that `subagent_wait` is non-authoritative unless it carries verifiable matching child identity/task/final output. Add focused direct-single and one-child-workflow hook tests, handle then terminal delivery, stale/duplicate completion, and no fake checkpoint advancement.

## Ledger Contract

ledger:
  reads:
    - { path: "openspec/changes/fix-cleaner-participant-slicing/scope.md", lines: 79, estimated_tokens: 1900 }
    - { path: "EIN.md", lines: 82, estimated_tokens: 1300 }
    - { path: "MANIFIESTO.md", lines: 199, estimated_tokens: 2600 }
    - { path: "ein-pi/agent/lib/sdd-participants.ts", lines: 730, estimated_tokens: 10800 }
    - { path: "ein-pi/agent/extensions/ein-ai.ts", lines: 1117, estimated_tokens: 14500 }
    - { path: "ein-pi/agent/lib/continuity-checkpoint.ts", lines: 520, estimated_tokens: 7600 }
    - { path: "tests/sdd-participants.test.ts", lines: 520, estimated_tokens: 7600 }
    - { path: "ein-pi/agent/lib/sdd-preflight.ts", lines: 17, estimated_tokens: 500 }
    - { path: "ein-pi/agent/lib/delegation-shape.ts", lines: 50, estimated_tokens: 900 }
    - { path: "codegraph indexed source queries", lines: 0, estimated_tokens: 1800 }
  webfetch_used: false
  webfetch_urls: []
  budget_consumed: { tokens: 15000, reads: 10 }

No tests, builds, or typechecks were run. Nuxt skill was loaded but does not fit this TypeScript/Pi participant-routing scope; github-workflow and skill-registry were loaded but no delivery or registry action applies.
