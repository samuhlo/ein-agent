# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: participant-result-via-subagent-wait
title: Participant results register from subagent_wait events
requirement: The system MUST handle tool_result events with toolName subagent_wait, extract status from them, and advance passages when status: complete is found. The result handler MUST not filter out subagent_wait events.
Given: A participant (e.g., ein-cleaner) is invoked and completes
When: The result arrives via subagent_wait event with status: complete
Then: The passage is marked complete and ein_sdd_participants reports it as done

### Scenario: result-collection-drift-warning
title: Drift detection on result-collection side warns about unrecognized events
requirement: The system MUST include a drift canary on the result-collection side (parallel to the admission-side canary at ein-ai.ts:837-839) that logs once per session if event.toolName is neither subagent nor subagent_wait.
Given: A tool result event arrives with an unexpected toolName
When: The event is processed by the tool_result handler
Then: A drift warning is logged (not an error), and the handler allows the event to proceed normally
