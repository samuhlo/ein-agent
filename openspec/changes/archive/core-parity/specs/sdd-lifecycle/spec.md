# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## ADDED
### Scenario: claude-sdd-syncs-openspec-delta
title: Claude SDD CLI synchronizes canonical OpenSpec deltas
requirement: The system MUST expose a sync command in the Claude SDD CLI that deterministically synchronizes a named existing change through the shared OpenSpec filesystem synchronizer and returns a distinct success, conflict, or failure result without a bridge script.
Given: an existing OpenSpec change has a structured delta for one or more canonical domains
When: Claude invokes cc-ein-sdd sync for that change
Then: the shared synchronizer updates canonical specs and its report on success, reports a conflict without overwriting conflicting canonical bytes, or returns a failure status for malformed or operational errors

### Scenario: core-coordinator-source-generates-claude-brain
title: Claude coordinator brain is generated from canonical core
requirement: The system MUST generate the Claude coordinator brain from a canonical coordinator source plus an explicit Claude adaptation block during synchronization, and MUST NOT treat a separately hand-maintained full cc-ein/CLAUDE.md as authoritative.
Given: the canonical coordinator source and Claude adaptation block are present and a synchronization is requested
When: the synchronization compiles the coordinator surface for Claude Code
Then: the generated cc-ein/CLAUDE.md reflects the canonical source and adaptation boundary, and a source change is observable in the next generated output without manual copying

### Scenario: core-parity-check-covers-generated-surfaces
title: Core-to-Claude parity is checked deterministically
requirement: The system MUST provide a deterministic core-to-Claude parity check that detects drift in the canonical coordinator, generated coordinator, tool mappings, translated runtime tokens, and agent-model routing.
Given: canonical core inputs, Claude adaptation inputs, and generated Claude surfaces are available
When: the parity check evaluates the supported core surface
Then: matching inputs pass, while source, mapping, translation, or routing drift reports a failure naming the mismatched surface

### Scenario: core-sync-rejects-agent-routing-drift
title: Agent-model routing drift fails synchronization
requirement: The system MUST fail core synchronization when the canonical agent inventory and Claude model-routing declarations differ, including a canonical agent without routing or a stale routing entry, instead of silently using an incomplete hardcoded table.
Given: the canonical agent inventory has a missing or stale Claude model-routing declaration
When: synchronization builds Claude agent frontmatter
Then: synchronization exits unsuccessfully with the routing mismatch identified and does not claim a complete Claude agent surface

### Scenario: core-sync-rejects-unknown-agent-tools
title: Unknown agent tools fail synchronization
requirement: The system MUST fail core synchronization when a canonical agent declares a tool without an explicit Claude mapping or approved runtime mapping, instead of copying the unknown tool name into generated frontmatter.
Given: a canonical agent includes an unmapped tool name
When: synchronization translates agent frontmatter
Then: synchronization exits unsuccessfully with the agent and tool identified, and no successful generated artifact claims parity

### Scenario: core-sync-rejects-untranslated-runtime-tokens
title: Untranslated runtime tokens fail synchronization
requirement: The system MUST fail core synchronization when canonical agent or coordinator content contains a Pi-only ein_* tool token or runtime concept without an explicit Claude adaptation rule, instead of leaving the token literal or silently treating it as inert.
Given: canonical agent or coordinator content contains an untranslated Pi-only token or runtime concept
When: synchronization translates or generates the Claude surface
Then: synchronization exits unsuccessfully with the source token and location identified, and the generated surface is not accepted as synchronized
