# OpenSpec Delta
format: openspec-delta/v1
domain: scout-routing

## ADDED
### Scenario: scout-concurrent-launch-rejected-before-execution
title: Reject a concurrent scout launch at launch time
requirement: The system MUST reject a scout launch, before any delegation executes, when another scout tool call is already pending under a different tool-call identifier, and MUST NOT reject re-normalization of the same tool-call identifier.
Given: one ein-scout launch is already normalized and pending
When: a second ein-scout launch arrives with a different tool-call identifier
Then: normalization fails at launch with an actionable message naming the one-per-turn rule and no second delegation executes

### Scenario: scout-launch-is-always-foreground
title: Normalize every accepted scout launch to foreground
requirement: The system MUST normalize every accepted ein-scout launch to a foreground call in both the workflow-script form and the direct form.
Given: a direct ein-scout launch request
When: the launch is normalized
Then: the normalized launch is foreground and no asynchronous scout call is produced

### Scenario: scout-fan-out-is-described-as-sequential
title: Describe read-only scout fan-out as sequential
requirement: The system MUST describe read-only scout fan-out in the coordinator prompt as one scout call per turn while retaining the bound of one to three independent scouts.
Given: the installed coordinator prompt
When: its read-only fan-out section is read
Then: the section states one scout call per turn, retains the one-to-three independent-scout bound, and does not grow the coordinator prompt byte budget
