# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: workbench-launcher-capability-aware-sessions
title: Workbench offers only provider-supported session actions
requirement: The system MUST list recent sessions through the selected provider adapter, request a new session, or offer resume only when that adapter advertises and validates resume support, while presenting unsupported or unavailable operations explicitly and never fabricating session metadata or cross-runtime continuity.
Given: A confirmed ProjectStateV1 and provider adapter expose an evidence-based capability matrix, including provider-specific unsupported operations from the runtime adapter contract.
When: The user chooses session management for Pi or Claude.
Then: The workbench shows bounded provider-supported recent-session metadata, can request a new session, offers only a validated supported resume reference, and renders deterministic unsupported or unavailable diagnostics without exposing private transcript content or paths.

### Scenario: workbench-launcher-compact-doctor
title: Workbench exposes read-only compact doctor access
requirement: The system MUST expose a compact doctor action that delegates to the existing read-only doctor surface and MUST NOT move installation, update, repair, or release logic into the separate workbench.
Given: The user is in the minimal workbench with a selected project or runtime context.
When: The user requests doctor access.
Then: The workbench presents the existing doctor result or a bounded actionable unavailable diagnostic, returns to the workbench flow, and does not mutate installer-owned state.

### Scenario: workbench-launcher-project-runtime-flow
title: Workbench confirms a project and supported runtime before orchestration
requirement: The system MUST provide one separate workbench entrypoint that requires selecting and confirming a project, selecting Pi or Claude, and consuming the confirmed ProjectStateV1 for all displayed and requested operations without becoming a second project-state owner.
Given: A user starts the minimal workbench in a directory with zero or more discoverable project candidates and the existing ProjectStateV1 projector is available.
When: The user selects and confirms a project and a supported runtime.
Then: The workbench binds the flow to that project and runtime, presents the selected identity, and does not enter session actions until the confirmation is complete.

### Scenario: workbench-launcher-safe-runtime-launch
title: Workbench launches only through the safe adapter boundary
requirement: The system MUST launch the selected runtime only through the runtime adapter's validated state-bound launch plan and non-shell executor, and MUST NOT accept caller-controlled command strings, migrate private history, write shared session state, or assume installer or updater ownership.
Given: The user has selected a confirmed project, provider, and either a new-session request or a supported resume request.
When: The user confirms launch.
Then: The workbench delegates the request to the adapter with the selected ProjectStateV1 identity, reports the normalized outcome, and leaves installer files, update state, shared project state, and private runtime histories unchanged.

### Scenario: workbench-launcher-state-freshness
title: Workbench presents OpenSpec progress and verification freshness honestly
requirement: The system MUST show the selected project's active OpenSpec phase and next step together with source quality and verification freshness, and MUST visibly distinguish incomplete, ambiguous, unavailable, stale, invalid, and current values without promoting stale evidence to current.
Given: The selected ProjectStateV1 contains active or absent OpenSpec work and may contain incomplete sources or verification evidence that is stale, invalid, unavailable, or current.
When: The workbench renders the project summary before session orchestration.
Then: The rendered summary preserves the projector's state and reason values, shows the active phase and next step when known, and labels unknown or stale evidence instead of guessing or inheriting freshness from a runtime switch or resume.
