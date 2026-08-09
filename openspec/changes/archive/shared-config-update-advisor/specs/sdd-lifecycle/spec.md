# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: shared-config-advisor-consistent-surfaces
title: Relevant surfaces consume one advisor contract
requirement: The system MUST expose configuration and update advice consistently across relevant existing surfaces by consuming one shared contract rather than duplicating authority.
Given: The launcher or another existing supported surface requests the same project configuration/update status.
When: Each surface renders the result.
Then: Equivalent inputs produce equivalent state, recommendation, ownership, and uncertainty semantics, while surface-specific presentation does not add updater behavior or move installer logic into the launcher.

### Scenario: shared-config-advisor-fails-closed-on-ambiguity
title: Advisor preserves ambiguity and errors
requirement: The system MUST represent missing, unreadable, unsupported, conflicting, and ambiguous configuration or update information explicitly and MUST NOT infer a safe action from incomplete evidence.
Given: A configuration source, version/update signal, or installer capability cannot be read or yields conflicting values.
When: Advice is computed or rendered.
Then: The result is a deterministic unavailable, invalid, unsupported, or ambiguous state with an actionable reason, and no update or configuration mutation occurs.

### Scenario: shared-config-advisor-normalizes-readonly-state
title: Shared advisor normalizes configuration and update state read-only
requirement: The system MUST expose deterministic, source-attributed configuration and update state and recommendations without mutating configuration, installer state, or update state.
Given: A supported project and runtime configuration may be complete, incomplete, unavailable, or ambiguous, and installer-owned update capabilities may or may not be available.
When: A participating surface requests configuration or update advice.
Then: The surface receives the same normalized state and recommendation, with explicit quality and reason fields for uncertain values, and no installation or update operation is executed.

### Scenario: shared-config-advisor-separates-advice-from-action
title: Advisor separates recommendation from installer action
requirement: The system MUST distinguish read-only advice from an installation or update action and MUST identify the installer as the owner of any such action.
Given: The advisor determines that configuration is incomplete, incompatible, or eligible for an update.
When: The recommendation is presented to a user or consumer surface.
Then: The output explains the observed state and the recommended installer-owned next step, but does not claim that the action was requested, started, completed, or performed automatically.
