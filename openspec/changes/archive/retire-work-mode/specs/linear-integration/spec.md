# OpenSpec Delta
format: openspec-delta/v1
domain: linear-integration

## ADDED
### Scenario: linear-integration-off-by-default
title: Treat the local board as the contract, with Linear opt-in
requirement: The system MUST resolve the Linear integration to disabled when no evidence exists, and its injected directive MUST state that the board is local and that Linear preflight does not run.
Given: A project with no Ein integration configuration and no global default.
When: The runtime resolves the integration and builds its prompt directive.
Then: The resolved value is disabled and the directive names `openspec/changes/` plus git as the board and forbids Linear preflight.

### Scenario: linear-integration-legacy-evidence
title: Read the retired work mode without rewriting it
requirement: The system MUST resolve a persisted legacy work mode to the equivalent integration state — `team` to enabled, `solo` to disabled — and MUST NOT modify the stored bytes as a side effect of reading them.
Given: A configuration file written before the work mode was retired.
When: The integration is read or inspected.
Then: The resolved value reflects the legacy evidence, the inspection reports valid evidence with its source, and the file content is unchanged.

### Scenario: linear-integration-current-vocabulary-wins
title: Never let a deliberate write be silently ineffective
requirement: The system MUST resolve to the current key when both the current and the legacy key are present.
Given: A configuration file carrying both the retired work mode and the current integration key.
When: The integration is resolved.
Then: The current key determines the result, so the most recent deliberate write is the one that takes effect.

### Scenario: linear-integration-uncertain-evidence
title: Keep uncertainty out of the enabled state
requirement: The system MUST resolve invalid, unreadable, or absent evidence to the disabled default while preserving the inspection status, provenance, and observed-source list.
Given: A configuration file that is corrupt, holds an unrecognized value, or does not exist.
When: The integration is read and inspected.
Then: The resolved value is disabled, and the inspection reports the honest status and where each authority was looked for.

### Scenario: linear-integration-single-vocabulary
title: Offer no two-valued work mode on any surface
requirement: The system MUST NOT present a two-valued work mode on any surface, and settings, status output, the banner, the slash command, the orchestrator prompt, and the agent contracts MUST describe an optional Linear integration instead.
Given: A user inspects Ein's settings, status, banner, or prompt policy.
When: They look for how Linear participates in the workflow.
Then: Each surface names the optional integration and its state, and none of them offers or documents a work mode.
