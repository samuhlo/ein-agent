# OpenSpec Delta
format: openspec-delta/v1
domain: scout-routing

## MODIFIED
### Scenario: off-contract-scout-result-does-not-free-the-turn
title: Stop a scout relaunch loop after two wholly off-contract results
requirement: The system MUST record a scout result that fails the report contract wholesale against the current turn instead of clearing it, and MUST reject a further scout launch in the same turn once two results have failed that way, naming the failure as an infrastructure incident. Only a wholesale failure counts: a report whose citations can be clamped or partially salvaged is accepted and MUST NOT consume the allowance, and in a fan-out the call counts as off-contract only when every branch fails. The rejection MUST report the observed result shape and MUST NOT assert an unverified cause.
Given: a scout result that fails the report contract wholesale in the current turn
When: the parent launches another scout in that same turn
Then: the failed call remains recorded against the turn, a third launch is rejected as an infrastructure incident, a salvageable report leaves the allowance untouched, and the next user turn clears the record

### Scenario: readonly-scout-bounded-research-contract
title: Scout research is normalized, tool-call bounded, and locally validated
requirement: The system MUST normalize accepted foreground `ein-scout` launches to fresh context, `maxRuntimeMs: 120000`, `turnBudget: { maxTurns: 12, graceTurns: 2 }`, and `toolBudget: { hard: 30, soft: 24, block: "*" }`; the canonical scout agent frontmatter MUST declare exactly `read`, `grep`, and `find` with a defined but blank `extensions:` field. This declaration is the logical empty list used to disable ambient extensions. The system MUST validate each returned report at two levels: internal consistency fails closed, while disk citations are clamped or dropped with recorded provenance. Malformed, oversized, unreferenced, unknown-identifier, and uncertainty-missing reports MUST still fail closed, as MUST a report left without any surviving valid reference. The current empty-extension compatibility contract MUST NOT be represented as a per-run capability probe or a pinned-package guarantee; unpinned future dependency drift remains a residual risk.
Given: a caller requests `ein-scout` research or a scout report is returned.
When: the foreground launch is normalized or a returned report is validated.
Then: alternate invocation forms are rejected, the normalized call has the stated wall-clock, turn, and hard tool-call limits, internally inconsistent reports fail closed, an end line past the end of an existing file is clamped, a missing, escaping, or symlink-escaping citation is dropped with its reason recorded as an uncertainty, and a report with no surviving valid reference fails closed
