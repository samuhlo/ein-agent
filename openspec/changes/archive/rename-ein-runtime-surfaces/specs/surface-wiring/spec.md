# OpenSpec Delta
format: openspec-delta/v1
domain: surface-wiring

## MODIFIED
### Scenario: close-phase-summary-has-a-deterministic-persistence-channel
title: The close phase has a deterministic persistence channel that does not depend on agent initiative
requirement: The system MUST offer the close phase a persistence channel for `summary.md` through `ein-cc-sdd` that does not depend on the agent writing the file on its own initiative, and that channel MUST validate the destination rather than only dumping bytes.
Given: a `summary.md` produced by sdd-close and an existing change
When: the content is passed to `ein-cc-sdd summary <change>` over stdin
Then: it is written to `openspec/changes/<change>/summary.md`, and rejected when the name is unsafe, the change does not exist, or the content is empty
