# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## MODIFIED
### Scenario: participant-result-registration-via-subagent-wait
title: SDD participant results register correctly from subagent_wait events
requirement: The system MUST capture and register participant results that arrive via subagent_wait events (not just subagent launch events). The handler MUST extract status from the arrival event and advance the passage when status: complete is present.
Given: A participant (e.g., ein-cleaner) is delegated via subagent (launch) and completes
When: The actual result arrives via subagent_wait event with status: complete
Then: completeSddParticipantCall() is invoked with the result status, passage is advanced to complete, and ein_sdd_participants reports the passage as done

### Scenario: result-collection-drift-detection
title: Drift canary on result-collection detects unrecognized tool events
requirement: The system MUST have a drift detector on the result-collection side (parallel to the existing admission canary at ein-ai.ts:837-839) that logs a warning if event.toolName is neither subagent nor subagent_wait, without discarding the event silently.
Given: A tool result event arrives with an unrecognized or new toolName
When: The event is processed by the tool_result handler
Then: A drift warning is logged once per session key, and the event is passed through to be handled by the normal flow (not rejected preemptively)

### Scenario: participant-liberation-design-decision
title: Design decision recorded for freeing disabled participants
requirement: The system MUST have a design decision recorded about how to free a participant that was disabled AFTER a passage was issued. The decision MUST account for: (1) participantId includes order in its hash, so recalculating order changes passageId; (2) must not drop prior registrations under the old passageId; (3) must preserve idempotence within the same passage. The likely outcome is deferral to a follow-up change with explicit tradeoff documentation.
Given: A passage is issued with ein-cleaner enabled
When: The user runs /ein:cleaner off
Then: Either (a) a design decision is documented for a follow-up, or (b) a transitional-state mechanism is implemented that liberates the disabled participant without breaking the constraints

## MODIFIED (Prompt/Docs)
### Scenario: sdd-close-summary-md-explicit-workflow-output
title: sdd-close.md clarifies that summary.md is an explicitly requested workflow output
requirement: The agent prompt for sdd-close MUST explicitly state that writing openspec/changes/{change}/summary.md is an EXPLICITLY REQUESTED task by the SDD workflow, not proactive documentation. This clarification MUST be reflected in the generated Claude Code adapter prompt so that Claude does not refuse to write the file based on a policy against creating .md files autonomously.
Given: The sdd-close agent (Claude) is invoked to close a verified change
When: The agent generates summary.md content
Then: The agent writes the file without refusal, because the prompt explicitly names it as a workflow-required output
