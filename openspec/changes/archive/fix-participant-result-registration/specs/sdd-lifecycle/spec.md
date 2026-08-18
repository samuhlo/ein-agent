# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: participant-delegations-run-foreground
title: Participant delegations run in the foreground so the terminal result returns in the same tool_result
requirement: The system MUST force `async: false` and `foregroundOnly: true` on any `subagent` delegation whose task carries the `[ein-sdd-participant/v1 ` marker, overriding an explicit `async: true`. The system MUST consume `callPassages`/`running` tracking only when the matching `tool_result` carries a terminal payload (a `SingleResult` with `finalOutput` in `details.results`, or `failed === true`); a launch handle (`details.results` empty, e.g. `runId`/`asyncId` present) MUST leave the tracking intact. The system MUST NOT extract participant status from a `subagent_wait` tool_result.
Given: A participant (e.g., ein-cleaner) is delegated with a task carrying the participant marker
When: The delegation runs and the terminal result returns in the `subagent` tool_result under the same toolCallId
Then: The passage is marked complete and ein_sdd_participants reports it as done; a repeated launch before the terminal result yields `blocked` ("already running"), not a fresh `ready` for the same agent

### Scenario: participant-passage-identity-excludes-order
title: Passage identity is derived from the audited state, not from the participant order
requirement: The system MUST derive `passageId` from `{ change, applyId, scopeId, beforeStateRef }`, MUST NOT depend on the participant order, and MUST compute the effective order returned to callers by filtering the durable `order` at read time to agents that are enabled or already have evidence, without rewriting the durable `order` stored in the checkpoint to narrow it.
Given: A passage emitted with order `[ein-cleaner, ein-architect]`
When: A participant is disabled mid-passage
Then: The `passageId` does not change, and the durable checkpoint order is left untouched

### Scenario: disabling-a-pending-participant-releases-the-passage
title: Disabling a participant without evidence releases the passage without dropping prior evidence
requirement: The system MUST exclude from the effective order a participant disabled by session override that has no recorded evidence, and MUST keep in the effective order (and in the checkpoint) any participant with recorded evidence. A late terminal result from a participant that was disabled before completing and has no prior evidence MUST be discarded without writing evidence, and MUST NOT re-block the passage.
Given: ein-cleaner has completed and ein-architect is pending
When: ein-architect is disabled via session override before it runs
Then: The effective order becomes `["ein-cleaner"]`, the plan is `complete`, `guardSddVerify` returns null, and ein-cleaner's evidence remains in the checkpoint

## MODIFIED
### Scenario: result-collection-drift-warning
title: Drift detection on result-collection side warns about unrecognized events
requirement: The system MUST include a drift canary on the result-collection side (parallel to the admission-side canary at ein-ai.ts:837-839) that warns once per session, without blocking, when a tracked participant call receives a `subagent` tool_result with no recognizable terminal payload, or when a `subagent_wait` tool_result arrives while participant calls are tracked.
Given: A tracked participant call and a result of unrecognized shape (or a subagent_wait tool_result while participant calls are tracked)
When: The event is processed by the tool_result handler with UI available
Then: A drift warning is emitted once per session (not an error), and the handler allows processing to continue

## REMOVED
### Scenario: participant-result-via-subagent-wait
reason: The scope-phase premise was false — subagent_wait never carries participant status (its result text is deliberately excluded from tool_result content; the child's actual report travels as a separate non-tool_result custom message Ein has no hook for). The design instead forces foreground delegation so the terminal result returns in the existing subagent tool_result, superseded by participant-delegations-run-foreground.
