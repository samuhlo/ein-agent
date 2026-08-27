# OpenSpec Delta
format: openspec-delta/v1
domain: sdd-lifecycle

## MODIFIED
### Scenario: claude-sdd-syncs-openspec-delta
title: Claude SDD CLI synchronizes canonical OpenSpec deltas
requirement: The system MUST expose a sync command in the Claude SDD CLI that deterministically synchronizes a named existing change through the shared OpenSpec filesystem synchronizer and returns a distinct success, conflict, or failure result without a bridge script.
Given: an existing OpenSpec change has a structured delta for one or more canonical domains
When: Claude invokes `ein-cc-sdd sync` for that change
Then: the shared synchronizer updates canonical specs and its report on success, reports a conflict without overwriting conflicting canonical bytes, or returns a failure status for malformed or operational errors

### Scenario: core-coordinator-source-generates-claude-brain
title: Claude coordinator brain is generated from canonical core
requirement: The system MUST generate the Claude coordinator brain from a canonical coordinator source plus an explicit Claude adaptation block during synchronization, and MUST NOT treat a separately hand-maintained full `ein-cc/CLAUDE.md` as authoritative.
Given: the canonical coordinator source and Claude adaptation block are present and a synchronization is requested
When: the synchronization compiles the coordinator surface for Claude Code
Then: the generated `ein-cc/CLAUDE.md` reflects the canonical source and adaptation boundary, and a source change is observable in the next generated output without manual copying
